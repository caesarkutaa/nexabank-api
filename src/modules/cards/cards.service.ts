import {
  Injectable, NotFoundException, BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import {
  VirtualCard, VirtualCardDocument,
  CardStatus, CardNetwork,
} from './schemas/virtual-card.schema';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { IssueCardDto, UpdateCardLimitsDto, UpdateCardControlsDto } from './dto/card.dto';
import { generateCardNumber } from '../../common/utils/generate-ref.util';

@Injectable()
export class CardsService {
  private readonly encKey: string;

  constructor(
    @InjectModel(VirtualCard.name) private cardModel:    Model<VirtualCardDocument>,
    @InjectModel(Account.name)     private accountModel: Model<AccountDocument>,
  ) {
    const raw = process.env.ENCRYPTION_KEY ?? '';
    this.encKey = raw.substring(0, 32).padEnd(32, '0');
  }

  // ── Issue Card ────────────────────────────────────────────────
  async issueCard(userId: string, dto: IssueCardDto) {
    const account = await this.accountModel.findOne({
      _id:    new Types.ObjectId(dto.accountId),
      userId: new Types.ObjectId(userId),
    });
    if (!account) throw new NotFoundException('Account not found');

    const activeCount = await this.cardModel.countDocuments({
      userId: new Types.ObjectId(userId),
      status: { $in: [CardStatus.ACTIVE, CardStatus.FROZEN] },
    });
    if (activeCount >= 5)
      throw new BadRequestException('Maximum of 5 active virtual cards allowed');

    const rawNumber  = generateCardNumber();
    const cvv        = Math.floor(100 + Math.random() * 900).toString();
    const now        = new Date();
    const expiryYear  = now.getFullYear() + 3;
    const expiryMonth = now.getMonth() + 1;

    const card = await this.cardModel.create({
      userId:         new Types.ObjectId(userId),
      accountId:      new Types.ObjectId(dto.accountId),
      cardNumber:     this.encrypt(rawNumber),
      last4:          rawNumber.slice(-4),
      cvv:            this.encrypt(cvv),
      expiryMonth,
      expiryYear,
      cardHolderName: dto.cardHolderName.toUpperCase(),
      network:        dto.network ?? CardNetwork.VISA,
      nickname:       dto.nickname,
    });

    // Return safe fields only
    return this.safeCard(card);
  }

  // ── Get All Cards ─────────────────────────────────────────────
  async getUserCards(userId: string) {
    const cards = await this.cardModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('-cardNumber -cvv')
      .lean();
    return cards;
  }

  // ── Get Single Card ───────────────────────────────────────────
  async getCardById(cardId: string, userId: string) {
    const card = await this.cardModel
      .findOne({ _id: new Types.ObjectId(cardId), userId: new Types.ObjectId(userId) })
      .select('-cardNumber -cvv')
      .lean();
    if (!card) throw new NotFoundException('Card not found');
    return card;
  }

  // ── Reveal Sensitive Details ──────────────────────────────────
  async revealCard(cardId: string, userId: string) {
    const card = await this.cardModel
      .findOne({ _id: new Types.ObjectId(cardId), userId: new Types.ObjectId(userId) })
      .select('+cardNumber +cvv');

    if (!card) throw new NotFoundException('Card not found');
    if (card.status === CardStatus.CANCELLED)
      throw new BadRequestException('Cannot reveal a cancelled card');

    const rawNumber = this.decrypt(card.cardNumber);
    return {
      cardNumber:     rawNumber.replace(/(\d{4})(?=\d)/g, '$1 ').trim(),
      last4:          card.last4,
      cvv:            this.decrypt(card.cvv),
      expiryMonth:    String(card.expiryMonth).padStart(2, '0'),
      expiryYear:     card.expiryYear,
      expiry:         `${String(card.expiryMonth).padStart(2, '0')}/${card.expiryYear}`,
      cardHolderName: card.cardHolderName,
      network:        card.network,
    };
  }

  // ── Freeze / Unfreeze Toggle ──────────────────────────────────
  async toggleFreeze(cardId: string, userId: string) {
    const card = await this.cardModel.findOne({
      _id:    new Types.ObjectId(cardId),
      userId: new Types.ObjectId(userId),
    });
    if (!card) throw new NotFoundException('Card not found');
    if (card.status === CardStatus.CANCELLED)
      throw new BadRequestException('Cannot modify a cancelled card');
    if (card.status === CardStatus.EXPIRED)
      throw new BadRequestException('Card has expired');

    const newStatus = card.status === CardStatus.FROZEN
      ? CardStatus.ACTIVE
      : CardStatus.FROZEN;

    await this.cardModel.findByIdAndUpdate(cardId, { status: newStatus });
    return {
      message: `Card ${newStatus === CardStatus.FROZEN ? 'frozen' : 'unfrozen'} successfully`,
      status:  newStatus,
    };
  }

  // ── Update Spending Limits ────────────────────────────────────
  async updateLimits(cardId: string, userId: string, dto: UpdateCardLimitsDto) {
    const card = await this.cardModel.findOneAndUpdate(
      { _id: new Types.ObjectId(cardId), userId: new Types.ObjectId(userId) },
      {
        ...(dto.dailyLimit   !== undefined && { dailyLimit:   dto.dailyLimit   }),
        ...(dto.monthlyLimit !== undefined && { monthlyLimit: dto.monthlyLimit }),
      },
      { new: true },
    ).select('-cardNumber -cvv');

    if (!card) throw new NotFoundException('Card not found');
    return card;
  }

  // ── Update Controls ───────────────────────────────────────────
  async updateControls(cardId: string, userId: string, dto: UpdateCardControlsDto) {
    const card = await this.cardModel.findOneAndUpdate(
      { _id: new Types.ObjectId(cardId), userId: new Types.ObjectId(userId) },
      {
        ...(dto.onlinePayments        !== undefined && { onlinePayments:        dto.onlinePayments        }),
        ...(dto.internationalPayments  !== undefined && { internationalPayments:  dto.internationalPayments  }),
        ...(dto.contactlessPayments    !== undefined && { contactlessPayments:    dto.contactlessPayments    }),
      },
      { new: true },
    ).select('-cardNumber -cvv');

    if (!card) throw new NotFoundException('Card not found');
    return card;
  }

  // ── Cancel Card ───────────────────────────────────────────────
  async cancelCard(cardId: string, userId: string) {
    const card = await this.cardModel.findOne({
      _id:    new Types.ObjectId(cardId),
      userId: new Types.ObjectId(userId),
    });
    if (!card) throw new NotFoundException('Card not found');
    if (card.status === CardStatus.CANCELLED)
      throw new BadRequestException('Card is already cancelled');

    await this.cardModel.findByIdAndUpdate(cardId, {
      status:      CardStatus.CANCELLED,
      cancelledAt: new Date(),
    });
    return { message: 'Card cancelled successfully' };
  }

  // ── Update Nickname ───────────────────────────────────────────
  async updateNickname(cardId: string, userId: string, nickname: string) {
    const card = await this.cardModel.findOneAndUpdate(
      { _id: new Types.ObjectId(cardId), userId: new Types.ObjectId(userId) },
      { nickname },
      { new: true },
    ).select('-cardNumber -cvv');
    if (!card) throw new NotFoundException('Card not found');
    return card;
  }

  // ── Private Helpers ───────────────────────────────────────────
  private safeCard(card: VirtualCardDocument) {
    return {
      id:             card._id,
      last4:          card.last4,
      network:        card.network,
      expiryMonth:    card.expiryMonth,
      expiryYear:     card.expiryYear,
      expiry:         `${String(card.expiryMonth).padStart(2, '0')}/${card.expiryYear}`,
      cardHolderName: card.cardHolderName,
      status:         card.status,
      nickname:       card.nickname,
      dailyLimit:     card.dailyLimit,
      monthlyLimit:   card.monthlyLimit,
      spentToday:     card.spentToday,
      spentThisMonth: card.spentThisMonth,
      onlinePayments:        card.onlinePayments,
      internationalPayments:  card.internationalPayments,
      contactlessPayments:    card.contactlessPayments,
      accountId:      card.accountId,
      createdAt:      (card as any).createdAt,
    };
  }

  private encrypt(text: string): string {
    const iv     = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.encKey),
      iv,
    );
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(text: string): string {
    const [ivHex, encHex] = text.split(':');
    if (!ivHex || !encHex)
      throw new InternalServerErrorException('Invalid encrypted card data');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.encKey),
      Buffer.from(ivHex, 'hex'),
    );
    return Buffer.concat([
      decipher.update(Buffer.from(encHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}
import {
  Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';

import { CryptoService } from './crypto.service';
import { InitiateCryptoDto } from './dto/crypto-payment.dto';
import { BuyCryptoInvestDto, SellCryptoInvestDto } from './dto/crypto-investment.dto';

import { CryptoAddress, CryptoAddressDocument } from '../admin/schemas/crypto-address.schema';
import { CryptoPayment, CryptoPaymentDocument } from './schemas/crypto-payment.schema';

@ApiTags('Crypto')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('crypto')
export class CryptoController {
  constructor(
    private readonly cryptoService: CryptoService,

    @InjectModel(CryptoAddress.name)
    private readonly cryptoAddrModel: Model<CryptoAddressDocument>,

    @InjectModel(CryptoPayment.name)
    private readonly cryptoPaymentModel: Model<CryptoPaymentDocument>,
  ) {}

  // ── GET /crypto/rates ─────────────────────────────────────────
  @Get('rates')
  @ApiOperation({ summary: 'Live crypto exchange rates from CoinGecko (USD)' })
  async getRates() {
    return this.cryptoService.getExchangeRates();
  }

  // ── GET /crypto/addresses ─────────────────────────────────────
  @Get('addresses')
  @ApiOperation({ summary: 'Active NexaBank crypto deposit addresses' })
  async getActiveAddresses() {
    return this.cryptoAddrModel
      .find({ isActive: true })
      .select('-lastUpdatedBy -__v')
      .sort({ coin: 1 })
      .lean();
  }

  // ── GET /crypto/history ───────────────────────────────────────
  @Get('history')
  @ApiOperation({ summary: 'Current user crypto payment history' })
  async getHistory(@CurrentUser() user: UserDocument) {
    return this.cryptoPaymentModel
      .find({ userId: new Types.ObjectId(String(user._id)) })
      .sort({ createdAt: -1 })
      .lean();
  }

  // ── POST /crypto/initiate ─────────────────────────────────────
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate crypto payment — sends OTP, returns preview' })
  async initiate(@Body() dto: InitiateCryptoDto, @CurrentUser() user: UserDocument) {
    const { otp: _otp, ...rest } = dto;
    return this.cryptoService.initiate(String(user._id), rest, user.email);
  }

  // ── POST /crypto/confirm ──────────────────────────────────────
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm crypto payment with OTP' })
  async confirm(@Body() dto: InitiateCryptoDto, @CurrentUser() user: UserDocument) {
    return this.cryptoService.confirm(String(user._id), dto, user);
  }

  // ══════════════════════════════════════════════════════════════
  // CRYPTO INVESTMENT
  // ══════════════════════════════════════════════════════════════

  // ── GET /crypto/invest/portfolio ──────────────────────────────
  @Get('invest/portfolio')
  @ApiOperation({ summary: 'Crypto investment portfolio with live P&L' })
  async getPortfolio(@CurrentUser() user: UserDocument) {
    return this.cryptoService.getCryptoPortfolio(String(user._id));
  }

  // ── POST /crypto/invest/buy ───────────────────────────────────
  @Post('invest/buy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Buy crypto as investment — debits USD from account, creates position' })
  async buy(@Body() dto: BuyCryptoInvestDto, @CurrentUser() user: UserDocument) {
    return this.cryptoService.buyCryptoInvestment(String(user._id), dto);
  }

  // ── POST /crypto/invest/sell ──────────────────────────────────
  @Post('invest/sell')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sell crypto investment position — credits USD proceeds to account' })
  async sell(@Body() dto: SellCryptoInvestDto, @CurrentUser() user: UserDocument) {
    return this.cryptoService.sellCryptoInvestment(String(user._id), dto);
  }
}
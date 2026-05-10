import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CryptoAddress, CryptoAddressDocument } from '../admin/schemas/crypto-address.schema';
 
@ApiTags('Crypto')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('crypto')
export class CryptoController {
  constructor(
    @InjectModel(CryptoAddress.name)
    private readonly cryptoAddrModel: Model<CryptoAddressDocument>,
  ) {}
 
  @Get('addresses')
  @ApiOperation({ summary: 'Get all active crypto deposit addresses (user-facing)' })
  async getActiveAddresses() {
    const addresses = await this.cryptoAddrModel
      .find({ isActive: true })
      .select('-lastUpdatedBy -__v')  
      .sort({ coin: 1 })
      .lean();
 
    return addresses;
  }
}
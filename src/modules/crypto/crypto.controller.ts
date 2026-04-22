import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { CryptoService } from './crypto.service';
import { InitiateCryptoDto } from './dto/crypto-payment.dto';

@ApiTags('Crypto')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('crypto')
export class CryptoController {
  constructor(private readonly cryptoService: CryptoService) {}

  @Get('rates')
  @ApiOperation({ summary: 'Get live cryptocurrency exchange rates in USD' })
  rates() { return this.cryptoService.getExchangeRates(); }

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate crypto payment — sends OTP' })
  initiate(@CurrentUser() user: UserDocument, @Body() dto: Omit<InitiateCryptoDto, 'otp'>) {
    return this.cryptoService.initiate(String(user._id), dto, user.email);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm crypto payment with OTP' })
  confirm(@CurrentUser() user: UserDocument, @Body() dto: InitiateCryptoDto) {
    return this.cryptoService.confirm(String(user._id), dto, user);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get crypto payment history' })
  history(@CurrentUser() user: UserDocument) {
    return this.cryptoService.getHistory(String(user._id));
  }
}
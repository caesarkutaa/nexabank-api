import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { BillsService } from './bills.service';
import { PayBillDto } from './dto/pay-bill.dto';

@ApiTags('Bills')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('bills')
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  @Get('billers')
  @ApiOperation({ summary: 'Get list of supported billers' })
  getBillers() {
    return this.billsService.getPopularBillers();
  }

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate bill payment — sends OTP' })
  initiate(
    @CurrentUser() user: UserDocument,
    @Body() dto: Omit<PayBillDto, 'otp'>,
  ) {
    return this.billsService.initiateBillPayment(String(user._id), dto, user.email);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm bill payment with OTP' })
  confirm(@CurrentUser() user: UserDocument, @Body() dto: PayBillDto) {
    return this.billsService.confirmBillPayment(String(user._id), dto, user);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get bill payment history' })
  history(@CurrentUser() user: UserDocument) {
    return this.billsService.getUserBills(String(user._id));
  }
}
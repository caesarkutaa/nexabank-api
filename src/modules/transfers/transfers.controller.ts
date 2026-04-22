import {
  Controller, Post, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import * as userSchema from '../users/schemas/user.schema';
import { TransfersService } from './transfers.service';
import {
  InitiateTransferDto,
  IntraBankTransferDto,
  InterBankTransferDto,
  InternationalTransferDto,
} from './dto/transfer.dto';

@ApiTags('Transfers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 1 — Initiate any transfer type, sends OTP to email' })
  initiate(
    @CurrentUser() user: userSchema.UserDocument,
    @Body() dto: InitiateTransferDto,
  ) {
    return this.transfersService.initiateTransfer(
      String(user._id),
      dto,
      user.email,
    );
  }

  @Post('intrabank/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 2A — Confirm NexaBank-to-NexaBank transfer (OTP + PIN)' })
  confirmIntrabank(
    @CurrentUser() user: userSchema.UserDocument,
    @Body() dto: IntraBankTransferDto,
  ) {
    return this.transfersService.confirmIntrabank(String(user._id), dto, user);
  }

  @Post('interbank/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 2B — Confirm ACH transfer to external US bank (OTP)' })
  confirmInterbank(
    @CurrentUser() user: userSchema.UserDocument,
    @Body() dto: InterBankTransferDto,
  ) {
    return this.transfersService.confirmInterbank(String(user._id), dto, user);
  }

  @Post('international/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step 2C — Confirm international wire transfer (OTP)' })
  confirmInternational(
    @CurrentUser() user: userSchema.UserDocument,
    @Body() dto: InternationalTransferDto,
  ) {
    return this.transfersService.confirmInternational(String(user._id), dto, user);
  }
}
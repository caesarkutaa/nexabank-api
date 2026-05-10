import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus, Ip,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import * as userSchema from '../users/schemas/user.schema';
import { AdminService } from './admin.service';
import {
  CreateUserAdminDto, CreateAccountAdminDto, CreditDebitUserDto,
  UpdateTransferDto, BlockTransferDto, ApproveLoanDto, DeclineLoanDto,
  ReviewKycDto, ReviewChequeDto, ReviewInvestmentDto,
  UpsertCryptoAddressDto, EditReceiptDto, UpdateOtpConfigDto, AdminQueryDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('JWT')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Dashboard ─────────────────────────────────────────────────
  @Get('dashboard')
  @ApiOperation({ summary: 'Admin dashboard stats' })
  dashboard() { return this.adminService.getDashboardStats(); }

  // ── Users ─────────────────────────────────────────────────────
  @Get('users')
  @ApiOperation({ summary: 'Get all users with filters' })
  getUsers(@Query() query: AdminQueryDto) {
    return this.adminService.getAllUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get full user details including accounts, transactions, loans, KYC' })
  getUserDetails(@Param('id') id: string) {
    return this.adminService.getUserDetails(id);
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user from admin panel' })
  createUser(@Body() dto: CreateUserAdminDto, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.createUser(dto, admin);
  }

  @Post('users/:id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block / suspend a user' })
  blockUser(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() admin: userSchema.UserDocument,
  ) {
    return this.adminService.blockUser(id, body.reason, admin);
  }

  @Post('users/:id/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock / activate a user' })
  unblockUser(@Param('id') id: string, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.unblockUser(id, admin);
  }

  @Patch('users/:id/credit-score')
  @ApiOperation({ summary: 'Update user credit score and rating' })
  updateCreditScore(
    @Param('id') id: string,
    @Body() body: { score: number; rating: userSchema.CreditRating },
    @CurrentUser() admin: userSchema.UserDocument,
  ) {
    return this.adminService.updateUserCreditScore(id, body.score, body.rating, admin);
  }

  // ── Accounts ──────────────────────────────────────────────────
  @Get('accounts')
  @ApiOperation({ summary: 'Get all accounts' })
  getAccounts(@Query() query: AdminQueryDto) {
    return this.adminService.getAllAccounts(query);
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an account for any user' })
  createAccount(@Body() dto: CreateAccountAdminDto, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.createAccountForUser(dto, admin);
  }

  @Post('accounts/:id/freeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Freeze an account' })
  freeze(@Param('id') id: string, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.freezeAccount(id, admin);
  }

  @Post('accounts/:id/unfreeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfreeze an account' })
  unfreeze(@Param('id') id: string, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.unfreezeAccount(id, admin);
  }

  @Post('accounts/credit-debit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Credit or debit any user account' })
  creditDebit(@Body() dto: CreditDebitUserDto, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.creditDebitUser(dto, admin);
  }


 @Delete('accounts/:id')
@HttpCode(HttpStatus.OK)
deleteAccount(@Param('id') id: string, @CurrentUser() admin: userSchema.UserDocument) {
  return this.adminService.deleteAccount(id, admin);
}
 
@Post('accounts/transfer/intrabank')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Admin intrabank transfer — creates tx in both users histories' })
adminIntrabank(@Body() dto: any, @CurrentUser() admin: userSchema.UserDocument) {
  return this.adminService.adminIntrabankTransfer(dto, admin);
}
 
@Post('accounts/transfer/interbank')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Admin ACH transfer' })
adminInterbank(@Body() dto: any, @CurrentUser() admin: userSchema.UserDocument) {
  return this.adminService.adminInterbankTransfer(dto, admin);
}
 
 @Post('accounts/transfer/international')
 @HttpCode(HttpStatus.OK)
 @ApiOperation({ summary: 'Admin international wire transfer' })
 adminInternational(@Body() dto: any, @CurrentUser() admin: userSchema.UserDocument) {
   return this.adminService.adminInternationalTransfer(dto, admin);
 }

  // ── Transactions / Transfers ──────────────────────────────────
  @Get('transactions')
  @ApiOperation({ summary: 'Get all transactions with filters' })
  getTransactions(@Query() query: AdminQueryDto) {
    return this.adminService.getAllTransactions(query);
  }

  @Put('transactions/:id')
  @ApiOperation({ summary: 'Edit any transaction field including date, status, amounts, recipient' })
  updateTransaction(
    @Param('id') id: string,
    @Body() dto: UpdateTransferDto,
    @CurrentUser() admin: userSchema.UserDocument,
  ) {
    return this.adminService.updateTransaction(id, dto, admin);
  }

  @Post('transactions/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block / cancel a transfer' })
  blockTransaction(@Body() dto: BlockTransferDto, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.blockTransaction(dto, admin);
  }

  @Post('transactions/:id/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a transfer (set back to pending)' })
  unblockTransaction(@Param('id') id: string, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.unblockTransaction(id, admin);
  }

  @Put('transactions/:id/receipt')
  @ApiOperation({ summary: 'Edit receipt content and regenerate PDF' })
  editReceipt(
    @Param('id') id: string,
    @Body() dto: EditReceiptDto,
    @CurrentUser() admin: userSchema.UserDocument,
  ) {
    return this.adminService.editReceipt(id, dto, admin);
  }

  @Patch('users/:id/transfer-block')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Block or unblock a user from making transfers (can still log in)' })
toggleTransferBlock(
  @Param('id') id: string,
  @Body() body: { transferBlocked: boolean; reason?: string },
  @CurrentUser() admin: userSchema.UserDocument,
) {
  return this.adminService.toggleTransferBlock(id, body.transferBlocked, body.reason, admin);
}

  // ── Loans ─────────────────────────────────────────────────────
  @Get('loans')
  @ApiOperation({ summary: 'Get all loans' })
  getLoans(@Query() query: AdminQueryDto) {
    return this.adminService.getAllLoans(query);
  }

  @Post('loans/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a loan application' })
  approveLoan(
    @Param('id') id: string,
    @Body() dto: ApproveLoanDto,
    @CurrentUser() admin: userSchema.UserDocument,
  ) {
    return this.adminService.approveLoan(id, dto, admin);
  }

  @Post('loans/:id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a loan application' })
  declineLoan(
    @Param('id') id: string,
    @Body() dto: DeclineLoanDto,
    @CurrentUser() admin: userSchema.UserDocument,
  ) {
    return this.adminService.declineLoan(id, dto, admin);
  }

  @Post('loans/:id/disburse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disburse approved loan funds to user account' })
  disburseLoan(@Param('id') id: string, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.disburseLoan(id, admin);
  }

  // ── KYC ───────────────────────────────────────────────────────
  @Get('kyc')
  @ApiOperation({ summary: 'Get all KYC submissions' })
  getKyc(@Query() query: AdminQueryDto) {
    return this.adminService.getAllKyc(query);
  }

  @Post('kyc/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve, reject or request resubmission of KYC' })
  reviewKyc(
    @Param('id') id: string,
    @Body() dto: ReviewKycDto,
    @CurrentUser() admin: userSchema.UserDocument,
  ) {
    return this.adminService.reviewKyc(id, dto, admin);
  }

  // ── Cheques ───────────────────────────────────────────────────
  @Get('cheques')
  @ApiOperation({ summary: 'Get all cheque deposits' })
  getCheques(@Query() query: AdminQueryDto) {
    return this.adminService.getAllCheques(query);
  }

  @Post('cheques/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept or decline a cheque deposit' })
  reviewCheque(
    @Param('id') id: string,
    @Body() dto: ReviewChequeDto,
    @CurrentUser() admin: userSchema.UserDocument,
  ) {
    return this.adminService.reviewCheque(id, dto, admin);
  }

  // ── Investments ───────────────────────────────────────────────
  @Get('investments')
  @ApiOperation({ summary: 'Get all investment orders' })
  getInvestments(@Query() query: AdminQueryDto) {
    return this.adminService.getAllInvestments(query);
  }

  @Post('investments/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject an investment order' })
  reviewInvestment(
    @Param('id') id: string,
    @Body() dto: ReviewInvestmentDto,
    @CurrentUser() admin: userSchema.UserDocument,
  ) {
    return this.adminService.reviewInvestment(id, dto, admin);
  }

  // ── Crypto Addresses ──────────────────────────────────────────
  @Get('crypto/addresses')
  @ApiOperation({ summary: 'Get all NexaBank crypto deposit addresses' })
  getCryptoAddresses() { return this.adminService.getAllCryptoAddresses(); }

  @Put('crypto/addresses')
  @ApiOperation({ summary: 'Create or update a crypto deposit address (BTC, ETH, USDT, TRX...)' })
  upsertCryptoAddress(@Body() dto: UpsertCryptoAddressDto, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.upsertCryptoAddress(dto, admin);
  }

  @Delete('crypto/addresses/:network')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a crypto address by network' })
  deleteCryptoAddress(@Param('network') network: string, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.deleteCryptoAddress(network, admin);
  }

  // ── OTP Config ────────────────────────────────────────────────
  @Get('otp/config')
  @ApiOperation({ summary: 'Get OTP enabled/disabled status for all purposes' })
  getOtpConfig() { return this.adminService.getAllOtpConfigs(); }

  @Put('otp/config')
  @ApiOperation({ summary: 'Pause or unpause OTP for any purpose' })
  updateOtpConfig(@Body() dto: UpdateOtpConfigDto, @CurrentUser() admin: userSchema.UserDocument) {
    return this.adminService.updateOtpConfig(dto, admin);
  }

  // ── Audit Logs ────────────────────────────────────────────────
  @Get('logs')
  @ApiOperation({ summary: 'Get full admin audit trail' })
  getAuditLogs(@Query() query: AdminQueryDto) {
    return this.adminService.getAuditLogs(query);
  }
}
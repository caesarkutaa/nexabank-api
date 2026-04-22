import {
  Controller, Post, Get, Body,
  Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import * as userSchema from '../users/schemas/user.schema';
import { LoansService } from './loans.service';
import { ApplyLoanDto, LoanRepaymentDto } from './dto/loan.dto';

@ApiTags('Loans')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply for a loan or line of credit' })
  apply(@CurrentUser() user: userSchema.UserDocument, @Body() dto: ApplyLoanDto) {
    return this.loansService.applyForLoan(String(user._id), dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all loans for current user' })
  getAll(@CurrentUser() user: userSchema.UserDocument) {
    return this.loansService.getUserLoans(String(user._id));
  }

  @Get('credit-profile')
  @ApiOperation({ summary: 'Get credit score, rating, utilization & tips' })
  creditProfile(@CurrentUser() user: userSchema.UserDocument) {
    return this.loansService.getCreditProfile(String(user._id));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single loan details & repayment schedule' })
  getOne(@Param('id') id: string, @CurrentUser() user: userSchema.UserDocument) {
    return this.loansService.getLoanById(id, String(user._id));
  }

  @Post('repay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make a loan repayment (OTP required)' })
  repay(@CurrentUser() user: userSchema.UserDocument, @Body() dto: LoanRepaymentDto) {
    return this.loansService.repayLoan(String(user._id), dto, user);
  }

  @Post('initiate-repay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate repayment — sends OTP to email' })
  initiateRepay(
    @CurrentUser() user: userSchema.UserDocument,
    @Body() body: { loanId: string; accountId: string; amount: number },
  ) {
    return this.loansService.initiateRepayment(String(user._id), body, user.email);
  }
}
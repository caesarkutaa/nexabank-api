import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import * as userSchema from '../users/schemas/user.schema';
import { TransactionsService } from './transactions.service';

@ApiTags('Transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all transactions with filters & pagination' })
  @ApiQuery({ name: 'type',      required: false })
  @ApiQuery({ name: 'direction', required: false })
  @ApiQuery({ name: 'status',    required: false })
  @ApiQuery({ name: 'from',      required: false })
  @ApiQuery({ name: 'to',        required: false })
  @ApiQuery({ name: 'page',      required: false })
  @ApiQuery({ name: 'limit',     required: false })
  getAll(
    @CurrentUser() user: userSchema.UserDocument,
    @Query() query: {
      type?: string; direction?: string; status?: string;
      from?: string; to?: string; page?: number; limit?: number;
    },
  ) {
    return this.transactionsService.getTransactions(String(user._id), query);
  }

  @Get('analytics/monthly')
  @ApiOperation({ summary: 'Get 6-month income vs expense analytics' })
  monthlyAnalytics(@CurrentUser() user: userSchema.UserDocument) {
    return this.transactionsService.getMonthlyAnalytics(String(user._id));
  }

  @Get('analytics/spending')
  @ApiOperation({ summary: 'Get spending breakdown by category this month' })
  spendingByCategory(@CurrentUser() user: userSchema.UserDocument) {
    return this.transactionsService.getSpendingByCategory(String(user._id));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single transaction details' })
  getOne(@Param('id') id: string, @CurrentUser() user: userSchema.UserDocument) {
    return this.transactionsService.getTransactionById(id, String(user._id));
  }
}
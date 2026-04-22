import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { AccountsService } from './accounts.service';
import { AccountType } from './schemas/account.schema';

class CreateAccountDto {
  @IsOptional()
  @IsEnum(AccountType)
  accountType?: AccountType;
}

class UpdateNicknameDto {
  @IsString() nickname: string;
}

@ApiTags('Accounts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new bank account (checking / savings / money_market)' })
  create(@CurrentUser() user: UserDocument, @Body() dto: CreateAccountDto) {
    return this.accountsService.createAccount(
      String(user._id),
      dto.accountType ?? AccountType.CHECKING,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all accounts belonging to current user' })
  getAll(@CurrentUser() user: UserDocument) {
    return this.accountsService.getUserAccounts(String(user._id));
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard — balances, income %, debit % for current month' })
  dashboard(@CurrentUser() user: UserDocument) {
    return this.accountsService.getDashboard(String(user._id));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single account by ID' })
  getOne(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.accountsService.getAccountById(id, String(user._id));
  }

  @Post(':id/freeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Freeze or unfreeze an account (toggle)' })
  freeze(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.accountsService.toggleFreeze(id, String(user._id));
  }

  @Patch(':id/nickname')
  @ApiOperation({ summary: 'Set a friendly nickname on an account' })
  nickname(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
    @Body() dto: UpdateNicknameDto,
  ) {
    return this.accountsService.updateNickname(id, String(user._id), dto.nickname);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close an account (balance must be $0)' })
  close(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.accountsService.closeAccount(id, String(user._id));
  }
}
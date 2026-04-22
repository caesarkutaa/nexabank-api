import {
  Controller, Post, Get, Body, Param, UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { InvestmentsService } from './investments.service';
import { BuyStockDto, SellStockDto } from './dto/buy-stock.dto';

@ApiTags('Investments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('investments')
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  @Get('quote/:symbol')
  @ApiOperation({ summary: 'Get real-time stock quote' })
  getQuote(@Param('symbol') symbol: string) {
    return this.investmentsService.getQuote(symbol);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search stocks by name or symbol' })
  search(@Query('q') q: string) {
    return this.investmentsService.searchStocks(q);
  }

  @Post('buy')
  @ApiOperation({ summary: 'Buy shares — OTP required before calling this' })
  buy(@CurrentUser() user: UserDocument, @Body() dto: BuyStockDto) {
    return this.investmentsService.buyStock(String(user._id), dto, user.email);
  }

  @Post('sell')
  @ApiOperation({ summary: 'Sell shares' })
  sell(@CurrentUser() user: UserDocument, @Body() dto: SellStockDto) {
    return this.investmentsService.sellStock(String(user._id), dto, user.email);
  }

  @Get('portfolio')
  @ApiOperation({ summary: 'Get live portfolio with P&L' })
  portfolio(@CurrentUser() user: UserDocument) {
    return this.investmentsService.getPortfolio(String(user._id));
  }

  @Get('history')
  @ApiOperation({ summary: 'Full investment history' })
  history(@CurrentUser() user: UserDocument) {
    return this.investmentsService.getHistory(String(user._id));
  }
}

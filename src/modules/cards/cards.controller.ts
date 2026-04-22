import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import type { UserDocument } from '../users/schemas/user.schema';
import { CardsService } from './cards.service';
import { IssueCardDto, UpdateCardLimitsDto, UpdateCardControlsDto } from './dto/card.dto';

class UpdateNicknameDto {
  @IsString() @IsNotEmpty() nickname: string;
}

@ApiTags('Cards')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post('issue')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Issue a new virtual card linked to an account' })
  issue(@CurrentUser() user: UserDocument, @Body() dto: IssueCardDto) {
    return this.cardsService.issueCard(String(user._id), dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all virtual cards for current user' })
  getAll(@CurrentUser() user: UserDocument) {
    return this.cardsService.getUserCards(String(user._id));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single virtual card by ID (no sensitive data)' })
  getOne(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.cardsService.getCardById(id, String(user._id));
  }

  @Post(':id/reveal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reveal full card number and CVV (decrypted)' })
  reveal(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.cardsService.revealCard(id, String(user._id));
  }

  @Post(':id/freeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Freeze or unfreeze a card (toggle)' })
  freeze(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.cardsService.toggleFreeze(id, String(user._id));
  }

  @Patch(':id/limits')
  @ApiOperation({ summary: 'Update daily and monthly spending limits' })
  limits(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
    @Body() dto: UpdateCardLimitsDto,
  ) {
    return this.cardsService.updateLimits(id, String(user._id), dto);
  }

  @Patch(':id/controls')
  @ApiOperation({ summary: 'Toggle online, international and contactless payments' })
  controls(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
    @Body() dto: UpdateCardControlsDto,
  ) {
    return this.cardsService.updateControls(id, String(user._id), dto);
  }

  @Patch(':id/nickname')
  @ApiOperation({ summary: 'Set a friendly nickname on a card' })
  nickname(
    @Param('id') id: string,
    @CurrentUser() user: UserDocument,
    @Body() dto: UpdateNicknameDto,
  ) {
    return this.cardsService.updateNickname(id, String(user._id), dto.nickname);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently cancel a virtual card' })
  cancel(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.cardsService.cancelCard(id, String(user._id));
  }
}
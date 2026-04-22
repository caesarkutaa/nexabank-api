import {
  Controller, Post, Get, Body, Param,
  UseGuards, UseInterceptors, UploadedFiles,
  HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user/current-user.decorator';
import * as userSchema from '../users/schemas/user.schema';
import { ChequeDepositService } from './cheque-deposit.service';

@ApiTags('Cheque Deposit')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@Controller('cheques')
export class ChequeDepositController {
  constructor(private readonly chequeDepositService: ChequeDepositService) {}

  @Post('deposit')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Deposit a cheque by uploading front & back images' })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'front', maxCount: 1 },
      { name: 'back',  maxCount: 1 },
    ], {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async deposit(
    @CurrentUser() user: userSchema.UserDocument,
    @Body() body: {
      accountId:    string;
      chequeNumber: string;
      payerName:    string;
      payerBank:    string;
      amount:       string;
      memo:         string;
    },
    @UploadedFiles() files: { front?: Express.Multer.File[]; back?: Express.Multer.File[] },
  ) {
    if (!files?.front?.[0]) throw new BadRequestException('Front image of cheque is required');

    return this.chequeDepositService.depositCheque(
      String(user._id),
      {
        accountId:    body.accountId,
        chequeNumber: body.chequeNumber,
        payerName:    body.payerName,
        payerBank:    body.payerBank,
        amount:       parseFloat(body.amount),
        memo:         body.memo,
      },
      { front: files.front[0], back: files.back?.[0] },
      user,
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Get cheque deposit history' })
  history(@CurrentUser() user: userSchema.UserDocument) {
    return this.chequeDepositService.getChequeHistory(String(user._id));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single cheque deposit details' })
  getOne(@Param('id') id: string, @CurrentUser() user: userSchema.UserDocument) {
    return this.chequeDepositService.getChequeById(id, String(user._id));
  }
}

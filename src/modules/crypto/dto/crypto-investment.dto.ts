import { Type } from "class-transformer";
import { IsNotEmpty, IsNumber, IsPositive, IsString } from "class-validator";

export class BuyCryptoInvestDto {
  @IsString() @IsNotEmpty()
  symbol: string;         // 'BTC' | 'ETH' | 'SOL' etc.
 
   @IsNumber() @IsPositive() @Type(() => Number)
  amountUSD: number;      // how much USD to invest
 
 @IsString() @IsNotEmpty()
  accountId: string;
}
 
export class SellCryptoInvestDto {
   @IsString() @IsNotEmpty()
  investmentId: string;   
 
  @IsString() @IsNotEmpty()
  accountId: string;     
}
 
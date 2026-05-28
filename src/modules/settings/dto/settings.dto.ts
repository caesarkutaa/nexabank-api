import {
  IsString, IsOptional, IsBoolean, IsNumber,
  IsArray, ValidateNested, IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

/* ── Footer ──────────────────────────────────────────────────── */

export class FooterLinkDto {
  @IsString() label: string;
  @IsString() href: string;
}

export class FooterSectionDto {
  @IsString() title: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FooterLinkDto)
  links: FooterLinkDto[];
}

/* ── Page ────────────────────────────────────────────────────── */

export class UpdatePageDto {
  @IsString()            key: string;
  @IsOptional() @IsString()   label?: string;
  @IsOptional() @IsBoolean()  visible?: boolean;
  @IsOptional() @IsNumber()   order?: number;
  @IsOptional() @IsString()   icon?: string;
  @IsOptional() @IsString()   description?: string;
  @IsOptional() @IsString()   content?: string;
}

export class CreateCustomPageDto {
  @IsString() label: string;       // display name
  @IsString() path: string;        // URL path e.g. /about
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() content?: string;
}

/* ── Branding ────────────────────────────────────────────────── */

export class UpdateBrandingDto {
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankTagline?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() faviconUrl?: string;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() supportEmail?: string;
  @IsOptional() @IsString() supportPhone?: string;
  @IsOptional() @IsString() headquartersAddress?: string;
  @IsOptional() @IsString() fdicNotice?: string;
  @IsOptional() @IsString() copyrightText?: string;
}

/* ── Full settings update ────────────────────────────────────── */

export class UpdateSiteConfigDto {
  @IsOptional() @ValidateNested() @Type(() => UpdateBrandingDto)
  branding?: UpdateBrandingDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdatePageDto)
  pages?: UpdatePageDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FooterSectionDto)
  footerSections?: FooterSectionDto[];
}

/* ── Admin password change ───────────────────────────────────── */

export class AdminChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() newPassword: string;
}
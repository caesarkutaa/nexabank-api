import {
  Controller, Get, Put, Post, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard }   from '../../common/guards/jwt-auth/jwt-auth.guard';
import { AdminGuard }     from '../admin/guards/admin.guard';
import { CurrentUser }    from '../../common/decorators/current-user/current-user.decorator';
import { SettingsService } from './settings.service';
import {
  UpdateBrandingDto,
  UpdatePageDto,
  CreateCustomPageDto,
  FooterSectionDto,
  AdminChangePasswordDto,
} from './dto/settings.dto';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /* ── GET full config ─────────────────────────────────────── */
  @Get()
  getConfig() {
    return this.settingsService.getConfig();
  }

  /* ── Branding ────────────────────────────────────────────── */
  @Put('branding')
  updateBranding(@Body() dto: UpdateBrandingDto) {
    return this.settingsService.updateBranding(dto);
  }

  /* ── Page visibility (single) ────────────────────────────── */
  @Put('pages')
  updatePage(@Body() dto: UpdatePageDto) {
    return this.settingsService.updatePage(dto);
  }

  /* ── Pages bulk (all at once — for reorder drag) ─────────── */
  @Put('pages/bulk')
  bulkUpdatePages(@Body() body: { pages: UpdatePageDto[] }) {
    return this.settingsService.bulkUpdatePages(body.pages);
  }

  /* ── Create custom page ──────────────────────────────────── */
  @Post('pages/custom')
  createCustomPage(@Body() dto: CreateCustomPageDto) {
    return this.settingsService.createCustomPage(dto);
  }

  /* ── Delete custom page ──────────────────────────────────── */
  @Delete('pages/custom/:key')
  deleteCustomPage(@Param('key') key: string) {
    return this.settingsService.deleteCustomPage(key);
  }
    
  /* ── Admin change password ───────────────────────────────── */
  @Put('change-password')
  changePassword(
    @CurrentUser() admin: any,
    @Body() dto: AdminChangePasswordDto,
  ) {
    return this.settingsService.adminChangePassword(admin._id.toString(), dto);
  }
}
@Controller('site-config')
export class PublicSiteConfigController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getPublicConfig() {
    return this.settingsService.getConfig();
  }
}
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model }       from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { SiteConfig, SiteConfigDocument } from './schema/Siteconfig.schema';
import { User, UserDocument }             from '../users/schemas/user.schema';
import {
  UpdateSiteConfigDto,
  UpdateBrandingDto,
  UpdatePageDto,
  CreateCustomPageDto,
  FooterSectionDto,
  AdminChangePasswordDto,
} from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(SiteConfig.name) private cfgModel: Model<SiteConfigDocument>,
    @InjectModel(User.name)       private userModel: Model<UserDocument>,
  ) {}

  /* ── Get or create singleton ─────────────────────────────── */
  async getConfig(): Promise<SiteConfigDocument> {
    let cfg = await this.cfgModel.findOne({ singleton: true }).lean();
    if (!cfg) {
      cfg = await this.cfgModel.create({ singleton: true });
    }
    return cfg as SiteConfigDocument;
  }

  /* ── Update branding ─────────────────────────────────────── */
  async updateBranding(dto: UpdateBrandingDto): Promise<SiteConfigDocument> {
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) update[k] = v;
    }
    const cfg = await this.cfgModel
      .findOneAndUpdate({ singleton: true }, { $set: update }, { new: true, upsert: true })
      .lean();
    return cfg as SiteConfigDocument;
  }

  /* ── Toggle / update a single page ──────────────────────── */
  async updatePage(dto: UpdatePageDto): Promise<SiteConfigDocument> {
    const cfg = await this.cfgModel.findOne({ singleton: true });
    if (!cfg) throw new NotFoundException('Site config not found');

    const idx = cfg.pages.findIndex(p => p.key === dto.key);
    if (idx === -1) throw new NotFoundException(`Page '${dto.key}' not found`);

    if (dto.visible    !== undefined) cfg.pages[idx].visible     = dto.visible;
    if (dto.label      !== undefined) cfg.pages[idx].label       = dto.label;
    if (dto.order      !== undefined) cfg.pages[idx].order        = dto.order;
    if (dto.icon       !== undefined) cfg.pages[idx].icon        = dto.icon;
    if (dto.description!== undefined) cfg.pages[idx].description = dto.description;
    if (dto.content    !== undefined) cfg.pages[idx].content     = dto.content;

    cfg.markModified('pages');
    await cfg.save();
    return cfg.toObject() as SiteConfigDocument;
  }

  /* ── Bulk update all pages (reorder + visibility) ────────── */
  async bulkUpdatePages(pages: UpdatePageDto[]): Promise<SiteConfigDocument> {
    const cfg = await this.cfgModel.findOne({ singleton: true });
    if (!cfg) throw new NotFoundException('Site config not found');

    for (const dto of pages) {
      const idx = cfg.pages.findIndex(p => p.key === dto.key);
      if (idx === -1) continue;
      if (dto.visible    !== undefined) cfg.pages[idx].visible    = dto.visible;
      if (dto.label      !== undefined) cfg.pages[idx].label      = dto.label;
      if (dto.order      !== undefined) cfg.pages[idx].order       = dto.order;
      if (dto.icon       !== undefined) cfg.pages[idx].icon       = dto.icon;
      if (dto.description!== undefined) cfg.pages[idx].description = dto.description;
      if (dto.content    !== undefined) cfg.pages[idx].content    = dto.content;
    }

    cfg.markModified('pages');
    await cfg.save();
    return cfg.toObject() as SiteConfigDocument;
  }

  /* ── Create a custom page ────────────────────────────────── */
  async createCustomPage(dto: CreateCustomPageDto): Promise<SiteConfigDocument> {
    const cfg = await this.cfgModel.findOne({ singleton: true });
    if (!cfg) throw new NotFoundException('Site config not found');

    // Normalise path
    const path = dto.path.startsWith('/') ? dto.path : `/${dto.path}`;
    const key  = path.replace(/\//g, '_').replace(/^_/, '') || `custom_${Date.now()}`;

    if (cfg.pages.some(p => p.key === key || p.path === path)) {
      throw new BadRequestException(`A page with path '${path}' already exists`);
    }

    cfg.pages.push({
      key,
      label:       dto.label,
      path,
      visible:     true,
      order:       cfg.pages.length,
      isCustom:    true,
      icon:        dto.icon        ?? '',
      description: dto.description ?? '',
      content:     dto.content     ?? '',
    });

    cfg.markModified('pages');
    await cfg.save();
    return cfg.toObject() as SiteConfigDocument;
  }

  /* ── Delete a custom page ────────────────────────────────── */
  async deleteCustomPage(key: string): Promise<SiteConfigDocument> {
    const cfg = await this.cfgModel.findOne({ singleton: true });
    if (!cfg) throw new NotFoundException('Site config not found');

    const page = cfg.pages.find(p => p.key === key);
    if (!page)          throw new NotFoundException(`Page '${key}' not found`);
    if (!page.isCustom) throw new ForbiddenException('Cannot delete a built-in page');

    cfg.pages = cfg.pages.filter(p => p.key !== key) as any;
    cfg.markModified('pages');
    await cfg.save();
    return cfg.toObject() as SiteConfigDocument;
  }

  /* ── Update footer sections ──────────────────────────────── */
  async updateFooter(sections: FooterSectionDto[]): Promise<SiteConfigDocument> {
    const cfg = await this.cfgModel.findOneAndUpdate(
      { singleton: true },
      { $set: { footerSections: sections } },
      { new: true, upsert: true },
    ).lean();
    return cfg as SiteConfigDocument;
  }

  /* ── Admin change password ───────────────────────────────── */
  async adminChangePassword(adminId: string, dto: AdminChangePasswordDto): Promise<void> {
    const admin = await this.userModel.findById(adminId).select('+passwordHash');
    if (!admin) throw new NotFoundException('Admin not found');

    const valid = await bcrypt.compare(dto.currentPassword, admin.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    if (dto.newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    admin.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await admin.save();
  }
}
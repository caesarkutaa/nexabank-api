import {
  Injectable, NotFoundException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { v2 as cloudinary } from 'cloudinary';
import { SiteConfig, SiteConfigDocument } from './schema/Siteconfig.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  UpdateBrandingDto, UpdatePageDto,
  CreateCustomPageDto, AdminChangePasswordDto,
} from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(SiteConfig.name) private cfgModel: Model<SiteConfigDocument>,
    @InjectModel(User.name)       private userModel: Model<UserDocument>,
  ) {
    // Configure Cloudinary from env vars (already set in your project)
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /* ── Singleton ───────────────────────────────────────────── */
  async getConfig(): Promise<SiteConfigDocument> {
    let cfg = await this.cfgModel.findOne({ singleton: true }).lean();
    if (!cfg) cfg = await this.cfgModel.create({ singleton: true });
    return cfg as SiteConfigDocument;
  }

  /* ── Branding text fields ────────────────────────────────── */
  async updateBranding(dto: UpdateBrandingDto): Promise<SiteConfigDocument> {
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) update[k] = v;
    }
    return this.cfgModel
      .findOneAndUpdate({ singleton: true }, { $set: update }, { new: true, upsert: true })
      .lean() as Promise<SiteConfigDocument>;
  }

  /* ── Upload helper → Cloudinary ──────────────────────────── */
  private uploadToCloudinary(
    buffer: Buffer,
    folder: string,
    publicId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id:      publicId,
          overwrite:      true,
          resource_type:  'image',
          // keep original quality for logos
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (err, result) => {
          if (err || !result) return reject(err ?? new Error('Upload failed'));
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });
  }

  /* ── Logo upload ─────────────────────────────────────────── */
  async uploadLogo(file: Express.Multer.File): Promise<SiteConfigDocument> {
    if (!file) throw new BadRequestException('No file provided');

    const url = await this.uploadToCloudinary(
      file.buffer,
      'nexabank/branding',
      'logo',
    );

    return this.cfgModel
      .findOneAndUpdate(
        { singleton: true },
        { $set: { logoUrl: url } },
        { new: true, upsert: true },
      )
      .lean() as Promise<SiteConfigDocument>;
  }

  /* ── Favicon upload ──────────────────────────────────────── */
  async uploadFavicon(file: Express.Multer.File): Promise<SiteConfigDocument> {
    if (!file) throw new BadRequestException('No file provided');

    const url = await this.uploadToCloudinary(
      file.buffer,
      'nexabank/branding',
      'favicon',
    );

    return this.cfgModel
      .findOneAndUpdate(
        { singleton: true },
        { $set: { faviconUrl: url } },
        { new: true, upsert: true },
      )
      .lean() as Promise<SiteConfigDocument>;
  }

  /* ── Single page update ──────────────────────────────────── */
  async updatePage(dto: UpdatePageDto): Promise<SiteConfigDocument> {
    const cfg = await this.cfgModel.findOne({ singleton: true });
    if (!cfg) throw new NotFoundException('Site config not found');

    const idx = cfg.pages.findIndex(p => p.key === dto.key);
    if (idx === -1) throw new NotFoundException(`Page '${dto.key}' not found`);

    if (dto.visible     !== undefined) cfg.pages[idx].visible     = dto.visible;
    if (dto.label       !== undefined) cfg.pages[idx].label       = dto.label;
    if (dto.order       !== undefined) cfg.pages[idx].order        = dto.order;
    if (dto.icon        !== undefined) cfg.pages[idx].icon        = dto.icon;
    if (dto.description !== undefined) cfg.pages[idx].description = dto.description;
    if (dto.content     !== undefined) cfg.pages[idx].content     = dto.content;

    cfg.markModified('pages');
    await cfg.save();
    return cfg.toObject() as SiteConfigDocument;
  }

  /* ── Bulk page update ────────────────────────────────────── */
  async bulkUpdatePages(pages: UpdatePageDto[]): Promise<SiteConfigDocument> {
    const cfg = await this.cfgModel.findOne({ singleton: true });
    if (!cfg) throw new NotFoundException('Site config not found');

    for (const dto of pages) {
      const idx = cfg.pages.findIndex(p => p.key === dto.key);
      if (idx === -1) continue;
      if (dto.visible     !== undefined) cfg.pages[idx].visible     = dto.visible;
      if (dto.label       !== undefined) cfg.pages[idx].label       = dto.label;
      if (dto.order       !== undefined) cfg.pages[idx].order        = dto.order;
      if (dto.icon        !== undefined) cfg.pages[idx].icon        = dto.icon;
      if (dto.description !== undefined) cfg.pages[idx].description = dto.description;
      if (dto.content     !== undefined) cfg.pages[idx].content     = dto.content;
    }

    cfg.markModified('pages');
    await cfg.save();
    return cfg.toObject() as SiteConfigDocument;
  }

  /* ── Create custom page ──────────────────────────────────── */
  async createCustomPage(dto: CreateCustomPageDto): Promise<SiteConfigDocument> {
    const cfg = await this.cfgModel.findOne({ singleton: true });
    if (!cfg) throw new NotFoundException('Site config not found');

    const pagePath = dto.path.startsWith('/') ? dto.path : `/${dto.path}`;
    const key      = pagePath.replace(/\//g, '_').replace(/^_/, '') || `custom_${Date.now()}`;

    if (cfg.pages.some(p => p.key === key || p.path === pagePath)) {
      throw new BadRequestException(`A page with path '${pagePath}' already exists`);
    }

    cfg.pages.push({
      key,
      label:       dto.label,
      path:        pagePath,
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

  /* ── Delete custom page ──────────────────────────────────── */
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

  /* ── Admin change password ───────────────────────────────── */
  async adminChangePassword(adminId: string, dto: AdminChangePasswordDto): Promise<{ message: string }> {
    const admin = await this.userModel.findById(adminId).select('+passwordHash');
    if (!admin) throw new NotFoundException('Admin not found');

    const valid = await bcrypt.compare(dto.currentPassword, admin.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    if (dto.newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    admin.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await admin.save();
    return { message: 'Password changed successfully' };
  }
}
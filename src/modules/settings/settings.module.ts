import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SiteConfig, SiteConfigSchema } from './schema/Siteconfig.schema';
import { User, UserSchema }             from '../users/schemas/user.schema';
import { SettingsService }              from './settings.service';
import { SettingsController, PublicSiteConfigController } from './settings.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SiteConfig.name, schema: SiteConfigSchema },
      { name: User.name,       schema: UserSchema       },
    ]),
  ],
  controllers: [SettingsController, PublicSiteConfigController],
  providers:   [SettingsService],
  exports:     [SettingsService],
})
export class SettingsModule {}
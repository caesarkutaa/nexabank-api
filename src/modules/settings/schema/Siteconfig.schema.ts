import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SiteConfigDocument = SiteConfig & Document;

export class FooterLink {
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) href: string;
}

export class FooterSection {
  @Prop({ required: true }) title: string;
  @Prop({ type: [{ label: String, href: String }], default: [] }) links: FooterLink[];
}

export class NavPage {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) path: string;
  @Prop({ default: true  }) visible: boolean;
  @Prop({ default: 0     }) order: number;
  @Prop({ default: false }) isCustom: boolean;
  @Prop({ default: ''    }) icon: string;
  @Prop({ default: ''    }) description: string;
  @Prop({ default: ''    }) content: string;
}

@Schema({ timestamps: true, collection: 'siteconfigs' })
export class SiteConfig {
  @Prop({ default: true, unique: true }) singleton: boolean;

  @Prop({ default: 'NexaBank'  }) bankName: string;
  @Prop({ default: ''          }) bankTagline: string;
  @Prop({ default: ''          }) logoUrl: string;     
  @Prop({ default: ''          }) faviconUrl: string;   
  @Prop({ default: '#f59e0b'   }) primaryColor: string;
  @Prop({ default: ''          }) supportEmail: string;
  @Prop({ default: ''          }) supportPhone: string;
  @Prop({ default: ''          }) headquartersAddress: string;
  @Prop({ default: 'Your deposits are FDIC insured up to $250,000.' }) fdicNotice: string;
  @Prop({ default: ''          }) copyrightText: string;

  @Prop({
    type: [{
      key: String, label: String, path: String,
      visible: Boolean, order: Number,
      isCustom: Boolean, icon: String,
      description: String, content: String,
    }],
    default: [
      { key: 'dashboard',    label: 'Dashboard',    path: '/dashboard/userboard',    visible: true,  order: 0, isCustom: false, icon: 'LayoutDashboard', description: '', content: '' },
      { key: 'accounts',     label: 'Accounts',     path: '/dashboard/accounts',     visible: true,  order: 1, isCustom: false, icon: 'CreditCard',      description: '', content: '' },
      { key: 'transfers',    label: 'Transfers',    path: '/dashboard/transfers',    visible: true,  order: 2, isCustom: false, icon: 'ArrowLeftRight',  description: '', content: '' },
      { key: 'transactions', label: 'Transactions', path: '/dashboard/transactions', visible: true,  order: 3, isCustom: false, icon: 'Receipt',         description: '', content: '' },
      { key: 'loans',        label: 'Loans',        path: '/dashboard/loans',        visible: true,  order: 4, isCustom: false, icon: 'Landmark',        description: '', content: '' },
      { key: 'investments',  label: 'Investments',  path: '/dashboard/investments',  visible: true,  order: 5, isCustom: false, icon: 'TrendingUp',      description: '', content: '' },
      { key: 'crypto',       label: 'Crypto',       path: '/dashboard/crypto',       visible: true,  order: 6, isCustom: false, icon: 'Bitcoin',         description: '', content: '' },
      { key: 'cheque',       label: 'Cheques',      path: '/dashboard/cheque',       visible: true,  order: 7, isCustom: false, icon: 'BookCheck',       description: '', content: '' },
      { key: 'kyc',          label: 'KYC',          path: '/dashboard/kyc',          visible: true,  order: 8, isCustom: false, icon: 'ShieldCheck',     description: '', content: '' },
      { key: 'settings',     label: 'Settings',     path: '/dashboard/settings',     visible: true,  order: 9, isCustom: false, icon: 'Settings',        description: '', content: '' },
    ],
  })
  pages: NavPage[];

  @Prop({
    type: [{ title: String, links: [{ label: String, href: String }] }],
    default: [
      { title: 'Company', links: [
        { label: 'About Us', href: '#' }, { label: 'Careers', href: '#' },
        { label: 'Press', href: '#' },    { label: 'Blog', href: '#' },
        { label: 'Investors', href: '#' },{ label: 'Partners', href: '#' },
      ]},
      { title: 'Support', links: [
        { label: 'Help Center', href: '#' }, { label: 'Contact Us', href: '#' },
        { label: 'Security', href: '#' },    { label: 'Status', href: '#' },
        { label: 'Community', href: '#' },   { label: 'API Docs', href: '#' },
      ]},
      { title: 'Legal', links: [
        { label: 'Privacy Policy', href: '#' }, { label: 'Terms of Service', href: '#' },
        { label: 'Cookie Policy', href: '#' },  { label: 'FDIC Notice', href: '#' },
        { label: 'Disclosures', href: '#' },
      ]},
    ],
  })
  footerSections: FooterSection[];
}

export const SiteConfigSchema = SchemaFactory.createForClass(SiteConfig);
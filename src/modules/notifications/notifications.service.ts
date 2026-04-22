import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class NotificationsService {
  private readonly resend: Resend;
  private readonly from: string;
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
    this.from   = `${config.get('APP_NAME', 'NexaBank')} <${config.get('RESEND_FROM_EMAIL')}>`;
  }

  // ── OTP Email ─────────────────────────────────────────────────
  async sendOtpEmail(email: string, otp: string, purpose: string): Promise<void> {
    const subjects: Record<string, string> = {
      email_verification:    'Verify Your Email Address',
      transfer_confirmation: 'Authorize Your Transfer',
      login_verification:    'Login Verification Code',
      password_reset:        'Reset Your Password',
      security_pin_change:   'Security PIN Change Authorization',
    };

    await this.resend.emails.send({
      from:    this.from,
      to:      email,
      subject: `NexaBank — ${subjects[purpose] ?? 'Verification Code'}`,
      html:    this.otpTemplate(otp, subjects[purpose] ?? 'Verification'),
    });
  }

  // ── Welcome Email ─────────────────────────────────────────────
  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    await this.resend.emails.send({
      from:    this.from,
      to:      email,
      subject: 'Welcome to NexaBank 🏦',
      html:    this.welcomeTemplate(firstName),
    });
  }

  // ── Transfer Notification ─────────────────────────────────────
  async sendTransferAlert(
    email: string,
    data: { direction: string; amount: number; fee: number; ref: string; type: string; balance: number },
  ): Promise<void> {
    const isDebit = data.direction === 'debit';
    await this.resend.emails.send({
      from:    this.from,
      to:      email,
      subject: `NexaBank — ${isDebit ? 'Debit Alert' : 'Credit Alert'} $${data.amount.toFixed(2)}`,
      html:    this.transactionTemplate(isDebit, data),
    });
  }

  // ── Loan Status Email ─────────────────────────────────────────
  async sendLoanStatusEmail(email: string, firstName: string, status: string, amount: number): Promise<void> {
    await this.resend.emails.send({
      from:    this.from,
      to:      email,
      subject: `NexaBank — Loan Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      html: `
        ${this.emailWrapper(`
          <h2 style="color:#0a2342">Loan Application Update</h2>
          <p>Dear ${firstName},</p>
          <p>Your loan application for <strong>$${amount.toLocaleString()}</strong> has been
             <strong style="color:${status === 'approved' ? '#16a34a' : '#dc2626'}">${status.toUpperCase()}</strong>.</p>
          ${status === 'approved'
            ? `<p>Funds will be disbursed to your account within 1–2 business days.</p>`
            : `<p>Please contact our support team for more information.</p>`}
        `)}`,
    });
  }

  // ── Templates ─────────────────────────────────────────────────
  private otpTemplate(otp: string, title: string): string {
    return this.emailWrapper(`
      <h2 style="color:#0a2342;margin-bottom:8px">${title}</h2>
      <p style="color:#555;margin-bottom:24px">Use the code below to complete your action. It expires in <strong>10 minutes</strong>.</p>
      <div style="background:#f0f4ff;border:2px dashed #3b82f6;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
        <span style="font-size:48px;font-weight:800;letter-spacing:12px;color:#0a2342;font-family:monospace">${otp}</span>
      </div>
      <p style="color:#888;font-size:13px">⚠️ Never share this code with anyone — NexaBank will never ask for it.</p>
    `);
  }

  private welcomeTemplate(firstName: string): string {
    return this.emailWrapper(`
      <h2 style="color:#0a2342">Welcome aboard, ${firstName}! 🎉</h2>
      <p>Your NexaBank account has been created successfully.</p>
      <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;border-radius:6px;margin:20px 0">
        <strong>✅ FDIC Insured</strong><br/>
        Your deposits are insured up to <strong>$250,000</strong> per depositor.
      </div>
      <p>Next steps:</p>
      <ul style="color:#555;line-height:2">
        <li>✅ Verify your email</li>
        <li>📋 Complete KYC verification</li>
        <li>🏦 Fund your account</li>
        <li>🔐 Set up 2FA for extra security</li>
      </ul>
    `);
  }

  private transactionTemplate(isDebit: boolean, data: any): string {
    return this.emailWrapper(`
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:40px">${isDebit ? '💸' : '💰'}</span>
        <h2 style="color:${isDebit ? '#dc2626' : '#16a34a'};margin:8px 0">
          ${isDebit ? '-' : '+'}$${data.amount.toFixed(2)}
        </h2>
        <span style="background:${isDebit ? '#fef2f2' : '#f0fdf4'};color:${isDebit ? '#dc2626' : '#16a34a'};
          padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600">
          ${isDebit ? 'DEBIT' : 'CREDIT'}
        </span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${this.tableRow('Transaction Type', data.type.replace(/_/g, ' ').toUpperCase())}
        ${this.tableRow('Reference',        data.ref)}
        ${this.tableRow('Fee',              `$${data.fee.toFixed(2)}`)}
        ${this.tableRow('Balance After',    `$${data.balance.toFixed(2)}`)}
        ${this.tableRow('Date',             new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET')}
      </table>
      <p style="color:#888;font-size:12px;margin-top:20px">
        If you did not authorize this transaction, contact us immediately at support@nexabank.com
      </p>
    `);
  }

  private tableRow(label: string, value: string): string {
    return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#888;width:40%">${label}</td>
        <td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#0a2342;font-weight:600">${value}</td>
      </tr>`;
  }

  private emailWrapper(content: string): string {
    return `
      <!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif">
        <div style="max-width:600px;margin:40px auto">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#0a2342 0%,#1e40af 100%);padding:28px 32px;border-radius:12px 12px 0 0;display:flex;align-items:center">
            <span style="font-size:28px;margin-right:12px">🏦</span>
            <div>
              <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:1px">NEXABANK</span><br/>
              <span style="color:#93c5fd;font-size:11px;letter-spacing:2px">MEMBER FDIC · EST. 2024</span>
            </div>
          </div>
          <!-- Body -->
          <div style="background:#fff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb">
            ${content}
          </div>
          <!-- Footer -->
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center">
            <p style="color:#9ca3af;font-size:11px;margin:0">
              © ${new Date().getFullYear()} NexaBank, N.A. · Member FDIC · Equal Housing Lender<br/>
              1 Financial Plaza, New York, NY 10005 · <a href="mailto:support@nexabank.com" style="color:#3b82f6">support@nexabank.com</a>
            </p>
          </div>
        </div>
      </body></html>`;
  }
}
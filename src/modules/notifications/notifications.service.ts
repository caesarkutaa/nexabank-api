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

  // ── Transfer / Transaction Alert (DEBIT or CREDIT) ────────────
  // Full details: recipient/sender name, account number, bank, amount, fee, balance
  async sendTransferAlert(
    email: string,
    data: {
      direction:               string;
      amount:                  number;
      fee:                     number;
      ref:                     string;
      type:                    string;
      balance:                 number;
      description?:            string;
      // Recipient info (for DEBIT — you sent money)
      recipientName?:          string;
      recipientAccountNumber?: string;
      recipientBankName?:      string;
      recipientCountry?:       string;
      // Sender info (for CREDIT — you received money)
      senderName?:             string;
      senderAccountNumber?:    string;
      senderBankName?:         string;
      // Merchant (for card / bill payments)
      merchant?:               string;
    },
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
  async sendLoanStatusEmail(
    email:     string,
    firstName: string,
    status:    string,
    amount:    number,
  ): Promise<void> {
    await this.resend.emails.send({
      from:    this.from,
      to:      email,
      subject: `NexaBank — Loan Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      html: this.emailWrapper(`
        <h2 style="color:#0a2342">Loan Application Update</h2>
        <p>Dear ${firstName},</p>
        <p>Your loan application for <strong>$${amount.toLocaleString()}</strong> has been
           <strong style="color:${status === 'approved' ? '#16a34a' : '#dc2626'}">${status.toUpperCase()}</strong>.</p>
        ${status === 'approved'
          ? `<p>Funds will be disbursed to your account within 1–2 business days.</p>`
          : `<p>Please contact our support team for more information.</p>`}
      `),
    });
  }

  // ── KYC Approved Email ────────────────────────────────────────
  async sendKycApprovedEmail(email: string, firstName: string): Promise<void> {
    await this.resend.emails.send({
      from:    this.from,
      to:      email,
      subject: 'NexaBank — Identity Verification Approved ✅',
      html: this.emailWrapper(`
        <div style="text-align:center;margin-bottom:28px">
          <div style="width:72px;height:72px;background:#f0fdf4;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px">
            <span style="font-size:36px">✅</span>
          </div>
          <h2 style="color:#16a34a;margin:0 0 8px">KYC Verification Approved!</h2>
          <p style="color:#555;margin:0">Your identity has been successfully verified.</p>
        </div>
        <p>Dear ${firstName},</p>
        <p>Great news! Your identity verification (KYC) has been reviewed and <strong style="color:#16a34a">approved</strong> by our compliance team.</p>
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;border-radius:6px;margin:20px 0">
          <strong>🎉 You now have full access to:</strong>
          <ul style="margin:10px 0;padding-left:20px;color:#555;line-height:2">
            <li>Apply for loans and credit lines</li>
            <li>International wire transfers</li>
            <li>Higher transaction limits</li>
            <li>Crypto investment and deposits</li>
            <li>Full cheque deposit services</li>
          </ul>
        </div>
        <p style="color:#555">Log in to your NexaBank account to explore all available services.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${this.config.get('FRONTEND_URL')}/dashboard"
             style="background:linear-gradient(135deg,#0a2342,#1e40af);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
            Go to Dashboard →
          </a>
        </div>
        <p style="color:#888;font-size:13px">
          If you have any questions, contact us at
          <a href="mailto:support@nexabank.com" style="color:#3b82f6">support@nexabank.com</a>
        </p>
      `),
    });
  }

  // ── KYC Rejected / Resubmit Email ─────────────────────────────
  async sendKycRejectedEmail(
    email:         string,
    firstName:     string,
    rejectionNote: string,
    resubmit = false,
  ): Promise<void> {
    const isResubmit = resubmit || false;
    await this.resend.emails.send({
      from:    this.from,
      to:      email,
      subject: isResubmit
        ? 'NexaBank — Additional Documents Required for KYC'
        : 'NexaBank — Identity Verification Update',
      html: this.emailWrapper(`
        <div style="text-align:center;margin-bottom:28px">
          <div style="width:72px;height:72px;background:#fef2f2;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px">
            <span style="font-size:36px">${isResubmit ? '📋' : '❌'}</span>
          </div>
          <h2 style="color:${isResubmit ? '#d97706' : '#dc2626'};margin:0 0 8px">
            ${isResubmit ? 'Additional Documents Required' : 'Verification Not Approved'}
          </h2>
        </div>
        <p>Dear ${firstName},</p>
        <p>
          ${isResubmit
            ? 'Our compliance team has reviewed your identity verification and requires some additional information or clearer documents.'
            : 'After reviewing your identity verification submission, we were unable to approve it at this time.'}
        </p>
        ${rejectionNote ? `
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;border-radius:6px;margin:20px 0">
          <strong>Reason:</strong><br/>
          <p style="color:#555;margin:8px 0 0">${rejectionNote}</p>
        </div>` : ''}
        ${isResubmit ? `
        <div style="background:#fff7ed;border-left:4px solid #f97316;padding:16px;border-radius:6px;margin:20px 0">
          <strong>📋 What to do next:</strong>
          <ul style="margin:10px 0;padding-left:20px;color:#555;line-height:2">
            <li>Ensure documents are clear, unobstructed, and fully visible</li>
            <li>Make sure the document has not expired</li>
            <li>Use the front and back of the document if required</li>
            <li>Ensure your selfie clearly shows your face without sunglasses</li>
          </ul>
        </div>
        <div style="text-align:center;margin:28px 0">
          <a href="${this.config.get('FRONTEND_URL')}/kyc"
             style="background:linear-gradient(135deg,#d97706,#b45309);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
            Resubmit Documents →
          </a>
        </div>` : `
        <p style="color:#555">
          If you believe this is an error or need help, please contact our support team
          and we will be happy to assist you through the verification process.
        </p>
        <div style="text-align:center;margin:28px 0">
          <a href="mailto:support@nexabank.com"
             style="background:#0a2342;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
            Contact Support
          </a>
        </div>`}
        <p style="color:#888;font-size:13px">
          Questions? Email us at
          <a href="mailto:support@nexabank.com" style="color:#3b82f6">support@nexabank.com</a>
          or call 1-800-NEXABANK.
        </p>
      `),
    });
  }

  // ── Password Reset Email ──────────────────────────────────────
  async sendPasswordResetEmail(
    email:     string,
    firstName: string,
    otp:       string,
  ): Promise<void> {
    await this.resend.emails.send({
      from:    this.from,
      to:      email,
      subject: 'NexaBank — Password Reset Request',
      html: this.emailWrapper(`
        <h2 style="color:#0a2342">Password Reset Request</h2>
        <p>Dear ${firstName},</p>
        <p>We received a request to reset your NexaBank password. Use the code below:</p>
        <div style="background:#fef2f2;border:2px dashed #dc2626;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
          <span style="font-size:48px;font-weight:800;letter-spacing:12px;color:#dc2626;font-family:monospace">${otp}</span>
        </div>
        <p style="color:#555">This code expires in <strong>15 minutes</strong>.</p>
        <div style="background:#fff7ed;border-left:4px solid #f97316;padding:16px;border-radius:6px;margin:20px 0">
          <strong>⚠️ Security Warning:</strong><br/>
          If you did not request this password reset, please contact us immediately at
          <a href="mailto:security@nexabank.com" style="color:#dc2626">security@nexabank.com</a>
          and secure your account.
        </div>
        <p style="color:#888;font-size:13px">Never share this code with anyone — NexaBank will never ask for it.</p>
      `),
    });
  }

  // ── Password Changed Confirmation ─────────────────────────────
  async sendPasswordChangedEmail(
    email:     string,
    firstName: string,
    ip:        string,
  ): Promise<void> {
    await this.resend.emails.send({
      from:    this.from,
      to:      email,
      subject: 'NexaBank — Your Password Has Been Changed',
      html: this.emailWrapper(`
        <h2 style="color:#0a2342">Password Changed Successfully</h2>
        <p>Dear ${firstName},</p>
        <p>Your NexaBank account password was successfully changed.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0">
          ${this.tableRow('Date & Time', new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET')}
          ${this.tableRow('IP Address',  ip)}
        </table>
        <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;border-radius:6px;margin:20px 0">
          <strong>🚨 Was this not you?</strong><br/>
          Contact us immediately:<br/>
          📧 <a href="mailto:security@nexabank.com" style="color:#dc2626">security@nexabank.com</a><br/>
          📞 1-800-NEXABANK
        </div>
      `),
    });
  }

  // ── Admin Welcome Email ───────────────────────────────────────
  async sendAdminWelcomeEmail(
    email:     string,
    firstName: string,
    username:  string,
  ): Promise<void> {
    await this.resend.emails.send({
      from:    this.from,
      to:      email,
      subject: 'NexaBank — Admin Account Created',
      html: this.emailWrapper(`
        <h2 style="color:#0a2342">Admin Account Created 🔐</h2>
        <p>Dear ${firstName},</p>
        <p>An admin account has been created for you on the NexaBank system.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0">
          ${this.tableRow('Username', username)}
          ${this.tableRow('Email',    email)}
          ${this.tableRow('Role',     'Administrator')}
          ${this.tableRow('Access',   'NexaBank Admin Panel')}
        </table>
        <div style="background:#f0f4ff;border-left:4px solid #0a2342;padding:16px;border-radius:6px;margin:20px 0">
          <strong>🔒 Security Recommendations:</strong>
          <ul style="margin:8px 0;padding-left:20px;color:#555">
            <li>Set up 2FA immediately after first login</li>
            <li>Set a 6-digit security PIN</li>
            <li>Never share your credentials</li>
            <li>Log out after each admin session</li>
          </ul>
        </div>
        <p style="color:#888;font-size:13px">
          Admin Panel: <a href="${this.config.get('FRONTEND_URL')}/admin" style="color:#3b82f6">
            ${this.config.get('FRONTEND_URL')}/admin
          </a>
        </p>
      `),
    });
  }

  // ══════════════════════════════════════════════════════════════
  // PRIVATE TEMPLATES
  // ══════════════════════════════════════════════════════════════

  private otpTemplate(otp: string, title: string): string {
    return this.emailWrapper(`
      <h2 style="color:#0a2342;margin-bottom:8px">${title}</h2>
      <p style="color:#555;margin-bottom:24px">
        Use the code below to complete your action. It expires in <strong>10 minutes</strong>.
      </p>
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
    const color      = isDebit ? '#dc2626' : '#16a34a';
    const bgColor    = isDebit ? '#fef2f2' : '#f0fdf4';
    const borderColor= isDebit ? '#dc2626' : '#16a34a';
    const sign       = isDebit ? '-' : '+';
    const label      = isDebit ? 'DEBIT'  : 'CREDIT';
    const emoji      = isDebit ? '💸'     : '💰';

    // Build party rows depending on direction
    const partyRows = isDebit ? `
      ${data.recipientName          ? this.tableRow('Recipient Name',    data.recipientName)          : ''}
      ${data.recipientAccountNumber ? this.tableRow('Recipient Account', `····${data.recipientAccountNumber.slice(-4)}`) : ''}
      ${data.recipientBankName      ? this.tableRow('Recipient Bank',    data.recipientBankName)      : ''}
      ${data.recipientCountry       ? this.tableRow('Destination',       data.recipientCountry)       : ''}
    ` : `
      ${data.senderName             ? this.tableRow('Sender Name',       data.senderName)             : ''}
      ${data.senderAccountNumber    ? this.tableRow('Sender Account',    `····${data.senderAccountNumber.slice(-4)}`) : ''}
      ${data.senderBankName         ? this.tableRow('Sender Bank',       data.senderBankName)         : ''}
    `;

    return this.emailWrapper(`
      <!-- Amount hero -->
      <div style="text-align:center;margin-bottom:28px">
        <div style="width:72px;height:72px;background:${bgColor};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
          <span style="font-size:34px">${emoji}</span>
        </div>
        <h2 style="color:${color};font-size:36px;font-family:monospace;margin:0 0 6px;letter-spacing:-1px">
          ${sign}$${data.amount.toFixed(2)}
        </h2>
        <span style="background:${bgColor};color:${color};border:1px solid ${borderColor};
          padding:4px 14px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.05em">
          ${label}
        </span>
      </div>

      <!-- Transaction details table -->
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        ${this.tableRow('Transaction Type', (data.type ?? '').replace(/_/g, ' ').toUpperCase())}
        ${this.tableRow('Reference',        data.ref ?? '—')}
        ${partyRows}
        ${data.merchant   ? this.tableRow('Merchant',       data.merchant)                          : ''}
        ${data.description? this.tableRow('Description',    data.description)                       : ''}
        ${this.tableRow('Amount',           `$${data.amount.toFixed(2)}`)}
        ${data.fee > 0    ? this.tableRow('Fee',            `$${data.fee.toFixed(2)}`)              : ''}
      
        ${this.tableRow('Date',             new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET')}
      </table>

      <!-- Security notice -->
      <div style="background:${isDebit ? '#fef2f2' : '#f0fdf4'};border-left:4px solid ${borderColor};
        padding:14px 16px;border-radius:6px;margin-top:24px;font-size:13px;color:#555">
        ${isDebit
          ? '🔒 If you did not authorize this transaction, contact us immediately at <a href="mailto:security@nexabank.com" style="color:#dc2626">security@nexabank.com</a> or call 1-800-NEXABANK.'
          : '✅ This credit has been applied to your account. Log in to view your updated balance.'
        }
      </div>
    `);
  }

  private tableRow(label: string, value: string): string {
    if (!value || value === '——') return '';
    return `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;color:#888;width:42%;font-size:13px">${label}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;color:#0a2342;font-weight:600;font-size:13px">${value}</td>
      </tr>`;
  }

  private emailWrapper(content: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif">
        <div style="max-width:600px;margin:40px auto">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#0a2342 0%,#1e40af 100%);padding:28px 32px;border-radius:12px 12px 0 0">
            <div style="display:flex;align-items:center">
              <span style="font-size:28px;margin-right:12px">🏦</span>
              <div>
                <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:1px">NEXABANK</span><br/>
                <span style="color:#93c5fd;font-size:11px;letter-spacing:2px">MEMBER FDIC · EST. 2024</span>
              </div>
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
              1 Financial Plaza, New York, NY 10005 ·
              <a href="mailto:support@nexabank.com" style="color:#3b82f6">support@nexabank.com</a>
            </p>
          </div>
        </div>
      </body>
      </html>`;
  }
}
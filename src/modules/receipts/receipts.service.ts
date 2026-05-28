import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get('CLOUDINARY_CLOUD_NAME'),
      api_key:    this.config.get('CLOUDINARY_API_KEY'),
      api_secret: this.config.get('CLOUDINARY_API_SECRET'),
    });
    this.logger.log(`[RECEIPTS] Cloudinary configured — cloud: ${this.config.get('CLOUDINARY_CLOUD_NAME')}`);
  }

  // userTimezone is sent by the browser — e.g. 'Africa/Lagos', 'Europe/London', 'America/New_York'
  async generatePdfReceipt(transaction: any, userTimezone?: string): Promise<string> {
    const ref = transaction?.referenceNumber ?? 'UNKNOWN';
    const tz  = this.resolveTimezone(userTimezone);
    this.logger.log(`[RECEIPTS] Generating receipt for ${ref} — timezone: ${tz}`);

    const html   = this.buildHtmlReceipt(transaction, tz);
    const buffer = Buffer.from(html, 'utf-8');
    this.logger.log(`[RECEIPTS] HTML built for ${ref} — ${buffer.length} bytes, tz: ${tz}`);

    const url = await this.uploadToCloudinary(buffer, ref);
    return url;
  }

  // Validate the timezone string — fall back to UTC if invalid
  private resolveTimezone(tz?: string): string {
    if (!tz) return 'UTC';
    try {
      // This throws if the timezone is invalid
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch {
      this.logger.warn(`[RECEIPTS] Invalid timezone "${tz}" — falling back to UTC`);
      return 'UTC';
    }
  }

  private buildHtmlReceipt(tx: any, userTimezone: string): string {
    const ref  = tx?.referenceNumber ?? '—';
    const safe = (v: any, fallback = '—'): string =>
      (v !== null && v !== undefined && String(v).trim() !== '') ? String(v) : fallback;

    const amount   = Number(tx?.amount      ?? 0);
    const fee      = Number(tx?.fee         ?? 0);
    const total    = amount + fee;
    const balAfter = Number(tx?.balanceAfter ?? 0);
    const currency = safe(tx?.currency, 'USD');
    const isDebit  = safe(tx?.direction) === 'debit';
    const status   = safe(tx?.status, 'pending');

    // ── Timestamp — real transfer time in user's timezone ─────
    // processedAt = when money actually moved (set on commit)
    // createdAt   = when document was created (fallback)
    const rawDate = tx?.processedAt ?? tx?.createdAt;
    let localDateStr = '—';
    let utcDateStr   = '—';
    let tzLabel      = userTimezone;

    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        // Local time in user's timezone
        localDateStr = d.toLocaleString('en-US', {
          timeZone:     userTimezone,
          weekday:      'long',
          year:         'numeric',
          month:        'long',
          day:          'numeric',
          hour:         '2-digit',
          minute:       '2-digit',
          second:       '2-digit',
          hour12:       true,
          timeZoneName: 'long',   // e.g. "West Africa Standard Time"
        });

        // UTC reference time
        utcDateStr = d.toLocaleString('en-US', {
          timeZone: 'UTC',
          year:     'numeric',
          month:    'short',
          day:      'numeric',
          hour:     '2-digit',
          minute:   '2-digit',
          second:   '2-digit',
          hour12:   false,
        }) + ' UTC';

        // Timezone offset label e.g. "Africa/Lagos (UTC+1)"
        const offset = new Intl.DateTimeFormat('en', {
          timeZone:     userTimezone,
          timeZoneName: 'shortOffset',
        }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? '';
        tzLabel = `${userTimezone} ${offset}`;
      }
    }

    const usd = (n: number) => `$${n.toFixed(2)} ${currency}`;

    const statusBg    = status === 'completed'  ? '#dcfce7'
                      : status === 'processing' ? '#dbeafe'
                      : status === 'failed'     ? '#fee2e2'
                      : '#fef9c3';
    const statusColor = status === 'completed'  ? '#166534'
                      : status === 'processing' ? '#1e40af'
                      : status === 'failed'     ? '#991b1b'
                      : '#854d0e';

    const amtBg     = isDebit ? '#fff7f7' : '#f0fff4';
    const amtBorder = isDebit ? '#ef4444' : '#22c55e';
    const amtColor  = isDebit ? '#dc2626' : '#16a34a';
    const amtLabel  = isDebit ? 'AMOUNT SENT' : 'AMOUNT RECEIVED';
    const amtSign   = isDebit ? '−' : '+';

    const rows: { label: string; value: string }[] = [
      { label: 'Reference Number',    value: ref },
      { label: 'Transfer Time',       value: localDateStr },
      { label: 'UTC Reference',       value: utcDateStr },
      { label: 'Timezone',            value: tzLabel },
      { label: 'Type',                value: safe(tx?.type).replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) },
      { label: 'Status',              value: status.toUpperCase() },
      { label: 'Direction',           value: isDebit ? 'DEBIT (Outgoing)' : 'CREDIT (Incoming)' },
      { label: 'Amount',              value: usd(amount) },
      { label: 'Fee',                 value: fee > 0 ? usd(fee) : 'Free' },
      { label: 'Total Charged',       value: usd(total) },
      { label: 'Balance After',       value: usd(balAfter) },
      { label: 'Description',         value: safe(tx?.description) },
      { label: 'From Account',        value: safe(tx?.senderAccountNumber) !== '—' ? `····${safe(tx.senderAccountNumber).slice(-4)}` : '—' },
      { label: 'To Account',          value: safe(tx?.recipientAccountNumber) !== '—' ? `····${safe(tx.recipientAccountNumber).slice(-4)}` : '—' },
      { label: 'Recipient Name',      value: safe(tx?.recipientName) },
      { label: 'Sender Name',         value: safe(tx?.senderName) },
      { label: 'Bank',                value: safe(tx?.recipientBankName) },
      { label: 'Routing Number',      value: safe(tx?.recipientRoutingNumber) },
      { label: 'Swift / BIC',         value: safe(tx?.swiftCode) },
      { label: 'IBAN',                value: safe(tx?.ibanNumber) },
      { label: 'Destination Country', value: safe(tx?.recipientCountry) },
    ].filter(r => r.value && r.value !== '—');

    const rowsHtml = rows.map((r, i) => `
      <tr style="background:${i%2===0?'#f8fafc':'#ffffff'}">
        <td style="padding:11px 18px;color:#64748b;font-size:13px;width:44%;border-bottom:1px solid #e2e8f0;font-weight:500;vertical-align:top">${r.label}</td>
        <td style="padding:11px 18px;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0;word-break:break-all">${r.value}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>NexaBank Receipt — ${ref}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;background:#f1f5f9;color:#0f172a;padding:32px 16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .wrapper{max-width:640px;margin:0 auto;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)}
  .header{background:linear-gradient(135deg,#0a2342 0%,#1e3a5f 100%);padding:26px 32px}
  .header-row{display:flex;align-items:center;gap:14px}
  .logo{width:46px;height:46px;background:rgba(255,255,255,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#fff;flex-shrink:0}
  .bank-name{font-size:21px;font-weight:800;color:#fff;letter-spacing:.5px}
  .bank-sub{font-size:10px;color:#93c5fd;letter-spacing:1.5px;margin-top:2px}
  .title-bar{background:#fff;padding:22px 32px;text-align:center;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0}
  .receipt-title{font-size:18px;font-weight:800;color:#0a2342;letter-spacing:1.5px;margin-bottom:10px}
  .badges{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
  .ref-badge{background:#f0f4ff;border:1px solid #c7d2fe;border-radius:100px;padding:4px 14px;font-size:12px;font-family:monospace;color:#4338ca;font-weight:700}
  .status-badge{border-radius:100px;padding:4px 14px;font-size:11px;font-weight:700;letter-spacing:.05em;background:${statusBg};color:${statusColor}}
  .amount-bar{background:${amtBg};border-left:5px solid ${amtBorder};border-right:1px solid #e2e8f0;padding:20px 32px;text-align:center}
  .amount-label{font-size:10px;font-weight:700;letter-spacing:.1em;color:${amtColor};text-transform:uppercase;margin-bottom:8px}
  .amount-value{font-size:38px;font-weight:900;color:${amtColor};font-family:monospace;letter-spacing:-1px;line-height:1}
  .amount-cur{font-size:16px;font-weight:600;margin-left:4px;opacity:.8}
  .tbl-wrap{background:#fff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0}
  table{width:100%;border-collapse:collapse}
  .footer{background:#f8fafc;border:1px solid #e2e8f0;padding:18px 32px;text-align:center}
  .footer p{font-size:11px;color:#94a3b8;line-height:1.9;margin:0}
  .print-btn{display:inline-block;margin-top:12px;padding:8px 22px;background:#0a2342;color:#fff;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;border:none;font-family:inherit}
  @media print{.print-btn{display:none}body{padding:0}.wrapper{box-shadow:none;border-radius:0}}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-row">
      <div class="logo">N</div>
      <div>
        <div class="bank-name">NEXABANK</div>
        <div class="bank-sub">MEMBER FDIC &nbsp;·&nbsp; EQUAL HOUSING LENDER</div>
      </div>
    </div>
  </div>
  <div class="title-bar">
    <div class="receipt-title">TRANSACTION RECEIPT</div>
    <div class="badges">
      <span class="ref-badge">${ref}</span>
      <span class="status-badge">${status.toUpperCase()}</span>
    </div>
  </div>
  <div class="amount-bar">
    <div class="amount-label">${amtLabel}</div>
    <div class="amount-value">${amtSign}$${amount.toFixed(2)}<span class="amount-cur">${currency}</span></div>
  </div>
  <div class="tbl-wrap">
    <table>${rowsHtml}</table>
  </div>
  <div class="footer">
    <p>This is an official auto-generated receipt from NexaBank.</p>
    <p>NexaBank, N.A. &nbsp;·&nbsp; 1 Financial Plaza, New York, NY 10005</p>
    <p>support@nexabank.com &nbsp;·&nbsp; 1-800-NEXABANK</p>
    <p>© ${new Date().getFullYear()} NexaBank. All rights reserved.</p>
    <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
</div>
</body>
</html>`;
  }

  private async uploadToCloudinary(buffer: Buffer, referenceNumber: string): Promise<string> {
    const publicId = `nexabank/receipts/${referenceNumber}`;
    this.logger.log(`[RECEIPTS] Uploading — public_id: ${publicId}, size: ${buffer.length} bytes`);

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id:     publicId,
          format:        'html',
          overwrite:     true,
        },
        (err: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (err) {
            this.logger.error(`[RECEIPTS] Cloudinary error: ${JSON.stringify(err)}`);
            return reject(new InternalServerErrorException(`Cloudinary: ${err.message}`));
          }
          if (!result?.secure_url) {
            this.logger.error(`[RECEIPTS] No secure_url: ${JSON.stringify(result)}`);
            return reject(new InternalServerErrorException('No secure_url from Cloudinary'));
          }
          this.logger.log(`[RECEIPTS] Upload OK — ${result.secure_url}`);
          resolve(result.secure_url);
        },
      );
      stream.on('error', (e: Error) => {
        this.logger.error(`[RECEIPTS] Stream error: ${e.message}`);
        reject(e);
      });
      Readable.from(buffer).pipe(stream);
    });
  }
}
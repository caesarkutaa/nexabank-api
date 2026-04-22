import { Injectable, InternalServerErrorException } from '@nestjs/common';
import PDFDocument from 'pdfkit';  // ← default import, not * as
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class ReceiptsService {
  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get('CLOUDINARY_CLOUD_NAME'),
      api_key:    config.get('CLOUDINARY_API_KEY'),
      api_secret: config.get('CLOUDINARY_API_SECRET'),
    });
  }

  async generatePdfReceipt(transaction: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const doc    = new PDFDocument({ size: 'A4', margin: 50 }); // ← now constructable
      const chunks: Buffer[] = [];

      doc.on('data',  (chunk: Buffer) => chunks.push(chunk));      // ← chunk typed
      doc.on('error', reject);
      doc.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        try {
          const url = await this.uploadToCloudinary(
            buffer,
            `receipts/${transaction.referenceNumber}`,
          );
          resolve(url);
        } catch (e) {
          reject(e);
        }
      });

      // ── Header ────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 100).fill('#0a2342');
      doc
        .fillColor('#ffffff')
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('NexaBank', 50, 30);
      doc
        .fontSize(10)
        .font('Helvetica')
        .text('Member FDIC  •  Equal Housing Lender', 50, 62);
      doc
        .fillColor('#93c5fd')
        .text('nexabank.com  •  support@nexabank.com', 50, 78);

      // ── Title ─────────────────────────────────────────────────
      doc.moveDown(3);
      doc
        .fillColor('#0a2342')
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('TRANSACTION RECEIPT', { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .fillColor('#555')
        .font('Helvetica')
        .text(`Reference: ${transaction.referenceNumber}`, { align: 'center' });

      // ── Divider ───────────────────────────────────────────────
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e5e7eb');
      doc.moveDown(1);

      // ── Rows ──────────────────────────────────────────────────
      const rows: [string, string][] = [
        ['Date & Time',      new Date(transaction.createdAt ?? Date.now()).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET'],
        ['Transaction Type', (transaction.type as string)?.replace(/_/g, ' ').toUpperCase() ?? '—'],
        ['Status',           (transaction.status as string)?.toUpperCase() ?? '—'],
        ['Direction',        (transaction.direction as string)?.toUpperCase() ?? '—'],
        ['Amount',           `$${Number(transaction.amount).toFixed(2)} USD`],
        ['Fee',              `$${Number(transaction.fee ?? 0).toFixed(2)} USD`],
        ['Total',            `$${(Number(transaction.amount) + Number(transaction.fee ?? 0)).toFixed(2)} USD`],
        ['Balance After',    `$${Number(transaction.balanceAfter ?? 0).toFixed(2)} USD`],
        ['Description',      (transaction.description as string) ?? '—'],
        ['From Account',     (transaction.senderAccountNumber as string) ?? '—'],
        ['To Account',       (transaction.recipientAccountNumber as string) ?? '—'],
        ['Recipient',        (transaction.recipientName as string) ?? '—'],
        ['Bank',             (transaction.recipientBankName as string) ?? 'NexaBank, N.A.'],
        ['Swift / BIC',      (transaction.swiftCode as string) ?? '—'],
        ['IBAN',             (transaction.ibanNumber as string) ?? '—'],
      ];

      rows.forEach(([label, value], i) => {
        const y  = doc.y;
        const bg = i % 2 === 0 ? '#f9fafb' : '#ffffff';
        doc.rect(50, y, 495, 24).fill(bg);
        doc.fillColor('#6b7280').fontSize(10).font('Helvetica').text(label, 60, y + 6);
        doc.fillColor('#111827').font('Helvetica-Bold').text(value, 260, y + 6, { width: 280 });
        doc.moveDown(0.85);
      });

      // ── Footer ────────────────────────────────────────────────
      doc.moveDown(2);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e5e7eb');
      doc.moveDown(1);
      doc
        .fontSize(9)
        .fillColor('#9ca3af')
        .font('Helvetica')
        .text('This is an auto-generated receipt. Keep it for your records.', { align: 'center' })
        .text('NexaBank, N.A.  •  1 Financial Plaza, New York, NY 10005',    { align: 'center' })
        .text(`© ${new Date().getFullYear()} NexaBank. All rights reserved.`, { align: 'center' });

      doc.end();
    });
  }

  // ── Private ───────────────────────────────────────────────────

  private uploadToCloudinary(buffer: Buffer, publicId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder:        'nexabank/receipts',
          public_id:     publicId,
          format:        'pdf',
        },
        (
          err:    UploadApiErrorResponse | undefined,
          result: UploadApiResponse     | undefined,
        ) => {
          if (err)              return reject(err);
          if (!result)          return reject(new InternalServerErrorException('Cloudinary upload returned no result'));
          if (!result.secure_url) return reject(new InternalServerErrorException('Cloudinary returned no secure_url'));
          resolve(result.secure_url); // ← now guaranteed non-null
        },
      );

      Readable.from(buffer).pipe(stream);
    });
  }
}
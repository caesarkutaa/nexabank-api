import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LoanDocument = Loan & Document;

export enum LoanType   { PERSONAL = 'personal', MORTGAGE = 'mortgage', AUTO = 'auto', BUSINESS = 'business', STUDENT = 'student', LINE_OF_CREDIT = 'line_of_credit' }
export enum LoanStatus { PENDING = 'pending', UNDER_REVIEW = 'under_review', APPROVED = 'approved', REJECTED = 'rejected', ACTIVE = 'active', PAID_OFF = 'paid_off', DEFAULTED = 'defaulted' }

@Schema({ timestamps: true, collection: 'loans' })
export class Loan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId: Types.ObjectId;

  @Prop({ type: String, enum: LoanType,   required: true }) loanType: LoanType;
  @Prop({ type: String, enum: LoanStatus, default: LoanStatus.PENDING }) status: LoanStatus;

  @Prop({ required: true }) requestedAmount:    number;
  @Prop() approvedAmount:   number;
  @Prop() disbursedAmount:  number;
  @Prop() outstandingBalance: number;

  @Prop() interestRate:     number; // APR %
  @Prop() termMonths:       number;
  @Prop() monthlyPayment:   number;

  @Prop() purpose:          string;
  @Prop() collateral:       string;

  // ── Applicant Snapshot at Apply Time ─────────────────────────
  @Prop() creditScoreAtApplication: number;
  @Prop() annualIncomeAtApplication: number;
  @Prop() debtToIncomeRatio:         number;

  // ── Dates ─────────────────────────────────────────────────────
  @Prop() approvedAt:      Date;
  @Prop() disbursedAt:     Date;
  @Prop() dueDate:         Date;
  @Prop() nextPaymentDate: Date;
  @Prop() paidOffAt:       Date;

  // ── Admin ─────────────────────────────────────────────────────
  @Prop() rejectionReason: string;
  @Prop() reviewedBy:      string;

  // ── Repayment Schedule ────────────────────────────────────────
  @Prop({ type: [Object], default: [] }) repaymentSchedule: Array<{
    dueDate: Date; amount: number; principal: number; interest: number; status: string;
  }>;
}

export const LoanSchema = SchemaFactory.createForClass(Loan);
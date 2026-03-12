export { Language } from "../constants/languages.js";
export { Position } from "../constants/positions.js";
export { QualityTier } from "../constants/tiers.js";

export const UserRole = {
  USER: "USER",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ContentType = {
  EVENT: "EVENT",
  POSTER: "POSTER",
} as const;
export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const FieldType = {
  TEXT: "TEXT",
  TEXTAREA: "TEXTAREA",
  IMAGE: "IMAGE",
  COLOR: "COLOR",
  SELECT: "SELECT",
  NUMBER: "NUMBER",
  PHONE: "PHONE",
  EMAIL: "EMAIL",
  URL: "URL",
} as const;
export type FieldType = (typeof FieldType)[keyof typeof FieldType];

export const TransactionType = {
  CREDIT: "CREDIT",
  DEBIT: "DEBIT",
  REFUND: "REFUND",
  BONUS: "BONUS",
} as const;
export type TransactionType =
  (typeof TransactionType)[keyof typeof TransactionType];

export const TransactionStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REVERSED: "REVERSED",
} as const;
export type TransactionStatus =
  (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const GenerationStatus = {
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type GenerationStatus =
  (typeof GenerationStatus)[keyof typeof GenerationStatus];

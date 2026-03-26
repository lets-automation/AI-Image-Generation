import type { Language, Position, QualityTier, ContentType } from "./enums.js";

// ─── API Response Wrapper ─────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ─── Auth DTOs ─────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  canGenerate: boolean;
  customRole?: { name: string; permissions: string[] } | null;
  avatarUrl: string | null;
  country: string | null;
  createdAt: string;
}

// ─── Showcase DTOs ────────────────────────────────────────────

export type ShowcaseStatusType = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export interface ShowcaseRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userCountry: string | null;
  resultImageUrl: string | null;
  contentType: ContentType;
  language: string;
  qualityTier: QualityTier;
  categoryName: string;
  categoryId: string;
  showcaseStatus: ShowcaseStatusType;
  showcaseCategoryId: string | null;
  showcaseCategoryName: string | null;
  showcaseTargetCountries: string[] | null;
  showcaseRejectionReason: string | null;
  showcaseReviewedAt: string | null;
  createdAt: string;
}

// ─── Generation DTOs ───────────────────────────────────────

export interface CreateGenerationRequest {
  templateId?: string;
  baseImageUrl?: string;
  contentType: ContentType;
  categoryId: string;
  qualityTier: QualityTier;
  /** @deprecated All 10 languages generated automatically */
  language?: Language;
  prompt: string;
  fieldValues: Record<string, string | number>;
  positionMap: Record<string, Position>;
}

export interface GenerationResponse {
  id: string;
  status: string;
  qualityTier: QualityTier;
  creditCost: number;
  jobId: string | null;
  resultImageUrl: string | null;
  createdAt: string;
}

export interface GenerationStatusEvent {
  status: string;
  progress: number;
  resultImageUrl?: string;
  errorMessage?: string;
}

// ─── Template DTOs ─────────────────────────────────────────

export interface TemplateResponse {
  id: string;
  name: string;
  contentType: ContentType;
  categoryId: string;
  categoryName: string;
  imageUrl: string;
  width: number;
  height: number;
  safeZones: SafeZone[];
  isActive: boolean;
  usageCount: number;
}

export interface SafeZone {
  id: string;
  type: "text" | "logo" | "both";
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
  maxFontSize?: number;
  position: Position;
}

// ─── Category DTOs ─────────────────────────────────────────

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  contentType: ContentType;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  fieldSchemas: FieldSchemaResponse[];
}

export interface FieldSchemaResponse {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  sortOrder: number;
  placeholder: string | null;
  defaultValue: string | null;
  hasPosition: boolean;
  validation: FieldValidation | null;
  displayConfig: FieldDisplayConfig | null;
}

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  options?: Array<{ label: string; value: string }>;
  maxFileSize?: number;
  allowedFormats?: string[];
}

export interface FieldDisplayConfig {
  width?: "full" | "half";
  helpText?: string;
  conditionalOn?: { fieldKey: string; value: string };
}

// ─── Festival DTOs ─────────────────────────────────────────

export interface FestivalResponse {
  id: string;
  name: string;
  description: string | null;
  date: string;
  contentType: ContentType;
  visibilityDays: number;
  isActive: boolean;
}

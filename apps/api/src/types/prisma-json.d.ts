import type { Position } from "@ep/shared";

export {};

declare global {
  namespace PrismaJson {
    type TemplateSafeZones = Array<{
      id: string;
      type: "text" | "logo" | "both";
      x: number;
      y: number;
      width: number;
      height: number;
      padding: number;
      maxFontSize?: number;
      position: Position;
    }>;

    type TemplateMetadata = {
      tags?: string[];
      description?: string;
      seasonalHint?: string;
      previewUrl?: string;
    };

    type FieldValidation = {
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      options?: Array<{ label: string; value: string }>;
      maxFileSize?: number;
      allowedFormats?: string[];
    };

    type FieldDisplayConfig = {
      width?: "full" | "half";
      helpText?: string;
      conditionalOn?: { fieldKey: string; value: string };
    };

    type GenerationFieldValues = Record<string, string | number>;
    type GenerationPositionMap = Record<string, Position>;

    type GenerationProviderConfig = {
      providerName: string;
      modelId: string;
      params: Record<string, unknown>;
      rawResponse?: Record<string, unknown>;
    };

    type ModelConfig = {
      size?: string;
      steps?: number;
      guidanceScale?: number;
      negativePrompt?: string;
      [key: string]: unknown;
    };

    type AuditChanges = {
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    };

    type IdempotencyResponse = Record<string, unknown>;
    type SystemConfigValue = string | number | boolean | Record<string, unknown>;

    type SubscriptionPlanFeatures = Array<string>;

    type SubscriptionEventPayload = Record<string, unknown>;

    type FestivalMetadata = {
      region?: string[];
      religion?: string;
      tags?: string[];
    };
  }
}

"use client";

import { create } from "zustand";
import type {
  ContentType,
  QualityTier,
  Position,
  Orientation,
  TemplateResponse,
  CategoryResponse,
  FieldSchemaResponse,
  FieldValues,
} from "@ep/shared";
import { LANGUAGE_COUNTRY_MAP } from "@ep/shared";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { v4 as uuidv4 } from "uuid";

export function getLanguageFromCountry(countryCode?: string | null): string {
  if (!countryCode) return "en";
  const upperCountry = countryCode.toUpperCase();
  for (const [lang, countries] of Object.entries(LANGUAGE_COUNTRY_MAP)) {
    if ((countries as string[]).includes(upperCountry)) {
      return lang;
    }
  }
  return "en";
}

export interface PositionConflict {
  position: Position;
  fields: string[];
}

type GenerationPhase = "configure" | "processing" | "completed" | "failed";

export interface GenerationState {
  // Phase (replaces step counter)
  phase: GenerationPhase;
  contentType: ContentType | null;

  // Configuration
  selectedTemplate: TemplateResponse | null;
  uploadedImage: File | null;
  uploadedImageUrl: string | null;
  selectedCategory: CategoryResponse | null;
  fieldSchemas: FieldSchemaResponse[];
  fieldValues: FieldValues;
  positionMap: Record<string, Position>;
  prompt: string;
  qualityTier: QualityTier;
  orientation: Orientation | null;
  selectedLanguages: string[];
  isPublic: boolean;

  // Computed
  creditCost: number;
  conflicts: PositionConflict[];

  // Generation status (batch)
  batchId: string | null;
  generationId: string | null; // kept for backward compat
  generationStatus: string | null;
  generationProgress: number;
  batchResults: Array<{ id: string; language: string; status: string; resultImageUrl: string | null }>;
  resultImageUrl: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;

  // Actions
  setContentType: (type: ContentType) => void;
  selectTemplate: (template: TemplateResponse) => void;
  setUploadedImage: (file: File, previewUrl: string) => void;
  selectCategory: (category: CategoryResponse) => void;
  setFieldValue: (key: string, value: string | number | string[]) => void;
  setPosition: (key: string, position: Position) => void;
  // Repeatable group actions
  addGroupEntry: (groupKey: string, fieldKeys: string[]) => void;
  removeGroupEntry: (groupKey: string, index: number) => void;
  setGroupFieldValue: (groupKey: string, index: number, fieldKey: string, value: string | number) => void;
  setPrompt: (prompt: string) => void;
  setQualityTier: (tier: QualityTier) => void;
  setOrientation: (orientation: Orientation) => void;
  setIsPublic: (isPublic: boolean) => void;
  toggleLanguage: (lang: string) => void;
  selectAllLanguages: (allLangs?: string[]) => void;
  deselectAllLanguages: () => void;
  submitGeneration: () => Promise<void>;
  reset: () => void;

  // Keep legacy step methods for backwards compatibility during transition
  currentStep: number;
  goToStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
}

const initialState = {
  phase: "configure" as GenerationPhase,
  currentStep: 0,
  contentType: null as ContentType | null,
  selectedTemplate: null as TemplateResponse | null,
  uploadedImage: null as File | null,
  uploadedImageUrl: null as string | null,
  selectedCategory: null as CategoryResponse | null,
  fieldSchemas: [] as FieldSchemaResponse[],
  fieldValues: {} as FieldValues,
  positionMap: {} as Record<string, Position>,
  prompt: "",
  qualityTier: "BASIC" as QualityTier,
  orientation: null as Orientation | null,
  selectedLanguages: [] as string[],
  isPublic: false,
  creditCost: 0,
  conflicts: [] as PositionConflict[],
  batchId: null as string | null,
  generationId: null as string | null,
  generationStatus: null as string | null,
  generationProgress: 0,
  batchResults: [] as Array<{ id: string; language: string; status: string; resultImageUrl: string | null }>,
  resultImageUrl: null as string | null,
  errorMessage: null as string | null,
  isSubmitting: false,
};

function detectConflicts(
  positionMap: Record<string, Position>
): PositionConflict[] {
  const positionGroups: Record<string, string[]> = {};

  for (const [fieldKey, position] of Object.entries(positionMap)) {
    if (!positionGroups[position]) positionGroups[position] = [];
    positionGroups[position].push(fieldKey);
  }

  return Object.entries(positionGroups)
    .filter(([, fields]) => fields.length > 1)
    .map(([position, fields]) => ({
      position: position as Position,
      fields,
    }));
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  ...initialState,

  setContentType: (type) => set({ contentType: type }),

  selectTemplate: (template) =>
    set({
      selectedTemplate: template,
      uploadedImage: null,
      uploadedImageUrl: null,
    }),

  setUploadedImage: (file, previewUrl) =>
    set({
      uploadedImage: file,
      uploadedImageUrl: previewUrl,
      selectedTemplate: null,
    }),

  selectCategory: (category) =>
    set({
      selectedCategory: category,
      fieldSchemas: category.fieldSchemas ?? [],
      fieldValues: {},
      positionMap: {},
    }),

  setFieldValue: (key, value) =>
    set((state) => ({
      fieldValues: { ...state.fieldValues, [key]: value },
    })),

  setPosition: (key, position) =>
    set((state) => {
      const newMap = { ...state.positionMap, [key]: position };
      return {
        positionMap: newMap,
        conflicts: detectConflicts(newMap),
      };
    }),

  addGroupEntry: (groupKey, fieldKeys) =>
    set((state) => {
      const current = (state.fieldValues[groupKey] as Array<Record<string, string | number>>) ?? [];
      const newEntry: Record<string, string | number> = {};
      for (const k of fieldKeys) newEntry[k] = "";
      return { fieldValues: { ...state.fieldValues, [groupKey]: [...current, newEntry] } };
    }),

  removeGroupEntry: (groupKey, index) =>
    set((state) => {
      const current = (state.fieldValues[groupKey] as Array<Record<string, string | number>>) ?? [];
      const updated = current.filter((_, i) => i !== index);
      return { fieldValues: { ...state.fieldValues, [groupKey]: updated } };
    }),

  setGroupFieldValue: (groupKey, index, fieldKey, value) =>
    set((state) => {
      const current = [...((state.fieldValues[groupKey] as Array<Record<string, string | number>>) ?? [])];
      if (!current[index]) current[index] = {};
      current[index] = { ...current[index], [fieldKey]: value };
      return { fieldValues: { ...state.fieldValues, [groupKey]: current } };
    }),

  setPrompt: (prompt) => set({ prompt }),
  setQualityTier: (tier) => set({ qualityTier: tier }),
  setOrientation: (orientation) => set({ orientation }),
  setIsPublic: (isPublic) => set({ isPublic }),

  toggleLanguage: (lang) =>
    set((state) => {
      const current = state.selectedLanguages;
      const isSelected = current.includes(lang);
      if (isSelected) {
        return { selectedLanguages: current.filter((l) => l !== lang) };
      }
      return { selectedLanguages: [...current, lang] };
    }),

  selectAllLanguages: (allLangs) => set({ selectedLanguages: allLangs ? [...allLangs] : [] }),

  deselectAllLanguages: () => set({ selectedLanguages: [] }),

  goToStep: (step) => set({ currentStep: step }),
  nextStep: () => set((s) => ({ currentStep: s.currentStep + 1 })),
  prevStep: () =>
    set((s) => ({ currentStep: Math.max(0, s.currentStep - 1) })),

  submitGeneration: async () => {
    const state = get();
    const isCustomUpload = !state.selectedTemplate && !!state.uploadedImageUrl;

    // Validate required fields before submitting
    if (!isCustomUpload) {
      if (!state.selectedLanguages || state.selectedLanguages.length === 0) {
        set({ errorMessage: "Please select at least one language.", isSubmitting: false });
        return;
      }
      if (!state.selectedCategory) {
        set({ errorMessage: "Please select a category.", isSubmitting: false });
        return;
      }
    }

    if (!state.selectedTemplate && !state.uploadedImageUrl) {
      set({ errorMessage: "Please select a template or upload an image.", isSubmitting: false });
      return;
    }

    set({ isSubmitting: true, errorMessage: null, phase: "processing" });

    try {
      // 1. Upload any local "blob:" logos to the backend first
      const updatedFieldValues = { ...state.fieldValues };

      async function uploadBlobUrl(blobUrl: string): Promise<string> {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        const formData = new FormData();
        formData.append("logo", blob, "logo.png");
        const uploadRes = await apiClient.post<{ success: boolean; data: { url: string } }>(
          "/users/upload-logo",
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        if (uploadRes.data?.data?.url) return uploadRes.data.data.url;
        throw new Error("Upload returned no URL");
      }

      for (const [key, value] of Object.entries(updatedFieldValues)) {
        if (typeof value === "string" && value.startsWith("blob:")) {
          try {
            updatedFieldValues[key] = await uploadBlobUrl(value);
          } catch (err) {
            console.error(`Failed to upload logo for field ${key}`, err);
            throw new Error(`Failed to upload logo. Please try selecting the logo again.`);
          }
        } else if (Array.isArray(value)) {
          // If it's an array of objects (GroupedFieldValues), iterate through them.
          if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
            const updatedGroup = [...(value as Array<Record<string, any>>)];
            for (let i = 0; i < updatedGroup.length; i++) {
              const entry = { ...(updatedGroup[i]) };
              for (const [subKey, subVal] of Object.entries(entry)) {
                if (typeof subVal === "string" && subVal.startsWith("blob:")) {
                  try {
                    entry[subKey] = await uploadBlobUrl(subVal);
                  } catch (err) {
                    console.error(`Failed to upload logo for ${key}[${i}].${subKey}`, err);
                    throw new Error(`Failed to upload image. Please try again.`);
                  }
                }
              }
              updatedGroup[i] = entry;
            }
            updatedFieldValues[key] = updatedGroup;
          } else {
            // It's an array of strings (Single repeatable field)
            const updatedArray = [...(value as string[])];
            for (let i = 0; i < updatedArray.length; i++) {
              if (updatedArray[i].startsWith("blob:")) {
                try {
                  updatedArray[i] = await uploadBlobUrl(updatedArray[i]);
                } catch (err) {
                  console.error(`Failed to upload logo for ${key}[${i}]`, err);
                  throw new Error(`Failed to upload image. Please try again.`);
                }
              }
            }
            updatedFieldValues[key] = updatedArray;
          }
        }
      }

      // 2. Upload user base image to Cloudinary if it's a local blob URL
      let resolvedBaseImageUrl: string | null = state.uploadedImageUrl;
      if (state.uploadedImage && resolvedBaseImageUrl?.startsWith("blob:")) {
        try {
          const imgFormData = new FormData();
          imgFormData.append("baseImage", state.uploadedImage);

          const uploadRes = await apiClient.post<{
            success: boolean;
            data: { url: string; width: number; height: number; warnings: string[] };
          }>("/users/upload-base-image", imgFormData, {
            headers: { "Content-Type": "multipart/form-data" },
          });

          if (uploadRes.data?.data?.url) {
            resolvedBaseImageUrl = uploadRes.data.data.url;
          } else {
            throw new Error("Upload returned no URL");
          }
        } catch (err) {
          const axiosUploadErr = err as { response?: { data?: { message?: string } } };
          throw new Error(
            axiosUploadErr?.response?.data?.message ?? "Failed to upload base image. Please try again."
          );
        }
      }

      // 3. Submit the generation request with remote URLs
      const { data } = await apiClient.post<{
        data: {
          batchId: string;
          creditCost: number;
          generations: Array<{
            id: string;
            language: string;
            status: string;
            resultImageUrl: string | null;
          }>;
        };
      }>(
        "/generations",
        {
          templateId: state.selectedTemplate?.id ?? undefined,
          baseImageUrl: resolvedBaseImageUrl ?? undefined,
          contentType: state.contentType,
          categoryId: isCustomUpload ? undefined : state.selectedCategory?.id,
          qualityTier: state.qualityTier,
          orientation: state.orientation ?? undefined,
          prompt: state.prompt,
          fieldValues: updatedFieldValues,
          positionMap: state.positionMap,
          languages: isCustomUpload 
            ? [getLanguageFromCountry(useAuthStore.getState().user?.country)] 
            : state.selectedLanguages,
          isPublic: state.isPublic,
        },
        {
          headers: {
            "Idempotency-Key": uuidv4(),
          },
        }
      );

      const batch = data.data;
      set({
        batchId: batch.batchId,
        generationId: batch.generations[0]?.id ?? null,
        generationStatus: "PROCESSING",
        creditCost: batch.creditCost,
        batchResults: batch.generations.map((g) => ({
          id: g.id,
          language: g.language,
          status: g.status,
          resultImageUrl: g.resultImageUrl,
        })),
        isSubmitting: false,
        currentStep: 7,
      });
    } catch (error: unknown) {
      let message = "Generation failed";
      // Extract meaningful error from API response
      const axiosErr = error as { response?: { data?: { error?: { message?: string; details?: Record<string, string[]> } } } };
      if (axiosErr?.response?.data?.error) {
        const apiError = axiosErr.response.data.error;
        if (apiError.details && typeof apiError.details === "object") {
          // Zod validation errors — show field-level messages
          const fieldErrors = Object.entries(apiError.details)
            .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(", ")}`)
            .join("; ");
          message = fieldErrors || apiError.message || message;
        } else {
          message = apiError.message || message;
        }
      } else if (error instanceof Error) {
        message = error.message;
      }
      set({ errorMessage: message, isSubmitting: false, phase: "failed" });
      throw new Error(message);
    }
  },

  reset: () => set(initialState),
}));

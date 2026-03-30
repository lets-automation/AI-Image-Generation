import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ─── Default Admin User ─────────────────────────────────
  const adminPasswordHash = await bcrypt.hash("Admin@123456", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@epproduct.com" },
    update: {},
    create: {
      email: "admin@epproduct.com",
      passwordHash: adminPasswordHash,
      name: "Super Admin",
      role: "SUPER_ADMIN",
      isActive: true,
      emailVerified: true,
    },
  });
  console.log(`Admin user created: ${admin.email}`);

  // ─── Sample Categories ──────────────────────────────────
  const categories = [
    {
      name: "Business",
      slug: "business",
      contentType: "EVENT" as const,
      description: "Business and corporate event creatives",
    },
    {
      name: "Education",
      slug: "education",
      contentType: "EVENT" as const,
      description: "Educational institution creatives",
    },
    {
      name: "Medical",
      slug: "medical",
      contentType: "EVENT" as const,
      description: "Healthcare and medical creatives",
    },
    {
      name: "Festival Greetings",
      slug: "festival-greetings",
      contentType: "POSTER" as const,
      description: "Festival greeting and wishes posters",
    },
    {
      name: "Social Media",
      slug: "social-media",
      contentType: "POSTER" as const,
      description: "Social media post designs",
    },
  ];

  for (const cat of categories) {
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });

    // Add field schemas for Business category as example
    if (cat.slug === "business") {
      const fields = [
        {
          fieldKey: "business_name",
          label: "Business Name",
          fieldType: "TEXT" as const,
          isRequired: true,
          sortOrder: 1,
          placeholder: "Enter your business name",
          hasPosition: true,
        },
        {
          fieldKey: "phone_number",
          label: "Phone Number",
          fieldType: "PHONE" as const,
          isRequired: false,
          sortOrder: 2,
          placeholder: "+91 9876543210",
          hasPosition: true,
        },
        {
          fieldKey: "logo",
          label: "Business Logo",
          fieldType: "IMAGE" as const,
          isRequired: false,
          sortOrder: 3,
          hasPosition: true,
          validation: JSON.stringify({
            maxFileSize: 5242880,
            allowedFormats: ["image/png", "image/svg+xml", "image/webp"],
          }),
        },
      ];

      for (const field of fields) {
        await prisma.fieldSchema.upsert({
          where: {
            categoryId_fieldKey: {
              categoryId: created.id,
              fieldKey: field.fieldKey,
            },
          },
          update: field,
          create: {
            categoryId: created.id,
            ...field,
          },
        });
      }
    }

    // Add field schemas for Education category
    if (cat.slug === "education") {
      const fields = [
        {
          fieldKey: "institute_name",
          label: "Institute Name",
          fieldType: "TEXT" as const,
          isRequired: true,
          sortOrder: 1,
          placeholder: "Enter institute name",
          hasPosition: true,
        },
        {
          fieldKey: "phone_number",
          label: "Phone Number",
          fieldType: "PHONE" as const,
          isRequired: false,
          sortOrder: 2,
          placeholder: "+91 9876543210",
          hasPosition: true,
        },
      ];

      for (const field of fields) {
        await prisma.fieldSchema.upsert({
          where: {
            categoryId_fieldKey: {
              categoryId: created.id,
              fieldKey: field.fieldKey,
            },
          },
          update: field,
          create: {
            categoryId: created.id,
            ...field,
          },
        });
      }
    }

    // Add field schemas for Medical category
    if (cat.slug === "medical") {
      const fields = [
        {
          fieldKey: "clinic_name",
          label: "Clinic Name",
          fieldType: "TEXT" as const,
          isRequired: true,
          sortOrder: 1,
          placeholder: "Enter clinic name",
          hasPosition: true,
        },
        {
          fieldKey: "doctor_name",
          label: "Doctor Name",
          fieldType: "TEXT" as const,
          isRequired: false,
          sortOrder: 2,
          placeholder: "Dr. Name",
          hasPosition: true,
        },
        {
          fieldKey: "phone_number",
          label: "Phone Number",
          fieldType: "PHONE" as const,
          isRequired: false,
          sortOrder: 3,
          placeholder: "+91 9876543210",
          hasPosition: true,
        },
      ];

      for (const field of fields) {
        await prisma.fieldSchema.upsert({
          where: {
            categoryId_fieldKey: {
              categoryId: created.id,
              fieldKey: field.fieldKey,
            },
          },
          update: field,
          create: {
            categoryId: created.id,
            ...field,
          },
        });
      }
    }
  }
  console.log(`${categories.length} categories seeded with field schemas`);

  // ─── Model Pricing ──────────────────────────────────────
  // ALL tiers use AI generation. The template is a style reference —
  // the AI generates a new poster matching the style, with text/logo
  // artistically integrated. Model, quality, and size are configured
  // per-tier and can be changed by admins via the admin UI.

  // Clean up stale entries from previous seeds
  await prisma.modelPricing.deleteMany({});
  console.log("Cleared old model pricing entries");

  const modelPricing = [
    // ═══════════════════════════════════════════════════════
    // BASIC tier — fast AI generation, budget-friendly
    // ═══════════════════════════════════════════════════════

    // OpenAI: primary (priority 0)
    {
      qualityTier: "BASIC" as const,
      providerName: "openai",
      modelId: "gpt-image-1-mini",
      creditCost: 5,
      priority: 0,
      config: JSON.stringify({ model: "gpt-image-1-mini", quality: "low", size: "1024x1024", costCents: 4 }),
    },
    // Ideogram: fallback (priority 1) — V_3 fast + accurate text rendering
    {
      qualityTier: "BASIC" as const,
      providerName: "ideogram",
      modelId: "V_3",
      creditCost: 5,
      priority: 1,
      config: JSON.stringify({ style_type: "DESIGN", image_weight: 50, costCents: 4 }),
    },

    // ═══════════════════════════════════════════════════════
    // STANDARD tier — balanced quality & detail
    // ═══════════════════════════════════════════════════════

    // Ideogram: primary (priority 0) — V_3 best text rendering
    {
      qualityTier: "STANDARD" as const,
      providerName: "ideogram",
      modelId: "V_3",
      creditCost: 15,
      priority: 0,
      config: JSON.stringify({ style_type: "DESIGN", image_weight: 50, costCents: 8 }),
    },
    // OpenAI: fallback (priority 1)
    {
      qualityTier: "STANDARD" as const,
      providerName: "openai",
      modelId: "gpt-image-1",
      creditCost: 15,
      priority: 1,
      config: JSON.stringify({ model: "gpt-image-1", quality: "medium", size: "1536x1024", costCents: 8 }),
    },

    // ═══════════════════════════════════════════════════════
    // PREMIUM tier — highest quality AI generation
    // ═══════════════════════════════════════════════════════

    // OpenAI: primary (priority 0) — gpt-image-1.5 is highest quality
    {
      qualityTier: "PREMIUM" as const,
      providerName: "openai",
      modelId: "gpt-image-1.5",
      creditCost: 30,
      priority: 0,
      config: JSON.stringify({ model: "gpt-image-1.5", quality: "high", size: "1792x1024", costCents: 17 }),
    },
    // Ideogram: fallback (priority 1) — V_3 with high image weight for premium feel
    {
      qualityTier: "PREMIUM" as const,
      providerName: "ideogram",
      modelId: "V_3",
      creditCost: 30,
      priority: 1,
      config: JSON.stringify({ style_type: "DESIGN", image_weight: 65, costCents: 8 }),
    },
  ];

  for (const pricing of modelPricing) {
    await prisma.modelPricing.create({
      data: pricing,
    });
  }
  console.log(`${modelPricing.length} model pricing entries seeded`);

  // ─── System Config ──────────────────────────────────────
  const configs = [
    { key: "daily_ai_budget_cents", value: JSON.stringify(10000) }, // $100/day
    { key: "daily_generation_cap", value: JSON.stringify(50) },
    { key: "generation_cooldown_seconds", value: JSON.stringify(10) },
    { key: "cost_warning_threshold_percent", value: JSON.stringify(70) },
    { key: "cost_critical_threshold_percent", value: JSON.stringify(90) },
    { key: "cost_emergency_threshold_percent", value: JSON.stringify(100) },
    { key: "festival_default_visibility_days", value: JSON.stringify(7) },
    { key: "generation_enabled", value: JSON.stringify(true) },
  ];

  for (const cfg of configs) {
    await prisma.systemConfig.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value },
      create: cfg,
    });
  }
  console.log(`${configs.length} system config entries seeded`);

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

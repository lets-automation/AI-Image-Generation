-- Video generation support: add JobType enum, video result fields, and a (userId, jobType) index
-- for the /videos tab query. All existing rows are IMAGE by default — no backfill needed.

CREATE TYPE "JobType" AS ENUM ('IMAGE', 'VIDEO');

ALTER TABLE "generations"
  ADD COLUMN "jobType"             "JobType" NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN "videoDurationSec"    INTEGER,
  ADD COLUMN "videoResolution"     TEXT,
  ADD COLUMN "resultVideoUrl"      TEXT,
  ADD COLUMN "resultVideoPublicId" TEXT;

CREATE INDEX "generations_userId_jobType_idx" ON "generations"("userId", "jobType");

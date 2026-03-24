-- CreateTable
CREATE TABLE "festival_categories" (
    "id" TEXT NOT NULL,
    "festivalId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "promotionStartDays" INTEGER,
    "promotionEndDays" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "festival_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "festival_categories_categoryId_idx" ON "festival_categories"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "festival_categories_festivalId_categoryId_key" ON "festival_categories"("festivalId", "categoryId");

-- AddForeignKey
ALTER TABLE "festival_categories" ADD CONSTRAINT "festival_categories_festivalId_fkey" FOREIGN KEY ("festivalId") REFERENCES "festival_calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "festival_categories" ADD CONSTRAINT "festival_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

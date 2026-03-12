-- CreateTable: custom_roles
CREATE TABLE "custom_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique name for custom_roles
CREATE UNIQUE INDEX "custom_roles_name_key" ON "custom_roles"("name");

-- AlterTable: add customRoleId to users
ALTER TABLE "users" ADD COLUMN "customRoleId" TEXT;

-- CreateIndex: index on users.customRoleId
CREATE INDEX "users_customRoleId_idx" ON "users"("customRoleId");

-- AddForeignKey: users.customRoleId -> custom_roles.id
ALTER TABLE "users" ADD CONSTRAINT "users_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add parentId to categories
ALTER TABLE "categories" ADD COLUMN "parentId" TEXT;

-- CreateIndex: index on categories.parentId
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- AddForeignKey: categories.parentId -> categories.id (self-referential)
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add orientation to generations
ALTER TABLE "generations" ADD COLUMN "orientation" TEXT;

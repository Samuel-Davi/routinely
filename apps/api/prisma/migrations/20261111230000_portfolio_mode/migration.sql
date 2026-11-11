-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AiGlobalUsage" (
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiGlobalUsage_pkey" PRIMARY KEY ("day")
);


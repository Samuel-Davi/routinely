-- AlterTable
ALTER TABLE "FixedCommitment" ADD COLUMN     "requiresTravel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Preferences" ADD COLUMN     "travelMinutes" INTEGER NOT NULL DEFAULT 60;

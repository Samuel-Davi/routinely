-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "commitmentId" UUID;

-- CreateIndex
CREATE INDEX "Task_commitmentId_idx" ON "Task"("commitmentId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "FixedCommitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

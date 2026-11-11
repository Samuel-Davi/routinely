-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'SCHEDULED', 'DONE');

-- CreateEnum
CREATE TYPE "EstimationStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "EstimationSource" AS ENUM ('AI', 'MANUAL', 'HEURISTIC');

-- CreateEnum
CREATE TYPE "RoutineStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "RoutineSource" AS ENUM ('AI', 'AI_REPAIRED', 'HEURISTIC');

-- CreateEnum
CREATE TYPE "RoutineTrigger" AS ENUM ('GENERATE', 'REPLAN', 'RESTORE');

-- CreateEnum
CREATE TYPE "CommitmentCategory" AS ENUM ('WORK', 'STUDY', 'HEALTH', 'PERSONAL', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scheduleChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedCommitment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "category" "CommitmentCategory" NOT NULL DEFAULT 'OTHER',
    "color" TEXT NOT NULL DEFAULT 'blue',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FixedCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "complexity" INTEGER,
    "estimatedMinutes" INTEGER,
    "splittable" BOOLEAN,
    "aiRationale" TEXT,
    "estimationStatus" "EstimationStatus" NOT NULL DEFAULT 'PENDING',
    "estimationSource" "EstimationSource",
    "planChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preferences" (
    "userId" UUID NOT NULL,
    "dayStart" TEXT NOT NULL DEFAULT '07:00',
    "dayEnd" TEXT NOT NULL DEFAULT '22:00',
    "maxFocusBlockMinutes" INTEGER NOT NULL DEFAULT 90,
    "minBreakMinutes" INTEGER NOT NULL DEFAULT 15,
    "lunchStart" TEXT NOT NULL DEFAULT '12:00',
    "lunchEnd" TEXT NOT NULL DEFAULT '13:00',
    "timezone" TEXT NOT NULL DEFAULT 'America/Manaus',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Routine" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RoutineStatus" NOT NULL DEFAULT 'PENDING',
    "source" "RoutineSource",
    "trigger" "RoutineTrigger" NOT NULL DEFAULT 'GENERATE',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "rangeStart" TEXT NOT NULL,
    "rangeEnd" TEXT NOT NULL,
    "diffSummary" JSONB,
    "unscheduled" JSONB NOT NULL DEFAULT '[]',
    "notice" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineBlock" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "routineId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "start" TIMESTAMPTZ(3) NOT NULL,
    "end" TIMESTAMPTZ(3) NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMPTZ(3),
    "rationale" TEXT,

    CONSTRAINT "RoutineBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateCache" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "complexity" INTEGER NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "splittable" BOOLEAN NOT NULL,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixedCommitment_userId_idx" ON "FixedCommitment"("userId");

-- CreateIndex
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");

-- CreateIndex
CREATE INDEX "Task_userId_deadline_idx" ON "Task"("userId", "deadline");

-- CreateIndex
CREATE INDEX "Routine_userId_active_idx" ON "Routine"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Routine_userId_version_key" ON "Routine"("userId", "version");

-- CreateIndex
CREATE INDEX "RoutineBlock_routineId_start_idx" ON "RoutineBlock"("routineId", "start");

-- CreateIndex
CREATE INDEX "RoutineBlock_taskId_idx" ON "RoutineBlock"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateCache_userId_hash_key" ON "EstimateCache"("userId", "hash");

-- AddForeignKey
ALTER TABLE "FixedCommitment" ADD CONSTRAINT "FixedCommitment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preferences" ADD CONSTRAINT "Preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineBlock" ADD CONSTRAINT "RoutineBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineBlock" ADD CONSTRAINT "RoutineBlock_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineBlock" ADD CONSTRAINT "RoutineBlock_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateCache" ADD CONSTRAINT "EstimateCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

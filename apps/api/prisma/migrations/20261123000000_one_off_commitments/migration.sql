-- One-off commitments: a date in the user's timezone; null keeps the weekly behaviour.
ALTER TABLE "FixedCommitment" ADD COLUMN "date" TEXT;

CREATE INDEX IF NOT EXISTS "VoteEvent_source_voterId_createdAt_idx"
ON "VoteEvent"("source", "voterId", "createdAt" DESC);

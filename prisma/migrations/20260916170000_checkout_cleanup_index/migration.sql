-- CreateIndex
CREATE INDEX "checkout_idempotencies_state_completed_cleanup_idx" ON "checkout_idempotencies"("state", "completed_at");

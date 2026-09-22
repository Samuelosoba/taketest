ALTER TABLE `Exam` ADD COLUMN `cameraRequired` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `ExamAttempt` ADD COLUMN `lastSeenAt` DATETIME(3) NULL,
    ADD COLUMN `disconnectedAt` DATETIME(3) NULL;
ALTER TABLE `ExamViolation` ADD COLUMN `clientEventId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `ExamViolation_clientEventId_key` ON `ExamViolation`(`clientEventId`);
CREATE INDEX `ExamViolation_attemptId_createdAt_idx` ON `ExamViolation`(`attemptId`, `createdAt`);
CREATE INDEX `ExamAttempt_status_lastSeenAt_idx` ON `ExamAttempt`(`status`, `lastSeenAt`);

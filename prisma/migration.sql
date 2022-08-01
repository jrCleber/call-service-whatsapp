-- CreateTable
CREATE TABLE `CallCenter` (
    `callCenterId` INTEGER NOT NULL AUTO_INCREMENT,
    `presentation` VARCHAR(1000) NOT NULL,
    `botName` VARCHAR(50) NOT NULL,
    `phoneNumber` VARCHAR(25) NOT NULL,
    `url` VARCHAR(200) NULL,
    `companyName` VARCHAR(150) NOT NULL,
    `createAt` VARCHAR(14) NOT NULL,
    `loggedAt` VARCHAR(14) NULL,
    `updateAt` VARCHAR(14) NULL,
    `operation` JSON NOT NULL,

    UNIQUE INDEX `CallCenter_phoneNumber_key`(`phoneNumber`),
    PRIMARY KEY (`callCenterId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanySector` (
    `sectorId` INTEGER NOT NULL AUTO_INCREMENT,
    `sector` VARCHAR(30) NOT NULL,
    `callCenterId` INTEGER NOT NULL,

    PRIMARY KEY (`sectorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `customerId` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NULL,
    `pushName` VARCHAR(200) NOT NULL,
    `profilePictureUrl` VARCHAR(500) NULL,
    `wuid` VARCHAR(150) NOT NULL,
    `phoneNumber` VARCHAR(25) NOT NULL,
    `otherPhones` JSON NULL,
    `createAt` VARCHAR(14) NOT NULL,
    `updateAt` VARCHAR(14) NULL,

    UNIQUE INDEX `Customer_wuid_phoneNumber_key`(`wuid`, `phoneNumber`),
    PRIMARY KEY (`customerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendant` (
    `attendantId` INTEGER NOT NULL AUTO_INCREMENT,
    `shortName` VARCHAR(50) NOT NULL,
    `fullName` VARCHAR(150) NULL,
    `phoneNumber` VARCHAR(25) NOT NULL,
    `wuid` VARCHAR(150) NOT NULL,
    `email` VARCHAR(200) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `manager` BOOLEAN NOT NULL DEFAULT false,
    `createAt` VARCHAR(14) NOT NULL,
    `updateAt` VARCHAR(14) NULL,
    `companySectorId` INTEGER NOT NULL,
    `callCenterId` INTEGER NOT NULL,

    UNIQUE INDEX `Attendant_wuid_email_phoneNumber_key`(`wuid`, `email`, `phoneNumber`),
    PRIMARY KEY (`attendantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageWA` (
    `messageId` INTEGER NOT NULL AUTO_INCREMENT,
    `header` JSON NOT NULL,
    `body` JSON NOT NULL,
    `sender` ENUM('C', 'A') NOT NULL,
    `wuid` VARCHAR(150) NOT NULL,
    `senderAt` VARCHAR(14) NOT NULL,
    `transactionId` INTEGER NOT NULL,

    PRIMARY KEY (`messageId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transaction` (
    `transactionId` INTEGER NOT NULL AUTO_INCREMENT,
    `subject` JSON NULL,
    `status` ENUM('ACTIVE', 'PROCESSING', 'FINISHED') NOT NULL DEFAULT 'ACTIVE',
    `initiated` VARCHAR(14) NOT NULL,
    `startProcessing` VARCHAR(14) NULL,
    `finished` VARCHAR(14) NULL,
    `protocol` VARCHAR(100) NULL,
    `finisher` ENUM('C', 'A') NULL,
    `customerId` INTEGER NOT NULL,
    `attendantId` INTEGER NULL,
    `sectorId` INTEGER NULL,

    UNIQUE INDEX `Transaction_protocol_key`(`protocol`),
    PRIMARY KEY (`transactionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatStage` (
    `stageId` INTEGER NOT NULL AUTO_INCREMENT,
    `wuid` VARCHAR(150) NOT NULL,
    `stage` ENUM('initialChat', 'setName', 'checkSector', 'setSubject', 'transaction', 'finishedChat') NOT NULL DEFAULT 'initialChat',
    `customerId` INTEGER NULL,

    UNIQUE INDEX `ChatStage_wuid_key`(`wuid`),
    UNIQUE INDEX `ChatStage_customerId_key`(`customerId`),
    PRIMARY KEY (`stageId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CompanySector` ADD CONSTRAINT `CompanySector_callCenterId_fkey` FOREIGN KEY (`callCenterId`) REFERENCES `CallCenter`(`callCenterId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendant` ADD CONSTRAINT `Attendant_companySectorId_fkey` FOREIGN KEY (`companySectorId`) REFERENCES `CompanySector`(`sectorId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendant` ADD CONSTRAINT `Attendant_callCenterId_fkey` FOREIGN KEY (`callCenterId`) REFERENCES `CallCenter`(`callCenterId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageWA` ADD CONSTRAINT `MessageWA_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `Transaction`(`transactionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`customerId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_attendantId_fkey` FOREIGN KEY (`attendantId`) REFERENCES `Attendant`(`attendantId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_sectorId_fkey` FOREIGN KEY (`sectorId`) REFERENCES `CompanySector`(`sectorId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatStage` ADD CONSTRAINT `ChatStage_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`customerId`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `amenity_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`placeId` varchar(255) NOT NULL,
	`cafeName` varchar(500) NOT NULL,
	`wifiSpeedMbps` int,
	`powerOutlets` enum('unknown','none','some','many') NOT NULL DEFAULT 'unknown',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `amenity_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `amenity_reports_user_place_idx` UNIQUE(`userId`,`placeId`)
);
--> statement-breakpoint
ALTER TABLE `amenity_reports` ADD CONSTRAINT `amenity_reports_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizerConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL,
    "zoneX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zoneY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zoneWidth" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "zoneHeight" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "zoneAngle" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowedFonts" TEXT,
    "allowedColors" TEXT,
    "maxLength" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "shop" TEXT NOT NULL,
    "price2Lines" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "price3Lines" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "priceImage" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "defaultFonts" TEXT NOT NULL DEFAULT '["Arial", "Times New Roman", "Courier New"]',
    "defaultColors" TEXT NOT NULL DEFAULT '["#000000", "#FFFFFF", "#FF0000", "#0000FF", "#FFD700"]',
    "frameSizes" TEXT NOT NULL DEFAULT '[]',
    "addonProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalizerConfig_shop_productId_key" ON "PersonalizerConfig"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalSettings_shop_key" ON "GlobalSettings"("shop");

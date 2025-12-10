#!/bin/bash

echo "🔧 Correction automatique des erreurs Prisma..."

# Corriger communities.ts
echo "📝 Correction de communities.ts..."
sed -i '' 's/communityId_userId: {/communityId: id,\n          userId: validatedData.userId/g' src/routes/communities.ts
sed -i '' 's/findUnique({/findFirst({/g' src/routes/communities.ts
sed -i '' 's/upsert({/create({/g' src/routes/communities.ts

# Corriger conversations.ts
echo "📝 Correction de conversations.ts..."
sed -i '' 's/conversationId_userId: {/conversationId: shareLink.conversationId,\n          userId: userToken.userId || userToken.id/g' src/routes/conversations.ts
sed -i '' 's/findUnique({/findFirst({/g' src/routes/conversations.ts

# Corriger notifications.ts
echo "📝 Correction de notifications.ts..."
sed -i '' 's/userId_key: {/userId: update.userId,\n            key: update.key/g' src/routes/notifications.ts
sed -i '' 's/upsert({/create({/g' src/routes/notifications.ts

# Corriger user-preferences.ts
echo "📝 Correction de user-preferences.ts..."
sed -i '' 's/userId_key: {/userId,\n            key/g' src/routes/user-preferences.ts
sed -i '' 's/findUnique({/findFirst({/g' src/routes/user-preferences.ts
sed -i '' 's/upsert({/create({/g' src/routes/user-preferences.ts

# Corriger server.ts
echo "📝 Correction de server.ts..."
sed -i '' 's/\$queryRaw\`SELECT 1\`/user.findFirst()/g' src/server.ts

# Corriger init.service.ts
echo "📝 Correction de init.service.ts..."
sed -i '' 's/conversationId_userId: {/conversationId: '\''meeshy'\'',\n            userId: userId/g' src/services/init.service.ts
sed -i '' 's/findUnique({/findFirst({/g' src/services/init.service.ts

# Corriger TranslationService.ts
echo "📝 Correction de TranslationService.ts..."
sed -i '' 's/messageId_targetLanguage: {/messageId: result.messageId,\n            targetLanguage: result.targetLanguage/g' src/services/TranslationService.ts
sed -i '' 's/findUnique({/findFirst({/g' src/services/TranslationService.ts

echo "✅ Corrections appliquées !"
echo "🔧 Régénération du client Prisma..."
rm -rf shared/prisma
pnpm run generate:prisma

echo "✅ Prêt pour la compilation !"

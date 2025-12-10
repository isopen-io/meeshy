#!/bin/bash
# Script pour vérifier les doublons de participants "meeshy" dans la base de données

echo "🔍 Vérification des doublons de participants pour la conversation 'meeshy'..."
echo ""

# Se placer dans le répertoire gateway pour accéder au schema Prisma
cd "$(dirname "$0")/../gateway" || exit 1

# 1. Trouver la conversation meeshy
echo "📊 Recherche de la conversation 'meeshy'..."
CONVERSATION=$(npx prisma db execute \
  --stdin \
  --schema=./shared/prisma/schema.prisma <<EOF
SELECT id, identifier, title, type FROM "Conversation" 
WHERE identifier = 'meeshy' OR title = 'Meeshy' 
LIMIT 1;
EOF
)

echo "$CONVERSATION"
echo ""

# Extraire l'ID de la conversation (supposons que c'est la première ligne de résultat)
# Note: Cette partie dépend de votre configuration PostgreSQL
# Vous devrez peut-être ajuster selon votre environnement

# 2. Récupérer les membres authentifiés
echo "📊 Membres authentifiés de la conversation 'meeshy':"
npx prisma db execute \
  --stdin \
  --schema=./shared/prisma/schema.prisma <<EOF
SELECT 
  cm.id as member_id,
  cm.role as conversation_role,
  u.id as user_id,
  u.username,
  u.displayName,
  u.email,
  u.role as user_role
FROM "ConversationMember" cm
INNER JOIN "User" u ON cm.userId = u.id
WHERE cm.conversationId IN (
  SELECT id FROM "Conversation" 
  WHERE identifier = 'meeshy' OR title = 'Meeshy'
)
AND cm.isActive = true
ORDER BY u.username;
EOF

echo ""

# 3. Récupérer les participants anonymes
echo "📊 Participants anonymes de la conversation 'meeshy':"
npx prisma db execute \
  --stdin \
  --schema=./shared/prisma/schema.prisma <<EOF
SELECT 
  id,
  username,
  firstName,
  lastName,
  language,
  isOnline,
  joinedAt
FROM "AnonymousParticipant"
WHERE conversationId IN (
  SELECT id FROM "Conversation" 
  WHERE identifier = 'meeshy' OR title = 'Meeshy'
)
AND isActive = true
ORDER BY username;
EOF

echo ""

# 4. Vérifier les doublons de username
echo "🔎 Vérification des doublons de username (membres authentifiés):"
npx prisma db execute \
  --stdin \
  --schema=./shared/prisma/schema.prisma <<EOF
SELECT 
  u.username,
  COUNT(*) as count,
  array_agg(u.id) as user_ids
FROM "ConversationMember" cm
INNER JOIN "User" u ON cm.userId = u.id
WHERE cm.conversationId IN (
  SELECT id FROM "Conversation" 
  WHERE identifier = 'meeshy' OR title = 'Meeshy'
)
AND cm.isActive = true
GROUP BY u.username
HAVING COUNT(*) > 1;
EOF

echo ""

# 5. Vérifier les doublons d'ID utilisateur
echo "🔎 Vérification des doublons d'ID utilisateur (membres authentifiés):"
npx prisma db execute \
  --stdin \
  --schema=./shared/prisma/schema.prisma <<EOF
SELECT 
  u.id,
  u.username,
  COUNT(*) as count
FROM "ConversationMember" cm
INNER JOIN "User" u ON cm.userId = u.id
WHERE cm.conversationId IN (
  SELECT id FROM "Conversation" 
  WHERE identifier = 'meeshy' OR title = 'Meeshy'
)
AND cm.isActive = true
GROUP BY u.id, u.username
HAVING COUNT(*) > 1;
EOF

echo ""
echo "✅ Vérification terminée!"


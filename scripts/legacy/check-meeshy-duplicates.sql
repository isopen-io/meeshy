-- Script SQL pour vérifier les doublons de participants dans la conversation "meeshy"
-- À exécuter directement dans votre client PostgreSQL

-- 1. Trouver la conversation meeshy
SELECT 'Conversation Meeshy:' as info;
SELECT id, identifier, title, type 
FROM "Conversation" 
WHERE identifier = 'meeshy' OR title = 'Meeshy';

-- 2. Compter les membres authentifiés
SELECT 'Membres authentifiés:' as info;
SELECT 
  COUNT(DISTINCT cm.id) as total_members,
  COUNT(DISTINCT u.id) as unique_users
FROM "ConversationMember" cm
INNER JOIN "User" u ON cm.userId = u.id
WHERE cm.conversationId IN (
  SELECT id FROM "Conversation" 
  WHERE identifier = 'meeshy' OR title = 'Meeshy'
)
AND cm.isActive = true;

-- 3. Lister tous les membres authentifiés
SELECT 'Liste des membres authentifiés:' as info;
SELECT 
  u.username,
  u.displayName,
  u.email,
  cm.role as conversation_role,
  u.role as user_role,
  u.id as user_id,
  cm.id as member_id
FROM "ConversationMember" cm
INNER JOIN "User" u ON cm.userId = u.id
WHERE cm.conversationId IN (
  SELECT id FROM "Conversation" 
  WHERE identifier = 'meeshy' OR title = 'Meeshy'
)
AND cm.isActive = true
ORDER BY u.username;

-- 4. Vérifier les doublons de username (membres authentifiés)
SELECT 'Doublons de username (membres authentifiés):' as info;
SELECT 
  u.username,
  COUNT(*) as count,
  array_agg(DISTINCT u.id) as user_ids,
  array_agg(DISTINCT cm.id) as member_ids
FROM "ConversationMember" cm
INNER JOIN "User" u ON cm.userId = u.id
WHERE cm.conversationId IN (
  SELECT id FROM "Conversation" 
  WHERE identifier = 'meeshy' OR title = 'Meeshy'
)
AND cm.isActive = true
GROUP BY u.username
HAVING COUNT(*) > 1;

-- 5. Vérifier les doublons d'ID utilisateur (plusieurs entrées ConversationMember pour le même user)
SELECT 'Doublons d\'ID utilisateur (plusieurs entrées ConversationMember):' as info;
SELECT 
  u.id,
  u.username,
  COUNT(*) as member_count,
  array_agg(cm.id) as member_ids
FROM "ConversationMember" cm
INNER JOIN "User" u ON cm.userId = u.id
WHERE cm.conversationId IN (
  SELECT id FROM "Conversation" 
  WHERE identifier = 'meeshy' OR title = 'Meeshy'
)
AND cm.isActive = true
GROUP BY u.id, u.username
HAVING COUNT(*) > 1;

-- 6. Lister les participants anonymes
SELECT 'Participants anonymes:' as info;
SELECT 
  COUNT(*) as total_anonymous
FROM "AnonymousParticipant"
WHERE conversationId IN (
  SELECT id FROM "Conversation" 
  WHERE identifier = 'meeshy' OR title = 'Meeshy'
)
AND isActive = true;

SELECT 'Liste des participants anonymes:' as info;
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

-- 7. Vérifier si un même username existe à la fois comme membre authentifié ET anonyme
SELECT 'Usernames présents à la fois comme membre authentifié ET anonyme:' as info;
SELECT 
  auth.username,
  'Authentifié' as type,
  auth.user_id as id
FROM (
  SELECT DISTINCT u.username, u.id as user_id
  FROM "ConversationMember" cm
  INNER JOIN "User" u ON cm.userId = u.id
  WHERE cm.conversationId IN (
    SELECT id FROM "Conversation" 
    WHERE identifier = 'meeshy' OR title = 'Meeshy'
  )
  AND cm.isActive = true
) auth
WHERE auth.username IN (
  SELECT username 
  FROM "AnonymousParticipant"
  WHERE conversationId IN (
    SELECT id FROM "Conversation" 
    WHERE identifier = 'meeshy' OR title = 'Meeshy'
  )
  AND isActive = true
)
UNION ALL
SELECT 
  anon.username,
  'Anonyme' as type,
  anon.id
FROM "AnonymousParticipant" anon
WHERE anon.conversationId IN (
  SELECT id FROM "Conversation" 
  WHERE identifier = 'meeshy' OR title = 'Meeshy'
)
AND anon.isActive = true
AND anon.username IN (
  SELECT DISTINCT u.username
  FROM "ConversationMember" cm
  INNER JOIN "User" u ON cm.userId = u.id
  WHERE cm.conversationId IN (
    SELECT id FROM "Conversation" 
    WHERE identifier = 'meeshy' OR title = 'Meeshy'
  )
  AND cm.isActive = true
)
ORDER BY username, type;


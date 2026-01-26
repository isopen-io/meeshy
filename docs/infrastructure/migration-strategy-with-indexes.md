# Stratégie de Migration MongoDB → Prisma (AVEC Index de Performance)

**Date:** 2026-01-26 21:55 UTC
**Mise à jour:** Ajout étape création des index de performance
**Référence:** Optimisations conversations (10-40x plus rapide)

---

## 🚨 IMPORTANT: Ordre de Migration Corrigé

Le plan original manquait une étape **CRITIQUE** : la création des index de performance MongoDB.

### ❌ Ancien ordre (INCOMPLET)
```
1. Backup production
2. Restauration dans staging
3. Migration des données
4. Validation
5. Redémarrage services
```

### ✅ Nouvel ordre (COMPLET)
```
1. Backup production
2. Restauration dans staging
3. Migration des données
4. **CRÉATION DES INDEX DE PERFORMANCE** ← NOUVEAU
5. Validation
6. Redémarrage services
```

---

## 📋 Étapes de Migration Complètes

### ÉTAPE 1: BACKUP PRODUCTION
```bash
ssh root@meeshy.me "docker exec meeshy-database mongodump \
  --db=meeshy \
  --out=/dump/backup-pre-staging-20260126 \
  --quiet"
```

### ÉTAPE 2: RESTAURATION DANS STAGING
```bash
ssh root@meeshy.me "docker exec meeshy-database-staging mongorestore \
  --db=meeshy-staging \
  --drop \
  /dump/backup-pre-staging-20260126/meeshy \
  --quiet"
```

### ÉTAPE 3: MIGRATION DES DONNÉES
```bash
# Dry-run d'abord
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose exec -T gateway \
  tsx /app/migrations/migrate-from-legacy.ts --dry-run"

# Si OK, migration réelle
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose exec -T gateway \
  tsx /app/migrations/migrate-from-legacy.ts"
```

### ÉTAPE 4: CRÉATION DES INDEX DE PERFORMANCE ⚡
**🚨 CRITIQUE - Sans cette étape, les performances seront catastrophiques !**

```bash
# Copier le script d'index vers le serveur
scp infrastructure/scripts/mongodb-add-conversation-indexes.js \
  root@meeshy.me:/opt/meeshy/staging/infrastructure/scripts/

# Exécuter le script d'index
ssh root@meeshy.me "docker exec -i meeshy-database-staging \
  mongosh meeshy-staging < /opt/meeshy/staging/infrastructure/scripts/mongodb-add-conversation-indexes.js"
```

**Index créés (6 au total) :**

#### P0 - CRITIQUES
1. `idx_member_user_active_conv` sur ConversationMember
   - Champs: `{userId: 1, isActive: 1, conversationId: 1}`
   - Impact: -50% sur conversationsQuery

2. `idx_message_conv_notdeleted_created` sur Message
   - Champs: `{conversationId: 1, isDeleted: 1, createdAt: -1}`
   - Impact: -40% sur lastMessage lookup

#### P1 - IMPORTANTS
3. `idx_conversation_active_lastmsg` sur Conversation
   - Champs: `{isActive: 1, lastMessageAt: -1}`
   - Impact: -20% sur le tri

4. `idx_cursor_user_conv` sur ConversationReadCursor
   - Champs: `{userId: 1, conversationId: 1}`
   - Impact: -50% sur unreadCounts

5. `idx_userprefs_user_conv` sur UserConversationPreferences
   - Champs: `{userId: 1, conversationId: 1}`
   - Impact: -30% sur userPreferences lookup

#### P2 - OPTIONNELS
6. `idx_conversation_type_active_lastmsg` sur Conversation
   - Champs: `{type: 1, isActive: 1, lastMessageAt: -1}`
   - Impact: -10% avec filtre type

**Amélioration totale attendue:** 10-40x plus rapide
**Temps de création:** 1-5 minutes pour petites DB (<1M docs)

### ÉTAPE 5: VÉRIFICATION DES INDEX
```bash
# Vérifier que tous les index sont créés
ssh root@meeshy.me "docker exec meeshy-database-staging mongosh meeshy-staging --eval \"
  print('ConversationMember indexes:');
  db.ConversationMember.getIndexes().forEach(idx => print('  - ' + idx.name));
  print('');
  print('Message indexes:');
  db.Message.getIndexes().forEach(idx => print('  - ' + idx.name));
  print('');
  print('Conversation indexes:');
  db.Conversation.getIndexes().forEach(idx => print('  - ' + idx.name));
\""
```

**Output attendu:**
```
ConversationMember indexes:
  - _id_
  - idx_member_user_active_conv
Message indexes:
  - _id_
  - idx_message_conv_notdeleted_created
Conversation indexes:
  - _id_
  - idx_conversation_active_lastmsg
  - idx_conversation_type_active_lastmsg
```

### ÉTAPE 6: VALIDATION POST-MIGRATION
```bash
# Compter les documents
USER_COUNT=$(ssh root@meeshy.me "docker exec meeshy-database-staging mongosh meeshy-staging \
  --quiet --eval 'db.User.countDocuments()'")

MESSAGE_COUNT=$(ssh root@meeshy.me "docker exec meeshy-database-staging mongosh meeshy-staging \
  --quiet --eval 'db.Message.countDocuments()'")

echo "Users: $USER_COUNT"
echo "Messages: $MESSAGE_COUNT"
```

### ÉTAPE 7: REDÉMARRAGE ET TESTS
```bash
# Redémarrer le gateway pour appliquer les changements
ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose restart gateway-staging"

# Attendre le démarrage (30s)
sleep 30

# Vérifier les logs de performance
ssh root@meeshy.me "cd /opt/meeshy/staging && \
  docker compose logs --tail=100 gateway-staging | grep 'CONVERSATIONS_PERF'"
```

**Métriques attendues APRÈS index:**
```
[CONVERSATIONS_PERF] Query performance breakdown (OPTIMIZED v2)
  - conversationsQuery: 200-500ms    ✅ (était 2.5-6.3s)
  - parallelQueries: 50-300ms        ✅ (était N/A)
  TOTAL: 250-900ms                   ✅ (était 6-11s)
```

---

## 📊 Collections à Migrer

*(Identique au plan original - voir migration-strategy.md)*

---

## 🔄 Script Mise à Jour

Le script `infrastructure/scripts/migrate-to-staging.sh` doit être mis à jour pour inclure l'étape 4.

### Modification Requise

Ajouter après l'ÉTAPE 6 (Migration Réelle) et avant l'ÉTAPE 7 (Validation) :

```bash
# =============================================================================
# ÉTAPE 6.5: CRÉATION DES INDEX DE PERFORMANCE
# =============================================================================

echo "⚡ Création des index de performance MongoDB..."
echo ""

# Copier le script d'index
scp infrastructure/scripts/mongodb-add-conversation-indexes.js \
  $REMOTE_HOST:$STAGING_DIR/infrastructure/scripts/

# Exécuter le script
ssh $REMOTE_HOST "docker exec -i meeshy-database-staging \
  mongosh meeshy-staging < $STAGING_DIR/infrastructure/scripts/mongodb-add-conversation-indexes.js"

echo ""
echo "✅ Index de performance créés"
echo ""

# Vérifier les index
echo "🔍 Vérification des index créés..."

ssh $REMOTE_HOST "docker exec meeshy-database-staging mongosh meeshy-staging --quiet --eval \"
  print('✅ ConversationMember: ' + db.ConversationMember.getIndexes().length + ' indexes');
  print('✅ Message: ' + db.Message.getIndexes().length + ' indexes');
  print('✅ Conversation: ' + db.Conversation.getIndexes().length + ' indexes');
  print('✅ ConversationReadCursor: ' + db.ConversationReadCursor.getIndexes().length + ' indexes');
  print('✅ UserConversationPreferences: ' + db.UserConversationPreferences.getIndexes().length + ' indexes');
\""

echo ""
```

---

## 📝 Checklist Finale (MISE À JOUR)

Avant de lancer la migration en production:

- [ ] Dry-run réussi en staging
- [ ] Migration réelle réussie en staging
- [ ] **Index de performance créés et vérifiés** ← NOUVEAU
- [ ] **Logs CONVERSATIONS_PERF montrent <1s** ← NOUVEAU
- [ ] Tous les counts correspondent
- [ ] Tests manuels passés
- [ ] Tests automatisés passés
- [ ] Backup production créé
- [ ] État pre-switch capturé
- [ ] Équipe de monitoring prête
- [ ] Communication utilisateurs envoyée

---

## 🚨 Conséquences d'Oublier les Index

### Sans Index (Migration Incomplète)
```
Route /api/v1/conversations:
  - conversationsQuery: 2.5-6.3s     ❌
  - countQuery: 1.8-5.4s             ❌
  - unreadCounts: 0.05-2.5s          ❌
  TOTAL: 6-11 secondes               ❌❌❌

Expérience utilisateur: CATASTROPHIQUE
- App freeze pendant 10s au démarrage
- Users pensent que l'app est cassée
- Taux d'abandon élevé
```

### Avec Index (Migration Complète)
```
Route /api/v1/conversations:
  - conversationsQuery: 0.2-0.5s     ✅
  - parallelQueries: 0.05-0.3s       ✅
  TOTAL: 0.25-0.9 secondes           ✅✅✅

Expérience utilisateur: EXCELLENTE
- App démarre instantanément
- Conversations chargent rapidement
- Users satisfaits
```

---

## 📞 Support

Questions ou problèmes :
1. Vérifier les logs MongoDB
2. Utiliser `explain()` pour analyser les queries
3. Consulter `infrastructure/scripts/README-MONGODB-INDEXES.md`
4. Documentation MongoDB : https://docs.mongodb.com/manual/indexes/

---

**🔴 RAPPEL CRITIQUE:** Les index de performance ne sont PAS optionnels. Sans eux, staging aura les mêmes problèmes de performance que production avant optimisation (6-11s).

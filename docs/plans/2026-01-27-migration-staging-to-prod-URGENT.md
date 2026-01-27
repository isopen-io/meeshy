# Plan de Migration URGENT : STAGING → PRODUCTION

**Date:** 2026-01-27
**Status:** 🔥 URGENT - Switch en cours
**Objectif:** Migrer TOUTES les collections de staging vers production avec transformation de schéma

---

## 🚨 Situation Actuelle

### État des Bases de Données

**STAGING (Source de vérité)** - `/opt/meeshy/staging`
- Base: `meeshy` sur `database-staging:27017`
- Collections: Nouveau schéma v1.0.0 (PascalCase)
- Données: Testées et validées

**PRODUCTION (Cible)** - `/opt/meeshy/`
- Base: `meeshy` sur `database:27017`
- Collections: Mix ancien/nouveau schéma
- Besoin: Écraser avec staging validé

### Collections à Migrer

**Collections PascalCase (à migrer):**
```
AdminAuditLog                 ✅
AffiliateRelation            ✅
AffiliateToken               ✅
AnonymousParticipant         ✅
Community                    ✅
CommunityMember              ✅
Conversation                 ✅
ConversationMember           ✅
ConversationPreference       ✅
ConversationReadCursor       ✅  (NOUVEAU - pas dans prod)
ConversationShareLink        ✅
FriendRequest                ✅
Mention                      ✅
Message                      ✅
MessageAttachment            ✅
MessageReadStatus            ✅
MessageStatus                ✅
MessageTranslation           ⚠️  (À transformer → Message.translations)
Notification                 ✅
Reaction                     ✅
TrackingLink                 ✅
TrackingLinkClick            ✅
TypingIndicator              ✅
User                         ✅
UserConversationCategory     ✅  (NOUVEAU - pas dans prod)
UserConversationPreferences  ✅  (NOUVEAU - pas dans prod)
UserPreference               ✅
UserStats                    ✅
```

**Collections snake_case (à IGNORER):**
```
call_participants            ❌ LEGACY
call_sessions                ❌ LEGACY
old_message_status           ❌ LEGACY
MessageAttachment_backup_urls ❌ LEGACY
user_conversation_categories  ❌ LEGACY (ancienne version)
user_conversation_preferences ❌ LEGACY (ancienne version)
```

---

## 🎯 Transformations Nécessaires

### 1. MessageTranslation → Message.translations (JSON)

**État actuel:**
- Staging: `MessageTranslation` table séparée (2787 documents)
- Nouveau schéma: `Message.translations` champ JSON

**Transformation:**
```javascript
// Pour chaque MessageTranslation:
db.MessageTranslation.find({}).forEach(translation => {
  const messageId = translation.messageId;
  const targetLanguage = translation.targetLanguage;

  const translationData = {
    text: translation.translatedText,
    translationModel: translation.translationModel || "basic",
    confidenceScore: translation.confidenceScore,
    createdAt: translation.createdAt,
    updatedAt: translation.updatedAt
  };

  // Fusionner dans Message
  db.Message.updateOne(
    { _id: messageId },
    { $set: { [`translations.${targetLanguage}`]: translationData } }
  );
});
```

### 2. URLs Attachments (si nécessaire)

Si staging contient des URLs avec `staging.meeshy.me`, les remplacer par `meeshy.me`.

---

## 📋 Scripts de Migration

### Script Principal: `migrate-staging-to-prod.sh`

**Localisation:** `infrastructure/scripts/migrate-staging-to-prod.sh`

**Étapes:**
1. ✅ Backup production
2. ✅ Analyse collections à migrer
3. ✅ Copie collections standards (--drop pour écraser)
4. ✅ Transformation MessageTranslation → Message.translations
5. ✅ Création index de performance
6. ✅ Validation intégrité données
7. ✅ Nettoyage collections legacy

**Usage:**
```bash
# Dry-run (sans modification)
./infrastructure/scripts/migrate-staging-to-prod.sh --dry-run

# Migration réelle
./infrastructure/scripts/migrate-staging-to-prod.sh
```

### Script Secondaire: `update-staging-images.sh`

**Localisation:** `infrastructure/scripts/update-staging-images.sh`

**Objectif:** Mettre à jour staging avec latest images pour nouveaux tests

**Usage:**
```bash
./infrastructure/scripts/update-staging-images.sh
```

---

## 🚀 Procédure de Migration

### Phase 1: Backup (2 min)

```bash
ssh root@meeshy.me "docker exec meeshy-database mongodump \
  --db=meeshy \
  --out=/opt/meeshy/backups/pre-migration-$(date +%Y%m%d-%H%M%S) \
  --gzip"
```

### Phase 2: Migration Données (10-15 min)

```bash
cd /Users/smpceo/Documents/v2_meeshy
./infrastructure/scripts/migrate-staging-to-prod.sh
```

**Ce script va:**
- Créer un backup automatique
- Copier toutes les collections PascalCase de staging → prod
- Transformer MessageTranslation en Message.translations
- Créer les index de performance
- Valider que counts correspondent

### Phase 3: Redémarrage Production (2 min)

```bash
ssh root@meeshy.me "cd /opt/meeshy && docker compose restart gateway"
```

### Phase 4: Validation (5 min)

```bash
# Vérifier la santé
curl https://gate.meeshy.me/health
curl https://meeshy.me

# Vérifier les logs
ssh root@meeshy.me "docker logs -f meeshy-gateway --tail=100"
```

---

## ✅ Checklist de Migration

### Pré-Migration

- [ ] Backup production créé
- [ ] Script `migrate-staging-to-prod.sh` testé en dry-run
- [ ] Staging contient données validées
- [ ] Équipe prête pour monitoring

### Migration

- [ ] Script exécuté avec succès
- [ ] Aucune erreur dans les logs
- [ ] Validation des counts OK
- [ ] MessageTranslation transformées

### Post-Migration

- [ ] Services production redémarrés
- [ ] Health checks OK (gateway + frontend)
- [ ] Logs sans erreurs critiques
- [ ] Tests manuels réussis (login, messages, etc.)
- [ ] Notifications fonctionnent

### Monitoring 24h

- [ ] Aucune erreur MongoDB
- [ ] Performances normales (<1s /api/v1/conversations)
- [ ] Aucune plainte utilisateur
- [ ] Données cohérentes

---

## 🔄 Rollback (si nécessaire)

Si la migration échoue ou cause des problèmes:

```bash
# Récupérer le backup créé
BACKUP_PATH="/opt/meeshy/backups/migration-TIMESTAMP.tar.gz"

# Arrêter production
ssh root@meeshy.me "cd /opt/meeshy && docker compose down"

# Restaurer le backup
ssh root@meeshy.me "cd /opt/meeshy/backups && \
  tar -xzf migration-TIMESTAMP.tar.gz && \
  docker compose up -d database && \
  sleep 10 && \
  docker exec meeshy-database mongorestore \
    --db=meeshy \
    --drop \
    migration-TIMESTAMP/meeshy"

# Redémarrer production
ssh root@meeshy.me "cd /opt/meeshy && docker compose up -d"
```

**Temps de rollback:** ~5 minutes

---

## 📊 Métriques de Succès

### Données

- ✅ Toutes les collections PascalCase copiées
- ✅ Counts staging = counts production
- ✅ MessageTranslation fusionnées dans Message.translations
- ✅ Aucune collection snake_case en production

### Performance

- ✅ `/api/v1/conversations` < 1 seconde (grâce aux index)
- ✅ Aucune erreur MongoDB dans les logs
- ✅ Memory/CPU normaux

### Fonctionnel

- ✅ Login fonctionne
- ✅ Messages s'envoient
- ✅ Traductions s'affichent
- ✅ Attachments accessibles
- ✅ Notifications temps réel OK

---

## 🐛 Troubleshooting

### Problème: Script échoue pendant la copie

**Symptôme:** Erreur "failed to copy collection"

**Solution:**
```bash
# Vérifier l'espace disque
ssh root@meeshy.me "df -h"

# Vérifier que MongoDB est accessible
ssh root@meeshy.me "docker exec meeshy-database mongosh --eval 'db.runCommand({ping:1})'"
```

### Problème: Counts ne correspondent pas

**Symptôme:** Validation échoue avec "MISMATCH"

**Solution:**
```bash
# Vérifier manuellement
ssh root@meeshy.me "docker exec meeshy-database-staging mongosh meeshy --eval 'db.User.countDocuments()'"
ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy --eval 'db.User.countDocuments()'"

# Re-exécuter la migration pour cette collection
ssh root@meeshy.me "docker exec meeshy-database-staging mongodump --db=meeshy --collection=User --archive=/tmp/user.archive"
ssh root@meeshy.me "docker exec meeshy-database mongorestore --db=meeshy --collection=User --drop --archive=/tmp/user.archive"
```

### Problème: Traductions ne s'affichent pas

**Symptôme:** Messages sans traductions après migration

**Solution:**
```bash
# Vérifier que translations existe
ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy --eval 'db.Message.findOne({translations: {\$exists: true}})'"

# Re-exécuter transformation MessageTranslation
# (voir script de transformation dans migrate-staging-to-prod.sh)
```

---

## 📞 Support Urgence

**Si blocage pendant la migration:**

1. **Ne pas paniquer** - Le backup existe
2. **Capturer les logs** : `docker logs meeshy-database > migration-error.log`
3. **Contacter l'équipe** avec les logs
4. **Rollback si nécessaire** (procédure ci-dessus)

---

## 📝 Commandes Utiles

### Vérifier état des services

```bash
ssh root@meeshy.me "docker ps"
ssh root@meeshy.me "cd /opt/meeshy && docker compose ps"
```

### Compter documents

```bash
ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy --eval '
  db.getCollectionNames().forEach(col => {
    print(col + \": \" + db[col].countDocuments())
  })
'"
```

### Vérifier index

```bash
ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy --eval '
  print(\"ConversationMember indexes:\");
  db.ConversationMember.getIndexes().forEach(idx => print(\"  - \" + idx.name));
'"
```

### Logs en temps réel

```bash
# Gateway
ssh root@meeshy.me "docker logs -f meeshy-gateway"

# Database
ssh root@meeshy.me "docker logs -f meeshy-database"

# Frontend
ssh root@meeshy.me "docker logs -f meeshy-web"
```

---

## 🎯 Prochaines Étapes Après Migration

1. **Monitoring 24h**
   - Surveiller logs
   - Vérifier métriques
   - Tester fonctionnalités critiques

2. **Down Staging** (après validation)
   ```bash
   ssh root@meeshy.me "cd /opt/meeshy/staging && docker compose down"
   ```

3. **Cleanup Legacy** (après 48h)
   ```bash
   # Supprimer collections snake_case obsolètes
   ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy" << 'EOF'
   db.call_participants.drop();
   db.call_sessions.drop();
   db.old_message_status.drop();
   db.MessageAttachment_backup_urls.drop();
   db.user_conversation_categories.drop();
   db.user_conversation_preferences.drop();
   EOF
   ```

4. **Documentation**
   - Mettre à jour architecture.md
   - Noter les changements dans CHANGELOG
   - Créer post-mortem si problèmes

---

**Créé par:** Claude Sonnet 4.5
**Date:** 2026-01-27
**Version:** 1.0 (Urgence - Switch en cours)


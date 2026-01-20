# HOTFIX Phase 1 - Corrections Critiques Immédiates

**Urgence:** 🔥 CRITIQUE
**Temps estimé:** 4 heures dev + 2 heures QA
**Impact:** Restaure E2EE, sécurité, view-once

---

## Contexte

**Problème:** 12 champs critiques manquants dans les schémas Fastify causent:
- ❌ Messages E2EE non déchiffrables (encryptedContent manquant)
- ❌ Rotation de clés serveur cassée (serverEncryptionKeyId manquant)
- ❌ Mode annonce non appliqué (isAnnouncementChannel manquant)
- ❌ View-once sans limite (maxViewOnceCount manquant)

**Solution:** Ajouter 6 champs critiques aux schémas `messageSchema` et `conversationSchema`.

---

## Modifications à Effectuer

### 1. messageSchema (4 champs)

**Fichier:** `/Users/smpceo/Documents/v2_meeshy/packages/shared/types/api-schemas.ts`
**Ligne:** 388 (début du messageSchema)
**Position d'insertion:** Après la ligne 441 (après `timestamp`)

#### Code à Ajouter

```typescript
// ===== CORRECTIONS HOTFIX PHASE 1 =====
// Ajouter après la ligne 441 (timestamp)

// CRITIQUE: Champs E2EE pour déchiffrement
encryptedContent: {
  type: 'string',
  nullable: true,
  description: 'Base64 encoded ciphertext for E2EE messages'
},
encryptionMetadata: {
  type: 'object',
  nullable: true,
  description: 'Encryption metadata (IV, auth tag, key version)',
  additionalProperties: true
},

// CRITIQUE: Timestamp de réception pour indicateurs de livraison
receivedByAllAt: {
  type: 'string',
  format: 'date-time',
  nullable: true,
  description: 'Received by all recipients timestamp'
},

// CRITIQUE: Limite de viewers pour view-once messages
maxViewOnceCount: {
  type: 'number',
  nullable: true,
  description: 'Maximum unique viewers allowed for view-once messages'
},
```

#### Avant/Après

**AVANT:**
```typescript
timestamp: { type: 'string', format: 'date-time', description: 'Alias for createdAt' },

// Sender info (populated)
sender: { ...userMinimalSchema, nullable: true, description: 'Sender user info' },
```

**APRÈS:**
```typescript
timestamp: { type: 'string', format: 'date-time', description: 'Alias for createdAt' },

// ===== CORRECTIONS HOTFIX PHASE 1 =====
encryptedContent: {
  type: 'string',
  nullable: true,
  description: 'Base64 encoded ciphertext for E2EE messages'
},
encryptionMetadata: {
  type: 'object',
  nullable: true,
  description: 'Encryption metadata (IV, auth tag, key version)',
  additionalProperties: true
},
receivedByAllAt: {
  type: 'string',
  format: 'date-time',
  nullable: true,
  description: 'Received by all recipients timestamp'
},
maxViewOnceCount: {
  type: 'number',
  nullable: true,
  description: 'Maximum unique viewers allowed for view-once messages'
},

// Sender info (populated)
sender: { ...userMinimalSchema, nullable: true, description: 'Sender user info' },
```

---

### 2. conversationSchema (2 champs)

**Fichier:** `/Users/smpceo/Documents/v2_meeshy/packages/shared/types/api-schemas.ts`
**Ligne:** 622 (début du conversationSchema)
**Position d'insertion:** Après la ligne 677 (après `encryptionEnabledAt`)

#### Code à Ajouter

```typescript
// ===== CORRECTIONS HOTFIX PHASE 1 =====
// Ajouter après la ligne 677 (encryptionEnabledAt)

// CRITIQUE: ID de clé pour rotation serveur
serverEncryptionKeyId: {
  type: 'string',
  nullable: true,
  description: 'Server-side encryption key ID for key rotation'
},

// CRITIQUE: Mode annonce (restriction écriture)
isAnnouncementChannel: {
  type: 'boolean',
  nullable: true,
  description: 'Announcement-only mode (only creator/admins can write)',
  default: false
},
```

#### Avant/Après

**AVANT:**
```typescript
encryptionEnabledAt: { type: 'string', format: 'date-time', nullable: true, description: 'Encryption enabled timestamp' },

// Statistics
stats: { ...conversationStatsSchema, nullable: true, description: 'Conversation statistics' },
```

**APRÈS:**
```typescript
encryptionEnabledAt: { type: 'string', format: 'date-time', nullable: true, description: 'Encryption enabled timestamp' },

// ===== CORRECTIONS HOTFIX PHASE 1 =====
serverEncryptionKeyId: {
  type: 'string',
  nullable: true,
  description: 'Server-side encryption key ID for key rotation'
},
isAnnouncementChannel: {
  type: 'boolean',
  nullable: true,
  description: 'Announcement-only mode (only creator/admins can write)',
  default: false
},

// Statistics
stats: { ...conversationStatsSchema, nullable: true, description: 'Conversation statistics' },
```

---

## Validation Rapide

### 1. Compilation TypeScript (2 min)

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared
npm run build
```

**Résultat attendu:** ✅ Build successful

---

### 2. Test de Sérialisation Manuel (5 min)

#### Démarrer le gateway

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
npm run dev
```

#### Test 1: Message E2EE

```bash
# Variables
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." # Remplacer par votre token
export GATEWAY="http://localhost:3000"

# Créer un message E2EE
curl -X POST "$GATEWAY/api/conversations/YOUR_CONV_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test E2EE",
    "isEncrypted": true,
    "encryptedContent": "U2FsdGVkX1+encoded_content_here==",
    "encryptionMetadata": {
      "iv": "1234567890abcdef",
      "authTag": "fedcba0987654321",
      "keyVersion": 1,
      "protocol": "aes-256-gcm"
    }
  }' | jq

# ✅ Vérifier que la réponse contient:
#   - data.message.encryptedContent
#   - data.message.encryptionMetadata
#   - data.message.encryptionMetadata.iv
#   - data.message.encryptionMetadata.authTag
```

**Résultat attendu:**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "507f1f77bcf86cd799439011",
      "content": "Test E2EE",
      "isEncrypted": true,
      "encryptedContent": "U2FsdGVkX1+encoded_content_here==",
      "encryptionMetadata": {
        "iv": "1234567890abcdef",
        "authTag": "fedcba0987654321",
        "keyVersion": 1,
        "protocol": "aes-256-gcm"
      }
    }
  }
}
```

#### Test 2: Conversation Mode Annonce

```bash
# Activer mode annonce
curl -X PATCH "$GATEWAY/api/conversations/YOUR_CONV_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isAnnouncementChannel": true}' | jq

# ✅ Vérifier que la réponse contient:
#   - data.conversation.isAnnouncementChannel: true
```

**Résultat attendu:**
```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "507f1f77bcf86cd799439012",
      "title": "Test Conversation",
      "isAnnouncementChannel": true
    }
  }
}
```

#### Test 3: View-Once avec Limite

```bash
# Créer message view-once
curl -X POST "$GATEWAY/api/conversations/YOUR_CONV_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Secret message",
    "isViewOnce": true,
    "maxViewOnceCount": 3
  }' | jq

# ✅ Vérifier que la réponse contient:
#   - data.message.isViewOnce: true
#   - data.message.maxViewOnceCount: 3
#   - data.message.viewOnceCount: 0
```

---

### 3. Documentation Swagger (2 min)

```bash
# Ouvrir Swagger UI
open http://localhost:3000/documentation

# Vérifier dans le modèle "Message":
# ✅ encryptedContent (string, nullable)
# ✅ encryptionMetadata (object, nullable)
# ✅ receivedByAllAt (string, date-time, nullable)
# ✅ maxViewOnceCount (number, nullable)

# Vérifier dans le modèle "Conversation":
# ✅ serverEncryptionKeyId (string, nullable)
# ✅ isAnnouncementChannel (boolean, nullable)
```

---

## Commit et Déploiement

### 1. Commit

```bash
cd /Users/smpceo/Documents/v2_meeshy

git add packages/shared/types/api-schemas.ts

git commit -m "fix(schemas): add critical E2EE and security fields (Phase 1)

BREAKING: None (all new fields are nullable)

Critical fixes:
- Add encryptedContent and encryptionMetadata to messageSchema for E2EE support
- Add serverEncryptionKeyId to conversationSchema for key rotation
- Add isAnnouncementChannel to conversationSchema for write restrictions
- Add maxViewOnceCount to messageSchema for viewer limits
- Add receivedByAllAt to messageSchema for delivery tracking

Impact:
- Restores E2EE message decryption functionality
- Enables server-side encryption key rotation
- Enables announcement-only channels
- Enforces view-once viewer limits
- Fixes delivery status indicators

Tests: Manual validation with curl (see HOTFIX_PHASE1.md)

Refs: AUDIT_SCHEMAS_FASTIFY.md
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

### 2. Push et CI/CD

```bash
# Créer une branche hotfix
git checkout -b hotfix/schemas-phase1

# Push
git push origin hotfix/schemas-phase1

# Créer une PR
gh pr create \
  --title "🔥 HOTFIX: Add critical E2EE and security fields to schemas" \
  --body "$(cat <<'EOF'
## Problème

38 champs manquants dans les schémas Fastify causent la suppression de données lors de la sérialisation. Ce hotfix corrige les 6 champs les plus critiques.

## Impact

**Avant:**
- ❌ Messages E2EE non déchiffrables
- ❌ Rotation de clés serveur cassée
- ❌ Mode annonce non appliqué
- ❌ View-once sans limite

**Après:**
- ✅ Messages E2EE déchiffrables
- ✅ Rotation de clés serveur fonctionnelle
- ✅ Mode annonce appliqué
- ✅ View-once avec limite

## Modifications

### messageSchema (4 champs)
- `encryptedContent` - Contenu chiffré E2EE
- `encryptionMetadata` - Métadonnées de chiffrement (IV, auth tag)
- `receivedByAllAt` - Timestamp de réception
- `maxViewOnceCount` - Limite de viewers

### conversationSchema (2 champs)
- `serverEncryptionKeyId` - ID de clé pour rotation
- `isAnnouncementChannel` - Mode annonce

## Tests

- ✅ Compilation TypeScript
- ✅ Tests manuels avec curl
- ✅ Documentation Swagger validée

## Sécurité

- Tous les nouveaux champs sont `nullable: true`
- Pas de breaking changes
- Compatibilité ascendante garantie

## Documentation

Voir:
- `AUDIT_SCHEMAS_FASTIFY.md` - Analyse complète
- `HOTFIX_PHASE1.md` - Guide d'application
- `PLAN_TEST_SCHEMAS.md` - Tests détaillés

## Prochaines Étapes

Phase 2 (J+3 à J+7): Ajouter 18 champs haute priorité (réactions, pinning, etc.)

EOF
)" \
  --base main \
  --reviewer @backend-team

# Attendre l'approbation et merger
```

### 3. Déploiement Production

```bash
# Après merge dans main, déployer
cd /Users/smpceo/Documents/v2_meeshy/services/gateway

# Build
npm run build

# Déployer (selon votre setup)
npm run deploy:production
# ou
kubectl apply -f k8s/gateway-deployment.yaml

# Vérifier santé
curl https://api.meeshy.com/health

# Monitorer logs
kubectl logs -f deployment/gateway --tail=100
```

---

## Vérification Post-Déploiement

### 1. Tests Smoke (5 min)

```bash
# Variables production
export PROD_TOKEN="your_prod_token"
export PROD_API="https://api.meeshy.com"

# Test 1: Message E2EE existe toujours
curl "$PROD_API/api/messages/EXISTING_E2EE_MSG_ID" \
  -H "Authorization: Bearer $PROD_TOKEN" \
  | jq '.data.message | {
    id,
    isEncrypted,
    encryptedContent,
    encryptionMetadata
  }'

# ✅ Vérifier que encryptedContent et encryptionMetadata sont présents

# Test 2: Conversation mode annonce
curl "$PROD_API/api/conversations/ANNOUNCEMENT_CONV_ID" \
  -H "Authorization: Bearer $PROD_TOKEN" \
  | jq '.data.conversation | {
    id,
    title,
    isAnnouncementChannel
  }'

# ✅ Vérifier que isAnnouncementChannel est présent
```

### 2. Monitoring (1h)

#### Grafana

```bash
# Ouvrir dashboard
open https://grafana.meeshy.com/d/gateway-metrics

# Vérifier:
# ✅ Temps de réponse API < 50ms (pas de régression)
# ✅ Taux d'erreur < 0.1%
# ✅ CPU < 70%
# ✅ Memory < 80%
```

#### Sentry

```bash
# Ouvrir Sentry
open https://sentry.io/meeshy/gateway

# Vérifier:
# ✅ 0 nouvelles erreurs de sérialisation
# ✅ 0 erreurs "undefined property"
# ✅ Pas de spike d'erreurs
```

#### Logs

```bash
# Chercher erreurs liées aux nouveaux champs
kubectl logs deployment/gateway --tail=1000 \
  | grep -i "encryptedContent\|encryptionMetadata\|serverEncryptionKeyId\|isAnnouncementChannel"

# ✅ Aucune erreur attendue
```

---

## Rollback (si problème)

### Plan de Rollback

```bash
# Si problème détecté, rollback immédiat

# Option 1: Revert le commit
git revert HEAD
git push

# Option 2: Rollback Kubernetes
kubectl rollout undo deployment/gateway

# Option 3: Redéployer version précédente
kubectl set image deployment/gateway \
  gateway=meeshy/gateway:previous-version

# Vérifier rollback
kubectl rollout status deployment/gateway
```

### Critères de Rollback

Rollback SI:
- ❌ Taux d'erreur > 1%
- ❌ Temps de réponse > 200ms (dégradation > 4x)
- ❌ CPU > 90%
- ❌ Sentry: > 10 nouvelles erreurs/min

NE PAS rollback SI:
- ✅ Taux d'erreur < 0.5%
- ✅ Temps de réponse < 100ms
- ✅ CPU < 80%
- ✅ Sentry: < 5 erreurs/h

---

## Checklist Finale

### Pré-Déploiement

- [ ] Modifications appliquées dans `api-schemas.ts`
- [ ] Build TypeScript réussi (`npm run build`)
- [ ] Tests manuels validés (curl)
- [ ] Documentation Swagger vérifiée
- [ ] Commit créé avec message détaillé
- [ ] PR créée et approuvée
- [ ] Merge dans main

### Déploiement

- [ ] Build production réussi
- [ ] Déploiement exécuté
- [ ] Health check OK
- [ ] Tests smoke passés

### Post-Déploiement

- [ ] Monitoring Grafana: pas de régression
- [ ] Sentry: 0 nouvelles erreurs
- [ ] Logs: pas d'erreurs de sérialisation
- [ ] Tests E2EE frontend: messages déchiffrés OK
- [ ] Mode annonce frontend: input désactivé OK

### Communication

- [ ] Équipe backend notifiée
- [ ] Équipe frontend notifiée (nouveaux champs disponibles)
- [ ] Documentation Notion mise à jour
- [ ] Slack: annonce déploiement hotfix

---

## Timeline

| Étape | Temps | Responsable |
|-------|-------|-------------|
| Application modifications | 30 min | Backend Dev |
| Tests locaux | 30 min | Backend Dev |
| Review PR | 1h | Tech Lead |
| Déploiement staging | 30 min | DevOps |
| Tests staging | 1h | QA |
| Déploiement production | 30 min | DevOps |
| Monitoring | 1h | DevOps + Backend |
| **TOTAL** | **5.5h** | **Équipe** |

---

## Contact Urgence

**Si problème durant le déploiement:**
- Slack: #incidents-critical
- On-call: voir PagerDuty
- Rollback: voir section "Rollback" ci-dessus

---

**Document créé par:** Claude Sonnet 4.5
**Date:** 2026-01-18
**Urgence:** 🔥 CRITIQUE
**Deadline recommandée:** J+2 (avant fin de semaine)

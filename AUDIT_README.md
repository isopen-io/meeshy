# Audit Schémas Fastify - Guide d'Utilisation

**Date:** 2026-01-18
**Version:** 1.0.0
**Auteur:** Claude Sonnet 4.5

---

## Vue d'Ensemble

Cet audit identifie **38 champs manquants** dans les schémas Fastify qui causent la suppression de données lors de la sérialisation API. Ce problème a été découvert suite à un bug où `transcription` et `translationsJson` n'apparaissaient pas dans les réponses API.

---

## Structure des Fichiers

```
/Users/smpceo/Documents/v2_meeshy/
├── AUDIT_README.md                  ← Ce fichier (guide d'utilisation)
├── RESUME_AUDIT_SCHEMAS.md          ← Résumé exécutif (5 min de lecture)
├── AUDIT_SCHEMAS_FASTIFY.md         ← Rapport détaillé (30 min de lecture)
├── CORRECTIONS_SCHEMAS.ts           ← Code TypeScript prêt à copier-coller
└── PLAN_TEST_SCHEMAS.md             ← Plan de test complet avec scripts
```

---

## Ordre de Lecture Recommandé

### Pour les Décideurs (5-10 min)

1. **Lire:** `RESUME_AUDIT_SCHEMAS.md`
   - Résumé exécutif
   - Impact business
   - Plan d'action avec estimations
   - Métriques de succès

### Pour les Développeurs Backend (30-45 min)

1. **Lire:** `RESUME_AUDIT_SCHEMAS.md` (contexte)
2. **Lire:** `AUDIT_SCHEMAS_FASTIFY.md` (analyse détaillée)
3. **Utiliser:** `CORRECTIONS_SCHEMAS.ts` (code à appliquer)
4. **Référer:** `PLAN_TEST_SCHEMAS.md` (validation)

### Pour les QA Engineers (45-60 min)

1. **Lire:** `RESUME_AUDIT_SCHEMAS.md` (contexte)
2. **Étudier:** `PLAN_TEST_SCHEMAS.md` (plan de test complet)
3. **Exécuter:** Scripts de test fournis
4. **Vérifier:** Checklist de validation

---

## Guide d'Action Rapide

### Étape 1: Comprendre le Problème (5 min)

```bash
# Lire le résumé exécutif
open /Users/smpceo/Documents/v2_meeshy/RESUME_AUDIT_SCHEMAS.md
```

**Points clés à retenir:**
- 38 champs manquants identifiés
- 12 champs critiques bloquant E2EE et sécurité
- Plan d'action en 3 phases sur 14 jours
- 21h de développement estimées

---

### Étape 2: Analyser les Détails (30 min)

```bash
# Lire le rapport détaillé
open /Users/smpceo/Documents/v2_meeshy/AUDIT_SCHEMAS_FASTIFY.md
```

**Sections importantes:**
- **Résumé Exécutif** (ligne 10) - Vue d'ensemble
- **messageSchema** (ligne 44) - 9 champs manquants
- **conversationSchema** (ligne 120) - 8 champs manquants
- **Récapitulatif Corrections** (ligne 350) - Priorisation

---

### Étape 3: Appliquer les Corrections (2-4h)

#### Phase 1: CRITIQUE (Urgent)

```bash
# Ouvrir le fichier de corrections
code /Users/smpceo/Documents/v2_meeshy/CORRECTIONS_SCHEMAS.ts

# Ouvrir le schéma à corriger
code /Users/smpceo/Documents/v2_meeshy/packages/shared/types/api-schemas.ts
```

**Instructions:**

1. **messageSchema (ligne 388)**
   - Copier les champs de `CORRECTIONS_SCHEMAS.ts` lignes 18-51
   - Coller dans `api-schemas.ts` après la ligne 441 (timestamp)
   - Champs: `encryptedContent`, `encryptionMetadata`, `receivedByAllAt`, `maxViewOnceCount`

2. **conversationSchema (ligne 622)**
   - Copier les champs de `CORRECTIONS_SCHEMAS.ts` lignes 53-75
   - Coller dans `api-schemas.ts` après la ligne 677 (encryptionEnabledAt)
   - Champs: `serverEncryptionKeyId`, `isAnnouncementChannel`

3. **Vérifier la syntaxe**
   ```bash
   cd /Users/smpceo/Documents/v2_meeshy/packages/shared
   npm run build
   ```

4. **Commit**
   ```bash
   git add packages/shared/types/api-schemas.ts
   git commit -m "fix(schemas): add critical E2EE and security fields

   - Add encryptedContent, encryptionMetadata to messageSchema
   - Add serverEncryptionKeyId, isAnnouncementChannel to conversationSchema
   - Add maxViewOnceCount, receivedByAllAt for view-once and delivery

   Fixes: #XXX (replace with issue number)"
   ```

---

### Étape 4: Tester les Corrections (2h)

```bash
# Lire le plan de test
open /Users/smpceo/Documents/v2_meeshy/PLAN_TEST_SCHEMAS.md
```

#### Tests Unitaires (30 min)

```bash
cd /Users/smpceo/Documents/v2_meeshy/packages/shared

# Créer le fichier de test
cat > types/__tests__/api-schemas.test.ts << 'EOF'
# Copier le contenu de PLAN_TEST_SCHEMAS.md Phase 1.1
EOF

# Exécuter
npm run test -- api-schemas.test.ts
```

#### Tests d'Intégration (1h)

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway

# Créer les fichiers de test
mkdir -p src/__tests__/integration

# Test sérialisation messages
cat > src/__tests__/integration/message-serialization.test.ts << 'EOF'
# Copier le contenu de PLAN_TEST_SCHEMAS.md Phase 2.1
EOF

# Test sérialisation conversations
cat > src/__tests__/integration/conversation-serialization.test.ts << 'EOF'
# Copier le contenu de PLAN_TEST_SCHEMAS.md Phase 2.2
EOF

# Exécuter
npm run test:integration
```

#### Tests Manuels avec curl (30 min)

```bash
# Variables d'environnement
export TOKEN="your_jwt_token_here"
export GATEWAY_URL="http://localhost:3000"

# Test 1: Message E2EE
curl -X POST "$GATEWAY_URL/api/conversations/test-conv/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Secret message",
    "isEncrypted": true,
    "encryptedContent": "base64_encrypted_data_here",
    "encryptionMetadata": {
      "iv": "initialization_vector",
      "authTag": "auth_tag",
      "keyVersion": 1
    }
  }' | jq '.data.message | {
    encryptedContent,
    encryptionMetadata,
    isEncrypted
  }'

# Vérifier que la réponse contient bien ces champs ✅

# Test 2: Conversation mode annonce
curl -X PATCH "$GATEWAY_URL/api/conversations/test-conv" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isAnnouncementChannel": true}' \
  | jq '.data.conversation | {
    isAnnouncementChannel,
    defaultWriteRole
  }'

# Vérifier isAnnouncementChannel: true ✅
```

---

### Étape 5: Déployer (1h)

#### Pré-déploiement

```bash
# Checklist de validation
□ Tous les tests unitaires passent
□ Tous les tests d'intégration passent
□ Tests manuels validés
□ Documentation Swagger mise à jour
□ CHANGELOG.md mis à jour
```

#### Déploiement

```bash
# 1. Merger dans main/dev
git checkout main
git merge feature/fix-schemas-phase1
git push

# 2. Déployer backend
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
npm run deploy:production

# 3. Vérifier santé
curl https://api.meeshy.com/health

# 4. Monitoring
# Ouvrir Grafana: https://grafana.meeshy.com
# Vérifier métriques:
#   - Temps de réponse API < 50ms
#   - Taux d'erreur < 0.1%
#   - CPU < 70%
```

#### Post-déploiement

```bash
# Monitorer logs pendant 1h
kubectl logs -f deployment/gateway --tail=100

# Vérifier Sentry (0 erreurs sérialisation)
open https://sentry.io/meeshy/gateway

# Tester en production
TOKEN="prod_token_here"
curl https://api.meeshy.com/api/conversations/test | jq '.data.conversation.isAnnouncementChannel'
```

---

## Phases Suivantes

### Phase 2: Haute Priorité (J+3 à J+7)

**Objectif:** Restaurer réactions, pinning, traductions

```bash
# Appliquer corrections Phase 2
# Voir CORRECTIONS_SCHEMAS.ts lignes 77-180

# Tests E2E
cd /Users/smpceo/Documents/v2_meeshy/apps/web
npm run test:e2e -- pinned-message.spec.ts
npm run test:e2e -- message-reactions.spec.ts
```

**Livrables:**
- Réactions visibles dans UI
- Messages épinglés triés
- Traductions E2EE chiffrées

---

### Phase 3: Moyenne Priorité (J+8 à J+14)

**Objectif:** 100% conformité, documentation complète

```bash
# Compléter derniers champs
# Voir CORRECTIONS_SCHEMAS.ts lignes 182-210

# Régénérer SDK
npm run generate:sdk

# Documentation finale
npm run docs:build
```

**Livrables:**
- Documentation Swagger complète
- Clients SDK TypeScript/Python
- Tests de régression complets

---

## Référence Rapide

### Fichiers à Modifier

| Fichier | Lignes | Champs à ajouter | Phase |
|---------|--------|------------------|-------|
| `api-schemas.ts:388` (messageSchema) | après 441 | E2EE, delivery, view-once | 1 |
| `api-schemas.ts:622` (conversationSchema) | après 677 | Security, permissions | 1 |
| `api-schemas.ts:388` (messageSchema) | après Phase 1 | Reactions, pinning | 2 |
| `api-schemas.ts:622` (conversationSchema) | après Phase 1 | Config, encryption | 2 |
| `api-schemas.ts:182` (messageTranslationSchema) | après 198 | Encryption fields | 2 |

### Commandes Utiles

```bash
# Build packages/shared
cd /Users/smpceo/Documents/v2_meeshy/packages/shared
npm run build

# Tests gateway
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
npm run test
npm run test:integration

# Tests frontend
cd /Users/smpceo/Documents/v2_meeshy/apps/web
npm run test:e2e

# Swagger UI local
npm run dev
open http://localhost:3000/documentation
```

### Liens Importants

- **Schémas Fastify:** `/packages/shared/types/api-schemas.ts`
- **Interfaces TypeScript:** `/packages/shared/types/conversation.ts`
- **Documentation Swagger:** `http://localhost:3000/documentation`
- **Sentry:** `https://sentry.io/meeshy/gateway`
- **Grafana:** `https://grafana.meeshy.com`

---

## FAQ

### Q: Dois-je faire une migration MongoDB?

**R:** Non. Tous les nouveaux champs sont `nullable: true` ou ont des valeurs par défaut. Les documents existants restent valides.

### Q: Y a-t-il un risque de breaking change?

**R:** Non. Les corrections sont additives uniquement (nouveaux champs optionnels). Pas de suppression ni modification de champs existants.

### Q: Puis-je appliquer les phases dans le désordre?

**R:** Déconseillé. La Phase 1 contient les champs critiques (E2EE, sécurité). Les Phases 2-3 dépendent de la Phase 1.

### Q: Comment vérifier que tout fonctionne?

**R:** Suivre la checklist dans `PLAN_TEST_SCHEMAS.md` section "Checklist de Validation Finale".

### Q: Combien de temps pour tout corriger?

**R:**
- Phase 1 (critique): 4h dev + 2h QA = 6h
- Phase 2 (haute): 8h dev + 4h QA = 12h
- Phase 3 (moyenne): 2h dev + 1h QA = 3h
- **TOTAL: ~21h** (~3 jours-homme)

### Q: Que faire si un test échoue?

**R:**
1. Vérifier la syntaxe TypeScript (virgules, accolades)
2. Vérifier que le champ est bien dans le bon schéma
3. Consulter les logs Fastify pour erreurs de sérialisation
4. Comparer avec `CORRECTIONS_SCHEMAS.ts` (exemple complet ligne 183-278)

---

## Support

### Ressources

- **Documentation Fastify:** https://www.fastify.io/docs/latest/
- **JSON Schema:** https://json-schema.org/
- **Prisma Schema:** `/packages/shared/schema.prisma`

### Contact

Pour questions techniques:
- Voir fichiers détaillés dans `/Users/smpceo/Documents/v2_meeshy/`
- Consulter `AUDIT_SCHEMAS_FASTIFY.md` pour analyse approfondie
- Référer `PLAN_TEST_SCHEMAS.md` pour tests spécifiques

---

**Document créé par:** Claude Sonnet 4.5
**Dernière mise à jour:** 2026-01-18
**Version:** 1.0.0

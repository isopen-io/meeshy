# Backend TypeScript Dead Code & Simplifications

**Périmètre :** `services/gateway/src/` (431 .ts) + `packages/shared/types|utils|encryption/` (95 .ts).
**Périmètre exclu :** tests, code généré Prisma, `apps/web/` (revu plus tard).

## Executive Summary

- **3 fichiers de routes orphelins** (~67 KB)
- **7 artefacts de backup/restore** laissés en arbre source (~80 KB)
- **10+ events Socket.IO `SERVER_EVENTS` déclarés et jamais émis** par le gateway (probables placeholders pour features futures)
- **2 routes commentées avec TODO** ouverts (timeouts au démarrage)
- **1 stub `@deprecated`** en middleware
- **Aucun export orphelin notable** dans `@meeshy/shared`
- **Aucun doublon de service** — la couche cache est correctement factorisée

**Confiance globale :** Haute (90 %) pour les artefacts fichier, Moyenne (70 %) pour les events Socket.IO (peuvent être consommés côté web/iOS).

---

## 1. Fichiers de routes orphelins (non importés dans `server.ts`)

| Fichier | Taille | Raison | Confiance |
|--------|--------|--------|-----------|
| `services/gateway/src/routes/affiliate-old.ts` | 14.7 KB | API affiliation legacy, remplacée par `affiliate.ts` | Haute |
| `services/gateway/src/routes/notifications-secured.ts` | ~29 KB | Variante sécurisée jamais importée ; `notifications.ts` est utilisée | Haute |
| `services/gateway/src/routes/health.ts` | 23.2 KB | Health checks définis inline dans `server.ts:848–866`, fichier jamais importé | Haute |

**Action recommandée :** supprimer les 3 fichiers. Si les améliorations de `notifications-secured.ts` (IDOR, validation) sont pertinentes, les rebaser sur `notifications.ts` puis supprimer.

---

## 2. Artefacts backup/restore (déchets de migration)

| Fichier | Type | Confiance |
|---------|------|-----------|
| `services/message-translation/MessageTranslationService.ts.before_restore` | Backup (~40 KB) | Haute |
| `services/AttachmentService.ts.old` | Ancienne version | Haute |
| `routes/communities.ts.backup` | Backup | Haute |
| `routes/auth.ts.backup` | Backup | Haute |
| `routes/user-features.ts.old` | Ancienne version | Haute |
| `routes/users.ts.backup` | Backup | Haute |
| `routes/admin.ts.backup` | Backup | Haute |

**Action :** supprimer tout. Git conserve l'historique ; les `.backup` dans l'arbre source sont un anti-pattern.

---

## 3. Routes désactivées avec TODO ouverts

| Emplacement | Motif (commentaire) | Lignes |
|-------------|---------------------|--------|
| `src/server.ts:998–1000` | `conversationEncryptionRoutes` : "TEMPORAIREMENT COMMENTÉ - timeout au démarrage" | 998–1000 |
| `src/server.ts:1003–1005` | `encryptionKeysRoutes` : "getEncryptionService prend trop de temps" | 1003–1005 |

**Recommandation :** soit corriger le timeout (init async lazy ?), soit retirer les imports et supprimer les fichiers concernés. Les routes commentées sont une dette de maintenance.

---

## 4. Events Socket.IO déclarés mais non émis depuis le gateway

Ces events sont exportés depuis `packages/shared/types/socketio-events.ts` mais **aucun `io.emit(...)`** correspondant dans `services/gateway/src/`.

| Event | Ligne | Statut probable |
|-------|-------|-----------------|
| `MESSAGE_PINNED` | 182 | Feature "épingler un message" non implémentée |
| `MESSAGE_UNPINNED` | 183 | Idem |
| `CALL_MISSED` | 136 | Feature appels Phase 1A MVP |
| `CALL_QUALITY_ALERT` | 137 | Monitoring qualité non livré |
| `CALL_TRANSLATED_SEGMENT` | 138 | Traduction d'appel future |
| `CALL_TRANSLATION_REQUESTED` | 139 | Idem |
| `CALL_TRANSLATION_ENABLED` | 140 | Idem |
| `CALL_TRANSCRIPTION_RESULT` | 141 | Transcription d'appel future |
| `CALL_ALREADY_ANSWERED` | 142 | Gestion d'état partielle |
| `CALL_SCREEN_CAPTURE_ALERT` | 143 | Détection screen capture non livrée |

**Confiance :** Moyenne — peuvent être des placeholders pour des phases ultérieures, ou consommés par le SDK iOS/web sans émetteur côté gateway pour l'instant.

**Recommandation :** **Avant suppression**, vérifier avec l'équipe produit/iOS. Sinon, regrouper dans une constante `FUTURE_EVENTS` documentée dans `CLAUDE.md` (phase d'introduction prévue).

---

## 5. Stub `@deprecated`

| Fichier | Fonction | Statut |
|---------|----------|--------|
| `middleware/auth.ts` | `requireActiveAccount()` | Marquée `@deprecated Not used by any route — stub kept for backward compatibility` |

**Action :** vérifier git blame, supprimer si aucun SDK ne l'appelle.

---

## 6. Simplifications potentielles

### 6.1 Couche cache (RISQUE FAIBLE — pas redondante)

Quatre stores apparents : `CacheStore.ts`, `MultiLevelCache.ts`, `MultiLevelJobMappingCache.ts`, `TranslationCache.ts`.
**Évaluation :** non redondants — chacun couvre un domaine distinct (auth, jobs, traductions, générique). Bien factorisé.

### 6.2 Exports `@meeshy/shared/utils`

`logger`, `sanitize`, `pagination`, `rate-limiter`, `response.ts` sont tous activement consommés (338+ imports). RAS.

### 6.3 Convention de nommage `entity:action-word`

Auditée sur les 77 events : conforme. Aucune incohérence détectée.

---

## 7. Métriques

| Métrique | Valeur |
|----------|--------|
| Fichiers .ts (gateway + shared, hors tests) | 526 |
| Routes orphelines | 3 |
| Artefacts backup/old | 7 |
| `SERVER_EVENTS` déclarés | 77 |
| `SERVER_EVENTS` effectivement émis | 67 |
| Events potentiellement non émis | 10+ |
| Services actifs | 56 |
| Handlers Socket.IO | 8 |
| Fichiers de types exportés (shared) | 46 |

---

## 8. Recommandations priorisées

### P0 — Cleanup immédiat (zéro casse)

1. **Supprimer les 7 fichiers `.backup`/`.old`** — git conserve l'historique
2. **Supprimer les 3 routes orphelines** (`affiliate-old.ts`, `notifications-secured.ts`, `health.ts`) après confirmation que `notifications-secured.ts` n'a pas d'amélioration à rebaser
3. **Résoudre les 2 routes commentées** (server.ts:998–1005) : fixer le timeout (init async lazy) ou supprimer

### P1 — Investigation requise

4. **Vérifier les 10+ events Socket.IO** avec produit/iOS avant suppression ; sinon regrouper dans `FUTURE_EVENTS` documentés
5. **Supprimer le stub `requireActiveAccount()`** si confirmé sans consommateur externe

### P2 — Refactoring optionnel

6. **Documenter la stratégie cache** dans `services/gateway/CLAUDE.md` (arbre de décision : quand `CacheStore` vs `MultiLevelCache`)
7. **Consolider notifications-secured.ts** dans `notifications.ts` si les améliorations sécurité valent le rebase

---

## Annexe — Commandes de suppression P0

```bash
# Artefacts backup/old (7 fichiers)
rm services/gateway/src/services/message-translation/MessageTranslationService.ts.before_restore
rm services/gateway/src/services/AttachmentService.ts.old
rm services/gateway/src/routes/communities.ts.backup
rm services/gateway/src/routes/auth.ts.backup
rm services/gateway/src/routes/user-features.ts.old
rm services/gateway/src/routes/users.ts.backup
rm services/gateway/src/routes/admin.ts.backup

# Routes orphelines (3 fichiers)
rm services/gateway/src/routes/affiliate-old.ts
rm services/gateway/src/routes/notifications-secured.ts
rm services/gateway/src/routes/health.ts
```

**Réduction estimée :** ~150 KB de code source, ~10 fichiers.

---

## Notes complémentaires

- Aucune dépendance circulaire détectée gateway/shared
- Aucun `any` introduit — `unknown` + validation Zod respectés
- Toutes les routes utilisent Zod
- Convention `entity:action-word` Socket.IO consistante
- Tous les services correctement injectés, pas de référence pendante

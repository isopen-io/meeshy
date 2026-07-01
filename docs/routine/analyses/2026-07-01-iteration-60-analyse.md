# Iteration 60 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 59 (« Source unique du temps restant avant expiration » — `formatTimeRemaining`, mergée
dans `main` : PR #1187 / `9efc7c6`). Continuation naturelle du **domaine expiration** : le prédicat
booléen « est-ce expiré ? » était lui aussi réimplémenté à l'identique partout. Piste disjointe des
tracks parallèles (initiales `getUserInitials`, iOS).

## Constat — 7 réimplémentations du prédicat « is expired »

Balayage `apps/web` : le motif `expiresAt && new Date(expiresAt) < new Date()` (ou sa variante
ternaire / `if (!x) return false`) apparaît **7 fois** dans **6 fichiers** :

| Fichier | Forme |
|---------|-------|
| `components/admin/user-detail/UserActivitySection.tsx:111` | `function isExpired` : `!!expiresAt && new Date(expiresAt) < new Date()` |
| `app/admin/share-links/page.tsx:145` | `const isExpired` : `if (!expiresAt) return false; return new Date(expiresAt) < new Date()` |
| `components/conversations/conversation-links-section.tsx:122` | `isLinkExpired(link)` : idem sur `link.expiresAt` |
| `components/affiliate/share-affiliate-modal.tsx:191` | inline `token.expiresAt && new Date(token.expiresAt) < new Date()` |
| `app/chat/[id]/page.tsx:92` | inline `data.link.expiresAt && new Date(...) < new Date()` |
| `app/links/page.tsx:282,302` | inline `link.expiresAt ? new Date(link.expiresAt) < new Date() : false` (×2) |

### Sémantique commune (vérifiée site par site)
**Tous** les sites gardent le cas nul en amont : `!!x &&` / `if (!x) return false` / `x ? … : false`.
→ `null`/absent = **`false`** (« pas d'expiration ») partout. Le prédicat est donc **strictement
identique** : `isExpired(x) = x != null && new Date(x).getTime() < now`.

### Problèmes (cohérence + état de l'art)
1. **Duplication ×7** d'un prédicat trivial mais à sémantique nulle subtile (`null` → not-expired).
2. **Risque de bug** : une copie « nue » `new Date(x) < new Date()` sans garde nulle traiterait
   `new Date(null)` (= 1970) comme **expiré** — piège évité ici, mais latent à chaque copie.
3. **Testabilité** : aucune copie n'injecte `now` → non déterministe, non testé.

## Décision iter 60 — lot « Source unique — prédicat d'expiration (F28b) »

Ajouter `isExpired(expiresAt, nowMs?)` à `apps/web/utils/time-remaining.ts` (déjà la source du
domaine expiration depuis iter 59) : `null`/absent/`NaN` → `false`, sinon `expiry < now`. Pure,
`now` injectable. Converger les 7 sites (suppression des fonctions locales `isExpired`/`isLinkExpired`,
remplacement des inline).

### Garanties de non-régression
- Équivalence **exacte** (sémantique nulle → false conservée sur les 7 sites).
- Test unitaire pur étendu : `isExpired` (5 cas : nul/undefined/vide, futur, passé, epoch/`Date`,
  date invalide) — total `time-remaining.test.ts` **13 cas**.
- Tests composants existants (`UserDetailSections`, `conversation-links-section`) : **250/250** vert.
- `tsc --noEmit` : aucune **nouvelle** erreur sur les 6 fichiers touchés (les erreurs `_TrendingUp` /
  `unknown` d'`app/links/page.tsx` sont **pré-existantes** sur `main`, hors périmètre).

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-c(c) | `app/u/[id]` initiales | FAIBLE | Track initiales parallèle (déjà mergé) |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain
Domaine **expiration** entièrement unifié dans `apps/web` : `formatTimeRemaining` (iter 59) +
`isExpired` (iter 60) forment une source unique pure et testée ; 7 réimplémentations supprimées, le
piège `new Date(null)` neutralisé. Prochain grain : `DeliveryQueueItemCard.formatCountdown`
(granularité seconde, si 2ᵉ site apparaît), slug/url, sanitize, validateurs téléphone (F25b).

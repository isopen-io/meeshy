# Iteration 58 — Analyse d'optimisation (2026-07-01)

## Contexte
Routine exécutée en **parallèle multi-agents**. Deux pistes distinctes ont occupé les slots
« iter 56/57 » dans `main` :
- **PR #1170** (`ea749a8a`) : initiales admin/users + fix gateway `createUnifiedAuthMiddleware`.
- **PR #1181** (`d627b28b`) : initiales famille contacts (`getUserInitials`).

Cette piste — « Source unique de la **classification du temps relatif** » — est **indépendante**
(fichiers disjoints) et a subi deux renumérotations de slot de docs (56→57→58) à cause de la
concurrence. Rebasée sur `d627b28b`, elle prend le slot **iter 58**. Le fix gateway qu'elle avait
aussi produit est déjà dans `main` (via #1170) → abandonné.

## Constat — réimplémentations locales de la classification « temps écoulé »

Source unique existante (iter 43) : `packages/shared/utils/relative-time.ts` →
`classifyRelativeTime(targetMs, nowMs, { beyondDays })`. Paliers déterministes :
`< 1 min → now` ; `< 60 min → minutes` ; `< 24 h → hours` ; `< beyondDays j → days` ; au-delà → `beyond`.

Consommateurs déjà convergés : `notification-helpers.ts`, `v2/transform-conversation.ts`,
`v2/FriendRequestCard.tsx`, `feed/PostsFeedScreen.tsx`.

Consommateurs **encore divergents** (réimplémentent `Math.floor(diff/60000)` … à la main) :

| Cible | Fonction | Paliers actuels | Équivaut à |
|-------|----------|-----------------|-----------|
| `components/admin/agent/AgentLiveTab.tsx` | `formatTimeAgo` | now / min / h / j (terminal) | `beyondDays: Infinity` |
| `components/contacts/ConversationDropdown.tsx` | `formatShortDate` | now / min / h / j(<7) / date absolue | `beyondDays: 7` |
| `components/ui/online-indicator.tsx` | tooltip inline | now / min / h / j (FR en dur) | `beyondDays: Infinity` |

Ces trois fichiers ne sont touchés ni par #1170 ni par #1181 → aucun conflit de code.

### Problèmes (cohérence + état de l'art)
1. **Réimplémentation triple** de la même arithmétique de paliers alors qu'une source unique pure et
   testée existe.
2. **Risque de dérive** de seuils (24 h vs 23 h, `< 7 j` vs `<= 7 j`, arrondis imbriqués).
3. **Maintenance N×** : tout ajustement de palier doit être répliqué.

### Équivalence de comportement (non-régression prouvée)
- `AgentLiveTab` / `online-indicator` : `floor(floor(diff/3.6e6)/24) == floor(diff/8.64e7)` (identité
  de division entière, délais positifs) → `days` identique ; pluriel `jour(s)` conservé via `value > 1`.
- `ConversationDropdown` : calcul direct `floor(diff/…)`, paliers identiques → `beyondDays: 7`,
  bucket `beyond` → même `toLocaleDateString`.
- Présentation (clés i18n, chaînes FR, `count`) **conservée à l'identique** ; seule la classification
  est déléguée.

## Décision iter 58 — lot « Source unique — classification du temps relatif (F27) »
Converger les trois réimplémentations restantes sur `classifyRelativeTime` sans changer la sortie
visible.

## Baseline runner (parité CI)
- `bun install` OK (postinstall prisma KO réseau, sans impact jest web — attendu).
- `AgentLiveTab.test.tsx` : **40/40** vert. Tests conversations (rendent `OnlineIndicator`) : **85/85**.
- `tsc --noEmit` : aucune erreur sur les 3 fichiers touchés.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F26c-c(c) | `app/u/[id]/page.tsx` `.slice(0,2)` → `getUserInitials` | FAIBLE | Piste initiales (#1181) |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain
Cluster **classification du temps relatif** unifié : plus aucune réimplémentation manuelle des paliers
de temps écoulé dans `apps/web`. Une seule source (`classifyRelativeTime`), seuils cohérents,
maintenance centralisée. Prochain grain : composants « countdown/expiry » (sémantique future, source
unique distincte à créer), ou domaine slug/url / sanitize / validateurs téléphone (F25b).

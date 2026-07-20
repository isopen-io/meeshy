# Iteration 58 — Analyse d'optimisation (2026-07-01)

## Contexte & incident de resynchronisation
Cette itération a démarré sur une **base périmée** (branche `claude/sharp-wozniak-6lwbw0`
partie du commit `a751730f`, alors que `main` avait avancé de **51 commits** jusqu'à `d627b28b`,
itération 57). Le travail initialement engagé (F23 — agrégation des non-lus) a été **déjà réalisé
et mergé sur `main` par une itération parallèle (iter 46 / F23b)**, avec une implémentation
**supérieure** : même approche « 1 `findMany` + dichotomie », mais qui corrige en plus un **bug
sémantique** (l'ancien prédicat `senderId ≠ <expéditeur du message>` sous-comptait — 0 non-lu sur
chaque message entrant en 1:1 — au lieu d'exclure les messages **propres** du participant,
`senderId ≠ p.id`, aligné sur `getUnreadCountsForUser`).

**Décision** : abandonner le lot F23 obsolète, resynchroniser la branche sur `origin/main`
(iter 57), et reprendre la routine à son état réel — **iteration 58**, dont la continuité est
explicitement désignée par le plan iter 57.

Leçon (consignée) : **toujours `git fetch origin main` et vérifier `rev-list --count HEAD..origin/main`
avant de choisir une cible** — le parallélisme multi-agents fait avancer `main` vite.

## Cible désignée par iter 57 — F26c-c(c)
Le plan iter 57 (§ Continuité) désigne : « Iter 58 : F26c-c(c) — `app/u/[id]/page.tsx:346`
`getUserDisplayName(user).slice(0,2)` → `getUserInitials` (dernière `.slice(0,2)` d'initiale
d'identité) ».

### Constat vérifié
`apps/web/app/u/[id]/page.tsx:346` est la **dernière** occurrence de dérivation d'initiales par
troncature brute dans `apps/web` :
```tsx
<AvatarFallback ...>{getUserDisplayName(user).slice(0, 2).toUpperCase()}</AvatarFallback>
```
Vérifié par balayage : `grep "DisplayName(...).slice(0,2)"` sur `apps/web/**/*.tsx` ne renvoie
**que** cette ligne. La famille contacts (iter 57) et admin/users (iter 56) ont déjà convergé vers
`getUserInitials`.

### Pourquoi c'est une vraie amélioration (pas qu'un refactor)
- `slice(0,2)` sur le nom affiché produit de **fausses initiales** : « John Doe » → « JO » (deux
  premières lettres du prénom) au lieu de « JD ».
- `getUserInitials` (`@/lib/avatar-utils`) dérive du **nom résolu canonique** (`resolveDisplayName`)
  découpé par le canonique `getInitials` (mot unique → 2 car., multi-mot → 1ʳᵉ du 1er + 1ʳᵉ du
  dernier, uppercase, null/crash-safe). Les initiales **correspondent au nom affiché** et sont
  **cohérentes avec tout le produit**.
- Cohérence de source : le `getUserDisplayName` local (l.251) **et** `getUserInitials` délèguent
  au **même** `resolveDisplayName` — les initiales suivent exactement le nom affiché (l.363).

## Décision iter 58 — lot « Source unique des initiales — profil public — F26c-c(c) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | `app/u/[id]/page.tsx` : import `getUserInitials` ; l.346 `getUserDisplayName(user).slice(0,2).toUpperCase()` → `getUserInitials(user)` | Vraies initiales cohérentes ; **dernière** troncature d'initiale d'identité éliminée dans web |

## Consignés pour itérations futures
- **F26c-e** : nom de conversation (initiales) si une troncature subsiste.
- **F25b**, **F2** (`SOCKET_LANG_FILTER`, staging), **F10** (`conversationId` scalaire/index,
  backfill), **F21** (sémantique `isActive`/`deactivatedAt`/`deletedAt`, backfill).

## Gain estimé global
Élimination de la **dernière** dérivation d'initiales par `.slice(0,2)` d'un nom d'identité dans
`apps/web` : initiales correctes (« JD » et non « JO ») et **cohérentes** avec le reste du produit
(contacts iter 57, admin iter 56), via la source unique `getUserInitials`. Changement purement de
présentation, sans impact réseau/DB.
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

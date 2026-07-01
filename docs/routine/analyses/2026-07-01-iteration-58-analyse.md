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

# Plan — Itération 57w (web)

## Base
- Repartir de `main` HEAD `f8c91d6` (post-merge #771 iter-56w + #675 dependabot).
- Branche de travail : `claude/practical-fermat-1bs0bb` (assignée).

## Objectif
i18n complète du lecteur de reels immersif `components/feed/ReelPlayer.tsx` :
13 chaînes FR figées (majoritairement `aria-label`/`sr-only`) affichées en TOUTES
langues — rupture Prisme + a11y dégradée pour les lecteurs d'écran. Surface de
contenu partagée (feed/reels, deep-link reel). Parité avec iOS `ReelsPlayerView`
(a11y localisée).

## Étapes
1. [x] `locales/{en,fr,es,pt}/reel.json` → sous-bloc `player` (12 clés).
2. [x] `ReelPlayer.tsx` → `useI18n('reel')` + 13 swaps `t()` ; `reelBy` factorisé.
3. [x] Vérif : aucune FR résiduelle ; parité 12 clés ×4 ; JSON valide ×4.
4. [x] Annoter analyse + `branch-tracking.md` (+ corriger état 56w → ✅ #771).
5. [ ] Commit + push ; PR ; merge dans `main` après CI vert ; supprimer la branche.

## Contraintes
- Fallbacks EN en 2e arg pour chaînes simples (anti-flash, leçon 50w).
- Clés à paramètre (`position {index,total}`, `reelBy {name}`) : params seuls
  (signature `t()` exclusive params OU fallback).
- Diffs locale strictement additifs (11 clés 53wb existantes intactes).
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (58w+)
Conteneur feed (`ReelsFeedScreen`/`PostsFeedScreen`) — chaînes restantes ;
`app/settings/loading.tsx` (server component → i18n server-side) ; console.error
FR (logs dev) ; `next-themes` orphelin.

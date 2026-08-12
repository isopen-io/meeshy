# Plan — Itération 57w (web)

## Base
- Repartir de `main` HEAD `652cdf1` (post-merge #771 iter-56w).
- Branche de travail : `claude/practical-fermat-c6vris`.

## Objectif
Attaquer le différé borné « ReelPlayer/feed non internationalisé » (53w) par son
volet le plus self-contained : i18n du lecteur de reels plein écran
`components/feed/ReelPlayer.tsx` (13 chaînes FR figées, aucun hook i18n) —
rupture Prisme Linguistique + a11y (aria-labels FR en TOUTES langues) sur une
surface partagée fil + deep-link `/reel/[postId]`.

## Étapes
1. [x] `locales/{en,fr,es,pt}/reel.json` → bloc additif `player` (12 clés).
2. [x] `ReelPlayer.tsx` → `useI18n('reel')` + 13 `t()` (boutons visibles + aria).
3. [x] Vérif parité clés ×4 locales + validité JSON + grep FR résiduel (vide).
4. [x] Annoter analyse (`docs/analyses/uiux/2026-06-22-iteration-57w.md`) +
   `branch-tracking.md`.
5. [ ] Commit + push + PR ; merge dans `main` après CI vert ; supprimer la branche.

## Contraintes
- Fallbacks EN en 2e arg de `t()` pour les 10 chaînes simples (anti-flash, leçon 50w).
- 2 clés à paramètre (`position` `{current}/{total}`, `byAuthor` `{name}`) :
  params seuls (signature t() exclusive), toutes deux sur surfaces non visibles
  (aria/sr-only/alt) → zéro flash visible ; parité ×4.
- Namespace `reel` réutilisé (mutualisation avec la page deep-link), bloc additif.
- Diffs locale strictement additifs (round-trip JSON, aucune clé existante touchée).
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (58w+)
`ReelsFeedScreen.tsx` (~15 chaînes, borné), `PostsFeedScreen.tsx` (~30, large +
incohérence FR/EN à unifier), `app/settings/loading.tsx` (server component →
i18n server-side), console.error FR (logs dev), `next-themes` orphelin.
</content>

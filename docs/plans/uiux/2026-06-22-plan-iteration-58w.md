# Plan — Itération 58w (web)

## Base
- Repartir de `main` HEAD `0eba968` (post-merge #776 iter-56wb).
- Branche de travail : `claude/practical-fermat-ihammv`.

## Objectif
Solder le volet borné suivant du différé feed (53w/57w) : i18n de l'écran
conteneur `components/feed/ReelsFeedScreen.tsx` (9 chaînes FR figées) — toasts de
partage, titre d'onglet, et l'intégralité des états non-nominaux (chargement /
erreur / vide) avec leurs boutons. Rupture Prisme Linguistique + a11y (sr-only FR
en TOUTES langues). Le `ReelPlayer` enfant est déjà soldé (57w).

## Étapes
1. [x] `locales/{en,fr,es,pt}/reel.json` → bloc additif `feed` (7 clés). Les 2
   toasts de partage réutilisent `reel.linkCopied`/`linkCopyError` existants.
2. [x] `ReelsFeedScreen.tsx` → `useI18n('reel')` + 9 `t()` (2 réutilisés + 7
   `feed.*`) ; `t` ajouté aux deps `onShare`/`content`.
3. [x] Vérif parité clés ×4 locales (0 missing/extra) + validité JSON + grep FR
   résiduel (vide).
4. [x] Annoter analyse (`docs/analyses/uiux/2026-06-22-iteration-58w.md`) +
   `branch-tracking.md`.
5. [ ] Commit + push + PR ; merge dans `main` après CI vert ; supprimer la branche.

## Contraintes
- Fallbacks EN en 2e arg de `t()` pour les 9 chaînes (anti-flash, leçon 50w).
- Namespace `reel` réutilisé (mutualisation avec `ReelPlayer` 57w + page deep-link
  53wb), bloc additif `feed.*` ; toasts existants non dupliqués.
- Diffs locale strictement additifs (round-trip JSON, aucune clé existante touchée).
- Pattern calqué 1:1 sur `app/reel/[postId]/page.tsx` (surface jumelle prod).
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (59w+)
`PostsFeedScreen.tsx` (~30, **large** + incohérence FR/EN à unifier — seul gros
reliquat feed), `app/settings/loading.tsx` (server component → i18n server-side),
design-system v2 reste 56wb (Badge off-palette, gestes/a11y modales hand-rolled),
console.error FR (logs dev), `next-themes` orphelin.

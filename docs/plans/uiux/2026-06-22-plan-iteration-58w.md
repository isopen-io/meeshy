# Plan — Itération 58w (web)

## Base
- Repartir de `main` HEAD `98f2ce5` (post-merge #774 iter-57w + #776 iter-56wb).
- Branche de travail : `claude/practical-fermat-mrz8qr` (repivotée depuis #782, fermée doublon).

## Objectif
Solder le volet borné suivant du différé feed (53w) : i18n de l'**écran conteneur**
`components/feed/ReelsFeedScreen.tsx` (9 chaînes FR figées en TOUTES langues — toasts
copie-lien, états vide/erreur/chargement, titre de page `DashboardLayout`). Le player
embarqué est déjà i18n (57w/#774).

## Étapes
1. [x] `locales/{en,fr,es,pt}/reel.json` → bloc additif `feed` (7 clés) ;
   réutiliser `linkCopied`/`linkCopyError` existantes pour les 2 toasts.
2. [x] `ReelsFeedScreen.tsx` → `useI18n('reel')` ; 2 toasts + 6 chaînes d'état +
   `title` `DashboardLayout` via `t()` ; `t` ajouté aux deps de `content` (useMemo).
3. [x] Vérif : grep FR résiduel (vide) + parité clés ×4 + validité JSON.
4. [x] Annoter analyse + `branch-tracking.md`.
5. [ ] Commit + push + PR ; merge dans `main` après CI vert ; supprimer la branche.

## Contraintes
- Fallbacks EN en 2e arg de `t()` (anti-flash, leçon 50w) — toutes chaînes simples.
- Namespace `reel` réutilisé (cohérent avec player 57w + page deep-link) ; bloc additif.
- Diffs locale strictement additifs (round-trip JSON, aucune clé existante touchée).
- `title="Reels"` localisé pour aligner la convention `DashboardLayout title={t(...)}`.
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (59w+)
`PostsFeedScreen.tsx` (~30, large + incohérence FR/EN), `me/page.tsx` `title="Mon profil"`,
`app/settings/loading.tsx` (server component), console.error FR, `next-themes` orphelin.

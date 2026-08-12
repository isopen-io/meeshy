# Plan — Itération 57wb (web)

**Base** : `main` HEAD post-merge iter-57w (#774)
**Branche de travail** : `claude/practical-fermat-9erhxj`
**Périmètre** : i18n de l'écran `/feed/reels` (`ReelsFeedScreen.tsx`) — complément du 57w

> Renuméroté 57w → **57wb** : 57w (`ReelPlayer.tsx`, #774) livré par un agent parallèle
> pendant ce run. Périmètres disjoints — `ReelPlayer` (lecteur) vs `ReelsFeedScreen` (écran).

## Objectif
Solder le **volet écran** du sous-cluster reels (le volet lecteur est soldé par #774).
`ReelsFeedScreen.tsx` n'avait aucun hook i18n : 8 chaînes FR figées (toasts + états).

## Étapes
1. [x] Resync sur `main` ; détecter la collision #774 (ReelPlayer) ; abandonner le volet dupliqué.
2. [x] `ReelsFeedScreen.tsx` : `useI18n('reel')` + toasts → `linkCopied`/`linkCopyError` (réutilisés) + états → `t('feed.*')` (6 clés) ; `t` aux deps `useMemo`/`useCallback`.
3. [x] `reel.json` ×4 locales : ajout bloc `feed` (6 clés), additif (bloc `player` du #774 intact).
4. [x] Cross-check clés code ⊆ clés locales (0 manquante) ; parité 6 ; JSON valide ×4.
5. [ ] Commit + push sur `claude/practical-fermat-9erhxj`.
6. [ ] PR → `main` ; CI ; merge ; supprimer la branche feature.
7. [ ] Mettre à jour `branch-tracking.md` (Next → 58 ; history 57wb ✅).

## Clés ajoutées (`reel.json` → bloc `feed`, ×4 locales)
- `feed.{loadingReels,errorTitle,retry,emptyTitle,emptyBody,seePosts}` (6)
- réutilisées : `linkCopied`, `linkCopyError`

## Risques / notes
- Sandbox sans `node_modules` → validation = cross-check clés + parité + JSON valide ; CI confirme le build.
- `Test web` historiquement rouge sur `main` (préexistant, deps non déclarées) — hors périmètre de ce lot i18n.

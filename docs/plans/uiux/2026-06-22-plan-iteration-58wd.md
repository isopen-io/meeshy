# Plan — Iteration 58wd (web)

## Objectif
Solder le **dernier gros reliquat** du différé « surface feed non internationalisée » (cluster 53w) : l'écran `/feed/posts`.

## Contexte — pivot + renumérotation
- Volet lecteur `ReelPlayer` → 57w (#774) ; volet écran reels `ReelsFeedScreen` → 57wb (#780).
- Cible 58w initiale (ReelsFeedScreen) livrée en parallèle par 57wb → abandon du doublon, **pivot** vers `PostsFeedScreen` (PR #781 repurposé).
- Numéros 58w (modales a11y) et 58wc (ConversationSettingsModal #784) pris en parallèle → ce travail = **58wd**.

## Périmètre
- `components/feed/PostsFeedScreen.tsx` (+ `FeedTabs`) — `useI18n('feed')`
- `locales/{en,fr,es,pt}/feed.json` — **nouveau namespace** (47 clés)

## Méthode
- Namespace dédié `feed` ; `formatRelativeTime(date, t)` paramétré ; fallbacks EN 2e arg (anti-flash 50w) ; clés paramétrées (`{count}`/`{id}`/`time.*`) sans fallback (parité ×4) ; `t` aux deps `useCallback`.

## Exclusions (NE PAS re-flagger)
- `mockStatuses` (démo « to be replaced ») ; onglet marque `Reels` littéral.

## Vérifications
- JSON valide ×4, parité 47 ×4 ; grep résiduel = 3 lignes mock ; CI Quality + Test web verts.

## Suite (59w+)
Cluster feed soldé. Candidats : `next-themes` orphelin (isolé), focus-trap dialogues (58w modales), `Badge` off-palette (arbitrage tokens), `app/settings/loading.tsx` (server i18n), audit qualité es/pt.

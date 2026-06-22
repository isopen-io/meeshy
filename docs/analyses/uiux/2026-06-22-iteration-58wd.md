# Analyse — Iteration 58wd (web)

## Revue préalable (anti-duplication)
Congestion d'agents parallèles élevée ce run. État de `main` au moment du merge :
- Cluster feed : `ReelPlayer` (57w #774), `ReelsFeedScreen` (57wb #780) **soldés**.
- 58w (a11y/gestes modales, autre agent) + 58wc (ConversationSettingsModal #784) mergés en parallèle.
- **Doublon évité** : la cible 58w initiale de CE run (`ReelsFeedScreen`) avait été livrée par 57wb pendant le run → implémentation abandonnée, PR #781 **repurposé** vers le volet réellement restant : `PostsFeedScreen`.
- **Renumérotation 58w→58wd** : 58w (modales) et 58wc (settings) déjà pris sur `main`. Périmètre `PostsFeedScreen` **disjoint** de tous → conservé.

## Constat
`components/feed/PostsFeedScreen.tsx` (+ `FeedTabs`, `/feed/posts` + alias `/feeds`) — gros écran (story tray + status bar + composers + liste + 5 modales). **Aucun hook i18n.** ~40 chaînes figées avec **incohérence FR/EN** : toasts FR (`Story publiée !`, `Lien copié !`, `Publié !`…) mélangés à de l'UI EN dure (`Updating...`, `Unable to load feed.`, `No posts yet…`, `Retry`, `Feed`, `new posts`, `Unknown`) + `aria-label`/`sr-only`/sections FR + `formatRelativeTime` FR.

## Correction
- Namespace dédié **`feed.json`** ×4 locales (47 clés à parité).
- `useI18n('feed')` sur `PostsFeedScreen` **et** `FeedTabs` (composant exporté séparé → propre hook).
- `formatRelativeTime(date, t)` reçoit `t` → `time.{now,minutes,hours,days}` paramétrées.
- Fallbacks EN 2e arg (anti-flash, 50w) ; clés paramétrées sans fallback (parité ×4).
- `t` ajouté aux deps des `useCallback`.

## Exclusions documentées (NE PLUS re-flagger)
- `mockStatuses` : données démo placeholder « to be replaced » — pas du chrome UI.
- Onglet `Reels` (marque) littéral, cohérent avec `ReelsFeedScreen` (57wb).

## Vérifications
- JSON valide ×4 ; parité 47 clés ×4 (script flatten : 0 manquante/extra).
- Grep résiduel : seules les 3 lignes mock.
- CI : Quality (bun) ✅, Test web ✅ (lint+typecheck+tests web verts). `TranslateFn` typée, aucun `any`.

## Statut : ✅ COMPLET — NE PLUS RE-FLAGGER
`PostsFeedScreen.tsx`/`FeedTabs` + `feed.*` entièrement internationalisés. **Cluster feed 53w intégralement soldé** (player 57w + reels screen 57wb + posts screen 58wd).

## Incident de run (traçabilité)
1. CI ne créait aucun run tant que le PR était en conflit (`mergeable_state: dirty`, ref de merge non calculable) — root cause de l'absence de CI, résolu par sync sur main.
2. Livelock de contention : `main` avançait (agents parallèles, conflits récurrents sur `branch-tracking.md`) plus vite que le CI (~20 min) → re-syncs successifs + renumérotations (58w→58wd).
3. `Test Python (translator)` rouge sur le run #3933 = **préexistant/flaky** (web-only diff sans couplage Python ; jobs translator frères Audio/Voice/TTS verts ; `main` lui-même rouge sur plusieurs commits récents). Re-run impossible (403 integration). Hors périmètre.

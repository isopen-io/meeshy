# Plan — Iteration 48w (2026-06-12)

## Objectif
Réparer la résolution de thème programmatique (next-themes sans provider) et solder le
lot « charts dark mode » différé depuis 45w (RankingStatsImpl, MermaidDiagramImpl,
AgentOverviewTab) + i18n des strings FR découvertes dans ces fichiers.

## Étapes
- [x] Audit continuité : analyses 1→47w relues, complétude analyses/plans vérifiée, pas de doublon
- [x] Analyse 48w écrite (`docs/analyses/uiux/2026-06-12-iteration-48w.md`)
- [x] TDD : test `__tests__/hooks/use-resolved-theme.test.tsx` (light/dark direct, auto +
      matchMedia, réaction au changement de préférence système)
- [x] Hook `hooks/use-resolved-theme.ts` : `useResolvedTheme(): 'light' | 'dark'` depuis
      le store Zustand (`useTheme`) + listener `matchMedia` pour `auto`
- [x] Remplacer `useTheme` de `next-themes` par `useResolvedTheme` dans :
      `MarkdownMessage.tsx`, `MarkdownViewer.tsx`, `TextViewer.tsx`, `ui/sonner.tsx`
- [x] `RankingStatsImpl.tsx` : palette ambre théma-consciente (grid/axes/tooltips) +
      i18n titres/descriptions/labelFormatter → `ranking.stats*`
- [x] `MermaidDiagramImpl.tsx` : `theme: 'dark'|'default'` selon thème résolu,
      ré-initialisation au changement (flag `initializedTheme`)
- [x] `AgentOverviewTab.tsx` : pie théma-conscient + `agent.overview.kpi.inactive`
- [x] Locales fr/en/es/pt `admin.json` : +6 clés `ranking.stats*` + 1 clé `kpi.inactive`,
      parité vérifiée par script
- [x] Vérif : jest hooks + composants touchés, tsc ciblé, grep zéro `next-themes` résiduel
      hors v2, zéro string FR dure résiduelle dans les fichiers touchés
- [x] Commit + push `claude/elegant-noether-1kozqp`, PR, CI vert, merge main
- [x] Mettre à jour `branch-tracking.md` (état 48w, carry-over 49+)

## Décisions
- `next-themes` non monté = bug, pas une feature : on substitue par un hook maison branché
  sur le système de thème réel (store Zustand + classe `dark`) plutôt que de monter le
  provider next-themes (qui dupliquerait la source de vérité du thème).
- `/v2` garde son ThemeProvider propre (système assumé, storage `gp-theme-mode`) — hors scope.
- Fills podium (or/argent/bronze) conservés tels quels : lisibles sur les deux fonds.
- `RANKING_CRITERIA.label` (constants) : non traité ici, tracé en carry-over 49+.

## Continuité (49+)
Carry-over : retrait dépendance orpheline `next-themes` (lockfile), RANKING_CRITERIA labels,
consolidation notifications/preferences, réactions par pièce jointe, deep links v2,
swipe-back mobile, audit dark admin (reste), audit es/pt ; carry-over iOS/Android non touché
(itération web-only). `useI18n.ts` = re-export de `use-i18n.ts` (pas un doublon — vérifié).

## ✅ Résultat
Itération soldée — hook `useResolvedTheme` (6 tests verts), 4 consommateurs next-themes
réparés, 3 surfaces charts théma-conscientes, +6 clés ranking + 1 clé kpi ×4 locales
(parité 1698 clés vérifiée par script). Échecs jest/tsc restants : préexistants sur main
(résolution ESM @meeshy/shared en local, TS5101 tsconfig), identiques avant/après.

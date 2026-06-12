# Plan — Iteration 47w (2026-06-12) — Web exclusivement

Réf : `docs/analyses/uiux/2026-06-12-iteration-47w.md`
Branche : `claude/elegant-noether-0bs5fe` (synchronisée avec main post-#605/#608)

## 1. Locales (en/fr/es/pt — admin.json)
- [x] `agentConfig.*` : +122 clés (labels, tooltips `*Help`, hints, placeholders, options
      select, sections, unités, boutons) — interpolations `{count}`, `{percent}`, `{factor}`,
      `{total}`, `{active}`, `{excluded}`, `{hours}`
- [x] `llm.*` : +6 clés `*Help` (provider, model, temperature, maxTokens, dailyBudget,
      maxCostPerCall)
- [x] `globalConfig.*` : +15 clés `*Help` + `systemPromptPlaceholder`
- [x] Parité 4 locales vérifiée par script (201 clés sur les 3 sections, 0 manquante/extra)

## 2. Composants
- [x] `AgentConfigDialog.tsx` : 122 remplacements → `t('agentConfig.*')`,
      footer → `tCommon('cancel')`/`tCommon('save')`/`t('agentConfig.create')`
- [x] `AgentLlmTab.tsx` : 6 tooltips → `t('llm.*Help')`
- [x] `AgentGlobalConfigTab.tsx` : 16 remplacements → `t('globalConfig.*')`
- [x] NE PAS toucher : codes rôles, providers/modèles, placeholders techniques
      (`sk-...`), badge `@deprecated`, `agent.overview.conversationType.*` (déjà i18n)

## 3. Hygiène documentaire
- [x] Doublons : aucun nouveau ; faux positifs footer (1/3/5/7/8/33) documentés dans l'analyse
- [x] Couverture analyses → plans : 1–47w complète, aucune orpheline
- [x] `branch-tracking.md` : 46w marquée mergée (#605), Current State → 47w,
      carry-over purgé du lot agent.config

## 4. Vérification & merge
- [x] `tsc --noEmit` : 0 erreur dans les fichiers touchés (~1100 préexistantes hors périmètre,
      documentées dans l'analyse) ; clés `t()` référencées toutes résolues (script de
      cross-check) ; parité JSON 4 locales OK
- [ ] Commit + push `claude/elegant-noether-0bs5fe`, PR vers main, merge après CI
- [ ] Mise à jour branch-tracking post-merge (Next : 48w depuis main), suppression branche

## Carry-over pour 48w
- chart hex dark (RankingStatsImpl, MermaidDiagramImpl, AgentOverviewTab)
- consolidation notifications/preferences ; réactions par pièce jointe ; audit es/pt
- deep links `/v2/chats?id=`, swipe-back mobile web, audit dark pages admin

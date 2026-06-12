# Plan — Iteration 47w (2026-06-12)

## Objectif
Solder le différé majeur admin agent : migration i18n complète d'`AgentConfigDialog` +
tooltips `AgentLlmTab` / `AgentGlobalConfigTab`, 4 locales (fr/en/es/pt), namespace `admin`.

## Étapes
- [x] Audit continuité : analyses 40–46w relues, carry-over web vérifié, pas de doublon
- [x] Analyse 47w écrite (`docs/analyses/uiux/2026-06-12-iteration-47w.md`)
- [x] Locales : +~122 clés `agentConfig.*`, +6 `llm.*Help`, +17 `globalConfig.*` dans
      fr/en/es/pt `admin.json` (script d'injection, `ensure_ascii=False`, ordre stable)
- [x] `AgentConfigDialog.tsx` : remplacer toutes les strings FR dures par `t('agentConfig.*')`,
      footer → `tCommon('cancel')`/`tCommon('save')`/`t('agentConfig.createButton')`,
      compteurs/échelles via interpolation `{param}`
- [x] `AgentLlmTab.tsx` : 6 InfoIcon → `t('llm.label*Help')`
- [x] `AgentGlobalConfigTab.tsx` : 15 InfoIcon + placeholder → `t('globalConfig.*Help')`
- [x] Vérif : parité des jeux de clés entre les 4 locales (script), grep zéro string FR dure
      résiduelle dans les 3 composants, lint/tests web ciblés
- [x] Commit + push `claude/blissful-ritchie-8d57jg`, PR, CI vert, merge main
- [x] Mettre à jour `branch-tracking.md` (état 47w, carry-over 48+)

## Décisions
- Étendre `agentConfig.*`/`llm.*`/`globalConfig.*` existants (suffixe `*Help`) plutôt que
  créer `agent.config.*` — cohérence avec la migration partielle déjà mergée.
- Codes rôles (USER/ADMIN/…) et noms providers/modèles : non traduits (invariants).
- Pluriels topics : clés paramétrées `topicsAllEligible`/`topicsPartialEligible`
  (`{active}/{total}/{excluded}`), formes « topic(s) » neutres valables dans les 4 langues.

## Continuité (48+)
Carry-over inchangé hors lot soldé : charts hex dark (RankingStatsImpl, MermaidDiagramImpl,
AgentOverviewTab), réactions par pièce jointe, deep links v2, swipe-back mobile, audit dark
admin, audit qualité es/pt ; carry-over iOS/Android non touché (itération web-only).

## ✅ Résultat
Itération soldée — voir footer de l'analyse 47w. PR mergée dans main (auto-merge une fois CI vert).

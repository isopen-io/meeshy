# Plan — Itération 288 : canonicaliser le dédup des cibles de traduction audio

## Objectifs
Converger les deux diffeurs de cibles NLLB verbatim du gateway
(`AttachmentTranslateService`, `AudioTranslateService`) sur la SSOT
`normalizeLanguageForDedup`, via un helper partagé unique.

## Modules affectés
- `services/gateway/src/utils/translation-targets.ts` (nouveau — raccord SSOT)
- `services/gateway/src/utils/__tests__/translation-targets.test.ts` (nouveau)
- `services/gateway/src/services/AttachmentTranslateService.ts` (câblage)
- `services/gateway/src/services/AudioTranslateService.ts` (câblage)

## Phases
1. **RED** — témoins du helper (dédup région/casse, strip région irréductible,
   `wasRequested`). Prouvé aussi contre la logique verbatim (`node -e`).
2. **GREEN** — implémenter `diffTranslationTargets` composant la SSOT.
3. **Câblage** — remplacer `languagesToTranslate` et les trois filtres de cache
   dans les deux services par `diff.missing` / `diff.wasRequested`.
4. **Validation** — `tsc --noEmit`, trois suites, grep anti-verbatim.

## Dépendances
`packages/shared/utils/language-normalize.ts` (`normalizeLanguageForDedup`) —
déjà construit (`bun run build` du package shared).

## Risques estimés
Très faibles — convergence pure, codes canoniques envoyés au translator (déjà
canonicalisés côté fil par `ZmqRequestSender`). Aucune fuite, aucun schéma touché.

## Stratégie de rollback
Revert du commit unique — helper autonome, câblage localisé.

## Critères de validation
- RED prouvé + GREEN 136/136 (trois suites).
- `tsc --noEmit` EXIT=0.
- Zéro comparaison verbatim résiduelle.

## Statut d'achèvement
LIVRÉ. Les deux dernières jumelles verbatim de dédup de cibles de traduction du
gateway passent par la SSOT.

## Suivi / améliorations futures
- Aligner la branche anonyme de `MessageTranslationService._extractConversationLanguages`
  (ligne 907, repli sans strip région) sur `normalizeLanguageForDedup`.

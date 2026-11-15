# Plan — Itération 288 : canonicaliser les compteurs de langue d'une conversation

## Objectifs
Faire passer les quatre sites de comptage par langue de `ConversationStatsService`
(`messagesPerLanguage` + `participantsPerLanguage`) par la SSOT
`normalizeLanguageForDedup` avant de bucketiser, à parité avec `spokenLanguages`
(`routes/anonymous.ts`) et `PostService.audienceLanguages` (itération 287). Extension
directe de la liste « Améliorations futures » du plan 287 (agrégateurs de
`systemLanguage`/`originalLanguage` verbatim restants).

## Modules affectés
- `services/gateway/src/services/ConversationStatsService.ts` — import SSOT +
  helper `canonicalStatLanguage` + 4 sites de comptage.
- `services/gateway/src/__tests__/unit/services/ConversationStatsService.test.ts`
  — 4 témoins de canonicalisation.

## Phases
1. **RED** — 4 témoins (messages région/casse sommés, participants membres,
   incrément à chaud, participants conversation globale). Prouvés ROUGES sous
   canonicalisation neutralisée (`code => code`).
2. **GREEN** — importer `normalizeLanguageForDedup`, canonicaliser chaque clé ;
   le groupBy SOMME (`+= _count._all`) au lieu d'assigner.
3. **Validation** — 2 suites `ConversationStatsService`, consommateurs relus.

## Dépendances
Aucune. `normalizeLanguageForDedup` existe déjà (`packages/shared`).

## Risques estimés
Très faibles. `ConversationStats` inchangé de forme — seules les CLÉS des deux
cartes deviennent canoniques. Tous les consommateurs (`ConversationHandler`,
`MessageHandler`, `MeeshySocketIOManager`, `messagePostSaveEffects`, routes
advanced-edit/delete) passent la carte telle quelle ; aucun ne clé sur une valeur
brute. Aucune frontière réseau ni schéma modifié.

## Stratégie de rollback
Revert du commit unique — service isolé, sans état persistant ni migration.

## Critères de validation
- 4 témoins RED contre canonicalisation neutralisée, 64/64 GREEN (2 suites).

## Statut
COMPLÉTÉ — implémenté, validé, poussé sur `claude/brave-archimedes-8wi7pq`.
Merge sur `main` par le flux curé (beta) du porteur.

## Améliorations futures (non traitées ici)
- `apps/web/hooks/useMessageTranslation.ts:163` — `languagesUsed` par `new Set`
  de codes bruts (stat locale d'affichage). Impact faible, client, non-Prisme.
- Pipeline AUDIO (`AudioTranslateService`, `MessageTranslationService`) comparant
  `options.targetLanguages` verbatim aux clés stockées : dédup contournable par un
  client envoyant `'en-US'`. Classe distincte (cibles de traduction) — issue à ouvrir.
- Reste de la liste du plan 287 : `broadcast-recipients.ts`, `admin/broadcasts.ts`
  (`where.systemLanguage.in`), `admin/languages.ts` groupBy (requêtes Prisma
  contre valeurs persistées verbatim).

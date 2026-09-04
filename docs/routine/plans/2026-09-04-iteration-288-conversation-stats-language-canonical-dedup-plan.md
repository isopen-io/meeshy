# Plan — Itération 288 : canonicalisation des agrégats de langue de `ConversationStatsService`

## Objectifs
Faire passer les DEUX cartes par langue des statistiques de conversation
(`messagesPerLanguage`, `participantsPerLanguage`) et leur jumeau incrémental par
la SSOT de canonicalisation `normalizeLanguageForDedup`, pour que les variantes
région-taguées/casse-mixte d'une même langue comptent pour UNE, non plusieurs.

## Modules affectés
- `services/gateway/src/services/ConversationStatsService.ts` (production)
- `services/gateway/src/__tests__/unit/services/ConversationStatsService.languageCanonical.test.ts` (nouveau, témoins)

## Phases d'implémentation
1. **RED** — écrire `ConversationStatsService.languageCanonical.test.ts` (5 témoins)
   et prouver l'échec contre l'implémentation verbatim. ✅
2. **GREEN** — importer `normalizeLanguageForDedup` ; canonicaliser + accumuler +
   sauter les vides sur les quatre sites de comptage (`computeStats` × 3,
   `updateOnNewMessage` × 1). ✅
3. **REFACTOR** — commentaires expliquant le fold/accumulation/saut ; aucune
   extraction (surface < 10 lignes touchées). ✅

## Dépendances
- SSOT `packages/shared/utils/language-normalize.ts` (`normalizeLanguageForDedup`),
  déjà construite et consommée ailleurs dans le gateway.

## Risques estimés
- Très faible. Transformation idempotente et convergente. Aucun changement de
  frontière réseau ni de schéma. Le passe-plat d'affichage `onlineUsers[].systemLanguage`
  est délibérément hors périmètre.

## Stratégie de rollback
- Revert du commit unique : le lot est isolé à un fichier de production + un fichier
  de test.

## Critères de validation
- 5 témoins RED → GREEN, 65/65 des suites `ConversationStatsService*`,
  241/241 des consommateurs, `tsc --noEmit` EXIT=0.

## Statut d'achèvement
- **LIVRÉ.** Commit sur `claude/brave-archimedes-i7ets5`.

## Suivi / améliorations futures
Voir la section « Améliorations futures » de l'analyse : `ZmqRequestSender:85`
(piège armé), filtre REST de bande passante (jumeau du chemin socket), et les
`groupBy` admin par `systemLanguage`. Chacun est un lot indépendant d'une itération
suivante.

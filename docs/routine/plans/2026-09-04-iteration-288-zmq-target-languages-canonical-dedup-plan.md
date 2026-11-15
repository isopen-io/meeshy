# Plan — Itération 288 : canonicaliser les langues cibles du sender ZMQ

## Objectifs
Faire déduplication et envoi des langues cibles de `ZmqRequestSender.sendTranslationRequest`
sous la forme CANONIQUE (`canonicalLanguage`, déjà employée par le suivi
`pendingLanguages` et le solde `settleTranslationLanguage`), à parité avec le reste
des agrégateurs de langue serveur. Clôt #5143 (milestone #18).

## Modules affectés
- `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts` — ligne de
  dédup + jeu de suivi.
- `services/gateway/src/services/zmq-translation/__tests__/ZmqRequestSender.test.ts`
  — 4 témoins de canonicalisation + 1 titre corrigé.

## Phases
1. **RED** — ajouter les témoins (dédup région-tagué, casse-mixte + région, alias
   legacy `iw→he`, solde canonique). Prouver l'échec contre `.toLowerCase()`.
2. **GREEN** — `request.targetLanguages.map(canonicalLanguage)` avant `new Set` ;
   `pendingLanguages: new Set(uniqueTargetLanguages)` (déjà canonique).
3. **Validation** — suite `ZmqRequestSender`, suites ZMQ voisines, `tsc --noEmit`.

## Dépendances
Aucune. `canonicalLanguage` existe déjà dans le fichier (adossé à
`normalizeLanguageCode` de `packages/shared`).

## Risques estimés
Très faibles. Convergence seule (aucune cible nouvelle pour un code canonique).
`canonicalLanguage` idempotente ⇒ le jeu de suivi est inchangé sur les cas
primaires. Aucune frontière réseau ni schéma modifié.

## Stratégie de rollback
Revert du commit unique — deux lignes de production isolées, sans état ni migration.

## Critères de validation
- 3 témoins RED contre l'ancien code, 73/73 GREEN après correctif.
- 285/285 sur `ZmqRequestSender|ZmqTranslationClient|multiLanguageSettle`.
- Gateway `tsc --noEmit` EXIT=0.

## Statut
COMPLÉTÉ — implémenté, validé, prêt à merger sur `dev`.

## Améliorations futures
Instruire les agrégateurs `systemLanguage` EN BASE (nature différente, requête
Prisma contre valeurs persistées verbatim, non réparables par la seule
canonicalisation de la requête) : `buildBroadcastRecipientFilter`
(`jobs/broadcast-recipients.ts`), `admin/broadcasts.ts` (`where.systemLanguage.in`
+ groupBy), `admin/languages.ts` (groupBy). Un admin ciblant « anglophones » manque
aujourd'hui les lignes stockées `'en-US'`/`'FR'` — le correctif propre exige une
normalisation à l'écriture (migration + chemin d'écriture) OU un élargissement de
requête, à trancher en décision produit.

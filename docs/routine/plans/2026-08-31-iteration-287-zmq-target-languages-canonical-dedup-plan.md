# Plan — Itération 287 : canonicalisation des langues cibles ZMQ

## Objectifs
Faire que `ZmqRequestSender.sendTranslationRequest` ENVOIE au translator des
codes de langue canoniques (SSOT `normalizeLanguageCode` via `canonicalLanguage`),
dédupliqués par langue réelle, et que le jeu envoyé soit identique au jeu suivi
(`pendingLanguages`).

## Modules affectés
- `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts` (production)
- `services/gateway/src/services/zmq-translation/__tests__/ZmqRequestSender.test.ts` (tests)

## Phases d'implémentation
1. **RED** — 2 tests : cibles région-taguées canonicalisées/dédupliquées ;
   envoi ⊆ suivi observé via `settleTranslationLanguage`. Vérifié ROUGE sur le
   code d'origine (`['fr','fr-FR','en-US','pt_BR']` → `['fr','fr-fr','en-us','pt-br']`).
2. **GREEN** — `map(l => l.toLowerCase())` → `map(canonicalLanguage)` ; le suivi
   consomme directement `uniqueTargetLanguages` (déjà canonique).
3. **REFACTOR** — commentaires alignés sur le nouvel invariant (envoi = suivi).

## Dépendances
Aucune. `canonicalLanguage` existe déjà dans le fichier ; aucun nouvel import.

## Risques estimés
Faible. Fonction chokepoint pure côté langues ; l'ensemble sortant se resserre,
jamais ne s'élargit. Idempotent sur codes déjà canoniques.

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun changement de schéma ni de
contrat de fil.

## Critères de validation
- 2 tests RED→GREEN, pin existant inchangé.
- 6 suites `zmq-translation` (206 tests) vertes.
- `tsc --noEmit` gateway : 0 erreur.

## Statut de complétion
LIVRÉ. Analyse : `docs/routine/analyses/2026-08-31-iteration-287-zmq-target-languages-canonical-dedup-analyse.md`.

## Suivi / améliorations futures
Autres sites de dédup langue par `.toLowerCase()` brut restant à rapprocher de la
SSOT (à instruire un par un, chacun contre son producteur) :
- `socketio/utils/message-payload-filter.ts` (`filterMessagePayloadForLanguages`)
  — actuellement alimenté par `groupSocketsByLanguage` qui canonicalise déjà via
  `normalizeGroupLanguage` ; l'asymétrie y est LATENTE (fonction exportée), à
  vérifier avant tout correctif.
- `utils/translation-transformer.ts:49`, `routes/conversations/messages-list-query.ts:45`
  — filtres de langue sur `.toLowerCase()`, à instruire (portée : filtrage, pas
  agrégation).

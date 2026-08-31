# Plan — Itération 288 : canonicalisation des langues cibles ZMQ

## Objectifs
Faire coïncider le jeu de langues ENVOYÉ au translator avec le jeu ATTENDU
(`pendingLanguages`), tous deux dérivés de l'unique SSOT `canonicalLanguage`, pour
éliminer les cibles NLLB invalides, le travail ML dupliqué et les requêtes bloquées
au deadman.

## Modules affectés
- `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts` (production)
- `services/gateway/src/services/zmq-translation/__tests__/ZmqRequestSender.test.ts` (témoins)

## Phases
1. **RED** — deux témoins : cibles région-taggées/casse-mixte canonicalisées dans
   la charge envoyée ; coïncidence ENVOYÉ/ATTENDU via soldé d'une cible région-taggée.
2. **GREEN** — `map(l => l.toLowerCase())` → `map(canonicalLanguage)` au site de
   déduplication ; `pendingLanguages` simplifié en `new Set(uniqueTargetLanguages)`.
3. **REFACTOR** — doc-comment de `canonicalLanguage` réécrit : il gouverne désormais
   les DEUX projections, avec les deux raisons (cible invalide, divergence deadman).

## Dépendances
Aucune. `canonicalLanguage` (donc `normalizeLanguageCode`) déjà importé et éprouvé.

## Risques estimés
Très faibles — changement idempotent sur les codes déjà canoniques (chemin
principal inchangé), convergent ou réparateur sur les codes région-taggés.

## Stratégie de rollback
Revert du commit unique ; aucune migration, aucun changement de contrat réseau.

## Critères de validation
- 71/71 `ZmqRequestSender`, 250/250 suites `zmq-translation` + `ZmqRequestSender`.
- `tsc --noEmit` gateway EXIT=0.

## Statut
LIVRÉ — cf. analyse 2026-08-31-iteration-288.

## Améliorations futures
- Balayer les autres sites de dédup langue par `.toLowerCase()` brut hors SSOT :
  `socketio/utils/message-payload-filter.ts:27`, `utils/translation-transformer.ts:49`,
  `routes/conversations/messages-list-query.ts:45` — vérifier si leurs entrées
  arrivent déjà normalisées ou s'ils portent la même divergence.

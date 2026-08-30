# Plan — Itération 288 : canonicalisation des langues cibles au choke point ZMQ

## Objectifs
Faire descendre la SSOT de canonicalisation-avec-dedup au point de passage UNIQUE
de tout travail de traduction ML (`ZmqRequestSender.sendTranslationRequest`), pour
que le translator ne reçoive plus jamais de variante région-taguée / casse-mixte
comme cible NLLB distincte, et que la liste ENVOYÉE coïncide avec la liste SUIVIE.

## Modules affectés
- `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts` (2 lignes)
- `services/gateway/src/services/zmq-translation/__tests__/ZmqRequestSender.test.ts` (3 témoins)

## Phases
1. **RED** — ajouter 3 témoins : variantes région-taguées effondrées, codes
   canoniques uniquement, parité premier-envoi / renvoi-timeout. ✅ (3 rouges)
2. **GREEN** — `.map(l => l.toLowerCase())` → `.map(canonicalLanguage)` ; simplifier
   `pendingLanguages` en `new Set(uniqueTargetLanguages)`. ✅
3. **VALIDATION** — suites ZMQ + MessageTranslationService + tsc gateway. ✅

## Dépendances
Aucune. `canonicalLanguage` (SSOT `normalizeLanguageCode`) déjà importé et utilisé
dans le fichier.

## Risques & rollback
Risque très faible (convergence seule, jamais de cible retirée). Rollback = revert
d'un commit à deux lignes de production.

## Critères de validation
- 72/72 `ZmqRequestSender`, 177/177 suites ZMQ liées, 267/267 `MessageTranslationService`.
- `tsc --noEmit` gateway EXIT=0.

## Statut
COMPLET.

## Suivi / améliorations futures
- Balayer les résolveurs de langue restants qui dédupliquent avec `.toLowerCase()`
  brut sans passer par la SSOT (candidats relevés : `translation-transformer.ts:49`,
  `messages-list-query.ts:45` — à vérifier contre leur PRODUCTEUR avant de conclure
  à un défaut, plusieurs reçoivent déjà des codes canoniques en amont).
- `message-payload-filter.ts:27` (`.toLowerCase()`) est aujourd'hui alimenté par
  `groupSocketsByLanguage` qui pré-normalise : sûr en production, mais une garde
  de défense-en-profondeur y serait cohérente avec ce lot si un appelant direct
  apparaît.

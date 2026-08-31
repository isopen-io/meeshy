# Plan itération 287 — `ZmqRequestSender` sur la SSOT de canonicalisation

## Objectifs
Router la frontière d'émission translator (`ZmqRequestSender`) sur la SSOT
`normalizeLanguageForDedup`, supprimer la jumelle divergente `canonicalLanguage`,
et garantir que le jeu de langues cibles ENVOYÉ au translator == le jeu de SUIVI
`pendingLanguages`, tous deux canoniques.

## Modules affectés
- `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts` (production)
- `services/gateway/src/services/zmq-translation/__tests__/ZmqRequestSender.test.ts` (tests)

## Phases
1. **RED** — 3 témoins ajoutés dans `sendTranslationRequest` :
   canonicalisation région-taguée (`['pt-BR','fr-FR','zh-Hant-HK'] → ['pt','fr','zh']`),
   dédup de variantes (`['fr','fr-FR','FR','fr_FR'] → ['fr']`), rejet des codes
   vides (`[''] → throw`). Prouvés RED contre la production d'origine (git stash).
2. **GREEN** — import `normalizeLanguageForDedup` ; suppression de
   `canonicalLanguage` ; canonicalisation + `.filter` avant dédup ;
   `pendingLanguages` depuis le jeu canonique ; `settleTranslationLanguage` via SSOT.
3. **REFACTOR** — aucun ajout : la suppression de la jumelle EST le refactor
   (une SSOT au lieu de deux).

## Dépendances
- `packages/shared` construit (`normalizeLanguageForDedup` dans le dist) — fait.
- Prisma client généré pour les suites gateway — fait.

## Risques estimés
Faible. Fonction de préparation de requête ; la canonicalisation resserre
l'ensemble sortant (jamais élargi) et préserve l'ordre. Le chemin de
réconciliation nominal (codes connus) est inchangé — jumelle et SSOT y
concordaient déjà.

## Stratégie de rollback
`git revert` du commit — deux fichiers, autonome.

## Critères de validation
- 3 nouveaux témoins RED prouvés puis verts.
- 6 suites `zmq-translation` (207) + unit `ZmqRequestSender` (44) vertes.
- `tsc --noEmit` gateway : 0 erreur.

## Statut
LIVRÉ. Toutes les phases exécutées et validées.

## Améliorations futures / suivi
Balayer les autres agrégateurs `new Set(... .toLowerCase())` du gateway
(`message-payload-filter.ts`, `messages-list-query.ts`, `translation-transformer.ts`,
`MessageTranslationService.ts`) et router vers la SSOT ceux dont le rôle est une
dédup/filtre de langue — instruits un par un contre leur producteur.

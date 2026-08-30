# Plan — Itération 284 : borne emoji de réaction REST/AJV = SSOT

## Objectifs
Aligner les quatre schémas de corps REST (JSON-Schema/AJV) d'un emoji de réaction
sur la SSOT `EMOJI_MAX_LENGTH` (32), déjà appliquée par les jumeaux Socket.IO
(Zod). Fermer la régression « emoji famille/couple/teinté rejeté 400 au
portillon REST » que l'itération 281 avait laissée sur le transport REST.

## Modules affectés
- `packages/shared/types/api-schemas.ts` (SSOT de doc API) + import.
- `services/gateway/src/routes/reactions.ts` + import.
- `services/gateway/src/routes/conversations/messages-advanced.ts` (2 sites) + import.
- `packages/shared/__tests__/types/reaction.test.ts` (2 gardes).

## Phases (toutes exécutées)
1. **Audit** (2 agents Explore en parallèle) → finding Zod-boundary confirmé sur 4 sites + finding Prism Android (reporté).
2. **Vérification manuelle** des 5 fichiers (SSOT + 4 sites) et du graphe d'imports (pas de cycle `reaction.ts`).
3. **Correctif** : 4 littéraux `10` → `EMOJI_MAX_LENGTH`, 3 imports ajoutés.
4. **Gardes** : 2 tests shared bindant le schéma REST à la SSOT + admission d'un emoji famille ; prouvées RED à l'ancienne borne.
5. **Validation** : shared build + 2711 tests, gateway tsc 0 erreur, 256 tests réaction.

## Dépendances
Aucune. `EMOJI_MAX_LENGTH` existe et est déjà importé par les jumeaux Zod.

## Risques estimés
Très faible. Élargissement de borne côté REST uniquement (32 était déjà la borne
socket) ; `isValidEmoji` reste le contrôle de format en aval. Pas de changement de
structure de module (les doubles partiels de test ne sont pas touchés).

## Stratégie de rollback
`git revert` du commit : les cinq fichiers reviennent à `10` / sans les gardes.
Aucune migration, aucun état persisté touché.

## Critères de validation
- [x] `packages/shared` build vert
- [x] 2711/2711 tests shared (dont 2 gardes neuves)
- [x] gardes prouvées RED à la borne 10
- [x] gateway `tsc --noEmit` : 0 erreur
- [x] 256/256 tests `reactions-routes|AttachmentReactionHandler|messages-advanced`

## Statut de complétion
**COMPLET.** Prêt à merger sur `main`.

## Améliorations futures (roadmap des prochaines itérations)
1. **Android `preferredTranslation` — original à son rang (Prisme #3)** : jumelle
   du correctif web #4316, non transférée. Priorité 1. Nécessite un environnement
   capable de `./gradlew test`.
2. **Dedup région-stripé côté iOS + Android (corps de message)** : `en-US`
   original ne matche pas rang `en` faute de `normalizeLanguageForDedup`. Sévérité
   moindre (donnée héritée région-taggée).
3. **`moodEmoji` (posts/status) à `z.string().max(10)`** (`routes/posts/types.ts:241,355`)
   : même portillon RGI, mais Zod pur sans jumeau REST divergent — SSOT-utilise-
   mauvais-littéral plutôt que parité de transport. À basculer sur `EMOJI_MAX_LENGTH`.

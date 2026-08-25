# Itération 266 — Plan : fermer la classe `.max(5)` des codes de langue

## Objectifs

Aligner toute borne de longueur d'un code de langue client-contrôlé sur la SSOT
`CommonSchemas.language` (`.max(6)`), pour cesser de rejeter les codes ISO 639-3
régionalisés supportés (`bas-CM`, etc.). Correctif purement élargissant.

## Modules affectés

- `services/gateway/src/routes/translation.ts` (Zod + schéma Fastify)
- `services/gateway/src/routes/translation-non-blocking.ts` (Zod + schéma Fastify)
- `services/gateway/src/validation/socket-event-schemas.ts` (schéma orphelin)
- `services/gateway/src/routes/posts/types.ts` (`CreatePostSchema`, `TranslatePostSchema`)
- `packages/shared/utils/validation.ts` (`MessageSchemas`, `TranslatedAudioSchemas`, `VoiceModelSchemas`, `AnonymousParticipantSchemas`)
- Témoins : `translation-routes.test.ts`, `translation-non-blocking-routes.test.ts`,
  `socket-event-schemas.test.ts`, `posts/types.test.ts` (gateway),
  `validation.test.ts` (shared)

## Phases

1. **RED** — témoins prouvant qu'un code 6 caractères (`bas-CM`) est rejeté par la
   frontière (`app.inject` → 400) et par les schémas partagés (`safeParse`
   `success === false`). ✅
2. **GREEN** — `.max(5)` → `.max(6)` sur les neuf champs Zod + deux `maxLength: 5`
   Fastify ; descriptions OpenAPI corrigées (« ISO 639-1/639-3, région BCP-47 »). ✅
3. **REFACTOR/PARITÉ** — gardes « refuser 7 caractères » pour prouver l'absence de
   sur-élargissement ; rebuild `packages/shared` (dist consommé par le gateway). ✅
4. **VALIDATION** — voir critères. ✅

## Dépendances

`packages/shared` doit être rebuild (`bun run build`) avant les suites gateway,
qui importent la SSOT depuis `@meeshy/shared` (dist).

## Risques estimés

Faible — changement additif. Seul risque théorique : un témoin encodant l'ancien
`.max(5)` (attendant le rejet d'un code 6 car.). Recherché : aucun.

## Stratégie de rollback

Revert du commit unique. Aucun changement de schéma DB, aucune migration.

## Critères de validation

- Témoins RED d'abord, verts après.
- `tsc` gateway + shared = 0 erreur.
- `vitest` shared complet + `jest` gateway validation/traduction/posts verts.
- Plus aucune borne `.max(5)` de code de langue dans `services` + `packages`.

## Statut de complétion

**LIVRÉ.** Onze bornes alignées, cinq fichiers de production + cinq fichiers de
témoins. Classe close.

## Suivi / améliorations futures

- Incohérence résiduelle (hors classe, non régressive) : les autres champs de
  langue du dépôt portent des bornes disparates — `wireLanguageCode` `.max(16)`,
  `call-schemas` `.max(10)`, `UpdatePostSchema.originalLanguage` `.max(16)`,
  `VoiceModelSchemas.full.language` sans borne. Toutes ≥ 6, donc aucune ne rejette
  un code valide ; mais l'absence de source unique laisse la porte à une nouvelle
  divergence. Piste : un cliquet (test de balayage) qui interdit toute NOUVELLE
  borne de code de langue < 6, ou impose l'usage d'un helper partagé. Non fait ici
  pour garder le lot minimal et purement élargissant.
- Décision produit distincte, à instruire séparément : faut-il faire respecter la
  FORME (regex de la SSOT) sur ces frontières, au prix du rejet de `'auto'` et de
  la casse haute ? À trancher avec des preuves de ce que les clients émettent
  réellement.

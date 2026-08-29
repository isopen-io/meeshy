# Plan itération 281 — SSOT `EMOJI_MAX_LENGTH`, borne calibrée sur les emojis RGI

## Objectifs

Que la borne de LONGUEUR d'un emoji admette tout emoji RGI valide (jusqu'à 15
unités UTF-16 mesurées), via une SEULE constante partagée référencée par les 11
sites qui la retapaient.

## Modules affectés

- `packages/shared/types/reaction.ts` — NOUVELLE constante `EMOJI_MAX_LENGTH`.
- `packages/shared/utils/validation.ts` — 1 référence (REST reaction add).
- `services/gateway/src/validation/socket-event-schemas.ts` — 8 références.
- `services/gateway/src/routes/posts/types.ts` — 3 références (Like, Unlike, sticker).
- Tests : `packages/shared/__tests__/types/reaction.test.ts`,
  `services/gateway/src/__tests__/unit/validation/socket-event-schemas.test.ts`.

## Phases

1. **RED** — test shared : `EMOJI_MAX_LENGTH >= 15` et admet le plus long RGI ;
   test socket : `SocketReactionAddSchema` ACCEPTE `'👨‍👩‍👧‍👦'`. Recalibrer le
   test « exceeds » (> nouvelle borne).
2. **GREEN** — ajouter la constante ; remplacer les 11 littéraux par la constante.
3. **REFACTOR** — vérifier qu'aucun autre littéral `max(10)`/`max(16)` sur `emoji`
   ne subsiste.

## Dépendances

Aucune (constante pure, TS).

## Risques estimés

Très faible : la borne ne fait que s'élargir ; la validité RGI (SSOT) est
inchangée et backstoppe toujours le format.

## Stratégie de rollback

Revert du commit ; la constante est isolée.

## Critères de validation

- RED prouvé (famille refusée avant, acceptée après).
- `bun run build` shared + `tsc` gateway verts.
- Suites `reaction` (vitest) + `socket-event-schemas` (jest) vertes.

## Statut

Livré. Constante `EMOJI_MAX_LENGTH = 32` posée dans `packages/shared/types/reaction.ts`
(re-exportée par `types/index.ts`), 11 sites migrés (shared `ReactionSchemas.add`,
8 schémas socket, `LikeSchema` / `UnlikeSchema` / sticker de story). Gates :
`bun run build` shared + `tsc --noEmit` gateway verts ; vitest shared
(reaction + validation) 111/111 ; jest gateway suites réaction + posts + boundary
664/664 + 424/424. RED prouvé (famille refusée avant, acceptée après).

## Suivi / améliorations futures

- Miroirs client (iOS/Android) : la SSOT de validité `isValidEmoji` est
  serveur-only (aucun appel client, cf. commentaire de la fonction) et la borne
  de longueur est serveur-only aussi — pas de miroir à porter. Si un jour un
  client borne la longueur d'un emoji localement, il doit refléter cette valeur.

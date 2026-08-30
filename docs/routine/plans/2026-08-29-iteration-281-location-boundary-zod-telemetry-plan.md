# Plan — Itération 281 : frontière Zod de `LocationHandler` + borne de télémétrie

Issue : #4263. Branche : `claude/brave-archimedes-l3cy3n`.

## Objectifs

1. Fermer le défaut de sécurité : la télémétrie GPS (`altitude`/`accuracy`/
   `speed`/`heading`) diffusée aux pairs sans validation de frontière.
2. Aligner `LocationHandler` — la douzième et dernière famille — sur la frontière
   Zod des onze autres familles de handlers Socket.IO (cycle 107).

## Modules affectés

- `services/gateway/src/validation/socket-event-schemas.ts` — trois schémas neufs.
- `services/gateway/src/socketio/handlers/LocationHandler.ts` — frontière des trois
  handlers, retrait de `_validateCoordinates`.
- `services/gateway/src/socketio/handlers/__tests__/LocationHandler.test.ts` — sept
  témoins de télémétrie/coordonnée ajoutés, deux pins d'erreur convergés.
- `services/gateway/src/__tests__/unit/handlers/LocationHandler.test.ts` — quatre
  pins d'erreur convergés.

## Phases

1. **RED** — témoins de télémétrie forgée (`speed: Infinity`, `altitude: NaN`,
   `accuracy: -Infinity`, `heading: 'north'`) : la charge est diffusée aux pairs.
   Prouvé : 4 échecs, le témoin « latitude NaN » passe déjà (isole le défaut).
2. **GREEN** — schémas Zod + rewiring des trois handlers en `validateSocketEvent`.
3. **Convergence** — pins d'erreur `Invalid …` → `Validation failed: Invalid …`.
4. **Validation** — suites Location, tsc, suite gateway complète.

## Dépendances

Aucune nouvelle dépendance. Réutilise `validateSocketEvent` (`middleware/
validation.ts`) et Zod v4 déjà présents.

## Risques estimés

- Convergence des messages d'erreur du callback `start` (`Invalid coordinates` →
  `Validation failed: Invalid coordinates`) : changement de chaîne d'API, aligné
  sur les quatre familles de réaction (itération 280). Aucun client ne branche
  sur le texte exact (les clients lisent `data.message || data.error`).
- `z.number()` Zod v4 rejette nativement `NaN`/`Infinity` — vérifié par probe
  avant implémentation, pas de `.finite()` requis.

## Stratégie de rollback

Correctif localisé à un handler et trois schémas ; révert du commit unique
restaure la garde manuscrite. Aucune migration, aucun changement de schéma DB,
aucun changement de contrat de fil (les champs diffusés sont inchangés).

## Critères de validation

- [x] RED prouvé (4 témoins de télémétrie tombent avant implémentation).
- [x] 5 suites Location vertes (93 tests).
- [x] `tsc --noEmit` gateway exit 0.
- [x] Aucune référence résiduelle à `_validateCoordinates`.
- [x] Suite gateway complète verte : **904 suites / 20570 tests** (baseline 20564 + 6 témoins neufs).

## État de complétude

TERMINÉE et validée. Suite gateway complète verte, `tsc --noEmit` exit 0.

## Améliorations futures

- Bornes produit de télémétrie (cap ∈ [0;360[, vitesse ≥ 0) — seulement si un
  besoin produit mesuré apparaît, en issue dédiée.
- La douzième famille étant soldée, un cliquet « toute famille de handler valide
  sa frontière par Zod » deviendrait défendable ; à peser (le cycle 107 avait
  JETÉ un balayage qui mesurait la popularité de l'idiome plutôt qu'une propriété).

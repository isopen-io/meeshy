# Iteration 263 — Plan : plafond de sécurité `MAX_CONTENT_BYTES` sur `UpdateMessageBodySchema`

## Objectifs
1. Poser sur le champ `content` de `UpdateMessageBodySchema`
   (`services/gateway/src/validation/messages-schemas.ts`) le plafond
   `MAX_CONTENT_BYTES = 100_000`, jumeau des transports SOCKET
   (`SocketMessageSendSchema`, `SocketMessageEditSchema`).
2. Extraire `MAX_CONTENT_BYTES` — jusque-là `const` privée de
   `socket-event-schemas.ts` — dans un module feuille partagé
   `validation/content-limits.ts`, pour que les deux fichiers l'appliquent depuis
   UNE source.

## Modules affectés
- `services/gateway/src/validation/content-limits.ts` — **NOUVEAU** module feuille
  (constante + doc).
- `services/gateway/src/validation/socket-event-schemas.ts` — importe la constante
  (refactor behavior-preserving).
- `services/gateway/src/validation/messages-schemas.ts` — importe + applique
  `.max(MAX_CONTENT_BYTES)` sur `UpdateMessageBodySchema.content`.
- `services/gateway/src/__tests__/unit/validation/messages-schemas.test.ts` —
  2 gardes (rejet au-delà du plafond, admission à la borne exacte).

## Phases

### Phase 1 — Refactor SSOT (behavior-preserving)
Créer `content-limits.ts`, y déplacer la constante et sa doc, rebrancher
`socket-event-schemas.ts` sur l'import. Aucun changement de valeur → jumeaux
SOCKET inchangés.

### Phase 2 — RED
Écrire les 2 tests dans `messages-schemas.test.ts`. Le premier (rejet au-delà)
tombe rouge sur `main` (`Expected false / Received true`) ; le second (borne
exacte) passe déjà — documente la décision « borne inclusive ».

### Phase 3 — GREEN
`content: z.string().trim().max(MAX_CONTENT_BYTES).optional()`. Docstring in-line
citant la parité SOCKET et le blast radius (persistance `Message.content` +
broadcast `message:edited`).

### Phase 4 — Validation
- `messages-schemas.test.ts` → 77/77.
- `socket-event-schemas.test.ts` + `messageEditContent.test.ts` → 43/43.
- Répertoire `validation` + `routes/messages*` → 427/427.
- `tsc --noEmit` (gateway) → 0 erreur.
- Full gateway suite (background) → baseline.

## Dépendances
Aucune. La borne n'ajoute aucun type inféré (`z.infer` inchangé).

## Estimated risks
- **Faible.** Un seul call site (`routes/messages.ts:462`), déjà fail-closed par
  `validateBody`. Aucun émetteur légitime ne produit un corps > 100 000 (web
  plafonne à 10 000, iOS à sa saisie). Le rejet transforme un chemin latent en
  chemin borné.
- **Rollback :** revert du commit unique.

## Validation criteria
- [x] RED prouvé (rejet au-delà du plafond avant fix).
- [x] Garde de frontière verte (borne exacte, avant et après).
- [x] GREEN `messages-schemas.test.ts` (77/77).
- [x] Jumeaux SOCKET + edit-content inchangés (43/43).
- [x] `validation` + routes message (427/427, 14 suites).
- [x] `tsc --noEmit` gateway (0 erreur).
- [ ] Full gateway suite (background) : baseline.
- [ ] Commit + push + PR.

## Completion status
- [x] Refactor SSOT posé.
- [x] RED écrit et prouvé.
- [x] GREEN posé.
- [x] Validations locales exécutées.
- [ ] Full suite background + commit + push + PR.

## Future improvements
- **`assertReactionAllowed(count)`** — consolider le garde de limite de réactions
  recopié dans 5 services (miroir `assertValidObjectId`).
- **`decodeCursor` validation de TYPE** (`utils/keyset-cursor.ts`) — vérifier que
  `createdAt`/`id` sont des chaînes avant le cast `CursorData`.

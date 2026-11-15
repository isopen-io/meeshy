# Plan — Itération 281 : `capturedInApp` sur le fil socket d'attachement

Issue : #4287. Statut : **livré**.

## Objectifs

Rétablir la parité select ↔ sérialiseur : `serializeAttachmentForSocket` porte
`capturedInApp`, que `attachmentMediaSelect` charge à dessein et que le contrat
partagé + le web lisent, mais que le sérialiseur socket droppait sur les trois
chemins de livraison (`message:new`, `message:attachment-updated`, `sync`).

## Modules affectés

- `services/gateway/src/socketio/serializeAttachmentForSocket.ts`
  (interface `SocketAttachment` + objet rendu).
- `services/gateway/src/socketio/__tests__/serializeAttachmentForSocket.test.ts`
  (deux témoins).

## Phases

1. **RED** — ajouter deux témoins au sérialiseur : `capturedInApp: true` préservé,
   et défaut `false` quand la requête l'omet. Prouver le ROUGE (les deux rendent
   `undefined` aujourd'hui).
2. **GREEN** — déclarer `readonly capturedInApp: boolean` sur `SocketAttachment`,
   servir `(raw.capturedInApp …) ?? false` dans l'objet rendu.
3. **Validation** — `tsc --noEmit`, suites voisines, suite gateway complète.

## Dépendances

Aucune. Le `select` charge déjà le champ (`attachmentIncludes.ts:100`) ; le
contrat partagé le déclare déjà (`api-schemas.ts`, `attachment.ts`).

## Risques & rollback

Risque faible : ajout d'un champ provenance booléen non sensible à un objet émis
tel quel (le fil socket n'a pas de sérialiseur fast-json-stringify). Aucune
suppression, aucun renommage, aucune migration, aucun changement de schéma de
réponse REST. Rollback = revert du commit.

## Critères de validation

- ROUGE prouvé sur les deux témoins.
- `serializeAttachmentForSocket.test.ts` vert (13/13).
- Suite gateway complète verte.
- `tsc --noEmit` exit 0.

## Statut / suite

Livré. Ferme #4287.
Suite (non ouverte ici) : cliquet de parité select ↔ `SocketAttachment` — exige
une liste d'exemptions nommées (agrégation de `reactions`), donc une issue à part.

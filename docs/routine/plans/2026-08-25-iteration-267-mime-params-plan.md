# Itération 267 — Plan : nettoyage MIME cohérent sur les six gardes

## Objectifs

Rendre les six type-guards MIME de `packages/shared/types/attachment.ts`
cohérents face aux paramètres MIME (`; charset=utf-8`, `;codecs=…`) via un
helper unique, sans changer aucune signature publique.

## Modules affectés

- `packages/shared/types/attachment.ts` (helper + 6 gardes)
- `packages/shared/__tests__/types/attachment.test.ts` (témoins RED→GREEN)

## Phases

1. **RED** — Ajouter des témoins paramétrés pour `isImageMimeType`,
   `isTextMimeType`, `isDocumentMimeType`, `isCodeMimeType`,
   `isAcceptedMimeType`, `getAttachmentType`. Prouver l'échec.
2. **GREEN** — Extraire `stripMimeParameters()` ; l'appliquer aux six gardes.
3. **REFACTOR** — Retirer les deux copies in-line (audio/video).
4. **VALIDATE** — Suite complète + `tsc --noEmit` shared.

## Dépendances

Aucune. Fonctions pures, pas de DB/réseau.

## Risques estimés

Faible (voir analyse § risque). Le nettoyage n'élargit l'acceptation qu'aux
types dont la base est déjà listée. Témoin de garde : `image/svg+xml;
charset=utf-8` reste rejeté.

## Stratégie de rollback

Revert du commit unique — changement isolé à un fichier de prod + un test.

## Critères de validation

- Nouveaux témoins RED avant / GREEN après.
- `attachment.test.ts` entier vert.
- `tsc --noEmit` shared : 0 erreur.
- Témoin de non-élargissement présent et vert.

## Statut d'achèvement

- [x] RED — 7 témoins échouent avant correctif (base non listée passe déjà)
- [x] GREEN — helper `stripMimeParameters` appliqué aux 6 gardes ; 177/177 verts
- [x] REFACTOR — deux copies in-line audio/vidéo retirées, un site unique
- [x] VALIDATE — suite shared entière 2623/2623 verte ; `tsc --noEmit` 0 erreur ;
      aucun consommateur (gateway/web) n'asserte l'ancien rejet paramétré
- [x] Commit + push

## Suivi / améliorations futures

- Miroirs éventuels côté Swift/Kotlin de la classification MIME : vérifier
  qu'ils tolèrent aussi les paramètres (hors scope de ce lot TS).

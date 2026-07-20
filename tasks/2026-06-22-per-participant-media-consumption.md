# Per-participant media consumption in the message details view

## Goal
Dans la vue détails d'un message (MessageInfoSheet), l'auteur veut voir **jusqu'où
chaque autre participant a écouté un audio / regardé une vidéo** (position précise +
complétion), au-delà de l'agrégat « écouté par tous ».

Décisions produit (validées) :
- Granularité : **position précise par personne**.
- Confidentialité : **toujours visible**, comme les accusés de lecture actuels
  (pas de gate supplémentaire — l'endpoint `/read-status` n'en a pas non plus).

## Constat initial
La donnée existait déjà en base (`AttachmentStatusEntry`: `participantId`,
`lastPlayPositionMs`, `lastWatchPositionMs`, `listenedComplete`, `watchedComplete`),
mais le gateway ne lisait que la ligne du **current user**. Aucune exposition de la
progression des AUTRES participants nulle part. Donc : exposer + afficher, pas de
nouvelle capture.

## Implémentation
- [x] Gateway `getMessageReadStatus` : ajoute `attachmentConsumption[]`
      (par attachement → liste de participants avec positions + complétion).
      Query `AttachmentStatusEntry` scopée au message, exclut le sender, skip les
      orphelins et les lignes sans signal audio/vidéo.
- [x] Shared : types `MessageAttachmentConsumption` /
      `MessageAttachmentConsumptionParticipant` (`message-types.ts` + export index).
- [x] Tests gateway : 5 nouveaux cas (exposition, regroupement multi-participants,
      skip sans signal, skip orphelin, liste vide). 132/132 passent.
- [x] iOS `MessageReadStatusResponse` : champ optionnel `attachmentConsumption`.
- [x] iOS `MessageInfoSheet` : sous-vue `ParticipantMediaProgressRow` (Equatable,
      inputs primitifs) sous chaque attachement → dot couleur + nom + label
      `0:45 / 1:30` (ou « Écouté/Regardé en entier ») + barre de progression fine.

## Vérification
- `pnpm --filter @meeshy/shared build` ✅
- Gateway `tsc --noEmit` ✅ (aucune erreur sur nos fichiers)
- Gateway jest `MessageReadStatusService.test.ts` : **132 passed** ✅

## Reste à faire (machine Xcode requise)
- ⚠️ `./apps/ios/meeshy.sh build` + tests SDK/iOS : non compilables dans cet
  environnement (pas de toolchain Xcode). À builder/tester sur machine macOS.
- Optionnel : strings de localisation `message-info.consumption.listened-fully` /
  `watched-fully` (defaultValue fournis en attendant).
- Hors scope : web (`apps/web`) ne consomme pas encore ce détail ; glyphe ✓✓
  par-message toujours basé sur les agrégats.

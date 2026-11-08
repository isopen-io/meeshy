# Le flou de la position retient sa maille et arrondit son heure (#16987)

Date : 2026-11-08. Suite de #16980 (partage temporaire de position).

## Décision

Un lecteur flouté (quartier, ville) reçoit le centre d'une maille. Deux fuites restaient :

- **La ligne de maille.** Le bruit GPS d'un émetteur arrêté près d'une ligne fait alterner deux mailles, et l'alternance dit où est la ligne. Le serveur retient donc, par destinataire, la maille servie (`recipients[].cell`, scellée avec l'état) et ne la change que lorsque l'émetteur s'en éloigne de plus de 25 % du pas au-delà de sa bordure. Revenir de peu ne rebascule pas.
- **L'horloge fine.** `updatedAt` d'un lecteur flouté tombe sur le quart d'heure : l'instant exact d'un déplacement ne sort pas avec la maille. L'exact garde l'heure vraie. `expiresAt`, le terme que l'émetteur a choisi, ne change pas.

## Ce qui reste accepté

Quand l'émetteur s'éloigne franchement d'une maille, le lecteur flouté reçoit la nouvelle : c'est le service rendu. L'instant précis du franchissement reste proche de celui du déplacement, à la marge près.

## Contrat

Aucun champ, route ni événement nouveau : `location:share-changed` garde sa forme. Les clients n'ont rien à changer.

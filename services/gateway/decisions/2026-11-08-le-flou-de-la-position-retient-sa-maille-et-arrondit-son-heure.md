## 2026-11-08 : le flou de la position retient sa maille et arrondit son heure

**Statut** : Accepté (#16987, suite de #16980, partage temporaire de position).

**Contexte** : un lecteur flouté (quartier, ville) reçoit le centre d'une maille. Deux fuites restaient. Le bruit GPS d'un émetteur arrêté près d'une ligne de maille fait alterner deux mailles, et l'alternance dit où est la ligne. Et l'heure fine de la mise à jour dit quand l'appareil a bougé.

**Décision** :
1. Le serveur retient, par destinataire, la maille servie (`recipients[].cell`, scellée avec l'état) et ne la change que lorsque l'émetteur s'éloigne de plus de 25 % du pas au-delà de sa bordure. Revenir de peu ne rebascule pas.
2. `updatedAt` d'un lecteur flouté tombe sur le quart d'heure. L'exact garde l'heure vraie. `expiresAt`, le terme que l'émetteur a choisi, ne change pas.

**Conséquences** : quand l'émetteur s'éloigne franchement d'une maille, le lecteur flouté reçoit la nouvelle : c'est le service rendu, et l'instant du franchissement reste proche de celui du déplacement, à la marge près (accepté). Aucun champ, route ni événement nouveau : `location:share-changed` garde sa forme, les clients n'ont rien à changer.

# La règle du plancher de livraison cesse d'être RETAPABLE (#19303)

*2026-11-17. Cycle 175. Suite de #19261 (le comportement), qui suit #18731 et
#18701.*

## Décision

La POSITION du curseur de livraison, et la PROJECTION d'où elle se résout,
vivent à UN endroit : `services/messaging/deliveryFloor.ts`.

| export | ce qu'il porte |
|---|---|
| `DELIVERY_FLOOR_SELECT` | la projection minimale d'où la position se résout |
| `deliveryFloorOf` | la descente, et son repli sur l'horloge |
| `DeliveryFloorCursor` | l'EXIGENCE : les deux colonnes sont **requises** |

Les trois sites de plage de livraison la consultent, y compris celui où `since`
est aujourd'hui inexploité.

## Pourquoi : #19261 a corrigé le verdict, pas la condition

#19261 a retiré l'horloge murale des deux sites vivants. Il l'a fait en
**retapant** la règle à chacun — son propre message de commit porte « une règle
qu'il faut retaper à chaque endroit est une règle qu'un endroit finira par ne pas
avoir », et la troisième copie venait de #18731. Ce n'est pas une inattention :
c'est la forme normale du correctif quand la règle n'a pas d'endroit où vivre. Et
**un endroit ne l'avait effectivement pas** — la cascade « lu ⇒ remis », dont le
`select` ignorait la colonne, ce que #19261 est venu réparer.

## La forme forte : des champs REQUIS, pas optionnels

La décision de #17208 (lesson *une loi qui PUBLIE son `select`…*) posait déjà que
« le TYPE du paramètre est l'autre moitié de la garde ». Sa forme forte est
l'obligation : un paramètre `{ a?: Date | null; b?: Date | null }` ne PEUT PAS
faire rougir un appelant qui n'a chargé que `a`. `DeliveryFloorCursor` déclare
les deux colonnes requises — nullables, mais présentes — et c'est le compilateur
qui tient la règle :

```
error TS2345: Argument of type '{ lastReadAt: Date; lastDeliveredAt: Date; }' is
not assignable to parameter of type 'DeliveryFloorCursor'.
```

> **Un module partagé DÉPLACE la discipline — il faut penser à l'appeler ; un
> type qui exige la lecture la SUPPRIME.** Quand une règle a une forme de donnée
> (une projection, un jeu de colonnes), elle peut cesser d'être retapable.

Les deux témoins de REQUÊTE gardent l'autre moitié, celle que le compilateur ne
voit pas : que les sites demandent bien la colonne à la BASE. #19261 n'en avait
aucun — ses six témoins sont des témoins de verdict, et un double Prisma rend ce
qu'on lui dit quel que soit son `select`.

## Le plancher est le MINIMUM, et non la position seule

L'invariant attendu est `position <= horloge` (un message est créé avant d'être
remis), donc `position ?? clock` et `min` coïncident sur toute donnée saine. Ils
divergent sous une **dérive d'horloge entre deux serveurs**, et là la position
seule RÉTRÉCIRAIT la fenêtre sous ce qu'elle couvrait avant #19261 — une
régression introduite par le correctif lui-même.

Le minimum ne peut que l'élargir, et élargir est sûr pour deux raisons qui
tiennent ensemble : le gel est **write-once**, donc ré-ouvrir un intervalle déjà
gravé n'écrit rien ; et un message sous le plancher est un message que le curseur
**DÉCLARE** déjà remis.

## Le site EXACT reçoit la position bien qu'elle y soit INERTE

`freezeMessageStatus` ignore `since` dès qu'une liste d'ids est nommée — la liste
ÉTANT la borne, et `since` n'ayant aucun autre usage dans la fonction. #19261 a
classé ce site « sans objet » et y a laissé l'horloge. Le classement est juste
aujourd'hui ; la valeur reste un **piège armé** (règle du cycle 84). Le jour où
ce paramètre compterait en mode exact, l'horloge serait de retour sans qu'un
témoin tombe.

## Ce que la décision NE tranche PAS

**La chaîne de LECTURE porte les deux horloges que la livraison vient de
perdre** — son balayage de contiguïté (`_computeExactReadCursorTarget`, le défaut
de #18731) ET sa fenêtre de gel (celui de #19261) — plus **six copies** de
l'idiome du plancher. Mesuré, ouvert en **#19299**, pas corrigé : l'arbitrage
« élargir est sûr » ne se transpose pas sans être réinstruit, le dépôt écrivant
lui-même qu'« un message gravé lu à tort l'est pour toujours ».

**L'absence de transaction** entre l'avance du curseur et le gel est inchangée
(#18731 § Suivis). **Un participant SANS curseur** balaie toujours depuis le
début de la conversation.

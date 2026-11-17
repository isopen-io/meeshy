# La fenêtre du gel de livraison s'ancre sur la POSITION du curseur (#19261)

*2026-11-17. Cycle 175. Fait suite à #18701 (ce qui est SERVI) et #18731 (ce que
le CURSEUR écrit).*

## Décision

La borne BASSE de la fenêtre du gel `deliveredAt` est la **position
chronologique** du curseur (`ConversationReadCursor.lastDeliveredMessageCreatedAt`),
avec repli sur son horloge murale (`lastDeliveredAt`) quand la colonne manque.
Elle n'est plus l'horloge.

La loi vit dans `services/messaging/deliveryFloor.ts`, qui porte **deux** choses
indissociables :

| export | ce qu'il tient |
|---|---|
| `DELIVERY_FLOOR_SELECT` | la PROJECTION minimale d'où la position se résout |
| `deliveryFloorOf` | la DESCENTE, et son repli |
| `DeliveryFloorCursor` | l'EXIGENCE : les deux colonnes sont requises |

## Pourquoi un module, et pas trois remplacements de variable

Parce que des trois sites qui posent cette borne, **le troisième ne chargeait pas
la colonne du tout**. La cascade « lu ⇒ remis » de `markMessagesAsRead` lisait
son curseur en `select: { lastReadAt, lastDeliveredAt }` : y changer la variable
passée aurait été un **no-op MUET**, et aucun témoin de verdict ne l'aurait dit.

C'est la forme exacte de la leçon 276 (`utils/recipient-language.ts`) : *c'est la
PROJECTION trop étroite, pas l'appel manquant, qui rend une descente impossible
en aval sans qu'aucun témoin ne rougisse.*

`DeliveryFloorCursor` rend la règle **structurelle plutôt que disciplinaire** :
le paramètre exige la colonne, donc un site qui ne la charge pas ne compile pas.
Mesuré — réduire la projection du troisième site rend
`TS2345: Argument of type '{ lastReadAt: Date; lastDeliveredAt: Date; }' is not
assignable to parameter of type 'DeliveryFloorCursor'`. Une règle qu'il faut
retaper à chaque site est une règle qu'un site finira par ne pas avoir ; celle-ci
n'est plus retapable.

## Les trois arbitrages de la loi

### Le MINIMUM des deux, et non la position seule

L'invariant attendu est `position <= horloge` — un message est créé avant d'être
remis — donc les deux formes coïncident sur toute donnée saine. Elles divergent
sous une **dérive d'horloge entre deux serveurs**, et là la position seule
RÉTRÉCIRAIT la fenêtre sous ce qu'elle couvrait avant ce lot : une régression
introduite par le correctif lui-même. Le minimum ne peut que l'élargir.

Élargir est sûr, et pour deux raisons qui tiennent ensemble : le gel est
**write-once**, donc ré-ouvrir un intervalle déjà gravé n'écrit rien ; et un
message situé sous le plancher est un message que le curseur **DÉCLARE** déjà
remis.

### Le repli sur l'horloge, jamais sur `null`

Une ligne écrite avant l'introduction de la colonne n'a pas de position.
Repartir de l'origine y re-litigerait un passé dont le repli curseur de
`resolveReceivedAt` rend déjà compte. La fenêtre démarre alors trop TARD — c'est
l'ancien comportement, donc une non-régression, jamais une correction.

### Le site EXACT reçoit la position bien qu'elle y soit INERTE

`freezeMessageStatus` ignore `since` dès qu'une liste d'ids est nommée — la liste
ÉTANT la borne. Le site EXACT passait donc l'horloge **sans conséquence
mesurable**. Il reçoit quand même la position : une valeur fausse mais
inexploitée est un **piège armé**, pas une économie (règle du cycle 84). Le jour
où ce paramètre compterait en mode exact, l'horloge serait de retour sans qu'un
témoin tombe.

## Ce que la décision NE tranche PAS

**La chaîne de LECTURE porte les deux horloges murales que la livraison vient de
perdre** — son balayage de contiguïté (`_computeExactReadCursorTarget`, le défaut
de #18731) ET sa fenêtre de gel (celui de ce lot). Mesuré ici, ouvert en
**#19299**, pas corrigé : mêler les deux rendrait la mesure « rien n'a été
perdu » invérifiable, et surtout l'arbitrage « élargir est sûr » ne se transpose
pas sans être réinstruit — le dépôt écrit lui-même qu'« un message gravé lu à
tort l'est pour toujours ».

**L'absence de transaction** entre l'avance du curseur et le gel est inchangée
(#18731 § Suivis) : ce lot ne touche ni l'ordre ni l'atomicité, seulement la
borne.

**Un participant SANS curseur** balaie toujours depuis le début de la
conversation. Le plancher est `null` dans ce cas, et le comportement est celui
d'avant ce lot.

## Une borne rangée chez le site qui l'a MESURÉE se lit comme la propriété de ce site

*2026-11-08 — #17081, cycle 150*

### Ce qui s'est passé

#10819 a mesuré en production qu'un message dans une conversation de 375
membres lançait 370 créations de notification à la fois, tenait la file Prisma
et la boucle d'événements 10 à 14 secondes, et faisait attendre TOUTES les
routes de la passerelle. La correction est exemplaire : un réservoir borné, la
mesure en doc-comment, un témoin qui compte le pic en vol, et une constante
nommée — `MESSAGE_FANOUT_CONCURRENCY`, dans `messageNotificationFanOut.ts`.

Le lot de MENTIONS, dans un autre fichier, est resté un `Promise.all` nu jusqu'à
cinquante destinataires. Trois fois le débit que la mesure avait jugé fatal.

### Pourquoi

Le coût que la borne borne n'est pas dans l'éventail qui l'a mesurée. Il est
dans `createNotification` → `computeConversationUnreadBadge`, qui dit son prix à
voix haute : « 2 requêtes + une par conversation NON MUETTE du destinataire ».
La mention paie exactement ce prix, plus quatre lectures par destinataire.

Mais la constante portait le nom et l'adresse de l'éventail `new_message`. Lue
depuis le lot de mentions, elle ressemble à un réglage interne du voisin — pas à
une règle qui me concerne. Son doc-comment, superbe, raconte l'histoire d'un
incident sur `new_message` : il PROUVE que la borne appartient à ce site-là.

> **Une mesure range la règle qu'elle justifie à l'endroit où elle a été
> faite — qui est presque jamais l'endroit où le coût est payé.** Après avoir
> borné un site, demander : *qui d'autre paie ce que je viens de borner ?* et
> ranger la borne chez le COÛT, pas chez le symptôme.

C'est la leçon 279 (« un lot ferme une classe dans SA langue ») vue par la
constante : la langue du lot était « l'éventail new_message », et la propriété
était « toute création de notification en lot ».

### La seconde moitié ne se mesure pas en requêtes

`Promise.all` REJETTE au premier échec. Un seul destinataire en défaut emportait
le lot entier — et avec lui le compte rendu de ceux qui avaient abouti.
`settleWithConcurrency` est `allSettled` par construction, donc le même
remplacement règle les deux.

> **Quand on remplace une primitive de concurrence, énumérer ce que l'ancienne
> décidait d'autre.** `Promise.all` décide du débit ET de la propagation des
> échecs ; on ne vient en général que pour le premier.

### Le témoin, et pourquoi il a besoin de cinquante personnes

Un témoin à deux ou trois mentionnés ne peut PAS tomber : une borne de seize ne
mord qu'au-delà, et les deux implémentations rendent le même verdict en dessous.
Il en faut cinquante — ce que le plafond par message autorise. Et le témoin
NÉGATIF qui l'accompagne (« trois mentionnés partent ensemble ») interdit qu'on
paie la borne en sérialisant les petits lots.

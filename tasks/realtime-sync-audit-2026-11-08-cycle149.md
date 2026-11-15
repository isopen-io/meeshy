# Audit de synchronisation temps réel — cycle 149 (2026-11-08)

Branche `claude/exciting-planck-lnj0k7`, **redémarrée depuis `origin/dev`** à
`6ca6a0933` : la PR du cycle 148 (#17070) a été fusionnée, et une PR fusionnée
ne reçoit pas de suite.

Le cycle 148 avait rendu onze constats d'audit, dont trois sont devenus ses
lots. Ce cycle-ci prend **quatre des huit restants** — les quatre dont la
correction est petite, le périmètre net, et le constat vérifié en primaire
avant d'être repris.

## Lot G — deux suppressions concurrentes ne décomptent plus deux fois (#17079)

Les deux transports lisaient le message sous `deletedAt: null`, donc un rejeu
SÉQUENTIEL rendait déjà « introuvable ». Deux requêtes CONCURRENTES
franchissaient cette lecture toutes les deux, écrivaient toutes les deux, et
appliquaient toutes les deux les effets du retrait — dont `onMessageDeleted`,
**un décompte non idempotent**. Les compteurs de `GET …/stats` dérivaient vers
le bas de la valeur d'un message, définitivement ; `deletedAt` avançait d'une
milliseconde, ce qui déplace la borne des flux de tombstones.

**La garde était CITÉE par le site qui ne l'avait pas.** Le commentaire de la
route de suppression nomme « la garde optimiste de l'édition
(`where: { id, deletedAt: null }`) », au présent, pour expliquer ce qu'elle
protège chez le voisin.

> **Citer une garde donne la sensation de l'avoir.** C'est la variante la plus
> discrète de « une garde posée sur un chemin se lit comme posée sur le
> SUJET » : le site la CONNAÎT, l'a écrite dans sa prose, et un lecteur qui
> tombe sur ce commentaire apprend qu'elle existe et qu'elle est pertinente
> ici — les deux choses qui lui ôtent l'envie de vérifier qu'elle y est.
> Détail : `tasks/lessons/2026-11-08-une-garde-citee-par-le-chemin-qui-ne-l-a-pas.md`.

**Et l'audit ne nommait qu'un des deux transports.** Le second est celui que
deux doc-comments du dépôt appellent « primaire ». Le correctif n'est donc pas
un `where` ajouté deux fois mais un site unique
(`services/messaging/softDeleteMessage.ts`) qui porte l'écriture ET
l'INTERPRÉTATION de son échec — parce que « que fait le perdant d'une
course ? » a une bonne réponse et deux mauvaises : laisser remonter `P2025`
(500 pour un appel dont le résultat est acquis), ou traiter toute erreur comme
une course perdue (un retrait réellement échoué disparaît sous « quelqu'un
d'autre l'a fait »).

## Lot H — reposer le même rang n'est pas un geste (#17078)

`PATCH …/role` ne comparait jamais le rang demandé au rang courant. Un rejeu
écrivait une ligne identique, diffusait `participant:role-updated` à toute la
salle sans delta, et poussait une notification dont
`previousRole === newRole` — « X vous a nommé administrateur » pour un geste qui
n'a rien changé, dans la famille qui perce la sourdine.

**Le court-circuit rend un ACCORD, là où la jumelle du bannissement refuse en
400, et ce n'est pas une incohérence.** Un bannissement est un acte de
MODÉRATION : son refus informe l'acteur que quelqu'un d'autre l'a déjà fait. Un
rang déjà au rang demandé est l'ÉTAT QUE L'APPELANT A DEMANDÉ ; lui rendre une
erreur ferait échouer un geste réussi, et le rejeu vient d'un retry, d'un drain
d'outbox ou d'un double tap — jamais d'une intention de conflit.

Placé APRÈS tous les refus : **un rejeu n'est une absence d'effet que pour qui
avait le DROIT d'agir.** Et la lecture du participant servi est extraite, parce
que deux sorties la servent désormais — la laisser inline aurait fait du rejeu
une réponse plus PAUVRE que celle d'un vrai changement.

## Lot I — l'accusé de livraison d'un invité de lien (#17077)

Un `!isAnonymous` qui ne protégeait RIEN : `currentParticipantId` est résolu
pour les deux identités vingt lignes plus haut, et `markMessagesAsReceived`
prend un `Participant.id`. Le gate retirait simplement une population d'un des
trois transports du même fait, sans une ligne pour le justifier — le cas de
référence que le `CLAUDE.md` du gateway interdit nommément, et que le cycle 61
a déjà payé sur la pastille de non-lus, pour la même population.

PIÈGE ARMÉ, dit comme tel : les deux autres transports couvrent les
sans-compte. Restait l'invité qui lit l'historique par REST **sans socket
authentifiée vivante** — page de lien avant l'authentification socket, coque en
reprise.

## Lot J — l'édition purge la traduction, pas le texte d'avant (#17082)

Le commentaire de la purge affirmait que « le reste du contexte décrit le
message et NON SON TEXTE ». Vrai quand il a été écrit ; le cycle 124 l'a rendu
faux en ajoutant `messageContent` + `messageOriginalLanguage`.

> **Et c'est le commentaire qui rendait l'autre moitié invisible** : on ne
> cherche pas un champ de texte dans un contexte dont on vient de lire qu'il
> n'en porte pas.

Rétention, pas fuite servie : aucun client ne lit ce champ par REST aujourd'hui.
La ligne `Notification` gardait indéfiniment le texte que l'auteur avait
précisément édité pour le retirer.

## La forme du cycle

Les quatre lots ont la même forme — **une écriture ou une garde dont le
VOISINAGE immédiat portait déjà la bonne réponse** :

| lot | ce que le voisinage disait déjà |
|---|---|
| G | le commentaire du site citait la garde du chemin d'à côté |
| H | la jumelle du bannissement refuse un rejeu depuis toujours |
| I | la clé juste était résolue vingt lignes plus haut, et le `CLAUDE.md` nomme l'idiome |
| J | le commentaire de la purge énumérait ce qu'elle ne visait pas |

Aucun n'a demandé de chercher loin. Les quatre ont demandé de **relire ce qui
était écrit à côté comme une affirmation, et non comme un décor.**

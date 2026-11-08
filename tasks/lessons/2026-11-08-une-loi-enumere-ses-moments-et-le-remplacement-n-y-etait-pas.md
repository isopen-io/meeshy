# Une loi ÉNUMÈRE ses moments, et le REMPLACEMENT n'y était pas (2026-11-08, cycle 142)

## Le fait

`SocketTransportRetirement` (SDK iOS) existe parce que Socket.IO arme
l'expiration d'un `emitWithAck` avec une référence **faible** au client. Son
doc-comment nomme les moments où le danger survient :

> « libéré au démontage (**arrière-plan, rotation du jeton, reconnexion
> forcée**), il n'appelait ni la réponse ni l'expiration, et la tâche qui
> attendait — un envoi rejoué, un `call:end` — restait suspendue pour toujours. »

Les trois sont des **DÉMONTAGES**, et les deux gestionnaires appellent bien la
loi à leur porte de démontage. Le **REMPLACEMENT** est un quatrième moment, et
il n'est pas dans la liste : `establishTransport()` réassignait `manager` sans
retraite, son garde-fou d'entrée ne couvrant que `.connected || .connecting` —
alors qu'un socket coupé par le serveur reste non-nil et `.disconnected`, donc
passe dessous **avec ses accusés en vol**.

Conséquence utilisateur : `sendAsync` ne rend jamais la main, donc jamais le
`nil` qui déclenche le repli REST/outbox. Le message reste sur l'horloge pour
toute la session.

## La règle

C'est la **leçon 261** — *une énumération de sites porte deux affirmations :
« ces sites appliquent la règle » (vérifiable) et « ce sont les sites où elle
s'applique » (presque jamais vérifiée)* — appliquée non plus à un inventaire
d'audit, mais au **doc-comment d'une loi**.

Une loi qui se présente avec la liste de ses occasions se lit comme exhaustive.
La question à lui poser : **« quel VERBE décrit cette liste, et mon site en
est-il un autre ? »** Ici le verbe était *démonter* ; le site fautif
*remplaçait*. Même geste pour la mémoire (l'ancien objet est relâché), autre mot
— et c'est le mot qui a décidé de l'inventaire.

L'inventaire refait proprement : 3 sites de construction, **1 déjà couvert**
(`connectAnonymous`, qui passe par `suspendTransport()` et dont le commentaire
montre que son auteur avait instruit la question), 2 non couverts.

## Le corollaire, trouvé dans le même cycle et plus coûteux

Un volet d'audit du même cycle a rendu, avec une évidence par ligne, que le badge
d'icône restait à zéro sur une lecture partielle. **Faux** : la passerelle émet
`conversation:unread-updated` APRÈS les `read-status:updated`, et le rang qui
l'applique est inconditionnel — le badge se répare seul.

L'analyse n'avait pas inventé sa prémisse. Elle l'avait **lue dans un
commentaire de production** : « *the mark-read route emits only
`read-status:updated`, never an unread-updated=0* ». Vrai à son écriture, faux
depuis que la route porte son émission finale.

> **Un commentaire périmé ne rougit pas, et il ne trompe pas seulement un
> lecteur humain : il fournit à une analyse par ailleurs rigoureuse l'unique
> prémisse qu'elle ne va pas revérifier — parce qu'elle est écrite à l'endroit
> exact où la question se pose.** Le reste du raisonnement était juste ligne à
> ligne ; l'étape fausse était la seule que le rapport ne citait pas, et elle
> vivait à l'autre bout du système que le volet examinait.

Pratique qui en découle : **un rapport d'audit se reçoit comme une piste, pas
comme un constat.** Re-vérifier soi-même l'étape DÉCISIVE — pas les plus
nombreuses, ni les mieux citées : celle dont la fausseté suffirait à annuler la
conclusion. Et quand cette étape est « le serveur n'envoie jamais X », l'ouvrir
chez le SERVEUR.

## Et le choix de l'outil de garde

`transportRetirement` est `private let` sur deux **singletons**, sans point
d'injection : aucune surface publique ne rend la retraite observable, et la
contourner ne fait tomber aucun type. Une garde de **SOURCE** était donc le bon
outil — motif déjà présent au dépôt, avec sa justification écrite.

Deux exigences qui la distinguent d'une décoration :
- **sa portée est la FONCTION**, jamais une fenêtre de N lignes. Large, elle
  accepterait une retraite écrite dans la fonction précédente ; étroite, elle
  rougirait sur un site conforme dont la retraite est six lignes plus haut.
- **elle doit TOMBER sur des sources fabriquées**, et sur chaque forme qu'elle
  prétend refuser — site non couvert, retraite dans la fonction d'à côté, simple
  mention en commentaire (les doc-comments de ces fichiers CITENT la porte par
  son nom).

Et quand la chaîne de compilation du langage n'est pas disponible dans le
conteneur : **rejouer le prédicat de la garde hors de ce langage, sur les deux
révisions**, prouve le rouge sans attendre 40 minutes de CI. Ça ne prouve pas la
compilation — c'est le `workflow_dispatch` qui s'en charge — mais ça prouve que
la garde n'est pas une décoration, ce qui est la question que la CI ne répond
pas.

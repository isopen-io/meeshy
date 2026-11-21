## Une clé POSITIONNELLE envoie réparer la voisine — et la voisine peut être une exemption instruite (cycle 206, #20155)

Le cliquet des portes à clé d'appelant gelait son inventaire sous des clés
`fichier#genre:rang-d-apparition`, avec ce doc-comment :

> « La clé d'un site est `fichier#rang-du-genre`, **jamais le numéro de ligne** —
> une clé de ligne dérive à la première édition et transforme le cliquet en
> bruit. »

La première moitié est juste, et c'est la doctrine du dépôt. La seconde phrase
cache ce que le rang ne protège pas : **il est stable contre les éditions qui ne
changent pas le NOMBRE de sites, et contre rien d'autre.**

Mutation de l'audit adversarial — une porte nue insérée **en tête** de
`routes/conversations/utils/target-participant.ts`, le fichier qui porte les
DEUX seules exemptions instruites du cliquet :

```
● le relevé des portes NUES est exactement celui des deux inventaires
  + Array [ "routes/conversations/utils/target-participant.ts#clause:2" ]
```

Le cliquet rougit — c'est ce qu'on lui demande. Mais il nomme `#clause:2`, alors
que la porte NEUVE est `#clause:0` : les deux clés instruites ont glissé d'un
rang, et c'est la DERNIÈRE qui apparaît comme entrante. Or le commentaire du
témoin ordonne :

```ts
// ENTRANTE = une porte NEUVE : instruire sa loi, pas ajouter une ligne.
```

Un mainteneur qui suit l'instruction resserre donc la lecture de #10465 — dont
la raison, écrite dans `PORTES_DELIBEREMENT_LARGES`, dit exactement pourquoi
elle doit rester large : « bannir quelqu'un déjà parti est un geste légitime ».
Resserrer là rend un banni **introuvable, donc indébannissable**. Le cliquet
envoyait réparer ce qui tient, pour corriger quelque chose d'autre, et son
message d'échec ne contenait rien qui permette de s'en apercevoir.

### Afficher la ligne ne suffit pas

Premier correctif tenté : imprimer la ligne à côté de la clé, le type portant
déjà `line`. Mesuré — il nomme `ligne 74`, celle de la porte PRÉEXISTANTE qui a
glissé, pas celle de la porte neuve insérée en 73. **La ligne affichée décrit le
site que la clé a désigné, et c'est la clé qui est fausse.** Un diagnostic plus
riche sur une mauvaise identification reste une mauvaise identification.

### La clé est la FORME

`fichier#genre:clause-condensée`. Elle ne bouge pas quand une porte apparaît
ailleurs dans le fichier, et elle change exactement quand la clause change —
c'est-à-dire quand on VEUT une reclassification. Deux portes de forme identique
dans un même fichier se départagent par un rang, qui ne concerne alors qu'elles
deux. Rejouée, la même mutation nomme la porte neuve et sa ligne, et les deux
clés instruites ne bougent pas.

> **La question à poser à la clé d'un inventaire gelé n'est pas « dérive-t-elle
> à l'édition ? » mais « quand elle dérive, QUI est-ce qu'elle accuse ? ».** Un
> cliquet dont le message désigne un site voisin du vrai est pire qu'un cliquet
> muet : il est obéi. Et le pire voisin possible est une exemption instruite,
> puisque le témoin qui l'accuse demande précisément de retirer ce que
> l'inventaire a décidé de garder.

Corollaire de la même famille : les PUBLICATIONS (ce qu'un balayage avoue ne pas
savoir juger) étaient keyées `fichier#genre/raison`, sans rang. Sept paires du
relevé portaient donc la même chaîne, et deux chaînes identiques dans une
comparaison de tableaux s'annulent : un illisible RÉPARÉ et un illisible NEUF
dans le même fichier laissaient le cliquet vert. Un cliquet qui ne sait pas
compter ses propres aveux d'ignorance en perd la moitié sans le dire.

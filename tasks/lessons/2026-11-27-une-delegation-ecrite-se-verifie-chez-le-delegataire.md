## 2026-11-27 — une délégation ÉCRITE se vérifie chez le DÉLÉGATAIRE

**Issue** : #20717 · **Cycle** : 225 · routine messagerie temps réel

## Le motif

Le dépôt sait déjà qu'**un commentaire qui ÉNONCE une contrainte est une
AFFIRMATION, et se vérifie comme telle** (cycle 94, `encryptionMode`). Ce lot en
mesure la forme la plus coûteuse : le commentaire qui **DÉLÈGUE** une contrainte.

`services/gateway/src/services/posts/viewerAudience.ts`, depuis #7184 :

> LE BLOCAGE N'EST PAS POSÉ ICI, ET C'EST UNE DÉCISION (#7184). […] Le blocage
> des accès unitaires appartient donc à `canUserConsumePost`, et c'est un lot à
> part.

`canUserConsumePost` ne lisait aucun blocage, et ne l'avait jamais lu.

**Les deux moitiés de la phrase étaient vraies du code.** Le filtre ne posait pas
la règle : vrai, et vérifiable en une ligne. Le domicile est `canUserConsumePost` :
vrai comme intention, jamais comme état. Un lecteur qui vérifie la première
moitié — celle qui est devant lui — conclut que le commentaire dit vrai et passe.

> Une affirmation se vérifie sur place. Une **délégation** ne se vérifie qu'en
> ouvrant un AUTRE fichier, et c'est l'étape que personne ne fait : la phrase se
> lit comme une décision déjà instruite, avec son numéro d'issue en appui.

## La question à poser

Devant toute phrase de la forme « X n'est pas ici, X appartient à Y » :

**ouvrir Y, et chercher X.**

Pas « Y est-il le bon domicile ? » — c'est la question que la phrase invite à se
poser, et elle est presque toujours à répondre « oui ». La question utile est
« Y l'a-t-il REÇU ? ».

## Deux variantes à reconnaître

- **« c'est un lot à part »** — une dette ANNONCÉE n'est pas une dette TRACÉE.
  Celle-ci était nommée dans le commentaire de clôture d'une issue fermée, ce
  qui la rendait introuvable : elle n'avait pas d'issue ouverte, donc elle
  n'existait pas au sens du pilotage (§ « Aucune feature sans issue »).
- **« la garde dédiée existe déjà »** — la phrase dit « existe », le code dit
  « devrait exister ». Les deux lectures sont possibles sur le même mot.

## Ce qui a fini par la trouver

Pas une relecture du commentaire : **l'instruction d'un suivi hérité** (#20458).
Le lot voisin #7416 avait indépendamment écrit la même mesure dans son
commentaire d'issue — « le verdict rejoué […] ne lit pas le blocage sur un post
PUBLIC ». Deux sessions ont donc touché la même absence sans la fermer, chacune
la notant dans un endroit différent.

> Corollaire : **une mesure consignée dans un commentaire d'issue n'est pas un
> suivi.** Elle ne devient actionnable qu'en devenant une issue à elle.

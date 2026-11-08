# Un cliquet qui rougit sur un lot JUSTE n'est pas un faux positif : c'est une question

**Cycle 146.** Trois cliquets du dépôt ont rougi sur six lots corrects. Aucun
n'avait tort, et les trois réponses ont ajouté au dépôt ce qu'aucun des lots
n'aurait écrit de lui-même.

| cliquet | ce qu'il a vu | la réponse JUSTE |
|---|---|---|
| porte d'ENFILAGE (inventaire vide par principe) | une seconde unité appelant `enqueue` | **déclarer la seconde porte avec son AUDIENCE**, et figer l'ensemble à deux |
| `findMany` non bornés sous `routes/` | un site neuf | **une entrée avec sa raison**, à côté de ses trois jumelles gelées pour la même forme |
| typecheck des tests (plafond 76) | 77 | **trancher les trois verdicts manquants**, jamais monter le plafond |

## Les trois réflexes à ne pas avoir

1. **Monter le plafond.** Le cliquet de typecheck existe pour descendre ; le
   remonter solde une dette en la renommant. Ici l'erreur en trop était la plus
   utile du cycle : un `Record` COMPLET sur l'union des familles de file
   refusait de compiler tant que les trois familles neuves n'avaient pas leur
   verdict d'ARRIVÉE. C'est la garde que le fichier décrit dans son propre
   doc-comment, et elle a fonctionné.
2. **Exclure le fichier du balayage.** C'est ce qui rend un inventaire vide
   MENSONGER : il reste vert parce qu'il ne regarde plus. Quand une porte
   légitime s'ajoute, elle se DÉCLARE — et un second témoin FIGE la liste des
   portes déclarées, sans quoi la première assertion ne garde rien.
3. **Geler en silence.** Le doc-comment de la porte d'enfilage l'avait écrit
   d'avance : « l'entrée demande alors une décision écrite, pas un gel
   silencieux. » La décision écrite ici est le DISCRIMINANT : ce n'est pas le
   nom de l'unité qui fait d'elle une porte partagée, c'est l'AUDIENCE dont elle
   décide — et une porte de plus doit nommer l'audience qu'aucune des autres ne
   sait servir. Ce qui n'est pas une audience neuve est un transport, et un
   transport délègue.

## La forme de la question

Quand un cliquet tombe sur un lot dont on est sûr, la question n'est pas
« comment le faire taire ? » mais **« quelle propriété garde-t-il, et mon lot
la respecte-t-il AUTREMENT ? »**. Si oui, c'est la DÉCLARATION de cet autrement
qui est le correctif — et elle appartient au cliquet, pas au lot.

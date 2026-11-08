# Un témoin qui ne peut pas tomber se trouve en CHASSANT le rouge, jamais en relisant l'assertion

**2026-11-08** — cycle 145 de l'audit temps réel (#16751, #16750, #16830, #16837, #16852, #16856).

## Ce qui s'est passé

**Trois témoins de ce cycle ne pouvaient pas tomber tels qu'ils étaient d'abord
écrits.** Les trois étaient bien intentionnés, bien nommés, et assertaient
exactement ce que leur intitulé promettait. Aucun n'aurait été attrapé par une
relecture de son assertion.

| témoin | ce qu'il croyait garder | pourquoi il ne pouvait pas tomber |
|---|---|---|
| projection du `select` (#16830) | que la requête ramène `Participant.id` | le double Prisma rend `participants` **quel que soit** le `select` — les deux témoins de COMPORTEMENT du même lot passaient au vert sur une requête qui l'oubliait |
| balayage des portes d'arrivée (#16837) | que tout site créant une ligne `Participant` appelle la loi | il ne cherchait que `participant.create(` et manquait `createMany` (`InitService`) |
| scénario « forme paquet » (#16852) | que le script omette `-project` pour un paquet | le faux `xcodebuild` **ignore ses arguments**, donc il acceptait `-project -` sans broncher |

Dans les **trois** cas, le défaut du témoin est apparu au moment de **prouver le
rouge** — en remettant la production fautive et en constatant que le témoin
restait VERT.

## La règle

**Prouver le rouge n'est pas une formalité de clôture : c'est la seule mesure
qui distingue un témoin d'une décoration.** Le dépôt l'écrit déjà
(« Toujours prouver le ROUGE »), et ce cycle mesure *pourquoi* la relecture ne
peut pas s'y substituer : un témoin qui ne peut pas tomber est, par
construction, un témoin dont l'assertion est JUSTE. Il n'y a rien à repérer en
le relisant. Ce qui manque n'est pas dans l'assertion, c'est dans ce que le
HARNAIS laisse passer.

## Les trois formes, pour les reconnaître

1. **Le double répond trop** — il rend ce qu'on lui a dit de rendre, sans égard
   pour la requête. Un témoin de PROJECTION (qui assert sur la requête) est
   alors le seul capable de voir la colonne manquante ; **un témoin de
   comportement ne peut pas voir un `select`.**
2. **La sonde cherche UN idiome** — elle mesure alors la popularité de cet
   idiome, pas la propriété visée (cycle 107, et ici `create` vs `createMany`
   vs `upsert`).
3. **Le double accepte trop** — jumeau du premier, et le plus discret, car le
   test qu'il sert PASSE. Un faux `xcodebuild` n'a aucune raison de regarder ses
   arguments, donc il valide toutes les formes d'appel, y compris celles que le
   vrai outil refuse. **Un témoin de FORME D'APPEL exige un double qui lise ses
   arguments** (cycle 112, « un double mentait aussi par ce qu'il ACCEPTE »).

## Le geste

Après avoir écrit un témoin, **remettre la production fautive et le relancer.**
S'il reste vert, le défaut est dans le harnais : demander laquelle des trois
formes ci-dessus s'applique. Et quand la production fautive n'est plus
accessible (code supprimé, autre révision), **rejouer le prédicat contre
`git show HEAD:<fichier>`** — c'est ce qui a prouvé les deux gardes Swift de ce
cycle sans chaîne de compilation.

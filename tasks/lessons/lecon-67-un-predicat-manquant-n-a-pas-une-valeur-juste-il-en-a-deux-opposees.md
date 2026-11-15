## Leçon 67 — Un prédicat manquant n'a pas UNE valeur juste ; il en a deux, opposées (2026-08-09, routine messaging, cycle 40)

Quatre cycles de suite (37, 38b, 39, 40) ont posé la même question : **quelles appartenances sont
jointes sans `isActive` ?** Les trois premiers l'ont traitée comme une question à réponse unique —
trouver le site, ajouter le filtre, fermer. Le quatrième est tombé sur la famille où **ajouter le
filtre est exactement le mauvais correctif sur deux sites sur trois.**

Les trois portes d'entrée d'une conversation face à la ligne qu'un départ laisse derrière :

- celle **sans** le filtre concluait « déjà membre » sur une ligne inactive → l'ancien membre ne
  revenait **jamais**, et l'écran ne disait rien d'autre que « vous êtes déjà membre » ;
- celles **avec** le filtre ne voyaient pas la ligne d'un banni → elles lui **créaient une ligne
  neuve et active**, défaisant le bannissement sans passer par `unban`, et laissant un doublon.

Ajouter `isActive: true` à la première l'aurait fait rejoindre les deux autres dans leur défaut.
**La valeur juste du prédicat dépend de ce qu'on fait ENSUITE de la ligne trouvée** — donc ce n'est
pas le filtre qu'il fallait unifier, c'est la décision qui le consomme. Règle : avant d'ajouter un
filtre d'appartenance, lire le `create`/`update` qui suit. Si le filtre change la branche prise, on
ne corrige pas une garde, on change une politique — et il faut l'écrire quelque part.

**Le symptôme qui désigne cette famille : une paire d'états sans contrainte d'unicité.**
`Participant` n'a aucun index unique sur `(conversationId, userId)`. Le schéma ne rattrape donc
rien : chaque porte qui fait `create` sans avoir vu la ligne existante en fabrique une seconde, en
silence. **Quand un modèle encode une relation « au plus une par paire » sans le dire au schéma,
toutes ses portes d'écriture sont suspectes en bloc** — pas une par une.

**Corollaire — un « soft delete » multiplie les états, et personne ne les énumère.** `isActive:
false` + `bannedAt` + `leftAt` + `deletedForMe` font quatre façons d'être absent d'une conversation.
Un `where` n'en teste jamais qu'une, et le code lit le résultat comme un booléen « membre / pas
membre ». Chaque porte avait choisi un état différent à tester, ce qui donne exactement autant de
politiques que de portes. Le remède n'est pas un filtre commun mais **une fonction qui rend l'ÉTAT**,
et laisse l'appelant brancher dessus.

**Corollaire de sécurité — la révocation se contourne par la porte d'à côté, pas par la porte
qu'elle ferme.** Personne n'a essayé de contourner `POST …/ban` : il fait ce qu'il annonce. C'est
`POST …/participants` qui le défaisait, en ne sachant pas qu'il existait — et avec un rang
(`moderator`) que `POST …/unban` refuse. **Après avoir écrit une révocation, chercher tous les
chemins qui écrivent la même ligne dans l'autre sens**, et vérifier qu'ils exigent au moins le rang
que la levée exige. Un rang plus faible sur un chemin plus discret est une élévation de privilège
qui ne ressemble pas à une élévation de privilège.

**Corollaire de test — un double qui rend ses lignes dans l'ORDRE D'APPEL ne peut mesurer aucune
garde.** `signal-protocol-routes.test.ts` annonçait couvrir « user not a participant → 403 » ; son
`findFirst` rendait la première ligne au premier appel et la seconde au deuxième, **quel que soit le
`where`**. La branche 403 était donc atteinte en donnant `null` — jamais en donnant une ligne que le
`where` aurait dû exclure. Le test vérifiait que la route sait répondre 403, pas qu'elle sait
**quand**. Un double de base de données doit discriminer sur le `where`, sinon il ne teste que le
câblage.

**Et le faux positif qu'il a fallu corriger en route :** le premier harnais donnait à l'appelant des
portes d'ajout le rang `member`. Le 403 de **rang** satisfaisait alors l'assertion qui mesurait le
403 de **bannissement** : le test passait, pour la mauvaise raison, sur du code non corrigé. **Quand
une route peut refuser pour plusieurs motifs et que l'assertion ne regarde que le code de statut,
elle ne distingue pas les motifs** — il faut soit assertir l'effet (`create` non appelé ET `update`
appelé), soit rendre tous les autres motifs impossibles dans le montage.

## Un balayage à l'échelle du FICHIER mesure la popularité d'un idiome, pas une propriété du site qui sert (#19977)

*2026-11-20, #19977. Pas de numéro de cycle : il s'alloue dans un espace de noms partagé, et un identifiant qui ne s'alloue pas ne collisionne pas (#5102).*

### Le motif

Le dépôt connaît déjà la forme générale — « un balayage qui cherche UN idiome
mesure sa popularité » (cycle 107, balayage JETÉ plutôt que gelé). Ce cycle en
mesure la variante la plus facile à commettre : **le bon idiome, cherché au
mauvais GRAIN.**

#19977 demandait un cliquet appariant « producteur de `message:edited` portant
`attachments` » × « interroge un plan signé ». Ma première rédaction cherchait
les deux dans le même FICHIER. Elle était verte sur le défaut qu'elle est écrite
pour attraper :

```
$ grep -cP '\breaderSignedPlan[A-Za-z]*\s*\(' MeeshySocketIOManager.ts   # AVANT le correctif
1
$ grep -cP '\bofflineSigned[A-Za-z]*\s*\('     MeeshySocketIOManager.ts
1
```

Les deux appels existaient bel et bien — trois cents lignes plus haut, dans
`_broadcastNewMessage`, pour `message:new`. Le fichier « consultait un plan ».
L'unité qui servait l'édition, non.

### La règle

**Le grain d'une garde est l'unité qui SERT, jamais le fichier qui la
contient.** Un fichier est une unité de RANGEMENT ; la propriété gardée — « ce
site a interrogé le plan avant de remettre cette adresse » — est une propriété
d'un chemin d'exécution. Les deux ne coïncident que dans les fichiers d'une
seule responsabilité, c'est-à-dire précisément ceux où le cliquet ne sert à
rien.

La forme outillée tient en une fonction : depuis l'index du site fautif, remonter
la pile des accolades ouvertes jusqu'à la première dont la ligne d'ouverture est
une tête d'UNITÉ (et non un `if (…) {`, qui a la même forme et réduirait la
fenêtre à la branche qui émet, où le plan calculé plus haut ne figure pas). La
fenêtre se trompe alors du côté TROP LARGE — jamais de celui qui ferait passer
un site pour gardé.

### Ce qui l'a attrapé, et c'est la part reproductible

Rien dans l'écriture du balayage. Il est passé au vert du premier coup, sur un
dépôt réparé, et je l'aurais livré.

Ce qui l'a attrapé est une mesure que j'ai faite pour le COMMIT, pas pour le
code : *« ce cliquet aurait-il rougi sur l'arbre d'AVANT ? »* — répondue en
reconstruisant l'arbre d'avant (`git show origin/dev:…` dans un `srcRoot`
jetable) et en y lançant le balayage.

> **Un cliquet neuf se livre avec la preuve qu'il ROUGIT sur le défaut qui l'a
> motivé, mesurée sur l'arbre d'AVANT.** « Il est vert sur le dépôt réparé » est
> une phrase que rend aussi bien un cliquet qui ne regarde rien. C'est la règle
> « toujours prouver le ROUGE » (CLAUDE.md § Tests) appliquée à l'outil plutôt
> qu'au témoin — et elle est plus chère à oublier, parce qu'un cliquet aveugle
> ne rougira jamais et se lira comme une garantie pendant des mois.

Et la preuve se RANGE : la fixture négative du cliquet reproduit la forme exacte
du défaut dans un fichier qui, ailleurs, consulte un plan pour un autre
événement. Sans ce voisinage, la fixture passerait aussi sous le balayage par
fichier — elle n'attesterait rien du choix de grain.

### Le corollaire d'énumération, troisième récidive

#9646 a fermé le transport REST en annonçant les transports d'édition ; #19939 a
fermé le transport socket en annonçant qu'il y en avait DEUX ; son audit a rendu
TROIS. Recomptés au 2026-11-20 : **quatre chemins d'émission, six sites de
composition** — et le doc-comment de `messageEditedPayload.ts`, la « source
unique » de ce noyau, écrivait « TROIS producteurs » en nommant la PORTE REST là
où la composition a lieu dans trois fichiers de routes, et en omettant
entièrement la ligne d'arrivées du salon global.

Le compte faux n'était pas dans un journal : il était dans le doc-comment que
chaque lot ouvre avant de toucher à l'événement. **Un compte écrit à l'endroit
le plus autorisé est celui qu'on recompte le moins.**

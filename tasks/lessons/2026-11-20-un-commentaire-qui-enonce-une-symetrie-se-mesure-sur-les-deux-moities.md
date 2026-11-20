## Un commentaire qui énonce une SYMÉTRIE se mesure sur les DEUX moitiés (cycle 188, #19943)

*2026-11-20. Le dépôt sait déjà qu'un commentaire qui ÉNONCE une contrainte est
une affirmation (cycle 94), qu'un compte en est une (cycle 93), qu'un tri en est
une (cycle 86 bis). Celui-ci énonçait une ÉGALITÉ entre deux moitiés, et c'est la
forme qui se vérifie le moins — parce qu'elle a l'air de ne rien affirmer du tout.*

**La phrase.** `MessageMutationParams`, sur la famille `expired` :

```ts
// Server-initiated twin of 'deleted' (a TTL burn, not a user request) —
// same audiences, for the same reason: …
```

Elle était VRAIE quand elle a été écrite. #18556 l'a rendue fausse en élargissant
l'audience de la **seule** expiration — le lot avait raison, il a simplement
laissé derrière lui une phrase qui promettait l'inverse de ce qu'il venait de
créer. Trois autres familles (`deleted`, `pinned`, `unpinned`) sont restées sur
la room de conversation seule, et le commentaire a tenu la question fermée
pendant tout ce temps.

**Pourquoi cette forme-là se vérifie moins que les autres.** Un compte (« il en
reste deux ») et un tri (« ces sites appliquent la règle ») nomment un objet
qu'on peut aller recompter. Une symétrie ne nomme rien : elle dit *« ces deux-là
sont pareils »*, et pour la mesurer il faut ouvrir les DEUX, alors que le lecteur
est toujours venu pour UNE. Celui qui lit la ligne `expired` est en train de
travailler sur `expired` ; la phrase lui dit que `deleted` fait pareil, et il n'a
aucune raison d'aller voir — c'est même le service que la phrase prétend lui
rendre.

> **La question à poser à toute phrase de la forme « X fait comme Y » n'est pas
> « est-ce vrai ? » mais « quand l'ai-je mesuré ? ».** Un lot qui touche X la
> périme sans la lire ; un lot qui touche Y aussi. Elle ne rougit jamais.

**Le corollaire de lot, et c'est lui qui compte.** Un lot qui élargit, resserre
ou déplace une règle sur UNE moitié d'une paire déclarée doit, dans le même lot,
faire l'un des deux :

- porter le changement à l'autre moitié, ou
- **réécrire la phrase pour qu'elle dise la divergence et sa raison**.

Laisser la phrase intacte est le seul choix qui coûte, et c'est celui qui demande
le moins d'effort. La forme retenue ici garde le récit au site :

```ts
// « Same audiences » a été FAUX d'un cycle à l'autre : #18556 a élargi
// l'audience de la seule expiration, et son jumeau est resté sur la room de
// conversation seule pendant que cette phrase promettait l'inverse.
// #19943 les a réunies.
```

**Ce qui a tenu la divergence en vie, et qui n'est pas le commentaire.** Deux
`toEqual` épinglaient la room étroite — sous des intitulés qui parlent d'autre
chose (« une suppression garde son ACTEUR »). Un lot qui aurait voulu élargir
l'audience les aurait fait tomber et aurait dû les rouvrir sciemment : c'est
exactement la bonne forme, et c'est elle qui a fini par forcer l'arbitrage.

> **Un `toEqual` sur une valeur entière affirme autant sur ce qu'il GARDE que sur
> ce qu'il ADMET**, et l'intitulé du témoin ne couvre en général que la première
> moitié. Une assertion incidente est une décision que personne n'a prise ; elle
> vaut mieux qu'un silence, à condition qu'on la relise comme une question quand
> elle tombe, et non comme un obstacle à contourner.

**Et la même leçon, un étage plus bas, sur le double.** `makeIO()` déclarait
`to(room: string)`. Socket.IO accepte `Room | Room[]`. Le double **acceptait**
l'appel avec un tableau et rangeait l'émission sous le tableau lui-même — sous
une clé qu'aucune assertion ne peut nommer. Un témoin posé sur
`emitsTo(io, 'user:…')` serait resté rouge **en accusant la production**.

C'est le constat du cycle 185 sur `findConversationsIn` (un `orderBy` TABLEAU lu
comme un objet), rejoué sur un autre paramètre, dans un autre fichier, à trois
cycles de distance : **un double ment aussi par ce qu'il ACCEPTE, et la forme la
plus discrète de ce mensonge est un paramètre dont il ne lit qu'une des formes
admises.** Quand un correctif fait passer une valeur d'une forme à une autre
(chaîne → tableau), ouvrir le double AVANT de conclure que le rouge accuse la
production.

**Enfin, la discipline d'identifiant.** Ce journal est numéroté 188 et non 186 :
deux autres sessions ont publié un « cycle186 » et une un « cycle187 » pendant
que ce lot attendait un runner. **Un numéro se prend à la PUBLICATION, pas à
l'ouverture** — un identifiant qui ne s'alloue pas collisionne (#5102), et c'est
la troisième fois que ce tracker le paie.

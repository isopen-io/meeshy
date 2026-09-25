## Leçon 250 — un `as` vers le type NU d'une dépendance efface un contrat entier

Cycle 107. La moitié RÉCEPTION du contrat Socket.IO (`ClientToServerEvents`) est
restée ingouvernée trois cycles, non par un oubli de déclaration, mais par un
CAST : `this.io as SocketIOServer`, six fois, vers un `Server` **sans
générique**. Le manager déclarait pourtant son `io` avec les deux cartes.

`DefaultEventsMap` vaut `[event: string]: (...args: any[]) => void`. Sous lui,
`socket.on(n'importe quoi, (data: n'importe quoi) => …)` compile.

> **Un cast vers un type nu ne relâche pas un appel, il relâche tout ce que la
> valeur castée porte** — ici les 22 sites d'écoute d'un sous-système ET tout ce
> que le même module émet. Et il est plus discret qu'une redéclaration : il ne
> crée aucun type nommé qu'on puisse chercher (Leçon du cycle 105, généralisée).

Ce que ça a laissé vivre : `call:analytics`, écouté, validé par Zod et agrégé en
production, ses dix-neuf champs transcrits dans la signature du listener, **absent
du contrat**, avec trois clients l'émettant chacun contre sa propre
transcription.

### Corollaire — annoncer la portée MESURÉE d'une garde, pas celle qu'on espère

La porte typée refuse un nom d'événement absent du contrat. Elle NE refuse PAS
une charge divergente mais assignable dans un sens : `strictFunctionTypes: false`
rend les paramètres BIVARIANTS. Mesuré au compilateur AVANT d'écrire la prose.

> **Une porte annoncée plus stricte qu'elle n'est vaut moins que pas de porte** :
> personne n'ira vérifier derrière. Dire ce qu'elle ne garde pas est ce qui rend
> crédible ce qu'elle garde.

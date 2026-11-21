## Un drapeau posé APRÈS une branche ne peut pas dire laquelle a émis

**Date** : 2026-11-21. **Lot** : #20222 (cycle 204 de la routine temps réel).
**Famille** : cycle 203 (une NOTE qui justifie), 94 (un commentaire qui énonce
une contrainte), 93 (un compte) — toutes des AFFIRMATIONS que rien ne confronte.

**Le constat**

`deliverTextTranslation` comptait les traductions servies ainsi :

```ts
let served = false;
safeBroadcast('message:translation', () => {
  if (readers.kind === 'room') { io.to(roomName).emit(…); }
  else if (readers.rooms.length > 0) { io.to([...readers.rooms]).emit(…); }
  served = true;              // ← posé même quand AUCUNE branche n'a émis
}, …);
if (served) deps.stats.translations_sent += clientCount;
```

Le commentaire du site énonçait la règle JUSTE — « le compteur ne s'incrémente
QUE si l'émission a eu lieu ; sinon il affirmerait avoir servi `clientCount`
clients qui n'ont rien reçu ». Les deux branches le démentaient : `rooms` vide
ne faisait rien partir et créditait la room entière ; une audience restreinte à
un lecteur créditait aussi la room entière.

**La règle**

Un drapeau booléen posé après une cascade de conditions atteste qu'on est
ARRIVÉ au bas de la cascade, jamais qu'une branche a agi. Quand ce qu'on veut
mesurer est une QUANTITÉ, la variable doit porter la quantité et chaque branche
l'affecter : « rien fait ⇒ rien compté » devient une propriété de la forme, que
la branche muette ne peut plus contredire.

Plus généralement : **devant tout `if (fait) compteur += n`, demander qui pose
`fait`, et si `n` est bien ce que CE chemin a servi.** Les deux moitiés se
trompent séparément.

**Le corollaire de harnais, et c'est le plus réutilisable**

Dix témoins exerçaient l'audience de ce site avec soin. **Aucun ne pouvait
exercer sa mesure** : le harnais construisait son `io` avec
`sockets.adapter.rooms = new Map()`, donc `clientCount` y valait TOUJOURS 0, et
le compteur restait à 0 quelle que soit la branche.

> Un harnais qui laisse une dépendance à VIDE rend muet tout ce qui en dérive,
> et le silence ressemble à un vert. La question n'est pas « ce comportement
> est-il testé ? » mais **« le harnais peut-il rendre cette valeur NON NULLE ? »**
> — jumeau du double Prisma qui rend `[]` et rend tout témoin de contenu
> trivialement vert (§ « la liste vide est plus dangereuse que la réponse vide »).

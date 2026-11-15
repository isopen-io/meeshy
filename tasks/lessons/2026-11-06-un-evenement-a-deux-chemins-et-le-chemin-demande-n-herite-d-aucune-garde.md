## 2026-11-06 — Un événement a DEUX chemins, et le chemin DEMANDÉ n'hérite d'aucune garde du chemin POUSSÉ (#16552)

`message:translation` part de deux endroits : le serveur le POUSSE quand NLLB a
fini (`deliverTextTranslation` → `translationReaders`), et le client le DEMANDE
(`translation:request`). Le chemin poussé garde le plancher d'historique de chaque
lecteur, fail-closed, avec sa raison écrite sur place. Le chemin demandé ne gardait
que l'appartenance ACTIVE — ni plancher, ni vivacité.

**Le même événement, la même charge, deux verdicts opposés** : retenu quand le
serveur le pousse, remis quand le client le demande. Un invité entré sans
historique recevait le texte traduit d'un message d'avant son arrivée — l'id étant
à sa portée, `replyToId` voyageant au premier niveau de `message:new`.

> **La doctrine du cycle 127 — « une garde d'admission se pose sur CHAQUE chemin,
> pas sur le plus fréquenté » — énumérait des ÉVENTAILS (message, réponse,
> mention) : trois producteurs du même push. Elle vaut d'une seconde forme que
> cette énumération ne montre pas — le même événement avec un chemin POUSSÉ et un
> chemin DEMANDÉ.** Les deux ne se ressemblent pas dans le code : l'un boucle sur
> une audience, l'autre répond à un socket. Rien ne les met côte à côte, et le
> second se lit comme une simple lecture de cache.

La question qui les attrape : **qui d'autre émet cet événement, et par quel
geste ?** Un `grep` sur le NOM de l'événement les rend tous les deux — c'est le
seul relevé qui ne dépende pas de la forme du code.

### Corollaire — un effacement DÉLIBÉRÉ peut être défait par un chemin qui ignore qu'il a eu lieu

Les trois transports de suppression écrivent `{ translations: null, deletedAt }` :
ils effacent les copies traduites À DESSEIN et gardent `content`. Le handler de
traduction à la demande gardait `!message.content` — qu'un message rappelé
franchit. Il renvoyait donc le texte au traducteur, la colonne `translations` était
RÉÉCRITE, et `deliverTextTranslation` rediffusait la traduction à toute la room
**et l'enfilait pour chaque participant hors ligne** (48 h, rejouée à la
reconnexion). Le secret revenait sur le fil, en base et dans Redis, après qu'on a
dit à l'utilisateur qu'il était détruit.

> **Une donnée dérivée qu'un lot efface exprès se RECALCULE depuis sa source si la
> source survit.** L'effacement n'est pas un état stable : il n'est stable que si
> tout chemin qui sait la recalculer sait aussi qu'elle a été effacée. Devant tout
> `data: { X: null, deletedAt }`, demander — **qui d'autre sait produire X, et
> regarde-t-il `deletedAt` ?**

### Corollaire de forme — une sentinelle `symbol` ne narrow pas sous `strict: false`

La garde distingue trois choses, et deux se ressemblent : plancher `null` (une
RÉPONSE — « ce lecteur lit tout l'historique ») et plancher ILLISIBLE (une
ignorance). Les confondre ferait d'une panne de base une AUTORISATION.

Le premier jet portait ce troisième état par un `Symbol()`. Le paquet compilant en
`strict: false`, `floor !== null` n'est pas un garde de type : la branche gardait
un `Date | symbol` sous l'opérateur `<` (TS2469), et l'annotation `unique symbol`
n'y change rien — c'est `strictNullChecks` qui manque, pas l'unicité du symbole.
Un couple explicite `{ readable, value }` dit les trois états sans dépendre
d'aucun narrowing, et se lit mieux.

**Preuve** : témoin neuf, 6 échecs sur 7 avant (la sortie du témoin montrant la
charge servie, « my access code is 1234 »), 7/7 après ; le 7e est le CONTRÔLE qui
passait déjà et prouve que les gardes refusent le bon cas, pas tout le monde. Les
5 témoins d'engagement voisins restent verts. 405 suites / 7531 tests verts sur
`socketio|translation|historyFloor|messaging|atRest`, `tsc --noEmit` à 0.

**Et la garde était GRATUITE** : le `select` de la vérification d'appartenance que
le handler faisait déjà est passé de `{ id: true }` à
`{ id: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT }`. Doctrine du cycle 127, qui
vaut une fois de plus : *avant de conclure qu'une garde coûterait une requête,
regarder ce que le site lit déjà.*

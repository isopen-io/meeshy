## Leçon 221 — un canal que le serveur diffuse n'a pas d'écouteur par construction, et le chercher « par son nom » rend un tableau faux (2026-08-16, routine temps réel, cycle 54)

*(Numérotée 213 à l'écriture, puis 219, puis 221 — deux collisions successives à la fusion — une leçon 213 de la
routine calling, cycle 138, avait atterri sur `main` entre-temps. La collision
est la conséquence normale de routines parallèles qui ajoutent à la fin du même
fichier : c'est la DERNIÈRE arrivée qui cède, jamais celle déjà référencée par
d'autres journaux.)*

### 1. Le fait

`services/gateway/src/services/personalMessageVisibilitySync.ts` a été écrit pour
fermer un défaut précis, et son en-tête le dit :

> nothing was broadcast, so the hiding only ever reached the device that issued
> the request […] Every OTHER device of the same user kept showing the message
> indefinitely.

Le module a été écrit, l'événement diffusé, le web branché. **iOS n'a jamais eu
d'abonné.** L'état que le module décrit comme corrigé était l'état exact d'iOS,
quatorze cycles plus tard.

### 2. Pourquoi ça survit à des audits successifs

Parce qu'un canal sans écouteur ne casse rien qui se voie. Il n'y a ni erreur,
ni log, ni test rouge : l'émetteur émet, personne n'écoute, et la seule trace est
un écran qui n'a pas bougé. Aucun des deux côtés n'est faux **isolément** — c'est
le RACCORD qui manque, et le raccord n'a de fichier nulle part.

Pire : ici la moitié VOISINE de l'écran était juste. La ligne de liste était bien
corrigée par le `conversation:updated` jumeau, donc la contradiction s'affichait
franchement (l'aperçu annonçait un message, le fil en montrait un autre) sans
qu'aucune des deux moitiés paraisse en tort.

### 3. La règle

**Un contrat serveur qui nomme « les clients » au pluriel doit être vérifié
client par client, à l'écrivain près.** La question mécanique est : *quels
consommateurs cet événement a-t-il, et un par plateforme ?* Pas « le canal
existe-t-il », pas « le web l'honore-t-il ».

### 4. Le piège de méthode — deux formes d'abonnement, un seul grep

Le premier passage de ce cycle a produit un tableau FAUX, et il faut savoir
pourquoi. Les deux clients ne s'abonnent pas de la même façon :

- web : `socket.on(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME, …)` — par la CONSTANTE.
- iOS : `socket.on("message:hidden-for-me") { … }` — par le LITTÉRAL.

Chercher le littéral rend « web = 0 » (faux) et « iOS = 0 » (juste). Chercher la
constante rend l'inverse. **Un diff de couverture d'événements qui ne cherche
qu'une forme conclura toujours à une lacune du mauvais côté** — et c'est ce qui a
failli faire abandonner la piste. Les deux formes se cherchent séparément, et le
tableau ne vaut qu'une fois les deux croisées.

### 5. Le corollaire — porter un canal ne veut pas dire porter le GESTE

`hidden-for-me` route naturellement vers le chemin de suppression existant, et
le web le fait explicitement pour ne pas écrire deux retraits qui dériveraient.
La transposition à iOS est fausse, et pour une raison qui ne se voit pas dans
l'événement : les deux clients n'écrivent pas la même chose sur une suppression.
Le web FILTRE la ligne hors du cache ; iOS pose une PIERRE TOMBALE. Le même
routage produit donc un vide d'un côté et un « ce message a été supprimé » de
l'autre — durable, puisque le serveur ne renverra plus jamais ce message à ce
lecteur.

**Avant de router un événement neuf vers un chemin existant, lire ce que ce
chemin ÉCRIT, pas ce qu'il s'appelle.** Le nom du handler décrit l'événement
qu'il consommait ; l'écriture décrit ce que l'utilisateur verra.

## Leçon 257 — un champ à la PREMIÈRE PERSONNE n'a aucune valeur juste sur une diffusion

**Cycle 115.** `ReactionUpdateEventData.aggregation.hasCurrentUser` répond à
« est-ce que MOI j'ai réagi ? ». Une diffusion de room n'a pas de « moi » : le
même objet part vers tous les participants. Le gateway le calculait quand même,
avec l'id de l'**ACTEUR** :

```ts
// createUpdateEvent — l'objet rendu part vers TOUTE la room
const aggregation = await this.getEmojiAggregation(messageId, emoji, participantId);
//                                                                   ^^^^^^^^^^^^^ l'acteur
```

Et comme l'agrégat est relu APRÈS la mutation, le champ ne portait **aucune
information** : `true` sur tout `add`, `false` sur tout `remove` — soit `action`
réécrit une couche plus bas, qui est le nom de l'événement réécrit une couche
plus bas. Sa seule valeur observable était fausse pour tout destinataire autre
que l'acteur.

> La question à poser à chaque champ d'une charge DIFFUSÉE n'est pas « est-il
> correct ? » mais **« sa valeur dépend-elle du destinataire ? »**. Si oui, il
> n'y a pas de bonne valeur à y mettre : il y a un champ à RETIRER, et une
> dérivation à rendre au client — qui, lui, sait qui il est.

Le signal se lit sans ouvrir le code : **un nom à la première personne dans une
charge multi-destinataires** — `hasCurrentUser`, `isMine`, `myVote`,
`unreadForMe`. Les deux familles de réaction écrites en DERNIER (post, pièce
jointe) l'avaient déjà tranché, chacune avec sa décision en commentaire (« NO
userIds, NO hasCurrentUser », « l'état *ma réaction* reste maintenu côté
client ») ; les deux plus anciennes (message, commentaire) portaient le défaut.

**Le correctif est deux TYPES, pas un champ optionnel** : un optionnel laisse
chaque site décider seul s'il a le droit de le remplir.
`ReactionBroadcastAggregation` (ce qu'une diffusion peut porter) et
`ReactionAggregation extends` (résolu POUR un lecteur, chemin REST). Une seule
requête, deux formes qui en dérivent.

**Et le client doit IGNORER le champ, pas seulement cesser de le recevoir.** La
file hors-ligne rejoue la charge ENFILÉE jusqu'à 48 h : retirer le champ à
l'émission laisse la panne vivre deux jours de plus, sur la population exacte —
reconnexion après absence — que la file existe pour servir. D'où le `...spread`
puis surcharge côté lecteur, et le témoin qui gèle la tolérance à l'ancienne
forme.

### Corollaire — un contournement client bien commenté est un diagnostic qui n'a pas remonté

C'est la moitié chère de ce cycle. La jumelle COMMENTAIRE portait le MÊME défaut
et avait déjà produit une panne en production ; iOS l'a contournée dans deux
ViewModels, en nommant la cause exactement :

```swift
// … PAS `hasCurrentUser`, qui est calculé côté gateway relativement à l'ACTEUR
// de l'événement, donc il vaut true pour le like d'un TIERS et allumait le cœur
// de tous les destinataires du broadcast.
```

Le diagnostic était juste, complet, écrit — et il s'est arrêté à l'endroit du
SYMPTÔME. Il a protégé son écran, laissé la cause en place pour tous les autres
clients, et n'a jamais atteint la famille jumelle, qui la portait au même
endroit. Variante la plus coûteuse de « Cette entité a-t-elle une JUMELLE ? »
(85) : ici la connaissance existait dans le dépôt et n'a pas franchi la
frontière client→serveur.

> Devant tout commentaire client qui explique pourquoi il n'utilise PAS un champ
> du serveur, la question suivante est : **pourquoi le serveur l'envoie-t-il
> encore, et à qui d'autre ?**

- Même famille que 94 (« un commentaire qui ÉNONCE une contrainte est une
  AFFIRMATION ») et 85 (la jumelle), avec ceci de particulier que le commentaire
  disait VRAI et que c'est son exactitude même qui a refermé le sujet.

---

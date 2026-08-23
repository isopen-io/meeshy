# Cycle 115 — `hasCurrentUser` est une réponse PAR LECTEUR, diffusée une fois pour l'ACTEUR

> Suivi hérité du cycle 114 §7 (« `ReactionUpdateEvent` / `ReactionUpdateEventData`,
> deux exemplaires de la même déclaration ») — instruit, et il cachait plus qu'une
> duplication.

---

## 1. Le défaut, en une phrase

`ReactionUpdateEventData.aggregation.hasCurrentUser` répond à la question
**« est-ce que MOI j'ai réagi ? »**. Une diffusion de room n'a pas de « moi » :
le même objet part vers tous les participants. Le gateway le calculait quand
même — avec l'id de l'**ACTEUR** — et chaque client qui recopiait l'agrégat dans
son cache s'attribuait la réaction de quelqu'un d'autre.

```ts
// ReactionService.createUpdateEvent, avant
const aggregation = await this.getEmojiAggregation(messageId, emoji, participantId);
//                                                                  ^^^^^^^^^^^^^
//                                       l'ACTEUR — et cet objet part vers TOUTE la room
```

---

## 2. Ce que le champ valait sur le fil : rien

L'agrégat est relu **APRÈS** la mutation, avec l'id de l'acteur. Donc :

| diffusion | ligne `Reaction` de l'acteur | `hasCurrentUser` émis |
|---|---|---|
| `reaction:added` | vient d'être écrite | **toujours `true`** |
| `reaction:removed` | vient d'être supprimée | **toujours `false`** |

`hasCurrentUser === (action === 'add')` — c'était `action` réécrit une couche
plus bas, qui est lui-même le nom de l'événement réécrit une couche plus bas.
Le champ ne portait **aucune** information, et sa seule valeur observable était
fausse pour tout destinataire autre que l'acteur.

C'est le suivi « Neuf » du cycle 114 (`action` redondant), retrouvé un étage plus
profond et cette fois avec des conséquences.

---

## 3. La mesure : ce n'est pas un piège armé sur les quatre familles

Le dépôt porte **quatre** familles de réaction. Deux sont saines, et elles le
disent explicitement — ce sont les deux écrites en DERNIER :

| famille | agrégat diffusé | verdict |
|---|---|---|
| post (`PostReactionAggregation`) | `{emoji, count}` — commentaire : « NO userIds, NO hasCurrentUser » | **sain par décision écrite** |
| pièce jointe (`reactionSummary`) | carte `emoji→count`, « l'état *ma réaction* reste maintenu côté client » | **sain par décision écrite** |
| **commentaire** (`CommentReactionAggregation`) | porte `hasCurrentUser` | **panne MESURÉE** |
| **message** (`ReactionUpdateEventData`) | porte `hasCurrentUser` | **piège armé** |

### 3.1 La jumelle COMMENTAIRE a déjà coûté, et c'est écrit dans le dépôt

iOS a contourné le défaut **côté client**, dans deux ViewModels, en nommant la
cause mot pour mot :

```swift
// StoryViewerView+Content.swift
// « mon cœur » dérive de `userIds` …, PAS de `hasCurrentUser` : ce flag est
// calculé côté gateway relativement à l'ACTEUR de l'événement, donc il vaut
// true pour le like d'un TIERS et allumait le cœur de tous les destinataires
// du broadcast.
```

```swift
// PostDetailViewModel.swift
// … PAS `hasCurrentUser`, qui est calculé côté gateway relativement à l'ACTEUR
// de l'événement, donc faux pour les destinataires d'un broadcast
```

> **Le diagnostic était juste, complet, et posé à l'endroit du SYMPTÔME.** Il a
> produit deux contournements clients et n'a jamais remonté à l'émetteur — ni sur
> la famille où il a été fait, ni sur sa jumelle MESSAGE, qui porte le même
> défaut au même endroit. C'est la règle du cycle 85 (« Cette entité a-t-elle une
> JUMELLE ? ») dans sa variante la plus coûteuse : ici la connaissance existait,
> écrite, et n'a pas franchi la frontière client→serveur.

### 3.2 Côté MESSAGE, le web l'écrivait dans son cache

`use-reactions-query.ts` recopiait `event.aggregation` **verbatim** :

```ts
newReactions = [...old.reactions, event.aggregation];   // ← le drapeau de l'ACTEUR
```

Mesuré, avec le gestionnaire livré et la charge livrée (§6) : un lecteur qui
reçoit l'ajout d'un TIERS se retrouve avec `hasCurrentUser: true` en cache.

Aucun composant ne lit ce champ **aujourd'hui** — la surbrillance passe par
`userReactions`, correctement dérivé de `event.userId`. Donc **piège armé, pas
panne** (règle du cycle 84 : on ne le laisse pas au motif que personne n'a encore
marché dessus, d'autant que la jumelle prouve que quelqu'un finit par marcher
dessus).

Deux états incohérents cohabitaient d'ailleurs dans le MÊME objet de cache :
`reactions[i].hasCurrentUser === true` et `userReactions === []`.

---

## 4. Le correctif : à la SOURCE, en séparant deux types

Un champ optionnel aurait laissé chaque site décider seul s'il a le droit de le
remplir. Deux types le décident une fois :

```ts
// packages/shared/types/reaction.ts
export interface ReactionBroadcastAggregation {   // ce qu'une DIFFUSION peut porter
  readonly emoji: string;
  readonly count: number;
  readonly participantIds: readonly string[];
}

export interface ReactionAggregation extends ReactionBroadcastAggregation {
  readonly hasCurrentUser: boolean;               // résolu POUR UN LECTEUR
}
```

- `ReactionUpdateEvent.aggregation` prend la forme **diffusion**.
- Le chemin REST par-lecteur (`getMessageReactions`, `getEmojiAggregation` avec
  son `currentParticipantId`) garde la forme **résolue**, où le champ a un sens :
  la requête sait à qui elle répond. Ses quatre témoins sont inchangés et verts.

Côté gateway, la requête est écrite **une fois** et les deux formes en dérivent :

```ts
getBroadcastAggregation(messageId, emoji)                  // absolu
getEmojiAggregation(messageId, emoji, currentParticipantId) // = absolu + le drapeau du lecteur
```

`createUpdateEvent` appelle la première. Il n'y a plus d'id d'acteur à passer,
donc plus de moyen de se tromper de « moi ».

Côté web, le drapeau se DÉRIVE de la seule vérité du lecteur — et l'ORDRE de
calcul devient porteur de sens : `userReactions` d'abord, l'agrégat ensuite.

```ts
function resolveAggregationForReader(aggregation, userReactions) {
  return { ...aggregation, hasCurrentUser: userReactions.includes(aggregation.emoji) };
}
```

Le `...spread` puis surcharge n'est pas un détail de style : il rend le
gestionnaire **immunisé à un agrégat de l'ancienne forme**, ce dont il a
strictement besoin (§5).

### 4.1 Et la jumelle du cycle 114 est close en même temps

`ReactionUpdateEventData` était une seconde déclaration structurellement
identique, dans un fichier qui ne cite pas l'autre. Elle devient un **alias** :

```ts
export type ReactionUpdateEventData = ReactionUpdateEvent;
```

Ce n'était pas de la cosmétique : `ReactionService.createUpdateEvent` rend l'une
et le contrat de diffusion déclarait l'autre. Rien n'obligeait les deux à rester
d'accord — et c'est exactement ce type d'écart que ce cycle vient de payer sur la
famille commentaire.

---

## 5. La fenêtre de déploiement, qui n'est pas une abstraction

La file hors-ligne **conserve la charge ENFILÉE jusqu'à 48 h et la rejoue telle
quelle**. Pendant toute la fenêtre de déploiement, un lecteur qui se reconnecte
reçoit donc des agrégats de l'ANCIENNE forme, portant encore le drapeau de
l'acteur. Un correctif qui se serait contenté de retirer le champ à l'émission
aurait laissé la panne vivre 48 h de plus, sur la population exacte —
reconnexion après absence — que la file existe pour servir.

Le lecteur doit donc **ignorer** le champ, pas seulement cesser de le recevoir.
Un témoin le gèle (`ignore un hasCurrentUser HÉRITÉ que la file rejoue`).

Compat descendante des trois clients, vérifiée avant de toucher au contrat :

| client | déclaration | retrait du champ |
|---|---|---|
| iOS `ReactionAggregationEvent` | `hasCurrentUser: Bool?` | **toléré** (optionnel) |
| Android `ReactionUpdateEvent` | ne lit pas d'agrégat du tout (§8) | **toléré** |
| web | dérive désormais le sien | **toléré** |

---

## 6. Preuves de ROUGE

Les deux mesurées contre le code livré, pas contre une esquisse.

**Gateway** — `ReactionService.test.ts` :

```
● createUpdateEvent › n'emporte aucune réponse par-lecteur dans l'agrégat DIFFUSÉ
  expect(result.aggregation).not.toHaveProperty('hasCurrentUser');

● createUpdateEvent › ne perd rien : les DEUX diffusions portent le même agrégat absolu
  - Expected  - 0
  + Received  + 1
    Object {
      "count": 1,
      "emoji": "👍",
  +   "hasCurrentUser": true,
```

**Web** — le gestionnaire LIVRÉ, restauré par `git checkout`, contre la charge
LIVRÉE (celle qui porte le drapeau de l'acteur) :

```
● n'attribue pas au lecteur la réaction d'un TIERS
  expect(reactions.find(r => r.emoji === '❤️')?.hasCurrentUser).toBe(false)
  Expected: false
  Received: true          ← le lecteur croit avoir réagi
```

C'est la mesure qui distingue ce cycle d'un lot de typage : le contrat était
faux **et** le consommateur le croyait.

---

## 7. Ce que le lot n'a PAS fait, et pourquoi

- **La famille COMMENTAIRE n'est pas corrigée à la source.** Son décodeur iOS
  déclare `SocketCommentReactionAggregation.hasCurrentUser: Bool` — **non
  optionnel** : retirer le champ du fil ferait échouer le décodage de CHAQUE
  `comment:reaction-added` / `comment:reaction-removed` sur iOS. Le correctif
  exige donc un lot Swift (champ en `Bool?`, deux constructions et six
  assertions XCTest à reprendre) qui ne peut pas être **construit ni exercé**
  depuis cet environnement Linux. Livrer une modification Swift non compilée dans
  un lot qui doit atterrir sur `main` échangerait un piège armé contre une panne
  de décodage certaine. Suivi §9, avec sa raison écrite.
- **`getEmojiAggregation` garde sa signature et ses témoins.** Le chemin REST
  est le seul endroit où `hasCurrentUser` est calculable, et il est juste.
- **`action` n'est pas retiré** (suivi du cycle 114). Il reste redondant avec le
  nom de l'événement, mais iOS et Android le DÉCODENT tous les deux ; le retirer
  est un lot de contrat à part, avec la même contrainte de vérification que
  ci-dessus.

---

## 8. Découverte incidente, non traitée

`apps/android/core/model/…/SocketEvents.kt` déclare, pour les réactions de
MESSAGE :

```kotlin
data class ReactionUpdateEvent(
    val messageId: String,
    val conversationId: String,
    val userId: String,
    val emoji: String,
    val count: Int = 0,      // ← le gateway n'a JAMAIS émis de `count` à ce niveau
)
```

La passerelle émet `aggregation: { emoji, count, participantIds }`. Le champ
`count` de premier niveau ne correspond à rien sur le fil : avec
`ignoreUnknownKeys`, il se décode **à `0`, toujours**, sans erreur.

C'est la forme exacte du défaut `participant:role-updated` du cycle 92 bis
(`role` contre `newRole`, `MissingFieldException` avalée) — la variante muette :
ici rien ne lève, la valeur est simplement fausse et plausible.

**Non traité dans ce lot** : Android n'est ni compilable ni exerçable ici, et le
corriger demande de vérifier d'abord ce que ses consommateurs font de `count`.
Suivi §9.

---

## 9. Suivis

- [ ] **Neuf** — la famille COMMENTAIRE, à la source (§7), avec son lot Swift :
      `SocketCommentReactionAggregation.hasCurrentUser` en `Bool?`, les deux
      contournements iOS conservés (ils dérivent de `userIds`, qui reste), puis
      le champ retiré de `CommentReactionUpdateEventData`. **Le contournement
      client ne se retire pas** : il est correct, et il protège pendant les 48 h
      de file.
- [ ] **Neuf** — `ReactionUpdateEvent.count` (Android, §8) : mesurer les
      consommateurs, puis aligner sur `aggregation`.
- [ ] Hérité (113 §5) — `messageId` / `dedupKey`, avec leur rayon mesuré.
- [ ] Hérité (107 bis) — la bivariance `strictFunctionTypes: false`.
- [ ] Hérité — `LinkMessagePayload` porte encore `readonly [key: string]: unknown`
      (et cf. cycle 106 : l'exécuter D'ABORD pour mesurer, le lot vert sans effet
      est le résultat par défaut).
- [ ] Hérité (108 ter) — l'en-tête du cliquet de dette, fausse de trois points.
- [ ] Hérité (113 §6) — rien n'EMPÊCHE un futur double Prisma du harnais du
      manager d'accepter un argument que la colonne ne peut pas porter.
- [x] Hérité (114 §7) — `ReactionUpdateEvent` / `ReactionUpdateEventData`, deux
      exemplaires de la même déclaration. **Clos** (§4.1).

---

## 10. Leçon de méthode

**Un champ dont la valeur dépend de « qui regarde » n'a aucune valeur juste sur
un canal qui ne sait pas qui regarde.**

La question à poser à chaque champ d'une charge DIFFUSÉE n'est pas « est-il
correct ? » mais **« sa valeur dépend-elle du destinataire ? »**. Si oui, il n'y
a pas de bonne valeur à y mettre : il y a un champ à retirer, et une dérivation
à rendre au client — qui, lui, sait qui il est. Un nom à la première personne
(`hasCurrentUser`, `isMine`, `myVote`, `unreadForMe`) dans une charge qui part
vers plusieurs destinataires est le signal, et il se lit sans ouvrir le code.

Et le corollaire, qui est ce qui a coûté deux familles ici :

> **Un contournement client bien commenté est un diagnostic qui n'a pas remonté.**
> Les deux notes iOS nommaient la cause exactement — « calculé côté gateway
> relativement à l'ACTEUR » — et refermaient le sujet à l'endroit du symptôme.
> Elles ont protégé leur écran, laissé la cause en place pour tous les autres
> clients, et n'ont jamais atteint la famille jumelle. Devant tout commentaire
> client qui explique pourquoi il n'utilise PAS un champ du serveur, la question
> suivante est : **pourquoi le serveur l'envoie-t-il encore, et à qui d'autre ?**

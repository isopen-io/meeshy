# Cycle 109 bis — le rejeu hors ligne relisait ce qu'il n'a jamais vérifié

> Écrit en PARALLÈLE du cycle 109 (`…-cycle109.md`, l'accusé de réception des
> réactions), par une seconde session, sur le même `main`. Les deux lots ne se
> touchent pas : celui-ci prend le REJEU hors ligne (`_drainPendingMessages`,
> `queuedEventContract`), l'autre la porte d'ACQUITTEMENT des réactions. Seul
> `packages/shared/types/socketio-events.ts` est commun, sur deux déclarations
> distinctes — la fusion est manuelle et sans conflit de règle (§8).

Suite directe du cycle 108 ter, sur `main` vert (run `32644261691`) et une
branche à parité 0/0. Le lot instruit le suivi que le cycle 106 avait laissé
ouvert et que les trois cycles suivants ont recopié sans le mesurer :

> - [ ] Hérité (106) — la LECTURE depuis Redis reste non validée à l'exécution.

Il est réel, il est ÉCRIT DANS LE CODE, et ce qu'il coûte est plus cher que sa
formulation ne le laisse entendre.

## 1. Le point de départ : une affirmation que la production contredit

`MeeshySocketIOManager._drainedEmissions` portait ceci, en toutes lettres :

```
Ce qui reste une AFFIRMATION, et le restera sans validation à l'exécution :
que l'octet relu de Redis soit bien ce qu'on y a écrit. Le typage borne ce
qu'on ÉCRIT, pas ce qu'on RELIT.
```

Le constat est juste. Ce qu'il ne dit pas, c'est ce qui arrive quand
l'affirmation est fausse — et la réponse n'est pas « une erreur », c'est
**« rien »**.

## 2. Trois mesures, aucune supposition

### Mesure 1 — la table rend `undefined`, et le type le cachait

`drainedEventName` était déclarée `=> ServerEventName`. Exécutée sur une clé que
la table ne connaît pas :

```
drainedEventName("reaction-add") = undefined
typeof = undefined                 ← 12 clés connues
```

C'est la famille « une déclaration présente, bien formée, et fausse contre son
PRODUCTEUR » (cycle 94) — sauf qu'ici le producteur n'est pas un émetteur du
dépôt, **c'est Redis**. L'argument est typé `QueuedEventType`, mais il ne l'est
qu'à l'ÉCRITURE : à la lecture il sort d'un `JSON.parse(...) as
QueuedMessagePayload`.

### Mesure 2 — `emit(undefined, payload)` ne lève PAS

Mesuré contre le vrai socket.io 4.8.3 du dépôt :

| émission | verdict |
|---|---|
| `emit(undefined, payload)` | **NO THROW** — l'événement part anonyme |
| `emit("message:new", circulaire)` | THROWS `RangeError` |
| `emit("message:new", BigInt)` | THROWS `TypeError` |

La première ligne est le défaut. Un événement sans nom ne fait pas de bruit : il
part, nul ne l'écoute, et **le drain étant DESTRUCTIF, le message est perdu sans
recours et sans trace.** C'est la forme exacte du défaut du cycle 104, où
`broadcastCommentUnliked` émettait sous le nom `undefined` avec un témoin vert.

### Mesure 3 — et l'expéditeur était quand même averti que c'était arrivé

Le RED du témoin, avant correction, le montre au caractère près :

```
1: "message:new", {"id": "msg-ok"}
2: undefined,     {"id": "msg-lost"}          ← émis à personne
3: "message:pending-delivered", {"count": 2}  ← et compté comme livré
```

`_emitDeliveryForDrainedMessages` recevait `pending` ENTIER. La coche de
l'expéditeur passait donc au double tic pour un message que le destinataire n'a
jamais reçu.

> **La règle qui l'interdit était déjà écrite, vingt lignes plus haut**, pour la
> garde d'appartenance : « Un accusé affirme *ce message est arrivé chez son
> destinataire* — l'affirmer d'un message qu'on vient de refuser de livrer
> mentirait à son auteur. » Elle couvrait le REFUS. Elle ne couvrait pas
> l'ÉCHEC — et c'est le même mensonge.

## 3. Le second défaut, dans les mêmes six lignes

```ts
for (const entry of pending) {
  for (const emission of _drainedEmissions(entry)) {
    emitServerEvent(userRoom, emission);   // ← rien n'isole
  }
}
```

Le tout dans UN `try/catch` qui enveloppe la fonction entière. Une seule
émission qui lève emportait :

- toutes les entrées **SUIVANTES** du lot — déjà retirées de Redis et de la file
  mémoire par `drain()`, donc perdues sans seconde lecture ;
- le signal `pending-messages:delivered` ;
- **tous** les accusés de réception.

Mesuré : sur trois entrées dont la deuxième lève, `["msg-a", "msg-boom"]` sont
tentées et `msg-c` n'est jamais émis.

> **La couche DU DESSOUS portait déjà la garantie, et l'écrivait.**
> `parseRawEntries` laisse tomber une entrée illisible *« so one corrupt entry
> can never poison a whole drain/peek »*. La couche qui la CONSOMME la reprenait
> d'une main et la rendait de l'autre. C'est la leçon du cycle 98 — « un
> correctif prouvé à une couche peut être défait par la couche qui le
> consomme » — en amont, et sur le chemin le plus destructif du système.

## 4. Pourquoi c'est atteignable, et pas une hypothèse

`DELIVERY_QUEUE_TTL_SECONDS = 172800` — **48 heures**. Une entrée écrite par une
version de la passerelle peut être relue par une autre deux jours plus tard, sur
la même file Redis partagée. Un déploiement progressif qui introduit ou renomme
un `eventType` suffit : l'instance qui ne le connaît pas le relit quand même, ne
sait pas le nommer, et l'émet à personne.

La fenêtre n'a pas besoin d'être exotique. Elle est la normale d'un déploiement.

## 5. Ce que le lot change

**`drainedEventName` dit la vérité** — `=> ServerEventName | undefined`. La
valeur `undefined` était déjà là ; seul le type la cachait. La rendre visible
FORCE chaque appelant à décider quoi faire d'une entrée qu'il ne sait pas nommer.

**`_drainedEmissions` rend une liste VIDE** pour une entrée innommable. C'est la
seule réponse honnête à la frontière de désérialisation : « je ne sais pas
diffuser ceci ». Ce qu'on en fait appartient à l'appelant.

**Le rejeu est isolé PAR ENTRÉE**, et chaque entrée tombée est journalisée avec
son `messageId`, sa conversation, son `eventType` et sa RAISON
(`unresolvable-event-type` / `emit-failed`). Un résumé chiffré ne suffisait pas :
ce qu'il faut pour rattraper la perte est l'IDENTITÉ de ce qui est tombé, pas son
nombre.

**Les trois signaux de livraison descendent de ce qui est RÉELLEMENT parti** —
`count`, les accusés, et rien d'autre.

**Sauf `conversationIds`, qui ne se resserre PAS**, et c'est délibéré :

| champ | population | pourquoi |
|---|---|---|
| `count` | livrées seulement | c'est une affirmation de livraison, elle doit rester vraie |
| `conversationIds` | livrées **∪** perdues | le message perdu est TOUJOURS EN BASE — nommer sa conversation envoie le client le relire |

L'écart entre les deux est ce qui rend une perte de rejeu **RÉCUPÉRABLE** au lieu
de définitive : le seul consommateur de l'événement invalide les messages des
conversations nommées (`use-socket-cache-sync`). Un `count: 0` accompagné d'une
conversation nommée est une forme VALIDE, et se lit exactement comme ce qui s'est
passé — « rien n'a pu être rejoué, va relire celle-ci ».

> **Le geste « symétrique » était le piège.** Resserrer les deux champs sur les
> entrées livrées est ce qu'une relecture pressée appelle, et cela aurait
> transformé un incident de transport en trou PERMANENT dans le fil. Un témoin
> garde maintenant l'asymétrie, parce que sans lui elle se lit comme un oubli.

**Le signal `pending-messages:delivered` est isolé lui aussi** — nu, il faisait
porter aux accusés de réception le sort d'un signal qui ne déclenche qu'une
relecture, alors que la panne qui fait lever un `emit` les fait lever tous les
deux. Même raison que `emitBestEffort` dans `NotificationService`.

## 6. Les témoins

Quatre, tous dans le harnais du manager (là où le CLAUDE.md du gateway exige que
vivent les gardes de comportement du manager), et **les trois premiers prouvés
ROUGES avant correction** :

| témoin | ce qu'il garde |
|---|---|
| `ne diffuse RIEN sous un nom d'événement que la table ne résout pas` | aucune émission ne porte un nom absent |
| `n'accuse pas la remise d'une entrée qu'il n'a pas su diffuser` | `count` et accusés ne comptent que le livré |
| `une émission qui lève n'emporte pas le reste du lot déjà drainé` | isolation par entrée |
| `nomme la conversation d'une entrée PERDUE` | l'asymétrie `count` / `conversationIds` |

## 7. Suivis

- [ ] **Neuf — le reste de la charge n'est toujours pas vérifié.** Ce lot ferme
      le NOM de l'événement, parce que c'est ce dont dépend l'adressage et parce
      que son échec est SILENCIEUX. La FORME de `entry.payload` reste une
      affirmation : une charge relue de Redis peut être dépareillée de son
      événement sans que rien ne le voie. La différence de gravité est réelle —
      une charge fausse est rejetée bruyamment par les décodeurs clients, un nom
      absent n'est rejeté par personne — mais le trou existe.
- [ ] Hérité (107 bis) — la bivariance `strictFunctionTypes: false`. Décision à
      instruire, elle dépasse Socket.IO.
- [ ] Hérité — `ReactionUpdateEvent` (`reaction.ts`) et `ReactionUpdateEventData`
      (`socketio-events.ts`), deux exemplaires de la MÊME déclaration. Mesuré ce
      cycle : ils sont aujourd'hui d'accord, champ pour champ. C'est une dette de
      dérive, pas un défaut — mais rien ne les tient ensemble.
- [ ] Hérité — `LinkMessagePayload` porte encore
      `readonly [key: string]: unknown`. Mesuré ce cycle : c'est la DERNIÈRE
      signature d'index de `socketio-events.ts`, celle de
      `ConversationUpdatedEventData` ayant été retirée au cycle 106 avec la
      démonstration que le geste est cosmétique (un spread la supprimait déjà).
      Même conclusion ici : le levier est de DÉCLARER les champs, pas de fermer
      la carte.
- [ ] Hérité (108 ter) — l'en-tête du cliquet de dette, fausse de trois points.

## 8. Intégration avec le cycle 109 parallèle

Les deux sessions ont travaillé le même `main` en même temps, sur deux moitiés
disjointes de la couche Socket.IO :

| lot | ce qu'il ferme |
|---|---|
| cycle 109 (PR #3397) | la porte d'ACQUITTEMENT des réactions — ce que l'ack DIT |
| cycle 109 bis (celui-ci) | le REJEU hors ligne — ce que le drain ÉMET, et ce qu'il PERD |

**Un seul fichier commun** : `packages/shared/types/socketio-events.ts`. Les deux
lots y touchent des déclarations DISTINCTES — l'autre les charges d'ack des
quatre familles de réaction, celui-ci la documentation de
`PENDING_MESSAGES_DELIVERED`. Fusion manuelle (`git merge origin/main`), **zéro
conflit**, et surtout aucune règle contradictoire : les deux vont dans le même
sens, celui de rendre EXPLICITE ce qu'un canal transporte réellement.

Les gates ont été rejoués ENTIÈREMENT sur l'arbre FUSIONNÉ, pas seulement sur la
branche : un merge propre au texte ne prouve rien du comportement, et l'autre lot
introduit un cliquet neuf (`ack-door-sweep`) que ma branche n'avait jamais vu.

> **Deux sessions sur le même `main` ne se dupliquent pas nécessairement** —
> constat déjà posé au cycle 108 ter, et vérifié une seconde fois. Ce qui les
> sépare proprement ici, c'est que chacune est partie d'un SUIVI différent plutôt
> que du même.

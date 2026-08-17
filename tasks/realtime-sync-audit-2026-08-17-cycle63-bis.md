# Audit sync temps réel — cycle 63 bis (2026-08-17)

Branche : `claude/keen-hamilton-qchw0m` — repartie de `origin/main` (485d9a38,
cycle 62 bis intégralement mergé).

> **Note d'intégration.** Une AUTRE exécution de la routine a livré un cycle 63
> pendant celui-ci (`claude/keen-hamilton-ndx3vw`, PR #3191 — « le pont ✦
> survit à une lecture PARTIELLE »). Ce journal est donc renuméroté *bis*,
> suivant la convention des cycles 54/56/57/60/61/62.
>
> **Les deux ont pris la MÊME piste — la n°1 du cycle 62 — et l'ont lue
> différemment. C'est le fait le plus instructif du cycle, et les deux réponses
> sont justes.** Cette piste posait la question du PRIX (« la passe peut-elle
> coûter moins qu'une passe complète ? ») et notait, en post-scriptum, que le
> manque était peut-être ailleurs : « se demander si le manque n'est pas
> d'abord un manque de vocabulaire dans le contrat gelé ».
>
> - Le cycle 63 a répondu au PRIX, et a eu raison de le faire : il a démontré
>   que l'arbitrage de coût était **surcompté** — le gate à zéro range le cas
>   dominant du côté gratuit, et la lecture partielle paie QUATRE requêtes, pas
>   cinq, parce que le curseur que la passe irait relire vient d'être lu.
>   `broadcastReadStatus` CALCULE donc son pont, et la question du sur-comptage
>   d'un pont périmé ne se pose plus sur ce chemin.
> - Ce cycle-ci a répondu au VOCABULAIRE, et il reste nécessaire : trois
>   situations où personne ne calcule survivent au correctif d'à côté — la
>   borne de l'instantané de reconnexion (30 lignes), la passe qui TOMBE, et le
>   `conversation:join`. Aucune ne peut être fermée par un calcul ; toutes le
>   sont par le troisième état.
>
> **Fusionnées à la main** (§8). Le correctif du cycle 63 est conservé
> intégralement — c'est lui qui calcule — et le troisième état s'applique à ses
> deux replis (pas de constructeur, passe tombée), qui ordonnaient encore
> l'effacement. Ce que ce journal disait en §2.1 bis d'un pont conservé
> susceptible de sur-compter **ne vaut plus** : sur ce chemin, il est calculé.

## 1. Le défaut

**`conversation:unread-updated` porte DEUX formes pour dire TROIS choses. Les
trois émetteurs qui ne calculent pas le pont ✦ ordonnaient donc son
effacement.**

Le champ `bridge` (G-123) était optionnel sur le contrat wire. Les deux clients
ne le lisent pas comme optionnel : ils le recopient INCONDITIONNELLEMENT dans
leur cache de liste, `undefined`/`nil` compris —
`ConversationSyncEngine.handleUnreadUpdated` côté iOS,
`setConversationUnreadInCache(…, { bridge: data.bridge })` côté web. Ce qui
arrive ÉCRIT, y compris quand rien n'arrive.

Or un émetteur a trois choses à dire, et n'en avait que deux pour les dire :

| ce que l'émetteur sait | forme sur le fil (avant) | ce que le client comprenait |
|---|---|---|
| voici le pont de ce lecteur | `bridge: {…}` | ✅ écrit |
| j'ai calculé, il n'y en a pas | clé absente | ✅ efface |
| **je n'ai pas calculé** | **clé absente** | ❌ **efface** |

Le cycle 62 a fermé le cas dominant en faisant CALCULER l'instantané de
reconnexion. Il restait, sous la même forme, tous les cas où calculer n'est pas
possible — ou pas souhaitable :

| Émetteur | Quand il ne calcule pas | Effet avant ce cycle |
|---|---|---|
| `broadcastReadStatus` (resynchro du lecteur) | **plus jamais** depuis le cycle 63 d'à côté (il calcule) — restent ses deux replis : appelant sans constructeur, passe tombée | après une lecture PARTIELLE, les autres appareils gardaient un compteur > 0 et **perdaient le pont** qui leur disait où reprendre |
| `_emitUnreadCountsSnapshot` (reconnexion) | au-delà de `BRIDGE_SNAPSHOT_LIMIT` (30 lignes) | la borne, posée pour épargner la base, **effaçait l'affichage** qu'elle refusait de calculer — sur toutes les conversations sauf les 30 plus récentes, à chaque reconnexion |
| `_emitUnreadCountsSnapshot` | quand `buildBridgeData` échoue | le repli best-effort **reconstituait le sinistre de masse** que le cycle 62 venait de corriger, sur la foi d'une panne |
| `ConversationHandler` (`conversation:join`) | toujours | inoffensif (le rang ne rend jamais de pont sans non-lu, et le client clampe la conversation active) — mais dit faux |

Rien ne remettait le pont ensuite : la liste web tourne en
`staleTime: Infinity`, et le seul émetteur qui l'attache est le fan-out
d'ENVOI — il faut qu'un nouveau message arrive dans cette conversation précise.

## 2. Le correctif : du vocabulaire, pas des requêtes

`bridge?: ConversationBridge | null`, et trois phrases distinctes :

```
bridge: {…}   → voici le pont de CE lecteur       ⇒ le client écrit
bridge: null  → j'ai calculé, il n'y en a pas     ⇒ le client EFFACE
clé ABSENTE   → je n'ai pas calculé               ⇒ le client GARDE le sien
```

**Ce lot n'ajoute aucune requête, sur aucun chemin** : là où personne ne
calcule, se taire est gratuit. C'est la moitié du problème que le calcul ne
peut pas atteindre — la borne d'un instantané, une passe tombée, un chemin qui
n'a pas de raison de calculer. Le cycle 63 d'à côté a traité l'autre moitié en
montrant que, sur `broadcastReadStatus`, calculer coûtait moins cher que le
carnet ne l'avait écrit. Les deux réponses sont vraies et ne se remplacent pas.

### 2.1 La seule connaissance gratuite, isolée

Un compteur suffit à trancher UN cas sans ouvrir de requête : le contrat gelé
(§3.2) interdit un pont sans non-lu, donc `unreadCount === 0` PROUVE l'absence.
C'est précisément le cas qui doit nettoyer les autres appareils quand on finit
de lire sur celui-ci.

`bridgeKnowledgeFromCount()` (`socketio/unreadBridgeAnnouncement.ts`) porte
cette règle une fois, pour les quatre émetteurs : les deux qui ne calculent
jamais l'utilisent seule, les deux qui calculent l'utilisent en REPLI quand
leur passe n'a pas d'avis sur cette conversation-là (hors borne, ou tombée).

Ce que `broadcastReadStatus` gagne concrètement, à coût nul : lire entièrement
une conversation sur un appareil retire désormais le pont de la ligne sur les
autres appareils — ce que ni l'ancien silence (qui effaçait tout, y compris à
tort) ni un mutisme complet n'auraient donné juste.

### 2.1 bis L'arbitrage qui restait — et que le cycle voisin a supprimé

Ce journal portait ici une réserve : conserver un pont non recalculé peut
SUR-COMPTER après une lecture **partielle** (« Alice et Bob, 5 messages » sous
une pastille tombée à 2), et le choix était donc *stale* plutôt qu'*absent*.

**Cette réserve n'a plus d'objet, et c'est le cycle voisin qui l'a levée** : sur
ce chemin, le pont est désormais CALCULÉ, pour quatre requêtes payées seulement
quand la lecture est partielle. La réserve est conservée ici parce qu'elle
nomme la propriété générale du troisième état — un pont conservé est exact
partout où RIEN n'a été lu (borne de l'instantané, passe tombée,
`conversation:join`), et n'était approximatif que là où le lecteur venait
justement de consommer une partie de son arriéré. C'est-à-dire au seul endroit
où quelqu'un avait une raison de calculer.

### 2.2 Le discriminant côté web

`data.bridge === undefined`, **jamais** `'bridge' in data`. Socket.IO sérialise
en JSON, où `undefined` ne voyage pas : une clé absente et une clé présente
valant `undefined` sont la même phrase une fois le payload parsé, et le
discriminant doit être celui que le transport peut porter. Un témoin fige
l'équivalence.

### 2.3 Le discriminant côté iOS

`decodeIfPresent` seul rend `nil` aussi bien pour une clé absente que pour un
`null` explicite : il confond exactement les deux phrases que ce lot sépare.
D'où `container.contains(.bridge)`, et un type qui NOMME la distinction plutôt
qu'un booléen à côté d'un optionnel :

```swift
public enum BridgeAnnouncement: Sendable, Equatable {
    case notComputed              // clé absente ⇒ le lecteur garde le sien
    case announced(ConversationBridge?)  // {…} ou null ⇒ le lecteur écrit
}
```

`UnreadUpdateEvent.bridge` survit en propriété CALCULÉE (les appelants qui ne
veulent que la valeur compilent inchangés), documentée comme ne portant pas la
distinction — pour écrire dans un cache, on lit `bridgeAnnouncement`.

## 3. Les témoins

RED prouvé sur les deux moitiés du contrat, mutation par mutation :

| mutation | témoins tombés |
|---|---|
| web : `bridgeUpdate = { bridge: data.bridge ?? undefined }` (l'ancien inconditionnel) | 2 — « GARDE le pont en cache » et « clé `undefined` = clé absente » |
| gateway : forme courte inconditionnelle sur le fan-out | 3 — les trois phrases du nouveau bloc |

Ajoutés :

- **gateway / fan-out** — `bridge: null` quand la passe a tourné sans rien
  rendre ; clé absente quand elle a ÉCHOUÉ ; clé absente sans constructeur de
  pont ; `bridge: null` pour un destinataire à zéro non-lu.
- **gateway / reconnexion** — `says NOTHING about the bridges it deliberately
  did not compute` : sur 42 conversations, `conv-0` (hors borne) n'a pas de clé
  `bridge`, `conv-40` (soumise, sans réponse) porte `bridge: null`, `conv-41`
  porte son pont. Plus l'absence de clé quand la passe tombe.
- **gateway / `broadcastReadStatus`** — fichier neuf
  (`broadcastReadStatus.bridge.test.ts`, 4 témoins), retargeté à la fusion sur
  les deux REPLIS que le correctif du cycle 63 laisse ouverts : sans
  constructeur de pont, lecture partielle ⇒ pas de clé ; compteur à zéro ⇒
  `bridge: null` ; même règle sur la branche « accusés masqués » ; aucun
  compteur — donc aucune phrase — sur un `received`. Trois témoins du cycle 63
  ont été portés au troisième état (§8).
- **web** — `bridge: null` efface, clé absente garde, `undefined` ≡ absente.
- **iOS/SDK** — `notComputed` garde le pont en cache (et applique quand même le
  compteur) ; décodage : clé absente ⇒ `.notComputed`, `null` explicite ⇒
  `.announced(nil)`, objet ⇒ `.announced(pont)`.

### 3.1 Trois témoins existants sont passés en `objectContaining`

Les trois témoins d'IDENTITÉ de `_emitUnreadCountsSnapshot` figeaient le
payload ENTIER alors qu'ils parlent du lecteur et du compteur. C'est exactement
le mécanisme qui a gelé la forme courte comme un acquis au cycle 62, jusqu'à ce
qu'elle devienne destructrice sans qu'aucun témoin ne change de couleur. La
forme du pont a ses propres témoins ; ceux-là n'ont plus à la connaître.

Même geste sur le témoin de COÛT (`emitUnreadCountsToRecipients.cost.test.ts`),
dont l'assertion de forme devient `bridge === null` — annoncé, mais toujours
pas payé : la ligne qui compte les requêtes est inchangée (5).

## 4. Vérification

| Gate | Résultat |
|------|----------|
| `jest` gateway | **746 suites / 18 057 tests** verts, après fusion |
| `tsc --noEmit` gateway | ✅ 0 erreur |
| `tsc --noEmit` shared | ✅ 0 erreur |
| `jest` web | **691 suites / 13 437 tests** verts |
| `tsc --noEmit` web | 0 erreur sur les fichiers touchés (base pré-existante inchangée) |
| SDK Swift | compilé et exécuté par la CI (`sdk-tests.yml`, Xcode 26.1.1 / simulateur iOS 18.2) — aucun toolchain Swift dans ce conteneur |

## 5. Ce que ce cycle NE fait pas

- **Aucune requête de plus, nulle part.** L'arbitrage de coût du cycle 62 tient
  toujours : `broadcastReadStatus` ne fera pas la passe. Il dit simplement
  qu'il ne l'a pas faite.
- **Android** ne modélise pas `bridge` et l'ignore (`ignoreUnknownKeys = true`,
  `SdkModule.kt`) : un `null` lui est aussi transparent qu'un objet. Vérifié
  avant écriture, aucun changement nécessaire.
- **`GET /conversations`** (l'autre porteur du pont) est hors sujet : une
  réponse REST porte le pont ou ne le porte pas, et n'a pas de cache à écraser.

## 6. La leçon, généralisée

Le cycle 62 a nommé la classe : *un champ optionnel dont le client fait une
lecture autoritative n'est plus optionnel pour l'émetteur*. Ce cycle en tire la
règle de conception qui manquait :

> **Un contrat doit porter autant d'états que l'émetteur a de choses à dire.**
> Deux formes pour trois phrases n'est pas une économie : c'est une confusion
> déléguée au lecteur, qui la tranchera toujours dans le même sens — et donc
> toujours à tort pour un tiers des cas.

Le corollaire opérationnel, et il est peu coûteux : quand un émetteur ne
calcule pas ce qu'un autre calcule, **le contrat doit lui donner les mots pour
le dire**. Le réflexe inverse — faire calculer tout le monde — était ici
disponible, chiffré, et **cinq fois plus cher** que le vocabulaire.

## 7. Pistes pour le cycle 64

1. **Le flake non identifié de `packages/shared`** (cycle 61 bis §7) — intacte.
   Le prochain run de CI rouge doit le NOMMER (`--reporter=json --outputFile`).
2. **`conversations.infinite()` en pagination keyset** (cycles 59/60) — intacte.
3. **La file hors-ligne par APPAREIL** (cycle 58 §7) — intacte.
4. **`attachment:reaction-*` et `message:consumed` sans lecteur web** (cycle 57
   §8-3) — décision produit, intacte.
5. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, bloquée sur l'absence de Xcode.
6. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte.
7. **Nouvelle : balayer les AUTRES champs autoritatifs à émetteurs multiples.**
   La règle du §6 est écrite ; le balayage du cycle 62 §7 bis ne portait que
   sur la parité des émetteurs, pas sur le nombre d'ÉTATS que chaque champ
   optionnel doit porter. Candidats à instruire, dans cet ordre : `location`
   sur `conversation:updated` (hissé « clé absente, jamais `null` » — donc la
   même question s'y pose déjà, et la réponse actuelle y est peut-être juste
   pour une autre raison), puis les champs optionnels de `message:new`.

## 8. La fusion, faite à la main

Les deux cycles 63 touchaient `broadcastReadStatus.ts` et se sont croisés sur
`CHANGELOG.md`, `tasks/lessons.md` et le nom même du journal. Résolution, point
par point :

| Site | Résolution |
|---|---|
| `broadcastReadStatus.ts` | **leur version est conservée** — c'est elle qui CALCULE. `buildActorBridge` devient `announceActorBridge` et rend l'une des trois phrases : pont, `null` (compteur à zéro, ou passe qui a répondu sans nommer de pont), clé absente (pas de constructeur, ou passe TOMBÉE). Leurs deux replis n'ordonnent donc plus l'effacement. |
| `broadcastReadStatus.test.ts` (leur fichier) | 3 témoins portés au troisième état : « compteur à zéro » et « la passe n'annonce rien » deviennent `bridge: null` ; « la passe tombe » gagne un `not.toHaveProperty('bridge')` — la distinction que le nouveau contrat introduit ENTRE ces deux-là. |
| `broadcastReadStatus.cost.test.ts` (leur fichier) | l'assertion de forme du cas gratuit devient `bridge: null` ; **les lignes qui comptent les requêtes sont inchangées** — annoncé, toujours pas payé. |
| `broadcastReadStatus.bridge.test.ts` (ce cycle) | retargeté sur les deux replis, pour ne pas doubler leur fichier. |
| `tasks/lessons.md` | les deux leçons gardées ; la nôtre renumérotée **233** (leur 232 est arrivée la première). |
| `CHANGELOG.md` | les deux entrées gardées, chacune pointant sur son journal. |
| journal | le leur garde `cycle63.md`, celui-ci devient `cycle63-bis.md`. |

Aucune ligne de leur correctif n'a été perdue : le seul changement apporté à
leur code est la troisième phrase sur les chemins où ils n'en avaient que deux.

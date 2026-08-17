# Audit sync temps réel — cycle 63 (2026-08-17)

Branche : `claude/keen-hamilton-qchw0m` — repartie de `origin/main` (485d9a38,
cycle 62 bis intégralement mergé).

> Piste n°1 du cycle 62, livrée — mais pas par la réponse qu'elle attendait.
> Elle posait la question du PRIX (« la passe peut-elle coûter moins qu'une
> passe complète ? ») et notait, en post-scriptum, que le manque était
> peut-être ailleurs : « se demander si le manque n'est pas d'abord un manque
> de vocabulaire dans le contrat gelé ». C'était le cas. Le prix n'a pas eu à
> être payé.

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
| `broadcastReadStatus` (resynchro du lecteur) | toujours — 5 requêtes par accusé de lecture, arbitrage du cycle 62 | après une lecture PARTIELLE, les autres appareils gardent un compteur > 0 et **perdent le pont** qui leur disait où reprendre |
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

L'arbitrage de coût du cycle 62 devient sans objet. La question n'était pas
« comment payer la passe sur le chemin chaud » mais « comment ne rien
affirmer » — et se taire est gratuit. **Ce lot n'ajoute aucune requête, sur
aucun chemin.**

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

### 2.1 bis L'arbitrage qui RESTE, écrit franchement

Conserver un pont non recalculé n'est pas gratuit partout. Sur UN chemin — la
resynchro après une lecture **partielle** — le pont conservé peut SUR-COMPTER :
le rang rend la phrase du pont (`bridge.data.messageCount`, « Alice et Bob,
5 messages ») à côté d'une pastille tombée à 2. Sur les trois autres chemins
non calculants (borne de l'instantané, passe tombée, `conversation:join`), le
pont conservé est **exact** — rien n'a été lu, la valeur n'a simplement pas été
recalculée.

C'est l'écart d'un instantané périmé, celui que la doctrine
stale-while-revalidate assume partout ailleurs dans ce dépôt, et il se corrige
au premier message reçu, à la première reconnexion dans la fenêtre de
l'instantané, ou au premier `GET /conversations`. L'ancienne forme, elle,
effaçait le pont : pas plus juste, et sans recours. Le choix est donc *stale*
plutôt qu'*absent* — et il est consigné ici pour qu'un cycle ultérieur puisse
le rouvrir en connaissance de cause s'il trouve un recalcul assez bon marché.

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
  (`broadcastReadStatus.bridge.test.ts`, 4 témoins) : lecture partielle ⇒ pas
  de clé ; compteur à zéro ⇒ `bridge: null` ; même règle sur la branche
  « accusés masqués » ; aucun compteur — donc aucune phrase — sur un `received`.
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
| `jest` gateway | voir §6 |
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

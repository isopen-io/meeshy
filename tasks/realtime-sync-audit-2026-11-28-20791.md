# La huitième case de la matrice des cliquets socket (#20791)

**Date** : 2026-11-28 · **Branche** : `claude/exciting-planck-ih1qaj` · **Issue** : #20791
**À la suite de** : #20414 / #20778 (cycles 227-228), qui ont mesuré ce défaut à la main sur UN nom.

## Le défaut

Sept cliquets tiennent le contrat Socket.IO, et `packages/shared/CLAUDE.md`
affirmait que la direction MONTANTE était fermée depuis #18499. Elle l'était à
moitié :

| ce qu'on garde | descendant (`SERVER_EVENTS`) | montant (`CLIENT_EVENTS`) |
|---|---|---|
| bout **serveur** | `socket-event-emitter-gate` | `socket-event-handler-gate` (#18499) |
| bout **client** | `socket-event-orphan-gate` (#18342) + parity gate | **RIEN** |

La phrase nommait une DIRECTION là où le cliquet gardait un BOUT, et c'est elle
qui empêchait de voir la case vide.

## Ce qu'il y avait dessous : dix canaux SERVIS sans appelant

| famille | écouteur serveur | ce qui manque |
|---|---|---|
| `message:edit`, `message:delete`, `reaction:add`, `reaction:remove` | **4 vivants** | aucun client ne les cite — les trois passent par REST (`/api/v1/reactions/:messageId`) |
| `e2ee:send-signal`, `e2ee:send-verification` | **2 vivants** | les clients ne citent qu'`e2ee:envelope` (mesuré : seule chaîne `e2ee:` de leurs sources) |
| `authenticate` | **1 vivant** | l'authentification MANUELLE, quand `handleTokenAuthentication` tourne déjà à chaque connexion |
| `admin:agent-subscribe`, `admin:agent-unsubscribe` | **2 vivants** | aucune console d'administration dans ce dépôt |
| `reaction:request-sync` | **1 vivant** | jumelle MESSAGE de `comment:reaction-request-sync`, mesurée morte par #20414 |
| les 5 restes de la transcription d'appel | — | déjà inventoriés par `socket-event-handler-gate` (ils manquent des DEUX bouts) |

**Le prix n'est pas celui de #18499, et c'est tout le point.** Sans ÉCOUTEUR, un
canal SE TAIT — Socket.IO laisse tomber l'événement sans lever d'erreur. Sans
ÉMETTEUR, c'est l'inverse du silence : un `socket.on` vivant, sa validation Zod,
son seau de débit, ses gardes de participation vivante et ses témoins, maintenus
pour un appelant qui n'existe pas — et qui se lisent partout comme une feature
en service.

**`authenticate` n'est PAS une faille**, dit à voix haute pour qu'on ne le
relise pas comme telle : Zod, débit par IP sur l'adresse ATTESTÉE, `jwt.verify`,
et le `userId` que son schéma accepte est IGNORÉ. Une porte correctement gardée
que personne n'emprunte — coût de surface et de maintenabilité, pas de
confidentialité.

## Le piège de l'instrument, et il a frappé

Au premier jet, la garde a inventorié **`heartbeat`** comme un canal sans
émetteur. **Il en a DEUX** — `MessageSocketManager.swift`
(`safeEmit("heartbeat", ["clientTime": …])`, 30 s) et `SocketManager.kt`
(`socket.emit(EVENT_HEARTBEAT, …)`, avec son écoute de `heartbeat:ack`).

La cause n'était pas dans le dépôt : le relevé PARTAGÉ `eventsNamedByClients`
reconnaît un littéral par la forme `entity:action`, et **trois noms déclarés ne
la suivent pas** — `authenticate`, `heartbeat`, et `error` côté `SERVER_EVENTS`,
que l'orphan gate ne voit donc pas non plus.

> **Un inventaire d'ABSENCE est une affirmation sur le monde ; un relevé qui ne
> trouve rien est une affirmation sur l'INSTRUMENT.**

Remède ÉTROIT, par décision : un second relevé littéral borné aux noms sans
deux-points, dans ce fichier-ci. Corriger le helper partagé déplacerait les
inventaires de deux autres cliquets dans le même lot — c'est un autre travail, et
#20791 le note (`error` est dans le même angle mort côté descendant).

## Et le commentaire qui l'affirmait disait faux

`AuthHandler.handleEnginePong` écrivait « Android n'a jamais emis de heartbeat
applicatif » et « `CLIENT_EVENTS.HEARTBEAT` ne subsiste que pour iOS ». **Les
deux sont mesurés faux**, et on ne l'a su qu'en confrontant le relevé au code.
Seule la moitié sur le WEB était juste (retiré au cycle 78), et elle est gardée.

C'est la leçon du cycle 94 avec sa précision utile : ce commentaire décrivait le
**parc des clients**, c'est-à-dire la chose la moins susceptible de rester vraie
et la moins visible depuis le fichier qui l'énonce.

## Ce que le cliquet ne prouve PAS, écrit sur place

« Un client CITE ce nom » n'est pas « un client l'ÉMET ». Le palier 2 — « la
méthode SDK qui l'émet a-t-elle un appelant HORS du SDK ? » — est une question de
graphe d'appels, et **c'est exactement le palier qui a laissé vivre #20778** :
`comment:reaction-request-sync` EST cité, par les deux SDK, qui le DÉCLARENT.

La mesure dit aussi pourquoi le palier 2 ne se réduit pas à « cité seulement par
un SDK » : ce critère rend 25 entrées dont la plupart sont saines
(`conversation:join`, `feed:subscribe`, `message:send` ne sont cités que par les
SDK parce que l'application appelle `joinConversation()`, pas le nom). Il
mesurerait **la bonne encapsulation du SDK**, pas une propriété utile — la faute
du cycle 107, dont le balayage fut JETÉ plutôt que gelé. Le palier 1 se trompe
donc du côté PERMISSIF, et il ne peut pas rougir à tort.

## Preuve

**ROUGE prouvé dans les TROIS sens :**

| mutation | verdict |
|---|---|
| retirer la famille des quatre transports socket de l'inventaire | 2 rouges, les quatre noms cités |
| inventorier `typing:start` (qu'un client ÉMET vraiment) | 2 rouges — le second sens, « un canal qui gagne son émetteur SORT » |
| retirer le relevé sans deux-points de l'union | 1 rouge : `heartbeat` réinventorié à tort, exactement le défaut du premier jet |

```
npx vitest run __tests__/ci (packages/shared)   → 26 fichiers, 228 témoins verts
npx vitest run …client-emitter-gate             → 10/10
bun run build (packages/shared)                 → 0
npx tsc --noEmit -p tsconfig.json (passerelle)  → 0 erreur
npx jest src/socketio/handlers/__tests__/AuthHandler → 15 suites, 154 témoins verts
```

## Ce que ce lot ne fait pas

**Aucun retrait de `CLIENT_EVENTS`.** La rétrocompatibilité (#9223) s'applique :
un client DÉPLOYÉ peut émettre un nom que le dépôt n'écrit plus, et un retrait
exige une mesure de parc. L'inventaire ne porte AUCUN verdict — décider d'écrire
l'émetteur, de retirer le handler ou de retirer la déclaration appartient au
produit, et ce n'est pas la même décision pour une porte d'authentification et
pour une resynchronisation de réactions.

Le sort de `reaction:request-sync` se décide avec sa jumelle : **#20778**.

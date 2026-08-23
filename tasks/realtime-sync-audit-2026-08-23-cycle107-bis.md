# Cycle 107 bis — la porte d'ÉCOUTE : ce que le CAST ouvrait dans les DEUX sens

> **À lire après `realtime-sync-audit-2026-08-23-cycle107.md`**, écrit en
> parallèle par une autre session sur le MÊME suivi, et dont la conclusion est
> juste : le suivi « le miroir client→serveur n'est pas gouverné » avait une
> PRÉMISSE FAUSSE. Ce document dit ce que la même enquête a trouvé quand même,
> et pourquoi les deux ne se contredisent pas.

## 0. Réconciliation — la prémisse était fausse, la piste ne l'était pas

Le journal jumeau mesure que la surface ENTRANTE est déjà gouvernée : 37
`validateSocketEvent` sur huit familles de handlers, gardes manuscrites sur deux
autres, limiteur de débit sur chacune. Et il en tire la bonne règle :

> **Typage et validation ne sont pas la même chose.** Pour du SORTANT, une porte
> de type est la seule garde qui existe — une diffusion Socket.IO n'a aucun
> sérialiseur. Pour de l'ENTRANT, elle ne garde rien : le client n'est pas
> compilé par nous, et un `socket.on` typé décrit ce que le serveur CROIT
> recevoir, jamais ce qu'il ACCEPTE.

**Je souscris entièrement**, et ce lot l'avait mesuré de son côté sans en tirer
la formulation : le tableau du §3 ci-dessous montre une porte qui refuse un nom
d'événement non déclaré et qui laisse passer une charge divergente. Une porte
d'écoute est un instrument de COMPLÉTUDE DE CONTRAT, jamais de sécurité.

Ce que le jumeau conclut ensuite — « aucun changement de production » — est le
seul point où nos deux lots divergent, et la raison est précise :

**le cast n'effaçait pas la moitié entrante, il effaçait les DEUX.**

`this.io as SocketIOServer` (six sites) prive `CallEventsHandler` du contrat pour
ce qu'il écoute **et** pour ce qu'il émet. En cherchant la moitié entrante — sur
une prémisse fausse — on tombe donc sur la moitié SORTANTE, celle dont le jumeau
établit lui-même qu'aucune autre garde ne la couvre. Quatre des six défauts de ce
lot sont sortants, dont deux qui coûtent à un client réel.

> **Une piste peut être fausse sur son motif et juste sur son adresse.** Le
> suivi disait « va voir la réception » pour la mauvaise raison ; à cette
> adresse-là vivait bien un défaut, dans l'autre direction. Mesurer la prémisse
> l'aurait fait abandonner — mesurer le SITE l'a résolu. Les deux gestes sont
> nécessaires, et le jumeau a raison de dire qu'un suivi hérité est une
> affirmation qui se mesure : la conclusion correcte n'était pas « le suivi est
> faux, on passe », c'était « le suivi est faux, ET voilà ce qu'il y a
> effectivement là ».

Restent vraies et non redondantes, des deux journaux : leur mesure de la
couverture Zod entrante, et le rejet de leur balayage à sept faux positifs
(« un cliquet ment plus longtemps qu'un journal »). Ce lot-ci pose un balayage
au périmètre volontairement étroit — il exige d'ÉCOUTER **et** d'importer le
type nu — précisément pour ne pas retomber dans ce piège ; son inventaire est
vide sans aucune liste d'exemptions.

---


Suivi nommé TROIS cycles de suite (104, 105, 106) et reporté à chaque fois :
« `ClientToServerEvents` n'a aucun équivalent de `serverEmit.ts` ». C'est la
moitié **hostile** du contrat — ce que le serveur ÉMET vient de lui, ce qu'il
REÇOIT vient du réseau.

## 1. Ce qui a rendu la moitié réception ingouvernable — un CAST, pas un oubli

`MeeshySocketIOManager` déclare son `io` avec les deux cartes du contrat
(ligne 169), et ses 33 `socket.on` sont donc vérifiés. Puis il le passe à
`CallEventsHandler` **en effaçant le contrat** :

```ts
io: this.io as SocketIOServer,   // ← SIX sites
```

`SocketIOServer` sans générique vaut `DefaultEventsMap`, c'est-à-dire
`[event: string]: (...args: any[]) => void`. Le handler importait en prime le
`Socket` NU de `socket.io`. Ses **22 sites d'écoute** — toute la surface de
signalisation d'appel — déclaraient donc librement la forme de ce qu'ils
reçoivent.

> **Un cast est une porte** (cycle 105). Celui-ci n'ouvrait pas un appel, il
> ouvrait un SOUS-SYSTÈME : tout ce que `CallEventsHandler` écoute **et tout ce
> qu'il émet** sortaient du contrat par cette seule ligne, répétée six fois.

## 2. Ce que la porte laissait passer

### En RÉCEPTION — 2 des 22 sites

**A. `call:analytics` — écouté, validé, agrégé, et déclaré NULLE PART.**
Le listener transcrivait **dix-neuf champs en ligne**. L'événement n'existait ni
dans `CLIENT_EVENTS`, ni dans `ClientToServerEvents` — seulement dans
`CALL_EVENTS.ANALYTICS`. Les **trois** clients l'émettent, chacun contre sa
propre transcription. C'est `conversation:join-error` (cycle 99) **dans l'autre
sens**, et la réception est le sens le plus cher : la forme y vient d'un
émetteur que le dépôt ne contrôle pas.

**B. `call:toggle-audio` / `-video` — trois sources, trois formes.**

| source | forme | ack |
|---|---|---|
| `ClientToServerEvents` | `{ callId, enabled }` | **REQUIS** |
| le listener | `CallMediaToggleEvent` — `participantId`/`mediaType` **REQUIS** | aucun |
| `socketMediaToggleSchema` (Zod, autorité d'exécution) | `{ callId, enabled, mediaType?, participantId? }` | — |
| les trois clients, sur le fil | `{ callId, enabled }` | aucun |

Le type de DIFFUSION serveur→client réemployé en réception. **Piège armé, pas
panne** — le corps ne lit que `callId`/`enabled` et résout le participant
lui-même — et la distinction est mesurée, pas supposée. L'ack du contrat était
une fiction symétrique : personne ne l'envoie, personne ne l'appelle ; un client
écrit contre le contrat l'aurait attendu indéfiniment.

**Vérifié contre les ÉMETTEURS, pas seulement contre Zod** (règle du cycle 90 :
« avant de déclarer un champ, remonter jusqu'à l'émetteur »). Les dix-huit clés
de `CallManager.swift:3914` plus le `callId` que `emitCallAnalytics` ajoute
correspondent une à une à `CallAnalyticsEvent` ; iOS et Android émettent le
toggle en `{callId, enabled}` **sans ack**, et le web aussi. C'est cette
lecture-là — pas le compilateur, qui est bivariant — qui a tranché les deux
retraits du §B.

### En ÉMISSION — 4 divergences que la porte a fait tomber en une compilation

C'est l'effet annoncé par le cycle 105 (« typer une porte, c'est découvrir ce qui
la traversait »), et il s'est produit dans le sens qui n'était pas visé.

**C. `iceServers` sur `call:initiated` — un champ que les clients LISENT et
qu'aucun contrat ne déclare.** Les deux émetteurs l'attachent par-dessus
l'événement, avec des identifiants TURN calculés PAR destinataire. Le SDK iOS le
décode (`CallOfferData.iceServers`) : c'est ce qui donne à l'appelé de quoi
traverser un NAT **dès la sonnerie**. Un futur émetteur qui l'omettait ne cassait
aucune compilation et retirait TURN à l'appelé. Même famille que `_seq` et
`location` (cycle 105).

**D. `CallEndedEvent.endedBy` — le contrat promettait ce que l'émetteur ne
garantissait pas.** `broadcastCallEnded` déclare
`Omit<CallEndedEvent,'endedBy'> & { endedBy?: string }` : un élargissement
DÉLIBÉRÉ, les fins d'origine serveur (GC, heartbeat, arrêt gracieux) n'ayant
personne à nommer. Le contrat n'en portait qu'un état sur deux.

**E. `call:signal` — un `.refine` ne restreint pas `z.infer`.** Le contrat
déclare `WebRTCSignal`, une union DISCRIMINÉE ; le schéma Zod était un objet
PLAT gardé par un `.refine`. Les contraintes d'exécution étaient les mêmes — mon
soupçon initial d'un contournement (« une offre sans sdp passerait ») était
**faux, le `.refine` l'attrape** — mais le type inféré sortait plat, et
n'était donc pas assignable au contrat. Réparé au SCHÉMA plutôt qu'au site
d'émission : y écrire un cast aurait rouvert la porte qu'on venait de fermer.
Bénéfice de bord réel — Zod RETIRE désormais les champs de l'autre membre (un
`sdp` accroché à un `ice-candidate`), et le relais dépend déjà de ce retrait
pour sa sécurité.

**F.** La quatrième était le corollaire de E au site de relais, résolue sans cast
(voir §4).

## 3. Portée de la garde — MESURÉE avant d'être annoncée

Passée au compilateur sous le `tsconfig` réel AVANT d'écrire la moindre prose.
Une porte qu'on annonce plus stricte qu'elle n'est vaut moins que pas de porte,
parce que personne n'ira vérifier derrière.

| ce qu'on écoute | mesure |
|---|---|
| un nom d'événement ABSENT du contrat | **TS2345 — refusé** |
| une charge SANS RECOUVREMENT avec la déclarée | **TS2345 — refusé** |
| une charge divergente mais assignable dans UN sens | **ACCEPTÉ** |

La troisième ligne est structurelle : `strictFunctionTypes: false` ⇒ paramètres
BIVARIANTS. `CallMediaToggleEvent` passait donc sous `call:toggle-audio` sans un
mot — **cette porte ne l'aurait jamais dit.** C'est la lecture du fil, pas le
compilateur, qui a trouvé le défaut B.

Ce que la porte garde vraiment : **aucun événement ne peut plus être ÉCOUTÉ sans
être DÉCLARÉ.** C'est exactement la faute qui a laissé vivre `call:analytics`.

## 4. Une erreur commise, mesurée, et ce qu'elle a appris

Le RED de la 2e garde a d'abord été annoncé « ne tombe pas » (`total = 0`). Faux :
la mutation avait rendu le paquet partagé non compilable, `bun run build` avait
échoué — et sa sortie était redirigée vers `/dev/null`. La passerelle compilait
donc contre un `dist` PÉRIMÉ, et le vert mesurait un artefact.

> **Un gate dont on silence la sortie ne mesure plus ce qu'on croit.** Un build
> intermédiaire raté ne ressemble pas à une panne : il ressemble à un test qui
> passe. Les RED ont été refaits en vérifiant le CODE DE SORTIE du build à chaque
> mutation — et la 2e garde tombe bien.

Même famille que « un témoin qui ne peut pas tomber n'est pas un témoin », un
étage plus bas : ici c'est l'OUTILLAGE de la mesure qui était muet.

## 5. Ce que le lot pose

- [x] `socketio/clientReceive.ts` — la jumelle de `serverEmit.ts` en RÉCEPTION,
      dérivée de `ClientToServerEvents`, avec son cliquet de type (5 assertions)
      et sa portée mesurée écrite dans l'en-tête.
- [x] `call:analytics` déclaré (`CallAnalyticsEvent`, transcription de
      l'autorité d'exécution Zod) ; les 19 champs en ligne retirés du listener.
- [x] `CallMediaToggleClientEvent` — la réception séparée de la diffusion, les
      deux fictions (champs requis, ack) retirées.
- [x] `iceServers` et `endedBy?` déclarés au contrat, contre leurs émetteurs réels.
- [x] `socketSignalSchema` en union DISCRIMINÉE — mêmes contraintes d'exécution
      (les 78 témoins écrits contre la forme plate passent inchangés), type
      inféré enfin conforme, champs de l'autre membre retirés (2 témoins neufs).
- [x] `CallEventsHandler` et `MeeshySocketIOManager` typés contre le contrat ;
      **les 6 casts retirés**, aucun réintroduit.
- [x] Balayage-cliquet `client-receive-door-sweep` — inventaire VIDE, sans
      liste d'exemptions : le discriminant exige d'ÉCOUTER **et** d'importer le
      type nu, donc les trois services émetteurs purs sortent par construction.
- [x] **RED prouvé sur 5 mutations** : analytics retiré du contrat (le listener
      ET le cliquet tombent), type client ré-aliasé sur la diffusion, ack
      réintroduit, schéma de signal remis à plat, handler rendu au `Socket` nu
      (le balayage le voit).
- [x] Gates : `tsc` **0 erreur**.

## 6. Suivis

- [ ] **La bivariance est la limite du lot, et elle est générale.** Aucune porte
      typée de la passerelle ne peut attraper une charge divergente tant que
      `strictFunctionTypes` est à `false`. Passer ce seul drapeau à `true` sur le
      paquet est une décision à instruire (elle touche bien au-delà de Socket.IO)
      — mais c'est le seul changement qui rendrait les deux portes strictes.
- [ ] Suivi hérité (cycle 106) — la LECTURE depuis Redis reste non validée à
      l'exécution ; un `zod.parse` par `eventType` au drain est une décision de
      PERFORMANCE avant d'être une décision de typage.
- [ ] Suivi hérité — `_seq` n'est déclaré que sur `NotificationEventData`.
- [ ] Suivi hérité — `ReactionUpdateEvent` / `ReactionUpdateEventData`, deux
      exemplaires de la même déclaration.
- [ ] Suivi hérité — `ConversationUpdatedEventData` et sa signature d'index.
- [ ] **Neuf — le même cast, côté WEB.** `apps/web` déclare pourtant un
      `TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>`
      (`services/socketio/types.ts`), et `VideoCallInterface.tsx` l'ouvre trois
      fois par `(socket as unknown).emit(…)`. C'est mot pour mot le défaut que ce
      lot ferme sur la passerelle, dans le sens ÉMISSION et sur le client : le
      contrat existe, il est déclaré, et un cast le retire au site d'appel.
      Vérifié au passage que ces trois émissions n'envoient AUCUN ack — c'est la
      mesure qui a tranché le retrait de l'ack au contrat (§2 B), et c'est aussi
      pourquoi le changement de signature ne casse rien côté web : le cast le
      soustrait déjà à toute vérification.
- [ ] **Neuf** — trois services (`CallCleanupService`,
      `StoryTextObjectTranslationService`, `NotificationService`) prennent encore
      un `Server` NU pour ÉMETTRE. Le balayage de RÉCEPTION ne les concerne pas
      (par construction, pas par exemption) et celui d'ÉMISSION ne voit que les
      portes RÉÉCRITES, pas un paramètre nu. C'est la troisième forme de la même
      famille.

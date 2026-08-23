# Cycle 108 — le `Server` NU : la porte qu'aucun des deux balayages ne pouvait voir

Suite directe des deux suivis laissés par le cycle 107 bis, tous deux instruits
et tous deux réels. Le lot ferme la TROISIÈME forme de la famille « porte
d'émission » sur la passerelle, et la forme MIROIR sur le client web.

## 1. Le point de départ : deux suivis, et ce qu'ils cachaient

Le cycle 107 bis se clôt sur :

> - **Neuf — le même cast, côté WEB.** `apps/web` déclare pourtant un
>   `TypedSocket` et `VideoCallInterface.tsx` l'ouvre trois fois par
>   `(socket as unknown).emit(…)`.
> - **Neuf** — trois services (`CallCleanupService`,
>   `StoryTextObjectTranslationService`, `NotificationService`) prennent encore
>   un `Server` NU pour ÉMETTRE.

Les deux comptes étaient bas. Il y a **cinq** casts côté web, et **cinq**
porteurs du `Server` nu côté passerelle — les trois services nommés, plus
`AgentAdminRelay`, plus le helper PARTAGÉ `emitWithSeq`, qui prenait le `Server`
nu pour le compte de tous ses appelants.

> **Un suivi hérité est une AFFIRMATION** (règle du cycle 107), et son COMPTE en
> est une aussi (règle du cycle 93). Les deux se remesurent. Ici la piste était
> juste sur l'adresse et basse sur le chiffre — l'inverse du cycle 107, où elle
> était fausse sur le motif et juste sur l'adresse.

## 2. Ce que le `Server` nu ne garde pas : mesuré, pas supposé

`Server` sans paramètres de type retombe sur `DefaultEventsMap`, dont la
signature est `emit(ev: string, ...args: any[])`. Injecté dans
`StoryTextObjectTranslationService`, sous le `tsconfig` de production, prisma
généré et `shared` construit :

```ts
this.io.to(ROOMS.feed(userId)).emit("totally:invented-event", { nothing: true });
this.io.to(ROOMS.feed(userId)).emit(SERVER_EVENTS.STORY_TRANSLATION_UPDATED, { wrong: "shape" });
```

```
TSC_EXIT=0        ← zéro erreur, les DEUX lignes
```

Un nom d'événement **entièrement inventé** et une charge de forme **fausse**
compilent l'un comme l'autre. Ce n'est pas un défaut de style : c'est l'absence
totale de contrat, et c'est la forme exacte du défaut du cycle 101 —
`message:edited` servi sans `senderId`/`messageType`/`createdAt`, rejeté en
silence par tous les décodeurs iOS pendant des mois.

**~16 émissions temps réel traversaient ces portes**, dont les quatre familles de
demande d'ami, `user:updated`, les compteurs et suppressions de notification,
`call:ended` vers l'audience de terminaison complète, et les deux mises à jour de
traduction de story.

### Pourquoi ni l'un ni l'autre des deux cliquets existants ne pouvait le voir

| cliquet | ce qu'il cherche | pourquoi il rate celui-ci |
|---|---|---|
| `ServerEmitRatchet` (type, cycle 104) | ce que la porte REFUSE | il garde `serverEmit.ts` ; ces services ne l'importaient pas |
| `sweepUntypedEmitDoors` (cycle 104/105) | une signature `emit` RÉÉCRITE trop librement | il n'y a **aucune** signature `emit` à trouver — rien n'est réécrit |

> **Chercher une forme fautive par sa DÉCLARATION, c'est manquer tous les sites
> qui l'obtiennent autrement.** La règle est écrite au cycle 105 pour le CAST.
> Elle a une troisième instance, et c'est la plus discrète des trois : ne rien
> écrire du tout, et prendre le type nu de la dépendance. Il n'y a ni
> déclaration ni assertion à chercher — seulement un import qui a l'air normal.

## 3. Ce que le lot change

**La porte élargie** (`socketio/serverEmit.ts`) — à la MESURE de ce que les
porteurs font réellement, jamais une recopie de socket.io :

- `ServerEmitIO.to` accepte désormais `string | string[]` — `CallCleanupService`
  diffuse `call:ended` vers l'audience complète en une émission. Élargir un
  PARAMÈTRE est contravariant : les dizaines de sites qui passent une chaîne
  restent vérifiés à l'identique.
- `ServerEmitIOWithRooms` ajoute `in(room).fetchSockets()` — deux services
  diffusent ET inspectent la room qu'ils viennent de servir (présence avant
  repli e-mail ; éviction après terminaison d'appel). `ServerRoomSocket` est
  réduit à `leave` : c'est tout ce qu'on en lit, et `NotificationService` n'en
  lit même que la LONGUEUR.

**Les cinq porteurs retypés** : `NotificationService`, `CallCleanupService`,
`StoryTextObjectTranslationService`, `AgentAdminRelay`, et `emitWithSeq` — ce
dernier n'utilisait déjà son `io` que pour `.to()`, et émettait par
`emitServerEvent` : sa charge était gouvernée, son CANAL ne l'était pas.

**Résultat de la fermeture : `tsc` 0 erreur.** Les ~16 charges étaient déjà
justes. C'est le résultat le plus honnête à publier — et il ne rend pas le lot
vide, il le rend VÉRIFIABLE : ce qui était vrai par accident est désormais vrai
par construction, et le restera.

> **Une charge NON gouvernée ne se trompe jamais** (cycle 94) — il n'y a pas de
> contrat à contredire. Le cycle 107 bis a trouvé quatre divergences en fermant
> sa porte ; celui-ci n'en trouve aucune. Les deux issues sont le même geste, et
> annoncer une divergence qu'on n'a pas mesurée coûte la confiance dans les
> cycles où il y en a une (règle du cycle 103).

## 4. La preuve du ROUGE, dans les deux sens

**Après** fermeture, la MÊME mutation :

```
src/services/posts/StoryTextObjectTranslationService.ts(163,45): error TS2345:
  Type '"totally:invented-event"' is not assignable to type '"heartbeat:ack"'.
src/services/posts/StoryTextObjectTranslationService.ts(164,88): error TS2345:
  Object literal may only specify known properties, and 'wrong' does not exist
  in type 'StoryTranslationUpdatedEventData'.
```

Zéro erreur avant, deux après, sur des lignes identiques.

**Et le balayage tombe aussi** — `AgentAdminRelay` rendu à son `Server` nu :

```
+ "file": "socketio/AgentAdminRelay.ts"
Tests: 1 failed, 5 passed
```

Les deux gardes sont DISJOINTES et aucune ne subsume l'autre : la première voit
une porte RELÂCHÉE, la seconde une porte CONTOURNÉE — rien n'oblige un émetteur
neuf à importer `serverEmit.ts`.

## 5. Le balayage, et son étroitesse assumée

`sweepRawServerEmitters` — inventaire VIDE, aucune liste d'exemptions.

Discriminant : le fichier importe `Server` depuis `socket.io` en **`import type`**
ET contient `.emit(`. Les deux conditions comptent :

- **`import type`** exclut `MeeshySocketIOManager`, qui importe `Server` en
  VALEUR parce qu'il le CONSTRUIT (`new SocketIOServer(httpServer, …)`). C'est le
  seul site du dépôt qui le peut ; lui interdire l'import n'aurait aucun sens.
- **`.emit(`** exclut par CONSTRUCTION tout fichier qui détient un `Server` sans
  jamais émettre. Détenir n'est pas émettre — sans cette condition, le balayage
  mesurerait la popularité d'un import au lieu d'une propriété.

C'est la réponse directe aux **sept faux positifs du cycle 107**, dont le
balayage a été JETÉ plutôt que gelé : geler un inventaire faux transforme une
erreur de mesure en vérité de dépôt, et un cliquet ment plus longtemps qu'un
journal.

> **Une erreur commise en écrivant un cliquet est le meilleur cas de test qu'il
> aura jamais** (cycle 104). Première rédaction de `rawServerAliases` : un `exec`
> simple, qui ne rend que le PREMIER import du fichier — un fichier important
> `Server` puis `Server as SocketIOServer` sur deux lignes aurait laissé le
> second alias traverser en silence. Sa propre fixture l'a pris en défaut, et
> porte les deux formes pour cette raison.

## 6. Le miroir web — ce que le cycle 107 bis avait déjà débloqué sans le savoir

`VideoCallInterface.tsx` portait cinq `(socket as unknown).emit(…)`, alors que
`getSocket()` rend un `Socket<ServerToClientEvents, ClientToServerEvents>` et
que la ligne 199 du MÊME fichier émet sans cast.

Ces casts n'étaient pas gratuits : `CallMediaToggleClientEvent` exigeait
`mediaType` et `participantId` et un ack, quand le web n'envoie que
`{ callId, enabled }`. **Le cycle 107 bis a mesuré ce que les clients envoient
réellement et corrigé le contrat** — rendant les cinq casts sans objet le jour
même, sans que personne le remarque.

> **Le lot qui rend une chose possible doit relire ce qui la déclarait
> impossible** (cycle 105). Ici la variante est plus douce et tout aussi
> coûteuse : un lot peut rendre un contournement INUTILE sans que le
> contournement disparaisse. Il reste alors en place, et continue de soustraire
> son site à toute vérification pour une raison qui n'existe plus.

Retirés : dette web **1239 → 1234**, cinq points, **un par cast** — la mesure
exacte de ce qu'un `as unknown` coûtait. Les cinq émissions d'appel du web sont
désormais vérifiées contre `ClientToServerEvents`. Les six autres erreurs du
fichier (`window`, `constraints`, `event`) sont sans rapport avec le contrat
Socket.IO : hors du lot, toujours dans la dette.

## 7. Gates

- `tsc --noEmit` passerelle : **0 erreur** — code de sortie lu DIRECTEMENT,
  jamais à travers un pipe (règle du cycle 107 bis : le code de retour d'un
  pipeline est celui de sa dernière commande).
- `tsc --noEmit` shared : **0 erreur**.
- `scripts/check-type-debt.sh` : vert à 1234, baseline abaissée avec sa raison.
- Suite passerelle complète : voir §9.
- Balayage `server-emit-door-sweep` : 6/6, inventaire de production VIDE sur les
  deux formes, RED prouvé sur les deux fixtures ET sur une régression réelle.

## 8. Note de mesure — le cliquet de dette et son en-tête

L'en-tête de `check-type-debt.sh` affirme que l'absence du client Prisma « ne
change rien » pour `apps/web`. Mesuré ici : **1242 sans prisma généré, 1239
avec**. L'affirmation est donc fausse de trois points — sans conséquence sur le
cliquet (la CI génère toujours), mais c'est une affirmation d'en-tête qui n'a
jamais été confrontée, exactement la famille que le cycle 94 nomme. Non corrigée
dans ce lot : la mesurer proprement (quel import de web atteint le client) est un
lot à soi.

## 9. Suivis

- [ ] **La bivariance reste la limite, et elle est générale** (hérité, 107 bis).
      `strictFunctionTypes: false` ⇒ aucune porte typée n'attrape une charge
      divergente assignable dans un seul sens. Décision à instruire, elle dépasse
      Socket.IO.
- [ ] Hérité (106) — la LECTURE depuis Redis reste non validée à l'exécution.
- [ ] Hérité — `_seq` n'est déclaré que sur `NotificationEventData`.
- [ ] Hérité — `ReactionUpdateEvent` / `ReactionUpdateEventData`, deux
      exemplaires de la même déclaration.
- [ ] Hérité — `ConversationUpdatedEventData` et sa signature d'index.
- [ ] **Neuf** — les six `as unknown` restants de `VideoCallInterface.tsx`
      (`window.__preauthorizedMediaStream`, `constraints.facingMode`, `event`).
      Aucun ne touche le contrat Socket.IO ; le premier nomme un canal
      window-global entre deux composants, qui mérite un type.
- [ ] **Neuf** — l'en-tête du cliquet de dette (§8), fausse de trois points.

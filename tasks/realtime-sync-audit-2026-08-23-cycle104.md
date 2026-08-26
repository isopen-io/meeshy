# Cycle 104 — la porte d'émission : huit copies d'une déclaration qui ne dit rien

**Date** : 2026-08-23
**Branche** : `claude/keen-hamilton-qqnnp5`
**Prédécesseur** : cycle 103 (PR #3363) — `message:edited`, le transport REST que
le contrat ne gouvernait pas

---

## Le point de départ

Le cycle 103 a laissé trois suivis. Celui-ci est instruit tel qu'il était écrit :

> **`PreviewEmitIO.emit(event: string, payload: unknown)`** reste la porte non
> typée de toute diffusion d'aperçu. Ce lot a gouverné la CHARGE de
> `broadcastMessageMutation` ; l'ÉMISSION n'est toujours pas vérifiée contre
> `ServerToClientEvents`.

Le suivi était **juste, et il sous-estimait son objet d'un facteur huit**.

---

## Ce qui a été trouvé

`emit(event: string, payload: unknown)` n'était pas UNE porte. C'était la même
déclaration, écrite **huit fois à la main**, dans huit fichiers qui ne se citent
pas les uns les autres :

| # | fichier | nom local |
|---|---|---|
| 1 | `socketio/emitConversationPreviewUpdate.ts` | `PreviewEmitIO` |
| 2 | `socketio/broadcastMessageMutation.ts` | dérivé de (1) |
| 3 | `socketio/broadcastReactionMutation.ts` | `ReactionEmitIO` |
| 4 | `socketio/broadcastLinkMessage.ts` | anonyme, dans `getIO()` |
| 5 | `socketio/emitMentionCreated.ts` | `MentionEmitIO` |
| 6 | `socketio/emitUnreadCountsToRecipients.ts` | `UnreadCountEmitter` |
| 7 | `socketio/emitToConversationParticipants.ts` | `ConversationRoomBroadcast` |
| 8 | `utils/socket-broadcast.ts` | `SocketIOLike` |

Chacune écrite de bonne foi, chacune commentée « structurale, pour accepter le
`Server` de production comme un double de test » — ce qui est vrai, et n'exige à
aucun moment de renoncer au contrat. **Huit copies d'une déclaration qui ne dit
rien : c'est la forme que prend une règle qu'aucun outil n'applique.**

Deux copies de plus vivaient dans `SocialEventsHandler` — `SocialEventName` et
`SocialEventPayload`, écrites au cycle 100, mot pour mot ce que ce lot a fini
par mettre dans `serverEmit.ts`. Ce fichier-là avait déjà trouvé la bonne
réponse ; elle n'était simplement disponible nulle part ailleurs.

---

## La découverte : socket.io ne garde pas ce qu'on croit

C'est le résultat le plus cher du lot, et il a été **mesuré**, pas déduit.

Quatre émetteurs de la passerelle n'ont jamais eu de porte à eux : ils émettent
directement sur le `Server` de socket.io, lequel est paramétré par
`ServerToClientEvents`. Ils avaient donc l'air gardés.

```ts
// ReactionHandler, AttachmentReactionHandler, PostReactionHandler, SocialEventsHandler
const event = action === 'add' ? SERVER_EVENTS.POST_REACTION_ADDED : SERVER_EVENTS.POST_REACTION_REMOVED;
this.io.to(ROOMS.post(postId)).emit(event, updateEvent);
```

Sonde, sous le `tsconfig` exact de la production :

| ce qu'on émet | `Server` de socket.io | la porte de ce lot |
|---|---|---|
| nom LITTÉRAL + charge fausse | **refuse** ✓ | refuse ✓ |
| nom **UNION** + charge d'un SEUL membre | **ACCEPTE** ✗ | refuse ✓ |

`EventParams<…, Ev>` sur un `Ev` UNION s'effondre en UNION de tuples de
paramètres : une charge correspondant à N'IMPORTE lequel des membres passe sous
n'importe quel autre. Or un nom d'événement CALCULÉ — c'est-à-dire une union —
est précisément la forme qu'ont les quatre émetteurs ci-dessus, parce que c'est
la forme qu'a toute paire `added`/`removed`.

> **Le typage de socket.io est le plus faible exactement là où les émetteurs sont
> les plus nombreux.** Un émetteur qui a l'air gardé et ne l'est pas est pire
> qu'un émetteur ouvertement non typé : personne ne va le vérifier (règle du
> cycle 92 bis, « un schéma qui *marche* peut cacher une fuite au lieu de
> l'empêcher »).

---

## Ce que le lot a mesuré, et ce qu'il n'a PAS trouvé

**Aucune charge fausse sur le fil.** Les douze appelants de `broadcastToUser`,
les appelants d'`emitToConversationParticipants`, les quatre routes de réaction,
les quatre émetteurs sociaux : tous passent au contrat sans une correction de
valeur. C'est un **piège armé, pas une panne**, et la distinction est mesurée,
pas supposée — annoncer une panne qu'on n'a pas mesurée coûte la confiance dans
les cycles où il y en a une (règle du cycle 103).

**Une jumelle, en revanche, portait la marque exacte du cycle précédent.**
`broadcastReactionMutation` déclarait `payload: Record<string, unknown>` — le
sac de clés que le cycle 103 venait de retirer de `broadcastMessageMutation` —
et ses **quatre** sites d'appel portaient tous le double cast qui le dit :

```ts
payload: updateEvent as unknown as Record<string, unknown>,
```

Les quatre casts sont partis. La charge était DÉJÀ juste : ce qui manquait
n'était pas la valeur, c'était quoi que ce soit qui la vérifie. Au passage,
`ReactionUpdateEvent` (`shared/types/reaction.ts`) et `ReactionUpdateEventData`
(`shared/types/socketio-events.ts`) se révèlent être **deux exemplaires
structurellement identiques de la même déclaration**, jusqu'au commentaire de
`userId` — suivi ouvert ci-dessous.

**Et un défaut de HARNAIS, celui-là bien réel.**
`SocialEventsHandler.test.ts` portait un double PARTIEL de
`@meeshy/shared/types/socketio-events` : vingt-sept constantes de `SERVER_EVENTS`
énumérées à la main, et pas la vingt-huitième — `COMMENT_UNLIKED`. Sous ce
harnais, `broadcastCommentUnliked` émettait un événement au nom **`undefined`**,
sur ses deux adresses. Le témoin était VERT : il n'assertait que les rooms
(`io.to`), jamais le NOM.

> C'est le **troisième** exemplaire du même patron en une poignée de cycles
> (91 puis 93, tous deux sur `api-schemas`), et le premier où la perte est un nom
> d'événement plutôt qu'un schéma. La règle du répertoire — « `jest.requireActual`
> par défaut » — était déjà écrite aux deux fois précédentes. **Un double partiel
> ne se signale qu'au moment où le module grandit**, donc jamais avant.

Le double est retiré (rien à surcharger : `SERVER_EVENTS` et `ROOMS` sont des
constantes pures), et l'assertion manquante est posée — le NOM sur les deux
adresses, RED prouvé.

---

## Les correctifs

1. **`socketio/serverEmit.ts`** — la porte, dérivée de `ServerToClientEvents`,
   en **union de tuples** et non en méthode générique. La forme générique est
   celle qu'on écrit spontanément et le `Server` de production ne la satisfait
   pas : socket.io décore sa carte d'événements
   (`DecorateAcknowledgementsWithMultipleResponses`) avant d'en dériver ses
   paramètres, et deux signatures génériques ne s'unifient pas à travers ce
   mappage. L'union de tuples n'a pas de paramètre de type à unifier.

2. **Les huit portes** deviennent des alias. Les noms locaux survivent — sept
   fichiers les importent — mais le couple `(événement, charge)` est celui du
   contrat.

3. **Les deux fan-outs génériques** (`emitToConversationParticipants`,
   `broadcastToUser`) prennent `event: E` / `payload: ServerEventPayload<E>` :
   ce sont leurs APPELANTS que le compilateur vérifie désormais, un par un.

4. **Les quatre émetteurs qui avaient l'air gardés** passent par la porte.

5. **`broadcastReactionMutation.payload`** devient
   `Anonymized<ReactionUpdateEventData>` ; quatre doubles casts disparaissent.
   `Anonymized<T>` est hissé du cycle 103 vers `serverEmit.ts` — la jumelle en
   avait besoin mot pour mot.

6. **Deux erasures NOMMÉES, et deux seulement.** TypeScript ne propage pas la
   corrélation d'une union discriminée à travers l'accès à deux de ses
   propriétés (microsoft/TypeScript#30581) : un couple lu comme DONNÉE, ou lu
   depuis l'intérieur d'une fonction générique, redevient deux unions
   indépendantes. `emitServerEvent` porte cet effacement **une fois**, derrière
   un paramètre dont le type EST la garantie qu'il est sans conséquence. Les
   émetteurs dont le couple relève du flot de CONTRÔLE (`broadcastMessageMutation`,
   `broadcastReactionMutation`) n'y touchent pas : leur `switch` corrèle sans
   rien effacer, et c'est la forme à préférer partout où elle est possible.

7. **Deux frontières de désérialisation affirmées explicitement** :
   `linkMessageEmissions` (l'unité qui INSPECTE déjà la forme à l'exécution) et
   `_drainedEmissions` (la charge sort de Redis). Elles ne sont pas fermées —
   elles sont NOMMÉES, ce qu'une porte ouverte en aval ne permettait pas.

---

## Les cliquets — deux, et aucun ne subsume l'autre

**Au TYPE** (`ServerEmitRatchet`, dans `serverEmit.ts`) : quatre assertions
d'assignabilité, zéro ligne exécutable. Elles gardent ce que la porte REFUSE.

Elles vivent dans le module qu'elles gardent et **pas** dans `__tests__/`, pour
une raison mesurée : `tsconfig.json` EXCLUT les tests, et n'inclut
`src/socketio/**` que par ATTEIGNABILITÉ depuis `server.ts`. Un cliquet posé
dans un fichier que personne n'importe n'est jamais lu par le compilateur —
donc jamais rouge. (C'est ce qui a d'abord rendu une sonde de ce lot
trompeusement verte.)

**Et ce qui les rend rouges EN CI est `ts-jest`, pas `tsc --noEmit`.** La
première rédaction de ce lot affirmait le contraire — « `tsc --noEmit` est un
gate de CI » — et c'était FAUX : l'étape « Type-check » de `ci.yml` porte
`continue-on-error: true`, comme « Lint ». Un `tsc` rouge ne fait échouer aucun
job. Ce qui bloque est le job de TEST : `ts-jest` compile ce module parce que les
suites l'atteignent par leurs imports, et `TS2344` n'est pas dans son
`diagnostics.ignoreCodes`. Vérifié en relâchant `ServerEmitArgs` : la suite
`broadcastMessageMutation` refuse de se charger en nommant les trois lignes.

> **Corollaire, et il vaut au-delà de ce lot : un fichier de production
> qu'AUCUN test n'atteint n'a, en CI, aucune vérification de type du tout.**
> C'est exactement la règle que le dépôt applique déjà aux commentaires — un
> énoncé de contrainte est une AFFIRMATION, et se vérifie comme telle. Celui-ci
> a failli partir non vérifié, dans le lot dont c'est le sujet.

**RED prouvé, et les quatre assertions ne sont pas redondantes** :

| mutation de `ServerEmitArgs` | assertions qui tombent |
|---|---|
| relâchée en `[string, unknown]` | 2, 3, 4 |
| corrélation retirée (produit cartésien nom × charge) | 2, 3 |

**AU BALAYAGE** (`socketio/__tests__/server-emit-door-sweep.test.ts`, inventaire
**VIDE**) : une porte relâchée et une porte CONTOURNÉE sont deux régressions
distinctes, et la seconde est la plus probable — rien n'oblige un nouvel
émetteur à importer `serverEmit.ts`, et les huit copies existantes prouvent
qu'on la réécrit spontanément. Le balayage lit `src/` entier, pas
`src/socketio/` : la huitième copie vivait dans `utils/`, à deux répertoires de
la septième.

RED prouvé : `MentionEmitIO` remis à sa forme d'avant fait tomber le témoin en
nommant le fichier. Le balayage est lui-même gardé par deux fixtures — il VOIT
la forme qu'il interdit, et il ne signale PAS les trois formes justes.

---

## Gates

- `tsc --noEmit` : **0 erreur**
- suite complète passerelle : **836/836 suites, 19253/19253 témoins**
- nouveaux témoins : 3 (balayage) + 1 (nom d'événement) — RED prouvé sur les deux
- 4 doubles casts retirés · 8 portes + 2 alias de type consolidés
- 3 harnais réparés (fixtures reconstruites depuis le producteur RÉEL)

---

## Suivis

- [ ] **`ReactionUpdateEvent` (`shared/types/reaction.ts`) et
      `ReactionUpdateEventData` (`shared/types/socketio-events.ts`) sont deux
      exemplaires de la même déclaration**, jusqu'au commentaire de `userId`.
      Le contrat de fil devrait être le seul, l'autre devenant un alias. Écarté
      de ce lot par SCOPE, pas par préférence : la seconde est importée par le
      SDK web et par les services, donc c'est un lot de dépendances, pas
      d'émission.
- [ ] **La charge REJOUÉE n'est pas vérifiée contre la charge ÉMISE.**
      `QueuedMessagePayload.payload` est un `Record<string, unknown>` unique pour
      onze `eventType`. L'indexer par `eventType` fermerait la dernière frontière
      que ce lot a seulement NOMMÉE — et c'est le seul endroit du dépôt où un
      rejeu hors ligne peut diverger en silence de la diffusion directe.
- [ ] `ConversationUpdatedEventData` porte `readonly [key: string]: unknown`.
      La porte typée vérifie donc ses trois champs REQUIS et laisse tout le reste
      libre — dont `lastMessagePreview`, qui n'y est pas déclaré alors que trois
      émetteurs le posent. Même famille que `location` avant le cycle qui l'a
      déclaré : un champ qui voyage sans contrat, dont la parité entre émetteurs
      ne repose que sur la lecture du code voisin.
- [ ] **Le miroir client→serveur n'est pas gouverné.** Ce lot ferme
      `ServerToClientEvents` ; `ClientToServerEvents` n'a pas d'équivalent, et
      `socket.on(...)` reste libre de déclarer la forme qu'il veut de ce qu'il
      reçoit — la moitié la plus hostile des deux.
- [ ] Suivi hérité du cycle 103 — la règle du `senderId` du fil a DEUX
      exemplaires : `resolveWireSenderId` et la résolution manuscrite de
      `conversations/messages.ts:1076`.
- [ ] Suivi hérité — le web porte le 5e exemplaire de la règle `messageType`.
- [ ] Suivi hérité — un message de LIEU sans pièce jointe reste `'text'`.

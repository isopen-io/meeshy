# Cycle 105 — un cast est une porte, et `_seq` n'était déclaré nulle part

**Date** : 2026-08-23
**Branche** : `claude/keen-hamilton-qqnnp5`
**Prédécesseur** : cycle 104 (PR #3366) — la porte d'émission, huit copies d'une
déclaration qui ne dit rien

---

## Le point de départ

Le cycle 104 a dérivé la porte d'émission de `ServerToClientEvents` et l'a mise
sous double cliquet : un au TYPE contre une porte RELÂCHÉE, un au BALAYAGE contre
une porte CONTOURNÉE. Il a mesuré que socket.io ne garde pas un nom d'événement
CALCULÉ, et a routé les quatre émetteurs concernés par la porte.

Ce cycle-ci commence par la question que le précédent n'a pas posée : **son
balayage cherche des DÉCLARATIONS. Qu'est-ce qu'il ne peut pas voir ?**

---

## D1 — la neuvième porte, ouverte par ASSERTION DE TYPE

Elle vivait sur le chemin de rejeu hors ligne, `_drainPendingMessages` :

```ts
// Replayed payloads are stored as opaque JSON in the queue — they were
// shaped at enqueue time, so re-checking them against ServerToClientEvents
// here is impossible (loose emit, same as the previous raw-Socket path).
const userRoom = this.io.to(ROOMS.user(userId)) as unknown as {
  emit: (event: string, payload: unknown) => void;
};
```

**Un cast produit exactement la liberté d'une déclaration**, sur exactement le
même appel — et il est plus discret, puisqu'il ne crée aucun type nommé qu'on
puisse chercher. Le balayage du cycle 104 ne connaissait que la méthode abrégée
(`emit(event: string, …)`) ; celle-ci est une propriété-flèche à l'intérieur d'une
assertion.

### Le commentaire était une AFFIRMATION, et elle avait CESSÉ d'être vraie

« Les revérifier ici est **impossible** » était juste quand il a été écrit. Le
cycle 104 l'a rendu faux sans s'en apercevoir : `_drainedEmissions` rend des
`SocketEmission`, c'est-à-dire des `ServerEmission` — un couple corrélé — et
`emitServerEvent` existe précisément pour émettre ce couple-là.

> **Le lot qui rend une chose possible doit relire les commentaires qui la
> déclaraient impossible.** Ceux-là ne rougissent pas ; ils survivent à ce qui les
> a périmés, et ils sont lus comme une raison de ne pas essayer. Même famille que
> « un commentaire qui ÉNONCE une contrainte est une AFFIRMATION » (cycle 94), à
> ceci près que l'affirmation n'était pas fausse au départ — elle l'est devenue.

Le cast disparaît, et avec lui la dernière émission non gouvernée du rejeu. Le
`PENDING_MESSAGES_DELIVERED` émis deux lignes plus bas, qui traversait la même
porte, est désormais vérifié lui aussi.

---

## D2 — trois émetteurs à nom CALCULÉ que le cycle 104 n'avait pas balayés

Le cycle 104 a routé les quatre émetteurs qu'il avait trouvés à la main. Un
balayage systématique des appels — et non des déclarations — en montre trois de
plus, tous protégés par la même illusion (un `Server` typé, un nom calculé) :

| site | nom |
|---|---|
| `MeeshySocketIOManager` `_broadcastTranslationEvent` | union des trois événements de traduction AUDIO |
| `emitWithSeq` | `event: string` |
| `_drainPendingMessages` | `emission.event` (D1) |

---

## D3 — `_seq` : un champ que trois clients LISENT et qu'aucun contrat ne déclare

Typer `emitWithSeq` a forcé la question, et la réponse est le vrai coût du lot.

`emitWithSeq` estampille chaque charge d'un `_seq` monotone par utilisateur —
le curseur de détection de TROU du SyncEngine. **Les trois clients le lisent** :

| client | site |
|---|---|
| web | `observeSyncSeq(this.syncSeq, data?._seq)` — `notification-socketio.singleton.ts` |
| iOS | `case seq = "_seq"` — `MeeshySDK/Sockets/MessageSocketManager.swift` |
| Android | décodé, `MessageSocketManagerNotificationTest` |

Il n'était déclaré **nulle part**. Il ne voyageait que parce que la porte prenait
`payload: Record<string, unknown>`, et les deux sites d'appel portaient le double
cast qui le dit — `socketPayload as unknown as Record<string, unknown>`.

C'est mot pour mot le cas de `location` sur `ConversationUpdatedEventData` avant
qu'on ne le déclare, avec la même conséquence : **la parité entre émetteurs ne
tenait qu'à la lecture du code voisin.** Un second émetteur de `notification:new`
qui n'estampillerait pas `_seq` priverait les trois clients de leur détection de
trou, sans qu'aucun outil ne le voie.

Déclaré, avec ce que son ABSENCE veut dire : `emitWithSeq` dégrade délibérément
en émettant sans `_seq` quand l'allocation rejette ou dépasse son délai — le
client n'avance alors pas son curseur, et le trou est rattrapé au prochain
`/sync`.

---

## D4 — `context` : une carte opaque là où le type existait dans le même paquet

Le premier typage de l'émission l'a fait tomber immédiatement :

```
Type 'NotificationContext' is not assignable to type 'Record<string, unknown>'.
  Index signature for type 'string' is missing in type 'NotificationContext'.
```

`NotificationEventData.context` était déclaré `Record<string, unknown>` alors que
`NotificationContext` — dix-huit champs nommés et documentés — vit dans le MÊME
paquet, deux fichiers plus loin. Idem pour `metadata` / `NotificationMetadata`.

L'opacité n'était pas un choix : elle n'avait simplement **jamais été confrontée
à l'émetteur**, parce que les deux sites d'appel la castaient. Un `Record<string,
unknown>` dans un contrat n'est pas une déclaration, c'est une absence de
déclaration qui a l'air d'en être une — la version « carte » du
`{ type: 'object' }` nu.

Les deux champs déclarent désormais le type réel. Mesuré : aucune erreur ajoutée
côté web (les 1834 lignes de `tsc` de `apps/web` sont antérieures et sans rapport
— la seule ligne « notification » est un `as unknown` préexistant).

---

## Les cliquets

Le balayage voit désormais **les deux formes** — `emit(ev: string` et
`emit: (ev: string` — et sa fixture porte les trois formes fautives.

**RED prouvé de la façon la plus directe possible** : en réintroduisant le cast
que le cycle 104 avait laissé vivre, le balayage tombe **en nommant
`socketio/MeeshySocketIOManager.ts`**. Le cliquet étendu attrape exactement la
porte que sa version précédente ne voyait pas.

---

## Gates

- `tsc --noEmit` passerelle : **0 erreur**
- suite complète passerelle : **836/836 suites, 19253/19253 témoins**
- `packages/shared` : **102/102 fichiers, 2449/2449 témoins**
- `apps/web` : aucune erreur ajoutée (vérifié par grep ciblé sur la surface du lot)
- 3 doubles casts retirés · 1 porte par assertion supprimée · 2 champs de contrat
  déclarés

---

## Suivis

- [ ] **La charge REJOUÉE n'est toujours pas PROUVÉE** — elle est AFFIRMÉE.
      `_drainedEmissions` asserte le couple à la frontière Redis ;
      `QueuedMessagePayload.payload` reste un `Record<string, unknown>` unique
      pour onze `eventType`. L'indexer par `eventType` remplacerait l'affirmation
      par une vérification, et c'est le dernier endroit où un rejeu peut diverger
      en silence de la diffusion directe.
- [ ] `emitWithSeq` est générique sur l'événement, mais **`_seq` n'est déclaré
      que sur `NotificationEventData`** — le seul événement qui passe par lui
      aujourd'hui. Un second l'y ferait entrer sans que rien ne rappelle qu'il
      faut le déclarer. Un type marqueur partagé le dirait mieux.
- [ ] Suivi hérité — `ReactionUpdateEvent` et `ReactionUpdateEventData` restent
      deux exemplaires structurellement identiques.
- [ ] Suivi hérité — `ConversationUpdatedEventData` porte une signature d'index ;
      `lastMessagePreview` y voyage sans contrat.
- [ ] Suivi hérité — **le miroir client→serveur n'est pas gouverné.**
      `ClientToServerEvents` n'a pas d'équivalent de `serverEmit.ts`, et
      `socket.on(...)` reste libre de déclarer la forme qu'il veut de ce qu'il
      REÇOIT — la moitié la plus hostile des deux.

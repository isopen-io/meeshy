# Cycle 122 — Une fin d'appartenance n'atteignait pas mes AUTRES appareils

## Le défaut

Quitter une conversation, en être retiré par un admin, y être banni : trois manières de perdre une
appartenance. Les trois n'adressaient leur événement (`conversation:participant-left` / `-banned`)
qu'à `ROOMS.conversation(id)` **et aux rooms personnelles des membres RESTANTS** — jamais à celle
du sujet.

Or ses autres appareils sont posés sur l'écran de LISTE, donc **hors** de la room de conversation.
Ils n'apprenaient rien.

### L'argument existait déjà, il n'avait pas été appliqué jusqu'au bout

C'est exactement le raisonnement qui avait fait élargir l'éventail vers les rooms personnelles des
restants — « l'effectif se lit sur l'écran de liste, dont les lecteurs ont quitté la room ». Il
n'avait été appliqué qu'à ceux dont le **compteur** bouge, jamais à celui dont l'**appartenance**
s'arrête. Le code s'en justifiait même, à deux lignes de l'autre commentaire :

> « la room de conversation reste en tête de chaîne : elle porte le partant lui-même, encore dedans
> à cet instant »

Vrai de l'appareil qui a le FIL ouvert. Faux de tous les autres.

### Et le signal qui arrivait était mal lu

Les deux clients posaient un `memberCount` sur une ligne que `GET /conversations` ne sert plus
(`participants.some({ userId, isActive: true })`). La ligne restait affichée, cliquable, et
**persistée** — `schedulePersist` (cache disque iOS), `staleTime: Infinity` (web).

| Fin d'appartenance | Temps réel vers MES appareils | Tombstone delta |
|---|---|---|
| `conversation:deleted` (supprimer pour moi) | ✅ `ROOMS.user`, documenté | ✅ |
| départ volontaire (`leave.ts`) | ❌ | ✅ |
| retrait par un admin (`participants.ts`) | ❌ | ✅ |
| bannissement (`ban.ts`) | ❌ | ✅ |

Le delta unifiait donc DÉJÀ les quatre cas dans un seul `deletedConversationIds`
(`delta-tombstones.ts` les énumère nommément). Seul le chemin **temps réel** les séparait — et le
rattrapage différé (reconnexion suivante au mieux, 24 h au pire via `fullReconcileInterval`)
faisait que rien ne devenait jamais rouge.

## Le correctif

- **Gateway** — `leave.ts`, `participants.ts`, `ban.ts` : le sujet ferme la chaîne
  d'`emitToConversationParticipants`. **Une seule chaîne, jamais un second `emit`** — la propriété
  « au plus une copie par socket » est ce pour quoi le chaînage existe.
- **Web** — `dropConversationFromCache` sur `participant-left` / `-banned` quand le sujet est moi ;
  retire la ligne de `conversations.infinite()` et purge `conversations.detail`.
- **iOS app** — `ConversationListViewModel.dropConversationLeftByMe` : retire la ligne, persiste
  (donc purge le cache disque, `schedulePersist` sauvegardant l'instantané complet), invalide les
  messages.
- **iOS SDK** — `ConversationStoreSocketBridge` route vers `applyConversationDeleted`, sinon le
  non-lu de la conversation continuait de peser sur l'agrégat inter-conversations.

Sur les deux clients, **le test d'identité passe AVANT le court-circuit `membershipEnded === false`** :
ce drapeau protège un COMPTEUR, et il n'y a pas de compteur à protéger sur une ligne qui s'en va —
c'est même le cas d'un ban qui suit un départ non synchronisé, donc précisément celui où la ligne
fantôme est encore là.

`isMe()` (app) et `!me.isEmpty` (SDK) écartent l'identité vide de l'auth non résolue : piège propre
à la comparaison par `==`, que le `!=` de `participantJoined` n'avait pas.

## Gates

| Gate | Résultat |
|---|---|
| RED prouvé sans la production | 3 rouges gateway, 4 rouges web |
| gateway `tsc --noEmit` | **0 erreur** |
| gateway jest **complet** | voir section ci-dessous |
| web `tsc --noEmit` (fichiers touchés) | **0 erreur** |
| web jest **complet** | **569 suites / 12 198 tests verts** (21 skipped) |
| iOS / SDK | non exécutables depuis un runner Linux — vérifiés par la CI (`ios-tests.yml`, `sdk-tests.yml`) |

## TDD

8 témoins gateway (chaînage exact des rooms, unicité de l'émission, ordre emit → éviction de room,
effectif des restants), 5 web, 5 ViewModel iOS, 5 bridge SDK.

---

# Cycle 119 — Le retrait de réaction annonçait un ❤️ qu'il n'avait pas retiré

## Le défaut

`DELETE /posts/:postId/like` diffusait `emoji: '❤️'` **codé en dur** sur ses trois branches —
`story:unreacted`, `status:unreacted`, `post:unliked`. La route n'était pas en position de savoir
quel emoji partait : la ligne `PostReaction` n'est lisible qu'AVANT sa suppression, et le seul
endroit qui la lise est `PostService.unlikePost`, sous le nom `foundEmoji`, qui ne rendait que le
post.

Le défaut était **déjà écrit dans le code**. Le chantier des rétractations de notifications l'avait
rencontré et documenté sur place :

> « La route, elle, diffuse un '❤️' codé en dur, et un retrait câblé là-haut manquerait donc toute
> réaction d'un autre emoji. »

Il avait été contourné là où il gênait — jamais corrigé à sa source.

### Ce n'était pas latent

`StoryViewModel.applyStoryReactionDelta` (`apps/ios/.../StoryViewModel.swift:3057`) fait, sur
l'appareil de l'ACTEUR :

```swift
mine.removeAll { $0 == emoji }
```

Un 😂 retiré n'y retirait donc **rien**. La puce 😂 survivait à sa propre suppression, pendant que
`reactionCount` était bien décrémenté — « vous avez réagi 😂 » affiché sur un compteur à 0, jusqu'au
prochain fetch complet.

La fiche `rts-03` avait vu le mensonge et prescrit de le **contourner** côté client (« unreacted =
NO-OP — ne JAMAIS décrémenter sur ce payload »). Il est ici retiré à la source : le delta iOS
existant redevient correct **sans une ligne de Swift**.

### Deuxième défaut, même route

`unlikePost` est idempotent : sur un post que le lecteur n'a jamais aimé, il ne touche à rien. La
route diffusait quand même un `unreacted` — un événement qui décrit une transition qui n'a pas eu
lieu, et que les clients à delta appliquent en `-1`. Le rejeu `onDuplicate` du journal de mutation
tombait dans la même case, alors que le commentaire de la route affirmait l'inverse :

> « recording the mutation prevents the broadcast path from firing twice on replay »

L'affirmation était fausse. Elle est maintenant vraie.

### Troisième volet — le compteur absolu (rts-03, étapes 2-3)

Les quatre événements story/status ne portaient qu'`emoji` + `userId`, là où
`post:liked`/`post:unliked` portent `likeCount` + `reactionSummary` depuis toujours. Un consommateur
ne pouvait donc que compter en `±1` : ni idempotent sous double livraison, ni rattrapable après un
événement manqué. Le web l'avait acté **en renonçant** au temps réel sur ces compteurs —
`handleStoryReacted` : « no authoritative aggregation count — mutating the feed would drift ».

## Livré

- **`PostService.unlikePost`** rend une enveloppe `{ id, post, removedEmoji }`. `removedEmoji` est
  la réaction réellement retirée, `null` quand il n'y en avait aucune. L'enveloppe existe pour ce
  seul champ ; `id` y est repris du post parce que c'est l'identité que `withMutationLog`
  journalise (`T & { id: string }`).
- **`routes/posts/interactions.ts`** — l'emoji diffusé est `removedEmoji` sur les trois branches ;
  **rien retiré ⇒ rien annoncé**, le rejeu `onDuplicate` rendant `removedEmoji: null` par
  construction. L'acteur reste servi par l'état absolu de la réponse HTTP.
- **`packages/shared/types/post.ts`** — `likeCount` + `reactionSummary` sur les quatre types
  story/status, **requis**.
- **web** — `handleStoryReacted`/`handleStoryUnreacted` écrivent l'absolu dans `stories.feed()` via
  `patchStoryReactionCounts`. Le no-op documenté disparaît avec sa cause. Les handlers `status:*`
  gardent leur invalidation : elle est correcte, et la remplacer par un patch serait une
  optimisation distincte, hors périmètre.

### Écarts assumés vs la fiche rts-03

- **(a) champs REQUIS, pas optionnels.** La fiche prescrivait `reactionSummary?`. L'optionnalité en
  TypeScript n'achète rien ici : il y a **un seul** émetteur et il tient toujours la paire. Requis,
  le compilateur prouve l'invariant. La rétro-compatibilité est une propriété du **fil**, pas du
  type TS — elle est portée par les décodeurs, qui ignorent un champ qu'ils ne déclarent pas.
- **(b) `likeCount` en plus de `reactionSummary`.** La somme du résumé vaut le total, mais un
  consommateur ne devrait pas avoir à la redériver — et c'est la paire exacte que
  `PostLikedEventData` porte déjà.
- **(c) STORY inclus, pas seulement STATUS.** rts-03 ne visait que les statuts. C'est sur les
  **stories** que le mensonge avait un consommateur en production.

### Ce qui a été REFUSÉ

Remplacer l'invalidation `status:*` du web par un patch. Elle est correcte ; la changer est une
optimisation, pas un correctif, et elle n'a pas de défaut à fermer.

Rendre `emoji` optionnel sur le fil pour couvrir le cas « emoji inconnu ». Les décodeurs iOS le
déclarent non-optionnel (`SocketStoryUnreactedData.emoji: String`) : un payload sans emoji ferait
échouer le décodage et **droperait l'événement entier**. Quand l'emoji est inconnu, il n'y a rien à
annoncer — c'est la règle « rien retiré ⇒ rien annoncé », pas un champ à affaiblir.

## TDD

RED **vérifié en revenant la source seule**, les tests en place :

| Suite | Rouges contre l'ancienne source |
|---|---|
| `interactions2.test.ts` (gateway) | **11** |
| `use-post-socket-cache-sync.test.tsx` (web) | **3** |

Les rouges couvrent les trois volets : emoji fabriqué (STORY/STATUS/POST), diffusion sur un retrait
sans effet (dont le rejeu `onDuplicate`), et absence de la paire absolue.

## Gates

| Gate | Résultat |
|---|---|
| `prisma generate` + shared `bun run build` | OK (prérequis) |
| gateway `tsc --noEmit` | **0 erreur** |
| gateway jest **complet** | **710 suites / 17 387 tests verts** |
| web `tsc --noEmit` sur les fichiers touchés | **0 erreur** |
| web jest **complet** | **569 suites / 12 181 tests verts** (21 skipped) |

## Reste ouvert après ce cycle

- **Volet iOS de rts-03** — persistance des 4 sinks `StatusViewModel`, sink `statusUnreacted`,
  champs `reactionSummary` sur les `Socket*Data` du SDK. Non livrable depuis un runner Linux.
  **Le défaut de ce cycle ne l'attend pas** : il est fermé côté serveur, et le client iOS existant
  devient correct sans changement.
- **`bun run lint` (gateway) ne s'exécute pas** — aucun `eslint.config.js` dans `services/gateway/`.
  Antérieur, et la CI ne lance pas ce script : le gate lint n'existe pas pour la gateway.
- Hérités : volets iOS de `gwcontract-05` et `gwcontract-13` (à livrer ENSEMBLE), `net-02` (P1,
  iOS), `sync-01` (aucun client n'appelle encore `/sync`), fossile inerte
  `SocketNotificationEvent.isRead`.

---

# Cycles antérieurs

## Cycle 114-bis — PR #2968 (même run)

*Renuméroté 114-bis à la fusion : une autre branche (`claude/keen-hamilton-dl8km4`) tournait en
parallèle et a livré son propre « cycle 115 » (`GET /sync` ouvert aux sessions anonymes, leçon 239),
mergé avant celui-ci. Les deux existent, ils ne se recouvrent pas.*

`fix(ios/sync): l'effectif d'une conversation dérivait à vie, l'effectif ABSOLU du serveur étant ignoré`

Trouvé en appliquant le réflexe que le cycle 114 venait de dégager (« quel champ le serveur
envoie-t-il que le client ne lit pas ? ») — deuxième instance de la MÊME classe de défaut, en
quelques minutes.

- Les 4 structs d'appartenance décodent `memberCount: Int?`.
- `ConversationListViewModel.memberCountAfterMembershipEvent(current:absolute:delta:)` pose
  l'absolu ; le delta n'est plus qu'un repli pour un gateway antérieur au contrat.
- L'absolu tranche `membershipEnded` / `membershipRestored` ; plancher à zéro sur les deux branches.
- CHANGELOG : entrée pour ce correctif, entrée pour le volet iOS du cycle 114, et retrait du
  « Reste ouvert : le client iOS » devenu faux.

TDD : 5 témoins de décodage SDK + 5 côté app.

## Cycle 114-ter — non-lu iOS : une seule vérité locale, et elle tombe à l'ouverture

Signalé par l'utilisateur : « quand j'ouvre une conversation, le compteur doit IMMÉDIATEMENT être à
0, sans glitch de 99 ». Audit des porteurs du compteur en local — il y en avait trois, et aucun
chemin d'ouverture ne les touchait tous.

| Porteur | Écrivait sur ouverture ? |
|---|---|
| Cache disque (`ConversationSyncEngine`, seul à appliquer `reconcileUnread`) | oui, mais en différé |
| Store RAM (`ConversationStore`, SoT déclarée de `userState`) | **non** |
| Lignes `@Published` (`ConversationListViewModel`) | non (seulement via le rechargement débouncé) |
| Badge d'icône + widget (`NotificationCoordinator`) | **non** |

- `ConversationReadSignal` (app) — point d'écriture UNIQUE de la lecture locale, les 4 surfaces.
  Appelé par `start()` (ouverture), la quick-action push et le widget. Aucun appel réseau : l'accusé
  de lecture serveur garde son exigence d'exactitude et part séparément.
- `reconcileUnread` devient la règle des TROIS porteurs (cache, store, lignes), et sa frontière est
  monotone (MAX) au lieu de `local ?? incoming` — qui la faisait reculer sur le chemin store.
- Miroir synchrone de l'agrégat inter-conversations : `setCurrentlyOpenConversation` republie dans
  le tour de boucle de l'ouverture, sinon l'abonné suivant recevait le total d'avant.
- Le geste « Marquer comme lu » de la LISTE reste sur `store.apply(.markAsRead)` : c'est le seul
  chemin dont le zéro doit rester annulable par le rollback 4xx.

TDD : 3 témoins store, 1 règle, 2 agrégat, 3 lignes de liste, 1 ouverture.

**Renversement de politique assumé** : `docs/superpowers/specs/2026-07-24-read-exactness-design.md`
énonçait « le badge ne se vide plus à l'ouverture ». Il se vide de nouveau — mais LOCALEMENT
seulement. L'exactitude que la fiche protège porte sur ce qu'on DÉCLARE aux autres, pas sur sa
propre pastille ; c'est la confusion des deux qui produisait les deux bugs symétriques.

## Reste ouvert (candidats des prochains cycles)

- **Auditer les PRESCRIPTIONS écrites dans `packages/shared/types/`** (voir leçon 238, corollaire de
  méthode). Les commentaires du type « à POSER, pas à incrémenter », « absent ⇒ `true` », « ne
  jamais soustraire » prescrivent un comportement CLIENT : chacun nomme un bug possible, et se
  vérifie par un grep du nom du champ chez chaque client. Deux instances trouvées en un run — la
  troisième est probablement déjà écrite quelque part.

- **Constat 2 ci-dessus** — masquage personnel au niveau message : décision produit à prendre.
- **`GET /sync`** — reste sans client ; le brancher côté iOS est un chantier à part entière
  (le SDK a son propre `ConversationSyncEngine` sur `/conversations?updatedSince=`).
- **Android** — aucun delta `updatedSince` ; pas d'écart symétrique à combler aujourd'hui.
- **`conversation:left` n'a pas de branche « c'est MOI qui suis parti »** (candidat prochain cycle) :
  `ConversationSyncEngine.startSocketRelay` n'y fait qu'un
  `cache.participants.invalidate(for:)` — le pendant TEMPS RÉEL du correctif de ce cycle manque
  donc. Un départ déclenché depuis un autre appareil ne retire la conversation de la liste qu'au
  prochain delta (ce que la PR #2966 rend enfin possible), pas immédiatement. `conversation:closed`
  et `conversation:deleted`, eux, ont bien leur branche de retrait — l'asymétrie est l'écart.
  À vérifier avant de coder : le device qui vient de quitter est-il encore dans la room au moment
  de l'émission (`emitToConversationParticipants`, `routes/conversations/leave.ts:91`) ? Si non,
  le canal correct est `broadcastToUser`, et le correctif est côté gateway.

# Realtime sync audit — 2026-07-11 (continuous-improvement pass)

Passage ciblé sur le cœur temps-réel **testable en isolation** côté TypeScript
(gateway + `packages/shared`), l'environnement d'exécution étant Linux (pas de
toolchain Swift/Xcode — l'app iOS et le SDK ne sont ni compilables ni testables
ici ; cf. findings #2–#4 de `realtime-sync-audit-2026-07-05.md`, toujours ouverts,
qui exigent macOS).

**Conclusion : aucun défaut de correction sûr et isolé à corriger-puis-merger.**
Le cœur temps-réel audité est bien durci et couvert par des tests exhaustifs. Le
seul candidat relevé s'avère **conforme au contrat existant** (pinné par un test
intentionnel) — le corriger changerait une sémantique produit d'accusés de lecture
sans nécessité. Détail ci-dessous pour éviter de re-défricher le même terrain au
prochain cycle.

## Surfaces vérifiées correctes (ne pas re-vérifier)

- **`packages/shared/utils/`** — `mention-parser.ts` (tri displayName décroissant,
  frontières Unicode, invariant `hasMentions ⟺ parseMentions([])`),
  `user-presence.ts` (échelle 60s/5min/30min, branche `isOnline` autoritative,
  gestion NaN-vs-null), `conversation-helpers.ts`/`resolveUserLanguage` (priorité
  system→regional→custom→device→`fr`), `time-remaining.ts`, `relative-time.ts`,
  `client-message-id.ts`, `sender-identity.ts`, `participant-helpers.ts`. Chaque
  fonction pure a été tracée contre sa docstring et son suite de tests — aucune
  erreur de borne, comparaison inversée ni off-by-one.
- **`MessageReadStatusService`** — bornes `minFloorMs`, recherche binaire `countAbove`
  en `>` strict, soustraction `all − own`, garde `lt` ObjectId de `_advanceCursor`,
  clés de dédup scoping par `messageId` résolu (cf. finding #5 du 2026-07-06),
  union curseur ∪ reçu figé appliquée identiquement aux 4 méthodes de lecture.
- **`MessageProcessor`** — dédup idempotent `(conversationId, clientMessageId)` :
  INSERT direct + catch `P2002` atomique + relecture `findFirst`, race-safe.
- **Handlers Socket.IO** — `StatusHandler` (suppression typing multi-device),
  `ReactionHandler`/`AttachmentReactionHandler` (idempotence + `dedupKey` apparié à
  un `eventType` distinct, donc add/remove ne se collapsent pas), `ConversationHandler`
  (gardes de join), `emitConversationPreviewUpdate`, `serializeAttachmentForSocket`.

## Candidat écarté — `getMessageStatusDetails` omet les participants jamais actifs

`services/gateway/src/services/MessageReadStatusService.ts:1262-1324`

**Observation** : la méthode construit son ensemble à partir de
`evaluatedParticipantIds = union(curseurs, reçus figés)`. Un membre de groupe qui a
rejoint mais n'a **jamais** rien reçu/lu n'a ni curseur ni entrée figée, donc il est
absent — y compris sous `filter: "unread"` et `filter: "all"`. À l'inverse, la
méthode sœur `getMessageReadStatus` (`:1045-1053`) énumère **tous** les participants
actifs pour son `notSeenBy`.

**Pourquoi c'est conforme, pas un bug** : le contrat de `getMessageStatusDetails` est
« participants **ayant un statut enregistré** » (curseur ou reçu figé), avec
pagination et filtres delivered/read/unread. Ce contrat est **pinné par un test
intentionnel** : `MessageReadStatusService.test.ts` → `it('returns empty statuses
when no cursors found')` (~ligne 3228) assert `statuses = []` ET
`participant.findMany` **non appelé** quand aucun curseur n'existe. Le roster complet
« qui n'a pas vu ce message » vit délibérément sur l'endpoint résumé
`getMessageReadStatus.notSeenBy` (route `/messages/:id/status` vs.
`/messages/:id/status-details`). Les deux surfaces ont des contrats distincts par
conception.

**Si l'équipe UI veut fusionner les deux contrats** (afficher aussi les membres
jamais-actifs dans le détail `unread`/`all`), c'est un changement produit délibéré,
pas une correction de bug : il faudrait alors amorcer `evaluatedParticipantIds`
depuis tous les participants actifs (comme `getMessageReadStatus`) ET mettre à jour
le test ci-dessus. Décision propriétaire requise — non traité dans ce cycle.

## Environnement de vérification (parité CI)

- `bun install` échoue sur le postinstall `grpc-tools` (téléchargement S3 bloqué par
  le proxy) ; `bun install --ignore-scripts` complète le linking des binaires.
- Tests `packages/shared` : `bun x vitest run <file>`.
- Tests `services/gateway` : `bun x jest --config=jest.config.json <file>`.

## Cycle 2 (2026-07-11) — fuite timer/Map corrigée dans l'orchestrateur web

Passage suivant : ré-audit ciblé des surfaces NON couvertes par le cycle 1
(reconnexion/backoff, offline queue/outbox, dédup d'events, helpers purs). Deux
audits indépendants confirment : le cœur temps-réel TS reste correct et bien
testé — **aucun défaut de correction (wrong-output)** à corriger.

**Un défaut de HYGIÈNE réel corrigé** (hors « wrong-output », mais fuite mémoire
sur onglet longue durée — pipeline de livraison, Phase 3/9) :

`apps/web/services/socketio/orchestrator.service.ts` — la file d'attente hors-ligne
arme un `setTimeout` par message (`pendingMessageTimeouts`), nettoyé sur le chemin
« traité » (`processPendingMessages`) mais **PAS** sur deux autres chemins de retrait :
1. **Expulsion file pleine** (`MAX_QUEUE_SIZE`) : l'ancien message était `shift`+résolu
   sans `clearTimeout` ni `.delete()` → timer resté armé 2 min, puis, à son
   déclenchement, `indexOf === -1` → le bloc de suppression (dont le `.delete()`)
   était sauté → **entrée de Map orpheline permanente**.
2. **`cleanup()`** : tous les pending résolus sans annuler leurs timers → N timers
   restent armés après teardown, N entrées de Map persistent.

**Fix** : helper `clearPendingTimeout(clientMessageId)` (annule + oublie), appelé
sur les 3 chemins de retrait (traité / expulsé / cleanup) — source unique, la fuite
ne peut plus réapparaître. TDD : 2 tests RED d'abord (`jest.getTimerCount()` +
taille de Map), puis GREEN. Suite orchestrateur 104/104, socketio web 423/423.

## Cycle 3 (2026-07-12) — défaut de robustesse ZMQ corrigé (audio pipeline, Phase 3/5)

Passage ciblé sur des surfaces temps-réel NON couvertes par les cycles 1–2 : le
handler ZMQ `ZmqMessageHandler` (SUB translator→gateway), hors périmètre des audits
précédents (qui couvraient handlers Socket.IO, read-status, MessageProcessor, utils).

**Un défaut de correction réel corrigé (perte permanente de résultat audio) :**

`services/gateway/src/services/zmq-translation/ZmqMessageHandler.ts:341` —
`handleAudioProcessCompleted` déréférençait `event.translatedAudios.map(...)` SANS
garde, alors que la même méthode traite le champ comme optionnel 27 lignes plus haut
(`event.translatedAudios?.length || 0`, :314). Les events sont du JSON non typé parsé
au fil du socket (`JSON.parse`, :98) — le type TS `TranslatedAudioData[]` n'est PAS
une garantie runtime. Sur une frame `audio_process_completed` de transcription seule
(aucune langue cible → `translatedAudios` absent) :
1. `.map()` lève `TypeError` ;
2. le throw remonte au catch de `handleMessage` (:111) qui ne fait que logger →
   `audioProcessCompleted` JAMAIS émis → transcription + audio du message PERDUS ;
3. pire : la clé de dédup `audio_${taskId}` est ajoutée AVANT le `.map()` (:304) →
   tout retry portant le même taskId est silencieusement écarté (:300-302) → **perte
   PERMANENTE**.

**Fix** : `(event.translatedAudios ?? []).map(...)` — aligné sur la défensivité `?.`
déjà présente à :314 ; comportement byte-identique pour les events bien formés.
TDD : 1 test RED d'abord (frame transcription-seule sans `translatedAudios` →
`toHaveLength(1)` échoue car pas d'émission), puis GREEN. Suite ZmqMessageHandler
69/69 verte.

Reste vérifié sain ce cycle (balayage, pas de défaut) : StatusHandler typing fan-out,
AuthHandler room-rejoin/retry, LocationHandler, SocialEventsHandler, MessageHandler
edit/delete/broadcast + `_emitMessageNewByLanguage`, `emitWithSeq`,
`participant-resolver`, `message-payload-filter`, presence/drain/delivery-receipt.

## Cycle 4 (2026-07-28) — contrat d'erreur cassé sur `reaction:request-sync` (Phase 2/11)

Passage ciblé sur le code le plus frais (handlers réactions post/commentaire
modifiés le 2026-07-28), NON couvert par les cycles 1–3. Aucun défaut
wrong-output/data-loss trouvé dans ces surfaces (add/remove/join/leave,
idempotence `unchanged`, ACK==broadcast, fan-out notif `.catch`, dédup
HEART→`post:liked` — tous vérifiés corrects). **Un défaut de contrat d'erreur
réel corrigé** (robustesse boundary, non pinné par test) :

`PostReactionHandler.handleRequestSync` et `CommentReactionHandler.handleRequestSync`
étaient les SEULES méthodes de chaque handler à NE PAS appeler `validateSocketEvent`
avant de passer `data.postId` / `data.commentId` au service. Tous les frères
(`handleAddReaction`, `handleRemoveReaction`, `handleJoinPost`, `handleLeavePost`)
valident d'abord.

Chemin du bug : un client émettant un payload malformé (`{}` → `postId`/`commentId`
`undefined`) atteignait `PostReactionService.validatePostId` /
`CommentReactionService.validateCommentId`, dont le template du message d'erreur
déréférence `postId.substring(0, 20)` AVANT que le message propre ne se forme.
Sur `undefined`, le garde `!postId` est vrai mais l'évaluation du template lève
`TypeError: Cannot read properties of undefined (reading 'substring')` — capturée
par le `try/catch` de la méthode et renvoyée dans l'ACK comme chaîne d'erreur
interne opaque au lieu de l'« Invalid ID format » attendu. Déclenché uniquement
par input INVALIDE (pas de perte de données, pas de crash process), mais le
contrat d'erreur du socket est cassé.

**Fix** : `validateSocketEvent` ajouté en tête des deux `handleRequestSync`
(validate-first, comme les frères). Le schéma `SocketPostReactionRequestSyncSchema`
existait déjà (inutilisé) ; ajout du miroir `SocketCommentReactionRequestSyncSchema`
(`commentId: mongoId`). Le service ne reçoit plus jamais de payload non validé par
ce chemin ; comportement byte-identique pour un `postId`/`commentId` valide.
TDD : 2 tests RED d'abord (`{}` → service NON appelé + erreur de validation propre,
échouait car le service ÉTAIT appelé avec `postId: undefined`), puis GREEN.
Suites : PostReactionHandler 31/31, CommentReactionHandler 17/17 ; balayage de
non-régression socketio+handlers+schemas 37 suites / 592 tests verts.

Non traité (minimal-impact, hors TDD faute de caller atteignable restant) : le
landmine `postId.substring`/`commentId.substring` dans les deux services reste,
mais n'est plus atteignable via ces handlers désormais que la validation boundary
est en place.

## Cycle 5 (2026-08-07) — routage temps-réel du cache web : transcription + suppression (Phases 2/4/5)

Passage ciblé sur `apps/web/hooks/queries/use-socket-cache-sync.ts`, le point de
réconciliation socket→cache du web (1119 lignes, jamais audité par les cycles 1–4 qui
couvraient le gateway et l'orchestrateur socket). **Deux défauts de correction réels
corrigés**, même famille de racine : un handler qui DEVINE la conversation cible au lieu
de la lire là où l'information existe.

### D1 — `handleTranscription` : trois défauts, un type inventé

Le handler était typé contre une forme de payload qui n'existe pas
(`{ messageId, transcription: string, language? }`) au lieu de
`TranscriptionReadyEventData` (`{ messageId, attachmentId, conversationId,
transcription: { text, language, … } }`). Rien ne l'a détecté : la frontière
`meeshySocketIOService.onTranscription(listener: (data: any) => void)` efface le type.
Récidive de la leçon 2026-08-07 #1 (« un mock/type qui invente le contrat protège le bug »),
en version *type* plutôt que *mock*.

1. **Routage** : écriture vers `queryKeys.messages.infinite(conversationId)` — la
   conversation ACTIVE du hook — avec `if (!conversationId) return`. Le socket est joint à
   TOUTES les rooms de l'utilisateur : une note vocale transcrite pendant qu'il lit un
   autre fil visait la mauvaise clé (aucun message ne matche → no-op silencieux), et
   `ConversationLayout` passe `effectiveSelectedId`, **null sur la vue liste**, où la
   transcription était purement jetée. `staleTime: Infinity` ne relit jamais → bulle sans
   transcription jusqu'à un refresh manuel. Violation directe du Prisme (« le prisme
   s'applique à TOUT le contenu — … transcriptions audio … »). Les deux handlers frères
   (`handleTranslation`, `handleAudioTranslation`) portaient DÉJÀ un commentaire explicite
   sur ce trou et avaient été corrigés ; l'étage 1 du pipeline audio était resté en arrière.
2. **Ciblage d'attachment** : la transcription allait au PREMIER attachment audio
   (`mimeType.startsWith('audio/')`) alors que le payload nomme le sien (`attachmentId`).
   Un message à plusieurs notes vocales empilait toutes les transcriptions sur la première
   et laissait les autres définitivement vides.
3. **Langue** : `data.language` n'existe pas (elle est sous `data.transcription`) →
   `transcriptionLanguage` valait `undefined` sur chaque transcription.

Fix : routage par `data.conversationId ?? conversationId`, ciblage par `data.attachmentId`
(le scan mimeType ne survit que comme repli pour un payload sans attachmentId ; un
attachmentId nommé-mais-inconnu ne touche RIEN — mal attribuer est pire que ne pas
afficher), langue depuis `data.transcription.language`, et passage à `messageCacheKeysFor`
pour atteindre aussi l'entrée alias identifiant (l'accueil monte la conversation globale
sous `"meeshy"` — cf. `apps/web/app/page.tsx:34` — tandis que les payloads portent
l'ObjectId résolu).

### D2 — `handleMessageDeleted` : suppression appliquée à la mauvaise conversation

`message:deleted` arrive au hook en **messageId nu** : le gateway émet
`{ messageId, conversationId }` (`MessageDeletedEventData`) mais la couche transport
(`messaging.service.ts:185`) ne relaie que `data.messageId`. Le handler devinait donc la
conversation = la conversation ACTIVE → **toute suppression dans une autre conversation
n'était jamais appliquée** (bulle supprimée toujours affichée, `staleTime: Infinity`).
Le scan de repli (branche « aucune conversation ouverte ») s'arrêtait au premier cache
trouvé (`break`) — une conversation cachée sous ObjectId ET sous alias gardait la 2e copie —
et dérivait l'id de conversation de la **clé de requête**, qui sous alias ne matche aucune
ligne de la liste → aperçu figé sur le message supprimé.

Fix : localisation du message par id sur TOUTES les listes de messages en cache (sur-ensemble
strict de la conversation active ; couvre alias et caches mode-lien), et l'id de conversation
de l'aperçu vient du **message lui-même** (toujours l'ObjectId résolu), jamais de la clé.

### Vérification

TDD stricte : 9 tests RED d'abord (5 transcription, 4 suppression), puis GREEN. Chaque
correctif vérifié par mutation SÉPARÉMENT — routage transcription → 3 rouges, ciblage
attachment → 1, langue → 1, alias → 1, `break` restauré → 1, id depuis la clé → 1.
Le dernier n'était PAS pinné par le premier jet de tests : ajouté après que la mutation
soit passée au vert (application de la leçon 2026-08-07 #5).

Gates : 2 suites `use-socket-cache-sync` 74/74 ; suite web complète **505 suites /
11 660 tests** verte ; `tsc --noEmit` propre sur les fichiers modifiés.

### Relevé, NON traité (décision de périmètre)

Le même trou d'alias (écriture mono-clé `queryKeys.messages.infinite(x)`) subsiste dans
`handleAudioTranslation`, `handleMessageAttachmentUpdated`, `handleAttachmentStatusUpdated`,
`handleMessagePinned`, `handleMessageUnpinned`, `handleLinkMessageNew` — tous no-op sur
l'entrée alias `"meeshy"`. Correctif mécanique (boucle sur `messageCacheKeysFor`), mais 6
handlers d'un coup sans défaut de routage sous-jacent : à traiter en passe dédiée avec
tests par handler. Second-ordre : l'entrée alias n'est peuplée qu'après une visite de
l'accueil dans les 30 min de `gcTime`.

Cause racine amont non traitée (contrat transport) : `messaging.service.ts:185` jette le
`conversationId` de `MessageDeletedEventData`. Élargir la signature `onMessageDeleted`
toucherait tous ses consommateurs ; le scan par id est correct sans changer le contrat.

## Cycle 6 (2026-08-07) — le trou d'alias fermé sur les 6 handlers restants (Phases 2/4/5)

Passe dédiée au suivi explicitement différé par le cycle 5 (« Relevé, NON traité »).
Rien de neuf n'a été défriché : le cycle 5 avait identifié la surface, chiffré le
correctif et décidé de ne pas l'embarquer sans un test par handler. C'est ce que
fait ce cycle.

### Le défaut

Une conversation peut être présente DEUX fois dans le cache React Query : sous son
ObjectId résolu (`/conversations/:id`) et sous son identifiant — l'accueil monte la
conversation globale sous `"meeshy"` (`apps/web/app/page.tsx:34`). Les payloads socket
ne portent JAMAIS que l'ObjectId. Six handlers écrivaient sur la clé unique
`queryKeys.messages.infinite(objectId)` : sur l'entrée alias, `setQueryData` ne trouve
rien à mettre à jour et le write est un no-op silencieux. `staleTime: Infinity` ne
relit jamais → **la bulle de l'accueil reste figée sur l'état pré-événement jusqu'à un
refresh manuel**.

Handlers concernés et symptôme utilisateur sur l'accueil :

| Handler | Événement | Symptôme |
|---|---|---|
| `handleAudioTranslation` | `audio:translation-ready` | l'audio traduit n'apparaît jamais |
| `handleMessageAttachmentUpdated` | `message:attachment-updated` | l'enrichissement asynchrone d'attachment est perdu |
| `handleAttachmentStatusUpdated` | `attachment:status-updated` | les marques listened/watched/viewed/downloaded sont perdues |
| `handleMessagePinned` | `message:pinned` | l'état d'épinglage diverge entre les deux vues |
| `handleMessageUnpinned` | `message:unpinned` | idem, en sens inverse |
| `handleLinkMessageNew` | `link:message:new` | le message d'aperçu de lien n'apparaît jamais |

### Le correctif

Les six passent par `messageCacheKeysFor` — le SSOT « toute liste en cache appartenant
à cette conversation », déjà utilisé par `handleNewMessage`, `handleMessageEdited`,
`handleTranslation` et `handleTranscription`. Le helper renvoie la clé exacte quand elle
existe : c'est un **sur-ensemble strict**, jamais un rétrécissement, donc le chemin
canonique est inchangé par construction. Sa docstring porte désormais la règle pour
tout handler futur.

Un ajustement de second ordre sur `handleAttachmentStatusUpdated` : le timestamp de
consommation était produit par `new Date()` À L'INTÉRIEUR de l'updater. Maintenant que
le write s'évente sur N entrées, cela ferait N horodatages pour UNE consommation — il
est calculé une fois, en amont de la boucle. La cascade de 4 `if` devient une table
action→champ ; le garde `if (!field) return` qu'elle impose n'est pas cosmétique :
sans lui, `{ ...a, [undefined]: ts }` écrit une propriété littérale `"undefined"` sur
l'attachment.

### Vérification

TDD stricte : 6 tests RED d'abord, un par handler, chacun amorçant les DEUX entrées
(ObjectId + alias) et assertant les DEUX. Les 6 ont échoué **uniquement sur l'assertion
alias**, l'assertion canonique passant — la forme exacte du défaut, et le garde de
non-régression du chemin canonique dans le même test. Puis GREEN : 6/6.

Deux tests supplémentaires : dédup `link:message:new` sur l'entrée alias, et le garde
action inconnue (rouge sans `if (!field) return` : `"undefined"` apparaît dans
`Object.keys` des deux entrées).

**Un test écrit puis JETÉ** (leçon 2026-07-31 #5 appliquée à la lettre) : le premier
jet du garde action-inconnue assertait l'identité d'objet (`expect(after[0]).toBe(
before[0])`) pour prouver qu'une action inconnue ne réécrit plus le message. Vu VERT
avec ET sans le correctif → décoratif. Racine : `setData` de React Query passe par
`replaceData` → `replaceEqualDeep` (structural sharing), qui restaure les références
d'origine dès que la donnée est profondément égale — aucune assertion d'identité ne
peut distinguer une réécriture deep-equal. Remplacé par une assertion sur
`Object.keys`, elle observable, et re-vérifiée rouge par mutation.

Gates : 2 suites `use-socket-cache-sync` 83/83 ; suite web complète **505 suites /
11 668 tests** verte ; `tsc --noEmit` propre sur les fichiers modifiés.

### Reste ouvert (inchangé depuis le cycle 5)

- `messaging.service.ts:185` jette le `conversationId` de `MessageDeletedEventData` —
  contrat transport, élargir `onMessageDeleted` touche tous ses consommateurs.
- L'entrée alias n'est peuplée qu'après une visite de l'accueil dans les 30 min de
  `gcTime` — le trou ne se manifeste que dans cette fenêtre.
- `handlePendingMessagesDelivered` et `handleConversationJoinError` ciblent aussi la
  clé unique, mais via `invalidateQueries`/`removeQueries` (sémantique de préfixe et
  d'éviction, pas d'écriture de contenu) : hors périmètre de cette passe, à traiter
  seulement avec un défaut observable à l'appui.

### Candidat identifié pour le cycle 7 (relevé pendant cette passe)

`handleLinkMessageNew` INSÈRE un message, exactement comme `handleNewMessage` — mais
il ne porte pas le repli `landedInCache` que ce dernier documente longuement : quand
aucune entrée de cache n'existe encore (fetch initial en vol, ou conversation jamais
ouverte de la session), l'updater sort sur `if (!old) return old` et le message
d'aperçu de lien est perdu pour de bon, `staleTime: Infinity` ne relisant jamais.
Même classe de perte de données, même fichier, même famille de handlers. Non embarqué
ici : le cycle 5 avait cadré cette passe sur le routage d'alias, et l'ajout demande
son propre test RED (entrée absente → `invalidateQueries` appelée). À vérifier au
préalable : si tout `link:message:new` est doublé d'un `message:new` pour le même
message, le repli existe déjà en amont et le candidat tombe.

---

# Cycle 7 — `link:message:new` : le seul événement des share links n'était pas routable (2026-08-07)

## Demande (routine amélioration continue temps réel)
Reprise du candidat explicitement légué par le cycle 6 (repli `landedInCache`
manquant sur `handleLinkMessageNew`), avec sa précondition à vérifier d'abord :
« si tout `link:message:new` est doublé d'un `message:new`, le candidat tombe ».

## Constats (Phase 1 — audit de la chaîne complète de l'événement)

### Précondition : le candidat NE tombe PAS — et cache un défaut plus grave
Les deux routes REST de share link (`POST /links/:identifier/messages` anonyme et
`/messages/auth` enregistrée) construisent le message puis émettent **uniquement**
`SERVER_EVENTS.LINK_MESSAGE_NEW` vers `conversation:<id>`. Aucun `message:new`
compagnon : cet événement est le seul canal temps réel de ce chemin d'envoi.

### D1 (racine) — la charge utile omet `conversationId`, le seul routage disponible
Socket.IO ne transporte pas le nom de la room côté réception : la charge utile EST
le routage. Or les deux littéraux émis listent `id, content, originalLanguage,
messageType, isEdited, editedAt, deletedAt, replyToId, createdAt, updatedAt,
sender` — ni `conversationId`, ni `senderId`. Côté web, `handleLinkMessageNew`
ouvre sur `const linkConvId = linkMsg.conversationId; if (!linkConvId) return;`.
Le handler sortait donc à sa PREMIÈRE ligne, à chaque événement, depuis toujours.

### D2 (conséquence) — aucun message de share link n'apparaissait en temps réel
Handler mort ⇒ ni insertion dans le cache messages, ni remontée de la conversation
dans les deux caches de liste. Le message n'existait pour les autres participants
qu'après un rechargement manuel — et avec `staleTime: Infinity`, souvent pas même
alors. C'est la même classe de perte que les cycles 5 et 6, mais sur 100 % du
trafic d'un chemin d'envoi, pas sur une fenêtre de cache.

### D3 (le candidat légué, réel mais second) — pas de repli `landedInCache`
Une fois D1 corrigé, l'updater sort toujours sur `if (!old) return old` quand
aucune entrée n'existe encore. `handleNewMessage` documente longuement ce repli ;
son jumeau ne l'avait pas.

### D4 (pourquoi le défaut a survécu) — les tests validaient une coïncidence
Côté gateway, les deux `describe(... socketIO emit)` n'inspectaient jamais l'émission :
la fabrique `makeSocketIOHandler` créait `emit`/`to` en variables locales jamais
exposées, et les tests n'assertaient que `statusCode === 201`. Côté web, le test
« prepends the link message » fabriquait un payload AVEC `conversationId` — une
forme que le serveur n'a jamais envoyée — et le test « ignores link messages
without a conversationId » gravait le défaut en comportement attendu. Récidive de
la leçon 2026-08-03 #2.

### D5 (contrat) — `LinkMessageNewEventData.message: Record<string, unknown>`
Un type qui n'exprime aucun contrat ne peut en faire respecter aucun : rien ne
signalait au gateway qu'il devait fournir `conversationId`.

## Plan
- [x] T1 — RED : exposer les espions `to`/`emit`, asserter `conversationId` + `senderId` sur les 2 routes
- [x] T2 — D1 : les deux littéraux émettent `conversationId` (même valeur que la room) et `senderId`
- [x] T3 — D5 : `LinkMessageNewEventData.message` exige `id`, `conversationId`, `senderId`
- [x] T4 — RED : entrée de cache absente → `invalidateQueries` (web)
- [x] T5 — D3 : repli `landedInCache`, idiome identique à `handleNewMessage`
- [x] T6 — vérification : suites gateway + web complètes ; tsc gateway propre, web au niveau de la référence
- [x] T7 — CHANGELOG (2 changesets : contrat partagé, livraison web)

## Revue
Le candidat légué (D3) était réel, mais la vérification de sa précondition a mis au
jour la racine : le handler qu'il s'agissait de durcir ne s'exécutait jamais. Ajouter
le repli sans corriger D1 aurait produit un correctif intégralement mort — l'ordre
imposé par le cycle 6 (« vérifier d'abord si `link:message:new` est doublé ») est
exactement ce qui l'a évité.

Le correctif tient en deux champs par site d'émission, et sa forme est dictée par la
symétrie : `conversationId` reçoit la MÊME expression que celle qui nomme la room
(`participantShareLink.conversationId` / `shareLink.conversationId`), de sorte qu'un
destinataire route toujours vers la room dont il a reçu le message, sans dépendre du
`select` Prisma.

Vérification par mutation (leçon 2026-07-31 #5) : les 3 tests gateway ont été vus
ROUGES avant le correctif (`Received: undefined` sur `conversationId` et `senderId`,
sur les deux routes) ; le test web `landedInCache` a été vu ROUGE par mutation du
drapeau (`Number of calls: 0`).

Non traité, relevé pour un cycle suivant :
- Le schéma de réponse REST 201 des deux routes déclare `sender: { type: 'null' }`,
  donc `fast-json-stringify` NULLIFIE l'expéditeur dans la réponse rendue à
  l'auteur, et n'expose ni `conversationId` ni `senderId`. Défaut de contrat REST
  distinct du chemin socket traité ici ; demande son propre test RED sur le corps
  sérialisé (les tests actuels lisent `res.json().data.messageId` seulement).
- iOS n'écoute pas `link:message:new` du tout (aucune occurrence dans
  `packages/MeeshySDK` ni `apps/ios`) : les messages de share link n'arrivent pas
  en temps réel sur iOS, indépendamment de D1. Non vérifiable sous Linux.

### Cycle 7 bis — le durcissement de type s'arrêtait aux pass-through web

Complément au cycle 7 : `LinkMessageNewEventData` exige désormais `id`,
`conversationId` et `senderId`, et `messaging.service` type bien ses listeners avec.
Mais `orchestrator.service.ts` et `meeshy-socketio.service.ts` re-déclaraient
`{ message: Record<string, unknown> }` dans de **purs pass-through** — deux méthodes
qui ne font que déléguer — ré-élargissant le type juste après le seul étage qui
l'appliquait. Le contrat durci n'atteignait donc jamais le consommateur qui en dépend.

Les deux passent au type partagé. Violation directe de la règle SSOT du projet (un
type partagé re-déclaré localement), et le genre de duplication qui rend un
durcissement de contrat inopérant sans que rien ne le signale.

Note de collision : ce cycle a été mené en parallèle d'une autre session de la
routine qui a corrigé le même défaut (PR #2612, mergée en premier). Sa version est un
sur-ensemble de la mienne côté gateway et types partagés — `senderId` en plus du
`conversationId`, et le repli `landedInCache` de `handleLinkMessageNew` que le cycle 6
avait laissé ouvert. Résolution du merge en faveur de la sienne partout où les deux se
recouvrent ; seuls les deux pass-through web, qu'elle ne touchait pas, subsistent.

---

## Cycle 8 — le corps REST 201 des deux routes de lien de partage

Repris du legs du cycle 7 : « le schéma de réponse 201 des deux routes déclare
`sender: { type: 'null' }` ». Vérifié, réel, et plus large que ce qui avait été
relevé.

### D1 (racine) — le payload était construit DEUX fois par route

Chaque route bâtissait le même message en deux littéraux jumeaux : un pour l'emit
`link:message:new`, un pour le corps 201. C'est cette duplication qui a produit le
défaut : le cycle 7 a ajouté `conversationId` et `senderId` au littéral SOCKET, et
le jumeau REST est resté en arrière. L'auteur d'un message n'avait donc aucun moyen
de router son propre message, alors que tous les autres participants le recevaient
correctement routé — le correctif du cycle 7 n'avait couvert qu'un des deux tuyaux.

### D2 — fast-json-stringify tronquait 11 champs en silence

Les deux schémas 201 nommaient 5 propriétés pendant que les routes en produisaient
15. `conversationId`, `senderId`, `isEdited`, `editedAt`, `deletedAt`, `replyToId`,
`updatedAt`, `location` et l'essentiel de `sender` disparaissaient à la
sérialisation. Aucune erreur, aucun log : la propriété non déclarée est simplement
absente. Le fichier `api-schemas.ts` documentait déjà ce piège pour l'aperçu de
conversation (« Absent du schéma = tronqué en silence ») — même piège, autre
surface.

### D3 — `sender: { type: 'null' }` (route anonyme)

Le cas le plus dur : la route charge le `Participant` via `include`, puis le schéma
le sérialise en `null` littéral. `use-anonymous-messages.ts` lit exactement
`message.sender` pour bâtir le message optimiste de l'auteur, qui n'avait donc
jamais d'expéditeur. Défaut visible à l'écran, pas seulement sur le fil.

### D4 — `messageSenderSchema` ne décrit pas un participant (route auth)

Le jumeau authentifié utilisait `messageSenderSchema`, qui décrit un *utilisateur*
(username / firstName / isMeeshyer). L'expéditeur d'un message de lien est un
`Participant` : seule l'intersection (`id`, `displayName`, `avatar`) passait,
`userId`, `type`, `language` et le `user` imbriqué étaient effacés — alors que le
chemin socket les livre depuis toujours.

### D5 (pourquoi le défaut a survécu) — récidive exacte de D4 du cycle 7

Les 3 suites de test mockaient `routes/links/types` avec des stand-ins permissifs
(`messageSenderSchema: { type: 'object', additionalProperties: true }`), ce qui fait
échoter à fast-json-stringify tout ce que la route lui passe : un schéma tronquant
restait indiscernable d'un schéma correct. Et aucun test ne lisait `data.message` —
seulement `data.messageId` et le statut. Les 3 mocks passent désormais par
`jest.requireActual`, ne stubbant que le `parse` Zod.

## Plan
- [x] T1 — RED : mocks de types réels (`requireActual`) dans les 3 suites
- [x] T2 — RED : 5 assertions × 2 routes sur le corps 201 sérialisé (routage, sender, lieu, enveloppe d'édition, égalité avec le payload socket)
- [x] T3 — D1 : `buildLinkMessagePayload`, un seul objet pour l'emit et la réponse
- [x] T4 — D2/D3/D4 : `linkMessageSchema` + `linkMessageSenderSchema` uniques, partagés par les 2 routes
- [x] T5 — `sharedPlaceResponseSchema` dans `@meeshy/shared`, les 2 copies inline le reprennent
- [x] T6 — gates : suites gateway, `tsc --noEmit` gateway + shared
- [x] T7 — CHANGELOG (2 changesets)

## Revue

L'assertion qui porte le correctif est la dernière : *le corps 201 est égal au
payload socket*. Les quatre autres décrivent des symptômes ; celle-ci nomme
l'invariant, et elle est ce qui rendrait un futur ajout au seul littéral socket
immédiatement rouge. C'est aussi elle qui a dicté la forme du correctif — un
`buildLinkMessagePayload` unique rend la divergence impossible à écrire, là où
recopier le champ manquant l'aurait seulement repoussée d'un cycle.

Vérification par mutation (leçon 2026-07-31 #5) : les 10 tests ont été vus ROUGES
avant correctif, avec le diff exact des 11 champs supprimés et `sender` à `null`.

Non traité, relevé pour un cycle suivant :
- `anonymous-chat.service.ts:119` déclare `sendMessage(): Promise<Message>` mais
  retourne `result.data`, qui est `{ messageId, message }` — pas un `Message`.
  `use-anonymous-messages.ts` compense par un double cast
  (`result as unknown as Record<string, unknown>`) lisant les DEUX formes. Le type
  ment ; le cast le cache. Correction côté web, hors périmètre gateway de cette
  passe.
- `sendMessageBodySchema` ne déclare ni `clientMessageId` ni `replyToId`, que les
  deux routes lisent pourtant depuis le corps. Sans `additionalProperties: false`
  ils passent, donc pas de défaut observable aujourd'hui — mais le schéma ne
  documente pas le contrat d'entrée réel.
- iOS n'écoute toujours pas `link:message:new` (inchangé depuis le cycle 7).

---

## Cycle 9 — le repli d'envoi de l'expéditeur anonyme ne pouvait pas s'authentifier

Repris du legs du cycle 8 : « `anonymous-chat.service.ts:119` déclare
`sendMessage(): Promise<Message>` mais retourne `{ messageId, message }` ». Le
mensonge de type était réel, mais en cherchant qui l'appelait on trouve mieux :
personne. Et cette absence d'appelant EST le défaut.

### D1 (racine) — un repli REST que l'expéditeur anonyme ne peut pas emprunter

Quand l'ack de `message:send` revient en erreur (pas en timeout) et que la socket
tient toujours, `MessagingService.sendMessageViaRest` renvoie l'envoi sur
`POST /conversations/:id/messages`, qui s'authentifie au JWT. Un participant
anonyme n'en a pas : son jeton est un `anon_<ts>_<hex>` (`routes/anonymous.ts:37`),
que `apiService` place en `Authorization: Bearer` — sans jamais émettre
`X-Session-Token` (`buildHeaders`, `api.service.ts:92`). Le middleware unifié le
traite donc en JWT, `jwt.verify` échoue, 401. Le chemin de récupération ne
récupérait rien : pour un anonyme, une erreur d'ack = message perdu, sans seconde
chance.

Sa route existe pourtant — `POST /links/:identifier/messages`, authentifiée par
`X-Session-Token` — et son enveloppe client aussi : `AnonymousChatService.sendMessage`,
que le cycle 8 avait justement durcie côté serveur. Elle n'était appelée que par
un hook mort.

### D2 — le cid était forgé sur place, donc la réconciliation était impossible

`sendMessage` appelait `generateClientMessageId()` en interne au lieu d'accepter
celui de l'appelant. Brancher le repli tel quel aurait troqué un message perdu
contre un message DOUBLÉ : la ligne optimiste est indexée par cid
(`clientMessageIdOf`, `mergePendingLocalMessages`), un cid neuf ne matche rien.

### D3 — la route ne rendait pas le cid non plus

Symétrique, côté gateway : les deux routes PERSISTENT `body.clientMessageId`
(`message.create`) mais `buildLinkMessagePayload` ne le reportait dans aucun des
deux tuyaux. Même en corrigeant D2, la réponse 201 n'aurait rien eu à réconcilier.
Le chemin nominal tranche déjà ce contrat (Phase 4 §6.2) et le tranche en DEUX :
cid conservé pour l'auteur, `stripClientMessageId` pour les pairs, afin qu'un tiers
n'apprenne pas l'espace d'ids de la file de l'expéditeur. Les routes de lien
suivent désormais la même règle via le même helper.

### D4 — le hook mort qui cachait D2 et D1

`use-anonymous-messages.ts` : zéro import dans tout le dépôt. C'est lui qui
portait le double cast (`result as unknown as Record<string, unknown>`) lisant les
deux formes à l'aveugle — un cast qui rendait le mensonge de type invisible, et
dont la mort rendait invisible l'absence de tout repli anonyme. Supprimé.

### D5 (pourquoi c'était indétectable) — le test encodait le mensonge

`anonymous-chat.service.test.ts` moquait `data` par un `Message` nu, la forme que
la route ne rend pas. La suite s'accordait donc avec une signature qu'aucun
serveur ne satisfaisait. Fixture remise sur `{ messageId, message }`.

## Plan
- [x] T1 — RED gateway : le corps 201 porte le cid (2 routes) ; le payload socket ne le porte pas
- [x] T2 — D3 : `buildLinkMessagePayload` rend le payload de l'AUTEUR ; `stripClientMessageId` en dérive celui des pairs
- [x] T3 — `stripClientMessageId` générique et préservant (le retour `Record<string, unknown>` ré-élargissait l'emit typé du cycle 7)
- [x] T4 — `clientMessageId` déclaré dans `linkMessageSchema` (sinon fast-json-stringify le tronque) et dans `sendMessageBodySchema`
- [x] T5 — `LinkMessagePayload` + `LinkMessageSendResponseData` dans `@meeshy/shared`
- [x] T6 — RED web : le repli anonyme passe par la route de lien, jamais par la route JWT ; il porte le cid de l'appelant
- [x] T7 — D1/D2 : `canSendViaLink()` + `sendMessageViaLinkRest`, signature en objet d'options, type de retour réel
- [x] T8 — D4/D5 : hook mort supprimé, fixtures du service remises sur la forme réelle
- [x] T9 — gates : suites gateway + web, `tsc --noEmit` gateway/shared propres, web au niveau de la référence (1610 = 1610)
- [x] T10 — CHANGELOG (2 changesets)

## Revue

Le legs du cycle 8 nommait un mensonge de type ; la question qui a payé n'est pas
« ce type est-il faux ? » mais « qui l'appelle ? ». La réponse — personne — a
transformé une correction cosmétique en défaut de livraison : le repli d'envoi
n'existait pas pour la moitié anonyme des expéditeurs, et le code qui l'aurait
servi dormait dans le dépôt, mort, à côté.

La forme du correctif est dictée par une règle déjà tranchée ailleurs. Le cid
revient à son auteur, jamais à un tiers : le chemin nominal l'énonce et
l'implémente, les routes de lien l'ignoraient. Reprendre `stripClientMessageId`
plutôt que réécrire la règle est ce qui garantit qu'un futur changement de
politique se fasse en un seul endroit — et c'est en le réutilisant qu'on a
découvert que ce helper détruisait le typage de tout payload qui le traversait,
ré-élargissant précisément le contrat que le cycle 7 avait durci.

Vérification par mutation (leçon 2026-07-31 #5) : les 2 tests gateway « echoes
the clientMessageId » vus ROUGES avant correctif (`Received: undefined`, 2
routes) ; le retrait de `stripClientMessageId` fait tomber 4 tests (fuite du cid
aux pairs + égalité modulo) ; le court-circuit de `canSendViaLink()` fait tomber
les 3 tests web du repli anonyme.

Non traité, relevé pour un cycle suivant :
- **`replyToId` n'est lu par aucune des deux routes de lien.** Le client l'envoie
  (`AnonymousChatService.sendMessage` le place dans le corps), `sendMessageSchema`
  ne le déclare pas, `message.create` ne l'écrit pas, et le payload le renvoie
  toujours `null` depuis la ligne créée. Une réponse envoyée par un anonyme perd
  donc son lien de réponse, en socket comme en REST. Demande une validation
  serveur (le message cité doit appartenir à la même conversation) — c'est ce qui
  l'a maintenu hors de cette passe.
- **Le repli REST ne couvre toujours pas les pièces jointes anonymes.**
  `sendMessageViaLinkRest` ignore `attachmentIds` : `sendMessageSchema` accepte
  `attachments`, mais le contrat entre les deux n'a pas été vérifié.
- **`/chat/[id]` ne monte jamais `useSocketCacheSync`.** `link:message:new` est
  bien écouté au niveau service (`messaging.service.ts:208`), mais son unique
  consommateur vit dans `ConversationLayout` (chemin authentifié). Un anonyme sur
  `BubbleStreamPage` ne reçoit donc QUE `message:new` ; tout message posté par la
  route REST de lien (iOS, API tierce) lui est invisible en temps réel.
- iOS n'écoute toujours pas `link:message:new` (inchangé depuis le cycle 7).

---

## Cycle 9 bis — le budget de réessai que la file ne pouvait pas dépenser

Mené en parallèle du cycle 9 ci-dessus, par une autre session de la routine, sur
un défaut disjoint. Renuméroté « bis » car le cycle 9 a été mergé en premier.

Phase 3 (pipeline de remise). Les trois legs du cycle 8 ont été réexaminés
d'abord. Sur le premier — le mensonge de type de
`anonymous-chat.service.sendMessage` — cette passe a conclu « défaut sans chemin
vivant » au motif que son seul appelant, `use-anonymous-messages.ts`, n'a aucun
consommateur. **Conclusion fausse, et le cycle 9 ci-dessus montre pourquoi** :
l'absence d'appelant N'ÉTAIT PAS l'atténuation du défaut, elle en était le
défaut — le repli REST de l'expéditeur anonyme n'avait aucun tuyau capable de
s'authentifier. Leçon : « personne n'appelle ce code » n'est pas une preuve
d'innocuité ; c'est une question sur ce qui aurait dû l'appeler.

`sendMessageBodySchema` reste sans défaut observable ; iOS/`link:message:new`
n'est pas vérifiable sous Linux. Le défaut traité ici a été trouvé ailleurs, sur
un chemin vivant : le rejeu automatique des messages en échec.

### D1 (racine) — un balayage par transition de connexion, jamais plus

`useAutoRetryFailedMessages` annonce `MAX_RETRY_COUNT = 3` tentatives
automatiques espacées de `RETRY_DELAY_MS`. Il ne pouvait en dépenser qu'**une**.

L'effet est clé sur `[isReady, rearm]`. Il prend un instantané de la file, la
balaie une fois, et ne se ré-arme que s'il s'est arrêté *tôt* (bascule de
`isReady` en cours de vidange). Un balayage mené à son terme avec des messages
encore en file ne ré-armait rien — et `isReady` valait déjà `true`, donc plus
aucune dépendance ne changerait jamais. Sur une connexion qui ne tombe pas, un
message dont l'envoi échoue pour une raison transitoire recevait exactement un
réessai puis restait là : ni remis, ni marqué épuisé, `retryCount` figé à 1, son
budget restant indépensable. La seule façon d'acheter une 2e tentative était de
perdre la connexion et de la retrouver — précisément la condition que la
fonctionnalité existe pour traverser *sans* qu'on ait à la subir.

### D2 — le travail arrivé derrière un balayage en vol était orphelin

Même racine, autre symptôme : un message qui échoue *pendant* la vidange n'est
pas dans l'instantané de ce balayage, et rien n'en planifiait un autre.

### D3 (pourquoi le défaut a survécu) — un store gelé rend le 2e balayage invisible

Les 18 tests existants pilotaient le hook avec `makeStore`, dont les actions
(`incrementRetryCount`, `removeFailedMessage`) sont des `jest.fn()` qui
enregistrent l'appel **sans jamais modifier `failedMessages`**. Contre un
instantané gelé, « la file a été balayée deux fois » et « la file n'a été
balayée qu'une fois » produisent exactement les mêmes assertions : le défaut
était structurellement inobservable. Le test le plus proche — *allows a new
flush once the previous one has finished* — achète sa 2e tentative par une
reconnexion, donc il documentait la limite au lieu de la signaler.

Le correctif : un balayage se ré-arme aussi lorsqu'il a vidé son instantané mais
que le store doit encore des tentatives. Terminaison par le budget, pas par le
temps — chaque passe incrémente `retryCount` pour chaque message tentée, donc
elle réduit strictement le budget restant et la condition de ré-armement devient
fausse après au plus `MAX_RETRY_COUNT` passes.

## Plan
- [x] T1 — RED : `makeLiveStore`, un double du store zustand qui applique vraiment ses mises à jour
- [x] T2 — RED : budget entier dépensé sur une connexion stable (3 envois + `Max retries exceeded`)
- [x] T3 — RED : un message mis en file pendant un balayage en vol finit par partir
- [x] T4 — garde anti-spin : une file vidée cesse d'être balayée (verte avant ET après — c'est son rôle)
- [x] T5 — GREEN : ré-armement sur `!drained || hasRetryableWork()`
- [x] T6 — gates : suite web complète 505/505 (11 673 tests), `tsc --noEmit` sans erreur sur les fichiers touchés
- [x] T7 — changeset

## Revue

L'assertion qui porte le correctif est *spends the whole retry budget on a
connection that never drops* : elle nomme l'invariant (le budget est dépensable
sans reconnexion) là où les autres décrivent des symptômes. C'est aussi elle qui
a dicté la forme du correctif — ré-armer sur l'état réel de la file rend le
budget dépensable par construction, alors qu'une boucle `for` de 3 tours à
l'intérieur du balayage aurait ignoré D2 et rendu la vidange non interruptible.

Note d'outillage : le ré-armement passe par un `setState` appelé depuis un
callback asynchrone. Sous faux timers, un seul `advanceTimersByTimeAsync` ne peut
observer qu'un balayage — React n'intègre la mise à jour qu'au `flush` d'`act`,
et le balayage suivant est un timer qui n'existait pas pendant l'avance. D'où
l'helper `settle()`, qui alterne `act` et avance du temps. Un test écrit avec une
seule avance serait resté rouge en donnant l'impression que le correctif ne
fonctionne pas.

Vérification par mutation (leçon 2026-07-31 #5) : le correctif retiré
(`if (!drained)`), les 2 tests de comportement repassent ROUGES — 1 envoi au lieu
de 3, et le message mis en file en vol jamais envoyé — tandis que la garde
anti-spin reste verte, ce qui est exactement son rôle.

Non traité, relevé pour un cycle suivant :
- ~~`use-anonymous-messages.ts` est du code mort~~ — traité par le cycle 9
  ci-dessus, qui a supprimé le hook et câblé `AnonymousChatService.sendMessage`
  au repli REST auquel il manquait.
- Le hook ne rejoue la file qu'en présence d'un montage de `ConversationLayout`.
  Une session ouverte sur une autre route ne vide jamais sa file — à confirmer
  avant d'en faire un défaut.
- `sendMessageBodySchema` et iOS/`link:message:new` : inchangés depuis le cycle 8.

## Cycle 11 — la remise à zéro qui rembobinait le compteur de synchronisation

Phase 2 (versioning d'événements / résolution de conflits), sur l'état
per-utilisateur d'une conversation — surface non défrichée par les cycles 2 à 10.

### D1 (racine) — le compteur monotone vit sur la ligne, et le reset supprime la ligne

`UserConversationPreferences.version` est déclaré **monotone** par le schema
Prisma lui-même : « Monotonic version for optimistic-concurrency resolution […]
clients drop incoming payloads whose `version` is <= their local snapshot ». Le
SDK iOS applique la règle à la lettre (`ConversationStore.applyRemote` :
`event.version <= conv.userState.version → return`, le `reset` **conservant** la
version reçue).

`DELETE /user-preferences/conversations/:id` diffusait un reset porteur de
`version = ligne.version + 1`, **puis supprimait la ligne**. Le `PUT` suivant
retombait donc dans la branche `create` de son `upsert` et repartait à
`version: 1` — sous le plancher que les autres appareils venaient d'enregistrer.
Après une remise à zéro, le premier épinglage/sourdine/archivage était appliqué
**localement seulement** ; les autres sessions le jetaient, et tous les suivants
avec lui (chaque version restant sous le plancher), jusqu'à un refetch complet
fortuit. Divergence **permanente**, pas différée.

### D2 (pourquoi ça a survécu) — une paire dont un seul sens a été audité

Le commentaire de la branche `create` nomme exactement l'invariant… dans l'autre
sens : `version: 1` y est justifié pour que le payload de reset (qui porte
`version = existante + 1`) ne soit jamais pris pour un « create no-op » périmé.
L'auteur a donc raisonné sur create → delete, jamais sur delete → create — les
deux sens d'une même paire, un seul vérifié (récidive de la leçon 84 : toute
transition a une inverse, auditer les DEUX).

### D3 (pourquoi les tests ne pouvaient pas le voir) — des mocks figés rejouent la version du test

Les deux tests d'émission du DELETE stubbaient `findUnique → { version: 7 }` et
`delete → {}`. Contre des résolutions figées, la version émise est celle que
l'auteur du test a codée en dur : la monotonie est une propriété d'une
**séquence** de requêtes, structurellement inobservable sur des mocks qui
n'appliquent pas leurs écritures. Le troisième test — « DELETE sur une
conversation jamais personnalisée émet quand même version >= 1 » — était en
outre fictif : sans ligne, `delete` lève P2025 et la route répond 404, jamais 200.

### D4 (corollaire) — l'instantané par défaut était incomplet

`CONVERSATION_PREFERENCES_DEFAULTS` omettait `mentionsOnly` et
`clearHistoryBefore`, deux colonnes pourtant présentes dans le payload diffusé
(`ConversationPreferencesPayload`) et dans le modèle. Un reset écrit à partir de
cette constante aurait laissé `mentionsOnly: true` en base pendant que les
clients appliquaient `false`.

## Plan
- [x] T1 — RED : double de store **vivant** (applique ses écritures) + séquence épingle → sourdine → reset → ré-épingle
- [x] T2 — RED : les colonnes de préférence reviennent aux défauts après reset
- [x] T3 — GREEN : le reset restaure les défauts **en place** avec `version: { increment: 1 }` (écriture atomique unique)
- [x] T4 — D4 : `mentionsOnly` + `clearHistoryBefore` ajoutés à la constante de défauts
- [x] T5 — réécriture des 2 tests d'émission figés sur le store vivant, suppression du cas fictif
- [x] T6 — gates : suite gateway complète + `tsc --noEmit` propre
- [x] T7 — changeset + CHANGELOG

## Revue

Le correctif ne consiste pas à choisir une plus grande valeur de départ pour le
`create` (aucune valeur ne peut être supérieure à un plancher que le serveur a
justement oublié) : il consiste à **cesser de détruire l'état de protocole**.
`version` n'est pas une préférence utilisateur — c'est la séquence de diffusion.
Une remise à zéro remet à zéro les préférences ; elle n'a aucune raison de
rembobiner le compteur qui garantit que la remise à zéro elle-même sera vue.

L'écriture unique (`update` avec `{ increment: 1 }`) remplace un
`findUnique` puis `delete` : la course lecture-puis-écriture de l'ancien chemin
(un `upsert` concurrent pouvait s'intercaler entre les deux) disparaît sans
coût. Contrat REST inchangé : ligne absente → P2025 → 404, comme avant.

Vérification par mutation (leçon 2026-07-31 #5) : les 3 tests de comportement
ont été vus ROUGES avant le correctif — `1` émis après un reset à `3`, et la
ligne introuvable après le reset. Le test « 404 sur une conversation sans
préférences » était vert avant ET après : c'est son rôle, il verrouille le
contrat qu'on ne voulait pas changer.

Non retenu : faire du DELETE une opération idempotente (200 sur une ligne
absente). Ce serait plus RESTful, mais c'est un changement de contrat public
sans défaut observable pour le motiver.

Non traité, relevé pour un cycle suivant :
- **`routes/user-deletions.ts` écrit deux colonnes versionnées sans version ni
  diffusion.** `delete-for-me`, `restore-for-me` et `clear-history` mutent
  `deletedForUserAt` / `clearHistoryBefore` — tous deux membres de
  `ConversationPreferencesPayload` et appliqués par `ConversationStore.applyRemote`
  — sans incrémenter `version` ni émettre `USER_PREFERENCES_UPDATED`. Les autres
  appareils ne convergent qu'au prochain changement de préférence ou refetch.
  Atténuation : ces routes sont montées sous `/api/...` (préfixe vide) alors que
  les clients appellent la variante `/api/v1/conversations/:id/delete-for-me`
  (`routes/conversations/delete-for-me.ts`), qui s'appuie sur
  `Participant.deletedForMe` et diffuse bien `conversation:deleted`. **Deux
  implémentations du même geste produit, sur deux colonnes différentes** — à
  arbitrer (supprimer la legacy ou la brancher) avant de corriger.
- **Le scope communauté de `user:preferences-updated` n'est pas routé côté iOS.**
  Le gateway émet trois formes sous ce nom (catégorie, conversation, communauté)
  mais `MessageSocketManager` ne discrimine que deux branches (`conversationId`
  présent → conversation, sinon → catégorie) : un payload communauté échoue au
  décodage et est droppé. Sans conséquence tant qu'iOS n'affiche pas les
  préférences de communauté — à traiter avec cette fonctionnalité.
- **`POST /user-preferences/reorder` est un no-op silencieux sans ligne
  existante** (`updateMany`), alors que le client applique l'ordre de façon
  optimiste et reçoit un 200. À confirmer : une conversation réordonnée a-t-elle
  toujours une ligne (elle en a une dès qu'elle est catégorisée) ?

---

## Cycle 12 (2026-08-08) — arbitrage « delete-for-me », demandé par le cycle 11

Le cycle 11 avait laissé ouvert : « `routes/user-deletions.ts` écrit `deletedForUserAt`
sans incrémenter `version` ni diffuser. C'est aussi une seconde implémentation du
même geste produit que `routes/conversations/delete-for-me.ts`. Nécessite un
arbitrage — supprimer le chemin legacy ou le câbler — avant d'être corrigé. »

### Ce qui a été corrigé dans ce cycle
Le contrat de synchronisation (incrément de `version` + diffusion `USER_PREFERENCES_UPDATED`)
est désormais porté par un écrivain unique `writeConversationPreferences`, emprunté par
les quatre sites de mise à jour de `UserConversationPreferences`. Voir `tasks/todo.md`
(entrée 2026-08-08) et le CHANGELOG.

### L'arbitrage, avec les faits qui le tranchent
Les deux implémentations ne sont pas deux copies : ce sont **deux colonnes différentes**,
et la paire supprimer/restaurer est câblée en travers.

| | `routes/conversations/delete-for-me.ts` | `routes/user-deletions.ts` |
|---|---|---|
| URL | `/api/v1/conversations/:id/delete-for-me` (`API_PREFIX`) | `/api/conversations/:id/delete-for-me` (prefix `''`, `/api/` en dur) |
| Écrit | `Participant.deletedForMe = now`, `isActive = false` | `UserConversationPreferences.deletedForUserAt` |
| Transfert de propriété (creator) | oui | non |
| Éviction des sockets de la room | oui | non |
| Invalidation des caches participant | oui | non |
| Diffusion | `conversation:deleted` → `user:<id>` | `user:preferences-updated` (depuis ce cycle) |
| Appelé par un client | **oui** — iOS `ConversationService.deleteForMe` (`MeeshyConfig.defaultApiPath = "/api/v1"`) | **aucun** (ni iOS ni web) |

**Le fait décisif : `GET /conversations` filtre sur `Participant.deletedForMe`
(`core.ts`, clause `OR: [{ deletedForMe: null }, { deletedForMe: { isSet: false } }]`),
jamais sur `deletedForUserAt`** — qu'il se contente de *sélectionner* et d'expédier au
client (`conversationUserPreferencesSelect`). Conséquences :

1. Le seul `delete-for-me` réellement emprunté n'écrit **jamais** `deletedForUserAt`.
2. Or `POST /api/conversations/:id/restore-for-me` **lit** `deletedForUserAt` : après la
   suppression que les clients effectuent vraiment, il répond invariablement
   `400 "Conversation is not deleted"`. La restauration est **structurellement
   impossible** — la paire supprimer/restaurer opère sur deux colonnes distinctes.
3. Même racine pour `GET /api/user/deleted-conversations` : il interroge
   `deletedForUserAt: { not: null }`, donc renvoie **toujours une liste vide**.

C'est la leçon 84 (« toute transition d'état a une inverse : auditer les DEUX sens »)
sous une forme plus dure : ici l'inverse n'est pas incomplète, elle vise une autre
colonne que l'aller.

### Recommandation
`Participant.deletedForMe` est la source de vérité : c'est ce que la requête de liste
filtre, ce que le client appelle, et le seul chemin qui fasse le travail complet
(succession du créateur, éviction des sockets, invalidation des caches, diffusion
`conversation:deleted`). `UserConversationPreferences.deletedForUserAt` en est une
représentation seconde et plus faible, actionnable par le client seul.

Trois suites possibles, par ordre de préférence :
1. **Reconstruire `restore-for-me` contre `Participant.deletedForMe`** — remettre
   `deletedForMe: null`, `isActive: true`, **rejoindre la room AVANT de diffuser**
   (leçon 84 #3 : l'ordre porte le contrat), invalider les mêmes caches que l'aller ;
   `GET /api/user/deleted-conversations` interroge la même colonne. Idem pour la trio
   conversation de `user-deletions.ts`, qui doit alors déléguer au mécanisme unique.
2. Retirer les trois routes conversation de `user-deletions.ts` et la colonne
   `deletedForUserAt` si le produit ne veut pas de restauration.
3. Statu quo — non recommandé : deux endpoints publics documentés qui ne peuvent pas
   fonctionner ensemble.

**Non fait dans ce cycle, délibérément.** (1) comme (2) changent le comportement
observable d'API publiques (sémantique de restauration, ou retrait d'endpoints) sur la
base d'un choix de colonne canonique qui est une décision produit. L'arbitrage demandé
par le cycle 11 est ici tranché sur les faits ; l'exécution demande une validation
humaine, pas une passe non surveillée.

### Suivis du cycle 11 encore ouverts
- Le scope **communauté** de `user:preferences-updated` n'est pas routé côté iOS
  (`MessageSocketManager` ne discrimine que deux des trois formes émises).
- `POST /user-preferences/reorder` est un no-op silencieux quand aucune ligne n'existe
  (`updateMany`), alors que le client applique l'ordre optimistiquement et reçoit `200`.
- Nouveau : `ConversationStore.dispatchPreferencesUpdate` (iOS) traite
  `.setClearHistoryBefore` comme un succès purement local sans appeler la route
  (« until the server endpoint is wired ») alors que `POST /clear-history` existe.

---

## Cycle 13 (2026-08-08) — le réordonnancement qui promettait sans écrire

Suivi direct de la liste laissée ouverte par le cycle 11, reconduite par le cycle 12 :
« `POST /user-preferences/reorder` est un no-op silencieux sans ligne existante
(`updateMany`), alors que le client applique l'ordre de façon optimiste et reçoit
un `200`. À confirmer : une conversation réordonnée a-t-elle toujours une ligne ? »

**Confirmé, et la réponse est non.**

### D1 (racine) — `updateMany` ne matche rien, et ne le dit pas

```ts
await Promise.all(updates.map(u =>
  prisma.userConversationPreferences.updateMany({
    where: { userId, conversationId: u.conversationId },
    data: { orderInCategory: u.orderInCategory },
  })));
broadcastToUser(fastify, userId, USER_PREFERENCES_REORDERED, { userId, updates });
return sendSuccess(reply, { message: 'Conversations reordered successfully' });
```

La ligne `UserConversationPreferences` n'existe qu'à partir du premier
épinglage / sourdine / renommage / catégorisation. Avant cela, `updateMany`
matche zéro document — sans erreur, sans 404, sans que le `count` retourné soit
lu. La route répondait `200` et diffusait le nouvel ordre à `user:<id>` dans
tous les cas.

Les deux clients appliquent l'ordre **optimistiquement** et lisent ce `200`
comme le commit : iOS `ConversationStore.reorderConversations` ne restaure son
instantané que sur une erreur ; web `UserPreferencesService.reorderInCategory`
se contente d'invalider son cache. Tous les appareils affichaient donc — de
façon cohérente entre eux, ce qui rend le défaut d'autant plus difficile à
soupçonner — un ordre que le serveur ne détenait pas, jusqu'à ce qu'un refetch
complet (`GET /conversations`, `orderInCategory: null`) le fasse revenir en
arrière.

### D2 — le dernier écrivain hors du module d'écriture unique

Le cycle 12 avait créé `conversationPreferencesSync.writeConversationPreferences`
précisément pour qu'aucun écrivain de cette ligne ne puisse n'honorer qu'une
partie du contrat. Le réordonnancement était le seul `prisma.userConversationPreferences.*`
restant en dehors — et il n'honorait ni « persister », ni « diffuser ce qui a
été persisté ».

### D3 (pourquoi ça a survécu) — un mock figé, et un test qui assertait le défaut

Les suites existantes stubbaient `updateMany: jest.fn(async () => ({ count: n }))`.
Contre une résolution qui n'écrit rien, « la ligne a été écrite » et « rien n'a
été écrit » produisent exactement les mêmes assertions : le défaut était
structurellement inobservable — la même racine que les cycles 10 (store gelé) et
11 (versions codées en dur).

Pire, le test le plus proche s'appelait *updates each conversation independently
**via updateMany*** et vérifiait l'appel à `updateMany` : il verrouillait
l'implémentation défectueuse au lieu de la signaler. Réécrit en assertion de
comportement.

### D4 (corollaire du correctif) — passer à l'`upsert` ouvre ce que le no-op fermait

Aucune des routes de préférences ne vérifie l'appartenance à la conversation
(le `PUT` non plus). Tant que l'écriture était un `updateMany`, ça n'avait pas de
conséquence : il ne matchait rien, pour personne. Un `upsert` non restreint,
lui, laisserait tout appelant authentifié créer des lignes de préférences
contre des ids de conversation arbitraires. Le lot est donc d'abord restreint
aux conversations dont l'appelant est participant **actif** — le même filtre que
`GET /conversations`.

## Plan
- [x] T1 — RED : ordre persisté pour une conversation sans ligne (lu via `GET`, pas via le mock)
- [x] T2 — RED : réordonner ne perturbe pas les autres colonnes de la ligne
- [x] T3 — RED : rien n'est écrit ni diffusé pour une conversation dont l'appelant n'est pas participant
- [x] T4 — RED : la diffusion ne contient que ce qui a été écrit (lot mixte)
- [x] T5 — RED : lot vide / entièrement inapplicable → aucune diffusion
- [x] T6 — RED : ids répétés dans un lot → dernière position gagnante, un seul `upsert`
- [x] T7 — verrou : `version` ne bouge pas (vert avant ET après — c'est son rôle)
- [x] T8 — GREEN : `reorderConversationPreferences` dans le module d'écriture unique
- [x] T9 — réécriture des 2 tests couplés à `updateMany`, mocks `participant` ajoutés
- [x] T10 — gates : suite gateway complète + `tsc --noEmit` propre
- [x] T11 — changeset + CHANGELOG

## Revue

Le correctif ne consiste pas à faire remonter un `count` pour le vérifier :
`count === 0` ne distingue pas « pas de ligne » de « ligne déjà à cette
position ». Il consiste à écrire ce que la route prétend écrire (`upsert`), puis
à **ne diffuser que ce qui l'a été**. C'est cette seconde moitié qui porte
l'invariant : tant que la diffusion décrivait l'intention plutôt que le
résultat, la route pouvait mentir sans que rien ne le rende visible.

`version` n'est délibérément pas incrémenté. `USER_PREFERENCES_REORDERED` ne
porte pas de version et iOS `applyRemoteReorder` l'applique sans garde ;
incrémenter ici avancerait un compteur qu'aucune diffusion ne transporte —
exactement la demi-obligation que le docstring de `conversationPreferencesSync`
condamne — et coûterait un `USER_PREFERENCES_UPDATED` par ligne déplacée au
lieu d'un événement par glisser-déposer.

Vérification par mutation (leçon 2026-07-31 #5) : 7 des 9 tests ont été vus
ROUGES avant le correctif. Les 2 verts avant et après sont les verrous
(`version` inchangé, `200` sur lot vide) — c'est leur rôle.

Non retenu : répondre autre chose que `200` quand une partie du lot n'est pas
applicable. Le schéma de réponse ne transporte qu'un message, et l'étendre est
un changement de contrat public sans défaut observable pour le motiver — un
client ne peut réordonner que des conversations qu'il voit.

### Reste ouvert après ce cycle
- **`POST /user-preferences/reorder` n'a pas de `maxItems`** : un lot non borné
  produit autant d'`upsert` parallèles. Le filtre d'appartenance borne désormais
  les écritures réelles au nombre de conversations de l'appelant, ce qui retire
  l'essentiel du risque ; une borne explicite reste préférable.
- **Aucune route de préférences ne vérifie l'appartenance** (le `PUT` peut créer
  une ligne contre un id arbitraire). Les lignes ainsi créées sont inertes
  (`GET /conversations` joint sur `Participant`), mais l'asymétrie avec le
  réordonnancement est maintenant visible et mérite d'être résorbée.
- Hérités du cycle 11, toujours ouverts : le scope **communauté** de
  `user:preferences-updated` n'est pas routé côté iOS ; `ConversationStore.
  dispatchPreferencesUpdate` traite `.setClearHistoryBefore` comme un succès
  purement local (aucun appelant applicatif à ce jour — la colonne n'est
  exposée par aucune route de préférences versionnée, seulement par la route
  legacy `POST /api/conversations/:id/clear-history`).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une
  validation humaine (il change le comportement d'API publiques).

---

## Cycle 14 (2026-08-08) — les deux ids que le `PUT` de préférences ne vérifiait pas

> **Collision de numérotation** — une autre session de la routine a mené en parallèle
> un travail disjoint (rejeu hors ligne des réactions REST, PR #2626, mergée en
> premier) qu'elle numérote aussi « cycle 14 », mais dans `tasks/todo.md` et
> `tasks/lessons.md`, pas ici. Ce fichier garde sa propre séquence : « cycle 14 » y
> désigne l'entrée ci-dessous. Les deux ne se recouvrent sur aucun fichier.

Suivi direct des deux premiers points de la liste laissée ouverte par le cycle 13 :
« `POST /user-preferences/reorder` n'a pas de `maxItems` » et « **aucune route de
préférences ne vérifie l'appartenance** (le `PUT` peut créer une ligne contre un id
arbitraire) ; l'asymétrie avec le réordonnancement est maintenant visible et mérite
d'être résorbée ».

Vérifié : réel, et **plus large que ce qui avait été relevé**. Le cycle 13 avait vu
un id non vérifié dans ce `PUT`. Il y en a deux, et le second sort du périmètre de
l'utilisateur.

### D1 (racine, sécurité) — `categoryId` arbitraire ⇒ lecture inter-locataires

`UserConversationCategory` est une table **par utilisateur** (`userId`, cf. schema).
La route écrit le `categoryId` du corps tel quel, puis renvoie la ligne avec
`include: { category: true }`. Le corps du `200` — **et toutes les lectures
ultérieures**, `GET /user-preferences/conversations/:id` et la liste paginée faisant
la même jointure — rendent donc `name`, `color` et `icon` de la catégorie d'un autre
utilisateur.

Ce n'est pas un écho de la requête : une fois la catégorie attachée, la fuite est
**persistante** et se relit sans rejouer l'écriture. Les noms de catégorie sont des
libellés personnels de classement de conversations — le test le nomme
`'Divorce lawyer'` pour que la nature de la donnée reste lisible.

Portée : tout appelant authentifié, contre n'importe quel ObjectId de catégorie.
Pas d'écriture chez la victime (la ligne écrite est celle de l'attaquant), pas de
fuite par socket (`toPreferencesPayload` ne transporte que `categoryId`, que
l'attaquant détient déjà) — c'est une lecture, par la réponse REST.

### D2 (même racine) — `conversationId` arbitraire ⇒ lignes hors périmètre

L'écriture est un `upsert` : sans filtre, tout appelant authentifié crée des lignes
de préférences contre des conversations dont il n'est pas membre, et fait diffuser
`USER_PREFERENCES_UPDATED` pour elles. Les lignes sont inertes pour
`GET /conversations` (qui joint sur `Participant`) mais **pas** pour
`GET /user-preferences/conversations`, qui liste par `userId` seul.

### D3 (pourquoi ça a survécu) — un écrivain sur quatre, hors du rang

L'anomalie n'est pas qu'un contrôle manquait partout : c'est qu'il était présent
**partout ailleurs**.

| Écrivain | Appartenance | Possession de catégorie |
|---|---|---|
| `user-deletions.ts` × 3 (`delete-for-me`, `restore-for-me`, `clear-history`) | oui — `{ conversationId, userId, isActive: true }` | n/a |
| `reorderConversationPreferences` (cycle 13) | oui — même prédicat, en lot | n/a |
| `me/preferences/categories.ts` × 6 | n/a | oui — `{ id, userId }`, sous commentaire explicite |
| **`PUT /user-preferences/conversations/:id`** | **non** | **non** |

Un contrôle unanime chez tous les voisins est précisément ce qui le rend invisible
chez le dernier : rien ne dépareille à la lecture d'un seul fichier.

### D4 (corollaire) — le lot de réordonnancement n'était toujours pas borné

Le filtre d'appartenance du cycle 13 borne les **écritures**, mais il s'applique
après le parsing et la déduplication du lot. Un tableau non borné restait du
travail gratuit à la demande.

## Plan
- [x] T1 — RED : `PUT` sur une conversation non rejointe → 403, aucune ligne, aucune diffusion (3 tests)
- [x] T2 — RED : `PUT` avec la catégorie d'autrui → 404, nom absent du corps sérialisé, rien attaché (3 tests)
- [x] T3 — verrous : chemin nominal, catégorie possédée, décatégorisation `null`, pas de lecture sans catégorie, lot à la borne (5 tests, verts avant ET après)
- [x] T4 — RED : lot au-delà de la borne → 400 avant tout accès au store
- [x] T5 — GREEN : les deux contrôles dans `writeConversationPreferences` + `ConversationPreferencesScopeError`
- [x] T6 — mapping 403/404 dans la route, réponses déclarées au schéma, `maxItems: 200`
- [x] T7 — les 3 harnais existants modélisent `Participant` et `UserConversationCategory`
- [x] T8 — gates : suite gateway complète 591/591 (15 433 tests), `tsc --noEmit` propre
- [x] T9 — changeset + CHANGELOG (section `🔒 Security`) + ce relevé

## Revue

Les deux contrôles vivent dans `writeConversationPreferences`, pas dans la route.
C'est le même argument que celui qui a mis `version` et la diffusion dans ce module
au cycle 12 : la ligne n'est atteignable que par cette fonction, donc c'est le seul
endroit qu'un futur écrivain ne peut pas oublier. Les placer dans la route aurait
reproduit exactement la configuration qui a produit le défaut — un contrôle correct
répété en N endroits, dont l'un finit par manquer.

Le choix des codes n'est pas cosmétique et suit ce que le dépôt a déjà tranché :
`403` pour la non-appartenance, que l'appelant connaît déjà (et que les trois routes
de `user-deletions.ts` renvoient), `404` pour une catégorie qui n'est pas la sienne,
de sorte que la réponse **ne confirme pas son existence** — sans quoi le correctif
troquerait une fuite de contenu contre un oracle d'énumération.

Vérification par mutation (leçon 2026-07-31 #5) : les 7 tests ont été vus ROUGES
avant le correctif, la fuite apparaissant littéralement dans le corps sérialisé
(`"category":{"name":"Divorce lawyer",…}`). Les deux gardes sont indépendamment
portantes **par construction du test** : les cas catégorie visent une conversation
rejointe (la garde d'appartenance ne peut pas les faire passer) et les cas
appartenance ne portent aucun `categoryId` (la garde de catégorie est court-circuitée
par `!= null`). Les 5 verrous verts avant et après interdisent au correctif de
rétrécir le chemin nominal — c'est leur rôle.

Note d'outillage : les 10 tests tombés après le correctif étaient des harnais qui ne
modélisaient pas `Participant` sur ce chemin, pas des régressions. Ils sont complétés
plutôt que la requête pliée à leur forme (`findFirst` est ce qu'un contrôle unitaire
doit émettre, et ce que `user-deletions.ts` émet déjà) : adapter le code de production
à la forme d'un mock est la racine que les cycles 10, 11 et 13 ont chacun documentée.

### Reste ouvert après ce cycle
- **Le `GET` de préférences n'est pas restreint** : `GET /user-preferences/conversations/:id`
  répond les défauts pour n'importe quel id, et la liste paginée renvoie toute ligne
  portant le `userId` de l'appelant. Aucune fuite (la réponse ne contient que ce que
  l'appelant a écrit, et D1/D2 ferment la seule voie d'écriture hors périmètre), donc
  pas de défaut observable pour motiver un changement de contrat — relevé pour mémoire.
- Le `PUT` ne valide pas `categoryId` comme ObjectId : un non-ObjectId atteint Prisma
  et donne un 500 plutôt qu'un 400. Cosmétique de contrat, sans fuite.
- Hérités du cycle 13, inchangés : scope **communauté** de `user:preferences-updated`
  non routé côté iOS ; `ConversationStore.dispatchPreferencesUpdate` traite
  `.setClearHistoryBefore` en succès purement local (aucun appelant applicatif).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation
  humaine (il change le comportement d'API publiques).

## Cycle 15 (2026-08-14) — le miroir de connexion qui n'avait pas de chemin de retour

`apps/web/services/socketio/connection.service.ts`

### Demande

Routine « amélioration continue temps réel » (Phases 2 / 3 / 4 : cycle de vie
WebSocket, stratégie de reconnexion, file de réessai, dégradation hors ligne).
Reprise après le cycle 14, dont les restes ouverts étaient tous cosmétiques ou
hors périmètre Linux — recensement neuf plutôt que ramassage de miettes.

### Méthode de recensement (ce qui a été écarté, pour ne pas re-défricher)

Croisement mécanique des 125 `SERVER_EVENTS` (`packages/shared/types/socketio-events.ts`)
contre les `socket.on` du web, en résolvant les constantes et non les littéraux
(le web n'utilise que `SERVER_EVENTS.X` — une comparaison littérale rend 127 faux
positifs). 16 événements sans écouteur web, tous écartés :

| Événement(s) | Verdict |
|---|---|
| `message:read-status-updated` | **alias volontaire** de `read-status:updated`, émis en parallèle pendant la fenêtre de migration (~3 mois) ; les clients écoutent l'ancien. Pas un trou. |
| `attachment:reaction-added/-removed`, `location:live-*` | **écarts de parité** : la fonctionnalité est absente du web (zéro occurrence de `attachment:reaction` dans `apps/web`), pas un bug de synchronisation. Déjà relevés au cycle du 2026-08-13. |
| `call:*` (5) | hors périmètre messagerie. |
| `comment:reaction-sync`, `post:reaction-sync`, `heartbeat:ack` | pas de consommateur applicatif. |
| `message:send*` | événements CLIENT listés côté serveur. |

Surfaces re-parcourues et **trouvées correctes** (ne pas re-vérifier) :
`delta-sync.ts` (watermark déduit du cache, preuve de conservatisme en tête de
fichier), `unread-cache.ts`, `typing.service.ts` (throttle 2 s, fenêtre de
persistance 3 s, filet 15 s, purge sur déconnexion), `messaging.service.ts`
(dédup `recentMessageIds` bornée 200/5 min, repli REST anonyme, abandon du repli
sur E2EE), `use-auto-retry-failed-messages.ts` (jeton de propriété, ré-armement,
preuve de non-bouclage), `emitToConversationParticipants.ts` (`userId ?? id`
tenu partout — aucun site restant n'adresse un participant par `userId` seul),
`broadcastMessageMutation.ts` (trois audiences + `void`/`.catch` disjoints).

### Constats

**D1 — le miroir peut descendre, il ne peut pas remonter.**

`ConnectionService` tient `state.isConnected`, miroir de l'état du socket. Le
handler `offline` le met à `false` **sans toucher au socket** — et c'est
délibéré : la bannière doit réagir à la seconde où le réseau tombe, sans
attendre que Socket.IO s'en aperçoive.

Le socket, lui, ne remarque une coupure qu'au terme de son cycle ping/pong. Une
coupure plus COURTE ne le fait donc jamais tomber : bascule Wi-Fi→cellulaire,
VPN, réveil de veille, tunnel. Au retour du réseau, `socket.connected` vaut
encore `true`.

`connect()` sortait alors en silence sur sa garde `!socket.connected`. Aucun
`connect` n'est réémis sur un socket déjà connecté — donc plus RIEN ne pouvait
remettre `state.isConnected` à `true`, jusqu'à la prochaine vraie déconnexion,
potentiellement jamais.

**D2 — les deux miroirs se verrouillent mutuellement.**

`useConnectionStatus` mire le même état via `onStatusChange`, et son propre
handler `offline` abaisse `isSocketConnected` de son côté. Son `handleOnline` ne
relève que `isOnline` : `isSocketConnected` ne peut remonter que par un
événement du service — celui que D1 empêche d'exister. Aucune des deux couches
ne pouvait réparer l'autre.

**D3 — pourquoi le coût n'est pas cosmétique.**

Le symptôme visible est une bannière de reconnexion figée. Le coût réel est
`useAutoRetryFailedMessages`, dont `isReady` (`isOnline && isSocketConnected`)
est l'**unique** déclencheur : la file des messages en échec n'était plus jamais
rejouée pour le reste de la session. Un message que l'utilisateur croit en
attente de renvoi ne l'était plus, en silence — pendant que le lien portait
normalement les messages entrants, ce qui rendait la panne invisible.

C'est exactement la classe de défaut que le commentaire de `reconnect_failed`
nomme déjà (« un onglet ouvert mais passif cesse de recevoir en silence ») ;
elle n'avait été traitée que pour la boucle interne de Socket.IO, jamais pour
un socket resté VIVANT.

### Plan
- [x] T1 — RED : `online` après `offline` sur un socket survivant → miroir rétabli, statut diffusé, `socket.connect()` non appelé
- [x] T2 — RED : `connect()` sur socket vivant + miroir périmé → `isConnected` remonte, un seul événement
- [x] T3 — RED : `connect()` efface un `isConnecting` périmé (socket connecté entre-temps)
- [x] T4 — verrous (verts AVANT et APRÈS) : pas de ré-émission quand miroir et socket concordent ; un socket réellement mort est toujours ouvert
- [x] T5 — GREEN : réconciliation dans `connect()`
- [x] T6 — gates : 159 suites / 4001 tests web verts ; `tsc --noEmit` à 1229 erreurs avant ET après (base inchangée)
- [x] T7 — CHANGELOG + ce relevé

### Revue

La réconciliation vit dans `connect()` et non dans le handler `online`, parce
que `connect()` est le point de passage de TOUS les appelants — handler `online`,
`SocketIOOrchestrator.initialize`, `ensureConnection`. La placer dans le seul
handler `online` aurait réparé un chemin et laissé les autres sur la même
impasse : c'est la configuration « un contrôle correct répété en N endroits dont
l'un finit par manquer » que les cycles 13 et 14 ont chacun documentée.

Le handler `offline` n'est PAS modifié. Sa pessimisation immédiate est correcte
comme retour d'information à l'utilisateur ; il ne lui manquait qu'un retour de
manivelle. Le corriger en supprimant la mise à `false` aurait échangé un état
figé contre une bannière qui met 45 s à réagir — une régression d'UX pour
fermer un bug de synchronisation.

Le socket est la vérité, le miroir se réaligne dessus. Aucun rejoin de room
n'est émis : le socket n'a jamais quitté les siennes, et forcer un rejoin
serait du trafic gratuit sur un lien intact.

Vérification par mutation (leçon 2026-07-31 #5) : les 3 tests ont été vus
ROUGES avant le correctif, dont le scénario `offline`→`online` de bout en bout
par les vrais handlers `window`. Les 2 verrous verts avant et après interdisent
au correctif d'ouvrir un socket déjà mort (le chemin nominal) et de réémettre un
statut inchangé (un orage d'événements sur chaque `connect()` d'orchestrateur).

### Reste ouvert après ce cycle
- **Le retour du réseau n'est détecté que par l'événement `online`.** Un onglet
  restauré depuis le bfcache, ou dont la coupure n'a pas produit d'événement
  navigateur (portail captif), garde un miroir périmé jusqu'au prochain
  `connect()`. Un `visibilitychange` appelant `connect()` fermerait le cas —
  non fait ici : aucun défaut observé pour le motiver, et `connect()` est
  désormais idempotent, donc l'ajout est sans risque quand il se justifiera.
- **`initializeConnection()` rend `null` sur JWT expiré et rien ne réessaie.**
  Le commentaire délègue au rafraîchissement silencieux du chemin REST 401,
  mais aucun crochet ne rappelle `connect()` après un refresh réussi lorsque
  AUCUN socket n'a jamais été créé (le handler `auth:token-expired` exige un
  socket existant). Même classe que D1 — à instruire au prochain cycle.
- Hérités du cycle 14, inchangés : `PUT /user-preferences/conversations/:id`
  ne valide pas `categoryId` comme ObjectId (500 au lieu de 400) ; scope
  communauté de `user:preferences-updated` non routé côté iOS ;
  `ConversationStore.dispatchPreferencesUpdate` traite `.setClearHistoryBefore`
  en succès purement local.
- Écarts de parité web relevés au recensement (fonctionnalités absentes, pas
  des bugs) : réactions de pièce jointe, localisation live.

## Cycle 16 (2026-08-14) — le socket restait scellé sur le jeton de sa naissance

`apps/web/services/socketio/connection.service.ts`,
`apps/web/services/socketio/orchestrator.service.ts`,
`apps/web/services/auth-manager.service.ts`, `apps/web/services/auth.service.ts`

### Demande

Routine « amélioration continue temps réel ». Reprise directe du reste ouvert
nommé en fin de cycle 15 : « `initializeConnection()` rend `null` sur JWT expiré
et rien ne réessaie ». L'instruction est de partir du développement précédent —
c'est donc sa dette, pas un recensement neuf, qui ouvre ce cycle.

### Constats

**D1 — le socket ne rejoue jamais que le jeton avec lequel il est né.**

`io(url, { auth: { token } })` fige le jeton au moment de la construction.
Socket.IO **rejoue cette même charge à chaque tentative de reconnexion** : le
socket reste donc scellé à vie sur ce jeton-là. Or trois chemins font tourner
les identifiants sous ses pieds :

| Chemin | Qui écrit le nouveau jeton |
|---|---|
| Rafraîchissement silencieux sur 401 REST | `api.service.ts` → `authService.refreshToken()` |
| Pré-contrôle d'expiration avant requête | idem, sans même un 401 |
| Rotation de session anonyme | `authManager.setAnonymousSession` |

Après l'un d'eux, chaque handshake présente un jeton que la passerelle refuse
(`socket.handshake.auth?.token`, `services/gateway/src/socketio/utils/socket-helpers.ts:55`).
La boucle intégrée brûle ses 5 tentatives, `reconnect_failed` passe la main à
notre backoff manuel (ajouté au cycle 12), et **celui-ci represente le même
jeton mort** — indéfiniment. Un onglet verrouillé sur l'authentification, sur
une session dont les identifiants valides dormaient dans `localStorage` depuis
le début. Le déclencheur le plus banal est un redéploiement de la passerelle :
tous les sockets tombent en même temps, et ceux qui avaient rafraîchi entre-temps
ne remontent jamais.

Le handler `auth:token-expired` connaissait déjà le problème — il repoussait
manuellement `socket.auth = { token: newToken }`. Ce rustinage ne couvre qu'un
seul chemin : celui où la passerelle a pu émettre l'événement, donc où le socket
était encore **connecté**. Les rotations côté REST, elles, ne passent jamais par
là.

**D2 — le démarrage à jeton expiré ne produit aucun socket, et rien ne revient.**

Suite exacte du reste ouvert du cycle 15. `initializeConnection()` rend `null`
quand le JWT stocké est expiré, en déléguant au rafraîchissement REST. Ce
rafraîchissement réussit — et personne ne le dit à la couche temps réel :
`setCurrentUser()` a déjà tourné et ne retournera pas ; le handler
`auth:token-expired` exige un socket qui n'existe pas. Il ne reste que
`ensureConnection()`, appelé par les seules actions SORTANTES (`sendMessage`,
`joinConversation`).

Un lecteur qui reste sur la liste des conversations n'en déclenche aucune :
zéro message entrant, zéro compteur de non-lus, zéro présence, zéro indicateur
de frappe — pour toute la session, jusqu'à un rechargement de page. Sur une
application de messagerie, c'est l'écran d'accueil qui devient muet.

**D3 — `expiresIn` écrit dans l'emplacement du jeton de session.**

`authService.refreshToken()` appelait
`updateTokens(token, refreshToken, expiresIn)` sur une signature
`(authToken, refreshToken?, sessionToken?, expiresIn?)`. Le nombre atterrissait
en 3e position, donc dans `AUTH_STORAGE_KEYS.SESSION_TOKEN`, et `expiresIn`
était perdu. Sans conséquence observable aujourd'hui — cette clé est en écriture
seule, `getSessionToken()` lit la session anonyme — mais c'est une amorce posée
sous le premier lecteur qui viendra. Le test existant verrouillait le décalage.

### Correctifs

**D1 — `auth` devient un résolveur, pas une valeur.** socket.io-client accepte
`auth` sous forme de callback, réévalué à CHAQUE handshake.
`resolveHandshakeToken()` relit `authManager` au moment où la poignée de main a
lieu. Plus personne n'a à penser à pousser un jeton neuf ; corollaire imposé par
un test : plus personne ne doit **repincer** `socket.auth` sur une valeur, ce qui
remplacerait le résolveur et restaurerait la panne. Le rustinage du handler
`auth:token-expired` disparaît donc — il ne lui reste que rafraîchir puis
reconnecter.

**D2 — `authManager.registerOnTokensUpdated()`.** `updateTokens()` est le point
de passage unique de tout jeton rafraîchi ; il notifie désormais ses abonnés,
après écriture en stockage (un abonné qui relit `getAuthToken()` voit donc le
jeton qui vient d'atterrir). `clearAllSessions()` ne le déclenche **pas** :
perdre ses identifiants est le signal inverse, et il a déjà `registerOnClear()`.

L'abonné est l'**orchestrateur**, pas `ConnectionService` : le socket doit
revenir avec ses écouteurs branchés, et les brancher est le travail de
l'orchestrateur. Un `connect()` émis depuis la couche inférieure aurait produit
un socket vivant que personne n'écoute. Le handler n'agit que s'il n'existe
AUCUN socket — un socket déjà là relit ses identifiants tout seul au prochain
handshake (D1), et le démolir lui ferait perdre ses rooms pour rien.

### Gates

- 14 tests vus ROUGES avant les correctifs (6 `authManager`, 5 `ConnectionService`,
  3 orchestrateur), verts après.
- `apps/web` : **571 suites / 12 231 tests verts** (suite complète), 21 skipped.
- `tsc --noEmit` : 1229 erreurs avant ET après — base pré-existante identique au
  cycle 15, rien de neuf sur les fichiers touchés.
- iOS : hors périmètre (aucun fichier Swift touché ; pas de toolchain Swift sur
  ce runner Linux).

### Vérifié correct côté iOS — ne pas re-défricher

Le SDK Swift **n'a pas** D1/D2. `MessageSocketManager.connect()` fige lui aussi
son jeton (`.extraHeaders(["Authorization": "Bearer \(token)"])` sur le
`SocketManager`), mais `AuthManager.applySession` détecte la rotation de jeton
(`isTokenRotation`) et démolit puis reconnecte les deux sockets avec le jeton
neuf — le chemin de retour que le web n'avait pas. Vérifié à ce cycle.

### Reste ouvert après ce cycle

- **Le rustinage n'est retiré que du web.** Si un futur chemin repince
  `socket.auth`, seul le test « leaves the handshake resolver in place » le
  signalera ; aucune barrière de type ne l'interdit.
- **`visibilitychange` → `connect()`** (hérité du cycle 15) : toujours pas fait,
  toujours sans risque, toujours sans défaut observé pour le motiver.
- **Un socket existant mais bloqué en reconnexion n'est pas relancé** par
  `onTokensUpdated`. C'est volontaire — la boucle interne de Socket.IO reprendra
  le jeton neuf d'elle-même grâce à D1. Si un cycle observe un onglet qui reste
  muet malgré un socket présent, c'est ici qu'il faudra regarder.
- Hérités du cycle 14, inchangés : `PUT /user-preferences/conversations/:id` ne
  valide pas `categoryId` comme ObjectId (500 au lieu de 400) ; scope communauté
  de `user:preferences-updated` non routé côté iOS ;
  `ConversationStore.dispatchPreferencesUpdate` traite `.setClearHistoryBefore`
  en succès purement local.

## Cycle 17 (2026-08-14) — les préférences de conversation ne traversaient ni le sérialiseur ni le socket web

Base : `origin/main` @ `14c226e08` (cycle 16 mergé). Phases 2 / 3 / 11.

### Constats (Phase 1 — audit de la chaîne « préférences de conversation »)

La chaîne complète a été tracée : `PUT /user-preferences/conversations/:id` →
`writeConversationPreferences` (incrément `version` + `broadcastToUser`) →
`USER_PREFERENCES_UPDATED` → clients. La partie serveur est correcte et
soigneusement documentée. Les deux extrémités ne l'étaient pas.

**D1 — `version` n'a jamais quitté le serveur.**

`conversationPreferencesSchema` (`routes/conversation-preferences.ts:50`) est le
schéma de RÉPONSE des trois surfaces REST : `GET` unitaire (`:241`), `GET` liste
(`:317`), `PUT` (`:387`). Il énumère onze champs et **omet `version`**. Fastify
retire du fil toute propriété absente du schéma : le compteur monotone est
effacé de chaque réponse.

Conséquence mesurée côté iOS : `DefaultPreferenceWritingAdapter`
(`ConversationStore.swift:927`) refait un `GET` **immédiatement après le PUT**
dans le seul but de lire `version` — commentaire à l'appui — et reçoit `nil` à
tous les coups. `dispatchPreferencesUpdate` rend donc
`.completed(authoritativeVersion: nil)`, et la branche
`if let v = authoritativeVersion` de `mutate()` ne s'exécute jamais :
`userState.version` reste sur l'estimation optimiste locale (`local + 1`) au
lieu de la valeur serveur. Le schéma d'arbitrage tourne sur un compteur que
personne ne reçoit — il converge quand même la plupart du temps (les diffusions
portent une version qui dépasse le local), mais plusieurs écritures locales
d'affilée peuvent hisser le compteur optimiste AU-DESSUS du serveur, et les
diffusions suivantes sont alors jetées.

**D2 — le web jette le scope conversation de `user:preferences-updated`.**

`use-socket-cache-sync.ts:1096` discrimine l'union à trois scopes et ne traite
que `category` et `communityId` ; la branche `conversationId` sortait sans rien
faire, sous un commentaire annonçant que « le câblage web arrive dans une phase
ultérieure ». Le store Zustand `conversation-preferences-store.ts` (324 lignes)
n'a aucune référence à un socket : il vit du REST au démarrage et de ses propres
écritures optimistes.

La ligne `UserConversationPreferences` est par UTILISATEUR, pas par appareil.
Épingler / couper le son / archiver / réagir / renommer / recatégoriser depuis
un autre appareil ne parvenait donc jamais à un onglet web ouvert : la liste
gardait son état — et son **tri**, `useConversationSorting` lisant `isPinned`
depuis ce store — jusqu'à un rechargement de page.

**D3 — le type partagé n'a pas de `version`.**

`UserConversationPreferences` (`packages/shared/types/user-preferences.ts`) ne
modélisait pas le compteur, donc même D1 corrigé le web n'aurait pas pu arbitrer
de manière typée.

### Correctifs

**D1.** `version` ajouté à `conversationPreferencesSchema`. La branche « aucune
ligne stockée » du `GET` unitaire pose `version: 0` explicitement :
`CONVERSATION_PREFERENCES_DEFAULTS` l'exclut à dessein (état de protocole, pas
préférence — un reset ne doit jamais le rembobiner), donc c'est à l'appelant de
le fournir. Une ligne absente n'a jamais été diffusée : elle est sous TOUTE
version que le serveur peut émettre, et répondre `undefined` laisserait le
client deviner un plancher.

**D3.** `readonly version?: number` sur `UserConversationPreferences`, porté par
`transformPreferencesData` côté web depuis le REST. Optionnel : une réponse d'un
serveur antérieur n'en porte pas, et l'absence reste une absence — jamais un 0
inventé qui ferait tomber la première diffusion reçue.

**D2.** `applyRemotePreferences()` sur le store web. Quatre décisions :
- **arbitrage sur `version`** — `version <= (current?.version ?? 0)` → drop.
  Une entrée sans version (posée optimistiquement, ou hydratée par un serveur
  antérieur) vaut 0, donc toute diffusion la dépasse.
- **création d'entrée** — une conversation jamais personnalisée n'a pas de
  ligne ; c'est justement le premier épinglage fait ailleurs qui en crée une.
  La refuser (comme fait iOS pour une conversation non hydratée) laisserait le
  cas le plus courant invisible, le store des préférences étant indépendant de
  la liste des conversations.
- **`reset: true`** — le DELETE porte `conversationId` et `preferences: null` :
  même scope, defaults restaurés, `version` avancée.
- **`reset: false` sans snapshot** — ignoré ENTIÈREMENT, compteur inclus. Rien
  n'a été appris ; avancer `version` ferait tomber la diffusion suivante, celle
  qui portait l'état.

Le câblage se fait dans `use-socket-cache-sync`, au même endroit que ses deux
scopes frères, via `useConversationPreferencesStore.getState()` (le socket n'est
pas un composant React ; `useConversationPreferencesActions` garde son contrat
d'identité stable, non touché).

### Gates

- 13 tests vus ROUGES avant correctifs (4 passerelle, 9 web), verts après.
- `services/gateway` : **711 suites / 17 420 tests verts**.
- `apps/web` : **572 suites / 12 251 tests verts**, 21 skipped (suite complète).
- `packages/shared` : 54 fichiers / 1 542 tests verts.
- `tsc --noEmit` : passerelle **0 erreur** ; web **1229 avant ET après** — base
  pré-existante identique aux cycles 15/16, zéro erreur sur les fichiers touchés.
- iOS : **aucun fichier Swift touché**. Le correctif D1 lui profite sans
  changement — `APIConversationPreferences.version` existe déjà et
  `ConversationStore` l'applique déjà ; il lui manquait d'arriver sur le fil.

### Vérifié correct — ne pas re-défricher

- `ConversationStateOutbox` (SQLite/GRDB) : hydratation synchrone anti-race,
  coalescing par `(convId, key)`, garde de concurrence post-dispatch comparant
  la mutation dispatchée à l'état courant, `purgeAll` de logout, backoff
  `min(60s, 2^n × 5s)`. Aucun défaut trouvé.
- `ConversationStoreSocketBridge` : gate d'identité présent sur
  `readStatusUpdated` / `participantLeft` / `participantBanned` ; absent sur
  `userPreferencesUpdated` mais **correct** — `broadcastToUser` cible la room de
  l'utilisateur, le payload n'atteint que ses propres appareils.
- `ConversationStore.merging(_:with:)` (bump-to-top) et `applyRemote`
  (arbitrage de version, groupe Prisme monotone) : tracés, conformes.

### Reste ouvert après ce cycle

- **`clear-history` n'a aucun client.** `POST /api/conversations/:id/clear-history`
  est complet côté passerelle (écriture versionnée, diffusion, rétractation des
  notifications), mais ni le web ni iOS ne l'appellent. Pire, iOS a le type de
  mutation, la persistance outbox et l'application distante — et son dispatch
  (`ConversationStore.swift:731`) rend un **faux succès local** pour
  `.setClearHistoryBefore`, avec un `default:` qui masquera tout futur cas
  ajouté. Latent aujourd'hui (aucun appelant n'enfile cette mutation), mais
  c'est une amorce à dimension **vie privée** : le jour où une UI l'appelle,
  l'utilisateur croira son historique effacé alors que rien n'aura quitté
  l'appareil. `.setClearHistoryBefore(nil)` n'a par ailleurs aucune route
  serveur (pas de `restore-history`), ce qu'il faudra trancher.
- **`deletedForUserAt` / `clearHistoryBefore` / `mentionsOnly` ne franchissent
  pas non plus le sérialiseur REST** pour les deux premiers (même cause que D1,
  même schéma). Non corrigés ici : aucun client ne les lit depuis cette surface
  aujourd'hui, et le cycle a délibérément gardé son périmètre sur le champ dont
  la perte cassait un contrat documenté.
- **iOS paie un aller-retour HTTP de trop par mutation de préférence.**
  `DefaultPreferenceWritingAdapter` refait un `GET` après chaque `PUT` parce que
  `PreferenceService.updateConversationPreferences` rend `Void` — son commentaire
  annonce « until the service interface gets the unified update-and-return shape
  in a follow-up ». Le `PUT` porte désormais `version` dans sa réponse (D1), donc
  le second appel est devenu du gaspillage pur : un aller-retour réseau par
  épinglage, coupure de son, archivage ou renommage. Non fait ici — aucun
  toolchain Swift sur ce runner, et le changement touche la signature d'un
  service partagé.
- **Les quatre écritures optimistes du store web appliquent leur réponse HTTP
  sans arbitrage.** `togglePin` / `toggleMute` / `toggleArchive` / `setReaction`
  posent `updatedPrefs` tel quel au retour du `PUT`. Deux bascules rapprochées
  dont les réponses reviennent dans le désordre écrasent donc la plus récente
  par la plus ancienne. Le défaut est ANTÉRIEUR à ce cycle, mais il devient
  réparable grâce à lui : maintenant que `version` arrive sur le fil (D1) et que
  le store la porte (D3), ces quatre `set` peuvent passer par le même portillon
  que `applyRemotePreferences`. Non fait ici — quatre méthodes quasi identiques
  qui demandent une factorisation, pas un rustinage ponctuel.
- Hérités des cycles 14/16, inchangés : `PUT /user-preferences/conversations/:id`
  ne valide pas `categoryId` comme ObjectId (500 au lieu de 400) ; le scope
  **communauté** de `user:preferences-updated` n'est routé nulle part côté iOS
  (`MessageSocketManager:3280` discrimine sur `conversationId` puis retombe sur
  le scope `category`, dont le payload communauté n'a pas la forme) ;
  `visibilitychange` → `connect()` côté web.
---

## Cycle 18 (2026-08-14) — le partage de position en direct n'avait aucune fin

Routine « amélioration continue temps réel ». Le cycle 17 (PR #2998) a fermé la
chaîne des préférences de conversation ; sa dette nommée est soit iOS-seule —
non gatable sur ce runner Linux, aucune toolchain Swift — soit logée dans
`conversation-preferences.ts`, le fichier même que #2998 modifie, où la reprendre
n'aurait produit qu'un conflit. Ce cycle repart donc d'un recensement neuf.

### Méthode — matrice de couverture des événements

Pour chacun des **125 `SERVER_EVENTS`** : émis par la passerelle ? référencé par
`apps/web` ? référencé par iOS ? Les trous sont, par construction, des défauts de
synchronisation temps réel.

| Émis par la passerelle, absent du web | Émis par la passerelle, absent d'iOS |
|---|---|
| `location:live-started/-updated/-stopped` | `authenticated`, `auth:session-revoked` |
| `message:read-status-updated` (jumeau namespacé, l'ancien est traité) | `notification:read-bulk`, `notification:deleted-bulk` |
| `heartbeat:ack` | `friend-request:*` (les 4 — couverts par le `notification:new` hérité) |
| | `message:pending-delivered`, `agent:admin-event` |

Le relevé a désigné `location:live-*` : le seul trou où la passerelle émet, iOS
consomme, et personne ne ferme le cycle de vie.

### Constats

**D1 — un partage n'est jamais retiré quand le socket du partageur meurt.**
`location:live-stopped` n'était émis que par un `location:live-stop` EXPLICITE.
Arrêt forcé de l'app, crash, perte de réseau : aucun stop. Les pairs gardent une
épingle qui se présente comme vivante, figée sur la dernière position connue,
jusqu'à `expiresAt` — **jusqu'à 8 heures** (`durationMinutes` ≤ 480).

Le codebase avait déjà exactement ce retrait, pour la frappe :
`StatusHandler.handleSocketDisconnecting` → `typing:stop`. La position en direct
était le seul état éphémère par socket à en être privé — et c'est celui dont la
péremption coûte le plus cher, une position vieille de plusieurs heures servie
comme actuelle étant un défaut de sécurité avant d'être un défaut d'affichage.

**D2 — aucun état serveur, donc aucun rattrapage.**
`socket.to(room)` ne touche que les sockets présents à cet instant. Un
participant qui ouvre la conversation APRÈS le début du partage n'apprenait
jamais son existence. Le cas se retourne contre le partageur : après une
reconnexion de son socket, ses `live-update` repartaient pour une session
qu'aucun pair n'avait vue commencer.

**D3 — l'expiration était un indice client que le serveur n'appliquait jamais.**
`expiresAt` calculé, expédié, oublié. Rien ne retirait le partage à son terme, et
rien n'empêchait de relayer des positions au-delà.

### Correctif — un registre de sessions

En mémoire, conforme au « real-time only, no Prisma persistence » du handler :
« sans persistance » n'impose pas « sans état ». Une entrée par
`(conversationId, userId)`, propriété du DERNIER appareil à avoir démarré le
partage. Bornée par le nombre de partageurs connectés — la déconnexion ferme
l'entrée, le registre est son propre ramasse-miettes.

- `disconnecting` retire les partages de ce socket. **Là et pas dans
  `disconnect`** : la diffusion vise les rooms de la conversation, dont
  `disconnect` est déjà sorti. Synchrone à dessein — une seule `await` suffirait
  à laisser la diffusion partir trop tard. Hors du gate `socketToUser` : le
  registre porte lui-même l'identité du partageur.
- Minuterie d'expiration, diffusée à TOUTE la room, **partageur inclus** — la
  seule des quatre diffusions à ne pas passer par `socket.to`. Elle porte une
  décision du SERVEUR, pas le geste d'un pair, et le partageur doit l'apprendre
  pour cesser d'émettre. Les clients rangeant les `LOCATION_LIVE_*` par `userId`
  de pair distant, sa propre entrée n'existe pas : le self-echo est sans effet
  aujourd'hui, et c'est le seul point d'accroche possible demain.
- Passé le terme, les `live-update` ne sont plus relayés — sans cette borne, la
  mise à jour suivante recréerait l'épingle que le retrait venait d'effacer.
- `conversation:join` rejoue `location:live-started` au socket entrant, avec la
  **dernière** position connue. Le rejeu part après la jonction à la room, hors
  du gate `participationId` (un invité de lien partagé a le même besoin), et sous
  try/catch — un rejeu perdu ne doit jamais faire échouer une jonction.
- `dispose()` désarme les minuteries : arrêt de la passerelle, isolation des tests.

**Deux décisions de bord.** Une session **inconnue** n'est jamais une session
**terminée** : après un redémarrage de la passerelle le registre est vide alors
que des partages tournent, et couper sur « pas d'entrée » les tuerait tous à
chaque déploiement. Et `conversation:leave` ne retracte **rien**, à l'inverse de
la frappe : côté client il signifie « j'ai quitté cet écran », pas « j'ai quitté
le groupe » — un partage légitimement poursuivi en arrière-plan y perdrait la vie.

### Gates

- 18 tests vus ROUGES avant les correctifs (suite `LocationHandler.lifecycle`),
  verts après. 9 tests d'intégration en plus (4 `ConversationHandler`,
  5 `MeeshySocketIOManager`) sur le câblage, qui n'a aucun autre témoin.
- `services/gateway` : **712 suites / 17 442 tests verts** (suite complète).
- `tsc --noEmit` passerelle : 0 erreur.
- iOS et web : aucun fichier touché.

### Reste ouvert après ce cycle

- **`location:live-*` n'a aucun consommateur côté web.** Zéro référence dans
  `apps/web` : un partage lancé depuis iOS est purement invisible sur le web,
  avant comme après ce cycle. C'est une fonctionnalité absente, pas un défaut de
  synchronisation — hors périmètre d'un cycle de correction, et le premier
  candidat d'un cycle de fonctionnalité.
- **Le registre ne survit pas à un redémarrage de la passerelle.** Délibéré (cf.
  « session inconnue ≠ session terminée »), mais le corollaire est qu'un partage
  traversant un déploiement perd sa minuterie serveur : il redevient borné par le
  seul `expiresAt` des clients, soit l'état d'avant ce cycle. Le rendre durable
  demanderait une ligne Prisma, que ce handler n'a pas.
- **`heartbeat:ack` n'est écouté par personne côté web**, qui émet par ailleurs
  `heartbeat` sans `clientTime` — le `latencyHintMs` que la passerelle calcule
  n'est donc jamais ni produit ni lu. Sans conséquence connue (le pong moteur
  couvre la présence), mais c'est du contrat mort des deux côtés.
- Hérités des cycles 14/16/17, inchangés : validation ObjectId de `categoryId`
  (500 au lieu de 400) ; scope communauté de `user:preferences-updated` non routé
  côté iOS ; `visibilitychange` → `connect()` côté web ;
  `deletedForUserAt` / `clearHistoryBefore` absents de
  `conversationPreferencesSchema` ; `POST /conversations/:id/clear-history` sans
  aucun client, et son faux succès local côté iOS.

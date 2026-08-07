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

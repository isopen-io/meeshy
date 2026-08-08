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

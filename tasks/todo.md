# Tête instruite pour le cycle 88 — neuf défauts prouvés restent, et une question d'identité à trancher

*Le cycle 87 a livré trois correctifs sur les douze candidats légués par le 86. Les neuf restants
sont inchangés et reproduits plus bas **tels que le cycle 86 les a établis** — site exact, scénario
d'échec. **Ne pas re-auditer — vérifier puis corriger.** Chacun a été établi par lecture de source ;
la vérification par exécution reste due pour tous.*

## Priorité 0 — la leçon du cycle 87 : deux sessions ont écrit le même correctif

Le correctif de priorité 1 (retraction de frappe au `conversation:leave`) a été écrit **deux fois
en parallèle**, par cette session et par `claude/keen-hamilton-8m3aqm`, qui l'a mergé sur main
pendant que celle-ci le finissait. Les deux implémentations ont convergé au nom de méthode près
(`retractTypingIn`, même signature à id déjà normalisé, même ordre). C'est du travail perdu, et le
risque se reproduira tant que la tête instruite désignera une priorité 1 sans mécanisme d'exclusion.

**Avant de commencer un item ci-dessous, `git fetch origin main` et vérifier qu'aucun commit récent
ne le porte déjà.** Le cycle 87 ne l'a découvert qu'au moment du merge final.

## Priorité 1 — le join anonyme : ce que le cycle 87 a instruit sans le corriger

**Un invité de lien partagé ne reçoit rien de `conversation:join`.**
`ConversationHandler.ts` gate `conversation:joined`, le push de non-lus et les stats sur
`connectedUser.userId` — `undefined` pour un anonyme — alors que le contrôle d'appartenance juste
au-dessus l'a laissé passer et que le socket EST dans la room.

Ce que le cycle 87 a **établi** en instruisant cet item (à ne pas refaire) :

1. **Aucune décision datée ne protège cette porte.** Le « gel » qui semblait la justifier
   (`docs/superpowers/plans/2026-07-29-architecture-transport-services.md`, GEL §1.5 : *« le join
   anonyme reste silencieux — aucun événement, aucune room, aucune notification »*) porte sur
   `routes/anonymous.ts` — le **join REST par lien**, qui CRÉE le participant. Pas sur le handler
   Socket.IO `conversation:join`, qui fait entrer un socket déjà authentifié dans une room. Fichiers
   différents, geste différent. La leçon 125 est donc satisfaite : rien à annuler.
2. Le seul artefact qui encode le défaut est le test `ConversationHandler.test.ts` *« allows an
   anonymous member (owns participant) to join without CONVERSATION_JOINED »*. Son commentaire
   **décrit l'implémentation** (« having no userId, does NOT emit ») et attribue le correctif de
   sécurité `ccaa9311f` à la seule vérification d'appartenance — pas à une rétention volontaire de
   l'accusé. Le retourner est légitime.
3. **`getUnreadCount` accepte déjà un `Participant.id`** — c'est documenté explicitement dans son
   en-tête (`MessageReadStatusService.ts` : *« Accepts either a `Participant.id` OR a `User.id` »*).
   La moitié « pousser le compteur de non-lus à l'invité » n'a donc **aucun obstacle** et devrait
   être faite en premier : elle est purement additive, et les sockets anonymes joignent déjà leur
   room personnelle (`ROOMS.user(userId ?? id)`, via `AuthHandler`) où ces événements arrivent.

**La question qui reste ouverte, et pourquoi le cycle 87 ne l'a pas tranchée seul :** quelle identité
mettre dans `userId` de l'accusé `conversation:joined` pour un participant sans compte ? Le
`SocketUser` anonyme porte `id` (le jeton de session) ET `participantId` (le `Participant.id`), et
ces deux valeurs ne sont pas interchangeables côté client. Envoyer la mauvaise fait d'un accusé une
désinformation d'identité. **Trancher demande de lire ce que les clients font de `conversation:joined`
(SDK iOS, web) — pas seulement le gateway** ; le faire à l'aveugle depuis un environnement sans
toolchain Swift, c'est exactement le pari que la leçon 43 déconseille. Découper : le compteur de
non-lus d'abord (sans risque), l'accusé ensuite avec la lecture client à l'appui.

## Priorité 2 — le pipeline de traduction (le Prisme y perd des lecteurs)

- **`getTranslation()` lit la langue verbatim quand tous les écrivains la stockent normalisée**
  (`MessageTranslationService.ts:3084`). `POST /translate {target_language:"pt-BR"}` écrit
  `translations.pt` puis relit `translations['pt-BR']` 20 fois sur 10 s et rend un **repli fabriqué**
  `[PT-BR] <texte original>` — le texte source affublé d'une étiquette, après 10 s d'attente, alors
  que la vraie traduction est en base une clé plus loin. Violation directe du Prisme. Correctif :
  `normalizeLanguageCode` au point de lecture. Testable purement.
- **Le garde « traduction périmée » jette des résultats VALIDES**
  (`:975` → `_isStaleTranslationResult`, `:781-784`). La carte `latestRetranslationTask` n'est
  écrite que par `_processRetranslationAsync` — qui sert AUSSI la traduction à la demande, où le
  contenu n'a pas changé. Une demande « traduis en italien » pendant que les traductions initiales
  volent encore fait tomber `en` et `es` : ces lecteurs voient l'original pour toujours, et rien ne
  retente.
- **La traduction à la demande SUPPRIME avant de confirmer** (`:697-724`) : les entrées visées sont
  retirées de `Message.translations` et persistées avant l'envoi ZMQ, sans rollback. Si le
  remplacement se perd, la traduction correcte est perdue définitivement. Ce chemin viole en plus la
  règle du `socketio/README.md` : il écrit `Message.translations` sans jamais se demander si le
  message est le DERNIER de sa conversation, donc sans `emitConversationPreviewUpdate`.
- **Une requête multi-langues est réputée soldée par son PREMIER résultat**
  (`ZmqTranslationClient.ts:295-309`) : `removePendingRequest` désarme le deadman dès la première
  langue. Les langues 2..N n'ont plus ni timeout, ni retry, ni erreur.

## Priorité 3 — web, gateway, translator : le reste

- **Monter `useSocketIOMessaging` détruit un socket sain** (`use-socketio-messaging.ts:60-69`) :
  `reconnect()` inconditionnel = `disconnect()` + reconnexion différée par backoff. Cinq composants
  montent ce hook ; ouvrir un profil coupe donc la connexion 1-2,5 s. L'étape 1C juste en dessous
  fait la MÊME chose correctement gardée (`!isConnected && !isConnecting`) — appliquer la même garde.
- **Les accusés ne sont jamais re-synchronisés après une coupure socket.** Le lot REST
  (`use-conversation-messages-rq.ts:261-307`) n'est relancé que lorsqu'on ENVOIE un message, et
  `conversation:join` ne re-émet pas de `read-status:updated`. Le cycle 85 a rendu ces compteurs
  monotones : sans backfill, un événement manqué devient un gel permanent. *(Le cycle 87 a rendu le
  `read-status:updated` de `mark-read` complet — ce backfill reste néanmoins dû : il traite la perte
  d'événement, pas la forme du payload.)*
- **Rien ne recalcule les non-lus après une suppression de message** (gateway) : aucun des sept sites
  d'émission de `conversation:unread-updated` n'est un chemin de suppression. Le badge compte des
  messages qui n'existent plus.
- **Réaction optimiste sans rollback quand le cache était vide**
  (`use-reactions-query.ts:257-262`) : `onMutate` fabrique l'état à partir de rien, `onError` refuse
  de le défaire (`if (context?.previousData)`). Rollback inconditionnel.
- **Le translator envoie deux fois chaque audio traduit** (`zmq_audio_handler.py:468-491`, bloc
  `if audio_bytes:` dupliqué verbatim) : 2× la charge ZMQ par message vocal multilingue. Rien ne
  casse — l'extraction résout la seconde copie — mais c'est du gaspillage pur. Confirmer avec
  `git log -L468,491:services/translator/src/services/zmq_audio_handler.py` avant de retirer.

## Ce qui reste ouvert des cycles précédents

- **Les 242 « source guards » iOS** (tête instruite du cycle 86) : des tests qui `grep` le code au
  RUNTIME depuis un `#filePath` figé à la COMPILATION, donc capables de rendre un verdict sans
  rapport avec le commit testé. **Les cycles 86 et 87 n'ont rien pu en faire** : aucune toolchain
  Swift dans l'environnement de la routine (`swift`, `swiftc`, `xcodebuild` absents, Linux). Le
  point 1 du dossier (reproduire sur macOS en logguant `url.path` et `source.count`) reste la
  première mesure à prendre, et elle exige une machine que cette routine n'a pas.
- La porte `actions: write` reste close (cycle 82) : pas de `workflow_dispatch` à la demande.
- Le couple de mesure PR↔`dev` sur la même lignée de clés DerivedData (cycle 84, item 2) n'existe
  toujours pas.
- **`UploadProcessor.test.ts` › `uploadFile` › `should upload a valid file successfully` est flaky
  sous charge** (relevé au cycle 87) : rouge sur une exécution de la suite complète où ce fichier a
  mis 54 s, vert en isolation en 7 s et vert sur deux autres exécutions complètes du même commit.
  Source figée, échec intermittent : par la leçon 126, c'est un ordonnancement, pas une régression —
  et il n'a pas été instruit. À triager par qui possède la zone upload.

---

# Cycle 87 — Trois compteurs qui mentaient, et un correctif écrit deux fois

*Branche `claude/keen-hamilton-tpltop`. Trois correctifs gateway, chacun RED-prouvé par
réintroduction du défaut. Suite gateway complète verte.*

## 1. `conversation:leave` ne retractait pas la frappe — livré par une AUTRE session

Écrit ici, et simultanément sur `claude/keen-hamilton-8m3aqm` qui l'a mergé sur main en premier.
Les deux implémentations ont convergé : même nom (`retractTypingIn`), même signature à id déjà
normalisé, même ordre (retracter avant `socket.leave`), même refus de re-résoudre la conversation.

**Résolution du merge, en faveur de main partout où les deux se touchent** — sa dépendance
`retractTyping` est optionnelle là où la mienne était requise, et son `try/catch` vit au point
d'appel plutôt que dans la retraction. Deux choix défendables, déjà mergés, non rejoués.

Ce qui a survécu de cette branche :

- **`StatusHandler.test.ts` : trois tests de `retractTypingIn`** — main n'en avait aucun, sa
  couverture passait entièrement par `ConversationHandler`. Dont celui qui compte : *« costs nothing
  for a socket that never typed »* (aucune résolution, aucune requête, aucune diffusion), soit
  l'écrasante majorité des changements de conversation.
- **Deux garanties ajoutées à `ConversationHandler.test.ts`** : la conversation n'est résolue
  QU'UNE fois, et un payload refusé ne retracte rien.
- Un test que j'avais écrit affirmait « la retraction ne rejette jamais » : c'était **mon** contrat,
  pas celui de main, qui place le `try/catch` chez l'appelant. Réécrit pour affirmer ce que la
  version de main garantit réellement — l'ordre untrack-avant-I/O, qui est ce qui évite un socket
  éternellement « en train d'écrire » après une panne DB.

## 2. `mark-read` diffusait un `read-status:updated` amputé — iOS ne synchronisait jamais ses lectures

`POST /conversations/:id/mark-read` construisait son payload sans `lastReadAt` ni `unreadCount`.
`ReadStatusUpdatedEventData` les déclare comme une **paire** sur `type: 'read'`, et le contrat dit
qu'un consommateur les applique ensemble ou pas du tout. iOS le fait à la lettre
(`ConversationStoreSocketBridge` : `guard … let lastReadAt, let unreadCount else { return }`), donc
un payload amputé n'est pas appliqué partiellement — il est **jeté**.

Et c'est cette route que poste `ConversationService.markRead`, le transport de lecture primaire
d'iOS. **Chaîne vérifiée de bout en bout** (Swift → route → payload → garde client) : la synchro de
lecture multi-appareils d'iOS ne partait jamais. Lire sur son iPhone ne descendait pas le badge sur
son iPad. La route jumelle `message-read-status.ts` envoyait le couple correctement depuis toujours.

Le couple est désormais résolu une fois et utilisé deux fois — il accompagne la diffusion ET
alimente la remise à zéro du badge, qui faisait jusqu'ici son propre `getUnreadCount` : **une
requête de moins par marquage**. Payload typé `ReadStatusUpdatedEventData`.

## 3. `GET /conversations/:id` rendait toujours `unreadCount: 0` à un invité de lien partagé

Clause `where: { conversationId, userId, isActive: true }` écrite à la main. Pour un invité,
`authContext.userId` PORTE un `Participant.id` : la clause comparait un id de participant à la
colonne `userId`, ne matchait rien, et le `0` obtenu **écrasait le badge que le socket venait de
pousser juste**. Le badge d'un invité ne pouvait que disparaître à chaque ouverture.

`resolveCallerParticipant` existe exactement pour ce site — son en-tête décrit ce défaut mot pour
mot pour les autres routes. Sa précédence (`participantId` avant `userId`) est celle de
`canAccessConversation` : accès et comptage ne peuvent plus diverger sur l'identité de l'appelant.
Le helper exclut en plus les bannis, ce que la clause manuelle ne faisait pas.

**Le site jumeau signalé par le cycle 86 n'en est pas un** : `_emitUnreadCountsSnapshot`
(`MeeshySocketIOManager`) est gardé par un `if (!isAnonymous)` explicite. Il ne produit pas une
valeur fausse, il n'en produit aucune — c'est une omission délibérée, pas le même défaut. L'étendre
aux anonymes est une évolution, pas un correctif, et rejoint la question d'identité de la
priorité 1 ci-dessus.

## Méthode

Chaque correctif RED-prouvé **en réintroduisant le défaut** dans le code de production, pas en
supposant le rouge : retraction débranchée → 1 rouge ; couple retiré du payload → 2 rouges ; clause
manuelle restaurée → 1 rouge. Restaurés, re-vérifiés verts à chaque fois.

Un test écrit pour le n°3 partait d'une prémisse fausse — il posait un compteur pré-marquage à 0,
or la route court-circuite légitimement quand il n'y a rien à marquer. **C'était le test qui avait
tort, pas la route** : corrigé pour distinguer le compteur d'avant et celui d'après le marquage.

Le double de base de données du test d'invité ne répond **que sur la colonne interrogée** — une
clause `{ userId: <participant id> }` n'y matche rien, comme en base. Et le module d'access-control
n'y est plus stubbé que sur `canAccessConversation` : c'est la vraie règle de précédence qui est
exercée, pas un mock qui la répète.

---

# Cycle 86 — Les indicateurs de saisie du web : morts à la réception, fantômes à l'émission

## Le correctif livré (PR #2879)

Sur le web, la **vue conversation** n'a jamais affiché « X est en train d'écrire… », et n'a jamais
retracté ce qu'elle faisait afficher aux autres. Deux défauts indépendants sur la même
fonctionnalité.

**Réception.** `ConversationLayout.onUserTyping` — le callback que la vue confie au socket — se
réduisait à deux gardes suivies de rien :

```ts
const onUserTyping = useCallback((userId, _username, _isTyping, typingConversationId) => {
  if (!user || userId === user.id) return;
  if (typingConversationId !== selectedConversation?.id) return;
}, [user, selectedConversation?.id]);        // ← la fonction se termine ici
```

`useConversationTyping.handleUserTyping` — **seul écrivain** de `typingUsers` — n'était ni
déstructuré ni appelé. Chaque `typing:start`/`typing:stop` était reçu, filtré, jeté. L'en-tête rend
pourtant bien cet état (`ConversationView.mapTypingUsers` → `ConversationHeader` →
`ParticipantsDisplay` → `TypingIndicator`) : il n'a simplement jamais rien eu à rendre.

Ce qui a caché la panne : le **flux d'accueil** (`use-stream-socket.ts:128,306`) tient sa PROPRE
copie du handler et la câble correctement. La fonctionnalité marchait sur une surface et pas sur
l'autre.

**Émission.** Le nettoyage de `useConversationTyping` est une fermeture créée au rendu où
`conversationId` a changé pour la dernière fois : elle y capture un `isTyping` qui vaut toujours
`false`, donc `if (isTyping) stopTyping()` était **inatteignable** — et le même nettoyage annule le
timer d'auto-stop (3 s), si bien qu'aucun des deux chemins d'arrêt ne partait. Rien en aval ne
rattrapait (cf. priorité 1 ci-dessus). Changer de conversation sans vider le composeur laissait donc
un fantôme chez tous les pairs jusqu'à leur filet de 8 s.

Trois décisions :

- **Le layout délègue, il ne recopie pas.** Les deux gardes du callback existaient déjà dans
  `handleUserTyping` ; les rebrancher aurait dupliqué la règle. Le callback relaie, point.
- **Un ref pour casser le cycle.** `useConversationTyping` a besoin de `startTyping`/`stopTyping` que
  produit `useSocketIOMessaging`, qui a besoin du récepteur : la dépendance est réellement
  bidirectionnelle. Le ref la casse, et rend le callback STABLE — l'abonnement socket cesse de se
  refaire à chaque changement de conversation.
- **Un miroir de `isTyping` écrit à la main, pas synchronisé par effet.** React exécute tous les
  nettoyages avant tous les effets : un ref synchronisé par `useEffect` serait juste par accident
  d'ordonnancement. Écrit aux trois mêmes endroits que l'état, il est juste par construction.

### Vérification

- **RED prouvé avant le correctif** : 4 rouges (2 hook, 2 vue). Les 4 gardes négatives (écho de soi,
  autre conversation, pas de stop si on ne tapait pas, pas de double stop) passaient déjà — elles
  verrouillent le correctif contre une sur-émission.
- **Mutation appliquée et vérifiée — 6 réversions, 6 rouges** : relais neutralisé (2), branchement du
  ref retiré (2), nettoyage relisant l'état périmé (2), miroir non armé par `handleTypingStart` (2),
  non désarmé par `handleTypingStop` (1), non désarmé par l'auto-stop (1). Restauré, re-vérifié vert.
- **Suite web complète : 563/563 fichiers, 12 084 tests verts** (21 skipped).
- `tsc --noEmit` : **1 224 diagnostics avant comme après**, aucun dans les fichiers touchés.
- Baseline gateway relevée au même commit, non touchée : **654/654 suites, 16 486 tests verts**.

### Deux tests qui ne prouvaient rien

Le défaut d'émission a traversé une suite verte parce que deux tests le DOCUMENTAIENT au lieu de
l'affirmer — « The cleanup effect may or may not call stopTyping depending on React's cleanup
timing » — et n'assertaient donc rien sur `stopTyping`. Le défaut de réception, lui, était hors de
portée de tout test de la vue : `useConversationTyping` y était doublé en ENTIER, ce qui figeait
`typingUsers: []` et rendait `undefined` tout export nouvellement consommé (leçon 128, corollaire).
Le double est retiré ; le hook réel tourne désormais sous le test de la vue.

### Réserve d'honnêteté

Le dépôt est arrivé en **clone superficiel** (`--depth`, 24 greffes) : `origin/main` pointait sur un
commit vieux de trois jours et `git merge-base` ne trouvait AUCUN ancêtre commun avec la branche de
travail, ce qui affichait « 334 en avance / 340 en retard » pour deux références en réalité
identiques. Diagnostic établi par `git ls-remote` (main = `4fd18273` = HEAD), pas par déduction.
Toute conclusion de divergence tirée d'un `git log` dans cet environnement doit d'abord vérifier
`git rev-parse --is-shallow-repository`.


---

# (Reporté — non exécuté au cycle 86, faute de toolchain Swift) Dossier iOS : la suite rend des verdicts que le code ne justifie pas

*Le cycle 85 est allé chercher pourquoi la suite de référence iOS est rouge un run sur trois. La
réponse n'est pas « des tests flaky » : au moins un verdict est DÉMONTRABLEMENT faux.*

## Le fait à instruire en priorité

Run `31543763910` (`push dev`, 2026-08-11 22:45 UTC, head `bec43248`) rapporte :

```
XCTAssertTrue failed - hasActiveEffects must also check config.hasAdvancedFilters,
not just config.isEnabled, …
CallViewAccessibilityTests/test_hasActiveEffects_alsoChecksAdvancedFilters_notIsEnabledAlone()
```

Or `git show bec43248:apps/ios/Meeshy/Features/Main/Views/CallView.swift` contient bien, ligne
1528, `return config.isEnabled || config.hasAdvancedFilters`. Le test cherche `hasAdvancedFilters`
dans les **700 premiers caractères** suivant `private var hasActiveEffects: Bool {` : la chaîne s'y
trouve à l'**offset 500**, et le motif d'ancrage n'apparaît **qu'une fois** dans le fichier
(vérifié en rejouant l'assertion caractère par caractère sur le blob de ce commit exact).

**L'assertion ne PEUT pas échouer sur la source du commit testé. Elle a donc lu autre chose.**

C'est un défaut de classe, pas un test isolé : `MeeshyTests` compte **137 fichiers** et
**242 lectures** de la forme `String(contentsOf: URL(fileURLWithPath: #filePath)…)` — des « source
guards » qui grep le code produit **au runtime**, depuis un chemin figé à la COMPILATION. Le verdict
de ces 242 assertions ne dépend donc pas de ce qui a été compilé, mais de ce que le système de
fichiers de l'hôte présente au moment de l'exécution. Quand les deux divergent — cache DerivedData
restauré, worktree partagé, re-tentative après `** TEST EXECUTE FAILED **` (le log de ce run montre
bien un second `Testing started`) — la suite prononce un verdict sans rapport avec le commit.

Ce qu'il faut instruire, dans l'ordre :

1. **Reproduire sur macOS** : relancer ce test seul sur `bec43248` et logguer le chemin ET la taille
   du fichier réellement lu (`url.path`, `source.count`) avant l'assertion. C'est la mesure qui
   tranche entre « mauvais chemin » et « bon chemin, contenu périmé ».
2. **Décider du sort de l'idiome.** Un source guard qui passe vert sur une source qu'il n'a pas
   compilée ne garde rien. Soit on l'ancre à la compilation (ressource copiée dans le bundle de test
   par une build phase, donc solidaire du binaire), soit on le remplace par une assertion de
   COMPORTEMENT là où c'est possible. 242 sites : chantier à cadencer, pas à faire d'un bloc.
3. **Ne pas confondre avec le reste du rouge.** Sur 30 runs `push dev`, 11 échecs (37 %). Trois
   récidivistes — `AuthServiceTests` (timeout 2 s), `MiniAudioPlayerBarTests`,
   `LocalizationConsistencyTests` — ont été corrigés le 2026-08-11 par `0032297d`, déjà sur `main`
   ET sur `dev`. Le rouge restant se partage entre le défaut ci-dessus et le RETARD de `dev` :
   au moment du relevé, `dev` était **40 commits derrière `main`** et n'avait pas le correctif du
   cycle 81 que `StoryUploadQueueTests/test_uploadSucceeds_dequeuesItsWriteAheadIntent` exige.
   **Rapprocher `dev` de `main` avant de conclure quoi que ce soit d'un run rouge.**

## Ce qui reste ouvert des cycles précédents

- La porte `actions: write` reste close (cycle 82) : la routine ne peut toujours pas déclencher
  `workflow_dispatch`, donc pas de lancement à la demande de la suite complète.
- Le couple de mesure PR↔`dev` sur la même lignée de clés DerivedData (cycle 84, item 2) n'existe
  toujours pas.

## Ce que le cycle 85 n'a PAS pu faire

Aucune toolchain Swift dans l'environnement de la routine (`swift`, `swiftc`, `xcodebuild` absents,
Linux). Tout ce dossier iOS est donc établi par lecture de source, rejeu d'assertion et API Actions —
jamais par exécution. C'est suffisant pour affirmer le point 1 (l'arithmétique de l'offset est
vérifiable hors Xcode) ; ça ne l'est pas pour corriger.

---

# Cycle 85 — Un accusé de lecture ne recule pas, et la suite iOS rend un verdict faux

## 1. Le correctif livré — web, accusés de lecture monotones

`readStatusSummaries` / `messageReadStatuses` (`apps/web/stores/conversation-ui-store.ts`) ont deux
écrivains et **un seul est ordonné** :

| écrivain | nature | ordre |
|---|---|---|
| socket — `presence.service.ts` → `updateReadStatusSummary` | événement | ordonné par connexion |
| lot REST — `use-conversation-messages-rq.ts` → `getReadStatuses` → `updateMessageReadStatusBatch` | **instantané** pris au départ de la requête | **aucun** |

`updateMessageReadStatusBatch` faisait `{ ...state.messageReadStatuses, ...statuses }` — le dernier
arrivé écrase, quelle que soit son ancienneté.

**La fenêtre est large.** La clé de garde du lot (`batchFetchedRef`) est indexée sur l'id du dernier
message propre : chaque message envoyé relance la lecture REST. Un pair qui lit pendant que la
requête est en vol suffit pour que l'instantané, parti AVANT cette lecture, atterrisse APRÈS elle.

**Et c'est visible.** `DeliveryIndicator` rend `readCount > 0` en double coche BLEUE,
`readCount === 0 && deliveredCount > 0` en double coche GRISE. Les coches passent au bleu, puis
reviennent au gris, et restent fausses jusqu'au prochain accusé. Le même écrasement pouvait
« dé-livrer » un message (`deliveredCount` qui redescend).

Correctif : un prédicat unique `isStaleReceipt(current, incoming)` dans le store, appliqué par les
TROIS écrivains — un seul énoncé de la règle, là où l'état vit.

Trois décisions, chacune verrouillée :

- **`totalMembers` est le discriminant.** Les accusés ne sont croissants que pour un effectif FIXE ;
  quand quelqu'un part, le serveur recompte sur les survivants et rapporte légitimement MOINS de
  lectures. Sans ce discriminant la garde figerait les compteurs à vie.
- **Un résumé qui recule est rejeté ENTIER**, jamais fusionné champ par champ : un max par champ
  synthétiserait un état qu'aucun serveur n'a rapporté, alors que `readCount >= totalMembers` pilote
  la branche « lu par tous ».
- **Le lot filtre par ENTRÉE**, pas en tout-ou-rien ; et le miroir vers le dernier message propre est
  gardé sur SA propre histoire, pas sur celle de la conversation (le lot REST écrit cette entrée
  directement, elle peut être en avance).

### Vérification

- **RED prouvé avant le correctif** : 10 tests neufs, 6 rouges / 4 verts (les 4 verts sont les cas
  « la progression s'applique », qui passaient déjà). GREEN après : 10/10.
- **Mutation appliquée et vérifiée (leçon 117) — 7 réversions, 7 rouges** : prédicat neutralisé
  (6 rouges), discriminant `totalMembers` retiré (1), garde du lot retirée (3), garde du miroir
  retirée (1), garde de `updateMessageReadStatus` retirée (1), garde conversationnelle retirée (1),
  `||` changé en `&&` (5). Restauré, re-vérifié 10/10.
- **Suite web complète : 563/563 fichiers, 12 077 tests verts** (21 skipped).
- `tsc --noEmit` : **1 757 diagnostics avant comme après** (pré-existants, fichiers de test admin
  sans rapport), **aucun** dans les fichiers touchés.

Réserve d'honnêteté : un premier passage de suite complète a rapporté 6 échecs — c'était MON
`git stash` de mesure du tsc de référence qui a retiré le correctif sous une exécution de fond déjà
lancée. Relancé sur arbre propre : vert. Et les 23 « suites en échec » du passage suivant étaient
toutes des erreurs de CONFIGURATION (`@meeshy/shared/dist` non construit — prérequis documenté dans
le CLAUDE.md racine), pas des tests : après `bun run build` dans `packages/shared`, 563/563.

## 2. Le dossier iOS — mesure, et un verdict qui ne tient pas

Le cycle 84 signalait la suite `dev` « rouge très fréquemment » et la renvoyait à qui possède la
zone. Relevé de ce cycle sur les **30 derniers runs `push dev`** d'`ios-tests.yml` : **11 échecs,
soit 37 %**.

Échecs relevés sur 4 runs échantillonnés :

| run | date (UTC) | tests en échec |
|---|---|---|
| `31543763910` | 08-11 22:45 | `CallViewAccessibilityTests/test_hasActiveEffects_…`, `StoryUploadQueueTests/test_uploadSucceeds_dequeuesItsWriteAheadIntent` |
| `31482338455` | 08-11 10:28 | `AuthServiceTests/test_handleUnauthorized_…`, `MiniAudioPlayerBarTests/test_tapPlayPause_…` |
| `31468948328` | 08-11 07:26 | `LocalizationConsistencyTests/test_everyAppCatalogIdentifierKeyIsReferencedInCode`, `MiniAudioPlayerBarTests/test_tapPlayPause_…` |
| `31417194286` | 08-10 18:04 | `AuthServiceTests/test_handleUnauthorized_…` (« Exceeded timeout of 2 seconds ») |

**Les trois récidivistes sont déjà corrigés** par `0032297d` (2026-08-11 11:45 UTC) : timeout
AuthService porté à 10 s, `MiniAudioPlayerBar` adapté à la relance de tête, 39 clés orphelines
purgées du catalogue. Ce commit est sur `main` ET sur `dev`.

**Le run le plus récent, lui, ne s'explique pas ainsi** — et c'est le point porté en tête de cycle
ci-dessus : son verdict sur `CallViewAccessibilityTests` est faux au regard de la source du commit
testé (démonstration reproduite en tête). Sa seconde ligne rouge, `StoryUploadQueueTests`, est en
revanche un simple RETARD : le correctif du cycle 81 (`704a3c5b`, 2026-08-12 03:03 UTC) est
POSTÉRIEUR au run et n'était pas sur `dev` au moment du relevé — `dev` accusait alors 40 commits de
retard sur `main`.

Conséquence pratique, à retenir avant de rouvrir ce dossier : **un run `dev` rouge ne prouve rien
tant que `dev` n'a pas été rapproché de `main`.**

## 3. Ce qui a été audité et trouvé SAIN (ne pas re-défricher)

- **`emitToConversationParticipants`** (gateway) — chaînage `to()` (une copie par socket au plus),
  `userId ?? id` pour les participants sans compte, seed de la room de conversation. Correct.
- **Ajout d'un participant** (`routes/conversations/participants.ts`) — auto-join des sockets vivants
  à la room, `CONVERSATION_NEW` en room personnelle, effectif ABSOLU et non delta, arrivant écarté du
  fan-out. Correct. Retrait/bannissement/départ font bien `fetchSockets()` + `leave()`.
- **Catch-up incrémental web** (`use-conversation-messages-rq.ts` → `syncNewerMessages`) — déclenché
  sur le front montant de la reconnexion socket ET au focus d'onglet ; filigrane calculé sur les
  seuls messages CONFIRMÉS par le serveur (un optimiste stampé par l'horloge locale sauterait la
  fenêtre) ; réconciliation des optimistes par `clientMessageId`. La boucle de pagination est
  correcte **parce que** le gateway trie `asc` en mode `after`
  (`routes/conversations/messages.ts` : `orderBy: { createdAt: afterMode ? 'asc' : 'desc' }`) —
  en `desc` elle sauterait le milieu d'un trou plus grand qu'une page. Vérifié.
- **`admitEditedContent`, `emitMentionCreated`, `isStaleEdit`** — corrects.

## 4. Un constat reporté, non traité

`message:read-status-updated` est **dual-émis** avec `read-status:updated` aux 5 points d'émission,
et **aucun client ne l'écoute** (web, iOS, Android : tous sur le nom legacy). C'est délibéré et
documenté (`tasks/socketio-events-cleanup.md` #3, coexistence ~3 mois depuis le 2026-07-05), donc
**pas un défaut** — mais les accusés de lecture/livraison sont la classe d'événements la plus
volumineuse d'une messagerie, et chacun coûte aujourd'hui deux trames par socket. La fenêtre se
ferme début octobre 2026 : migrer les clients vers le nom namespacé est le préalable au retrait du
legacy. À cadencer, pas urgent.

---

# Tête instruite pour le cycle 84 — le gate compile existe ; ce qui reste à instruire est ce qu'il ne voit pas

*Le cycle 83 a exécuté la consigne du cycle 82 : mesurer avant de câbler. La mesure a répondu, le
gate est câblé, et pour la première fois depuis le 2026-07-27 une PR qui touche du Swift le compile.*

## Ce que le cycle 84 hérite, et ne doit pas défaire

Le gate est **compile seule**, délibérément. Il ne dit RIEN de :

- **la suite `MeeshyTests`** — toujours sur `dev` uniquement. Un test qui compile mais échoue passe
  le gate sans un mot. C'est le compromis assumé : les 8 min d'exécution sont exactement l'un des
  deux postes qui avaient saturé la file en juillet ;
- **la suite `MeeshySDK`** (`sdk-tests.yml`) — déjà déclenchée sur PR, mais gatée sur
  `packages/MeeshySDK/**` seul. Une PR qui ne touche que `apps/ios` ne l'exerce pas ;
- **les baselines de snapshot Timeline** — enregistrées sur iOS 18.2, donc invérifiables sans le
  runtime que le gate saute exprès.

## Ce que le cycle 84 devrait instruire

1. **Relever le coût réel du gate après un mois.** Deux points de mesure réels existent désormais
   (cf. rapport du cycle 83) : **10m02 à froid, 4m54 en régime permanent**. Le régime permanent
   étant le cas courant, la projection tombe à 340 runs/mois × ~5 min ≈ **1 700 min de runner
   macOS**, la moitié de l'estimation qui accompagnait le câblage. Cela reste une projection à
   partir des horodatages de commits, pas un relevé de facturation — et le nombre de runs, lui,
   n'a pas été re-mesuré. La mesurer pour de vrai, et si elle dérape, la première coupe évidente
   est le filtre de chemins (aujourd'hui `apps/ios/**` entier, y compris les ressources et les
   `.md`, qui ne changent rien à la compilation).
2. **Vérifier que le cache DerivedData profite bien aux PR.** Les runs de PR écrivent maintenant
   sous la même lignée de clés que `dev` (`ios-dd-macos15-xc26_1_1-…`). Deux hypothèses non
   vérifiées : que les produits d'un build `generic/platform=iOS Simulator` (arm64 épinglé) se
   réutilisent sans rebuild complet par un build `id=<sim>`, et l'inverse. Si elles sont fausses,
   les deux modes se piétinent le cache et chaque run repart à froid — mesurable dans les logs à
   la durée de l'étape `Build for testing` sur deux runs consécutifs.
3. **La porte `actions: write` reste close** (cycle 82) et le reste : l'intégration GitHub App de la
   routine ne peut toujours pas déclencher `workflow_dispatch`. Le gate compile la contourne pour le
   Swift ; elle continue de bloquer tout lancement à la demande de la suite complète.

Point d'entrée : `.github/workflows/ios-tests.yml` (en-tête « PR GATE RESTORED, COMPILE-ONLY ») et
son garde `packages/shared/__tests__/ci/ios-pr-compile-gate.test.ts`.

---

# Cycle 83 — La routine cesse de merger du Swift que rien n'a compilé

## La mesure que la tête du cycle 83 exigeait

La consigne était explicite : *« combien de PR touchent `apps/ios/**` simultanément ? Si c'est 1-2,
un job de 10-18 min ne sature rien. Si c'est 5-6, la réponse est encore non. Mesurer d'abord,
câbler ensuite. »*

Le clone de la session était **shallow** (82 commits de premier parent, ~1,5 jour) — la première
mesure tentée portait donc sur 3 jours en se croyant sur 30. Approfondi
(`git fetch --shallow-since="35 days ago"`, 2 178 commits, retour au 2026-07-08), puis : pour chaque
merge de premier parent sur `main`, les commits propres au côté fusionné qui touchent
`apps/ios/**` ou `packages/MeeshySDK/**` ; commits à moins de 5 min regroupés en une poussée ; chaque
poussée ouvre une fenêtre de 18 min, tronquée par la poussée suivante sur la même PR — c'est ce que
fait `cancel-in-progress`.

**148 PR, 340 poussées sur 30 jours.** Concurrence pondérée par le temps :

| runs iOS en vol | part du temps calendaire |
|---|---|
| ≥ 1 | 8,9 % (64,2 h / 720) |
| ≥ 2 | 1,9 % (13,4 h) |
| ≥ 3 | 0,7 % (5,1 h) |
| ≥ 5 | 0,2 % (1,6 h) |

**La réponse est 1-2, pas 5-6.** La fenêtre est vide 91 % du temps. Le chiffre de juillet est
atteint 1,6 h par mois, et seulement dans des salves d'intégration groupée — dont les horodatages de
commits SURESTIMENT les poussées réelles (une session humaine qui merge dix vieilles branches d'un
coup produit dix commits rapprochés qui n'ont jamais été poussés séparément). Cette queue est donc
un MAJORANT. Ce qui saturait le plafond macOS n'était pas le déclencheur : c'était la suite complète
à 29-45 min derrière lui.

## Le correctif

Un seul job, un seul jeu d'étapes, une bascule nommée : `COMPILE_ONLY` vaut `'true'` sur le seul
événement `pull_request`. Elle gate les deux étapes qui coûtent le plus et prouvent le moins au
temps de la PR — celles que le fichier lui-même signalait comme « déjà séparées » :

- **provisionnement du runtime iOS 18.2** (~7 min, borné par le réseau) — inutile :
  `generic/platform=iOS Simulator` compile contre le SDK simulateur sans runtime installé ;
- **exécution des tests** (~8 min) — c'est le poste qui a saturé la file en juillet.

Reste `build-for-testing`, qui compile l'app **et les cibles de test** : un fichier de test qui ne
compile pas rougit, ce qui couvre l'autre moitié du Swift que la routine écrit. ~18 min à froid,
~10 min sur cache SPM chaud, sur le runner standard, au tarif standard.

**Le piège évité, et il est réel** : une destination générique n'a PAS d'architecture active, donc
`ONLY_ACTIVE_ARCH=YES` n'a rien à quoi se réduire et `xcodebuild` compile arm64 **et** x86_64 — le
double du poste le plus cher du job, soit un gate plus lent que la suite qu'il remplace. Les runners
`macos-15` sont Apple Silicon : l'architecture est épinglée explicitement (`ARCHS=arm64`) dans la
branche compile-seule, et `ONLY_ACTIVE_ARCH=YES` reste inchangé dans la branche simulateur.

Trois réglages de coût, chacun motivé sur place : `ready_for_review` ajouté aux `types` (sans lui,
une PR ouverte en brouillon puis marquée prête n'émet plus aucun événement et le gate serait sauté
en silence), les brouillons exclus par un `if` de job, et `timeout-minutes` ramené à 30 sur PR (50
reste le plafond de la suite complète — une compilation qui déborde 30 min est bloquée, pas lente).

## Vérification

- **RED prouvé avant tout YAML** : le garde écrit en premier, 8 échecs sur 10 contre le workflow
  d'origine. GREEN après câblage : 10/10.
- **Mutation appliquée et vérifiée (leçon 117) — 7 réversions, 7 rouges** : déclencheur
  `pull_request` retiré (3 témoins tombent), gate du simulateur retiré, gate des tests retiré,
  `ARCHS=arm64` retiré, `ready_for_review` retiré, `COMPILE_ONLY` figé à `'false'`, destination
  générique annulée. Restauré, re-vérifié vert.
- **Suite `shared` complète** : 52 fichiers, 1 506 tests verts (vitest 4.1.10), contre 51/1 496 au
  départ. `tsc --noEmit` : 0 erreur.
- **YAML re-parsé après édition** (`yaml.safe_load`) : 3 déclencheurs, 12 étapes, 5 conditionnées ;
  les expressions de `name`, `if`, `env` et `timeout-minutes` du job relues une à une.
- **Les deux branches du script bash exécutées** : `COMPILE_ONLY=true` →
  `generic/platform=iOS Simulator` + `ARCHS=arm64` ; `false` → `platform=iOS Simulator,id=<sim>` +
  `ONLY_ACTIVE_ARCH=YES`. `bash -n` propre.
- **Le gate s'est prouvé sur sa propre PR** (PR #2875, run #31564979638, job 94014846909) :
  `.github/workflows/ios-tests.yml` fait partie du filtre de chemins, donc cette PR-là a déclenché le
  job compile qu'elle introduisait. **Vert en 10m02**, cache SPM ET DerivedData froids, contre les
  35 min de la baseline `dev` :

  | étape | baseline `dev` | gate de PR |
  |---|---|---|
  | provision du runtime iOS 18.2 | 7m01 | **sautée (0 s)** |
  | résolution SPM (froide dans les deux cas) | 8m07 | 2m02 |
  | `build-for-testing` | 8m58 | **6m33** |
  | sauvegarde DerivedData | 40 s | 32 s |
  | `test-without-building` | 8m20 | **sautée (0 s)** |
  | **total** | **~35 min** | **10m02** |

  L'estimation d'avant câblage disait « ~18 min à froid, ~10 min à chaud » : le run FROID a fait le
  temps prédit pour un run CHAUD. Et le compile est **plus rapide** que celui de la baseline, pas
  plus lent — c'est la preuve observable que le pin `ARCHS=arm64` prend effet. Sa perte se verrait
  ici comme un compile environ double, jamais comme un échec.
- **Le régime permanent, mesuré au run suivant** (job 94017664432, caches SPM ET DerivedData
  chauds) : **4m54**. Restauration SPM 18 s (hit), DerivedData 14 s (hit, semé par le run froid),
  résolution SPM 23 s (contre 2m02), `build-for-testing` **3m19** en incrémental (contre 6m33),
  sauvegarde 17 s. **Un gate froid coûte ~10 min, le régime permanent ~5** — le froid ne revient
  que si la clé SPM (`project.yml`) change ou si la lignée DerivedData repart, pas à chaque PR.
- **Une des deux hypothèses de cache est levée** : les produits DerivedData d'un run compile-seule
  SONT réutilisés par le run compile-seule suivant (6m33 → 3m19). Reste non vérifié le cas
  CROISÉ — `generic/platform` ↔ `id=<sim>` — dont l'échec ne coûterait qu'un compile froid sur
  `dev`, jamais un résultat faux.
- **Les 16 checks de la PR verts** (Quality, Security, Build, shared, web, gateway, agent, Prisma,
  Python, audio, TTS, Voice API ; Trivy `neutral`, son état habituel).

## Où vit le garde, et pourquoi là

`packages/shared/__tests__/ci/ios-pr-compile-gate.test.ts`. La suite `shared` est celle que
`ci.yml` exécute sur **chaque** PR : c'est donc la seule qui puisse constater la disparition du gate
iOS. Le dépôt hébergeait déjà un garde d'hygiène sans rapport avec le runtime partagé au même
endroit (`esm-relative-imports.test.ts`), et le précédent Swift (`ArchiveSignatureStripGuardTests`)
ne s'exécuterait, lui, que sur `dev` — précisément le chemin qui ne surveille rien au bon moment.

Le retrait du 2026-07-27 était juste et n'a rien signalé pendant six semaines. Celui-ci rougira.

---

# Tête instruite pour le cycle 83 — les deux portes du gate iOS sont instruites, l'une est close par un droit, l'autre par une dépense

*Le cycle 82 a exécuté la consigne du cycle 81 : instruire une des deux portes avant tout Swift. Les
deux le sont. Aucune ne se referme par du code, et c'est le résultat.*

## Porte 2 — `actions: write` : close, re-mesurée aujourd'hui

`POST /repos/isopen-io/meeshy/actions/workflows/ios-tests.yml/dispatches` répond
**403 Resource not accessible by integration**. Le cycle 80 l'avait constaté depuis la CLI ; ce
cycle l'a rejoué depuis l'**intégration GitHub App** de la routine, qui est la seule identité dont
elle dispose. Ce n'est donc pas un défaut d'outil : le jeton de l'App n'a pas le droit `actions:
write` sur ce dépôt. Les runs `workflow_dispatch` existants sur `main` et sur une branche de
worktree (#30748751746, #31079195135) prouvent que la porte s'ouvre pour un humain — pas pour elle.

**C'est une décision d'accès, hors du code.** Rien qu'un cycle puisse écrire ne la lève. Elle est
remontée à la propriétaire de la routine.

## Porte 1 — `macos-15-xlarge` : ouverte, mais c'est une dépense, et la mesure dit qu'elle vise à côté

Décomposition RÉELLE d'un run vert de 35 min (#31488415343, `dev`, 2026-08-11, pas à pas) :

| étape | durée |
|---|---|
| checkout + Xcode + caches + XcodeGen | 38 s |
| **provision du runtime iOS 18.2** | **7 min 01** |
| **résolution SPM** (cache manqué) | **8 min 07** |
| sauvegarde du cache SPM | 36 s |
| **compilation (`build-for-testing`)** | **8 min 58** |
| sauvegarde de DerivedData | 40 s |
| **exécution des tests** | **8 min 20** |
| relevé + fin de job | 26 s |

Deux des quatre gros postes — téléchargement du runtime et résolution SPM, soit **15 min sur 35** —
sont bornés par le RÉSEAU, pas par le CPU. `macos-15-xlarge` ne les raccourcit pas. Il attaque les
17 min de compile+tests, qu'il peut plausiblement ramener à ~6-8 (plus de cœurs, assez de RAM pour
du vrai parallélisme, ce que l'en-tête du fichier appelle « the RIGHT fix »). Gain espéré : 35 min →
~24. Pas les « reliably under ~30 min » promis parce que le fichier ne comptait pas les 15 min de
réseau, mais un vrai gain — payé environ **2 à 4× la minute**, ce qui rend le run PLUS CHER en
valeur absolue malgré sa brièveté.

**Réponse à la question que le cycle 81 posait — « les deux gestes ne sont-ils pas UN SEUL ? » :
non.** Le trigger `pull_request` avait été retiré le 2026-07-27 pour une raison qui n'est pas la
durée du job mais la SATURATION du plafond de concurrence macOS du compte (24-49 min de pure attente
de runner, 5-6 runs de PR simultanés). Diviser la durée par 1,5 ne crée pas de runner ; la file
reste la file. Rétablir le trigger PR après un passage à xlarge referait exactement ce que la mesure
de juillet a puni, en plus cher.

## Ce que le cycle 83 devrait instruire à la place — une troisième porte, non explorée

Le gate qui manque à cette routine n'est pas « tous les tests iOS passent » : c'est **« le Swift que
je viens d'écrire compile »**. Les deux sont séparés dans le workflow depuis toujours
(`build-for-testing` puis `test-without-building`, étapes 10 et 12). Un job **compile seule** :

- n'a PAS besoin du runtime iOS 18.2 (`-destination 'generic/platform=iOS Simulator'` suffit à
  compiler) → **−7 min**, et le poste le plus variable disparaît ;
- n'exécute pas les tests → **−8 min**, le second poste variable disparaît ;
- coûte donc ≈ **18 min à froid, ~10 min avec le cache SPM chaud**, sur le runner standard, au tarif
  standard.

Reste la seule vraie question, celle que le 2026-07-27 a tranchée pour l'AUTRE job et qu'il faut
mesurer pour celui-ci : **combien de PR touchent `apps/ios/**` simultanément ?** Si c'est 1-2, un job
de 10-18 min ne sature rien et la routine cesse de merger du Swift non compilé. Si c'est 5-6, la
réponse est encore non, et il faut alors le restreindre (label d'opt-in, ou branches `claude/**`).
**Mesurer d'abord, câbler ensuite** — c'est la leçon 125, et elle vaut aussi pour la porte qu'on
ouvre soi-même.

Point d'entrée : `.github/workflows/ios-tests.yml` (en-tête « TRIGGER SCOPE (2026-07-27) », étapes
10 et 12), et l'historique des PR touchant `apps/ios/**` sur les 30 derniers jours.

---

# Cycle 82 — Le badge d'un invité de lien partagé ne pouvait que monter

## Ce que la tête demandait, et pourquoi le Swift n'a pas été touché

La tête du cycle 82 interdisait de partir en Swift avant d'avoir tranché une des deux portes du gate
iOS. Les deux sont instruites ci-dessus ; aucune ne se referme par du code. Le travail de ce cycle
est donc allé là où un gate RÉEL existe — la passerelle, dont les 654 suites tournent en local — et
il y a trouvé un défaut que le dépôt documentait sans le voir.

## Le défaut : le serveur compte les non-lus d'un invité, et refuse qu'il les acquitte

Trois faits que le dépôt porte déjà, chacun écrit délibérément :

- `MessageReadStatusService.getUnreadCount` résout son argument par `OR: [{ id }, { userId }]` — il
  SAIT compter pour un participant sans compte ;
- `emitUnreadCountsToRecipients` adresse `ROOMS.user(recipient.userId ?? recipient.id)` ;
- `AuthHandler` fait rejoindre cette room aux sockets anonymes, avec le motif écrit sur place :
  « joining anything else had already left anonymous participants without their unread badge ».

Le compte est donc tenu, et poussé. Ce qui manquait est la moitié qui le REMET À ZÉRO, et elle
manquait deux fois : la porte (`allowAnonymous: false` sur `message-read-status.ts` et sur les trois
routes de lecture de `conversations/messages.ts`) et la clé (six gardes filtrant `Participant.userId`
avec `authContext.userId`, qui vaut un `Participant.id` pour un anonyme).

**Le dépôt l'avait déjà constaté, sans le nommer comme un défaut serveur** :
`apps/web/components/common/bubble-stream-page.tsx` débranche son propre suivi de lecture pour les
sessions anonymes — « la route mark-as-read est JWT-only (allowAnonymous: false) — chaque flush
partirait en 401 » — trois lignes après avoir expliqué qu'un écran sans ce hook voit « son compteur
croître indéfiniment ». Le contournement client était la trace du défaut serveur.

## Le correctif

- **La porte** : `requireAuth: true, allowAnonymous: true` — « authentifié, avec ou sans compte ».
  Pas `optionalAuth` (`requireAuth: false`), qui laisserait entrer un appelant sans jeton. C'est
  exactement la configuration de `routes/reactions.ts` (« Les anonymes peuvent aussi réagir »), et
  l'invité envoyait déjà des messages par une route `optionalAuth`.
- **La clé** : un `resolveCallerParticipant` unique dans `access-control.ts`, dont la précédence
  (`participantId` d'abord, `userId` ensuite) est celle de `canAccessConversation` juste au-dessus —
  les deux fonctions répondent à la même question et ne peuvent plus diverger. Les contextes
  enregistrés ne portent jamais `participantId` (branche `type: 'user'` de `UnifiedAuthService`), la
  précédence est donc sans ambiguïté et non conventionnelle.
- Trois effets de bord réparés : les préférences de confidentialité d'un anonyme sont demandées EN
  TANT QU'anonyme ; `mark-unread` ne relit plus deux fois le même participant ; et
  `GET /messages/:messageId/read-status` cesse de filtrer l'appartenance EN RELATION (5ᵉ copie).

## Vérification

- **Suite passerelle complète** : `654/654` suites, `16 481` tests verts (`jest --maxWorkers=50%`),
  sous bun 1.3.11 après `prisma generate --generator client` + `packages/shared && bun run build`.
- `tsc --noEmit` sur `services/gateway` : **0 erreur**.
- **Mutation appliquée et vérifiée** (leçon 117) : production ramenée à `allowAnonymous: false` ET à
  une garde `where: { conversationId, userId, isActive }` ⇒ **3 témoins tombent** (options du
  middleware, identité de résolution, préférences d'anonyme). Restauré, re-vérifié vert.
- **Les doubles Prisma des nouveaux tests ÉVALUENT le `where`** (`helpers/mongo-where`, déjà dans le
  dépôt) : une garde revenue à `userId` seul ne trouve plus la ligne anonyme et rougit. Un
  `mockResolvedValue` constant, lui, aurait passé dans les deux sens — c'est ainsi que le défaut a
  traversé des suites vertes pendant des mois.
- **Quatre fichiers de test corrigés, pas contournés** : ceux qui doublaient `access-control` en
  entier rendaient `resolveCallerParticipant` indéfini ; ils gardent désormais l'implémentation
  RÉELLE (`jest.requireActual`) et ne doublent que `canAccessConversation`. Le double de
  `departed-member-status-gates` a été enseigné à discriminer sur `isActive` par
  `participant.findFirst` — la garde qu'il mesure reste mesurée.
- iOS : **aucune ligne de Swift**, et aucune n'était nécessaire — `APIClient.swift` envoie déjà
  `X-Session-Token` et `ConversationService.swift` appelle exactement `/mark-read` et `/mark-unread`.

## Reste ouvert après ce cycle

- **Le gate iOS** — voir la tête du cycle 83. Les deux portes prescrites sont closes ; la troisième
  (job compile seule) est chiffrée mais demande une mesure de concurrence avant d'être câblée.
- **La webapp ne rebranche PAS son suivi de lecture dans ce lot.** Le blocage y est ailleurs :
  `apiService` (`apps/web/services/api.service.ts`) ne pose que `Authorization: Bearer` et ignore
  `X-Session-Token` — un flush anonyme partirait en 401 sans avoir touché la nouvelle porte. Le
  geste correct est de faire porter le jeton de session à `apiService` (le chemin anonyme du web
  l'ajoute aujourd'hui à la main, service par service : `anonymous-chat.service.ts`,
  `link-conversation.service.ts`, `message-translation.service.ts`, `tusUploadService.ts` — quatre
  copies), PUIS de retirer l'exclusion `isAnonymousMode` de `bubble-stream-page.tsx`. Chantier
  web à part entière, avec sa propre suite.
- **Les autres routes filtrant `Participant` par `userId` n'ont pas toutes été auditées.** Ce cycle a
  traité la famille lecture/non-lus. `calls.ts`, `sync.ts`, `translation-non-blocking.ts`,
  `messages-advanced.ts`, `conversations/leave.ts`, `participants.ts` portent le même motif ; pour
  certaines c'est délibéré (un invité ne gère pas les membres), pour d'autres il faudra regarder.
  `resolveCallerParticipant` existe maintenant pour celles qui doivent changer.
- Les points hérités des cycles précédents restent ouverts tels quels.

---

# Cycle 81 — Le tray coupé à 50 sur le web, et un intent write-ahead qui courait contre son propre succès

## Ce que la tête annonçait, et ce que l'inventaire a répondu

**Borne 1 levée sans ambiguïté : une des deux copies est morte.** `apps/web/services/posts.service.ts`
et `apps/web/services/story.service.ts` déclaraient tous deux un `getStories()` appelant
`GET /posts/feed/stories` sans paramètre. `rg` exhaustif des consommateurs : `postsService.getStories`
n'a **aucun lecteur de production** — sa seule occurrence dans tout le dépôt est son propre test
(`__tests__/services/posts.service.test.ts:49`). Le lecteur vivant est
`storyService.getStories`, via `hooks/social/use-stories.ts:26` (`useStoriesFeedQuery`). La copie
morte est supprimée, son test avec ; paginer les deux aurait dupliqué la dette, comme la tête le
craignait — mais la question n'était même pas « laquelle garder », c'était « laquelle existe ».

**Borne 2 respectée : rien de la troncature de tombstones n'a été transposé.** Le web ne passe
jamais `updatedSince`, donc `meta.deletedStoryIds` lui vaut toujours `[]` et
`meta.deletedStoryIdsTruncated` toujours `false`. L'escalade sur troncature du cycle 80 n'a
strictement rien à faire ici, et n'y est pas.

## Le correctif web

`storyService.getStories` drainait une page unique et jetait l'enveloppe : ni `limit`, ni `cursor`,
aucune lecture de `pagination.hasMore`/`nextCursor`. Le tray web était donc coupé à 50 stories
exactement comme celui d'iOS avant le cycle 80.

Il draine désormais, avec les **deux arrêts** que le cycle 80 avait établis comme nécessaires et
distincts :

- **Plafond de pages** (`STORY_TRAY_MAX_PAGES_PER_PASS = 6`, valeur miroir d'iOS) — protège contre
  un serveur qui annoncerait `hasMore` sans fin. Ce n'est PAS une protection de bande passante : le
  tray ne préfetche aucun média par page.
- **`hasMore` sans curseur ⇒ arrêt** (cycle 80, D2) — une page suivante qu'on ne sait pas demander ;
  boucler dessus rejouerait la même page indéfiniment. Deux témoins, `null` et `''`.

La pagination de cette route est réellement exacte (fenêtre filtrée par `updatedAt`, mais curseur
porté sur le couple `(createdAt, id)` de l'ordre) — c'est ce qui rend le drain suffisant, sans
l'escalade dont le cycle 79 avait besoin.

## Le défaut qui n'était pas au programme — et qui rougissait le gate

En exécutant la consigne du cycle 80 (« vérifier l'état de iOS Tests avant tout »), le dernier run
sur `dev` (#31543763910, 5471 verts) portait **2 rouges**, dont un jamais consigné :
`StoryUploadQueueTests.test_uploadSucceeds_dequeuesItsWriteAheadIntent`. Le fichier n'avait pas
bougé depuis `0737b063` et deux runs antérieurs du même code étaient verts : **intermittent**, donc
une course, pas une régression.

La course est dans la production, pas dans le test. `StoryViewModel.launchUploadTask`, sur succès
serveur, retirait l'intent write-ahead dans un `Task.detached` — puis, sans aucune synchronisation,
vidait `activeUploads`, affichait le toast de succès et libérait le slot. Rien n'ordonne les deux.
Le test observe la fin visible (`activeUploads.isEmpty`) et lit la queue : il gagne ou perd la
course selon l'ordonnancement.

**Ce que la course coûte en production, et pourquoi ce n'est pas qu'un test flaky** : le commentaire
du site le dit lui-même — « sinon le boot suivant re-publierait ». L'intent est le garde-fou contre
la re-publication ; le détacher de la déclaration de succès ouvre une fenêtre où l'app peut mourir
avec l'intent encore en base alors que la story est **déjà en ligne**. Le drain de boot la publie
une seconde fois.

Le retrait est donc désormais **awaité** — la tâche englobante est déjà `async`, la mesure ne coûte
qu'un saut d'acteur. C'est exactement le geste que le chemin de drain hors-ligne
(`executeQueuedPublish`, ligne ~2518) applique depuis toujours : le `Task.detached` du chemin online
était l'incohérence, pas la règle. Le ménage disque, lui, RESTE détaché — c'est de l'IO synchrone
`nonisolated` qu'on ne veut pas sur le MainActor, et aucun boot n'en dépend une fois l'intent parti.

## Le second rouge : déjà réparé sur `main`, et pour une raison instructive

`CallViewAccessibilityTests.test_hasActiveEffects_alsoChecksAdvancedFilters_notIsEnabledAlone` est
un garde de SOURCE : il cherche `hasAdvancedFilters` dans une fenêtre de N caractères après la
déclaration de `hasActiveEffects`. La production était déjà correcte ; le token se trouve à
**exactement 500 caractères** de la déclaration, sous une fenêtre de 500 — `[i, i+500)` s'arrête un
caractère avant de pouvoir matcher. `180e364f` a élargi à 700 sur `main`, donc ce rouge est éteint.

Aucun correctif supplémentaire n'a été tenté ici, **délibérément** : réécrire un scanner de source
en Swift non compilable (cf. tête du cycle 82) pour gagner de la robustesse est un mauvais échange.
Follow-up ci-dessous.

## Vérification

- **Suite web complète** : `561/561` suites, `12 062` tests verts, 21 skipped (`jest --maxWorkers=50%`).
- **Mutations appliquées et vérifiées** (leçon 117), trois fois, revert confirmé par grep :
  - production ramenée à la page unique ⇒ **3 témoins tombent** (drain, plafond, signature d'appel) ;
  - garde `!nextCursor` retirée ⇒ **les 2 témoins** `hasMore`-sans-curseur tombent (`null` et `''`) ;
  - plafond 6 → 9 ⇒ **le témoin de plafond** tombe.
- `tsc --noEmit` sur `apps/web` : **1757 erreurs avant, 1757 après** — base pré-existante inchangée,
  et **zéro** sur les fichiers touchés (`services/story.service.ts`, `services/posts.service.ts`).
  Relevé après `prisma generate --generator client` + `packages/shared && bun run build`, donc le
  chiffre n'est pas un artefact d'install incomplète.
- **Local sous bun 1.3.11**, pas 1.3.14 comme la CI (`bun upgrade` non tenté dans le conteneur) —
  l'écart n'a pas mordu ici (aucun test de couverture relevé), mais il est réel.
- iOS : **rien n'a compilé le lot `apps/ios`**, même contrainte qu'au cycle 80 (pas de toolchain
  Swift dans le conteneur, `ios-tests.yml` ne tourne pas sur PR, dispatch manuel `403`). Mitigation :
  aucun fichier ni symbole neuf, 2 lignes déplacées dans un `do { try await … }` déjà async,
  `await` sur un acteur déjà awaité 6 lignes plus haut dans le même fichier.

## Reste ouvert après ce cycle

- **Le gate iOS lui-même** — voir la tête du cycle 82. C'est le vrai reliquat, et il commande tout
  travail iOS futur de cette routine.
- **`cancelUpload(id:)` garde le même `Task.detached` pour le même intent**, et il n'est PAS
  réparable de la même façon : c'est une `func` synchrone appelée depuis l'UI, elle ne peut pas
  awaiter. La fenêtre y est la même (annulation confirmée à l'écran, intent encore en base ⇒ le
  drain de boot publie une story que l'utilisateur a annulée). Le geste correct est probablement de
  rendre le chemin d'annulation async, ou de faire porter au drain de boot une vérification
  « cette story a-t-elle déjà été publiée/annulée ». Chantier à part entière, pas un mini-fix.
- **Le garde de source `hasActiveEffects` reste une fenêtre de N caractères** — 700 aujourd'hui, ce
  qui laisse 200 de marge. Toute ligne de commentaire ajoutée dans ce bloc le re-rougit sans qu'un
  seul comportement change. Le geste robuste est de scanner jusqu'à l'accolade fermante appariée de
  la propriété ; il vaut mieux le faire quand le gate iOS sait dire oui.
- **Le web n'a toujours aucun delta stories** (`updatedSince` jamais passé) : `staleTime: Infinity`
  + invalidations socket. Ce n'est pas un défaut du tray, c'est une capacité absente ; la comparer à
  iOS demanderait d'abord de décider si le web en a besoin.
- **Le drain web ne lit pas `meta.mentionedUsers`** — il ne le lisait pas avant non plus (aucune
  régression), mais si un jour il le fait, l'union inter-pages sera à écrire, pas juste la dernière
  page à garder.
- **`STORY_TRAY_PAGE_LIMIT`/`STORY_TRAY_MAX_PAGES_PER_PASS` sont tenues à la main** face au
  `Math.min(limit, 50)` du serveur, comme leurs jumelles iOS. Troisième cycle consécutif à relever
  cette dette de constantes non liées (`deltaPageLimit`/`DELTA_PAGE_LIMIT` au 79, `trayPageLimit` au
  80) : le motif mériterait un geste unique — exposer les plafonds de la route dans
  `packages/shared` et les lire des deux côtés.

---
# Cycle 80 — Deux troncatures, deux gestes opposés : l'une se pagine, l'autre s'escalade

## Le défaut

`GET /posts/feed/stories` plafonne `limit` à 50 et annonce la suite par
`pagination.hasMore`/`nextCursor`. **Ces deux champs n'avaient aucun lecteur dans tout le dépôt** —
`rg` sur `apps/ios`, `packages/MeeshySDK` et `apps/web` : les 3 call sites iOS passent
`cursor: nil` et ne lisent jamais `pagination`. Le tray était donc coupé à 50 stories pour tout le
monde, sans qu'une ligne de code puisse s'en apercevoir.

Et le plafond des tombstones (`STORY_TOMBSTONE_LIMIT = 500`) n'était signalé que par un
`logger.warn` **côté serveur** : un client dont les disparitions avaient été coupées gardait ses
stories fantômes en silence.

## Ce que l'inventaire a trouvé et que la tête n'annonçait pas

**Le fetch « complet » n'est pas complet — il emprunte la MÊME route plafonnée à 50.** La tête
proposait, en s'appuyant sur le cycle 79, d'escalader vers un full fetch sur `hasMore`. Ce geste
n'aurait **rien rattrapé** : `storyService.list(cursor: nil, limit: 50)` est une page unique, elle
aussi tronquée. Pire, c'est le chemin qui fait `storyGroups = groups` (REMPLACEMENT) puis sauve le
cache disque : la troncature n'y laissait pas un trou, elle EFFAÇAIT les stories coupées de l'état
affiché et gravait le résultat. Le défaut était donc plus grave sur le chemin que la tête
considérait comme le recours.

**La route offre une pagination réellement exacte, contrairement aux conversations.** La page est
filtrée par `updatedAt` mais ordonnée par `(createdAt, id)` — le mésappariement de la leçon 121 —
SAUF que son curseur porte sur ce même couple `(createdAt, id)`. Le parcours est donc exact : ni
saut ni doublon. C'est ce qui rend le drain suffisant ici là où le cycle 79 devait escalader.

**Le coût redouté n'existe pas.** `prefetchAllStoryMedia` est borné à `groups.prefix(8)` : drainer
6 pages ne télécharge pas un octet de média de plus. La borne de pages ne protège donc pas la
bande passante — elle protège contre un serveur qui annoncerait `hasMore` sans fin.

## L'ordre des gestes, qui EST le correctif

**Deux signaux de troncature, deux gestes OPPOSÉS** — et c'est le point du cycle :

- **Page tronquée ⇒ paginer.** Un curseur de reprise existe et il est exact. Escalader serait
  inutile (même plafond) et coûteux.
- **Tombstones tronqués ⇒ escalader.** Aucun curseur de reprise n'existe pour les disparitions :
  il n'y a pas de « page suivante » de tombstones à demander. Le seul geste qui fasse sortir les
  fantômes restants est le REMPLACEMENT du tray par un fetch complet.

Les confondre — appliquer le geste de l'un à l'autre — donnait dans un sens une escalade stérile,
dans l'autre une purge qu'on croit complète. Et l'escalade des tombstones ne devient *correcte*
que parce que le drain a été livré : sans lui, le fetch complet vers lequel on escalade serait
lui-même tronqué.

## D1 — la sonde plutôt que l'égalité, et pourquoi ce n'est pas cosmétique

`deletedIds.length === STORY_TOMBSTONE_LIMIT` ne distingue pas une page coupée d'une fenêtre de très
exactement 500 suppressions, qui est **complète**. Sous cette égalité, un tel utilisateur aurait
déclenché un fetch complet **à chaque delta**, indéfiniment, tant que sa fenêtre reste sur ce
nombre. La sonde (`take: LIMIT + 1` + slice) est le patron que la même méthode utilise déjà trois
lignes plus haut pour `hasMore` — il n'y avait pas de raison de l'abandonner ici.

## D2 — un `hasMore` sans curseur s'arrête, il ne rejoue pas

`hasMore: true` avec `nextCursor` nul ou vide est une page suivante qu'on ne sait pas demander.
Boucler dessus rejouerait la même page indéfiniment ; le drain s'arrête. Témoin dédié
(`test_fullFetch_stopsWhenHasMoreCarriesNoCursor`), parce que c'est exactement le genre de branche
qu'un serveur mal réveillé finit par produire.

## D3 — la fiche gwcontract-11 existait, et disait juste

`docs/reviews/2026-08-01-ios-local-first-realtime/06-reseau-et-contrat-gateway.md` prescrivait
déjà ce correctif de tombstones, sonde comprise, et nommait même le RED discriminant. Trouvée en
cherchant où documenter, pas avant. **Chercher la fiche d'audit AVANT de concevoir** aurait fait
gagner l'aller-retour de conception — le backlog du dépôt est une source, pas seulement un
registre. Elle est marquée LIVRÉ, avec la mention du défaut voisin qu'elle ne listait pas.

## Vérification

- Gateway : `PostFeedService.test.ts` **64/64 vert**, `routes/posts/feed.test.ts` **46/46 vert**.
- **Mutations appliquées et vérifiées** (leçon 117) : l'égalité `=== LIMIT` remise en place fait
  tomber **2 témoins sur 2** (les deux qui distinguent sonde et heuristique) ; le retrait du champ
  `meta.deletedStoryIdsTruncated` de la route fait tomber ses **2 témoins**. Reverts confirmés par
  grep après coup.
- `tsc --noEmit` gateway : 0 erreur (après `packages/shared && bun run build`).
- Suite gateway **complète** (`bun run test:coverage`, parité CI) : **653/653 suites, 16 462/16 462
  tests**, exit 0. (Le pourcentage global de couverture n'a pas été relevé — la commande était
  filtrée par `| tail -35`, qui a coupé la ligne `All files`. Aucun témoin retiré, donc la
  couverture ne peut que monter sur les fichiers touchés ; le chiffre n'est pas rapporté plutôt que
  deviné.)
- **CI de la PR #2867 : tous les checks verts** — `Quality (bun)`, `Build (bun)`, `Security`,
  `Test gateway`, `Test shared`, `Test web`, `Test agent`, `Test Python (translator)`, `Prisma`,
  `Audio Pipeline`, `TTS/STT`, `Voice API`, `Summary`, et **`sdk-tests`** (qui compile
  `packages/MeeshySDK` et valide donc le décodage du nouveau champ). `Trivy` neutre,
  `Voice E2E Benchmark` sauté — comme sur les PR précédentes.
- iOS : 9 témoins ajoutés à `StoryViewModelTests` (drain de pages, chaînage des curseurs, plafond
  de pages, `hasMore` sans curseur, union des tombstones inter-pages, escalade sur troncature,
  non-escalade sur fenêtre complète, rétro-compat `meta` absent). **Ces 9 témoins n'ont été
  exécutés par personne** — voir §Reste ouvert, c'est la limite la plus importante de ce cycle.
- Aucun fichier Swift NEUF : les témoins vivent dans des suites déjà enregistrées au pbxproj —
  donc pas d'orphelin possible (leçon 120).

## Reste ouvert après ce cycle

- **⚠️ LE LOT `apps/ios` A ÉTÉ MERGÉ SANS AVOIR ÉTÉ COMPILÉ NULLE PART.** À dire franchement,
  parce que c'est un écart au gate documenté d'`apps/ios/CLAUDE.md` (« `./apps/ios/meeshy.sh test`
  MUST pass before any commit ») et que les cycles suivants doivent le savoir. Trois faits qui se
  cumulent, aucun contournable depuis la routine :
  1. **pas de toolchain Swift dans le conteneur** (`swift`/`xcodebuild` absents — vérifié, pas
     supposé) ;
  2. **`ios-tests.yml` ne tourne pas sur une PR** : son trigger est `push` sur `dev` +
     `workflow_dispatch` ;
  3. **le dispatch manuel est REFUSÉ à l'intégration** (`403 Resource not accessible by
     integration`) — donc la porte de sortie que le workflow prévoit exprès pour ce cas est fermée
     à cette routine.
  `sdk-tests` couvre `packages/MeeshySDK` (donc `APIResponseMeta`), mais **rien** ne compile
  `apps/ios/**`. Différence matérielle avec le cycle 79, qui touchait le SDK et était donc bien
  gaté : **ne pas se référer à ce précédent pour conclure « la routine sait gater l'iOS ».**
  Mitigation appliquée à défaut : revue statique ciblée (équilibrage des accolades comparé à HEAD
  pour écarter les artefacts du parseur maison, aplatissement du chaînage d'optionnels
  `pagination?.hasMore`, inférence générique de `JSONStub.decode` sous `return` implicite,
  interpolation `os.Logger` avec `privacy:`, continuations `\` et indentation des littéraux
  multi-lignes, isolation des types imbriqués dans une classe `@MainActor`), et **aucun fichier
  Swift neuf** donc aucun risque d'orphelin pbxproj. Points de rupture les plus probables s'il y a
  une erreur : la compilation du drain (`DrainedStoryPages`, `for _ in 0..<Self.maxTrayPagesPerPass`)
  et la file `listResults` du mock.
  **Action pour le prochain cycle : commencer par vérifier l'état de « iOS Tests » sur `dev`/`main`
  et corriger sans délai ce qui viendrait de ce lot.** Et si la routine doit continuer à toucher
  `apps/ios`, la vraie correction est structurelle : obtenir le droit `actions: write` pour
  l'intégration, ou ajouter un trigger `pull_request` restreint aux chemins `apps/ios/**`.
- **Le tray WEB reste coupé à 50**, et deux services se disputent la route. Voir la tête du
  cycle 81 ci-dessus.
- **`maxTrayPagesPerPass = 6` est une borne tenue à la main**, comme `trayPageLimit = 50` face au
  `Math.min(limit, 50)` de la route. Rien de mécanique ne les lie — même dette jumelle que
  `deltaPageLimit`/`DELTA_PAGE_LIMIT` relevée au cycle 79.
- **Le drain ne déduplique pas entre pages.** Une story dont l'`updatedAt` bouge PENDANT la passe
  peut apparaître deux fois (la borne keyset porte sur `createdAt`, pas sur ce qui a changé).
  `toStoryGroups` + `insertOrMergeStoryGroups` dédupliquent par id en aval, donc l'effet est nul
  aujourd'hui — mais c'est une propriété du consommateur, pas du drain.

---

# Cycle 79 — Un curseur persisté qui avance sur une page dont on ignore si elle est complète

## Le défaut

`ConversationSyncEngine.deltaSyncCore` (SDK iOS) demandait `limit=500` à
`GET /conversations?updatedSince=`, que la route plafonne à 100
(`Math.min(parseInt(limit), 100)`). Puis il avançait `lastSyncTimestamp` au max des `updatedAt`
REÇUS — **sans jamais regarder si la page avait été coupée**.

Le tri par `updatedAt` croissant livré au cycle 77 fait pointer le curseur sur les lignes coupées
dans le cas général : la troncature y est devenue une pagination. Le résidu que l'ordre ne rattrape
pas est celui de plus de 100 conversations partageant la MÊME milliseconde d'`updatedAt` : la borne
serveur est stricte (`gt`), donc le débordement était enjambé **définitivement**, jusqu'à la
réconciliation complète bornée à 1× par 24 h. Entre les deux, la liste iOS affichait des compteurs
de non-lus et des aperçus périmés sans qu'aucun signal ne l'indique.

## Ce que l'inventaire a trouvé et que la tête n'annonçait pas

**Le serveur dit déjà la vérité, personne ne l'écoutait.** Une page delta part toujours
d'`offset=0`, et la route ne compte alors PAS un total décoratif : elle exécute
`prisma.conversation.count({ where: whereClause })` sur la **même clause `updatedAt > since`**
(`routes/conversations/core.ts`, branche `totalCount > 0 && (includeCount || offset === 0)`).
Son `pagination.hasMore` vaut donc exactement « la fenêtre contenait plus de lignes que cette page
n'en rend ». La tête proposait de détecter la troncature par `count >= limit` — l'heuristique du
web. Le signal autoritaire était disponible des deux côtés depuis toujours.

**La différence n'est pas cosmétique** : `count >= limit` escalade sur une fenêtre de très
exactement 100 conversations, qui est pourtant COMPLÈTE. Sur le web, cette escalade est une
relecture de TOUTES les pages chargées — précisément ce que le cycle 77 avait retiré du chemin de
focus. Le web a donc été corrigé dans le même lot : il lit `pagination.hasMore`, dont
`getConversations` porte déjà le repli conservateur `length >= limit` quand la réponse omet son
bloc pagination.

## L'ordre des gestes, qui EST le correctif

Ne pas avancer le curseur, PUIS escalader. Pas l'inverse, et pas seulement escalader :
`fullSync()` peut échouer (offline, panne gateway), et un curseur persisté déjà avancé aurait
survécu à cet échec — les lignes coupées auraient été perdues pour de bon, le delta suivant
repartant d'après elles. Parce que le curseur est resté en arrière, une escalade échouée laisse la
fenêtre **entière** rejouable au prochain delta. La fusion de la page reçue, elle, est conservée
dans les deux cas : ce qu'on a reçu est vrai, c'est seulement la COUVERTURE qui n'est pas prouvée.

## D1 — la divergence web/iOS sur le curseur est assumée, pas une dette

Le web ne peut pas « ne pas avancer » : son curseur est RECALCULÉ depuis le cache à chaque passe,
donc fusionner la page l'avance mécaniquement. iOS PERSISTE le sien. Deux natures, deux gestes —
et c'est le curseur persisté qui exige la garde, puisque lui seul survit à l'échec de l'escalade.
La note est écrite en tête de `syncSinceLastCheckpoint` pour que la prochaine passe de parité ne
« corrige » pas l'un vers l'autre.

## D2 — `limit=500` n'était pas qu'une coquette inexactitude

Le corriger à 100 ne change rien au nombre de lignes rendues — la route plafonnait déjà. Mais le
repli heuristique `data.count >= deltaPageLimit`, celui qui sert quand une réponse n'annonce pas sa
pagination, **n'aurait jamais pu déclencher** sous `limit=500`. Un mensonge de constante avait
désactivé silencieusement le filet de sécurité qu'on venait d'écrire.

## Vérification

- `apps/web` : suite `use-conversations-delta-sync` **28/28 verte**, dont le nouveau témoin
  « page de très exactement 100 que le serveur dit complète ⇒ aucune escalade », **vérifié ROUGE**
  contre l'ancienne règle `length >= DELTA_PAGE_LIMIT` avant d'être livré.
- `apps/web` (large) : `__tests__/hooks` + `__tests__/lib/conversations` — 2 003 tests verts,
  2 sautés. Les 6 suites qui ne démarrent pas (posts/commentaires/register/encryption) échouent sur
  de la résolution de module dans ce conteneur, sans rapport avec le lot.
- `tsc --noEmit` : aucune erreur sur les fichiers touchés.
- SDK iOS : 4 témoins d'ingénierie (`ConversationSyncEngineTests`) + 3 témoins de règle pure
  (`SyncWatermarkTests`) — pas de toolchain Swift dans ce conteneur, la validation passe par
  `sdk-tests.yml` (macOS) sur la PR.

## Reste ouvert après ce cycle

- **Le résidu même-milliseconde n'est pas FERMÉ, il est rendu convergent.** Une fenêtre de plus de
  100 conversations à la même milliseconde escalade désormais vers `fullSync` ; elle ne se rattrape
  toujours pas par pagination delta. Fermer vraiment demanderait un curseur composite
  `(updatedAt, id)` côté route — chantier de contrat.
- **La troncature de tombstones du delta des stories est le même angle mort, un cran plus grave**
  (le serveur la journalise sans la dire au client). Voir la tête du cycle 80 ci-dessus.
- **`ConversationSyncEngine.deltaPageLimit` et `DELTA_PAGE_LIMIT` (web) restent deux constantes
  jumelles tenues à la main**, comme `fullReconcileInterval` / `FULL_RECONCILE_INTERVAL_MS`. Rien
  de mécanique ne les lie au `Math.min(limit, 100)` de la route.

---

# Cycle 78 — Une dizaine d'écrivains tenaient un cache que personne ne lisait

## Le défaut

`queryKeys.conversations` exposait deux formes de liste : `lists()` / `list(filters)` valant
`['conversations','list', …]`, et `infinite()` valant `['conversations','infinite']`. **Les deux
préfixes sont DISJOINTS** — un `setQueriesData` sur l'un ne touche jamais l'autre.

Et **aucun écran ne lisait la forme plate.** La sidebar passe par `useConversationsPaginationRQ`
→ `useInfiniteConversationsQuery`, donc `infinite()`. `rg` sur tout le dépôt : les hooks de la
forme plate n'apparaissaient que dans leur propre fichier, leur fichier de témoins, et le baril
`hooks/queries/index.ts`.

Une dizaine d'écrivains l'alimentaient quand même, à chaque événement.

Le coût n'était pas la performance — un `setQueriesData` sans correspondance est un no-op. C'était
la LECTURE : le code se lisait comme si deux caches étaient tenus en phase alors qu'un seul
existait. Le prochain à corriger un aperçu de liste avait une chance sur deux de corriger la copie
morte et de conclure que son correctif ne marchait pas.

## Ce que l'inventaire a trouvé et que la tête n'annonçait pas

**Les témoins passaient au vert sans rien prouver.** Trois blocs de `use-socket-cache-sync` —
« déplacer la conversation en tête sur message:new », « avancer l'aperçu quand le dernier message
est supprimé », « purger la conversation refusée » — n'étaient assertés QUE sur la forme plate. Le
chemin réel, celui que la sidebar lit, n'avait donc **aucune couverture**. C'est le vrai danger
d'un cache mort : il ne se contente pas de dormir, il capte les témoins.

**`use-send-message-mutation.ts` était mort en entier.** Ses quatre mutations
(`useSendMessageMutation`, `useEditMessageMutation`, `useDeleteMessageMutation`,
`useMarkAsReadMutation`) n'ont aucun appelant : l'envoi réel passe par l'orchestrateur Socket.IO
(`services/socketio/orchestrator.service.ts` + `createOptimisticMessage`). Le module est un vestige
d'une approche abandonnée. Ses six écritures de liste n'étaient PAS doublées d'une écriture
`infinite()` — les « corriger » plutôt que les supprimer aurait ressuscité un chemin d'envoi
concurrent de celui qui fonctionne.

**Deux `invalidateQueries` de réaction ne visaient rien.** `use-reactions-query.ts` invalidait
`conversations.lists()` sur réaction ajoutée / retirée, commentaire à l'appui (« réaction ajoutée =
conversation modifiée »). Préfixe disjoint ⇒ **l'intention déclarée ne s'exécutait jamais.**

## L'ordre des gestes, qui EST le correctif

Rebrancher les témoins sur `infinite()` **avant** de retirer quoi que ce soit, puis vérifier qu'ils
sont ROUGES contre une écriture `infinite()` cassée. Fait : neutraliser
`updateInfiniteConversationCache` dans `advanceConversationPreviewOnDelete` fait tomber 3 témoins
sur 30. Sans cette étape, le retrait des écritures plates aurait fait passer les témoins du vert au
vert — en supprimant toute couverture du chemin réel sans qu'une seule ligne ne rougisse.

## D1 — rediriger n'est pas toujours le geste juste

Pour les six écritures de `use-socket-cache-sync`, chacune était DOUBLÉE d'une écriture `infinite()`
identique : le retrait est strictement neutre. Pour les deux invalidations de réaction, rediriger
vers `infinite()` aurait déclenché **une relecture de TOUTES les pages chargées à chaque réaction**
— exactement ce que le cycle 77 (lot focus) venait de retirer du chemin de focus. Vérifié avant de
trancher : la ligne de liste ne porte rien qui dépende des réactions de message
(`reaction={prefs?.reaction}` dans `ConversationList` est une PRÉFÉRENCE de conversation, pas un
agrégat de réactions). Supprimées.

## D2 — une option silencieusement ignorée est un piège de la même famille

`useInfiniteConversationsQuery` acceptait un `filters` que sa clé de requête n'incluait pas : un
appelant qui l'aurait passé aurait reçu la liste NON filtrée, sans erreur. Retiré avec le reste.
Une liste filtrée, le jour où elle existera, devra naître avec sa propre clé ET son lecteur.

## Vérification

- `apps/web` : **561 suites, 12 055 tests verts**. Le compte de témoins baisse de 41 : ceux des
  hooks morts, qui ne testaient rien de vivant. Une suite en moins — le fichier de témoins du module
  supprimé.
- Les témoins rebranchés sur `infinite()` ont été vérifiés ROUGES contre une écriture cassée AVANT
  le retrait — la couverture est réelle, pas déplacée.
- `tsc --noEmit` : aucune erreur sur les fichiers touchés.
- Bilan : **545 lignes retirées, 92 ajoutées**, dont un fichier de production entier.

## Reste ouvert après ce cycle

- **`conversations.all` reste, et couvre bien `infinite()`** (préfixe commun). Les
  `invalidateQueries({ queryKey: conversations.all })` sont vivants et hors lot — ne pas les
  confondre avec ce qui vient d'être retiré.
- **La règle « un seul cache de liste » n'est portée que par une note** dans `apps/web/CLAUDE.md` et
  le commentaire de `queryKeys.conversations`. Rien de mécanique n'empêche une deuxième forme de
  renaître sans lecteur ; un lint maison sur « clé de requête sans `useQuery` correspondant » serait
  la seule garde réelle.
- **Le même audit n'a PAS été mené sur les autres familles de clés** (`posts`, `notifications`),
  qui portent toutes le couple `lists()` / `infinite()`. `queryKeys.messages.list` est, lui, bien
  vivant — il sert de PRÉFIXE à `messages.infinite(id)`. Les autres sont à instruire par le même
  `rg`, pas par déduction.

---

# Cycle 78 — Une réaction n'est pas une ligne de liste (et D1 a été livré par une autre session)

Ce cycle a instruit et corrigé les DEUX têtes ouvertes pour le cycle 78. Il n'en livre qu'une.
Le récit de la seconde est conservé ici parce qu'il vaut plus que le code retiré.

## D2 — deux invalidations de réaction ne matchaient aucun cache (LIVRÉ)

`use-reactions-query.ts` invalidait `conversations.lists()` (`['conversations','list']`) sur
réaction ajoutée / retirée, commentaire à l'appui : « réaction ajoutée = conversation modifiée ».
La sidebar lit `conversations.infinite()` : **préfixes disjoints, intention jamais exécutée.**
Panne silencieuse, pas code mort — le commentaire faisait foi pour le prochain lecteur.

Le geste juste n'était PAS de rediriger vers `infinite()` : ça aurait relu toutes les pages
chargées à chaque réaction, exactement le refetch que le cycle 77 venait de retirer du chemin de
focus. Vérifié avant de trancher : **une ligne de liste ne porte rien qui dérive des réactions**
(aperçu, non-lus, horodatage). Le `reaction` rendu par `ConversationList` est l'emoji de
PRÉFÉRENCE de conversation — homonyme, sans rapport.

Convergence : la PR #2860 (session parallèle, entrée ci-dessus) a supprimé les mêmes deux lignes
en retirant la forme plate. Ce qui reste ici est donc le **commentaire** qui dit pourquoi il n'y
a pas d'invalidation, plus les deux témoins. Un retrait silencieux invite le prochain lecteur à
« réparer l'invalidation manquante » ; c'est le seul piège encore ouvert sur ce site.

## D1 — la page delta tronquée : LIVRÉ PAR LA PR #2863, pas par ce cycle

Ce cycle avait écrit, testé et fait passer la CI (SDK Tests verts, runs #965/#967/#971) sur une
marche de pages : `limit=100` demandé, page courte = fin de fenêtre, page pleine = reprise SOUS
son groupe d'`updatedAt` le plus haut (`SyncWatermark.resumeAfterFullPage`), escalade vers
`fullSync` sur le seul résidu (page pleine à une milliseconde unique, ou au-delà de 5 pages).

Pendant la CI, la PR #2863 (« une page delta qui laisse du reste ne fait plus avancer le
curseur ») a été mergée sur `main` par une session parallèle. Elle corrige le MÊME défaut, plus
simplement : `advancedAfterDeltaPage(previous:receivedUpdatedAt:pageMayHaveMore:)` — si la page
laisse du reste, **le curseur ne bouge pas du tout**, et l'appelant escalade vers `fullSync`.

**Le merge a été résolu en faveur de `main`, intégralement.** Trois raisons, dans cet ordre :

1. **Leur détection est MEILLEURE que la mienne.** `mayHaveMore = pagination?.hasMore ??
   (data.count >= deltaPageLimit)` : le serveur ANNONCE le reste, et le comptage n'est que le
   repli. Ma version ne connaissait que le repli.
2. **Les deux mécanismes sont incompatibles, pas superposables.** Leur contrat testé dit « le
   curseur n'avance pas sur une page qui laisse du reste » ; ma marche, elle, AVANCE (sous le
   groupe du haut) pour paginer. Garder les deux, c'est faire échouer leurs témoins.
3. **Réécrire en résolution de merge un correctif déjà mergé et testé n'est pas un droit qu'on
   se donne.** L'instruction de la routine est explicite : gérer le merge à la main pour ne rien
   écraser. Le fait d'être arrivé deuxième ne rend pas ma version prioritaire.

Ce qui est retiré avec elle : `SyncWatermark.resumeAfterFullPage`, la boucle de pages,
`maxDeltaPages`, `DeltaSyncOutcome`, `MockAPIClient.stubSequence` et 10 témoins. Aucun n'a de
consommateur une fois `main` adopté ; les garder aurait été exactement la « plomberie
mensongère » que ce cycle dénonce par ailleurs.

### Ce qui reste vrai et non couvert par `main` — tête instruite pour un prochain cycle

`main` escalade vers `fullSync` sur **CHAQUE** page qui laisse du reste. C'est correct et
prudent, et c'est cher : dès que plus de 100 conversations bougent dans la fenêtre (reconnexion
après une longue coupure, compte à gros volume), le client relit sa liste ENTIÈRE au lieu de
tirer une deuxième page.

La marche paginée reste donc une amélioration réelle, mais elle doit être instruite CONTRE le
comportement désormais en place, pas contre l'ancien défaut. Deux bornes qui ne se devinent pas,
payées par ce cycle :

1. **Sur une page pleine, reprendre au max des `updatedAt` reçus est FAUX.** La coupure peut
   tomber au milieu d'un groupe partageant une milliseconde ; la borne stricte `gt` enjamberait
   ses survivantes. Le seul curseur sûr est le plus haut `updatedAt` STRICTEMENT inférieur au
   max de la page — le groupe du haut est alors relu entier (upsert idempotent).
2. **Il reste un résidu qu'aucun curseur ne franchit** : une page pleine dont toutes les lignes
   portent la même milliseconde. Là, et là seulement, l'escalade de `main` est la seule réponse.
   Une marche qui l'oublierait bouclerait à l'infini.

Fermer proprement demanderait plutôt un curseur composite `(updatedAt, id)` côté route —
chantier de contrat serveur, pas garde de client.

## Vérification

- **D2** : 2 témoins neufs, **RED observé** avant correctif (`flatFetch` appelé 2× au lieu de
  1×). Ils montent de VRAIS observateurs sur les deux formes de clé — une `invalidateQueries` ne
  refetch que les requêtes ACTIVES, donc un cache posé à la main (`setQueryData`/`fetchQuery`)
  serait resté muet et le témoin serait passé au vert sans rien prouver.
- Suite web complète : **561 suites / 12 057 tests verts** en local (bun/jest) après le merge de
  `main`.
- CI complète verte sur la tête (13 jobs) + SDK Tests verts.
- **D1 : la vérification de ce cycle a bien eu lieu et est verte** (SDK Tests #965, #967, #971
  sur la marche de pages) — elle ne prouve plus rien d'utile, puisque le code qu'elle couvrait
  a été retiré au profit de celui de `main`. C'est dit franchement plutôt qu'effacé : le coût
  d'un cycle est aussi ce qu'il jette.

## Addendum — trois sessions, un cycle, deux collisions

Ce cycle a collisionné DEUX fois avec des sessions parallèles :

| Tête | Session parallèle | Issue |
|---|---|---|
| D2 (invalidations mortes) | PR #2860 | convergence — les deux ont retiré les mêmes lignes ; ce cycle garde le commentaire |
| D1 (page delta tronquée) | PR #2863 | **collision** — leur version, mergée d'abord et mieux instrumentée, l'emporte intégralement |

Plus un troisième conflit, sans rapport avec le fond : `tasks/lane-cursor.md`, avancé par la
routine Android pendant le run. Résolu en faveur de `main` sans discussion — ce fichier est
l'état d'une AUTRE routine, et ce cycle n'avait aucune raison d'y écrire.

Trois collisions sur un cycle, ce n'est plus de la malchance : c'est le régime normal quand
plusieurs routines instruisent la MÊME liste de têtes ouvertes. La parade n'est pas de merger
plus vite — c'est de **relire `main` avant d'ouvrir une tête, pas seulement avant de merger**.
Une tête instruite dans `todo.md` n'est pas une réservation.

## Reste ouvert après ce cycle

- **La marche paginée** (ci-dessus), à instruire contre le comportement de `main`, avec ses deux
  bornes déjà payées.
- **Le résidu des égalités** — plus de 100 conversations à la même milliseconde — reste ouvert
  sur les deux plateformes ; il demande un curseur composite `(updatedAt, id)` côté route.
- **`apps/web` porte 1224 erreurs `tsc --noEmit` préexistantes** sous son propre tsconfig
  (aucune introduite ici ; le fichier de tests touché en portait déjà 20 de la même forme). Ce
  n'est pas un gate CI aujourd'hui, et c'est précisément pourquoi ça mérite d'être écrit.

---


# Cycle 77 — L'enrichissement audio n'atteignait que les lecteurs déjà dans le fil, et une page delta tronquée sautait des lignes

Deux défauts de la même famille, tous deux côté gateway, tous deux du type « la convergence
dépend de la ROUTE du lecteur plutôt que de son état » : le premier trouvé en balayant les
émetteurs qui n'adressent QUE `ROOMS.conversation(...)`, le second déjà instruit par la tête
du cycle 77 — dont la moitié SERVEUR se corrige sans toucher au client.

## D1 — `message:attachment-updated` devait trois audiences, en servait une

Whisper finit de transcrire une note vocale une à deux secondes après l'envoi ;
NLLB+Chatterbox rendent l'audio traduit langue par langue, plus tard encore. Chaque étape
écrit la pièce jointe en base et diffuse un delta — **dans la seule room de conversation**.

| Audience | Ce qu'elle perdait |
|---|---|
| lecteurs DANS le fil | rien — la seule servie |
| lecteurs sur la LISTE | iOS ne joint `conversation:<id>` qu'à **l'ouverture** du fil (`roomsToRejoinOnConnect`) : au lancement de l'app, un lecteur resté sur la liste n'est dans AUCUNE room de conversation |
| lecteurs HORS LIGNE | le `message:new` mis en file à l'ENVOI porte la pièce jointe SANS transcription ni audio traduit (ils n'existent pas encore) : sans rejeu, la copie rejouée à la reconnexion reste définitivement celle-là |

Vérifié, pas déduit : le SDK iOS applique ce delta **sans regarder quel fil est ouvert**
(`ConversationSyncEngine.handleAttachmentUpdated` patche le message en cache de n'importe
quelle conversation, no-op s'il est absent) — la room personnelle n'est donc pas une
audience plus large pour le principe, c'est là que l'écriture atterrit vraiment. Le web est
pareillement idempotent et clé par conversation (`use-socket-cache-sync`).

Même classe que les cycles 73/74 : le Prisme — « il s'applique à TOUT le contenu,
transcriptions audio comprises » — devenait fonction du fait d'avoir le fil ouvert au moment
où Whisper a fini.

Le correctif chaîne room de conversation + rooms personnelles (une seule copie par socket,
`emitToConversationParticipants`) et met l'enrichissement en file sous le nouveau
`eventType: 'attachment-updated'`, rejoué en `message:attachment-updated` au drain.

Deux points qui ne se devinent pas :

1. **`dedupKey` = l'id de la PIÈCE JOINTE.** L'identité par défaut `(messageId, eventType)`
   ferait superséder l'enrichissement de la première pièce jointe par celui de la seconde
   sur un message à deux audios. Par pièce jointe, la règle « le dernier payload gagne » est
   exactement la bonne : le payload porte l'état COMPLET de la pièce jointe.
2. **Aucun filtrage par langue du destinataire**, contrairement à `message:new`
   (`filterMessagePayloadForLanguages`). Les clients REMPLACENT la carte de traductions de
   la pièce jointe : un sous-ensemble par lecteur EFFACERAIT les langues qu'un fetch REST
   antérieur avait mises en cache. La bande passante n'est pas gratuite ; la corriger ici
   demanderait un contrat de fusion côté client, pas un filtre.

Une panne de la requête participants dégrade vers la room de conversation seule (l'audience
d'avant), jamais vers le silence.

## D2 — l'ordre d'une page delta décide si sa troncature est rattrapable

`GET /conversations?updatedSince=` plafonne à 100 et triait par `lastMessageAt` décroissant
— l'ordre de l'écran de liste, **sans aucun rapport avec le filtre**. Les deux clients
avancent pourtant leur watermark au max des `updatedAt` REÇUS : les lignes coupées étaient
enjambées **définitivement**, jusqu'à la réconciliation complète (1×/24 h sur iOS).

Trié par `updatedAt` croissant, les lignes coupées sont exactement celles d'`updatedAt`
SUPÉRIEUR à la dernière rendue : le watermark qui les enjambait pointe dessus. La troncature
devient une pagination naturelle, **sans aucun changement client** — la tête du cycle 77
proposait de câbler la détection côté iOS ; l'ordre serveur rend la détection presque sans
objet. `id` départage les égalités pour que deux appels identiques rendent la même page.

Résidu assumé, et il reste à la charge des clients (le web le couvre déjà via
`DELTA_PAGE_LIMIT` ⇒ relecture complète) : plus de 100 conversations portant la MÊME
milliseconde d'`updatedAt` (écriture en masse) débordent d'une page que la borne stricte
`gt` ne peut pas reprendre.

## Vérification

- **13 témoins neufs**, écrits AVANT le code, RED observé sur chacun :
  - `emitAttachmentUpdated.test.ts` (10) — l'audience chaînée dans l'ORDRE attendu, une
    seule émission pour un socket présent dans deux rooms, la mise en file des seuls hors
    ligne, l'auteur inclus (« Whisper et NLLB ne sont pas des gens »), la clé de dédup par
    pièce jointe, la réutilisation de la liste de participants (une requête, pas deux), et
    les deux dégradations : requête participants en panne ⇒ room de conversation seule,
    file en panne ⇒ l'émission live a quand même eu lieu.
  - `MeeshySocketIOManager.test.ts` (1) — `attachment-updated` rejoué en
    `MESSAGE_ATTACHMENT_UPDATED` au drain.
  - `conversation-core.test.ts` (3) — page delta triée par `updatedAt` croissant, page
    ordinaire et `updatedSince` illisible gardant l'ordre de récence.
- `tsc --noEmit` propre sur le gateway.

## Reste ouvert après ce cycle

- **Les deux têtes instruites pour le cycle 77 restent ouvertes** (voir ci-dessous), la
  première REDUITE par D2 : côté iOS il ne reste que la détection du résidu d'égalités,
  plus la perte systématique. La seconde (écrivains du cache PLAT côté web) est intacte.
- **`limit=500` demandé par `deltaSyncCore` reste un mensonge silencieux** — le plafond
  serveur est 100. Hygiène, sans effet sur le défaut, maintenant que la troncature se
  rattrape.
- **`message:attachment-updated` n'est pas filtré par langue** (voir D1 §2) : une
  conversation à N langues paie N diffusions complètes de la pièce jointe à tous les
  participants. Le rendre par destinataire suppose que les clients FUSIONNENT la carte de
  traductions au lieu de la remplacer — chantier de contrat client, à instruire avant tout
  code serveur.
- **`ATTACHMENT_STATUS_UPDATED` (`routes/messages.ts`) n'a pas été audité contre la même
  règle** — il porte un état par utilisateur (écouté/vu/téléchargé), donc sa room n'est
  peut-être pas la bonne non plus. À instruire, pas à déduire.
- **Aucun client iOS n'écoute `message:pending-delivered`** (le web s'en sert pour invalider
  les conversations touchées par un drain). Constaté en croisant les 110 `SERVER_EVENTS`
  avec les deux clients ; conséquence non mesurée.
- **`message:read-status-updated` n'a toujours aucun consommateur** : les deux clients
  écoutent le legacy `read-status:updated`, dual-émis depuis le 2026-07-05 avec une
  coexistence annoncée d'environ 3 mois (échéance ~2026-10-05). Migrer les clients est un
  geste par client, sûr tant que le serveur émet les deux ; retirer le legacy ne l'est pas
  avant qu'Android ait migré aussi.
- Les points hérités des cycles précédents restent ouverts tels quels (mentions du chemin de
  lien, `link:message:new` sans écouteur iOS, arbitrage `delete-for-me` du cycle 12, `eslint`
  impossible sur le gateway faute de `eslint.config.js`).

---
# Cycle 77 — Le retour d'onglet relisait la liste de conversations page par page, et l'écrasait

## Le défaut

`useInfiniteConversationsQuery` héritait du `refetchOnWindowFocus: 'always'` du QueryClient global.
Sur une `useInfiniteQuery`, ce réglage ne « rafraîchit » pas : il **rejoue TOUTES les pages
chargées et REMPLACE le cache**. Trois coûts distincts, pas un :

1. **Charge** — dix pages de scroll = dix requêtes à chaque retour d'onglet, sur une route qui
   charge participants, dernier message avec ses traductions et sa pièce jointe, et les compteurs
   de non-lus par curseur.
2. **Écrasement** — tout ce que la socket écrit pendant la séquence est remplacé par une réponse
   partie avant.
3. **Instabilité d'offset** — c'est le point qu'aucune note antérieure n'avait relevé. La route
   pagine par OFFSET sur un tri `lastMessageAt` DÉCROISSANT (`orderBy: { lastMessageAt: 'desc' }`,
   `services/gateway/src/routes/conversations/core.ts:498`). Les pages sont relues
   SÉQUENTIELLEMENT : un message arrivé entre la page k et la page k+1 promeut sa conversation en
   tête et décale toutes les pages suivantes d'un cran. Résultat : une ligne **dupliquée** à la
   frontière, une autre **disparue**. Sur une messagerie, ce n'est pas un cas rare — c'est le cas
   nominal dès qu'un onglet reprend le focus pendant qu'une conversation vit.

C'est exactement le réglage que `use-conversation-messages-rq.ts` avait désactivé pour le fil de
messages, motif écrit au-dessus de la ligne. La liste, elle, l'avait gardé.

## Ce qu'on ne pouvait PAS faire : basculer à `false`

Le refetch de focus était le SEUL chemin web qui purgeait une ligne **fantôme** — une conversation
hard-supprimée côté serveur. Le delta du cycle 76 est upsert-only : une ligne qui n'existe plus ne
revient dans AUCUNE réponse `updatedSince`, donc rien ne la retire. iOS avait rencontré ce cas
exact (E2E 2026-07-02, « Test Conv » épinglée et absente du serveur) et l'avait réglé par une
réconciliation complète bornée à 1× par 24 h. Le contenu du chantier était donc le **pendant web de
cette borne**, jamais la désactivation seule.

## Le correctif

- `refetchOnWindowFocus: false` sur `useInfiniteConversationsQuery`, dérogation documentée jumelle
  de celle du fil de messages.
- **Trigger 2 — focus** dans `useConversationsDeltaSync` : le focus tire le MÊME delta borné que le
  reconnect socket (une requête, fusion non destructrice), débouncé 1 s — la valeur de
  `FOCUS_CATCH_UP_DEBOUNCE_MS` du fil de messages, pour que les deux rattrapages répondent ensemble
  au même geste plutôt qu'en escalier. Il partage le garde anti-rafale de 5 s déjà en place.
- **Réconciliation complète bornée** : `invalidateQueries` sur la clé infinie, chaînée APRÈS un
  delta RÉUSSI, au plus 1× par 24 h. Pendant exact de `fullReconcileInterval` /
  `syncSinceLastCheckpoint` (SDK iOS). Horodatage dans `localStorage`
  (`meeshy_conversations_last_full_reconcile_at`, pendant de la clé `UserDefaults`
  `me.meeshy.lastFullReconcileAt`).

## Trois décisions qui ne se déduisent pas

**D1 — la réconciliation doit courir MÊME sur un delta VIDE.** L'ancien corps sortait tôt
(`if (conversations.length === 0) return;`). Y adosser la réconciliation aurait rendu la purge
**inatteignable** : une conversation hard-supprimée ne produit AUCUNE ligne de delta, donc le compte
calme — précisément celui qui garde son fantôme le plus longtemps — n'aurait jamais réconcilié. Le
corps a donc été restructuré : la fusion est conditionnelle, la réconciliation ne l'est pas.

**D2 — un delta ÉCHOUÉ ne réconcilie pas et ne consomme pas la fenêtre.** Même règle que
`syncSinceLastCheckpoint` sur iOS (`if ok && isFullReconcileDue`). Offline ou gateway en panne, on
garde le cache intact (local-first) plutôt que de déclencher une relecture complète qui échouera
aussi, et l'horodatage n'avance pas — le prochain déclenchement couvre la même fenêtre.

**D3 — la fenêtre de 24 h démarre au PREMIER delta, pas à l'époque zéro.** iOS part de
`.distantPast` et réconcilie donc au premier lancement. Le web ne peut pas copier ce choix : le
montage vient de lire le serveur en entier (`refetchOnMount: 'always'`), et réconcilier tout de
suite doublerait cette lecture pour rien. Un navigateur sans horodatage en reçoit donc un, daté de
maintenant, sans réconcilier.

Repli mémoire par QueryClient si `localStorage` jette (navigation privée, quota) : la borne dégrade
en « 1× par session », jamais en « à chaque focus » — le garde tient la valeur autoritaire, le
stockage n'en est que la persistance.

## Hygiène au passage

`mergeConversationDelta` était appelé avec un littéral portant **deux fois** la clé `hasMore`
(`{ hasMore, openConversationId, hasMore }`). Sans effet — la seconde écrasait la première avec la
même valeur — mais c'est le genre de ligne qui fait douter le prochain lecteur du contrat. Le corps
de la fusion a été sorti en helper de module (`mergeDeltaIntoCache`) au lieu de vivre dans le `try`,
et le doublon a disparu avec.

## Vérification

- `apps/web` : **562 suites, 12 095 tests verts** (0 régression). 7 tests neufs sur le delta
  (`use-conversations-delta-sync.test.tsx` : 16 → 26 avec les 4 du focus), 1 sur la liste
  (`use-conversations-query.test.tsx`).
- Le témoin de la liste a été vérifié ROUGE contre le code d'avant (`refetchOnWindowFocus` remis à
  l'hérité ⇒ `mockGetConversations` appelé au focus), puis vert après.
- `tsc --noEmit` : aucune erreur sur les trois fichiers touchés (le bruit préexistant du dossier
  `__tests__/admin` est hors lot).

## Reste ouvert après ce cycle

- **La réconciliation complète relit elle aussi les pages une par une**, donc porte la même
  instabilité d'offset décrite en 3 ci-dessus — mais 1× par 24 h au lieu d'à chaque focus, et c'est
  déjà le comportement de `fullSync()` sur iOS. La fermer demanderait une pagination par CURSEUR
  (`lastMessageAt` + id) côté gateway, chantier de contrat, pas correctif.
- **Les autres surfaces héritent toujours du `refetchOnWindowFocus: 'always'` global.** Le réglage
  n'est un défaut que sur les listes INFINIES temps réel ; les deux qui existent
  (`useInfiniteConversationsQuery`, `useConversationMessagesRQ`) y dérogent désormais toutes les
  deux. Une troisième qui naîtrait sans déroger reprendrait le défaut en silence — le noter dans
  `apps/web/CLAUDE.md` était le seul garde-fou disponible.
- **iOS n'a toujours pas la détection de page tronquée** — tête instruite du cycle 78 ci-dessus,
  inchangée par ce lot.

---

# Cycle 76 — La liste de conversations web restait figée après une coupure SOCKET

## Le défaut

Le QueryClient web tourne en `staleTime: Infinity` — Socket.IO EST la source de vérité
temps réel. Ce qui n'arrive pas par socket n'est rattrapé par rien tant que l'écran
reste monté.

Trois surfaces web pouvaient porter ce trou ; le cycle 75 avait établi le relevé :

| Messages d'une conversation | oui — `syncNewerMessages` sur le front `false → true` (« Trigger 1 ») |
| Notifications | oui depuis le cycle 75 — `onSyncDesync('reconnect')` |
| **Liste de conversations** | **non** — corrigé ici |

Ce qui semblait la couvrir : le QueryClient global pose `refetchOnReconnect: 'always'`.
Il écoute le `onlineManager` de React Query — la transition réseau du **navigateur**.
Un redémarrage gateway, un drop de load balancer ou un échec d'upgrade de transport
tuent la socket **sans bouger `navigator.onLine`** : rien ne se déclenche. Pendant cette
fenêtre, la sidebar garde ses compteurs de non-lus, ses aperçus de dernier message et
son effectif d'avant la coupure, et ne se corrige qu'au prochain focus ou remontage.

## Le correctif

`useConversationsDeltaSync` (`apps/web/hooks/queries/use-conversations-delta-sync.ts`),
monté DANS `useInfiniteConversationsQuery` — sur le propriétaire du cache
`conversations.infinite()`, pour qu'aucun consommateur ne puisse l'oublier.

Quatre arbitrages qui portent le correctif :

1. **Delta, pas `refetch()`.** `refetch()` rejoue TOUTES les pages chargées d'une route
   lourde (participants, dernier message avec traductions et pièce jointe, compteurs de
   non-lus par curseur). Le rattrapage est UNE requête bornée par ce qui a bougé —
   `GET /conversations?updatedSince=`, l'endpoint que le SDK iOS utilise déjà, avec son
   index dédié côté schema (`@@index([isActive, updatedAt])`). La capacité serveur
   existait ; seul le web ne s'en servait pas.
2. **Le watermark se DÉDUIT du cache, il ne se stocke pas.** Soit `T` le max des
   `updatedAt` en cache et `F` l'instant de la lecture serveur qui les a produits :
   `T <= F`, et tout changement postérieur à cette lecture porte un `updatedAt > F >= T`.
   `updatedSince=T` ne peut donc rien rater ; au pire il re-livre `]T, F]`, que l'upsert
   rend idempotent. Aucun curseur à persister, aucune horloge locale — et le repli sur
   `new Date()` quand rien n'est lisible est explicitement refusé (règle R15b d'iOS : un
   client en avance sur le serveur enjamberait des mises à jour réelles).
3. **Le cache est relu DANS `setQueryData`, pas avant l'`await`.** Un event socket
   arrivé pendant la requête doit survivre à la fusion — c'est la fusion atomique
   d'iOS (`cache.messages.mergeUpdate`), transposée.
4. **Une page PLEINE est une preuve d'incomplétude.** La route plafonne à 100 et trie
   par `lastMessageAt`, pas par `updatedAt` : les lignes coupées ne sont pas « les plus
   anciennes », et avancer le watermark par-dessus les perdrait. Le hook garde la fusion
   (correction immédiate de ce qu'il tient) et escalade vers l'invalidation complète.

Effet de bord assumé et utile : `rebuildInfiniteConversationPages` est sorti de
`use-socket-cache-sync.ts` vers `lib/conversations/infinite-cache.ts`. Les deux écrivains
du cache infinite partagent désormais UNE règle de repagination au lieu de deux, et le
`pagination: any` du passage est remplacé par la forme réelle (`GetConversationsResponse`).

## Vérification

- **27 témoins neufs** : 14 sur les valeurs pures (watermark, fusion), 13 sur le hook.
- **ROUGE prouvé par mutation, pas par inspection** — 9 mutations, toutes rouges,
  restauration verte à chaque fois :
  déclencher au PREMIER connect → 1 rouge ; capturer le cache avant l'`await` (la
  variante plausible-mais-fausse) → 1 rouge ; supprimer le throttle → 1 rouge ; replier
  le watermark sur l'horloge locale → 3 rouges ; upserter un delta `isActive: false` →
  3 rouges ; prendre le PREMIER `updatedAt` au lieu du plus récent → 3 rouges ; fusionner
  toutes les pages en une (le bug historique de repagination) → 1 rouge ; faire confiance
  à une page pleine → 1 rouge ; escalader sur CHAQUE delta → 1 rouge.
- **VERT exécuté** : suite web complète, `562/562` suites, `12070` tests (après
  `packages/shared → bun run build`, prérequis que la CI fait automatiquement).
- **Typecheck** : `1222` erreurs, exactement la ligne de base du projet, et **aucune** ne
  touche un fichier modifié par ce cycle.

## Portée établie, pas supposée

Le relevé des trois surfaces web est désormais complet — plus aucune n'est découverte au
reconnect socket. La liste PLATE (`useConversationsQuery`) n'est pas traitée : `grep` sur
tout `apps/web` ne rend **aucun consommateur** hors du module de hooks lui-même.


## Addendum — deux sessions ont livré ce cycle en parallèle

La tête du cycle 75 a été instruite par deux sessions à la fois. Les deux ont écrit le
même correctif, sur les mêmes fichiers, avec les mêmes arbitrages de fond (delta plutôt
que refetch, watermark déduit du cache, front `false → true` seul déclencheur, montage
sur le propriétaire du cache). La version ci-dessus est celle qui a atterri la première ;
la seconde s'aligne dessus et n'ajoute que ce qui manquait. Règle héritée du cycle 25b :
**comparer défaut par défaut, jamais « qui est arrivé en premier »**.

Ce que la version ci-dessus fait STRICTEMENT MIEUX, et qui est conservé tel quel :
- la démonstration `T <= F` du watermark, qui rend le clamp `now` de l'autre version
  inutile plutôt que faux ;
- le traitement de la page PLEINE comme preuve d'incomplétude, adossé au fait que la
  route trie par `lastMessageAt` et pas par `updatedAt`. L'autre version paginait par
  offset sur 5 pages : correct en régime stable, mais exposé au décalage d'offset si une
  ligne change de rang entre deux pages, et surtout moins bien argumenté ;
- la découverte du défaut iOS qui en découle (tête du cycle 77 ci-dessus).

Ce que la seconde version apporte, appliqué PAR-DESSUS :
- **la garde de la conversation OUVERTE** (`ConversationDeltaMergeOptions`). L'upsert
  intégral écrasait le compteur de non-lus avec la valeur serveur, y compris pour la
  conversation qu'on est en train de LIRE — rallumant un badge que le handler socket
  `conversation:unread-updated` prend déjà soin de clamper. Le delta est le second
  chemin d'écriture du même compteur ; il devait porter la même garde ;
- **la purge du cache de MESSAGES** d'une conversation retirée, à côté de la purge de son
  `detail` — miroir de `cache.messages.invalidate(for:)` sur iOS.

Ce que la seconde version proposait et qui est REJETÉ, preuve à l'appui : un cliquet plus
large (« le delta ne peut monter le compteur que s'il apporte un `lastMessageAt` plus
récent »), censé couvrir aussi la conversation fermée dont le `mark-as-read` traîne.
C'est la transposition de la règle 2 de `reconcileUnread` (iOS) — sauf que celle-ci
s'appuie sur `userState.lastReadAt`, et que **`markAsUnread` marche précisément parce
qu'il EFFACE cette frontière**, ce qui désarme la règle et rend la main au serveur. Un
cliquet basé sur `unreadCount` n'a pas cet interrupteur : il rendrait un « marquer comme
non lu » fait sur un autre appareil définitivement invisible sur le web. Un témoin
existant de la version ci-dessus (« the delta is server truth ») l'a fait tomber
immédiatement — c'est lui qui a révélé le défaut, pas une relecture. Un badge rallumé une
seconde après un reconnect se répare au `conversation:unread-updated` suivant ; un
mark-as-unread perdu, non.

Reste ouvert : faire voyager la frontière de lecture jusqu'au modèle web fermerait
l'écart pour de bon. Chantier de contrat, pas garde de fusion — noté dans
`ConversationSyncEngine.swift` en tête de `deltaSyncCore`.


---

# Cycle 76b — Addendum : TROIS sessions ont livré le cycle 76 en parallèle

Même défaut, même endpoint, même miroir iOS, jusqu'aux noms de fichiers à un mot près, découvert
trois fois sans que personne se voie : `upbeat-dirac-ozao52` (mergée la première, sa version vit
dans l'arbre), `keen-hamilton-jrysns` (mergée ensuite, addendum sur la même base), et celle-ci.
Chacune s'aligne sur ce qui est déjà mergé et n'ajoute que ce qui manquait — appliqué par-dessus,
jamais à la place (précédent du cycle 25b ; leçon du cycle 23 : comparer défaut par défaut, jamais
« qui est arrivé en premier »).

**Ce que la première version fait strictement mieux** que celle de cette session, et qui aurait
manqué autrement :
1. **Le plafond serveur est traité comme une preuve d'incomplétude.** Elle demande `limit = 100`
   (le plafond réel de `Math.min(limit, 100)`) et, sur page PLEINE, escalade vers une relecture
   complète. Cette session demandait le `limit` de la liste et prétendait, dans sa documentation,
   que « le reste est rattrapé au reconnect suivant » — **c'est faux**, pour la raison que la
   première a su nommer : la route trie par `lastMessageAt` décroissant et NON par `updatedAt`,
   donc les lignes tronquées ne sont pas les plus anciennes, et le watermark calculé sur ce qui a
   été fusionné passe définitivement par-dessus.
2. **Les caches dérivés sont purgés** (`removedIds` → `conversations.detail`, puis
   `messages.infinite` ajouté par la deuxième session).

**Ce que cette session ajoute par-dessus** — la borne de la fenêtre chargée. Une conversation
INCONNUE du cache et plus ancienne que la dernière ligne chargée était insérée par la fusion ; le
`fetchNextPage` suivant la rapporte à sa place réelle, donc **la même conversation apparaissait
deux fois**. `mergeConversationDelta` prend désormais `{ hasMore }` en plus de
`{ openConversationId }`, et l'écarte tant qu'il reste des pages ; une inconnue récente appartient
bien à la fenêtre et entre normalement, un retrait (`isActive: false`) n'est jamais écarté, et sans
borne fournie on insère — perdre une ligne serait pire que la dupliquer jusqu'au prochain montage.
Le plancher se mesure avec `orderKey`, la MÊME clé que le tri final : la borne signifie « sous la
dernière ligne visible », et la fenêtre est ordonnée par cette clé.

## Convergence indépendante sur la réconciliation du non-lu

Cette session avait écrit, testé, puis **retiré** une règle « non-lu local à 0 et aucun message plus
récent ⇒ garder 0 », au motif qu'elle confond un accusé de lecture en retard avec un `mark-unread`
délibéré fait depuis un autre appareil. La deuxième session est arrivée **indépendamment à la même
conclusion**, l'a écrite dans `ConversationDeltaMergeOptions` avec l'argument décisif que cette
session n'avait pas formulé — côté iOS, `markAsUnread` fonctionne parce qu'il EFFACE `lastReadAt`,
ce qui désarme la règle 2 et rend la main au serveur ; une transposition basée sur `unreadCount`
n'a pas cet interrupteur — et a livré le sous-ensemble sûr : forcer à zéro la seule conversation
OUVERTE, lue depuis `useNotificationStore.getState().activeConversationId`.

Le reste (conversation FERMÉE dont l'accusé de lecture traîne encore) demande de faire voyager la
frontière de lecture jusqu'au modèle web — chantier de contrat gateway, pas garde de fusion. Deux
sessions y sont arrivées séparément : ce n'est pas une opinion, c'est la borne du modèle actuel.

## Hors cycle — un flake d'une milliseconde dans le gateway

`PostFeedService` › « bounds the author archive to a finite window in the past » comparait
`before - floor` à `AUTHOR_ARCHIVE_WINDOW_MS` au millième près, alors que `before` est lu par le
TEST avant l'appel et le plancher calculé par le SERVICE après : les deux ne sont égales que si
l'horloge ne change pas de milliseconde entre elles. Rouge en CI sur une PR ne touchant pas le
gateway (604799999 contre 604800000). L'invariant réel est un encadrement entre les deux lectures
qui bornent l'appel — corrigé sans tolérance arbitraire.

---

# Cycle 75 — Le web ne décodait pas `_seq` : une notification manquée l'était pour la session entière

## Le défaut

Le gateway tamponne un numéro de séquence monotone PER-USER (`_seq`) sur ses émissions Socket.IO
user-scoped (`emitWithSeq`). iOS le suit depuis 2026-05 : `SyncSeqState` détecte le trou
(`next > lastSeq + 1`), `NotificationGapResyncCoordinator` re-tire la liste, et le reconnect
déclenche la même resync inconditionnellement (A5.4).

`grep -rn "_seq" apps/web` ne rendait **aucune occurrence**. Le singleton de notifications
reconstruit son objet champ par champ depuis le payload : le `_seq` tombait au sol sans être lu.

Ce qui rend l'absence coûteuse sur cette plateforme précisément : le QueryClient global tourne en
`staleTime: Infinity` — Socket.IO EST la source de vérité temps réel. Une notification qui n'arrive
pas n'est donc rattrapée par rien tant que l'écran reste monté. Elle manque dans la cloche, dans le
compteur et sur `/notifications`, **pour toute la session**.

Deux fenêtres aveugles distinctes, aucune couverte :
- **perte en vol** — des events arrivent, mais pas tous (le `_seq` saute) ;
- **coupure socket** — aucun event n'arrive, donc aucun `_seq` ne peut révéler quoi que ce soit.
  `refetchOnReconnect: 'always'` du QueryClient ne ferme PAS celle-là : il écoute le
  `onlineManager` (réseau navigateur), pas la socket. Un redémarrage gateway ne bouge pas
  `navigator.onLine`.

## Le correctif

`apps/web/lib/sync/sync-seq-state.ts` — miroir EXACT de `SyncSeqState.swift`, valeur pure :
`detectSyncSeqGap` avant `recordSyncSeq`, jamais de trou au premier event, jamais de régression du
curseur, `_seq` absent = no-op. Pas une seconde interprétation de la règle : les deux fichiers se
nomment mutuellement, et `emitWithSeq.ts` nomme désormais ses DEUX observateurs.

Le transport (`notification-socketio.singleton`) observe et expose `onSyncDesync(reason)` —
`'gap'` ou `'reconnect'`. La décision « quoi refetch » vit chez le consommateur
(`use-notifications-manager-rq`), débouncée 300 ms comme iOS. C'est le découpage SDK/app d'iOS,
transposé transport/hook.

Trois arbitrages qui portent le correctif :
1. **Le curseur SURVIT à la reconnexion automatique de socket.io** — c'est précisément ce qui
   permet au premier event d'après de révéler le trou. Il n'est purgé que sur `disconnect()`
   explicite (changement de token, logout, `reset()`), parce que le `_seq` est alloué par user et
   que le curseur d'un compte ne veut rien dire pour le suivant.
2. **Le premier `connect` ne signale rien** ; seul un RE-connect prouve une fenêtre aveugle. Au
   premier, les écrans montent déjà en `refetchOnMount: 'always'`.
3. **Un event sans `_seq` est un no-op, pas un trou.** `emitWithSeq` émet délibérément sans `_seq`
   quand l'allocation rejette ou dépasse son timeout : compter ce chemin dégradé comme un trou
   déclencherait une resync à chaque hoquet Mongo.

## Vérification

- **19 témoins neufs** : 15 sur la valeur pure + le câblage transport, 4 sur le consommateur.
- **ROUGE prouvé par mutation, pas par inspection** (5 mutations, toutes rouges, restauration verte) :
  neutraliser le signal de trou → 2 rouges ; signaler `reconnect` dès le premier connect → 7 rouges ;
  purger le curseur sur l'event `disconnect` de socket.io (la variante plausible-mais-fausse) →
  1 rouge ; supprimer le débounce → 3 rouges ; abonner un no-op → 3 rouges.
- **VERT exécuté** : suite web complète, `559/559` suites, `12043` tests (après
  `packages/shared → bun run build`, prérequis que la CI fait automatiquement).
- Typecheck : la ligne d'erreur touchant un fichier modifié
  (`notification-socketio.singleton.test.ts:45`, spread argument) est **antérieure** — vérifiée
  présente sur `main` stashé, parmi 1222 erreurs de base du projet.

## Portée établie, pas supposée

Le `_seq` n'a qu'UN émetteur (`NotificationService` → `notification:new`) : le lockstep
émission/observation est donc intact après ce cycle, et c'est la seule raison pour laquelle porter
l'observation d'un seul event est correct. Étendre `emitWithSeq` (A2.2) obligera à étendre
l'observation des DEUX clients dans le même train — noté en tête du fichier gateway.

---

# Cycle 74 — La ligne de liste gelait sur la traduction D'AVANT (portillon de mémoïsation iOS)

## Le défaut

Le cycle 73 a rendu `lastMessageTranslations` **vivant** : le gateway ré-émet désormais
`conversation:updated` quand une traduction atterrit, et — c'est le point — il ne l'émet QU'aux
lecteurs dont la carte d'aperçu porte cette langue (`PreviewUpdateScope.onlyIfPreviewCarriesLanguage`).
Le payload est donc, par construction, un payload où **seule la valeur traduite a changé** : même
`lastMessageId`, même `lastMessagePreview` (l'original ne bouge pas), même `lastMessageAt`.

`MeeshyConversation.renderFingerprint` est le portillon de mémoïsation de la ligne de liste :
`ThemedConversationRow.==` et `ConversationRowItem.==` ne comparent la conversation QUE par ce hash,
derrière `.equatable()`. Il repliait `translations.keys.sorted().joined(separator: ",")` — **les
clés, pas les valeurs**.

Conséquence : une RETRADUCTION (`["fr": "Bonjour"] → ["fr": "Salut"]`) produit le hash identique.
Le portillon renvoie `true`, SwiftUI n'appelle même pas `body`, et la ligne garde le texte d'avant
**définitivement**. Le seul champ qui bougeait était le seul non replié.

Le chemin produit qui le déclenche : `message:edit` lance `retranslateMessageAsync` (fire-and-forget,
`MessageHandler:845`) puis fane l'aperçu (`:889`). Quand l'émission d'aperçu gagne la course contre
la purge en base de `Message.translations`, elle porte la carte PÉRIMÉE sous la clé `fr` ; la
retraduction atterrit 1–2 s plus tard sous la MÊME clé. Un lecteur francophone lit alors, dans sa
liste, la traduction du texte d'AVANT l'édition.

Hasher les clés suffisait tant que la carte n'arrivait qu'une fois par message, au fetch de liste.
Le cycle 73 a levé cette hypothèse sans mettre le portillon à jour.

## Le correctif

Replier clé ET valeur, chacune combinée séparément (`Hasher.combine` par composant, pas une
concaténation qui confondrait `["a": "bc"]` et `["ab": "c"]`), en itérant les clés TRIÉES —
`Dictionary` n'a pas d'ordre d'itération stable, et un hash non déterministe ouvrirait le portillon
au hasard, ce qui annulerait le gain de `.equatable()`.

## Second trou du même contrat, fermé au passage

`lastMessageLocation` n'était replié **nulle part** dans le fingerprint, alors que la ligne en compose
son libellé — visuellement (`ThemedConversationRow`, branche `.standard`, quand un message
position-seule a un `lastMessagePreview` vide par construction) comme dans son label VoiceOver. Le
doc-comment du hash dit pourtant « mettre à jour ce hash quand un nouveau champ est affiché » : c'est
une violation du contrat déclaré, pas une approximation. La PRÉSENCE est repliée en plus du nom — une
position sans nom affiche quand même « Position », transition que `name` seul (nil des deux côtés)
raterait.

## Vérification

- **8 témoins neufs** (`ConversationRenderFingerprintTests`), dont 3 volontairement non-discriminants
  seuls (stabilité du hash, première traduction, langue ajoutée) : ils verrouillent ce qui ne doit
  PAS changer, et c'est leur seule fonction.
- **RED prouvé par inspection, pas par exécution** — aucune toolchain Swift dans ce conteneur Linux.
  La preuve est déterministe et vérifiable à la lecture : `["fr":"Bonjour"]` et `["fr":"Salut"]`
  rendent tous deux la chaîne `"fr"` par `keys.sorted().joined(separator: ",")`, et
  `lastMessageLocation` n'apparaissait pas une seule fois dans l'ancienne fonction. GREEN est exécuté
  par `sdk-tests.yml` en CI (macOS), seul chemin d'exécution disponible.

### Le témoin de stabilité a fait EXACTEMENT son travail — première passe CI rouge

La première rédaction de ce fichier partait vert à six témoins sur huit, et c'était faux.
`MeeshyConversation.init` défaute `lastMessageAt` à `Date()`, champ **replié dans le hash** : deux
instances construites séparément diffèrent donc TOUJOURS. Les trois témoins `_changes` passaient
sans rien prouver — ils auraient passé sur le code d'AVANT le correctif.

Seuls les deux témoins d'égalité (stabilité du hash, ordre d'insertion) pouvaient voir le problème,
et ils l'ont vu. C'est la démonstration littérale de pourquoi un lot de témoins « non-discriminants
seuls » n'est pas du remplissage : sans eux, ce fichier serait entré vert en verrouillant zéro
comportement.

Correctif du fichier de test : `lastMessageAt` épinglé à une date fixe, et toutes les variantes
dérivées d'une seule fabrique paramétrée — seul le champ testé varie, par construction.

## L'audit instruit par le cycle 73 est CLOS — aucun défaut

Le cycle 73 laissait ouvert : « `emitConversationPreviewUpdate` et les autres émetteurs par room
personnelle n'ont pas été audités contre la même clé `userId ?? id` ». Fait, par une recherche sur
`ROOMS.user(` (≈40 sites). **Rien à corriger** :

- Tous les fan-outs par participant passent par `participantUserRoomTargets` /
  `emitToConversationParticipants` — `emitConversationPreviewUpdate` compris.
- Les émetteurs qui adressent `ROOMS.user(userId)` en dur ciblent la room PROPRE de l'acteur
  (reset de badge multi-device, accusés, requêtes d'amitié, `user:updated`), où `userId` vient de
  `authContext.userId` — lequel vaut déjà `participant.id` pour un anonyme
  (`middleware/auth.ts:444`), c'est-à-dire exactement la room que rejoint le socket anonyme.
- `MessageReadStatusService._loadReadReceiptOptOuts` filtre sur `userId` seul à dessein : la
  préférence est stockée sur `User`, un participant sans compte n'en a pas et reste visible.

À ne PAS rouvrir sans fait neuf : la règle est portée par le type et par le helper, pas par la
vigilance des call sites.

## Reste ouvert après ce cycle

- **Android ne décode pas le Prisme de la ligne de liste** — tête du cycle 74 conservée ci-dessous.
  Toujours NON traité ici : le défaut vit entièrement dans `apps/android/`, lane d'une autre routine
  (`tasks/lane-cursor.md`). Vérifié encore ce cycle : `grep -rn lastMessageTranslations apps/android`
  ne rend toujours rien.
- Le web n'a aucun `_seq` — tête instruite du cycle 75 ci-dessus.

---

# Cycle 74b — iOS n'écoutait pas `user:updated`, et le contrat rendait l'écoute inutile

*Deux sessions ont tourné en parallèle sur le cycle 74. Celle-ci a travaillé sur une AUTRE
surface (le profil public d'un contact, pas le Prisme de l'aperçu) : aucun fichier commun, rien
à arbitrer. Les deux rapports sont conservés tels quels.*

## Le défaut

`emitUserUpdated` (`NotificationService:2858`) diffuse le profil public d'un
utilisateur à TOUS ses contacts — quatre appelants dans `routes/users/profile.ts`
(profil, avatar, bannière, handle). Le web l'applique
(`use-socket-cache-sync.ts:1107`). **iOS n'avait aucun `socket.on("user:updated")`.**

Surfaces figées côté iOS jusqu'au prochain refetch complet : la ligne de liste
d'une conversation directe (`title`, `participantAvatarURL`, `participantBanner`),
l'en-tête de conversation, `ForwardPickerSheet`, `GlobalSearchViewModel`,
`ProfileSheetUser`.

## Le contrat rendait l'écoute inutile

Brancher un listener n'aurait pas suffi. Le nom RENDU est
`displayName > « Prénom Nom » > username`, et un client ne stocke que le nom
**déjà composé** (`MeeshyConversation.title`) — pas ses composants. Un delta
partiel (« firstName vaut désormais Bob ») est donc **irrecomposable** chez le
destinataire : il lui manque toujours les autres composants.

Deux corrections possibles, une seule tenable :
- *Résoudre côté serveur et envoyer un `resolvedDisplayName`* — écarté : cela
  fabrique une QUATRIÈME copie de la règle (web, iOS, Android, serveur), qui
  diverge silencieusement dès qu'un client change la sienne.
- **Envoyer les quatre composants en GROUPE** — retenu : chaque client applique
  SON résolveur, déjà écrit, déjà testé. Aucun nouveau champ dans le contrat.

`null` sur `displayName`/`firstName`/`lastName` signifie EFFACÉ. Omettre la clé
se lirait « inchangé » et figerait l'ancien nom — c'est le seul moyen de faire
retomber l'affichage sur le composant suivant.

Le chemin `PATCH /users/me/username` demandait en plus d'élargir son `select`,
qui ne ramenait que `{ id, username }` : envoyer le groupe sans le sélectionner
aurait produit trois `undefined`, c'est-à-dire un groupe qui ment. Un témoin
verrouille le `select` lui-même, pas seulement l'emit.

## Ce qui a été VÉRIFIÉ, pas déduit

- **La présence de `username` est un marqueur de groupe FIABLE.** Les quatre
  appelants de `emitUserUpdated` ont été lus : `avatar` et `banner` partent
  seuls, le nom jamais. `hasNameGroup` peut donc se lire sur `changes.username`.
- **Le nom recomposé côté socket suit la règle du chemin REST**, pas celle de
  web. `title` d'une conversation directe est hydraté par
  `APIConversationUser.name` (`displayName ?? username`, sans first/last).
  Recomposer avec `displayName > « Prénom Nom » > username` aurait fait diverger
  la ligne selon le transport qui l'a remplie — un utilisateur sans
  `displayName` mais avec un prénom aurait vu son nom changer au rechargement.
- **`avatar`/`banner` sont tri-états**, comme `LastMessagePreviewTranslations` :
  clé absente ≠ `null`. Un `if let` sur la valeur aurait gardé l'ancienne image
  après une SUPPRESSION d'avatar — le défaut inverse de celui corrigé.
- **La liste persistée devait suivre.** Le store RAM seul laissait la ligne
  redevenir périmée au prochain démarrage à froid. `ConversationSyncEngine`
  délègue à la MÊME règle pure que le store, comme son jumeau
  `applyingConversationUpdate`.

## Vérification

- 5 témoins gateway (dont 2 neufs) — **RED prouvé par mutation** : le stash du
  seul `profile.ts` les fait tomber tous les cinq.
- 12 témoins Swift neufs (8 sur la règle pure et son décodage, 1 sur l'actor,
  1 sur le bridge, 2 sur les non-cibles groupe/autre-contact).
- Suite Jest complète du gateway : **652 suites, 16429 tests, verte**.
  `tsc --noEmit` gateway : vert. Le Swift est gaté par `sdk-tests` (pas de
  toolchain Swift sur cette machine).

## Suite du cycle — `main` est passé au ROUGE, puis au vert

Le merge a cassé la compilation Swift : `ConversationSyncEngine` ne détient pas un
`MessageSocketManager` mais un `MessageSocketProviding`, et le publisher n'était pas sur le
protocole. Corrigé par `5fcd634c` (publisher ajouté au protocole + aux deux `MockMessageSocket`).

**`sdk-tests` vert sur `main` (5fcd634c), `CI` vert.** Les 12 témoins Swift n'avaient RIEN prouvé
à la première passe : une erreur de compilation tue le build avant que la moindre cible de test
compile. Leçon 113.

## Reste ouvert après ce cycle

- **Le web a la même famille de défaut sur la LIGNE DE LISTE.** Son
  `handleUserUpdated` n'invalide que `queryKeys.users.detail(userId)` ; la ligne
  d'une conversation directe se nourrit du payload conversation, pas de cette
  requête. À instruire en lisant d'où `ConversationList` tire le nom et l'avatar
  d'un direct — pas en le déduisant. Non traité ici : une session parallèle
  travaille sur `apps/web` (PR #2836).
- **Android ne décode pas `user:updated` non plus** — lane d'une autre routine
  (`tasks/android-parity-ios-debt-agent-prompt.md`), comme le Prisme de la ligne
  de liste du cycle 73. Documenté, pas corrigé.
- **`conversation:online-stats` est déclaré, écouté par le web, JAMAIS émis.**
  Trouvé en balayant les 120 `SERVER_EVENTS` (émis gateway vs consommés
  iOS/web). Le web y branche `onActiveUsersUpdate` depuis
  `use-stream-socket.ts:244` — code mort tant que rien ne l'émet. À trancher :
  l'émettre ou le supprimer. `conversation:stats` (émis, lui) alimente déjà la
  même sortie, ce qui plaide pour la suppression.
- Les points hérités restent tels quels — voir « Reste ouvert » du cycle 73
  ci-dessous.

---

# Tête instruite pour le cycle 74 — Android ne DÉCODE pas le Prisme de la ligne de liste

*Trouvé en instruisant le cycle 73, vérifié, NON corrigé : le défaut est réel et user-visible, mais
il vit entièrement dans `apps/android/`, c'est-à-dire dans la lane d'une AUTRE routine
(`tasks/android-parity-ios-debt-agent-prompt.md`, curseur `tasks/lane-cursor.md`). Le corriger ici
aurait produit un conflit de fichiers avec une routine qui travaille sur les mêmes écrans.*

## Le fait

Le gateway sert `lastMessageTranslations` + `lastMessageOriginalLanguage` au niveau CONVERSATION,
sur les trois chemins (`GET /conversations` → `routes/conversations/core.ts:678`, la recherche →
`search.ts:277`, et le temps réel → `resolveLastMessagePreviewPrism`). Web les lit
(`transformers.service.ts:490`, `use-socket-cache-sync.ts:75`), iOS les lit
(`MeeshyConversation.resolvedLastMessagePreview`, `ConversationStore.merging`).

**Android ne les déclare nulle part.** `ApiConversation` (`core/model/.../Conversation.kt:6`) n'a
aucun des deux champs, `ApiConversationLastMessage` (`:55`) porte `content` et `originalLanguage`
mais aucune traduction, et `lastMessagePreview()`
(`feature/conversations/.../LastMessagePreview.kt:42`) rend `message.content` brut.

L'asymétrie est interne à Android et c'est ce qui la rend coûteuse : le FIL applique le Prisme
(`Message.resolvedContent` → `LanguageResolver.preferredTranslation`, `Message.kt:98`), la LISTE
non. Un lecteur francophone voit donc « Hello » dans sa liste et « Bonjour » dès qu'il ouvre — la
friction linguistique exacte que le principe produit interdit.

## Ce que le cycle 74 doit faire

1. Ajouter `lastMessageTranslations: Map<String, String>? = null` et
   `lastMessageOriginalLanguage: String? = null` à `ApiConversation`.
2. Un résolveur `resolvedLastMessagePreview` porté de `MeeshyConversation` (Swift) — **règle #3 du
   Prisme** : parcourir les langues du lecteur DANS L'ORDRE, la première servie gagne, par une
   traduction OU parce que le message est déjà écrit dedans. Ne jamais court-circuiter sur la
   langue d'origine.
3. Brancher `lastMessagePreview()` dessus, et le cache disque (`ConversationCacheSource.kt`) doit
   persister les deux champs — sinon le démarrage à froid re-perd le prisme.
4. La source socket : `conversation:updated` porte les deux champs par destinataire depuis le cycle
   69, et depuis CE cycle il en porte aussi après une traduction. Android doit les appliquer au même
   endroit que `lastMessagePreview`.

---

# Cycle 73 — Le Prisme de la ligne de liste dépendait de l'ORDRE D'ARRIVÉE

## Le défaut

`message:translation` n'est diffusé que dans `ROOMS.conversation(id)`
(`MeeshySocketIOManager._handleTextTranslationReady`). Le rafraîchissement de la LIGNE DE LISTE,
lui, n'existait pas : `conversation:updated` n'était émis que par l'envoi, l'édition, la
suppression et l'épinglage. Or l'aperçu est servi **à l'envoi**, à un instant où la traduction
n'existe pas encore — la traduction NLLB atterrit une à deux secondes plus tard, par ZMQ.

Résultat : la carte `lastMessageTranslations` posée sur la ligne vaut `null` au moment où elle est
servie, et **rien ne repasse jamais**. Un lecteur francophone garde « Hello » dans sa liste,
indéfiniment, jusqu'à un rechargement complet.

Ce qui rend le défaut coûteux, c'est qu'il est **conditionnel au parcours** : ouvrir la conversation
traduit la ligne (le fil reçoit `message:translation`, le refetch de liste suivant réhydrate), ne
pas l'ouvrir la laisse dans la langue de l'expéditeur. Le même compte, sur le même appareil, voit
deux comportements selon ce qu'il a fait avant. « Le prisme s'applique à TOUT le contenu — previews
comprises » : c'était la seule surface où il dépendait de l'ordre d'arrivée plutôt que des
préférences du lecteur.

## Le correctif

Le chemin de traduction devient le **troisième appelant** de `emitConversationPreviewUpdate` — le
fan-out qui existait déjà pour l'édition/suppression, avec son Prisme PAR destinataire, sa
recomputation du dernier message non supprimé et son contrat best-effort. Aucune copie.

Mais une traduction n'est pas une édition, et la différence est la moitié du travail : une édition
change la ligne pour TOUT LE MONDE, une traduction ne la change que pour **les lecteurs de cette
langue-là**, et seulement **tant que le message traduit est encore le dernier**. D'où
`PreviewUpdateScope`, deux bornes optionnelles que les appelants d'édition ne passent pas :

- `onlyIfLatestIs` — un message plus récent est arrivé pendant que la traduction volait ? Son propre
  chemin d'envoi a déjà servi l'aperçu. Ré-émettre l'ancien ferait **RECULER** la ligne de liste,
  c'est-à-dire pire que le défaut corrigé.
- `onlyIfPreviewCarriesLanguage` — le test porte sur la carte SORTIE, pas sur les préférences en
  entrée. C'est elle qui décide, et elle applique déjà les quatre exclusions de
  `buildLastMessagePreviewTranslations` (hors prisme, langue d'origine, traduction chiffrée, texte
  inexploitable). Un lecteur dont la carte ne bouge pas recevrait un payload **identique à l'octet
  près** : le filtrer n'est pas une optimisation opportuniste, c'est la définition de « qui est
  concerné par CETTE traduction ». Sans lui, une conversation à N langues paie N fan-outs complets
  par message, sur le chemin le plus chaud du service.

`updatedBy` est OBLIGATOIRE dans `ConversationUpdatedEventData` et une traduction n'a pas d'acteur
humain. L'auteur du message traduit est la seule identité honnête à porter là — et c'est déjà le
repli que le chemin d'envoi utilise (`senderUserId ?? message.senderId`). Les deux clients ignorent
le champ (web le destructure et le jette, iOS le décode en optionnel).

## Ce qui a été VÉRIFIÉ, pas déduit

- **Les deux clients appliquent bien un `conversation:updated` dont seul le prisme a changé.** Le
  payload garde le même `lastMessageId`, le même `lastMessagePreview`, le même `lastMessageAt` : un
  client qui ne réagirait qu'au changement d'identité du dernier message l'avalerait.
  - iOS : `ConversationStore.merging` compare `lastMessageAt >= conv.lastMessageAt` — **`>=`, pas
    `>`**, et le commentaire dit pourquoi (une édition garde le `createdAt`). L'égalité passe, donc
    tout le groupe d'aperçu est appliqué.
  - Web : `normalizeConversationPatch` traite `lastMessageTranslations` comme une clé toujours
    présente, `null` compris, et le cache applique `{ ...conv, ...patch }`.
- **Le lecteur sur l'écran de liste EST joignable.** `AuthHandler._joinUserConversations` fait
  rejoindre TOUTES les rooms de conversation à l'authentification — le lecteur reçoit donc bien
  `message:translation`, mais aucun client ne s'en sert pour patcher la ligne de liste : iOS le
  range dans `CacheCoordinator.cacheTranslation` (cache MESSAGE, jamais la liste), web ne l'écoute
  que depuis `ConversationLayout`/`bubble-stream-page`, c'est-à-dire depuis la vue conversation. La
  ligne de liste se nourrit exclusivement de `lastMessageTranslations`.

## Vérification

- **10 témoins neufs.** 6 sur `emitConversationPreviewUpdate` (la portée), 4 sur le manager (le
  câblage).
- **RED prouvé par mutation**, pas supposé : les deux gardes retirées ⇒ 3 témoins de portée rouges ;
  l'appel au fan-out neutralisé ⇒ le témoin de câblage rouge.
- Deux témoins de portée sont volontairement non-discriminants seuls (« fan-out normal quand le
  message EST le dernier », « les appelants d'édition restent intacts ») : ils verrouillent ce qui
  ne doit PAS changer, et c'est leur seule fonction.
- `tsc --noEmit` du gateway : vert. Suite Jest complète du gateway : verte.

## Reste ouvert après ce cycle

- **Android ne décode pas le Prisme de la ligne de liste** — tête instruite du cycle 74 ci-dessus.
  Lane d'une autre routine, pas un arbitrage.
- **Le coût des deux requêtes quand la garde `onlyIfLatestIs` échoue.** Le helper interroge
  participants et dernier message EN PARALLÈLE, puis abandonne. Sérialiser (dernier message d'abord,
  bail, puis participants) économiserait la requête participants sur ce chemin-là mais ralentirait
  l'appelant DOMINANT (l'édition, où les deux sont toujours nécessaires). Arbitrage assumé en faveur
  du chemin dominant ; mesuré ici pour que le prochain cycle n'ait pas à le redécouvrir.
- **Le chemin AUDIO n'est pas touché.** Une transcription/traduction audio ne change pas
  `Message.content` — l'aperçu d'un vocal est un libellé de type, pas un texte. À revérifier si
  l'aperçu venait un jour à porter la transcription.
- Les points hérités restent tels quels — voir « Reste ouvert » du cycle 72 ci-dessous.

---

# Tête instruite (cycle 73, NON traitée) — la fenêtre de transition dépasse la moitié du slide le plus court

*Reportée telle quelle : c'est un arbitrage PRODUIT, et cette routine tourne sans personne pour le
trancher. Elle reste intégralement valable pour le prochain cycle qui disposera d'un avis produit.*

*Trouvé en corrigeant le cycle 72, mesuré, NON corrigé : contrairement aux deux défauts de ce
cycle-là, celui-ci demande un arbitrage produit, pas un correctif mécanique. L'arithmétique est
faite ; la décision ne l'est pas.*

## Le fait

`StoryComposerViewModel+Slides.currentSlideDuration` borne la durée d'un slide à
`max(2, min(600, …))` — **2 secondes minimum**. `StoryRenderer.slideTransitionDuration` vaut
désormais **1,2 s**, partagée par l'ouverture ET la fermeture.

Sur un slide de 2 s :
- l'ouverture court de `0` à `1,2` ;
- la fermeture ouvre à `2,0 − 1,2 = 0,8`.

**Les deux fenêtres se chevauchent sur 0,4 s**, et le slide n'a aucun instant où il est simplement
lui-même. Le seuil est `2 × 1,2 = 2,4 s` : tout slide plus court chevauche. À 0,5 s le seuil valait
1 s, sous le plancher de 2 s — le chevauchement était donc *impossible* avant `fcd002ee`. C'est une
conséquence non instruite du passage à 1,2 s, pas une dette ancienne.

## Ce que le cycle 72 a fait, et pourquoi il s'est arrêté là

Le correctif du chevauchement des *animations* (`clearOpeningFill`) ne retire l'entrée qu'à partir
de `progress > 0`, donc à `0,8 s` sur un slide de 2 s — au milieu d'une ouverture qui en est aux
deux tiers. Le saut est réel : opacité ~0,67 → ~1,0 d'une frame à l'autre. Il est **moins grave que
le défaut qu'il remplace** (une fermeture jamais jouée), et c'est le seul arbitrage que le cycle 72
s'est autorisé sans instruction.

## Les trois options, et ce qu'elles coûtent

1. **Relever le plancher de durée à `2 × slideTransitionDuration`** (2,4 s). Une ligne, dérivée de
   la SSOT, aucune régression de rendu. Coût : refuse une durée que des slides existants portent
   déjà en base — il faut décider ce qu'on fait des projets déjà enregistrés à 2 s.
2. **Comprimer la fenêtre de sortie dans ce qui reste** :
   `start = max(slideTransitionDuration, totalDuration − slideTransitionDuration)` et normaliser la
   rampe sur `totalDuration − start`. Aucun slide refusé, mais **`closingProgress` change de
   contrat** — et `StoryAVCompositor` doit suivre au même instant, sinon l'export re-diverge de
   l'aperçu, exactement le défaut n°2 du cycle 72 sous une autre forme.
3. **Ne rien faire et l'assumer** : un slide de 2 s avec entrée ET sortie est un cas que l'auteur
   a construit à la main ; le saut est visible mais borné.

**Ne pas trancher ça sans l'avis produit.** Les options 1 et 2 sont toutes deux défendables et
n'ont pas le même effet sur les stories déjà publiées.

## Ce qui reste vrai de la contrainte d'environnement

`ios-tests.yml` reste hors de portée de cette routine (`403 Resource not accessible by
integration` — pas de `actions: write`). **`sdk-tests.yml` tourne sur les PR** et a gaté les deux
correctifs du cycle 72, y compris le Swift de production : c'est le seul gate Swift disponible, et
il suffit dès que le code vit dans `packages/MeeshySDK`. Seule la couche `apps/ios` reste aveugle.

---

# Cycle 72 — Deux défauts sur la même surface : `main` redevient vert, et l'aperçu cesse de mentir sur l'export

## Le fil instruit, tenu jusqu'au bout

Le cycle 71 laissait une tête entièrement instruite : `sdk-tests` rouge sur `main`, cause prouvée
par l'arithmétique, correctif décrit, « mécanique pour qui dispose d'un Mac ». Elle avait raison sur
tout **sauf sur la contrainte** : le cycle 71 s'était interdit d'écrire ce Swift faute de pouvoir le
compiler. Or `sdk-tests.yml` tourne **sur les PR**. Le gate existait ; il n'avait pas été reconnu
comme tel pour du code de production.

C'est la leçon dominante du cycle, et elle vaut au-delà de ce correctif : **la question n'est pas
« puis-je compiler ici ? » mais « existe-t-il un gate qui compile ceci ? »**. Les deux réponses ont
divergé pendant cinq cycles.

## Défaut n°1 — huit témoins figés sur une durée qui a bougé

`fcd002ee` fait passer `StoryRenderer.slideTransitionDuration` de 0,5 à 1,2 s. Il a relevé la borne
de `StoryOpeningParityTests` mais laissé, dans deux autres fichiers, des instants d'échantillonnage
choisis pour la fenêtre précédente. Aucun comportement n'avait changé : la rampe est toujours nulle
avant la fenêtre, linéaire dedans, plafonnée après. **Seuls les témoins mentaient.**

Recaler les littéraux sur 1,2 s aurait « marché » et re-cassé au prochain ajustement — c'est la
deuxième fois que cette constante bouge, et la deuxième fois qu'elle laisse des témoins rouges
décrivant un comportement inchangé. Les instants s'expriment donc en fonction de la SSOT
(`totalDuration − window`, `− window / 2`), et les valeurs dérivées aussi (`zoomTransitionScale`,
`slideTransitionTravelFraction`).

Contrepartie assumée : `test_badgeWidth_matchesSlideTransitionDuration` devient **tautologique** une
fois lié à la SSOT — l'implémentation est littéralement l'expression attendue. Deux témoins lui
rendent sa portée, tous deux indépendants de la durée : la largeur reste celle de la FENÊTRE et non
celle du slide (la régression que le commentaire de la lane documente), et elle respire avec le zoom.

## Défaut n°2 — celui que le premier a fait apparaître

En relisant `StoryRenderer` pour dériver les instants, une asymétrie s'est vue : `applyOpening` pose
des `CABasicAnimation` (`fillMode = .forwards`, `isRemovedOnCompletion = false`) là où `applyClosing`
écrit des valeurs **modèle**. Un remplissage `.forwards` non retiré recouvre la valeur modèle — donc
la fermeture est calculée, stockée, et jamais vue.

Vérifié, pas déduit : **zéro `removeAnimation` dans tout `MeeshyUI`**, et `rootLayer` est un `let`
stocké que `rebuildLayers()` ne remplace pas. Le remplissage vit aussi longtemps que le canvas.

Le balayage des trois chemins de rendu a donné la portée exacte — et c'est elle qui rend le défaut
coûteux :

| Chemin | Touché | Pourquoi |
|---|---|---|
| **Aperçu du composer** | **oui** | seul chemin qui traverse `applyOpening` (transition `edit → play`) |
| Lecteur | non | canvas né en `.play` ; `self.mode = mode` dans l'`init` ne déclenche pas les observateurs — fait déjà consigné par `StoryOpeningParityTests` |
| Export MP4 | non | `applyStaticOpening` n'écrit que des valeurs modèle, `layer.render(in:)` n'exécutant pas le moteur d'animation |

**La surface où l'auteur vérifie ses transitions est la seule qui les avale.** L'aperçu mentait sur
l'export.

Le conflit se joue par **keyPath**, pas par effet : `.zoom` et `.slide` écrivent tous deux
`sublayerTransform`, donc une entrée `.zoom` masque une sortie `.slide` aussi sûrement que la sienne.
Le retrait est en conséquence chirurgical (une entrée `.fade` sous une sortie `.zoom` est laissée
en place) et ne se déclenche qu'à `progress > 0`, pour ne pas tronquer une entrée encore en vol.

## Vérification

- **7 témoins neufs**, dont **3 rouges avant** le correctif n°2 (`dropsTheOpeningFadeFill`,
  `dropsTheOpeningZoomFill`, `dropsEveryOpeningFillOnTheRootLayer`) ; les 2 autres verrouillent ce
  qui ne doit PAS être retiré (`keepsTheOpeningFill` avant la fenêtre, `keepsTheUnrelatedOpeningFade`).
- Les témoins portent sur `animation(forKey:)` et non sur le pixel : `presentationLayer()` exige un
  render server qu'aucun test unitaire n'a, et le remplissage attaché **est** le défaut.
- Gate : `sdk-tests.yml` sur la PR #2826 — compile et exécute `MeeshyUITests`, code de production
  compris.

## Reste ouvert après ce cycle

- **La fenêtre de transition dépasse la moitié du slide le plus court** — tête instruite du cycle 73
  ci-dessus. Arbitrage produit, pas correctif mécanique.
- **`ios-tests.yml` reste hors de portée** (`403`, pas de `actions: write`). Inchangé depuis le
  cycle 68 — mais la portée réelle de cette dette s'est réduite : tout ce qui vit dans
  `packages/MeeshySDK` est gatable par PR. Seule la couche `apps/ios` reste aveugle.
- **`eslint` ne peut toujours pas tourner sur le gateway** (aucun `eslint.config.js` depuis ESLint
  v9). Condition préexistante, non couverte par la CI.
- Les points hérités des cycles précédents restent tels quels : `@Display Name` inextractible dans
  le domaine social, `createStoryCommentNotificationsBatch` et son `visibility?` optionnel, les deux
  scripts de réparation base en attente d'exécution humaine, l'arbitrage `delete-for-me` du cycle 12.

---

# Tête instruite pour le cycle 72 — `sdk-tests` est ROUGE sur `main`, cause trouvée et prouvée

# Cycle 71b — L'effectif était AUSSI faux à la SOURCE (session parallèle, intégrée)

*Deux sessions ont traité la tête du cycle 71 en même temps, et sont tombées sur la MÊME racine —
un nom d'événement pour deux faits. Celle-ci a rebasé sur l'autre plutôt que de la doubler. Ce
qui suit ne garde de ce côté-ci que ce que l'autre n'avait pas, et dit pourquoi.*

## Ce qui a été REPRIS de l'autre session, et pourquoi c'est meilleur

- **Un événement dédié (`conversation:participant-joined`) plutôt qu'un champ discriminant.**
  Cette session distinguait les deux sens de `conversation:joined` par la PRÉSENCE de
  `memberCount` dans le payload. Ça marche, mais ça fait porter une sémantique à une option, et
  ça élargit l'audience d'un événement que des clients déployés écoutent déjà. Un nom distinct
  ne demande rien à personne : `conversation:joined` reste intact, room et payload compris, et
  un témoin le fige. **Repris, et le `memberCount` de `ConversationParticipationEventData` a été
  RETIRÉ** — il y aurait entretenu l'idée que cet événement parle d'appartenance.
- **`conversation:left` est le MÊME piège, et cette session ne l'avait pas vu.** L'autre l'a
  trouvé : un seul émetteur, `socket.emit` après `socket.leave(room)`, c'est-à-dire la FERMETURE
  d'un fil. Le web y décrémentait — un membre en moins à chaque fermeture. Les deux erreurs se
  compensaient en partie, ce qui les cachait.
- **L'arrivant écarté de l'éventail** : son effectif lui vient de `conversation:new`, qui le
  compte déjà.

## Ce qui reste de CE côté-ci, parce que l'autre session ne l'avait pas

1. **La colonne `memberCount` est MORTE, et deux routes en dépendaient.** C'est le défaut le plus
   grave des deux, et il est en amont de tout le travail temps réel : le compteur que l'autre
   session vient de maintenir correctement en direct partait, sur la LISTE, d'une valeur qui vaut
   `0` pour toute conversation créée depuis la migration héritée. Détail ci-dessous.
2. **Le bannissement et la levée n'atteignaient pas non plus les écrans de liste.** L'autre
   session a élargi départ, retrait et ajout ; `ban.ts` était resté thread-only.
3. **L'effectif absolu dans le payload.** L'autre session laisse les clients faire ±1. Un delta
   ne converge pas — détail ci-dessous — et le total ne coûte rien : il est lu sur la requête qui
   sert déjà à nommer les rooms. Porté par les quatre événements d'appartenance, y compris le
   nouveau `conversation:participant-joined`.


## La question posée par le cycle 70, et sa réponse

Le cycle 70 instruisait : *avant d'élargir l'audience des trois émetteurs de
`participants.ts`, établir si la ligne de liste rend quelque chose qui dépende de ces faits.*

**Elle en rend.** `ThemedConversationRow.swift` :
- `:351` badge de groupe, affiché sous condition `conversation.memberCount > 1` ;
- `:66` intensité visuelle, `min(memberCount / 50, 1)` ;
- et surtout `ConversationContext(… memberCount:)` → `DynamicColorGenerator`, où l'effectif
  pilote le **saturation boost** de la couleur d'accent (`min(memberCount / 100, 1) × 0.2`).

C'est cette vérification qui a trouvé le vrai défaut, et il n'était pas où le cycle 70 le
cherchait : **l'effectif était déjà faux avant tout événement.**

## Défaut 1 — `Conversation.memberCount` est une colonne MORTE, et deux routes en dépendaient

`memberCount Int @default(0)` existe dans le schéma. Le gateway ne l'écrit **nulle part** :
la seule écriture du dépôt est `migrations/migrate-from-legacy.ts`, qui recopie la valeur du
document hérité. Aucun `conversation.create` ne la pose, aucun `update` ne la maintient.

Toute conversation créée par le code actuel porte donc `0` à vie. Or :

| Route | Ce qu'elle servait |
|---|---|
| `GET /conversations` (LISTE) | la colonne → **0** |
| `GET /conversations/:id` (DÉTAIL) | `_count` filtré `isActive` → l'effectif réel |
| `GET /conversations/search` | `_count` filtré → l'effectif réel |
| `GET /admin/users/:id/conversations` | la colonne → **0** |

Deux réponses portaient le même nom de champ pour deux valeurs différentes. Conséquences
visibles, et elles n'ont pas la signature d'un bug de compteur :
- le badge de groupe iOS ne s'affiche JAMAIS sur la liste (`0 > 1` est faux) ;
- **la couleur d'accent d'une conversation change quand on l'ouvre** — saturation 0 sur la
  liste, saturation réelle sur le fil. La règle « toute la surface d'une conversation utilise
  `accentColor` » était respectée partout ; c'est son entrée qui divergeait ;
- côté web, `transformers.service.ts` faisait `memberCount || _count?.participants ||
  participants.length` : le `0` tombait sur le repli, et la liste n'envoie que 5 participants —
  un groupe de 200 s'affichait « 5 ».
- l'écran admin annonçait « 0 membres » sur toute conversation post-migration.

Le fragment `_count` est hissé en `utils/active-member-count.ts` et partagé par le détail, la
liste et l'admin. Il vit dans son propre module et non dans `core.ts` : l'écran admin peut le
consommer sans importer un module de routes entier — l'import qui traîne ses dépendances
jusque dans les doubles jest des suites voisines est exactement la leçon 93.

## Défaut 2 — `conversation:joined` porte DEUX sens (trouvé des DEUX côtés ; c'est la forme de l'AUTRE session qui reste)

`SERVER_EVENTS.CONVERSATION_JOINED` est émis par :
- `routes/conversations/participants.ts:377` — « untel devient membre » (diffusion) ;
- `socketio/handlers/ConversationHandler.ts:144` — « ton socket vient d'entrer dans la room »,
  un accusé adressé au SEUL socket qui rejoint, réémis à **chaque ouverture de conversation**
  et à chaque reconnexion.

`use-socket-cache-sync.ts` faisait `memberCount + 1` sur cet événement. **Ouvrir cinq fois le
même fil ajoutait cinq membres au compteur de la ligne de liste**, et `staleTime: Infinity`
ne relit jamais de lui-même pour corriger. C'est un défaut vivant, reproductible sans réseau
dégradé ni concurrence.

Aucun client ne pouvait faire mieux : rien dans le payload ne distinguait les deux sens.

**Le correctif retenu est celui de l'autre session** — un événement dédié
`conversation:participant-joined`, `conversation:joined` laissé strictement intact. Cette session
proposait de discriminer par la présence de `memberCount` ; c'est moins bon, et le champ a été
retiré de `ConversationParticipationEventData` pour ne pas laisser croire l'inverse. L'autre
session a en outre trouvé le jumeau que celle-ci avait manqué : `conversation:left` est lui aussi
un accusé de ROOM, et le web y décrémentait à chaque fermeture de fil.

## Le correctif — un effectif ABSOLU dans le payload, pas un delta

Les quatre transitions d'appartenance (`participants.ts` ajout et retrait, `leave.ts`,
`ban.ts` ban et unban) portent désormais `memberCount`, compté APRÈS l'écriture, sur la même
requête qui sert déjà à nommer les rooms — aucune requête supplémentaire.

C'est ce qui rend l'effectif **convergent**, et c'est le point de fond du cycle :
- un delta ne se rattrape jamais d'un événement manqué (hors room, hors ligne, trou de
  reconnexion), et les deux clients PERSISTENT la dérive — cache disque iOS
  (`schedulePersist`), `staleTime: Infinity` côté web ;
- un compte absolu se rattrape à l'événement suivant ;
- il tranche `membershipEnded` / `membershipRestored` de lui-même : bannir un ex-membre ne
  retire personne, donc le compte est simplement inchangé. Les drapeaux restent pour les
  clients qui décomptent encore ;
- **et il sépare les deux sens de `conversation:joined`** : seul l'événement d'appartenance
  le porte. Son absence n'est pas « serveur ancien » mais « cet événement ne parle pas
  d'appartenance » — le web ne touche donc plus au compteur sur l'accusé de room.

## Le correctif — l'audience, comme au cycle 70

Départ, retrait, bannissement, levée et ajout passent par `emitToConversationParticipants` :
rooms personnelles des membres ACTIFS comprises. Le commentaire de `participants.ts` nommait
pourtant « ConversationListViewModel count » depuis sa création — l'intention était écrite, et
l'audience la contredisait.

Aucune question de confidentialité : l'audience passe de « les membres qui ont le fil ouvert »
à « les membres », soit les mêmes personnes sur d'autres sockets.

La liste des membres restants est lue APRÈS l'écriture, donc la personne retirée ou bannie en
est naturellement absente — elle n'apprend pas son retrait par une ligne de liste qui se
décrémente, mais par la notification que la route lui envoie déjà. À l'inverse, une levée de
bannissement qui RESTAURE l'appartenance remet la cible dans l'audience : elle apprend son
retour sur sa propre ligne de liste, ce que la room de conversation ne pouvait pas lui dire.
Le commentaire de `ban.ts` qui justifiait l'ordre « rebrancher AVANT de diffuser » par
« la diffusion ne va qu'à la room de conversation » est devenu faux : il est corrigé, pas
supprimé — l'ordre garde une raison (aucun événement de room manqué entre les deux).

## `PARTICIPANT_ROLE_UPDATED` reste thread-only, et c'est écrit dans le code

Le troisième émetteur du balayage du cycle 70. Vérifié plutôt que supposé : aucun écran de
liste ne rend un rôle. Les consommateurs sont `use-participants.ts` (web) et `ParticipantsView`
(iOS), qui ne vivent que le fil ouvert. Élargir ferait payer une diffusion par changement de
rôle sans rien mettre à jour. La note est dans le code, pour que le cycle 72 ne refasse pas
l'enquête.

## Témoins

- liste : l'effectif vient du `_count` et non de la colonne ; le `select` demande bien le
  compte filtré `isActive` ; `_count` ne fuit pas dans la réponse ;
- admin : même chose, sur la route d'un autre module ;
- ajout de membre : les rooms personnelles sont adressées — y compris celle d'un participant
  SANS compte, nommée par son `Participant.id` — et le payload porte l'effectif absolu ;
- départ : idem, et le compte est celui des restants ;
- web : l'accusé de room (sans `memberCount`) ne touche plus au compteur, même répété ;
  l'événement d'appartenance POSE la valeur ; et un `memberCount: 2` sur un cache à 5 rend 2 —
  c'est la propriété de rattrapage, qu'un décrément (qui rendrait 4) ne peut pas avoir.

Le double `io` des suites touchées CHAÎNE désormais (`__tests__/helpers/chainable-io.ts`,
extrait de `recordEmitChains`) : `io.to(fil).to(perso).emit()` est la forme de production, et
un double qui casse dessus décrit un autre programme. `expect(io.to).toHaveBeenCalledWith(room)`
ne prouvait de toute façon pas que la room appartenait à la chaîne qui a émis.

Un défaut de fixture trouvé en passant : `conversations-ban.test.ts` faisait
`{ participant: { …défauts, ...overrides.participant }, ...overrides }` — le second spread
réécrasait `participant` en entier, annulant la fusion par clé que le premier prétendait faire.

## Ce que ce cycle NE fait pas

- **iOS**. Aucune chaîne Swift dans ce conteneur, et `ios-tests.yml` reste indéclenchable
  depuis cette routine (`403 Resource not accessible by integration` — pas d'`actions: write`).
  Le client iOS continue de faire ±1 ; il reçoit désormais un `memberCount` qu'il ignore.
  C'est la tête du cycle 72, et elle est maintenant sans risque : le serveur est correct et
  se décrit lui-même.
- **La colonne morte elle-même**. Elle reste dans le schéma. Plus aucune route du gateway ne
  la lit ; `services/agent/src/scheduler/eligible-conversations.ts` la recopie encore dans un
  champ que rien ne consomme.

---


# Cycle 71 — L'effectif d'une conversation cesse de mentir : un événement pour l'adhésion, une audience pour les listes

## Contrainte d'environnement — inchangée depuis le cycle 68

Conteneur Linux distant : aucune chaîne Swift (`swift: command not found`), aucun SDK Android,
`node_modules` absent au démarrage. Les trois commandes de la leçon 102 se réutilisent telles
quelles (`bun install --ignore-scripts`, `prisma generate --generator client`, `shared: bun run build`).

**Le premier geste instruit par le cycle 70 — « faire tourner `ios-tests.yml` sur `main` » — reste
impossible** : l'intégration GitHub de cette routine n'a pas `actions: write`, et le workflow ne se
déclenche autrement que sur push vers `dev`. La dette est donc reportée telle quelle. Ce cycle la
limite autrement : **la moitié la plus grave du défaut a été trouvée sur le WEB**, qui est gaté par
jest ici. Le Swift écrit reste ungatable, mais il n'est plus la seule preuve.

## Le fil instruit : trois émetteurs thread-only de `participants.ts`

Le cycle 70 demandait d'ÉTABLIR, avant d'écrire, si la ligne de liste rend quelque chose qui dépende
de ces trois faits. Réponse, vérifiée dans le code des deux clients :

- **Oui pour l'adhésion et le départ.** iOS `ThemedConversationRow:351` rend `conversation.memberCount`,
  et web `use-socket-cache-sync` le tient dans le cache React Query.
- **Non pour le rôle.** `PARTICIPANT_ROLE_UPDATED` n'a que des consommateurs d'écrans de participants,
  tous ouverts DANS la conversation. Il reste thread-only, et la raison est désormais **écrite dans le
  code** (`participants.ts`) plutôt que redécouverte au cycle 72, exactement comme demandé.

## Le vrai défaut, plus grave que l'audience : `conversation:joined` porte DEUX faits

C'est la découverte du cycle, et elle ne se déduisait pas du balayage des rooms.

`conversation:joined` est émis à deux endroits, avec **le même nom et le même payload
`{conversationId, userId}`** :
- `ConversationHandler:144` — ack **self-only** d'un socket qui vient de REJOINDRE LA ROOM, produit
  à **chaque ouverture de fil**, et qui ne change aucune appartenance ;
- `participants.ts:377` — diffusion d'une **adhésion réelle**.

Un client ne peut pas les distinguer. Conséquences mesurées dans chaque client :

1. **Web — le compteur grossissait d'une unité à chaque ouverture du fil.** `handleConversationJoined`
   faisait `memberCount + 1` sur l'ack. Trois ouvertures affichaient un groupe de 4 comme un groupe
   de 7, et `staleTime: Infinity` ne relit jamais la valeur d'elle-même. C'est un défaut visible,
   quotidien, et il vivait dans le code gaté.
2. **iOS — le compteur ne pouvait que décroître.** Aucun `+1` n'existait (précisément parce qu'il
   aurait compté les ouvertures), alors que départ, retrait et bannissement soustraient tous. Dérive
   monotone vers le bas, **persistée** par `schedulePersist` dans le cache disque.

Les deux symptômes sont opposés et ont la même racine : un nom d'événement pour deux faits.

### Et le pendant, trouvé en corrigeant le premier : `conversation:left`

Une fonction plus bas dans le MÊME fichier web, `handleConversationLeft` **décrémentait**
`memberCount` sur `conversation:left` — qui n'a qu'un seul émetteur, `socket.emit` après
`socket.leave(room)` (`ConversationHandler.handleConversationLeave`). C'est la FERMETURE d'un fil,
jamais un départ.

Les deux erreurs se compensaient **en partie**, ce qui les a cachées — et c'est précisément ce qui
rendait la correction partielle dangereuse : retirer le `+1` sans retirer le `-1` aurait transformé
une dérive à peu près nulle en **une soustraction nette par fermeture de fil**. Elles ne se
compensaient d'ailleurs jamais exactement : une reconnexion socket rejoint la room sans avoir émis
de `leave`, l'appli fermée n'en émet pas non plus, et la soustraction était bornée à 0 quand
l'addition ne l'était pas. Les deux handlers ne gardent désormais que leur invalidation.

iOS n'était pas exposé : ni `ConversationSyncEngine` ni `ParticipantsView` ne touchent l'effectif
sur `conversationLeft`.

## Le correctif : séparer les faits, puis élargir l'audience

`conversation:participant-joined` — nouvel événement, **symétrique de `conversation:participant-left`
jusque dans son payload** (`{conversationId, userId, displayName, joinedAt}`).

- `conversation:joined` **n'est pas touché** : même émetteur, même room, même payload. Les
  consommateurs existants (ParticipantsView, ConversationSyncEngine, web) ne bougent pas, et aucun
  client déployé ne régresse. Un témoin le fige.
- Web : `handleConversationJoined` perd son `+1` et ne garde que l'invalidation, légitime dans les
  deux lectures. Le `+1` passe sur le nouvel événement.
- iOS : nouveau `participantJoined` (SDK) et `+1` dans `ConversationListViewModel`.
- **Le nouvel arrivant est écarté de l'éventail, des DEUX côtés.** Le serveur l'omet
  (`NOT: { userId }`) ; le client écarte aussi sa propre identité, parce que l'auto-join de room
  côté serveur est asynchrone et pourrait le faire entrer dans la room avant l'emit. Son effectif
  lui vient de `conversation:new`, qui le compte déjà — l'incrémenter le mettrait en trop.

Et l'audience, comme au cycle 70 : `leave.ts`, le retrait et l'ajout passent tous par
`emitToConversationParticipants` — chaînage des rooms (au plus une copie par socket), room d'un
participant sans compte nommée par son `Participant.id`, membres inactifs écartés. **La room de
conversation reste en tête de chaîne** : elle porte le partant / le retiré, encore dedans à cet
instant (l'éviction vient après l'emit), donc leur propre signal est strictement inchangé.

## Témoins

- gateway `participants-membership-fanout.test.ts` (5) : la chaîne de rooms de l'ajout et du
  retrait, l'exclusion du nouvel arrivant, le payload symétrique, et `conversation:joined` figé sur
  la seule room du fil ;
- gateway `leave.test.ts` (+2) : la chaîne du départ, et le fait que l'éventail ne lise que les
  membres ACTIFS. Le test socket qui existait n'assertait rien du tout sur l'audience ;
- web `use-socket-cache-sync.test.tsx` (+4) : le `+1` sur le nouvel événement, et surtout **trois
  `conversation:joined` d'affilée qui laissent l'effectif à 4**, plus deux `conversation:left` qui
  le laissent à 4 également — les deux défauts web exactement ;
- web `presence.service.test.ts` (+1) : le relais du nouvel événement ;
- iOS `ConversationListViewModelTests` (+3) : `+1`, garde sur soi-même, et le `-1` du départ qui
  n'avait aucun témoin jusqu'ici. **Non exécutés** (pas de chaîne Swift ici).

---


# Tête instruite pour le cycle 72 — `sdk-tests` est ROUGE sur `main`, cause trouvée et prouvée

*Découvert en gatant le cycle 71, diagnostiqué mais NON corrigé : le correctif est du Swift que ce
conteneur ne peut ni compiler ni exécuter, et la leçon 95 condamne précisément d'en poser sur `main`
sans gate. Ce qui suit rend la correction mécanique pour qui dispose d'un Mac — l'arithmétique est
déjà faite.*

## Le fait

`sdk-tests.yml` échoue sur `main` : **8 échecs / 7017 succès / 35 ignorés** — chiffres et valeurs
**identiques** sur la PR #2817, donc totalement indépendants d'elle (c'est ce qui a autorisé son
merge). Déterministe, pas un flake : les mêmes valeurs octet pour octet à deux runs distants de 2 h.

Fenêtre de régression : run `b100ccfd1` (04:05) **vert** → run `9477dd74` (07:25) **rouge**.

## La cause, prouvée

`fcd002ee` — *« feat(story): allonge les interludes de lecture à 1,2 s »* — fait passer
`StoryRenderer.slideTransitionDuration` de **0.5 à 1.2**. Ce commit a relevé la borne de
`StoryOpeningParityTests` (1.0 → 1.5), mais **a oublié `StoryClosingTests` et
`TransitionChromeLaneTests`**, qui codent en dur des valeurs dérivées de 0,5 s.

L'arithmétique referme le dossier sans compilateur :

- `test_badgeWidth_matchesSlideTransitionDuration` attend `25.0`, obtient `60.0`.
  **60 / 25 = 2,4 = 1,2 / 0,5.** La largeur du badge est proportionnelle à la durée.
- `test_closingProgress_beforeWindow_returnsZero` : `closingProgress(totalDuration: 6.0, at: 5.5)`.
  Avec 0,5 s la fermeture commence à `6,0 − 0,5 = 5,5` ⇒ progress 0. Avec 1,2 s elle commence à
  `4,8` ⇒ `(5,5 − 4,8) / 1,2 = 0,58333…` — **exactement la valeur observée** `0.5833333333333335`.
- `test_closingProgress_midWindow_returnsLinearRamp` : `at: 5.75` ⇒ `(5,75 − 4,8) / 1,2 = 0,79166…`
  — **exactement** `0.7916666666666669`.

Les 5 autres (`applyClosing_fade/reveal/slide/zoom`, `simulateTickAt_fadeClosingInsideWindow`)
échouent par le même mécanisme : un instant d'échantillonnage choisi pour une fenêtre de 0,5 s.

## Le correctif à écrire

**Lier les témoins à la SSOT plutôt que de recaler des littéraux** — exactement ce que l'auteur de
`fcd002ee` a fait pour `StoryOpeningParityTests`. Les instants d'échantillonnage s'expriment en
fonction de `StoryRenderer.slideTransitionDuration` :

- « avant la fenêtre » ⇒ `at: totalDuration - StoryRenderer.slideTransitionDuration` (progress 0) ;
- « mi-fenêtre » ⇒ `at: totalDuration - StoryRenderer.slideTransitionDuration / 2` (progress 0,5) ;
- largeur de badge ⇒ dériver de la même constante.

Recaler les littéraux sur 1,2 s « marcherait » et **re-casserait au prochain ajustement de durée** —
c'est la troisième fois que cette constante bouge. Fichiers :
`packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryClosingTests.swift` et
`.../Timeline/Views/TransitionChromeLaneTests.swift`.

## Ce que ce cycle n'a PAS pu faire, et ce qu'il faudrait

`ios-tests.yml` reste hors de portée de cette routine (`403 Resource not accessible by integration`
— pas de `actions: write`). **`sdk-tests.yml`, lui, tourne sur les PR** : c'est le seul gate Swift
dont cette routine dispose, et il a bien servi au cycle 71 — les 7017 tests verts incluent les tests
de cache du SDK qui consomment `MockMessageSocket`, donc la moitié SDK du cycle a bien été compilée
et vérifiée. À garder en tête : **une PR suffit à gater le SDK ; seule la couche `apps/ios` reste
aveugle.**

---


# Tête instruite pour le cycle 72 — le client iOS compte encore par deltas, sur un serveur qui lui donne le total

*Vérifié dans le code de `main`, pas déduit. Aucune ligne de Swift écrite : `apps/ios` n'est ni
compilable ni gatable dans ce conteneur, et `ios-tests.yml` ne se déclenche que sur `dev` ou à la
main (`403` depuis cette routine, cf. cycle 70). Écrire du Swift invérifiable qui atterrit sur
`main` est ce que la leçon 95 condamne — d'où l'instruction plutôt que le correctif.*

## Le défaut : `ConversationListViewModel` fait ±1, et ne fait JAMAIS +1 sur un ajout

`apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`, ~ligne 950 :

- `participantSelfLeft` → `memberCount -= 1` puis `schedulePersist()` ;
- `participantBanned` (si `didEndMembership`) → `-= 1` ;
- `participantUnbanned` (si `didRestoreMembership`) → `+= 1` ;
- **`conversationJoined` : aucun abonnement.** Le compteur ne peut donc que DESCENDRE.

Le second point est la conséquence directe du défaut 2 du cycle 71 : `conversation:joined`
portait deux sens, et iOS a choisi — raisonnablement — de n'en tirer aucun delta. Le web avait
choisi l'autre branche et gonflait son compteur à chaque ouverture.

**Ce qui a changé** : les cinq transitions portent maintenant `memberCount`, ABSOLU, et l'accusé
de room de `ConversationHandler` est le seul à ne pas le porter. Le correctif iOS est donc une
AFFECTATION, pas un abonnement de plus à arbitrer :

1. ajouter `memberCount: Int?` à `ParticipantLeftEvent`, `ParticipantBannedEvent`,
   `ParticipantUnbannedEvent` et `ConversationParticipationEvent`
   (`packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`) — optionnel, un
   serveur plus ancien ne le porte pas ;
2. dans chaque `sink`, `if let count = event.memberCount { conversations[i].memberCount = count }`
   **avant** de retomber sur le delta existant. Poser plutôt que soustraire est ce qui rattrape
   une dérive au lieu de la continuer — et `schedulePersist()` écrit la valeur corrigée ;
3. s'abonner à `conversationJoined` UNIQUEMENT pour l'affectation, jamais pour un `+= 1` :
   l'événement sans `memberCount` est l'accusé de room, réémis à chaque ouverture. C'est le
   piège exact dans lequel le web était tombé — le reproduire à l'identique côté iOS serait la
   pire issue possible de ce cycle.

Les trois témoins à écrire sont symétriques de ceux du web : accusé de room répété ⇒ compteur
inchangé ; événement d'appartenance ⇒ valeur POSÉE ; cache à 5 + payload à 2 ⇒ 2.

## Second point, plus petit : la colonne morte

`Conversation.memberCount` n'est plus lue par aucune route du gateway. Restent deux gestes, à
arbitrer plutôt qu'à exécuter en aveugle :
- `services/agent/src/scheduler/eligible-conversations.ts:66` la recopie dans un champ
  `EligibleConversation.memberCount` que **rien ne consomme** (`conversation-scanner.ts` pose
  même `0` en dur sur l'autre chemin). C'est du code mort au sens strict.
- la colonne elle-même : la supprimer du schéma est une migration Mongo, donc un geste de
  déploiement, pas de code. La laisser coûte un champ trompeur que la prochaine route
  sélectionnera par mimétisme — c'est déjà arrivé deux fois.

## Points hérités, inchangés

- Les mentions du chemin de lien attendent toujours l'extraction qui écrit
  `Message.validatedMentions` ; aucun client iOS n'écoute `link:message:new` ; les pièces
  jointes du chemin de lien n'entrent pas dans le pipeline audio ; l'arbitrage `delete-for-me`
  du cycle 12 attend une validation humaine.
- `bun run lint` échoue toujours immédiatement (ESLint v9) — condition préexistante, la CI ne
  gate que `test:coverage`.
- La suppression de branche distante échoue depuis cette routine (`git push --delete` répond
  « Everything up-to-date » sans agir) — à faire depuis l'interface GitHub.

# Tête instruite pour le cycle 72 — le même « un nom, deux faits » ailleurs, et la réconciliation de l'effectif

*Deux pistes, la première vérifiée, la seconde à instruire.*

## 1. L'effectif n'a AUCUN chemin de réconciliation — ~~à instruire~~ **RÉPONDU, et corrigé (cycle 71b)**

*La question posée ici — « est-ce que `GET /conversations` renvoie `memberCount` à chaque page,
et le client l'écrase-t-il ? » — a été instruite par la session parallèle. La réponse était pire
que les deux branches envisagées, et elle est écrite au cycle 71b ci-dessus :*

**la liste renvoyait bien un `memberCount`… lu dans une colonne dénormalisée que le gateway
n'écrit NULLE PART.** Il n'y avait donc pas « rafraîchissement qui auto-corrige » ni « pas de
source de vérité » : il y avait une source de vérité qui MENTAIT, et qui valait `0` pour toute
conversation créée depuis la migration héritée. Un rafraîchissement de liste ne réparait pas la
dérive : il la remplaçait par zéro.

Les deux moitiés sont faites : la liste (et l'écran admin) comptent désormais les participants
actifs en base, et les quatre événements d'appartenance portent un `memberCount` **absolu** que
le web POSE au lieu de l'additionner. Reste la moitié iOS, instruite juste au-dessus.

## 2. Le balayage des événements surchargés est FAIT — et il est CLOS

*Exécuté à la fin du cycle 71, avec le critère mécanique que le défaut de ce cycle a fourni :
un `SERVER_EVENTS.X` émis à la fois par `socket.emit` (self-only) et par une diffusion
(`io.to(...)` / `emitToConversationParticipants`). 12 événements self-only croisés avec tous les
émetteurs de diffusion. **Trois intersections, aucun nouveau défaut de la classe du cycle 71.**

- `CONVERSATION_JOINED` — le défaut de ce cycle, corrigé.
- `CONVERSATION_UNREAD_UPDATED` — **résultat négatif, et il vaut d'être écrit** : ses quatre
  émetteurs « de diffusion » adressent tous `ROOMS.user(...)`, une room PERSONNELLE. Le fait porté
  est donc le même des deux côtés — « votre compteur non-lu pour cette conversation » — seule
  l'adresse change (ce socket-ci vs tous les appareils de la personne). Le `io.to(ROOMS.user(...))`
  est même le meilleur des deux : il couvre le multi-appareil. Rien à faire.
- `MESSAGE_TRANSLATION` — **même FAIT des deux côtés** (« voici la traduction du message X en
  langue Y » : une traduction n'est pas propre à un destinataire), donc pas le défaut du cycle 71.
  Mais **deux FORMES de payload sous un même nom** : `MeeshySocketIOManager:1342` émet
  `{messageId, translatedText, targetLanguage, confidenceScore}` (réponse à une demande à la
  volée, cache chaud) là où `:1509` diffuse `translationData`, qui porte un tableau
  `translations: [...]`. Chaque client doit donc décoder deux formes pour un seul événement.
  Défaut de contrat mineur, sans conséquence d'état observée — à traiter pour lui-même, pas
  comme une urgence.

**Ne pas refaire ce balayage.** S'il faut le rejouer après une évolution :
`grep -rhoE "socket\.emit\(SERVER_EVENTS\.[A-Z_]+" services/gateway/src` croisé avec les
émetteurs `.to(` — attention aux parenthèses imbriquées (`io.to(ROOMS.conversation(id))`), qu'un
`[^)]*` naïf manque.

## 3. Ancienne formulation, conservée pour mémoire — chercher les autres événements surchargés

`conversation:joined` et `conversation:left` sont traités — les deux sont **clos**. Le critère de
recherche se réutilise tel quel et n'a PAS été appliqué au-delà de ces deux-là : **un
`SERVER_EVENTS.X` émis à la fois par `socket.emit` (self-only) et par `io.to(...).emit`
(diffusion)**, ou dont le nom décrit un ÉTAT DE SOCKET là où un client lit un ÉTAT MÉTIER. Le
balayage complet reste à faire ; `grep -n "socket.emit(SERVER_EVENTS" services/gateway/src` en est
le point de départ, à croiser avec les émetteurs `io.to(`.

## Points hérités, inchangés

- Les mentions du chemin de lien attendent toujours l'extraction qui écrit `Message.validatedMentions` ;
  aucun client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de lien n'entrent pas
  dans le pipeline audio ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine.
- `bun run lint` échoue toujours immédiatement (ESLint v9) — condition préexistante, la CI ne gate
  que `test:coverage`.
- `ios-tests.yml` reste hors de portée de cette routine (`actions: write` manquant). Chaque cycle
  iOS repousse la même dette tant que le droit n'est pas accordé.
- La suppression de branche distante échoue depuis cette routine — à faire depuis l'interface GitHub.

# Cycle 70 — Le Prisme franchit la porte du ViewModel, et deux événements de conversation trouvent enfin les écrans de liste

## Contrainte d'environnement — un maillon de PLUS que les cycles précédents

Même conteneur Linux distant : aucune chaîne Swift (`swift: command not found`), aucun SDK Android,
`node_modules` absent au démarrage (`bun install --ignore-scripts` puis les deux commandes de la
leçon 102 : verifié, la note du cycle 68 se réutilise telle quelle).

**Nouveau, et il faut le lire avant d'instruire une lane iOS** : le cycle 69 laissait comme gate
« lancer `ios-tests.yml` à la main sur la branche (onglet Actions → Run workflow) ». **Cette
routine n'en a pas le droit.** `POST /actions/workflows/ios-tests.yml/dispatches` répond
`403 Resource not accessible by integration` — l'intégration GitHub de la routine n'a pas
`actions: write`. Le workflow ne se déclenche par ailleurs QUE sur push vers `dev`, et pousser sur
`dev` n'est pas autorisé depuis cette branche.

Conséquence à écrire noir sur blanc plutôt qu'à contourner : **la moitié iOS de ce cycle est
livrée SANS son gate**. Ni compilée, ni testée. Ce qui a été fait à la place, faute de mieux :
- toute inférence de type évitable a été retirée du Swift écrit (la closure immédiatement appliquée
  à type tuple étiqueté est devenue une `private static func` à type déclaré ; le ternaire
  `NSNull() : map` du helper de test porte `as Any` des deux côtés, sinon les deux branches n'ont
  pas de type commun) ;
- chaque API touchée a été relue dans son fichier source (`LastMessageFacet.init` accepte bien
  `translations:`/`originalLanguage:` ; `MeeshyConversation.lastMessageTranslations` est bien
  `public var` ; `MockMessageSocket.conversationUpdated` est bien un `PassthroughSubject`) ;
- `line_length` et les règles de style sont dans `disabled_rules` de `.swiftlint.yml` — rien à
  gagner de ce côté.

Cela ne remplace pas une compilation. **Premier geste du cycle 71 : faire tourner `ios-tests.yml`
sur `main` et corriger ce qui rougit.** Si la routine doit continuer à traiter des lanes iOS, il
faut lui accorder `actions: write` — sans quoi chaque cycle iOS repousse la même dette.

## Moitié iOS — la tête instruite du cycle 70, consommée

Le défaut décrit par le cycle 69 a été **revérifié dans le code de `main` avant la première ligne**
et la description était exacte : `ConversationListViewModel.conversationUpdated` ne lisait jamais
`lastMessageTranslations`.

- **Branche `else` (horodatage ÉGAL ⇒ ÉDITION)** : le nouveau texte était appliqué, la carte de
  traduction de l'ANCIEN restait. Le résolveur PRÉFÉRANT la traduction à `lastMessagePreview`, la
  ligne rendait le texte d'avant **indéfiniment**. C'était le défaut du cycle 69, toujours vivant
  sur le chemin que voit l'écran.
- **Branche `bumpToTop`** : la facette était construite sans `translations:` ni `originalLanguage:`
  — la carte que le gateway venait de résoudre POUR CE lecteur était jetée.

L'extraction du tri-état est faite **une seule fois**, avant les deux branches, en recopiant
`ConversationStore.merging` (SDK) : `.replaced` applique la paire (carte vide ⇒ `nil`),
`.unchanged` ne touche à rien. Le `>` strict du garde de bump **n'a pas bougé**, exactement comme
le cycle 69 l'avait instruit : il protège une facette délibérément neutre, et le relâcher ferait
perdre pièce jointe, expiration et « vue unique » à chaque édition.

Trois témoins : édition ⇒ carte périmée, nouveau message ⇒ carte servie, **métadonnées ⇒ carte
intacte**. Le troisième est le seul qui exerce la moitié `.unchanged` du tri-état, et il se trouve
que la moitié gateway de ce même cycle en dépend (voir ci-dessous) : les deux se prouvent
mutuellement le contrat.

Le helper `makeConversationUpdatedEvent` construit l'événement **depuis du JSON** — seule façon
d'exprimer « clé absente » face à « clé nulle ». Il a fallu l'élargir (`lastMessagePreview`,
`lastMessageTranslations`, `lastMessageOriginalLanguage`) : la note du cycle 69 disait que les deux
cas étaient déjà exprimables sans y toucher, ce n'était pas le cas.

## Moitié gateway — deux événements de conversation n'atteignaient QUE le fil ouvert

Trouvé en cherchant les autres émetteurs de `CONVERSATION_UPDATED`, gaté localement (jest).

`PUT /conversations/:id` et `DELETE /conversations/:id` n'adressaient leurs événements qu'à
`ROOMS.conversation(id)`. Or c'est **le cas exact que `emitConversationPreviewUpdate` documente
depuis sa création pour l'autre moitié du même payload** : un participant posé sur l'écran de liste
a QUITTÉ la room de conversation et n'est joignable que par sa room personnelle.

1. **Renommage** (et avatar, bannière, mode lent, canal d'annonce, traduction auto) : la ligne de
   liste de tous ceux qui n'avaient pas le fil ouvert gardait l'ancienne valeur jusqu'à un
   rechargement complet.
2. **Clôture** : le membre gardait la ligne dans sa liste et ne l'apprenait qu'en tapant dessus.
   Le commentaire du code annonçait pourtant « Broadcast closure to all members ». Les deux clients
   écoutent bien `conversation:closed` — web `use-socket-cache-sync.ts` (qui RETIRE la ligne du
   cache de liste), iOS `MessageSocketManager` — l'événement ne leur parvenait simplement jamais.

Les deux passent par `emitToConversationParticipants`, déjà la formulation de référence : chaînage
des rooms (au plus UNE copie par socket), room d'un participant sans compte nommée par son
`Participant.id` (`userId ?? id`), participants inactifs écartés. La clôture lit ses participants
**dans son écriture** (`include`), sans requête supplémentaire.

Un témoin fige que le payload ne porte **aucune clé `lastMessage*`** — et c'est ici que les deux
moitiés du cycle se rejoignent : le tri-état client distingue « clé absente » de « clé nulle », donc
un `lastMessageTranslations: null` posé par un renommage effacerait une traduction parfaitement
valide sur toutes les lignes de liste. Le témoin iOS n° 3 est l'autre bout de ce même contrat.

Le hard-delete de conversation **n'avait aucun témoin de route** jusqu'ici : le fichier de test
homonyme (`conversation-deleted-broadcast.test.ts`) couvre `delete-for-me`, une autre route.

## Retiré du backlog après enquête — l'audit `ROOMS.user(` est CLOS

Le backlog le portait depuis le cycle 69 : « la règle *adresser par `userId ?? id`* vaut pour tout
émetteur personnel, et rien ne garantit que les autres la respectent ». Instruit par recherche sur
`ROOMS.user(`, comme demandé, plutôt que par déduction. **Aucun défaut restant** :

- `emitConversationPreviewUpdate` passe déjà par `participantUserRoomTargets` (cycle 69) ;
- `emitUnreadCountsToRecipients`, `callEndedFanout`, `offlineParticipantQueue`, `MessageHandler`
  portent tous `userId ?? id` ;
- `core.ts:1238` (CONVERSATION_NEW) adresse des **User.id**, pas des lignes `Participant` — la
  règle ne s'y applique pas ;
- les `.map(p => p.userId)` restants sont **sémantiquement corrects** et non des oublis : contrôle
  de blocage (`MessageHandler:2029`, `messages.ts:1769` — un anonyme ne peut pas être bloqué),
  préférences d'accusés de lecture (`MessageReadStatusService:1080` — pas de `userId`, pas de ligne
  de préférence, donc visible par défaut), notifications push (il faut un compte).

C'est un résultat négatif, et il vaut d'être écrit : sans lui, le prochain cycle refait l'enquête.

---

# Tête instruite pour le cycle 71 — les mêmes écrans de liste, sur les événements de MEMBRES

*Repéré par le même balayage que ci-dessus (`to(ROOMS.conversation(`), NON traité faute d'avoir
vérifié ce que la ligne de liste rend réellement. C'est cette vérification qui doit précéder le
correctif, pas l'inverse : élargir une audience a un coût et une dimension de confidentialité.*

Trois émetteurs de `routes/conversations/participants.ts` sont thread-only, comme l'étaient le
renommage et la clôture :

- `:377` `CONVERSATION_JOINED` — un membre rejoint ;
- `:562` `CONVERSATION_PARTICIPANT_LEFT` — un membre part ;
- `:748` `PARTICIPANT_ROLE_UPDATED` — un rôle change.

**Ce qu'il faut établir AVANT d'écrire quoi que ce soit** : la ligne de liste rend-elle quelque
chose qui dépende de ces trois faits ? Si la ligne affiche un compteur de membres ou une pile
d'avatars, les deux premiers sont le même défaut que ce cycle vient de corriger et se corrigent
pareil (`emitToConversationParticipants`, participants actifs, payload inchangé). Si elle n'en rend
rien, ils sont thread-only à juste titre et il faut le NOTER dans le code plutôt que de le
redécouvrir au cycle 72. `PARTICIPANT_ROLE_UPDATED` est le plus douteux des trois : un rôle ne se
voit nulle part dans une liste.

Le reste des émetteurs thread-only du balayage est légitime et n'a pas besoin d'être réinstruit :
réactions, typing, position live, transcription/traduction audio, `MESSAGE_EDITED` (déjà doublé par
`emitConversationPreviewUpdate` pour la liste).

## Points hérités, inchangés

- Les mentions du chemin de lien attendent toujours l'extraction qui écrit `Message.validatedMentions` ;
  aucun client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de lien n'entrent pas
  dans le pipeline audio ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine.
- `bun run lint` échoue toujours immédiatement (ESLint v9) — condition préexistante, la CI ne gate
  que `test:coverage`.
- La suppression de branche distante échoue depuis cette routine (`git push --delete` répond
  « Everything up-to-date » sans agir) — à faire depuis l'interface GitHub.

# Cycle 69b — Solde d'une session parallèle, et la tête du cycle 70

*Deux sessions ont traité la tête instruite du cycle 68 en même temps. Celle-ci a rebasé sur
l'autre plutôt que de la doubler. Rien de nouveau n'est écrit ici : ce bloc note ce qui a été
comparé, et instruit le maillon qu'AUCUNE des deux n'a fermé.*

## L'intégration, faite dans le sens de la leçon des cycles 23/25b

Les deux implémentations ont été comparées **défaut par défaut**, jamais « qui est arrivé en
premier ». Celle du cycle 69 est **strictement meilleure partout où les deux se recouvrent**, et
c'est elle qui reste :

- unité partagée `lastMessagePreviewPrism.ts` (fragment `select` + résolveur), là où cette session
  câblait l'appel en ligne dans chaque émetteur ;
- `participantUserRoomTargets` avec `participantUserRooms` réécrit **comme une projection** de lui —
  cette session ajoutait une seconde fonction à côté, donc deux traversées à garder d'accord ;
- tri-état Swift `LastMessagePreviewTranslations` (`.unchanged` / `.replaced`), là où cette session
  portait un `Bool` parallèle à un `Optional` — deux champs à garder cohérents contre un seul ;
- `ConversationStore.merging` hissée en fonction pure `nonisolated` **partagée avec le writer de
  cache disque** : le store RAM et la liste persistée ne peuvent plus diverger sur ce que signifie
  un `conversation:updated`. Cette session n'avait pas vu ce second consommateur ;
- côté web, `extractPreviewTranslations` hissée et partagée avec le chemin REST, là où cette session
  se contentait d'un `?? undefined` ;
- côté témoins, `recordEmitChains` lie le payload à SA room. L'assertion de cette session comparait
  un ensemble non ordonné de payloads : elle ne pouvait pas prouver **qui** recevait **quelle**
  carte — exactement la propriété que « par destinataire » revendique.

Les deux sessions s'accordaient, indépendamment, sur les deux points les plus délicats : le
`>` → `>=` du garde monotone, et `container.contains` comme seul endroit où « clé absente » se
distingue de « clé nulle ». Le troisième émetteur (`MessageHandler.broadcastNewMessage`, l'envoi
WebSocket PRIMAIRE) manquait au cadrage initial « les deux émetteurs jumeaux » ; il a été greffé
sur `main` (`c74d82e9`) pendant que cette session le rédigeait, dans une version plus propre
(réutilise le type exporté `PreviewPrismParticipant`). Rien à ajouter.

---

# Tête instruite pour le cycle 70 — le Prisme s'arrête à la porte du ViewModel iOS

*Vérifié dans le code de `main` après le cycle 69, pas déduit. Aucune ligne de production écrite :
`apps/ios` n'est compilable ni gatable dans ce conteneur (aucune chaîne Swift ; `ios-tests.yml` ne
tourne que sur `dev` ou à la demande). Écrire du Swift invérifiable qui atterrit sur `main` est
précisément ce que la leçon 95 condamne — d'où l'instruction plutôt que le correctif.*

## Le défaut : la moitié cliente du cycle 69 ne touche pas l'écran de la liste

Le cycle 69 a corrigé `ConversationStore` (SDK). Mais l'écran de liste de l'app passe par
`ConversationListViewModel.conversationUpdated` (`apps/ios/.../ConversationListViewModel.swift`,
~ligne 800), qui **ne lit JAMAIS le Prisme** — `grep lastMessageTranslations` sur ce fichier ne rend
rien. Deux branches, deux symptômes distincts :

1. **Branche `else` (horodatage égal ⇒ ÉDITION).** Elle applique bien `lastMessageId`,
   `lastMessageLocation` et `lastMessagePreview`… et laisse `lastMessageTranslations` intacte.
   C'est **littéralement le défaut du cycle 69, toujours vivant** : nouveau texte + carte de
   l'ancien, et `resolvedLastMessagePreview` préfère la carte. Le gateway envoie désormais le
   `.replaced` qui périmerait la carte ; personne ne l'écoute ici.

2. **Branche `bumpToTop` (nouveau message).** La facette est construite en
   `LastMessageFacet(id:preview:senderName:at:location:)`, sans `translations:` ni
   `originalLanguage:` — donc `applyLastMessage` pose `nil`. Pas de texte périmé (c'est la vertu de
   la facette « en bloc »), mais la carte que le gateway vient de résoudre **pour ce lecteur** est
   jetée : la ligne montre l'original là où une traduction était disponible et payée.

## Ce qu'il faut écrire

`LastMessageFacet.init` accepte DÉJÀ `translations:` et `originalLanguage:`
(`packages/MeeshySDK/.../LastMessageFacet.swift`) — rien à élargir :

- **branche bump** : passer `translations:` / `originalLanguage:` depuis l'événement ;
- **branche `else`** : appliquer la paire au même titre que `lastMessagePreview`, en respectant le
  tri-état — `if case .replaced(let map) = event.lastMessageTranslations` ⇒ poser
  `map.isEmpty ? nil : map` **et** `lastMessageOriginalLanguage` ; `.unchanged` ⇒ ne rien toucher.
  `ConversationStore.merging` (SDK) est la formulation de référence, à recopier telle quelle plutôt
  qu'à réinventer.

**Ne PAS toucher au `>` strict de cette branche.** Il ne s'agit pas du même garde que celui du SDK :
ici il protège l'appel à `bumpToTop`, qui applique une facette **délibérément neutre**. Le relâcher
en `>=` ferait perdre à la ligne la pièce jointe, l'expiration et le drapeau « vue unique » du
message courant à chaque édition — le remède serait pire, et la branche `else` existe précisément
pour traiter ce cas sans réordonner.

**Témoins** : `ConversationListViewModelTests` a déjà `makeConversationUpdatedEvent`, qui construit
l'événement **depuis du JSON** — donc `"lastMessageTranslations": null` et une carte peuplée sont
tous deux exprimables sans toucher au helper. Deux témoins suffisent : édition ⇒ carte périmée,
nouveau message ⇒ carte servie.

**Gate** : `ios-tests.yml` ne se déclenche pas sur les PR. Lancer le workflow à la main sur la
branche (onglet Actions → « Run workflow ») avant de merger, sinon la vérification n'existe pas.

---

# Cycle 69 — Après une édition, la ligne de liste affichait le texte D'AVANT

## Contrainte d'environnement (identique aux cycles 61/63→68, revérifiée)

Même conteneur Linux distant. Aucune chaîne Swift (`swift: command not found`), aucun SDK Android
(`~/Android` absent). `tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane reste
matériellement impossible ici : **le curseur n'a donc PAS été touché.** Lanes gatables localement :
gateway, web, shared. La lane SDK iOS est gatée par `sdk-tests.yml` en CI (précédent : cycles 65/68).

`node_modules` était de nouveau absent au démarrage. `bun install --ignore-scripts` passe et suffit
à tous les gates de ce cycle — la note du cycle 68 s'est vérifiée telle quelle, à réutiliser.

## La tête instruite a été consommée, et RE-PROUVÉE avant d'écrire

Le cycle 68 laissait cette tête « instruite, NON CONSOMMÉE ». Chaque maillon a été relu dans le code
réel avant la première ligne de production — la description était exacte, et l'enquête a trouvé
**deux maillons de plus** que le cadrage ne nommait pas (§ « Ce que l'enquête a ajouté »).

## Le défaut

Le symptôme n'est pas « la ligne n'est pas traduite » : c'est **la ligne affiche l'ANCIEN contenu**,
indéfiniment, jusqu'à un rechargement complet de la liste.

1. `GET /conversations` hydrate la ligne avec `lastMessagePreview` (l'original tronqué),
   `lastMessageTranslations` (la carte du prisme du lecteur) et `lastMessageOriginalLanguage`.
2. Le résolveur des deux clients — `resolvedLastMessagePreview` (iOS, `CoreModels.swift:238`) et
   `formatLastMessage` (web) — **PRÉFÈRE la traduction** à `lastMessagePreview`.
3. Une édition arrive. Le gateway **périme la colonne dans la même écriture** (`translations: null`,
   `routes/messages.ts`), délibérément atomique.
4. Les deux émetteurs de `conversation:updated` n'envoyaient que `lastMessagePreview` — **sans
   traductions, sans langue d'origine** (`emitConversationPreviewUpdate.ts:88-90` pour
   l'édition/suppression, `MeeshySocketIOManager.ts` pour l'envoi).
5. Les clients n'écrasaient donc que l'aperçu : `lastMessagePreview` = nouveau texte,
   `lastMessageTranslations` = **carte de l'ANCIEN texte**. Le résolveur rend l'ancien contenu.

**Qui le voit :** tout lecteur dont la langue primaire diffère de la langue d'origine du message et
pour qui une traduction existait — le cas NOMINAL du produit. Le serveur avait bien fait son
travail ; c'est le fil qui ne le disait pas.

## Pourquoi le correctif évident est faux (revérifié, pas recopié)

« Vider la carte côté client quand un nouvel aperçu arrive » **casserait le cycle 65** : le chemin
d'envoi émet aussi `conversation:updated`, derrière un `message:new` qui vient d'installer la carte.
Et raffiner en « vider seulement si `lastMessageId` diffère » ne marche pas : **une édition garde le
MÊME message**, donc le même id — c'est exactement le seul cas que ce raffinement laisse passer.

**Le client ne peut pas trancher seul.** Seul le serveur sait que la carte a été périmée.

## Ce que l'enquête a ajouté au cadrage

Deux maillons que la tête instruite ne nommait pas, tous deux **bloquants** :

1. **iOS jetait TOUT le groupe d'aperçu sur une édition.** `applyConversationUpdated` gardait
   `event.lastMessageAt > conv.lastMessageAt` — un `>` STRICT. Une édition ne crée pas de message :
   `createdAt` est inchangé, donc l'événement portait un timestamp ÉGAL et le groupe entier était
   silencieusement jeté. Le doc-comment de la fonction énonce pourtant la règle correcte (« un
   `lastMessageAt` plus ANCIEN décrit un message périmé ») : **le code était plus strict que sa
   propre spécification**, et `>=` est ce qu'elle dit. Sans ce correctif, la moitié iOS de ce cycle
   était inerte.
2. **`Optional` ne suffit pas à porter le signal.** « Clé absente » (renommage : ne pas toucher la
   carte) et « clé nulle » (le serveur DIT que la carte est périmée) demandent des actions opposées,
   et `decodeIfPresent` rend `nil` dans les deux cas. D'où le tri-état
   `LastMessagePreviewTranslations` (`.unchanged` / `.replaced`), décodé par
   `container.contains(...)` — la PRÉSENCE de la clé, seul endroit où la distinction existe.

## Le correctif

**Gateway — les deux émetteurs jumeaux, traités ensemble** (sinon l'aperçu redevient dépendant du
transport : traduit après une édition, brut après un envoi) :

- nouvelle unité partagée `socketio/utils/lastMessagePreviewPrism.ts` —
  `PREVIEW_PRISM_PARTICIPANT_SELECT` (le fragment `select` que tout émetteur d'aperçu doit charger)
  et `resolveLastMessagePreviewPrism(participant, message)`, qui délègue à
  `resolveUserLanguagesOrdered` + `buildLastMessagePreviewTranslations`, les unités que `core.ts`
  utilise DÉJÀ pour la même donnée. Aucune règle de prisme réimplémentée.
- **la question « payload PAR DESTINATAIRE » du cycle 60 est tranchée par le code existant** : la
  boucle par participant était déjà là, elle envoyait simplement le même objet à tout le monde. Elle
  devient `participantUserRoomTargets`, qui rend `{ room, participant }` — la règle de dédup
  `userId ?? id` reste dans UN seul endroit, `participantUserRooms` en étant désormais une projection.
- `null` est envoyé comme **valeur**, jamais omis : c'est ce vide REÇU qui périme la carte du client.

**Shared** : `ConversationUpdatedEventData` déclare les deux champs (ils circulaient jusque-là sur
l'`index signature`, donc sans contrat lisible).

**Web** : `normalizeConversationPatch` normalise les deux champs **avec la même unité que le chemin
REST** — `extractPreviewTranslations` est hissée de méthode privée à fonction de module et partagée.
Deux validations distinctes pour un même champ auraient laissé le cache détenir deux formes selon le
transport, exactement ce que le doc-comment du normaliseur reproche déjà aux dates. La clé reste
PRÉSENTE avec `undefined` (le cache applique `{ ...c, ...patch }` : une clé absente laisserait la
carte périmée en place).

**SDK iOS** : tri-état + application dans le MÊME groupe monotone que `lastMessagePreview`, et
`>` → `>=`.

## Vérification

- Gateway : **suite complète — 650 suites / 16 378 tests verts** (base cycle 68 : 650 / 16 371 ;
  l'écart est exactement les 7 témoins gateway ajoutés — 5 sur l'émetteur d'édition, 2 sur le
  jumeau d'envoi — aucun perdu). Les 13 autres témoins de ce cycle vivent hors de cette suite :
  5 côté web, 8 côté SDK iOS. Total 20.
- Gateway : RED observé avant implémentation — 5 témoins en échec sur
  `emitConversationPreviewUpdate.test.ts`, 7 préexistants verts.
- Gateway : `tsc --noEmit` — **0 erreur** (après `prisma generate --generator client` +
  `bun run build` du shared).
- Web : RED observé (3/5), puis **30 suites / 750 tests verts**. `tsc` : aucune erreur sur les
  fichiers touchés (les erreurs restantes préexistent, dans des fichiers de test non touchés).
- SDK iOS : **non gatable ici** (aucune chaîne Swift). 8 témoins écrits — 5 sur
  `applyConversationUpdated`, 3 sur le décodage tri-état. Gate = `sdk-tests.yml` en CI.

## Reste ouvert après ce cycle

- **Supprimer le DERNIER message ne met toujours pas la ligne à jour sur iOS.** Le nouveau dernier
  message est plus ANCIEN, donc le garde monotone le rejette — à raison selon sa règle. C'est un
  contrat distinct (« le dernier message recule »), pas une variante de celui-ci : le traiter
  demande de distinguer « événement en retard » de « le dernier message a changé pour un plus
  ancien », ce qu'un seul timestamp ne peut pas exprimer. **Candidat sérieux pour le cycle 70.**
- **`conversation:updated` du chemin d'envoi porte `lastMessagePreview: message.content` brut** —
  non tronqué, là où `GET /conversations` applique `truncateMessagePreview` (300 points de code).
  Un très long message gonfle donc chaque payload temps réel. iOS tronque à la réception
  (`meeshyPreviewTruncated`), le web non.
- Les points hérités du cycle 68 restent inchangés : le chemin REST/ZMQ n'emporte pas l'enveloppe de
  chiffrement ; `forwardedFromId` manque au payload REST ; `serializeAttachmentForSocket` est plus
  étroit que sa promesse ; `eslint` ne peut pas tourner sur le gateway (pas d'`eslint.config.js`
  depuis ESLint v9) ; `PinnedMessageBanner` n'affiche qu'UNE épingle ; `ConversationPicker.tsx`
  rend `lastMessage.content` brut ; le « mensonge de type » de `Message.translations` ; les deux
  scripts de réparation base attendent une exécution humaine ; l'arbitrage `delete-for-me` du
  cycle 12 attend une validation humaine.

---

# Cycle 68 — L'écho REST ne portait pas le `clientMessageId` que le client attendait

## Contrainte d'environnement (identique aux cycles 61/63/64/65/66/67, revérifiée)

Même conteneur Linux distant. Aucune chaîne Swift (`swift: command not found`), aucun SDK Android
(`~/Android` absent → pas de `./apps/android/meeshy.sh check`, seul gate de cette lane).
`tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane reste matériellement impossible ici :
**le curseur n'a donc PAS été touché.** Lanes gatables : gateway, web, shared.

Note d'environnement, nouvelle : `node_modules` était absent au démarrage. `bun install` échoue sur
le postinstall de `grpc-tools` (`node-pre-gyp` → « Could not parse s3 bucket name from virtual host
url », le proxy sortant). **`bun install --ignore-scripts` passe** et suffit à tous les gates de ce
cycle. À réutiliser tel quel au prochain run plutôt que de rejouer le diagnostic.

## Le défaut

`MeeshySocketIOManager._broadcastNewMessage` — l'émetteur de `message:new` du chemin **REST/ZMQ** —
ne mettait `clientMessageId` **dans aucun payload**, et n'émettait qu'une seule copie à la room de
conversation.

Le contrat que la clé sert est écrit noir sur blanc dans le dépôt
(`socketio/utils/message-ack-shaping.ts`, invariants #1 et #2) et implémenté par les DEUX autres
transports : le chemin socket (`MessageHandler.broadcastNewMessage`, `:1199-1265`) sépare un
`senderPayload` cid-aware adressé à `ROOMS.user(sender.userId)` d'un `broadcastPayload` cid-strippé
adressé à la room `.except()` cette room personnelle ; les deux routes de lien appellent
`stripClientMessageId` (`routes/links/messages.ts:392`, `:676`). Le chemin REST/ZMQ n'avait ni l'une
ni l'autre moitié.

## Pourquoi ça compte, prouvé côté client et non supposé

Ce n'est pas un chemin secondaire. `ConversationViewModel.sendMessage` (iOS) n'emprunte le
socket-first que si `socketFirstEligible` — qui exige `!isEncrypted && (attachmentIds?.isEmpty ??
true) && resolvedExpiresAt == nil && !resolvedIsViewOnce && resolvedBlur != true &&
!pendingEffects.hasAnyEffect`. **Tout le reste part en REST** : chaque pièce jointe, chaque DM
chiffré (l'E2EE est appliqué automatiquement dès `isDirect`), chaque vue-unique, chaque éphémère,
chaque message à effets — plus tout raté du socket-first.

Et le client avait écrit une garde POUR CETTE COURSE, qui ne pouvait pas se déclencher.
`MessagePersistenceActor.upsert` (`:1710-1718`) place `clientMessageId` en **branche 0**, avant
`PendingIdRecord` et avant l'id serveur, avec ce commentaire :

> « catches an echo that races ahead of `applyEvent(.serverAck)` … Without it, an echo arriving
> before the REST ACK falls through to the insert branch and produces a duplicate `cid` /
> server-id pair (Sprint 2 RC2.3b). »

« an echo arriving before the REST ACK » : la course nommée est exactement celle du chemin REST. Le
gateway ne posait jamais la clé sur laquelle cette branche indexe — la défense était **inatteignable
par construction**.

Le pire cas n'est pas le doublon, c'est la bulle bloquée. La route saute délibérément le broadcast
sur un renvoi idempotent (garde `!isDuplicate`, `routes/conversations/messages.ts:1843`). Quand la
réponse HTTP du premier POST se perd (app mise en fond, cellulaire coupé, crash) et que l'outbox
durable renvoie avec le même `clientMessageId`, le gateway déduplique et **n'émet rien**. Les deux
seules voies de promotion étaient la réponse HTTP (perdue) et un `message:new` porteur du cid
(jamais envoyé) : la ligne optimiste restait en `.sending` indéfiniment alors que le message était
stocké et distribué à tout le monde. Seul un rechargement complet la réconciliait.

## Le correctif

Le split du chemin socket, à l'identique, en réutilisant les unités qui existaient déjà :

- `clientMessageId` entre dans le payload (même accès que `MessageHandler._buildMessagePayload:1813`) ;
- `stripClientMessageId(messagePayload)` produit la copie des pairs — **sans cast** en
  `Record<string, unknown>`, le helper étant générique et préservant (cycle 7), donc l'emit typé
  `message:new` reste vérifié par le compilateur ;
- `io.to(room).except(ROOMS.user(senderUserId))` pour les pairs, `io.to(ROOMS.user(senderUserId))`
  pour l'expéditeur — le `.except()` est ce qui empêche un appareil de l'expéditeur présent dans la
  room de recevoir DEUX `message:new` ;
- expéditeur sans compte (invité de lien) : une seule émission room-wide cid-strippée, comportement
  strictement inchangé ;
- `_emitMessageNewByLanguage` du manager reçoit l'option `excludeUserId` que son jumeau de
  `MessageHandler` avait déjà, pour que `SOCKET_LANG_FILTER=true` ne réintroduise pas le doublon ;
- le rejeu hors ligne (`deliveryQueue.enqueue`) stocke désormais le corps **destinataire** : même
  règle que `enqueueOfflineLinkMessage`, dont le doc-comment la formule déjà (« a replay carrying
  the author's `clientMessageId` would leak their local optimistic id into another user's id
  space »).

## Vérification

- Gateway : **suite complète — 650 suites / 16 371 tests verts.** Base du cycle 67 : 650 / 16 366.
  L'écart est exactement les 5 témoins ajoutés — aucune régression, aucun témoin perdu.
- Gateway : RED observé avant implémentation sur 2 des 5 (`toSender` vide ; `excepted` vide). Les
  3 autres passaient **à vide** avant le correctif — le cid n'étant nulle part, son absence chez les
  pairs était trivialement vraie. Ils deviennent portants une fois la clé sur le fil : ils tombent
  si un futur changement oublie le `strip`.
- Gateway : `tsc --noEmit` — **0 erreur sur tout le service** (après `prisma generate --generator
  client` + `bun run build` du shared, prérequis CI documentés dans `CLAUDE.md`).

## Reste ouvert après ce cycle

- **Le chemin REST/ZMQ n'emporte toujours pas l'enveloppe de chiffrement.** `_broadcastNewMessage`
  omet `isEncrypted` / `encryptionMode` / `encryptedContent` / `encryptionMetadata` /
  `encryptedPayload`, que `_buildMessagePayload` porte tous. Or `MessageProcessor.saveMessage:396`
  stocke `content: ''` pour un message chiffré, et le web lit `encryptedContent` +
  `encryptionMetadata` **sur le payload socket** pour déchiffrer
  (`messaging.service.ts:229-247`) : un message chiffré posté en REST arriverait en bulle VIDE.
  **Latent aujourd'hui** — le web ne chiffre que sur le chemin socket, et iOS met son cryptogramme
  dans `content` sans jamais poster `encryptedContent`, si bien que le gateway le range en clair.
  Ce dernier point mérite sa propre enquête : c'est un désaccord de contrat entre `SendMessageRequest`
  (iOS) et `SendMessageBodySchema` (gateway), pas une omission de broadcast.
- **`forwardedFromId` / `forwardedFromConversationId` / le snapshot `forwardedFrom` manquent aussi
  au payload REST**, alors que la route les accepte (`messages.ts:1648`, `:1802`) et que le chemin
  socket les construit (`MessageHandler:1121-1143`). Un message transféré via REST arriverait en
  temps réel sans marqueur « Transféré ». Même famille que ce cycle, même fichier — traité à part
  pour ne pas mélanger deux contrats dans un diff.
- **`lastMessagePreview: message.content` (brut) dans `CONVERSATION_UPDATED` du même chemin** —
  hors Prisme, et vide pour un message chiffré. **C'est exactement le jumeau que la tête instruite
  ci-dessous (reportée au cycle 69) nomme** : `MeeshySocketIOManager.ts:2181` doit être traité avec
  `emitConversationPreviewUpdate.ts:88`, sinon l'aperçu redevient dépendant du transport. La
  question « payload PAR DESTINATAIRE » du cycle 60 y est tranchée — la boucle par participant
  existe déjà.
- **`serializeAttachmentForSocket` est un whitelist strictement plus étroit que `attachmentFullSelect`** :
  il laisse tomber l'enveloppe de chiffrement, les compteurs de consommation, le couple de
  transfert et l'état vue-unique/flou/effets, alors que son doc-comment promet la « parité avec le
  payload REST `/messages` ». Le chemin socket sélectionne `attachmentMediaSelect`, qui ne les
  charge pas non plus : élargir le sérialiseur seul ne changerait rien. Instruit, non écrit —
  demande de trancher quelles pièces jointes ont besoin de quoi sur le fil.
- Les points hérités restent inchangés : `eslint` ne peut pas tourner sur le gateway (pas
  d'`eslint.config.js` depuis ESLint v9) ; `PinnedMessageBanner` n'affiche qu'UNE épingle ;
  `ConversationPicker.tsx` (admin) rend `lastMessage.content` brut ; le « mensonge de type » de
  `Message.translations` est instrumenté mais pas résolu ; `isDuplicate` n'est protégé par aucun
  témoin au niveau du spread ; les deux scripts de réparation base attendent une exécution humaine ;
  l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ;
  `getMentionsForMessage` / `getRecentMentionsForUser` n'ont toujours aucun écran.

---

# Tête instruite, NON CONSOMMÉE — reportée au cycle 69

> **Note d'intégration (cycle 68).** Ce bloc a été écrit par une session parallèle et a atterri sur
> `main` *pendant* que le cycle 68 ci-dessus était déjà en cours d'écriture sur une autre branche.
> Il n'a donc pas été consommé — il n'est pas périmé pour autant : rien de ce que le cycle 68 a
> touché ne recoupe `emitConversationPreviewUpdate` ni les résolveurs d'aperçu de liste. Il reste
> le candidat le plus étayé du backlog et **le cycle 69 doit le prendre en tête**, sans refaire
> l'enquête. Conservé mot pour mot ci-dessous.


*Enquête menée pendant l'attente de la CI du cycle 67. Rien n'est supposé ci-dessous : chaque
maillon a été lu dans le code. Aucune ligne de production n'a été écrite — la correction est
cross-stack (gateway + SDK iOS + web) et méritait son propre cycle plutôt qu'une fin de course.*

## Le défaut : après une édition, la ligne de liste affiche le texte D'AVANT

Le symptôme n'est pas « la ligne n'est pas traduite ». C'est **la ligne affiche l'ANCIEN contenu**,
indéfiniment, jusqu'à un rechargement complet de la liste.

La chaîne, maillon par maillon :

1. `GET /conversations` hydrate la ligne avec `lastMessagePreview` (l'original tronqué),
   `lastMessageTranslations` (la carte du prisme du lecteur) et `lastMessageOriginalLanguage`
   — cycles 61/64, `routes/conversations/core.ts:659-664`.
2. Le client résout par `resolvedLastMessagePreview(preferredLanguages:)`
   (`CoreModels.swift:238`) / `resolveLastMessagePreview` (web) : si une traduction sert le prisme,
   **c'est elle qui s'affiche**, pas `lastMessagePreview`.
3. Une édition arrive. Le gateway **périme la colonne dans la même écriture** —
   `translations: null` (`routes/messages.ts:361`, et le commentaire adjacent explique que
   c'est délibérément atomique).
4. Le gateway émet `conversation:updated` avec, en tout et pour tout,
   `lastMessagePreview: latest?.content` — le NOUVEAU texte, **sans traductions, sans
   `lastMessageOriginalLanguage`** (`socketio/emitConversationPreviewUpdate.ts:88-90`).
   Le chemin d'envoi fait pareil (`MeeshySocketIOManager.ts:2181-2183`).
5. Les deux clients appliquent le patch **en n'écrasant que l'aperçu** :
   - iOS : `applyConversationUpdated` pose `conv.lastMessagePreview` et ne touche jamais
     `lastMessageTranslations` (`ConversationStore.swift:436`). Le type d'entrée
     `ConversationUpdatedStoreEvent` (`:759-772`) **n'a même pas de champ traductions**.
   - web : `{ ...c, ...patch }` avec un patch construit par `normalizeConversationPatch` à partir
     des seules clés reçues (`use-socket-cache-sync.ts:1086-1089`).
6. Résultat : `lastMessagePreview` = nouveau texte, `lastMessageTranslations` = **carte de
   l'ANCIEN texte**. Le résolveur, qui préfère la traduction, rend l'ancien contenu.

**Qui le voit :** tout lecteur dont la langue primaire diffère de la langue d'origine du message et
pour qui une traduction existait — c'est-à-dire le cas NOMINAL du produit. Le serveur, lui, a bien
fait son travail : il a périmé la colonne. C'est le fil qui ne le dit pas.

## Pourquoi le correctif ÉVIDENT est faux — vérifié avant de l'écrire

Réflexe naturel : « quand `conversation:updated` apporte un nouvel aperçu, vider la carte de
traductions côté client ». **Ça casserait le cycle 65.**

Le chemin d'ENVOI émet les deux événements. `message:new` installe `lastMessageTranslations` via
`previewTranslations(from:viewerLanguages:)` — c'est précisément ce que le cycle 65 a construit —
et le `conversation:updated` jumeau arriverait derrière pour l'effacer. Un vide inconditionnel
échange un défaut contre un autre.

Raffiner en « vider seulement si `lastMessageId` diffère » ne marche pas non plus : **une édition
garde le MÊME message**, donc le même id. C'est exactement le cas à traiter, et le seul que ce
raffinement laisse passer.

**Conclusion : le client ne peut pas trancher seul.** Seul le serveur sait si la carte a été
périmée. Le correctif appartient au fil.

## Le correctif attendu — et la question du cycle 60, enfin tranchée

`conversation:updated` doit porter `lastMessageTranslations` + `lastMessageOriginalLanguage`, à
parité avec ce que `GET /conversations` sert déjà. Après une édition la carte fraîchement
construite est **vide**, et c'est ce vide — reçu, pas déduit — qui périme proprement la carte du
client. Les trois champs s'appliquent alors **en groupe monotone**, comme iOS le fait déjà pour
`lastMessageAt` / `lastMessageId` / `lastMessagePreview`.

Le backlog portait ce point depuis le cycle 60 sous l'étiquette « payload PAR DESTINATAIRE,
question de conception non tranchée ». **Elle est tranchée, et par le code existant :**
`emitConversationPreviewUpdate` **boucle déjà par participant**
(`for (const room of participantUserRooms(participants))`, `:97`). Un payload par destinataire n'est
pas une architecture à inventer — la boucle est là, elle envoie simplement le même objet à tout le
monde. Il reste à résoudre le prisme de chaque participant et à appeler
`buildLastMessagePreviewTranslations`, que `core.ts` utilise déjà pour la même donnée.

## Périmètre, et pourquoi il n'a pas été écrit ici

Trois étages, tous gatables :

| Étage | Fichier | Gate |
|---|---|---|
| gateway | `emitConversationPreviewUpdate.ts` + le jumeau `MeeshySocketIOManager.ts:2181` | suite gateway, locale |
| SDK iOS | `ConversationUpdatedStoreEvent`, `applyConversationUpdated`, `ConversationStoreSocketBridge` | `sdk-tests.yml` en CI (précédent : cycle 65) |
| web | `normalizeConversationPatch` / `handleConversationUpdated` | suite web, locale |

**Deux émetteurs, pas un** — la règle des « sources de vérité jumelles » impose de les traiter
ensemble, sinon l'aperçu dépend à nouveau du transport (envoi vs édition).

Écrire ça correctement demande un cycle entier ; le cycle 67 était déjà livré et mergé. Le bâcler
en fin de course aurait produit exactement ce que la leçon 95 condamne : un correctif dont personne
n'a vérifié la moitié. **Instruit ici pour que le cycle 68 commence par écrire des témoins, pas par
enquêter.**

---

# Cycle 67 — Épingler un message rendait la route d'épingles inexploitable

## Contrainte d'environnement (identique aux cycles 61/63/64/65/66, revérifiée)

Même conteneur Linux distant. Aucune chaîne Swift (`swift: command not found`), aucun SDK Android
(`~/Android` absent → pas de `./apps/android/meeshy.sh check`, seul gate de cette lane).
`tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane reste matériellement impossible ici :
**le curseur n'a donc PAS été touché.** Lanes gatables : gateway, web, shared.

## Le candidat de backlog a été RE-PROUVÉ, et il a mené ailleurs

Le cycle 66 nommait comme tête « le mensonge de type qui a rendu ce défaut possible » :
`message-types.ts:211` annonce `translations?: readonly MessageTranslation[]` alors que la valeur
qui sort de Prisma est une **carte Mongo** (`Message.translations Json?`). Il ajoutait, prudemment,
« le chantier n'est pas mécanique ».

Le balayage d'ouverture a cherché ce que ce mensonge PRODUIT plutôt que de démêler le type :
tous les sites qui sélectionnent `Message.translations` puis servent le résultat à un client. Sur
les dix routes de messages, huit passent par `transformTranslationsToArray`. **Deux ne le font
pas**, et l'une d'elles ne dégrade pas — elle casse.

## Le défaut, prouvé et non supposé

`GET /conversations/:id/pinned-messages` déclare `data: { type: 'array', items: messageSchema }`,
et `messageSchema.properties.translations` vaut `{ type: 'array' }`
(`packages/shared/types/api-schemas.ts:834`). La route y versait `translations: message.translations`
— la carte Mongo brute.

`fast-json-stringify`, le sérialiseur de Fastify, **ne coerce pas** :

```
MAP   => THREW: The value of '#/properties/data/items/properties/translations'
                does not match schema definition.
NULL  => {"success":true,"data":[{…,"translations":[]}]}
ARRAY => {"success":true,"data":[{…,"translations":[{"targetLanguage":"fr",…}]}]}
```

L'échec de sérialisation remonte en **500 sur la route entière**. Meeshy traduit automatiquement
chaque message : la colonne est peuplée dès que le Prisme a tourné. **Épingler un message traduit
rendait donc la liste d'épingles inaccessible** — pas une dégradation partielle, l'endpoint entier.

## Pourquoi personne ne l'a vu

Les quatre témoins du groupe 9 de `messages-routes.test.ts` posent tous `translations: null` — le
SEUL cas qui ne déclenche pas le défaut. Le fixture de `threads.test.ts` posait `translations: []`,
une forme que Prisma ne rend jamais. Les deux suites décrivaient donc fidèlement un monde où le
défaut n'existe pas.

## Le second défaut, au même endroit — la bannière ne s'était jamais affichée

`apps/web/components/conversations/PinnedMessageBanner.tsx` lisait `data?.messages?.[0]` alors que
l'enveloppe du dépôt est `{ success, data: [...] }` (`sendSuccess`). `data.messages` vaut toujours
`undefined` : **la bannière rendait `null` même sur un 200 parfaitement valide**. Elle est pourtant
montée en production (`ConversationView.tsx:319`) — et les deux suites qui montent
`ConversationView` / `ConversationLayout` la remplacent par `() => null`. Aucun témoin n'avait
jamais exercé son chemin de données.

Les deux défauts se masquaient l'un l'autre : sur un compte sans message épinglé traduit, la route
répondait 200 et la bannière restait vide « parce qu'il n'y a rien à épingler ». Sur un compte avec,
la requête échouait en 500 et React Query gardait la bannière vide pareillement.

## Le troisième — le Prisme

La bannière rendait `pinnedMessage.content` brut : la ligne restait dans la langue de l'expéditeur
pour tout le monde, sur une surface que `CLAUDE.md` couvre nommément (« le prisme s'applique à TOUT
le contenu »). Une fois le premier défaut corrigé, les traductions sont réellement sur le fil ; les
résoudre n'est pas un supplément, c'est la conséquence directe du correctif.

La résolution délègue à `resolveLastMessagePreview` (`@meeshy/shared`) — jumelle de
`MeeshyConversation.resolvedLastMessagePreview` côté iOS — et l'ordre du prisme vient de
`getUserLanguagePreferences`, seul point d'entrée autorisé côté web (il injecte la `deviceLocale`
en 4e priorité, ce qu'un appel direct au shared perdrait).

**Une exclusion a été ajoutée dans le même geste, et elle appartient à ce cycle et pas à un autre :
les traductions CHIFFRÉES sont écartées.** `transformTranslationsToArray` recopie `isEncrypted`, et
c'est ce correctif-ci qui met ces entrées sur le fil de la bannière pour la première fois. Sans
l'exclusion, corriger le Prisme aurait affiché du base64 dans la bannière des conversations
chiffrées — le défaut exact que le cycle 65 venait de fermer sur la ligne de liste iOS. Sans
traduction lisible, `resolveLastMessagePreview` rend l'original, ce que prescrit la règle #1 du
Prisme.

## La copie du même défaut, corrigée dans le même cycle

`routes/conversations/threads.ts` sert le résultat Prisma verbatim, donc la même carte brute. Son
schéma de réponse est `additionalProperties: true` : pas de 500, la carte part telle quelle sur le
fil. `APIMessage.init(from:)` décode `translations` avec `try` et non `try?`
(`MessageModels.swift:521`) — un message de fil serait **indécodable EN ENTIER**, pas seulement
privé de ses traductions. Aucun consommateur client de cette route aujourd'hui (`grep` sur web,
SDK, iOS, Android : rien) ; c'est précisément pourquoi il fallait la corriger maintenant, avant que
le premier appelant hérite du défaut.

## Le témoin qui nomme la cause plutôt que le symptôme

`message-translations-response-contract.test.ts` fait passer les deux formes à travers le VRAI
`messageSchema` compilé par `fast-json-stringify` : la carte jette, la sortie du transformateur se
sérialise. Il ne dépend d'aucune route — il épingle l'invariant que le compilateur ne peut pas
tenir, et il protégera toute route future déclarant `messageSchema`. C'est la réponse la plus utile
au « mensonge de type » du cycle 66 : on ne peut pas le faire disparaître sans démêler deux formes
qui circulent réellement sous le même nom, mais on peut le rendre **détectable**.

## Vérification

- Gateway : `tsc --noEmit` propre après `prisma generate --generator client` + `bun run build` du
  shared (prérequis CI documentés dans `CLAUDE.md`).
- Gateway : **suite complète — 650 suites / 16 366 tests verts.** Base du cycle 66 : 649 / 16 358.
  L'écart est exactement ce que ce cycle ajoute (1 suite, 8 témoins : 3 de contrat, 2 sur
  `pinned-messages`, 3 sur `threads`) — aucune régression, aucun témoin perdu.
- Gateway : RED observé avant implémentation sur les 5 témoins de route. `pinned-messages` rendait
  `{"fr": {…}}` là où le témoin attend le tableau API ; `threads` idem sur le parent ET les
  réponses, plus `null` au lieu de `[]` sur colonne vide.
- Web : `__tests__/components/conversations` — 32 suites / 607 tests verts (dont les 6 neufs).
  RED observé : 4 des 5 premiers témoins échouaient sur un DOM vide (« Unable to find an element »),
  la bannière ne rendant rien du tout.
- Web : `tsc --noEmit` — zéro erreur sur le fichier modifié (le dépôt en porte 1 190 préexistantes).

## Reste ouvert après ce cycle

- **Le mensonge de type lui-même n'est pas résolu**, il est seulement instrumenté. Les deux formes
  circulent toujours sous `Message.translations`. Le démêler demande de nommer la forme de stockage
  (`MessageTranslationJSON`, déjà exportée par le transformateur) dans les types de retour Prisma
  côté gateway — chantier de contrat, à instruire avant d'être écrit.
- **`PinnedMessageBanner` n'affiche qu'UNE épingle** (`limit: 1`) sans compteur ni accès à la liste.
  Signal produit, pas défaut : à trancher avec un humain.
- **Piste voisine INSTRUITE puis ÉCARTÉE — `messageAttachmentSchema` va bien.** Cherché pendant ce
  cycle une seconde source de 500 sur la même route, du côté des pièces jointes. Il n'y en a pas :
  le schéma déclare `translations` en entier (`api-schemas.ts:467`), carte langue → traduction V2.
  Noté ici parce que le mécanisme mérite d'être connu : la sous-entrée porte
  `required: ['type', 'transcription', 'createdAt']`, et `fast-json-stringify` **fait respecter
  `required` en jetant**, exactement comme pour le type de ce cycle. Une entrée à laquelle il
  manquerait l'un des trois ferait donc tomber `GET /conversations/:id/messages` — la liste
  principale. Les deux écrivains les posent tous les trois (`AudioTranslateService.ts:867-880`,
  `AttachmentTranslateService.ts:378/435/484`) : **pas de défaut de code.** Le risque résiduel est
  une ligne Mongo héritée d'avant la forme V2, donc une question de DONNÉES, à instruire par une
  requête et non par une lecture de code.
- **`ConversationPicker.tsx` (admin) rend `lastMessage.content` brut** (cycle 64) — dernier rendu
  d'aperçu web hors Prisme identifié.
- **`emitConversationPreviewUpdate` n'emporte toujours pas le prisme** (cycle 60) — **la question
  de conception est TRANCHÉE et le défaut est PROUVÉ : voir la tête du cycle 68 en haut de ce
  fichier.** Ce n'est pas une lacune de traduction, c'est l'ANCIEN contenu qui reste affiché après
  une édition.
- **`isDuplicate` n'est protégé par aucun témoin au niveau du spread** (cycle 66).
- Les points hérités restent inchangés : `eslint` ne peut pas tourner sur le gateway (pas
  d'`eslint.config.js` depuis ESLint v9) ; les deux scripts de réparation base attendent une
  exécution humaine ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ;
  `getMentionsForMessage` / `getRecentMentionsForUser` n'ont toujours aucun écran.

# Cycle 66 — Le chemin socket avait sa propre copie du sérialiseur de traductions

## Contrainte d'environnement (identique aux cycles 61/63/64/65)

Même conteneur Linux distant. Ni macOS ni Xcode : aucun Swift compilable ici (`swift: command not
found`). `tasks/lane-cursor.md` dit toujours `lane=ANDROID`, et la lane Android reste
matériellement impossible (`dl.google.com` refusé au CONNECT → pas de `sdkmanager`, donc pas de
`./apps/android/meeshy.sh check`). **`tasks/lane-cursor.md` n'a donc PAS été touché.**

Ce cycle a pris la tête de backlog nommée **explicitement par le cycle 65** — sur la lane gatable
ici, gateway.

## Reprise du cycle 65 avant toute chose

La PR #2789 (cycle 65) était restée **ouverte** : la session précédente s'est terminée pendant
l'attente de son gate `sdk-tests` (~50 min de build Swift sur macOS). Motif déjà documenté dans
`tasks/android-parity-ios-debt-agent-prompt.md` — travail complet, finalisation en suspens. Reprise
et menée au merge avant d'ouvrir ce cycle, conformément au protocole.

## Le défaut

`MessageHandler._parseTranslations` portait une **seconde copie** du sérialiseur de traductions,
divergente de la seule référence : `transformTranslationsToArray`, qu'utilise le chemin REST/ZMQ
(`MeeshySocketIOManager._broadcastNewMessage`, `:1990`, et `broadcastMessageEdited`, `:2334`).

Là où la référence produit `id` / `messageId` / `translatedContent`, cette copie répandait l'entrée
Mongo telle quelle :

```ts
Object.entries(translations).map(([lang, data]) => ({ targetLanguage: lang, ...data }))
```

Il en sortait `text`, jamais `translatedContent`, et **ni `id` ni `messageId`**. Les trois sont NON
optionnels dans `APITextTranslation` (`packages/MeeshySDK/.../MessageModels.swift:300-308`), et
`APIMessage.init(from:)` décode le tableau avec `try` et non `try?` (`:521`) : une seule entrée mal
formée fait échouer le décodage du `message:new` **ENTIER**. Le message n'apparaîtrait pas du tout
en temps réel sur iOS — il ne lui manquerait pas seulement ses traductions — alors que le même
message rechargé par `GET /messages` s'affiche normalement.

## La portée a été TRACÉE, pas supposée — et elle nuance le défaut

Le cycle 65 annonçait ce point comme « latent aujourd'hui, non théorique ». Vérifié
exhaustivement avant d'écrire une ligne, la formule exacte est plus précise, et plus intéressante :

**Latent, à UNE garde près.**

Les deux seuls appelants de production de `broadcastNewMessage` (`MessageHandler.ts:355` et `:580`)
reçoivent un résultat `include` de Prisma dont `translations` vaut `null` sur une création fraîche
(`MessageProcessor.saveMessage` `:393-478` ne pose jamais la clé `translations` dans `messageData`).
La carte peuplée n'atteint donc PAS le sérialiseur aujourd'hui.

Mais les deux objets du système qui portent une carte Mongo **peuplée** existent bien, et passent à
une ligne de là :

| Objet | Origine | Ce qui l'écarte |
|---|---|---|
| doublon séquentiel | `MessagingService.ts:137-183`, `findFirst` + `include` après que le traducteur a tourné | `isDuplicate = true` (`:170`) |
| doublon concurrent P2002 | `MessageProcessor.ts:481-553`, idem | `isDuplicate = true` (`:547`) |

Les deux gardes sont la même ligne, dupliquée : `!(response.data as {isDuplicate?}).isDuplicate`
(`MessageHandler.ts:352` et `:577`). Le drapeau ne survit que parce que **deux `spread`** le
transportent (`MessageProcessor.ts:616`, `MessagingService.ts:490`). Remplacer l'un des deux par une
liste de champs explicite, ou sérialiser la réponse quelque part, suffirait à rendre le défaut
vivant — sans que rien ne le signale, puisque le symptôme est un message **absent**, pas une erreur.

**Rayon d'action : une ligne.** C'est ce qui justifie de fermer la divergence en supprimant la
copie, plutôt que de s'en remettre à la garde.

## Ce que le traçage a AUSSI écarté

Quatre hypothèses de reachability, toutes testées et toutes fausses — notées pour qu'un cycle futur
ne les repose pas :

- **Le transfert ne recopie pas la carte.** `messageData` (`MessageProcessor.ts:393-418`) n'a pas de
  clé `translations` ; un message transféré part de `null` et est retraduit. Seul
  `MessageAttachment.translations` est recopié (`:697`) — autre colonne, autre modèle.
- **Aucun chemin ZMQ ne re-broadcaste par ici.** La complétion de traduction écrit en base
  (`MessageTranslationService.ts:728`) puis émet `MESSAGE_TRANSLATION` (`MeeshySocketIOManager.ts:1504`),
  jamais un `message:new`.
- **L'édition n'y passe pas non plus.** `handleMessageEdit` émet `MESSAGE_EDITED` avec un
  `translations: []` en dur (`MessageHandler.ts:871`) ; son jumeau manager utilise le bon
  transformateur (`:2334`).
- **`MeeshySocketIOManager` ne délègue PAS à `MessageHandler.broadcastNewMessage`.** Le commentaire
  `MessageHandler.ts:1547` (« qui délègue ici ») induit en erreur : la délégation réelle ne porte que
  sur `autoDeliverToOnlineRecipients`.

## Correctif

`_parseTranslations` délègue à `transformTranslationsToArray` — **la seconde copie disparaît**,
conformément au principe de source unique de vérité. Elle prend `messageId` en premier argument (les
`id`/`messageId` synthétiques en dépendent), fourni par les deux sites de `_getMessageTranslations`.

Deux invariants conservés délibérément :

- **Un tableau déjà au format API passe intact.** C'est ce que promet le type partagé
  `Message.translations` (`message-types.ts:211`, `readonly MessageTranslation[]`) ; le
  re-transformer produirait `targetLanguage: "0"`, les clés d'un tableau étant ses index.
- **Les entrées inexploitables de la carte sont ÉCARTÉES** (valeur nulle, primitive, `text` non
  textuel — une colonne `Json` n'a pas de schéma pour l'interdire). Les émettre mutilées recréerait
  exactement le défaut corrigé. Les filtrer ICI plutôt que de laisser `transformTranslationsToArray`
  déréférencer `null` garde en plus les traductions VALIDES de la même carte : un `throw` remonterait
  au `.catch(() => [])` de l'appelant (`MessageHandler.ts:1107`) et les perdrait **toutes**.

## Tests

**5 témoins neufs** (`MessageHandler.test.ts`), RED observé avant implémentation — le fil sortait
bien `{ createdAt, targetLanguage: 'es', text: 'Hola', translationModel: 'premium' }`, sans `id`,
`messageId` ni `translatedContent`. Ils verrouillent **la forme du fil, pas l'implémentation** : ils
passent avec n'importe quel sérialiseur respectant le contrat REST. Couvrent la carte portée par le
message, la carte relue en base, `isEncrypted` explicite à `false`, le tableau déjà transformé laissé
intact, et les formes vides.

**Deux témoins préexistants réécrits** (`MessageHandler.core.test.ts`) : ils verrouillaient la forme
brute — ils *pinnaient donc précisément le défaut*, et c'est ce qui l'a laissé vivre aussi longtemps.
Un test de couverture qui assert le comportement observé plutôt que le contrat voulu transforme un
bug en spécification. Réécrits sur le contrat réel : l'un sur la forme API, l'autre sur le fait
qu'une entrée inexploitable est écartée **sans emporter les entrées valides qui l'accompagnent**.

**Vérification** : suite gateway complète — **649 suites / 16 358 tests verts**, couverture globale
95,11 % instructions / 95,78 % lignes. `tsc --noEmit` propre. Sweep ciblé
`MessageHandler|translation-transformer|MeeshySocketIOManager` : 11 suites / 846 tests verts.

## Reste ouvert après ce cycle

- **Le mensonge de type qui a rendu ce défaut possible.** `message-types.ts:211` déclare
  `translations?: readonly MessageTranslation[]` — un tableau au format API — alors que la valeur
  runtime venue de Prisma est une **carte Mongo**. C'est pourquoi une copie artisanale du
  sérialiseur a pu vivre des années sans que le compilateur objecte, et pourquoi la branche
  `Array.isArray` reste nécessaire. **Tête du prochain cycle si rien de plus grave n'apparaît** —
  mais le chantier n'est pas mécanique : les deux formes circulent réellement sous ce nom, et les
  démêler touche les deux transports.
- **`isDuplicate` n'est protégé par aucun témoin de non-régression au niveau du spread.** Les deux
  gardes tiennent parce que deux `spread` transportent le drapeau ; rien ne le verrouille. Un test
  qui prouve que `createSuccessResponse` préserve `isDuplicate` fermerait le dernier fil de ce cycle.
- Les points hérités des cycles précédents restent inchangés (voir cycles 64 et 26 pour la liste
  complète) : `eslint` ne peut toujours pas tourner sur le gateway (pas d'`eslint.config.js` depuis
  ESLint v9) ; les deux scripts de réparation base attendent une exécution humaine ; l'arbitrage
  `delete-for-me` du cycle 12 attend une validation humaine ; `getMentionsForMessage` /
  `getRecentMentionsForUser` n'ont toujours aucun écran.

# Cycle 65 — L'aperçu de liste servi par socket pouvait afficher un cryptogramme

## Contrainte d'environnement (identique aux cycles 61/63/64, revérifiée)

Même conteneur Linux distant. `tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane
Android reste matériellement impossible ici (`dl.google.com` refusé au CONNECT → pas de
`sdkmanager`, donc pas de `./apps/android/meeshy.sh check`, le seul gate de cette lane). Aucune
chaîne Swift non plus (`swift`/`swiftc` absents). **`tasks/lane-cursor.md` n'a donc PAS été
touché.**

Ce cycle prend la tête de backlog nommée explicitement par le cycle 64, et il la prend **parce
qu'elle est gatable ici** : `sdk-tests.yml` se déclenche sur `pull_request` vers `main` pour
`packages/MeeshySDK/**`. Le correctif est donc vérifié par la CI même sans Xcode local.

## La question que le cycle 64 laissait ouverte, tranchée

Le cycle 64 refusait d'écrire le correctif avant d'avoir établi la forme réelle du payload
`message:new`, parce que deux lectures semblaient s'exclure : `buildLastMessagePreviewTranslations`
(REST) lit `data.text`, `previewTranslations` (socket) lit `$0.translatedContent`.

**Les deux sont vraies, et ce n'est pas une contradiction — ce sont deux objets différents.**

| Étage | Forme | Champ texte |
|---|---|---|
| Colonne Mongo `Message.translations` | carte `{ "fr": { text, isEncrypted, … } }` | `text` |
| Fil `message:new` (REST/ZMQ) | tableau, via `transformTranslationsToArray` | `translatedContent` |

`transformTranslationsToArray` (`services/gateway/src/utils/translation-transformer.ts:56`) mappe
`text` → `translatedContent` **et recopie `isEncrypted`**. Le helper REST lit la colonne brute, le
SDK lit le fil. Aucun mappage de clés manquant.

## Le défaut

**`APITextTranslation` ne décode pas `isEncrypted`** (`MessageModels.swift:300`). Le drapeau est
sur le fil depuis toujours ; le client ne le lit pas. `previewTranslations` posait donc
`translatedContent` dans `lastMessageTranslations` **sans jamais regarder s'il s'agissait de texte
ou d'un cryptogramme**, là où le helper REST l'exclut nommément (son exclusion #3 : « son `text`
est un cryptogramme ; le poser dans un aperçu afficherait du base64 dans la liste ; la clé de
déchiffrement ne transite pas par ce chemin »).

Conséquence : une conversation chiffrée dont le dernier message arrive **par socket** affiche du
base64 dans la ligne de liste, quand la MÊME conversation rechargée par `GET /conversations`
affiche correctement l'original. **Le texte de la ligne dépendait du transport qui l'avait
apportée** — exactement ce que la règle « sources de vérité jumelles » du Prisme interdit.

## Les trois écarts mineurs, corrigés dans le même geste

Le cycle 64 les avait listés sous condition (« à traiter dans le même geste s'ils survivent à
l'enquête »). Ils survivent, et ce sont les trois autres exclusions du helper REST :

1. **Hors prisme du lecteur** — la carte socket portait les N langues de la conversation ; le
   résolveur n'en affiche qu'UNE. Le reste n'alourdit que le cache de la liste.
2. **Langue d'origine** — elle EST déjà `lastMessagePreview` ; la republier double l'octet.
3. **Plafond d'aperçu** — le REST tronque chaque traduction à 300 points de code, pas le socket.
   Non corrigé, le poids d'une ligne aurait dépendu de la langue du lecteur — même famille que le
   second défaut du cycle 64.

Une quatrième exclusion (texte vide ou blanc) est reprise par symétrie.

**L'exclusion #2 n'était sûre qu'après vérification, et elle a été vérifiée.** Retirer la clé de la
langue d'origine serait une régression du cycle 62 (« la langue d'origine concourt à son RANG »)
si la facette socket ne transportait pas `lastMessageOriginalLanguage` : le lecteur dont la langue
primaire EST la langue d'origine sauterait son rang 1 et se verrait servir une traduction de rang
inférieur. `LastMessageFacet.init(message:preview:…)` pose bien `originalLanguage:
message.originalLanguage` (`LastMessageFacet.swift:99`) et `applyLastMessage` l'écrit sur la ligne
(`:138`). Un témoin épingle ce point précis dans les deux ordres de prisme.

## Le correctif

- `APITextTranslation` gagne `isEncrypted: Bool?` — optionnel, donc un payload qui l'omet ne
  suppose PAS le chiffrement et ne casse aucun décodage existant.
- `previewTranslations(from:)` devient `previewTranslations(from:viewerLanguages:)` et applique
  les quatre exclusions + le plafond, dans l'ordre du prisme.
- `ConversationSyncEngine.currentPreferredLanguages()` lit
  `MeeshyUser.preferredContentLanguages` — seule autorité iOS sur l'ordre du prisme, jamais
  réimplémentée localement. Vide sans session : la carte vaut `nil` et la ligne rend l'original,
  comportement identique au chemin REST pour un participant anonyme.

Le rang « dernière entrée gagne » du `uniquingKeysWith` d'origine est conservé (`last(where:)`)
pour un payload qui répéterait une langue.

## Vérification

14 témoins neufs dans `ConversationSocketPrismeTests` — un par exclusion, plus les invariants
conservés (clés minuscules, `nil` jamais `[:]`, absence de traductions, doublon de langue) et le
témoin de non-régression du rang de la langue d'origine dans les deux ordres.

**Swift non exécuté localement** : aucune chaîne Swift sur ce conteneur (`swift: command not
found`). C'est `sdk-tests.yml` qui gate — déclenché automatiquement par cette PR, puisqu'elle ne
touche que `packages/MeeshySDK/**`.

Aucun changement gateway ni web : le correctif est au bon étage. Un client ne doit jamais rendre un
cryptogramme, quelle que soit la générosité du serveur.

## Reste ouvert après ce cycle

- **`MessageHandler._parseTranslations` produit une forme de traduction INDÉCODABLE par iOS — tête
  du prochain cycle.** Trouvé en établissant la forme du fil, et c'est le seul point de cette
  enquête qui reste ouvert. Le chemin WS `message:send`
  (`services/gateway/src/socketio/handlers/MessageHandler.ts:1732`) **répand l'entrée Mongo telle
  quelle** (`{ targetLanguage, ...data }`) au lieu de passer par
  `transformTranslationsToArray` comme le fait le chemin REST/ZMQ
  (`MeeshySocketIOManager._broadcastNewMessage:1990`). Il en sort
  `{ targetLanguage, text, translationModel, … }` — sans `id`, sans `messageId`, sans
  `translatedContent`, tous NON optionnels dans `APITextTranslation`. Or
  `APIMessage.init(from:)` décode ce tableau avec `try` et non `try?`
  (`MessageModels.swift:521`) : **le message:new ENTIER échouerait à décoder**, pas seulement ses
  traductions. Le message n'apparaîtrait pas du tout en temps réel sur iOS.

  **Latent aujourd'hui, non théorique** : sur ce chemin le message vient d'être créé, donc
  `_getMessageTranslations` rend `[]` (colonne `null`, et le repli DB rend `null` aussi). La forme
  fautive n'est jamais peuplée — pour l'instant. Le jour où un message part par WS avec des
  traductions déjà en base (transfert qui recopierait la carte, re-broadcast, dédup qui
  re-broadcasterait), le tableau se remplit et le défaut devient un message invisible.
  **Correctif attendu : appeler `transformTranslationsToArray(message.id, …)` sur les deux
  chemins** — gatable ici (gateway), petit, et il supprime la deuxième copie du transformateur.
  Vérifier au passage qu'aucun client web ne lit `text` sur ce chemin (`grep` n'a rien trouvé).
- **`emitConversationPreviewUpdate` n'emporte toujours pas le prisme** (cycle 60). Question de
  conception — payload PAR DESTINATAIRE — non tranchée.
- **`ConversationPicker.tsx` (admin) rend `lastMessage.content` brut** (cycle 64) — dernier rendu
  web d'aperçu non prismé connu.
- **`normalizeConversation` reste un constructeur manuel de `Conversation` sans aucun appelant**
  (cycle 62) : trancher s'il vit ou meurt.
- **Un participant ANONYME n'a pas de prisme** — vrai sur les deux chemins désormais, donc
  cohérent, mais toujours non résolu sur le fond (cycle 60).
- **Aucune traduction rétroactive de l'aperçu** (cycle 60, inchangé).
- Hérités et non traités : `DELETE /sessions/:sessionId` ne coupe aucune socket (pont client
  `sessionToken` au handshake) ; l'auth REST ne vérifie pas `UserSession.isValid` ; la suppression
  de compte ne révoque aucune session ; `auth:session-revoked` n'est écouté ni par iOS ni par
  Android ; `MaintenanceService.cleanupOrphanedAttachments` reste inerte ; les ~12 copies inline de
  `unsetOrNull` ; `TrackingLink.messageId` est une colonne morte ; l'arbitrage `delete-for-me` du
  cycle 12 attend une validation humaine ; `eslint` ne peut pas tourner sur le gateway (aucun
  `eslint.config.js` depuis ESLint v9) ; `tsc` ne passe pas sur le web (1 190 erreurs
  préexistantes, non gatées par la CI).

---

# Cycle 64 — La recherche de conversations était la dernière ligne hors Prisme

## Contrainte d'environnement (identique aux cycles 61/63, revérifiée)

Même conteneur Linux distant. `tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane
Android reste **matériellement impossible** ici (`dl.google.com` refusé au CONNECT → pas de
`sdkmanager`, donc pas de `./apps/android/meeshy.sh check`, le seul gate de cette lane). Ni macOS
ni Xcode pour compiler du Swift. **`tasks/lane-cursor.md` n'a donc PAS été touché.**

Ce cycle a pris la tête de backlog nommée par le cycle 62, sur la lane gatable ici — gateway. Il
emporte AUSSI un correctif iOS, délibérément : voir §« Pourquoi du Swift dans un cycle sans Xcode ».

## Le défaut

**`GET /conversations/search` était la dernière route qui servait une ligne de conversation sans
Prisme.** Le cycle 62 l'avait nommée « tête du prochain cycle » et annonçait un correctif
« mécanique ». Il l'était — et le diagnostic tenait, vérifié point par point avant d'écrire une
ligne :

| Fait annoncé par le cycle 62 | Vérifié |
|---|---|
| `conversationMinimalSchema` DÉCLARE déjà les deux champs | oui (`api-schemas.ts:1294-1305`) |
| la route construit son `lastMessage` à la main et ne les remplit jamais | oui (`search.ts:201`) |
| même `include` Prisma, même helper, même `viewerLanguages` que `core.ts` | oui |

Le point qui donne sa gravité au défaut : **la donnée était déjà payée**. Le `messages` de cette
route utilise `include` (et non `select`), donc Prisma rapporte TOUS les scalaires du message —
`translations` (colonne `Json?`) et `originalLanguage` compris. Le mapping manuel les jetait sans
que rien ne le signale. Même famille que `metadata.location` avant le Lot 3, et le fichier
documentait déjà cette leçon à trois lignes de l'endroit exact où elle se répétait.

Conséquence utilisateur : un lecteur francophone qui cherche une conversation lit « Hello » dans le
résultat, puis « Bonjour » sur la même conversation dans sa liste. Le serveur avait la traduction
dans les deux cas.

## Un second défaut, trouvé en le corrigeant

`core.ts` tronque son aperçu (`truncateMessagePreview`, plafond 300 points de code) ; `search.ts`
servait `msg.content` **brut**. Tant que la ligne n'avait pas de prisme, c'était une simple
divergence de poids entre deux routes. Le correctif la rendait incohérente **à l'intérieur d'une
même réponse** : `buildLastMessagePreviewTranslations` plafonne chaque aperçu traduit, donc un
lecteur servi en français aurait reçu 300 caractères et un lecteur servi dans la langue d'origine
le blob entier. Le poids de la ligne aurait dépendu de la langue du lecteur. Corrigé dans le même
geste — ce n'est pas un élargissement de périmètre, c'est la conséquence directe du premier
correctif.

## Pourquoi du Swift dans un cycle sans Xcode

La leçon du cycle 62 est qu'un champ posé sur le fil ne sert à rien tant que le client ne le lit
pas — « quatre couches à câbler, pas une ». Vérifié ici avant de conclure quoi que ce soit :

- **Web** : rien à faire. `searchConversations` (`crud.service.ts:159`) passe déjà ses résultats
  par `transformConversationData`, que le cycle 62 a appris à propager les deux champs. Et
  `SearchPageContent.tsx` ne rend aucun aperçu de dernier message (seulement `lastMessageAt`).
- **iOS** : la chaîne s'arrêtait à un pas de l'arrivée. `APIConversation.toConversation` propage
  bien les deux champs (`ConversationModels.swift:382-398`), mais `GlobalSearchViewModel` posait
  `lastMessagePreview: conv.lastMessagePreview` — l'aperçu BRUT — sur ses **deux** chemins (cache
  local et réseau), là où `ThemedConversationRow` résout via
  `resolvedLastMessagePreview(preferredLanguages:)`. La ligne de résultat de recherche EST une
  ligne de conversation ; elle affichait un autre texte que la liste pour la même conversation.

Le correctif Swift est un remplacement d'appel, pas une conception : `resolvedLastMessagePreview`
ne rend `nil` que si `lastMessagePreview` l'est déjà (relu ligne par ligne, `CoreModels.swift:234`),
donc c'est un substitut exact. `MeeshyUser.preferredContentLanguages` fournit le prisme ordonné —
seule autorité iOS sur cet ordre, jamais réimplémentée localement.

**Ce Swift n'est pas gaté par la CI de PR** : `ios-tests.yml` ne tourne automatiquement que sur les
push vers `dev` (décision du 2026-07-27, file d'attente macOS saturée), et `sdk-tests.yml` ne se
déclenche que sur `packages/MeeshySDK/**`. Le gate a donc été demandé explicitement par
`workflow_dispatch` sur la branche — voir §Vérification. Livrer le gateway seul aurait laissé la
moitié client du cycle 62 se reproduire à l'identique une route plus loin.

## Vérification

**Rouge observé avant correctif** : 7 des 8 témoins gateway neufs rouges. Le 8e
(« ne fait jamais fuiter le blob `translations` brut dans `lastMessage` ») passait déjà — c'est un
garde-fou assumé, pas un témoin de défaut : il interdit qu'une future réécriture remplace le
mapping manuel par un spread et renvoie le cryptogramme complet à chaque ligne de résultat.

**Sondes de fidélité** — chaque défaut réintroduit, restauration par copie :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| les deux champs ne sont jamais posés (le défaut d'origine) | 6 |
| carte non restreinte au prisme (toutes les langues servies) | 3 |
| aperçu original non tronqué (le second défaut) | 1 |
| `deviceLocale` ignorée (prisme amputé de son 4e rang) | 1 |

**Un témoin voisin est tombé, et c'est un fait à retenir** :
`conversations-search-routes.test.ts` doublait `@meeshy/shared/utils/conversation-helpers` avec un
mock qui n'exposait QUE `generateDefaultConversationTitle`. Ajouter un import à la route rendait
`resolveUserLanguagesOrdered` `undefined` → 500 sur 4 témoins. Réparé comme
`conversation-core.test.ts` le fait déjà : `...jest.requireActual(...)` puis surcharge du seul
double voulu. Un mock d'objet-module qui énumère ses exports est un couplage caché à la liste des
imports de la cible.

**Gate gateway** : **649 suites / 16 353 tests**, 0 échec, couverture lignes **95,78 %** —
strictement identique au relevé du cycle 62, donc inchangée. `routes/conversations/search.ts` :
100 % lignes / 100 % fonctions, 95,23 % branches (la seule branche non couverte, ligne 246, est le
`?? ''` de `senderPresenceVis.get` — préexistante, hors correctif). `tsc --noEmit` gateway :
0 erreur.

**Swift** : non exécuté localement (aucune chaîne Swift sur ce conteneur). 3 témoins ajoutés à
`GlobalSearchViewModelTests` — langue primaire servie, refus de retomber sur une langue tierce
(règle #1), langue d'origine au rang 2 qui ne rétrograde pas la primaire (règle #3, cycle 62).

## Reste ouvert après ce cycle

- **`ConversationPicker.tsx` (admin) rend `lastMessage.content` brut** — trouvé en auditant les
  consommateurs web de `searchConversations`. Surface d'outillage admin, faible valeur, et le
  fichier traîne une dette de typage voisine (`(conv as unknown).lastMessage`). Non pris pour ne
  pas mélanger deux sujets ; c'est le dernier rendu web d'aperçu non prismé connu.
- **`ConversationSyncEngine.previewTranslations` (iOS, chemin socket) — audité ce cycle, et c'est
  la TÊTE DU PROCHAIN CYCLE.** Le point hérité du cycle 62 demandait de le vérifier contre la règle
  de rang. Sur ce plan il est sain : le résolveur ne consulte que les langues du prisme, donc des
  clés supplémentaires ne changent pas le texte affiché. Mais l'audit en trouve un autre, plus
  grave, et **gatable ici** (`sdk-tests.yml` se déclenche sur `pull_request` pour
  `packages/MeeshySDK/**`) :

  `buildLastMessagePreviewTranslations` (REST) écarte explicitement les traductions **chiffrées**
  — son exclusion #3, « son `text` est un cryptogramme ; le poser dans un aperçu afficherait du
  base64 dans la liste ». `previewTranslations` (socket) **n'a pas cette exclusion**, et ne peut
  pas l'avoir : `APITextTranslation` (`MessageModels.swift:300`) **ne décode pas `isEncrypted`**.
  Or `MessageHandler._parseTranslations` (`:1732`) **répand l'entrée stockée telle quelle**
  (`...data`) dans le payload `message:new` — le drapeau est donc bien SUR LE FIL, seul le client
  ne le lit pas. Une traduction chiffrée arrivée par socket peut ainsi atterrir dans
  `lastMessageTranslations` et faire rendre un cryptogramme par `resolvedLastMessagePreview` dans
  la ligne de liste, là où le même message servi par REST est correctement filtré.

  **Question à trancher AVANT d'écrire le correctif** (non résolue par cet audit, ne pas la
  supposer) : la forme exacte de l'entrée sur le fil. `buildLastMessagePreviewTranslations` lit
  `data.text`, alors que `previewTranslations` lit `$0.translatedContent` — et
  `APITextTranslation.translatedContent` est un `String` NON optionnel, donc un décodage de tout
  l'`APIMessage` échouerait si la clé manquait. Les deux lectures ne peuvent pas être vraies du
  même objet sans un mappage de clés quelque part. **Commencer par établir la forme réelle du
  payload `message:new`** (relire `translation-transformer.ts` et les `CodingKeys` d'
  `APITextTranslation`), puis décider si le correctif est côté client (décoder `isEncrypted` et
  filtrer, jumeau de l'exclusion #3) ou côté gateway (ne jamais mettre de traduction chiffrée sur
  le fil d'un aperçu).

  Trois écarts mineurs constatés au passage, à traiter dans le même geste s'ils survivent à
  l'enquête ci-dessus : la carte socket n'est **pas restreinte au prisme du lecteur** (le REST
  l'est), **pas tronquée** (le REST plafonne à 300), et **n'exclut pas la langue d'origine**. Aucun
  des trois ne change le texte affiché — le résolveur les absorbe — mais tous les trois alourdissent
  le cache de la liste d'autant de langues que la conversation en compte.
- **`emitConversationPreviewUpdate` n'emporte toujours pas le prisme** (cycle 60). Question de
  conception — payload PAR DESTINATAIRE — non tranchée.
- **`normalizeConversation` reste un constructeur manuel de `Conversation` sans aucun appelant**
  (cycle 62) : trancher s'il vit ou meurt.
- **Un participant ANONYME n'a pas de prisme sur ce chemin** — vrai ici aussi :
  `authContext.registeredUser` est `undefined` pour lui, donc `viewerLanguages` est vide et
  `lastMessageTranslations` vaut `null`. Comportement identique à `GET /conversations`, donc
  cohérent, mais toujours non résolu sur le fond (cycle 60, inchangé).
- **Aucune traduction rétroactive de l'aperçu** (cycle 60, inchangé).
- Hérités et non traités : `DELETE /sessions/:sessionId` ne coupe aucune socket (pont client
  `sessionToken` au handshake) ; l'auth REST ne vérifie pas `UserSession.isValid` ; la suppression
  de compte ne révoque aucune session ; `auth:session-revoked` n'est écouté ni par iOS ni par
  Android ; `MaintenanceService.cleanupOrphanedAttachments` reste inerte ; les ~12 copies inline de
  `unsetOrNull` ; `TrackingLink.messageId` est une colonne morte ; l'arbitrage `delete-for-me` du
  cycle 12 attend une validation humaine ; `eslint` ne peut pas tourner sur le gateway (aucun
  `eslint.config.js` depuis ESLint v9) ; `tsc` ne passe pas sur le web (1 190 erreurs
  préexistantes, non gatées par la CI).

---

# Cycle 63 — « Toutes les sessions ont été déconnectées » était faux

> **Collision de numérotation, résolue à la main — même patron que celle du relevé ci-dessous.**
> Ce relevé a été écrit sous le numéro 62 avant que `main` ne porte déjà un cycle 62 (« La langue
> d'origine rétrogradait la langue primaire du lecteur »). Ce ne sont PAS deux versions d'une même
> question : l'autre traite le Prisme de la ligne de liste, celle-ci la révocation de session. Le
> relevé arrivé sur `main` le premier garde le 62 ; celui-ci prend le 63. **Les deux sont
> conservés intégralement — rien n'a été fusionné ni écrasé.**

## Contrainte d'environnement (identique au cycle 61, revérifiée)

Même conteneur Linux distant. `tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane
Android reste **matériellement impossible** ici : `curl https://dl.google.com/...` rend un code
`000` (CONNECT refusé par la politique réseau), donc pas de `sdkmanager`, pas de
`platforms;android-35`, pas de `./apps/android/meeshy.sh check` — le seul gate de cette lane. Ni
macOS ni Xcode pour la lane IOS_DETTE. **`tasks/lane-cursor.md` n'a donc PAS été touché** : la lane
Android reprend telle quelle au prochain run sur une machine capable de la construire.

Ce cycle a travaillé la seule lane gatable ici — gateway + web — sur une capacité qui est autant du
temps réel que de la sécurité.

## Le défaut

**`auth:session-revoked` n'avait aucun émetteur.** L'événement est déclaré dans
`packages/shared/types/socketio-events.ts:539` avec une énumération `reason`
(`password_changed | logout_all_devices | admin_revoke`) écrite exactement pour les appelants
ci-dessous, et le web l'écoute depuis qu'il existe (`connection.service.ts:225`). La moitié serveur
n'a simplement jamais été écrite : `grep -rn "AUTH_SESSION_REVOKED\|auth:session-revoked"
services/gateway/src` rendait **zéro**.

Or **une socket ne s'authentifie qu'une fois, à la connexion, et n'est plus jamais revérifiée**
(`AuthHandler._authenticateJWTUser`). Invalider `UserSession` en base ne ferme donc rien du tout :
l'appareil révoqué continue de recevoir `message:new`, `conversation:updated`, `reaction:added` et
tout le reste, indéfiniment.

Deux chemins de révocation TOTALE étaient concernés, et ce sont précisément les deux chemins de
reprise de compte — ceux qu'on emprunte quand on pense être compromis :

1. **`GET /auth/revoke-all-sessions`** — le lien « ce n'était pas moi » envoyé par email sur une
   connexion suspecte. Il affichait *« All sessions disconnected — N session(s) have been
   revoked »* alors qu'aucune n'avait été déconnectée.
2. **`POST /auth/reset-password`** — `PasswordResetService.completePasswordReset` invalide
   **toutes** les sessions dans la transaction qui écrit le nouveau hash de mot de passe
   (`PasswordResetService.ts:418`). L'intrus qui tenait une socket ouverte continuait de lire les
   conversations de sa victime après la réinitialisation.

**Et la chaîne web s'arrêtait elle aussi à mi-parcours.** `SocketIOOrchestrator.onSessionRevoked`
traduit l'événement serveur en `meeshy:session-revoked` sur `window` — un événement DOM plutôt
qu'un appel direct, pour éviter un import circulaire entre la couche socket et le store d'auth. **Rien
ne l'écoutait** (`grep -rn "meeshy:session-revoked" apps/web` ne rendait que l'émetteur). L'onglet
journalisait un avertissement, lançait l'événement dans le vide et restait « connecté », jeton en
localStorage.

## Le correctif

**Un point d'appel unique**, `socketio/disconnectRevokedSessions.ts` : émet
`auth:session-revoked` sur chaque socket de `ROOMS.user(userId)`, puis `disconnect(true)`.

- **L'émission n'est pas le contrôle, la déconnexion l'est.** `disconnect(true)` ferme la connexion
  sous-jacente, pas seulement le namespace ; un client modifié ignorerait l'event. L'event précède
  la fermeture pour qu'un client conforme purge sa session locale — même ordre que
  `AuthHandler` pour `auth:token-expired`.
- **Best-effort, ne lève jamais.** La révocation est déjà commise quand l'éventail part : une
  socket morte ou un adaptateur indisponible ne doit pas transformer une réinitialisation réussie
  en 500. Isolation par socket : un appareil déjà parti n'épargne pas les autres.
- Côté web, `components/common/SessionRevocationHandler.tsx` monté une fois au layout racine
  termine la chaîne : il écoute `meeshy:session-revoked` et appelle `useAuthStore.logout()` — le
  seul chemin de déconnexion du store, pas une seconde copie.
- `completePasswordReset` rend désormais `userId` en cas de succès **et uniquement là** : la route
  est la seule couche qui puisse couper les sockets, et elle ne peut pas le faire si on ne lui dit
  pas de qui il s'agit. Il ne quitte jamais le serveur — un témoin le vérifie (`never leaks the
  reset user id to the caller`).

## Portée : ce qui N'A PAS été branché, et pourquoi

`DELETE /sessions/:sessionId` et `DELETE /sessions` (« déconnecter mes autres appareils »)
**n'appellent pas** cet éventail, délibérément. Ces deux-là **épargnent une session**, et rien ne
permet aujourd'hui de savoir laquelle : une socket enregistrée s'authentifie avec le seul JWT
(`extractJWTToken`), alors que `UserSession.sessionToken` stocke le hash d'un **autre** jeton,
opaque et longue durée (`generateSessionToken()`), qu'aucun client ne transmet au handshake — le
web n'envoie que `auth: { token }` (`connection.service.ts:107`).

Deux fausses pistes écartées, plutôt que livrées à moitié :

- **Adresser tout `ROOMS.user(userId)` quand même** : déconnecterait l'appareil depuis lequel
  l'utilisateur fait justement le ménage.
- **Hacher le JWT à l'authentification de la socket pour reconnaître l'appelant** : un client qui
  rafraîchit son JWT par REST sans reconnecter sa socket porterait un hash périmé, et se
  déconnecterait lui-même. Le pont manquant est côté client (transmettre le `sessionToken` au
  handshake), donc multi-plateforme — hors d'atteinte d'un cycle gatable ici.

## Vérification

- `disconnectRevokedSessions` : 6 témoins neufs, écrits AVANT l'implémentation, RED observé
  (`Cannot find module '../disconnectRevokedSessions'`). Couvrent l'ordre émettre-puis-fermer, la
  charge utile, l'isolation par socket, l'échec de `fetchSockets`, et le no-op sans `io` / sans
  `userId` (aucun `io.in('user:')` ne doit partir).
- Routes : 3 témoins sur `revoke-all-sessions`, 3 sur `reset-password`, RED observé sur les deux
  (`rooms` vide au lieu de `['user:usr-123']`). Ils vérifient aussi que la révocation se confirme
  quand aucun Socket.IO n'est câblé et quand l'éventail échoue.
- `PasswordResetService` : 1 témoin sur le `userId` rendu, RED observé.
- Web : 4 témoins sur `SessionRevocationHandler`, RED observé (module absent). Couvrent le
  désabonnement au démontage — un remontage ne doit pas déconnecter deux fois.

## Reste ouvert après ce cycle

- **`DELETE /sessions/:sessionId` et `DELETE /sessions` ne coupent toujours aucune socket.** Le
  chantier est le pont client : transmettre le `sessionToken` au handshake (web, iOS, Android) pour
  qu'une socket sache de quelle `UserSession` elle relève. Tant qu'il n'existe pas, révoquer un
  appareil depuis la liste des sessions le laisse en ligne jusqu'à expiration de son JWT.
- **L'auth REST ne vérifie pas `UserSession.isValid`** : un JWT non expiré reste accepté après
  révocation (`middleware/auth.ts` ne consulte la table que sur le chemin JWT-expiré-plus-session-
  de-confiance). C'est un arbitrage assumé du JWT sans état, mais il mérite d'être nommé : la
  révocation ne mord sur REST qu'à l'expiration du jeton. Le fermer coûterait une lecture par
  requête — **décision de conception, à instruire séparément.**
- **La suppression de compte ne révoque aucune session** (`routes/me/delete-account.ts` bascule
  `isActive`/`deletedAt` sans toucher `UserSession`) et ne coupe aucune socket. Le cycle de vie y
  est différent (période de grâce, annulation possible) : brancher l'éventail y demande d'abord de
  trancher ce que devient la socket d'un compte en attente de suppression.
- **`auth:session-revoked` n'est écouté ni par iOS ni par Android.** `grep -rn
  "auth:session-revoked" packages/MeeshySDK apps/ios apps/android` rend zéro. Le serveur ferme
  désormais leur socket — ce qui est le contrôle — mais leur session locale n'est pas purgée : ils
  se reconnecteront avec un JWT encore valide. Lot mobile, non gatable ici.
- **L'éventail est attendu (`await`) avant la réponse HTTP.** Voulu : le client ne doit pas
  s'entendre dire « c'est fait » avant que les sockets soient fermées. `fetchSockets()` est borné
  par le `requestsTimeout` de l'adaptateur, donc sans risque de blocage indéfini — mais c'est une
  hypothèse sur l'adaptateur, à revoir si un jour on en change.
- **Audit croisé des émetteurs par room personnelle : rien à corriger.** Le point porté depuis le
  cycle 44 (« `emitConversationPreviewUpdate` et les autres émetteurs par room personnelle n'ont pas
  été audités contre la même clé ») a été instruit par `grep -rn "ROOMS.user("` sur tout le
  gateway. `emitConversationPreviewUpdate` passe par `participantUserRooms`. Les trois sites qui
  n'adressent que `.userId` sont justes et documentés : `callEndedFanout` (exception écrite dans le
  fichier), `conversations/core.ts:1056` (DM, donc deux comptes), `MessageReadStatusService:1080`
  (préférence stockée, inexistante sans compte). **Point retiré du backlog.**
- Les points hérités des cycles précédents restent ouverts tels quels (compilation locale des 20
  suites rouges, `timeout-minutes` du job `quality`, borne de la passe soft-delete,
  `softDeleteRetentionMs` mort, `createStoryCommentNotificationsBatch` à `visibility` optionnel,
  arbitrage `delete-for-me` du cycle 12, `eslint` gateway sans config v9).

---

# Cycle 62 — La langue d'origine rétrogradait la langue primaire du lecteur

> **Collision de numérotation, résolue à la main.** Deux sessions ont tourné en parallèle depuis le
> cycle 60 et ont toutes deux nommé leur travail « cycle 61 ». Ce ne sont PAS deux versions d'une
> même question — l'autre traite l'absence d'auditeur mobile sur `link:message:new`, celle-ci le
> Prisme de la ligne de liste. Aucune des deux n'est un addendum de l'autre (le suffixe `b` des
> cycles 25b/32b/36b/38b désigne deux sessions sur la MÊME question). L'autre étant arrivée sur
> `main` la première, elle garde le 61 ; ce relevé prend le 62. Rien n'a été fusionné ni écrasé.

Le cycle 60 laissait un candidat nommé en tête : « le web rend toujours `lastMessage.content`
brut ; il manque le résolveur côté web, jumeau de `resolvedLastMessagePreview`. **Candidat direct
pour le prochain cycle.** »

Ce cycle l'a pris — et le backlog **sous-estimait** le défaut sur deux axes.

## Ce que le backlog annonçait, et ce qui était vrai

Il n'y avait pas « un résolveur manquant ». La donnée n'arrivait même pas jusqu'à un endroit où un
résolveur aurait pu la lire. Balayage de `lastMessageTranslations|lastMessageOriginalLanguage` sur
tout le dépôt, avant correctif :

| Site | État |
|---|---|
| `gateway/routes/conversations/core.ts` | **écrit** les deux champs (cycle 60) |
| `shared/types/api-schemas.ts` | **déclare** les deux champs (cycle 60) |
| `MeeshySDK/.../CoreModels.swift` | **lit** via `resolvedLastMessagePreview` |
| `shared/types/conversation.ts` (`Conversation`) | **aucun champ** |
| `web/services/conversations/transformers.service.ts` | objet à la main → **jette** |
| `web/.../conversation-item/message-formatting.tsx` | `return lastMessage.content` **brut** |

**Zéro occurrence des deux noms sous `apps/web/`.** Quatre couches à câbler, pas une.

## Le vrai défaut, trouvé en écrivant le jumeau

Le jumeau TypeScript a d'abord été écrit en miroir strict d'iOS. Ses témoins passaient. C'est le
témoin de CÂBLAGE de la ligne de liste qui a refusé de verdir : prisme `['fr', 'en']` (jsdom pose
`navigator.language = 'en-US'`, donc `'en'` entre en 4e priorité), message anglais, traduction
française disponible → rendu « Hello everyone ».

Ce n'était pas un défaut de câblage. C'était **la règle**, et elle était fausse des deux côtés.

iOS court-circuitait dès que la langue d'origine appartenait **quelque part** au prisme :

```swift
if let original = lastMessageOriginalLanguage?.lowercased(),
   preferred.contains(original) {
    return lastMessagePreview   // ← rétrograde la langue PRIMAIRE
}
```

Cette formulation par **appartenance** est correcte tant que le prisme n'a qu'une entrée, ou que la
langue d'origine en est la tête. Dès qu'elle occupe un rang inférieur, elle bat la langue primaire
du lecteur — et c'est exactement ce que produit mécaniquement la locale appareil, entrée en 4e
priorité depuis 2026-05-26. La population touchée est précisément celle pour qui cette feature
existe : les comptes dont la locale de l'appareil diffère de la langue de l'app.

`CLAUDE.md` tranche noir sur blanc, et depuis le début :

> « Un utilisateur francophone avec un iPhone en anglais voit **toujours** ses messages en français
> (priorité 1) ; la locale anglaise n'intervient que si aucune traduction française n'est
> disponible ET qu'une traduction anglaise existe. »

Et le chemin du **corps** des messages appliquait déjà la bonne règle : `use-message-translations`
compare `originalLanguage` à `preferredLanguage` — la **seule langue de tête**, pas la liste. La
ligne de liste était la dernière surface à en diverger, et elle divergeait sur les deux clients.

## Le correctif

Le prisme est parcouru **par rang** ; la langue d'origine y concourt à sa place :

```
pour chaque langue L du prisme, dans l'ordre :
  L est la langue d'origine   ⇒ l'aperçu brut (le message EST en L)
  une traduction existe en L  ⇒ cette traduction
aucune ⇒ l'aperçu brut
```

Se réduit au comportement du corps des messages quand on ne regarde que le rang 1, et lui ajoute la
descente que celui-ci n'a pas. Règle #3 inchangée : jamais de repli sur `translations.first`.

Appliqué aux **deux** plateformes — `resolveLastMessagePreview` (`@meeshy/shared`, neuf) et
`MeeshyConversation.resolvedLastMessagePreview` (iOS, corrigé). Aucun témoin iOS existant
n'encodait le défaut (les deux témoins « langue d'origine » utilisent un prisme à une entrée, donc
survivent tels quels) ; 4 témoins de rang ont été ajoutés côté Swift, jumeaux des témoins TS.

## Livré

- [x] T1/T2 — `resolveLastMessagePreview` dans `packages/shared/utils/conversation-helpers.ts`,
      20 témoins (17 de miroir iOS + 3 de rang/locale appareil)
- [x] T3 — `Conversation.lastMessageTranslations` / `.lastMessageOriginalLanguage`
- [x] T4/T5 — `transformConversationData` propage les deux champs (`extractPreviewTranslations`
      rejette non-objet, tableau, valeurs non-chaînes, et ne matérialise jamais `{}`)
- [x] T6/T7 — `formatLastMessage(lastMessage, prism?)` applique le prisme au TEXTE seul
- [x] T8 — `ConversationItem` câble `getUserLanguagePreferences(currentUser)` (le seul point
      d'entrée web autorisé — il injecte la `deviceLocale` en 4e priorité, ce qu'un appel direct au
      shared perdrait, cf. `apps/web/CLAUDE.md`)
- [x] T9 — correctif de RÈGLE sur shared + iOS, `CLAUDE.md` § « Règles critiques du Prisme » gagne
      la règle 3
- [x] T10 — changeset, ce relevé, leçon 93

## Vérification

**Rouge observé avant correctif** : 17/17 témoins shared rouges (fonction absente) ; 2 témoins
transformer rouges ; 1 témoin `formatLastMessage` rouge ; 2 témoins de câblage `ConversationItem`
rouges.

**Sondes de fidélité** — chaque défaut réintroduit, restauration par copie :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| court-circuit par APPARTENANCE (le défaut de règle de ce cycle) | **2 shared + 2 web** |
| repli sur `translations.first` (violation règle #3) | 2 shared |
| le transformer rejette les deux champs (le défaut d'origine) | **2** |
| `formatLastMessage` rend le contenu brut | 3 |
| la ligne ne passe aucune langue de lecteur | 2 |
| la ligne ne passe QUE `systemLanguage` (ordre du prisme ignoré) | **1** |

Deux lignes apprennent quelque chose. La **première** : le défaut de règle n'est visible côté web
QUE parce que jsdom injecte `navigator.language` — c'est-à-dire que le témoin de câblage reproduit
la condition réelle (locale appareil ≠ langue in-app) au lieu de la neutraliser. Un test qui aurait
figé `navigator.language` pour « isoler » n'aurait rien vu.

La **troisième** : seuls 2 témoins voient le transformer amputé, et aucun n'est un témoin de
composant — les témoins de `ConversationItem` construisent leur `Conversation` directement et ne
peuvent donc pas savoir si la couche de transformation a laissé passer la donnée. Même famille de
trou que la leçon 105 : ces 2 témoins sont le SEUL garde-fou de cette couche.

**Gate** : `@meeshy/shared` **50 fichiers / 1 484 tests**, 0 échec. Web **515 suites / 11 745
tests** (21 skipped), 0 échec. Gateway **648 suites / 16 332 tests**, 0 échec, couverture lignes
**95,78 %** (mesuré sur l'état MERGÉ, qui inclut le cycle 61 de l'autre session). `tsc --noEmit` gateway : 0 erreur. `tsc --noEmit` web : **1 190 erreurs avant comme
après** — condition préexistante non gatée par la CI, zéro erreur introduite (mesuré par
`git stash`, avant/après identiques au unité près). Swift : **non exécuté localement** — aucune
chaîne Swift sur ce conteneur Linux ; les 4 témoins `ConversationPrismeRankOrderTests` sont validés
par `sdk-tests.yml` en CI.

Le gateway n'était pas censé bouger (ce cycle n'y touche pas) mais il consomme
`conversation-helpers.ts` : la suite complète a été passée pour prouver que l'ajout de
`resolveLastMessagePreview` et des deux champs optionnels sur `Conversation` ne déplace rien chez
son plus gros consommateur.

## Reste ouvert après ce cycle

- **`ConversationSyncEngine.previewTranslations` (iOS, chemin socket) n'a pas été audité contre la
  règle de rang.** Il dérive la même carte d'un `message:new` ; c'est `resolvedLastMessagePreview`
  qui la consomme, donc le correctif de règle le couvre. Mais la carte elle-même pourrait porter
  des langues hors prisme, là où le chemin REST les filtre côté gateway — à vérifier.
- **`routes/conversations/search.ts` reste hors prisme** (hérité du cycle 60, non pris). Le
  `conversationMinimalSchema` DÉCLARE pourtant déjà les deux champs : la route construit son
  `lastMessage` à la main et ne les remplit jamais. Le correctif est mécanique — même `include`
  Prisma, même `buildLastMessagePreviewTranslations`, même `viewerLanguages`. **Tête du prochain
  cycle** : c'est la dernière route qui sert une ligne de conversation sans prisme.
- **`emitConversationPreviewUpdate` n'emporte toujours pas le prisme** (cycle 60). Question de
  conception — payload PAR DESTINATAIRE — non tranchée.
- **`normalizeConversation` (`packages/shared/types/migration-utils.ts`) est un deuxième
  constructeur manuel de `Conversation` qui jette les deux champs — et il n'a AUCUN appelant.**
  Balayage `\bnormalizeConversation\b` sur tout le dépôt (hors `node_modules`/`dist`) : une seule
  occurrence, sa propre déclaration. Il n'a donc pas été câblé — corriger un constructeur mort
  aurait été du geste pour du geste (leçon 92). Le vrai reste est de trancher s'il vit ou meurt ;
  tant qu'il vit, il divergera un peu plus à chaque champ ajouté.
- **Un participant ANONYME n'a pas de prisme sur ce chemin** (cycle 60, inchangé).
- **Aucune traduction rétroactive de l'aperçu** (cycle 60, inchangé).
- Hérités et non traités : `MaintenanceService.cleanupOrphanedAttachments` reste inerte,
  délibérément ; les ~12 copies inline de l'idiome `unsetOrNull` ; `TrackingLink.messageId` est
  une colonne morte (3 écrivains, 0 lecteur) ; l'arbitrage `delete-for-me` du cycle 12 attend une
  validation humaine ; `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js`
  depuis ESLint v9) ; `tsc` ne passe pas sur le web (1 190 erreurs préexistantes, non gatées).

---

---
---

# Cycle 61 — Un message de lien de partage n'arrivait sur aucun mobile

## Contrainte d'environnement (à lire avant de juger le choix de lane)

Ce run a démarré sur un conteneur Linux distant, pas sur la machine habituelle de la routine.
`tasks/lane-cursor.md` disait `lane=ANDROID`, mais la lane Android y est **matériellement
impossible** : `dl.google.com` est refusé par la politique réseau du conteneur (403 au CONNECT,
confirmé sur la recette d'amorçage de `ROUTINE.md` §Environment recipe **et** sur un `curl` nu),
donc pas de `sdkmanager`, pas de `platforms;android-35`, pas de `./apps/android/meeshy.sh check`
— le seul gate de cette lane. `maven.google.com` et `repo1.maven.org` répondent, mais les
plateformes/build-tools ne s'y trouvent pas. La lane IOS_DETTE est hors d'atteinte pour la raison
symétrique (ni macOS ni Xcode).

**`tasks/lane-cursor.md` n'a donc PAS été touché** : la lane Android reprend telle quelle au
prochain run sur une machine capable de la construire. Ce cycle a travaillé la seule lane
gatable ici — le temps réel côté gateway, qui est le cœur de la mission du prompt planifié — avec
son propre gate complet (jest gateway + tsc + vitest shared).

## Le défaut

`link:message:new` n'a jamais eu qu'un seul auditeur : le web. iOS
(`MeeshySDK/Sockets/MessageSocketManager.swift:2658`) et Android
(`sdk-core/socket/MessageSocketManager.kt:101`) n'enregistrent qu'un listener de création,
`message:new` — `grep -rn "link:message:new" packages/MeeshySDK apps/ios apps/android` rend zéro.

Or l'envoi par lien est le **seul** transport d'envoi dont dispose un participant anonyme. Un
invité qui écrivait dans une conversation partagée n'apparaissait donc chez aucun membre mobile de
cette conversation, **y compris les membres inscrits** : ni en direct (`broadcastLinkMessage` →
room `conversation:<id>`), ni au reconnect (`_drainPendingMessages`, qui rejouait le même event
unique). Le message ne surgissait qu'au prochain refetch complet, que rien ne déclenchait.

Deux diffuseurs, deux décisions d'event prises séparément : c'est là que la divergence est née.
Et le contrat de la file (`packages/shared/types/delivery-queue.ts`) portait un argument juste mais
trop large — « `message:new` envoie l'objet, `link:message:new` l'enveloppe `{ message }` », donc
ne rien rejouer sous `message:new`. L'argument ne vaut que pour l'**enveloppe**, pas pour le
message déballé.

## Le correctif

Un seul point d'appel public, `socketio/linkMessageEmissions.ts`, partagé par les deux diffuseurs,
qui met les **deux** events sur le fil, chacun dans sa forme : `link:message:new` avec son
enveloppe, `message:new` avec le message déballé. Garde de forme incluse (pas de `message:new` si
l'enveloppe ne porte pas d'objet — absent, `null`, chaîne, **tableau**).

Additif, jamais substitutif. Les deux copies portent le même `id` et les deux gestionnaires web
dédupent dessus, donc le second arrivé est un no-op quel que soit l'ordre ; la pastille de non-lus
vient de la valeur absolue de `conversation:unread-updated`, rien à double-compter.

**Un test existant a changé de verdict, délibérément et documenté** : `routes link-message entries
to LINK_MESSAGE_NEW, not MESSAGE_NEW` affirmait sa clause pour un motif correct (l'enveloppe n'est
pas routable sous `message:new`) que le correctif **préserve** en déballant. La clause « jamais
`message:new` » est remplacée par une assertion plus forte (les deux events, chacun avec sa forme)
plus un nouveau témoin qui garde l'ancien comportement pour une entrée sans enveloppe. Aucune
assertion relâchée.

## Trois pistes du backlog rouvertes et CLASSÉES SANS SUITE — preuve à l'appui

Le prompt de routine exige de re-prouver avant de corriger. Trois notes portées depuis des cycles
antérieurs se sont révélées périmées ; aucune n'a donné lieu à du code, et c'est le résultat :

1. **« `emitConversationPreviewUpdate` et les autres émetteurs par room personnelle n'ont pas été
   audités contre la clé `userId ?? id` »** (laissée ouverte par le cycle précédent, à instruire
   par une recherche sur `ROOMS.user(`). Recherche faite, tous les sites lus :
   `emitConversationPreviewUpdate` passe par `participantUserRooms` (ligne 96),
   `emitUnreadCountsToRecipients`, `MessageHandler:1345`, `MeeshySocketIOManager:2179` et
   `callEndedFanout` aussi. Les émetteurs restants (mentions, demandes d'ami, notifications,
   `emitWithSeq`) sont user-scoped par nature — un participant sans compte n'a ni notification ni
   demande d'ami. **Audit clos, rien à corriger.**
2. **« Les mentions du chemin de lien attendent l'extraction qui écrit `Message.validatedMentions` »**
   — les deux routes de lien appellent `resolveMessageMentions` depuis un cycle antérieur
   (`routes/links/messages.ts:318` et `:609`). Seule la **note** de `messageNotificationFanOut`
   en était restée à l'ancien état ; elle aurait envoyé un futur lecteur réparer un trou bouché.
   Corrigée dans ce cycle.
3. **Les participants anonymes exclus de l'éventail d'appel** (`CallEventsHandler`, requête filtrée
   `userId: { not: null }`) ressemblaient au même défaut de clé de room. **C'est intentionnel** :
   `denyAnonymous` (Audit P1-20 / CVE-004) refuse aux anonymes d'initier comme de rejoindre un
   appel, en parité avec les routes REST `allowAnonymous: false`. Ne pas « réparer ».

## Gates

`services/gateway` : `bun run test:coverage` → **647 suites / 16 309 tests verts**, exit 0.
`npx tsc --noEmit` → 0 erreur. `packages/shared` : vitest → 49 fichiers / 1 462 tests verts.
Couverture des fichiers touchés : `linkMessageEmissions.ts` **100/100/100/100** (neuf),
`broadcastLinkMessage.ts` **100/100/100/100** (déjà à 100 % de branches avant — la nouvelle branche
« aucun serveur Socket.IO monté » a reçu son propre témoin plutôt que de laisser le chiffre
glisser), `MeeshySocketIOManager.ts` inchangé à 88.01/90.65/81.64/92.68.

**Piège d'environnement à retenir** : `bun install` échoue sur le postinstall de `grpc-tools`
(binaire précompilé refusé par le proxy) et laisse `node_modules` à moitié peuplé sans le dire —
`bun install --frozen-lockfile --ignore-scripts` passe. Et `npx prisma generate --generator client`
DOIT être re-vérifié (`ls packages/shared/prisma/client`) : un premier appel silencieusement sans
effet a fait échouer 21 suites sur un `TS2347` dans `PostReactionService` qui n'avait rien à voir
avec le diff.

## Suivi laissé ouvert

- **Consolider vers un seul event de création.** `link:message:new` n'existe que par accident
  d'histoire ; `handleNewMessage` côté web est d'ailleurs meilleur que le handler dédié (il
  réconcilie la bulle optimiste de l'auteur, ce que `handleLinkMessageNew` ne fait pas). Retirer
  l'event dédié est un incrément à part, avec sa propre vérification web.
- **Effet de bord bénin observé, non traité** : `handleNewMessage` déclenche un
  `GET /conversations/:id` quand la conversation n'est pas dans le cache de liste — un invité
  anonyme sur la page de lien peut donc l'émettre. Gardé et attrapé, et la route autorise les
  contextes anonymes (`canAccessConversation`), donc il a de bonnes chances d'aboutir et
  d'enrichir le cache. À mesurer avant d'y toucher.
- **`emitWithSeq` n'a qu'UN call site** (`NOTIFICATION_NEW`). La détection de gap exacte du
  SyncEngine ne couvre donc qu'un event sur tous ceux qui partent en room personnelle ; l'étendre
  demande le fan-out per-user A2.2, chantier à part.
- Lane ANDROID intacte, à reprendre sur une machine avec SDK Android (cf. §Contrainte
  d'environnement).

# Cycle 60 — L'aperçu de la liste ne parlait la langue de personne

Le backlog du cycle 59 laissait un candidat nommé en tête : `updateTrackingLinksMessageId`
(chemin de PARTAGE) « écrase sans aucune garde », et maintenant que le cycle 59 a rendu le binder
du chemin d'ENVOI réellement écrivant, « les deux se disputent la colonne pour de bon ».

**Ce cycle ne l'a pas pris, et l'écarte du backlog.** La dispute est réelle et sans conséquence :
un balayage de `TrackingLink.messageId` sur tout le dépôt — gateway, web, `packages/shared`, SDK
iOS — ne rend **aucun lecteur**. Trois chemins écrivent la colonne, zéro ne la lit. Le
`messageRemovalEffects.ts` qui documente le défaut explique lui-même pourquoi il ne s'y fie pas
(un `TrackingLink` est PARTAGÉ par URL, la colonne ne désigne pas de propriétaire) et dérive la
propriété du contenu des messages vivants. Ajouter une garde à un écrivain que personne ne lit,
c'est 20 lignes pour zéro défaut observable. Le vrai reste : la colonne est morte, et c'est ça
qu'un cycle futur devrait trancher — la remplir correctement OU la retirer.

La question posée à la place : **quel contenu le client sait afficher mais ne reçoit jamais ?**

## Le défaut

Le principe fondateur du produit dit : « le prisme s'applique à TOUT le contenu — messages texte,
transcriptions audio, métadonnées, **previews** ». La ligne de la liste de conversations était la
seule surface où il ne s'appliquait pas.

Pas faute de client. Le SDK iOS porte depuis longtemps :

- `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` — la résolution du Prisme
  ligne par ligne, avec la règle #3 (« ne jamais retomber sur `translations.first` ») ;
- ses **douze** témoins (`ConversationPrismeResolutionTests.swift`) ;
- `LastMessageFacet.translations` / `.originalLanguage`, membres d'une facette conçue pour que les
  onze champs `lastMessage*` s'écrivent en bloc.

Rien de tout cela ne recevait de données par le chemin REST. Le `select` du dernier message dans
`GET /conversations` ne chargeait **ni `Message.translations` ni `Message.originalLanguage`**, et
`APIConversationLastMessage` n'avait aucun champ où les décoder. La documentation du champ SDK
l'écrivait elle-même :

> *« When the gateway starts shipping these in `/conversations` it will be wired through the
> API → domain converter; until then the field stays `nil` and the list falls back to the raw
> `lastMessagePreview`. »*

Elle renvoyait à un contournement applicatif, `ConversationListViewModel.attachLastMessageTranslations`,
qui **n'existe nulle part dans le dépôt** — la seule occurrence de ce nom est la phrase qui le cite.

Le chemin socket, lui, est bien câblé : `ConversationSyncEngine.previewTranslations(from:)` dérive
la carte du `message:new` reçu. Il ne comble rien pour autant — les traductions arrivent **après**
le message, par `message:translation`, si bien que l'`APIMessage` du `message:new` les porte
rarement.

**Conséquence** : à chaque démarrage à froid et à chaque rafraîchissement de liste, toutes les
lignes affichent le dernier message dans la langue de son expéditeur. Un francophone voyait
« Hey, are you free tonight? » sur une conversation que le serveur avait pourtant traduite, et dont
il lirait la version française une fois la conversation ouverte.

## Le correctif

`GET /conversations` porte désormais, au niveau conversation, `lastMessageOriginalLanguage` et
`lastMessageTranslations` — une carte `{ langue: aperçu }`.

Elle n'est pas le contenu brut de la colonne. Quatre exclusions
(`routes/conversations/utils/last-message-preview.ts`), chacune fermant un cas distinct :

| Exclusion | Ce qu'elle évite |
|---|---|
| hors prisme du LECTEUR | envoyer les N langues de la conversation pour un champ dont le client lit UNE valeur |
| langue d'origine | elle EST déjà `lastMessage.content` |
| traduction **chiffrée** (`isEncrypted`) | son `text` est un cryptogramme — du base64 dans la liste |
| `text` non exploitable | la colonne est un JSON libre côté Mongo |

Le prisme du lecteur est résolu **une fois par page** par `resolveUserLanguagesOrdered` (seule
autorité du dépôt sur l'ordre `systemLanguage → regionalLanguage → customDestinationLanguage →
deviceLocale`), depuis l'utilisateur déjà chargé et mis en cache par le middleware d'auth :
**aucune requête supplémentaire** sur ce hot path. Et `Message.translations` est une colonne JSON
du **même document** — pas une relation — donc le `select` élargi ne coûte ni jointure ni requête.

Rendu `null` et jamais `{}` quand il ne reste rien : le client doit pouvoir retomber sur
l'original, ce qui EST la règle #3.

Deux détails qui ne sont pas des détails :

- **`truncateMessagePreview` et son plafond déménagent** dans le module du nouveau constructeur.
  La troncature de l'aperçu a maintenant un propriétaire unique, et une traduction de 5 000
  caractères ne peut plus contourner un plafond posé pour le seul `content`.
- **Le spread `...msg` est déstructuré.** Sans ça, `translations` (blob complet, une entrée par
  langue, avec modèle, score et champs de chiffrement) partait dans chaque ligne de liste.

Côté SDK, le câblage que la doc annonçait : `APIConversation` décode les deux clés,
`toConversation` les pose sur le domaine en minuscules — même convention que le chemin socket,
sans quoi la résolution dépendrait du chemin par lequel la ligne est arrivée.

## Plan
- [x] T1 — bootstrap (leçon 102b) : `bun install --ignore-scripts`, `prisma generate`, build shared
- [x] T2 — instruire le candidat hérité, puis l'écarter sur preuve (zéro lecteur de la colonne)
- [x] T3 — chercher ce que le client sait afficher et ne reçoit jamais
- [x] T4 — RED : 12 témoins de source + 6 de route
- [x] T5 — GREEN : `buildLastMessagePreviewTranslations`, `select` élargi, sérialisation
- [x] T6 — schéma de réponse + son témoin (le strip de `fast-json-stringify` est invisible en unit)
- [x] T7 — SDK : décodage + câblage vers le résolveur, 6 témoins Swift
- [x] T8 — sondes de fidélité en sept temps
- [x] T9 — gates : suite gateway complète, `tsc --noEmit`, suite `@meeshy/shared`
- [x] T10 — changeset + ADR + ce relevé + leçon

## Vérification

**Rouge observé avant correctif** : les 6 témoins de route échouent sur un `main` sans le
correctif (sonde 7 : les deux champs retirés de la ligne → 5 rouges ; `select` amputé → 1 rouge).

**Sondes de fidélité** — chaque défaut réintroduit, restauration par copie (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| `select` sans `translations`/`originalLanguage` | **1** |
| exclusion de la langue d'origine retirée | 1 |
| garde `isEncrypted` retirée | 1 |
| `{}` rendu au lieu de `null` | 3 |
| troncature retirée | 2 |
| prisme du LECTEUR ignoré (toutes langues servies) | **5** |
| les deux champs retirés de la ligne (le défaut d'origine) | **5** |

La première ligne est celle qui apprend quelque chose : **un seul témoin** voit le `select`
amputé, parce que tous les autres injectent la donnée dans le double Prisma et ne peuvent donc pas
savoir si la route l'a demandée. C'est la même famille de trou que la leçon 105 (« une convention
tenue par les APPELANTS n'est pas testée par ce qui la consomme ») : un témoin de forme est ici le
SEUL garde-fou possible, et le retirer au motif qu'il « teste l'implémentation » rouvrirait le
défaut en silence.

**Gate** : suite gateway complète **647 suites / 16 317 tests, 0 échec** (baseline du cycle 59 :
646 / 16 300). `@meeshy/shared` : suite complète **49 fichiers / 1 464 tests**, 0 échec. `tsc --noEmit` gateway : 0 erreur.
Swift : **non exécuté localement** — aucune chaîne Swift sur ce conteneur Linux ; les 6 témoins
`ConversationListPrismeWiringTests.swift` sont validés par `sdk-tests.yml` en CI.

## Reste ouvert après ce cycle

- **`emitConversationPreviewUpdate` n'emporte pas le prisme.** Le fanout `conversation:updated`
  (édition/suppression) pose `lastMessagePreview` sans traductions ; une ligne rafraîchie par ce
  chemin retombe donc sur l'original jusqu'à la synchro suivante. Le faire correctement demande un
  payload PAR DESTINATAIRE — les participants d'une conversation n'ont pas le même prisme — ce qui
  change la forme de l'émetteur (aujourd'hui une seule charge, N rooms). Question de conception, pas
  correctif : c'est pourquoi ce cycle ne l'a pas bâclée.
- **`routes/conversations/search.ts` construit son propre `lastMessage` à la main** et reste hors
  prisme. Deux chemins, une règle, un seul l'applique — exactement la forme de dérive que le dépôt
  combat ailleurs. À aligner, avec la même carte et le même constructeur.
- **Le web rend toujours `lastMessage.content` brut** (`formatLastMessage`,
  `components/conversations/conversation-item/message-formatting.tsx`). Les deux champs sont
  désormais sur le fil ; il manque le résolveur côté web, jumeau de
  `resolvedLastMessagePreview`. Candidat direct pour le prochain cycle.
- **`TrackingLink.messageId` est une colonne morte** : trois écrivains, zéro lecteur (mesuré sur
  tout le dépôt). Le candidat « garde manquante sur le binder du chemin de partage » est retiré du
  backlog au profit de celui-ci — la remplir correctement OU la retirer.
- **Un participant ANONYME n'a pas de prisme sur ce chemin.** `viewerLanguages` est dérivé de
  `authContext.registeredUser`, absent d'un contexte anonyme : la carte est donc toujours `null`
  pour lui et sa ligne retombe sur l'original. C'est le comportement d'AVANT, pas une régression —
  mais `Participant.language` existe et pourrait le servir. Non fait : le prisme d'un participant
  sans compte est un choix produit (une seule langue ? la locale de l'appareil via
  `X-Device-Locale` ?) que ce cycle n'avait pas à trancher seul.
- **Aucune traduction rétroactive de l'aperçu.** Un message dont la traduction arrive après coup
  ne rafraîchit pas la ligne de liste tant que le client ne refait pas de `GET /conversations` (ou
  ne reçoit pas un nouveau message) — c'est le point précédent (`emitConversationPreviewUpdate`)
  vu depuis l'utilisateur.
- Hérités et non traités : `MaintenanceService.cleanupOrphanedAttachments` reste inerte,
  délibérément (leçon 90.4 — un essai à blanc contre la base de production est le préalable) ; les
  ~12 copies inline de l'idiome `unsetOrNull` ne sont pas migrées ; les messages d'appel écrits
  avant le cycle 58 restent invisibles ; l'arbitrage `delete-for-me` du cycle 12 attend une
  validation humaine ; `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js`
  depuis ESLint v9).

---

# Cycle 59 — Les anonymes n'entraient plus dans leur propre conversation

Le backlog du cycle 58 laissait un candidat nommé : le prédicat défensif
`OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]` sur les 119 lectures de
`Message.deletedAt`. Ce cycle ne l'a pas pris, et c'est le premier résultat.

La tête du backlog dit « appliquez cet idiome aux 119 sites ». Or ces 119 sites ne sont PAS cassés :
le cycle 58 vient de rendre la discipline d'écriture complète, les sept créateurs écrivent la
colonne, les lectures apparient. Le prédicat y serait de la ceinture par-dessus des bretelles — 119
fichiers touchés pour zéro défaut observable. La question utile n'était pas « où cet idiome
manque-t-il ? » mais **« sur quelle colonne le filtre naïf n'apparie-t-il RIEN aujourd'hui ? »**, ce
qui se réduit à : *une colonne `DateTime?`/`String?` dont AUCUN créateur n'écrit la valeur.*

Un balayage des `where` du gateway sous cette question rend quatre sites. Le premier est une porte
d'accès.

## Le défaut

`canAccessConversation` — la garde de toutes les routes de conversation — filtrait
`bannedAt: null` sur `Participant`. **Aucun des neuf créateurs de `Participant` n'écrit `bannedAt`.**
La colonne est donc ABSENTE du document de tout participant jamais banni, et sur le connecteur
MongoDB de Prisma l'égalité à `null` ne l'apparie pas.

Le seul producteur d'un `null` EXPLICITE sur cette colonne est `resolveUnbanWrite`. Autrement dit :
**les seuls participants que cette porte laissait entrer étaient ceux qui avaient été bannis puis
débannis.** Tous les autres étaient dehors.

Et cette branche n'est empruntée que par un contexte d'auth portant un `participantId`, ce qui
d'après `middleware/auth.ts` désigne exactement une population : **les anonymes venus par un lien de
partage.**

| Route | Ce qu'un anonyme obtenait |
|---|---|
| `GET /conversations/:id/messages` | 403 « Unauthorized access to this conversation » |
| `POST /conversations/:id/messages` | 403 |
| `GET /conversations/:id` | 403 |
| fils, statistiques, liste des participants, épinglage | 403 |

La fonctionnalité d'entrée par lien anonyme — celle que `routes/anonymous.ts` provisionne, dont
`routes/conversations/messages.ts` gère explicitement le cas trois lignes plus bas (`joinedAt`,
`allowViewHistory`, `shareLinkId`) — était fermée au niveau de sa garde.

## Les trois autres sites, même piège

- **`PasswordResetService.revokeExistingTokens` et le jumeau magic-link n'ont jamais révoqué un seul
  jeton.** `create` ne renseigne pas `usedAt`, donc la colonne est absente de tout jeton encore
  vierge — soit exactement la cible. Demander un nouveau lien laissait le précédent valide jusqu'à
  son expiration ; `revokedReason: 'NEW_REQUEST'` n'a jamais été écrit. La validation, elle, lit la
  ligne et teste `token.usedAt` en JS : elle est juste, et c'est pour ça que le défaut est resté
  invisible — un jeton consommé était bien refusé, il n'y avait simplement aucune exclusivité.
- **`MessageProcessor.updateTrackingLinksWithMessageId` n'écrivait aucune attribution.** La
  réécriture crée le lien avec un `messageId` encore indisponible, donc omis — son propre
  commentaire dit « sera null », il est ABSENT. Le rattachement post-envoi ne retrouvait pas le lien
  qu'elle venait de créer.
- **`activeTokens` du balayage des jetons périmés rendait toujours 0.**

## Le correctif

`unsetOrNull(champ)` (`utils/prisma-unset.ts`) — le prédicat de LECTURE, nommé, typé sur le nom du
champ, pendant du `LIVE_MESSAGE_MARK` côté écriture du cycle 58. Un nom par colonne (à la
`NOT_DELETED`) ne convenait pas : quatre colonnes différentes dans quatre modules, l'invariant est
commun, pas la colonne.

**Pourquoi la lecture et non l'écriture, cette fois** : ajouter `bannedAt: null` aux neuf créateurs —
le geste exact du cycle 58 — n'aurait rien réparé pour les participants anonymes DÉJÀ en base, c'est-
à-dire pour tous ceux dont l'accès est cassé. Une discipline d'écriture répare l'avenir ; un prédicat
défensif répare le passé. Le cycle 58 pouvait choisir l'écriture parce que ses lignes fautives
étaient rares et rejouables ; ici, elles sont la population.

## Plan
- [x] T1 — bootstrap (leçon 102b) : `bun install --ignore-scripts`, `prisma generate`, build shared
- [x] T2 — reformuler la question du backlog, puis balayer les `where` sous la bonne question
- [x] T3 — vérifier créateur par créateur que la colonne n'est écrite par personne (9 pour `Participant`, 2 pour chaque modèle de jeton)
- [x] T4 — double Prisma qui HONORE « absent ≠ null » (`__tests__/helpers/mongo-where.ts`)
- [x] T5 — RED : 4 témoins de comportement, un par site
- [x] T6 — GREEN : `unsetOrNull`, étalé par les quatre sites
- [x] T7 — 3 témoins pré-existants qui ÉPINGLAIENT la clause fautive, réécrits en comportement
- [x] T8 — sondes de fidélité en sept temps
- [x] T9 — gates : suite gateway complète, `tsc --noEmit`
- [x] T10 — changeset + ADR + ce relevé + leçon

## Vérification

**Rouge observé avant correctif** : 4 témoins, un par site, tous sur un document dont la colonne est
absente. Chacun a échoué pour la bonne raison — la lecture ne rend rien / la clause n'apparie pas la
ligne fraîche.

**Sondes de fidélité** — chaque défaut réintroduit, restauration par copie (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| `canAccessConversation` remis à `bannedAt: null` | 1 (le sien) |
| `revokeExistingTokens` remis à `usedAt: null` | 1 (le sien) |
| magic-link remis à `usedAt: null` | 2 — il y avait DEUX copies du témoin de forme |
| balayage des jetons remis à `usedAt: null` | 1 (le sien) |
| rattachement des liens remis à `messageId: null` | 1 (le sien) |
| `unsetOrNull` vidé en `{}` | **8**, dont « refuse un banni resté actif » |
| branche `null` retirée du prédicat | **3**, dont « admet un débanni » |

Les deux dernières sondes sont celles qui apprennent quelque chose. Vider le prédicat ne produit pas
seulement des échecs de forme : il fait tomber le refus d'un participant BANNI, donc un prédicat trop
permissif est attrapé comme une régression de sécurité et pas comme une faute de frappe. Et retirer
la branche `null` ne fait tomber que le débanni — le seul cas au monde que cette branche protège,
puisque `resolveUnbanWrite` est le seul à écrire un `null` explicite.

**Gate** : suite gateway complète **646 suites / 16 300 tests, 0 échec** (baseline du cycle 58 :
643 / 16 273 sur un `main` antérieur ; +1 suite de ce cycle, +2 amont). `tsc --noEmit` : 0 erreur —
et il a servi : la première forme du prédicat rendait un tuple `readonly` que
`ParticipantWhereInput` refuse, ce qu'aucun test n'aurait vu.

## Reste ouvert après ce cycle

- **`MaintenanceService.cleanupOrphanedAttachments` porte le MÊME défaut et n'a PAS été corrigé.**
  Son `messageId: null` sur `MessageAttachment` n'apparie rien (le chemin TUS crée la ligne sans la
  colonne), donc la passe n'a jamais rien supprimé. La réparer est une ligne — et arme un effacement
  irréversible de fichiers et de lignes sur des données que ce conteneur ne connaît pas. C'est
  exactement la leçon 90.4 (« réparer une chose morte peut en éteindre une vivante ») : le préalable
  est un essai à blanc contre la base de production, hors de portée de cette routine. Le liage
  légitime (`associateAttachmentsToMessage`) filtre par `id`, lui, donc il fonctionne — les lignes
  visées sont bien des orphelines. **Candidat pour un cycle avec accès base, jamais pour un cycle
  aveugle.**
- **Aucune attribution rétroactive.** Les `TrackingLink` et les jetons déjà écrits gardent leur
  colonne absente ; les nouvelles lectures les apparient, mais rien ne remplit le passé.
- **Les ~12 copies inline correctes de l'idiome** (`leftAt`, `expiresAt`, `parentId`, `mutedAt`,
  `invalidatedAt`) n'ont pas été migrées vers `unsetOrNull`. Volontaire : elles fonctionnent, et
  certaines vivent dans un `where` portant DÉJÀ un `OR`, où un spread écraserait l'existant. Le
  spread silencieux est le seul piège de cet utilitaire, et son en-tête le dit.
- **`updateTrackingLinksMessageId` (le binder du chemin de PARTAGE) écrase sans aucune garde** —
  ni `conversationId`, ni `messageId` déjà pris. Le défaut est documenté dans
  `messageRemovalEffects.ts` comme un fait admis ; ce cycle n'y touche pas, mais maintenant que le
  binder du chemin d'ENVOI écrit vraiment, les deux se disputent la colonne pour de bon.
- **La sémantique `absent` vs `null` n'a pas été vérifiée contre une vraie base** (aucun MongoDB
  joignable, pas de démon Docker). Elle repose sur trois post-mortems de production internes
  (`postIncludes.ts`, `CallService.initiateCall`, cycle 54) et sur les cycles 57-58. **Le correctif
  est juste sous les DEUX sémantiques** : la forme `OR` apparie l'absent ET le nul. Ce qui reste
  incertain est l'ampleur du défaut, pas la validité de sa réparation.
- Hérités et non traités : le prédicat défensif sur les 119 lectures de `Message.deletedAt` (écarté
  ci-dessus, avec sa raison) ; les messages d'appel écrits avant le cycle 58 restent invisibles ;
  `post_comment`/`comment_like` gardent leur asymétrie de forme sans conséquence ;
  `softDeleteRetentionMs` reste du code mort documenté ; iOS et Android ne lisent pas
  `deletedCommentIds` ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ;
  `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).

# Cycle 58 — Les messages d'appel n'étaient pas des messages

Une session sœur a livré le cycle 57 en parallèle (« le budget d'une vue unique se dépense par
spectateur »). Aucun recouvrement : son lot touche `recordViewOnceConsumption` et la route des
messages, le mien les sept `message.create` et `CallService`. Les deux ne se croisent que dans les
trois fichiers de suivi, fusionnés à la main en gardant les deux relevés. Ce cycle est donc
renuméroté 58 — son numéro d'origine était 57.

Le backlog du cycle 56 portait quatre têtes. Trois ont été instruites et écartées avant d'écrire une
ligne, ce qui est le vrai résultat de la première moitié de ce cycle :

- **« `post_comment` et `comment_like` n'exposent pas `context.commentId` »** — vrai au mot près, et
  sans conséquence. Les TROIS consommateurs replient déjà sur `metadata.commentId` : le web
  (`notification-helpers.ts:194`), le SDK iOS (`MessageSocketManager.swift:969` et
  `SocketNotificationEvent+Persistence.swift:34`) et le payload push lui-même
  (`NotificationService.ts`, clé `commentId` du bloc `data`). Corriger l'asymétrie ne changerait
  rien pour personne. Retiré du backlog comme défaut — c'est une inélégance de forme.
- **« `softDeleteRetentionMs` est du code mort »** — vrai, et déjà entièrement documenté dans
  l'en-tête de sa propre classe, qui explique que les deux bornes valant sept jours, le champ ne
  décrit plus le comportement. Le retirer est un nettoyage, pas un cycle.
- **« le nom `ExpiredStoriesCleanupService` ment sur son périmètre »** — vrai, et l'en-tête dit
  explicitement pourquoi il reste : il est cité par des plans et des analyses archivés que réécrire
  fausserait. Décision déjà prise, pas une dette.

L'item retenu ne venait pas du backlog. Il est sorti d'une question posée à `/sync` — « qu'est-ce
qui garantit que le flux `changed` apparie quelque chose ? » — dont la réponse a mené un étage plus
haut, chez les écrivains.

## Le défaut

Les deux modèles à soft-delete de ce dépôt ont résolu le MÊME piège MongoDB par deux moitiés
opposées, et c'est cette asymétrie qui a fabriqué le défaut.

`Post` l'a résolu côté LECTURE : un post vivant n'a pas de colonne `deletedAt`, et toutes ses
requêtes apparient l'absence (`NOT_DELETED` = `{ isSet: false }`). `Message` l'a résolu côté
ÉCRITURE : ses ~119 lectures filtrent `deletedAt: null`, et c'est chaque créateur qui rend ce filtre
vrai en écrivant la colonne à `null`.

La convention côté message marche, et n'était portée par aucun nom. Sept `message.create` répartis
dans six fichiers répétaient le littéral. **Deux l'avaient perdu** — `createCallSummaryMessage` et
`createLiveCallMessage`.

## Ce que ça faisait à l'écran

Un message d'appel n'était pas un message pour les lectures gardées par ce filtre :

| Lecture | Ce qui manquait |
|---|---|
| `emitConversationPreviewUpdate` | « Appel audio en cours » ne devenait jamais l'aperçu ; la liste affichait le message d'avant |
| `MessageReadStatusService` (3 sites) | un « Appel manqué » ne faisait monter aucun badge de non-lus |
| delta `/sync` | les messages d'appel n'étaient jamais livrés à la synchro incrémentale |
| `MessageHandler` (édition, suppression, réaction) | `{ id, deletedAt: null }` ne les trouvait pas — non réactionnables |
| `ConversationMessageStatsService`, `ConversationStatsService` | non comptés |

Le produit avait investi un cycle entier dans les messages d'appel riches
(`tasks/2026-06-07-rich-call-system-messages.md`) ; ils entraient en base par une porte que le reste
du gateway ne regarde pas.

## Plan
- [x] T1 — bootstrap d'environnement (leçon 102) : conteneur neuf, `bun install`, `prisma generate`, `bun run build`
- [x] T2 — enquête : trois pistes du backlog instruites et écartées sur lecture des consommateurs
- [x] T3 — RED : 2 témoins, un par créateur fautif, rouges pour la bonne raison
- [x] T4 — GREEN : `LIVE_MESSAGE_MARK`, source unique étalée par les SEPT créateurs
- [x] T5 — sondes de fidélité : trois défauts réintroduits un par un
- [x] T6 — témoin de source, ajouté en RÉPONSE à ce que la 3e sonde a révélé
- [x] T7 — gates : suite gateway complète, `tsc --noEmit`
- [x] T8 — changeset + ADR + ce relevé + leçons

## Vérification

**Rouge observé avant correctif** : 2 témoins, un par créateur, sur `hasOwnProperty('deletedAt')`
— l'assertion doit distinguer ABSENT de `null`, ce que `toMatchObject` ne fait pas de façon lisible.

**Sondes de fidélité** — chaque défaut réintroduit, restauration par copie (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| marqueur retiré du résumé d'appel | 1 (le sien ; le jumeau reste vert) |
| marqueur retiré du message vivant | 1 (le sien ; symétrique) |
| constante vidée en `{}` | 2, et RIEN d'autre sur 45 suites voisines |

La troisième sonde est celle qui a appris quelque chose, et elle a changé le correctif : vider
l'invariant ne fait tomber aucun témoin PRÉ-EXISTANT, sur aucun des sept chemins. Les cinq créateurs
qui portaient le littéral depuis toujours n'avaient aucune couverture dessus — c'est exactement
ainsi que les deux autres ont pu le perdre en silence. Le témoin de source (`liveMessage.test.ts`)
a été écrit en réponse à ce constat, pas prévu au plan.

**Gate** : suite gateway complète **643 suites / 16 273 tests, 0 échec, 0 suite rouge**
(baseline leçon 102 : 640 / 16 261 sur un `main` antérieur). `tsc --noEmit` : 0 erreur.

## Reste ouvert après ce cycle

- **Les messages d'appel déjà écrits sans la colonne restent invisibles de ces lectures.** Réparables
  par un `updateMany` sur `messageSource: 'system'` + `clientMessageId` préfixé `call-summary:`
  dont la colonne est absente, sur le patron de `repair-mention-user-ids.ts`. Action humaine — cette
  routine n'a aucun accès MongoDB.
- **Rien n'empêche MÉCANIQUEMENT un huitième créateur d'omettre le marqueur.** Le prédicat défensif
  `OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]` — l'idiome que ce dépôt emploie déjà
  pour `leftAt`, `expiresAt`, `parentId`, `mutedAt`, `invalidatedAt` — rendrait les lectures
  indifférentes à la discipline des écrivains. C'est la solution de fond, sur 119 sites : un cycle
  à elle seule, et la constante nommée de ce cycle en est le préalable (l'invariant est désormais
  greppable). **Candidat sérieux pour le prochain cycle.**
- **La sémantique `null` vs absent n'a pas été vérifiée contre une vraie base dans ce cycle.** Aucun
  MongoDB n'est joignable depuis ce conteneur (pas de démon Docker). Elle repose sur le post-mortem
  de `postIncludes.ts`, sur sa reconfirmation par le cycle 54, et sur le fait que six créateurs sur
  sept écrivent la colonne — un geste sans objet si le filtre appariait l'absence. **Le correctif est
  juste sous les DEUX sémantiques** : écrire `deletedAt: null` apparie `deletedAt: null` dans tous
  les cas. Ce qui reste incertain est l'ampleur du défaut d'origine, pas la validité de sa réparation.
- Hérités et non traités : `post_comment`/`comment_like` gardent leur asymétrie de forme (sans
  conséquence, cf. ci-dessus) ; `softDeleteRetentionMs` reste du code mort documenté ; le push
  APNs/FCM déjà délivré n'est pas rappelé ; iOS et Android ne lisent pas encore `deletedCommentIds`
  (cycle 56) ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne
  peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).
# Cycle 57 — Le budget d'une vue unique se dépensait par ouverture, pas par spectateur

Le backlog du cycle 56 laissait six items ouverts. Aucun n'a été pris : trois relèvent d'une
plateforme que cet environnement ne compile pas, un attend une validation humaine, un est un
outillage cassé (`eslint` sur le gateway), et le dernier — « `post_comment` et `comment_like`
n'exposent pas `context.commentId` » — s'est **réfuté à la lecture**. Le retrait des notifications
de commentaire couvre déjà les deux chemins JSON par un `$or`, son en-tête explique pourquoi, et
aucun client ne lit `context.commentId` : uniformiser les huit producteurs changerait un contrat
sans corriger aucun défaut observable. C'est la leçon 89 appliquée AVANT d'écrire, pour une fois.

Le cycle est donc parti d'un audit du contrat temps-réel plutôt que d'une piste héritée : les 175
constantes de `socketio-events.ts` confrontées à leurs émetteurs (gateway) et à leurs auditeurs
(web, iOS). L'audit a rendu surtout de l'hygiène — trois `*_SYNC` déclarés que personne n'émet,
un `socket.on(REACTION_SYNC)` mort côté web, `MESSAGE_READ_STATUS_UPDATED` émis en doublon de
`READ_STATUS_UPDATED`. Mais il a mené à la route `consume`, et c'est là que le défaut était.

## Le défaut

`POST /conversations/:id/messages/:messageId/consume` incrémentait `Message.viewOnceCount` par un
`update` **inconditionnel**. Le compteur mesurait donc des OUVERTURES. Tous ses lecteurs le lisent
comme un nombre de SPECTATEURS : `isFullyConsumed`, l'annonce `message:consumed` diffusée à la
room, la disparition du média chez les clients.

Dans un groupe où l'émetteur a posé `maxViewOnceCount: 2`, le premier destinataire qui rouvre la
photo une seconde fois porte `isFullyConsumed` à vrai. La route l'ANNONCE à toute la conversation.
Le second destinataire perd un média qu'il n'a jamais ouvert. Et la route étant une mutation nue,
sans clé d'idempotence, un rejeu — file hors-ligne, double tap, retry réseau — suffit à produire
le même effet à lui seul.

**La donnée qui rend le compte exact était écrite par ce même gestionnaire, deux instructions plus
bas** : `MessageStatusEntry.viewedOnceAt`, par participant. Écrite, jamais relue.

Un corollaire, trouvé en suivant la même ligne : cette écriture cherchait le participant par
`userId`. Un anonyme porte un jeton de session dans `authContext.userId` — la ligne n'était jamais
trouvée. Il dépensait donc le budget **sans qu'aucune trace n'enregistre qu'il l'avait fait**, et
pouvait le dépenser indéfiniment.

## Plan
- [x] T1 — audit : contrat d'événements gateway/web/iOS, piste héritée réfutée, défaut localisé
- [x] T2 — RED : 8 témoins de module + 5 de route, rouges pour la bonne raison
- [x] T3 — GREEN : la revendication gardée, l'incrément n'en est que la conséquence
- [x] T4 — câblage : résolution du spectateur, annonce conditionnée, `ROOMS`/`SERVER_EVENTS`
- [x] T5 — sondes de fidélité : cinq défauts réintroduits un par un, restauration par copie
- [x] T6 — gates : baseline mesurée sur arbre propre, suite complète, `tsc`
- [x] T7 — changeset + ADR + ce relevé + leçon

## Vérification

**Baseline mesurée, pas mémorisée** (leçon 90 #6) : arbre propre via `git stash`, suite gateway
complète → **642 suites / 16 269 tests, 0 échec**. Après le lot : **644 / 16 282, 0 échec** —
+2 suites, +13 témoins, aucune régression. `tsc --noEmit` : **0 erreur**.

**Rouge observé avant correctif** : les 5 témoins de route tombent sur le corps d'origine, et le
témoin central reproduit le défaut utilisateur littéralement —

```
- "isFullyConsumed": false,   - "viewOnceCount": 1,
+ "isFullyConsumed": true,    + "viewOnceCount": 2,
```

deux ouvertures du même destinataire, sur un budget de deux, et le pair est dépossédé.

**Sondes de fidélité** — chaque défaut réintroduit volontairement, restauration par **copie**
(leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| incrément inconditionnel (le défaut d'origine) | 2 (seconde ouverture + création concurrente perdante) |
| prédicat réduit à `{ viewedOnceAt: null }` | 1 (la colonne absente) |
| toute panne d'écriture lue comme « déjà vu » | 1 (la panne remonte) |
| création retirée quand l'entrée manque | 2 (spectateur sans entrée + la panne) |
| corps de route d'origine restauré | 4 sur 5 |

Aucune sonde n'a fait tomber un témoin qu'elle ne visait pas, et aucune n'a laissé tout vert. Le
survivant de la dernière sonde est le **verrou du chemin nominal** — vert avant ET après, c'est
exactement son rôle : interdire au correctif de rétrécir le cas courant.

**Le double Prisma HONORE le filtre** (leçon 90 #5) : une entrée déjà estampillée n'est plus
appariée par l'`updateMany`, et une création en double lève P2002. Un double qui aurait rendu la
même ligne quelle que soit la question aurait laissé le témoin central vert sur un correctif
absent — c'est précisément la configuration qui avait fait passer le balayage éphémère pour vivant
pendant trois cycles.

**Deux témoins pré-existants mis à jour, pas affaiblis.** `messages-routes.test.ts` portait deux
cas de couverture de branche nommés d'après des numéros de ligne, qui épinglaient
`viewParticipant = null` comme un chemin de **succès** — c'est-à-dire le corollaire anonyme
lui-même, figé en contrat. Leur intention est conservée (« l'arithmétique de repli des colonnes
nullables », « aucune entrée de statut n'est écrite ») et le second est ÉTENDU : le budget ne se
dépense pas davantage. Un témoin nommé d'après une ligne de code mesure l'implémentation ; celui-ci
mesure maintenant un comportement.

## Reste ouvert après ce cycle

- **Le serveur ne redacte pas le contenu d'un message à vue unique épuisé.** L'application de la
  règle est entièrement côté client et le compteur reste consultatif : un client modifié lit le
  contenu après `isFullyConsumed`. C'est une décision de conception (chiffrement, cache, pièces
  jointes déjà téléchargées), pas un oubli — relevé pour mémoire.
- **Rien ne rattrape les `viewOnceCount` déjà gonflés en base** par l'ancien chemin. Un script de
  réparation les recalculerait depuis `MessageStatusEntry.viewedOnceAt`, qui porte la vérité par
  participant. Action humaine : cette routine n'a aucun accès MongoDB.
- **Hygiène du contrat d'événements, trouvée par l'audit et non traitée** : `REACTION_SYNC`,
  `COMMENT_REACTION_SYNC` et `POST_REACTION_SYNC` sont déclarés dans `socketio-events.ts` et émis
  par personne — les trois synchronisations répondent par ACK, ce que le SDK iOS documente
  explicitement à ses deux sites. Le web porte en face un `socket.on(SERVER_EVENTS.REACTION_SYNC)`
  qui ne se déclenchera jamais, et qui pousserait de surcroît un payload de synchronisation dans
  ses auditeurs de `reaction:added`. Trois constantes et un auditeur à retirer.
- **`MESSAGE_READ_STATUS_UPDATED` est émis en doublon de `READ_STATUS_UPDATED`** sur les cinq sites
  de diffusion des accusés de lecture, et aucun client n'écoute le premier. Un alias qui double le
  trafic de la famille d'événements la plus fréquente après `message:new`.
- **`onMessageConsumed` n'a aucun consommateur applicatif côté web** : la couche socket l'expose,
  aucun cache React Query ne s'y abonne. Un média épuisé par un pair ne change donc rien à l'écran
  d'un utilisateur web avant rechargement.
- Hérités et non traités : `softDeleteRetentionMs` reste du code mort et le nom
  `ExpiredStoriesCleanupService` ment sur son périmètre ; le push APNs/FCM déjà délivré n'est pas
  rappelé ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne
  peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9) ; iOS et Android ne
  lisent pas encore `deletedCommentIds`.

---

# Cycle 56 — La suppression emportait le fil sans jamais le dire

Le backlog du cycle 54 portait sa tête ailleurs : « les `TrackingLink` d'une story détruite ne sont
toujours pas désactivés ». Elle est juste — et elle était **déjà prise** : la PR #2761, ouverte par
une session sœur vingt minutes avant ce cycle, la traitait ; elle a fusionné pendant celui-ci et
porte le numéro 55. Prendre l'item suivant de la même liste plutôt que le doubler. Celui-ci y
figurait sous le nom hérité du cycle 52 : « `broadcastCommentDeleted` n'annonce que la cible et pas
le sous-arbre ».

## Ce que la piste héritée disait, et ce qu'elle ne disait pas

Elle est confirmée telle quelle — chose rare. Mais son énoncé la fait passer pour un défaut de
broadcast, et elle ne l'est pas : **le broadcast n'a jamais eu la liste**. Elle mourait un étage plus
bas.

`PostCommentService.deleteComment` soft-delete le sous-arbre ENTIER depuis le cycle qui a corrigé
l'invariant de `commentCount` — cible + descendants, profondeur arbitraire, une seule liste d'ids
qui sert aussi au décompte et au retrait des notifications. Sa valeur de retour : `{ success: true }`.
La liste ne sortait pas de la méthode. Son seul appelant n'avait donc rien d'autre à annoncer que le
`commentId` qu'il tenait déjà de son propre chemin d'URL.

## Ce que ça faisait à l'écran

Chez tout client qui avait déplié les réponses, elles restaient affichées. Le serveur venait de les
retirer.

**Et rien ne les enlevait jamais.** `getComments` filtre `parentId: null` : le parent supprimé n'est
plus rendu, donc `getReplies` n'est plus jamais appelé pour ses réponses. Ni le refetch, ni
l'invalidation, ni un aller-retour sur le post ne les faisaient disparaître — seulement un
rechargement complet de la page.

Le compteur, lui, était juste depuis le début : `commentCount` voyage en ABSOLU. L'écran affichait
donc « 1 commentaire » au-dessus de trois lignes visibles, et c'est cette contradiction-là que
l'utilisateur voyait, pas l'absence d'un id dans un payload.

## Plan
- [x] T1 — enquête : piste héritée confirmée, mais l'étage fautif n'est pas celui qu'elle nomme
- [x] T2 — RED : 5 témoins (3 service, 2 route) + 2 web, tous rouges pour la bonne raison
- [x] T3 — GREEN : la liste remonte, la route l'annonce, le web en purge ses caches
- [x] T4 — source unique : liste calculée UNE fois, partagée par soft-delete/décompte/retrait/annonce
- [x] T5 — sondes de fidélité : trois défauts réintroduits un par un
- [x] T6 — gates : suites gateway + web, `tsc` sur les trois paquets touchés
- [x] T7 — changeset + ADR + ce relevé + leçon

## Vérification

**Rouge observé avant correctif** : 5 témoins gateway (les 3 du service sur `deletedCommentIds`
absent, les 2 de la route sur le payload sans la liste) + 1 web (les réponses orphelines survivent
en cache — le défaut utilisateur reproduit tel quel). Le 2e témoin web (repli sans liste) passait
déjà : il verrouille le comportement d'AVANT, qui doit survivre au correctif.

**Sondes de fidélité** — chaque défaut réintroduit volontairement, restauration par **copie**
(leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| le service ne rend que `[commentId]` | 2 (sous-arbre profond + égalité avec la liste soft-deletée) |
| repli de la route `?? [commentId]` → `?? []` | 1 (le rejeu) |
| le web ignore `deletedCommentIds` | 1 (les réponses orphelines) |

Aucune sonde n'a fait tomber un témoin qu'elle ne visait pas, et aucune n'a laissé tout vert.
Le témoin « cible seule sur une feuille » reste vert sous la 1ère sonde — c'est correct : sur une
feuille, `[commentId]` EST la bonne réponse. Un témoin qui serait tombé là aurait mesuré
l'implémentation, pas le comportement.

**Suites** : gateway `(omment|SocialEvents|posts)` → 92 suites / 1862 tests verts ; web
`__tests__/hooks/{queries,social}` → 24 suites / 529 verts ; web `__tests__/components` → 201 suites
/ 4155 verts. `tsc --noEmit` : **0 erreur** sur gateway, 0 sur shared, aucune sur le fichier web
touché.

**Deux témoins pré-existants mis à jour, pas affaiblis** : `PostCommentService.test.ts` et
`PostService.test.ts` asseyaient `toEqual({ success: true })` — une égalité EXACTE que le champ
ajouté casse mécaniquement. Passés à `expect.objectContaining({ success: true })` : leur intention
(« la suppression reste réussie même si le retrait des notifications échoue », « le décompte est
juste ») est intacte, et ils ne prétendent plus verrouiller la forme complète du retour, ce qu'ils
ne cherchaient pas à faire.

## Reste ouvert après ce cycle

- **iOS et Android ne lisent pas encore `deletedCommentIds`, et n'en souffraient pas** — vérifié en
  lisant leur code plutôt qu'en le supposant (la première rédaction de ce relevé affirmait
  l'inverse). iOS `PostDetailViewModel` fait `repliesMap[id] = nil` + `expandedThreads.remove(id)`
  sur chaque `comment:deleted` ; Android `PostCommentsViewModel.onCommentDeleted` appelle
  `CommentRepliesState.removedThread(commentId)`. **Le web était le seul client sans cette
  compensation** — le défaut n'était donc pas « le serveur se tait » tout court, mais « le serveur
  se tait, et deux clients sur trois ont chacun payé une traversée locale pour compenser ». C'est
  cette duplication-là que `deletedCommentIds` rend caduque : les deux traversées peuvent céder la
  place à un retrait autoritatif, un cycle par plateforme (cet environnement ne compile ni Swift ni
  Kotlin — leçon 88c), avec leur propre gate.
- **Le rejeu idempotent annonce toujours la seule cible.** `onDuplicate` ne rend qu'un `{ id }` et
  le sous-arbre n'est plus reconstructible par une lecture vivante. Le repli reproduit exactement
  l'existant ; le faire mieux demanderait de stocker la liste dans la `MutationLog`, ce qui est une
  décision de conception sur le journal, pas sur la suppression.
- Hérités et non traités ce cycle : `softDeleteRetentionMs` reste du code mort (le champ est assigné
  et journalisé, `cleanup()` ne le lit pas) ; le nom `ExpiredStoriesCleanupService` ment sur son
  périmètre ; `post_comment` et `comment_like` n'exposent pas `context.commentId` ; le push APNs/FCM
  déjà délivré n'est pas rappelé ; l'arbitrage `delete-for-me` du cycle 12 attend une validation
  humaine ; `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 55 — Le lien de partage survivait à la story qu'il partageait

Les deux ADR du gateway se terminent, l'une et l'autre, par la même réserve : « les `TrackingLink`
visant une story détruite ne sont pas désactivés par cette passe ». Portée en backlog depuis le
cycle 53, elle a cessé d'être théorique au cycle 54 : celui-ci a rendu le balayage effectif pour la
première fois, donc toute story finit désormais par être détruite, donc tout lien de partage de
story finissait par pointer sur une ligne qui n'existe plus.

## Le défaut

Le retrait interactif d'un post — l'app comme la console — coupe ses `/l/<token>` depuis trois
cycles. C'est le troisième effet de `applyPostRemovalEffects`, et son commentaire dit exactement
pourquoi : « le soft-delete ne bascule que `deletedAt`, le `onDelete: Cascade` ne se déclenche
jamais, les `/l/<token>` qui visent ce post resteraient donc opérationnels ». Le balayage du contenu
éphémère est l'AUTRE chemin qui rend un post inatteignable, et le SEUL qui le DÉTRUISE. Il ne
coupait rien.

Et rien ne pouvait le rattraper après coup : `TrackingLink.targetId` n'a ni relation ni cascade vers
`Post` — le champ est polymorphe, il porte indifféremment un `postId`, un `conversationId` ou un
`userId`, et le schéma l'écrit. La ligne `Post` détruite, plus aucun chemin du gateway ne sait
relier le lien à sa cible disparue. Le lien survivait `isActive: true`, pour toujours :
`/l/:token` comptait son clic, incrémentait `totalClicks`, écrivait un `TrackingLinkClick`, puis
redirigeait vers une page morte. `resolveTarget` rendait `isActive: true` avec un `targetId` que
plus rien ne résout, et la page web comme le `DeepLinkRouter` iOS ouvraient un post inexistant.

Le même contenu retiré à la main répondait, lui, 410 `LINK_INACTIVE`. **Un objet, deux fins de vie
selon le chemin de retrait — et la plus fréquente des deux, l'expiration que TOUTE story atteint,
était la mauvaise.**

## Réfutation du remède avant de l'écrire (leçon 94)

Trois cas cherchés nommément, chacun capable de rendre le correctif faux :

1. **Un lecteur légitime d'un lien actif vers un post détruit.** Aucun : `getPostById` est gardé par
   `NOT_DELETED`, et le tableau de bord du partageur lit les statistiques, pas la cible.
2. **Un `targetId` qui désignerait autre chose qu'un post.** Le champ est polymorphe, mais les
   ObjectId ne se confondent pas d'une collection à l'autre — et le retrait interactif filtre déjà
   sur `targetId` seul, sans `targetType`, depuis trois cycles. S'aligner sur lui, et non inventer
   un filtre plus étroit que celui de la règle qu'on extrait.
3. **Une désactivation qui emporterait des données.** Elle en emporterait si elle SUPPRIMAIT : les
   `TrackingLinkClick` référencent le lien sans cascade déclarée. D'où le geste retenu — désactiver,
   comme le fait déjà le retrait interactif.

## L'instant retenu, et celui qui ne l'a pas été

Le post devient inatteignable au SOFT-delete (`getPostById` est gardé par `NOT_DELETED`), pas au
hard-delete. C'est donc l'instant théoriquement juste, et c'est celui du retrait interactif — qui
n'a d'ailleurs pas le choix : un post non éphémère n'est JAMAIS hard-deleté, il reste soft-deleté
pour toujours. Les deux chemins agissent en fait au même endroit logique : **le moment où leur
contenu devient définitivement inatteignable par leur propre chemin.**

Ancrer dans la passe de hard-delete a été retenu pour une raison de coût, notée honnêtement : la
passe de soft-delete est un `updateMany` qui ne matérialise aucun id. Lui en faire produire
demanderait de la convertir en `findMany` + `updateMany`, donc de la BORNER — un `$in` de tout le
passif n'est pas une requête à émettre (leçon 89.5 : un plafond change de sens quand l'entrée change
de nature) — donc de réécrire les témoins que le cycle 54 vient de construire autour de la forme
actuelle. Le gain réel se mesure : les deux bornes valant sept jours depuis `expiresAt`, un post
devient éligible aux deux au même instant et la fenêtre résiduelle est d'une passe en régime
permanent. Elle s'allonge pendant un rattrapage de passif — c'est la réserve de ce cycle.

## Plan
- [x] T1 — enquête : réserve héritée confirmée par diff avec le jumeau (leçon 95), impact tracé
      jusqu'aux deux clients (route `/l/:token` ET `resolveTarget`)
- [x] T2 — réfutation du remède avant écriture : trois cas cherchés, aucun ne tient
- [x] T3 — RED : 8 témoins, 3 rouges + 1 suite qui ne résout pas son module
- [x] T4 — GREEN : module de règle unique, câblé aux deux chemins
- [x] T5 — sondes de fidélité : cinq défauts réintroduits un par un, restauration par COPIE
- [x] T6 — gates : suite gateway complète, comparée à une BASELINE mesurée sur arbre propre
- [x] T7 — changeset + ADR + ce relevé + leçon

## Vérification

Rouge observé avant correctif : 3 témoins sur 8 tombent, plus la suite du module neuf qui ne résout
pas son import.

**Sondes de fidélité** — chaque témoin re-vérifié en réintroduisant son défaut, restauration par
**copie** et non par `git checkout` (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| appel retiré du balayage | 3 |
| `ids` au lieu de `allPostIds` (reposts oubliés) | 1 |
| erreur avalée par un `try/catch` | 1 |
| désactivation placée APRÈS les suppressions | 2 |
| garde de liste vide retirée du module | 1 |

Le témoin « rien à détruire ⇒ aucune requête sur les liens » est **double-gardé** (garde externe
`toDelete.length > 0` ET garde du module) et ne discrimine donc aucune des deux prise isolément —
la sonde 5 fait tomber le témoin du module, pas celui-ci. Il pinne le contrat de bout en bout et son
en-tête le dit, sur le patron de la note équivalente de la suite des sons. Ne pas le prendre pour
un témoin fort.

**Baseline mesurée, pas mémorisée** (leçon 90.6). Une première baseline a été lancée en tâche de
fond pendant que le correctif s'écrivait : elle est ressortie à 21 suites rouges dont
`postRemovalEffects` — c'est-à-dire qu'elle avait lu un arbre déjà modifié. **Jetée.** Le travail a
été commité d'abord (rien à perdre), puis la baseline relancée sur `HEAD~1` en tête détachée, arbre
réellement propre :

- **Avant** : 20 suites en échec, 620 vertes, 640 au total, **15 799 tests, 0 échec de test**.
- **Après** : **mêmes 20 suites**, 622 vertes, 642 au total, 15 807 tests — les deux suites neuves
  et leurs 8 témoins.
- **`diff` des LISTES de suites en échec : identiques.** Aucune régression, et la preuve ne repose
  pas sur une parole.

Les 20 suites rouges sont la condition pré-existante notée au cycle 54 (`PostReactionService.ts:354`,
`groupBy` non typé par le client Prisma généré dans cet environnement) : 0 test en échec, 20 suites
qui ne compilent pas.

`tsc --noEmit` : 362 lignes, identiques avant et après ; les deux seules erreurs sur des fichiers
touchés sont le bruit de résolution `@meeshy/shared/prisma/client` en ligne 1, présent à
l'identique sur des fichiers jamais touchés. Le module neuf n'en produit aucune — il ne dépend pas
du client Prisma généré, seulement de la surface qu'il déclare.

**Ce que la CI a trouvé et que la baseline locale ne pouvait pas voir.** Un TROISIÈME témoin pinnait
la forme scalaire du filtre : `posts-share-tracking.test.ts:222`. Il fait partie des 20 suites qui ne
COMPILENT pas dans cet environnement — une suite qui ne démarre pas ne peut faire tomber aucune
assertion. La comparaison « mêmes 20 suites avant/après » prouvait l'absence de régression parmi les
suites qui TOURNENT, et rien du tout sur les 20 autres, soit ~3 % du dépôt. Corrigé au même titre
que les deux premiers ; leçon 100. **Le geste juste, pour tout changement de FORME d'un appel, est
un `grep` sur la forme — pas la liste des tests qui rougissent, qui en est un sous-ensemble dont le
complément est exactement invisible.**

**Une observation fabriquée, écrite puis retirée.** Une étape de CI vue « en cours » à trois
sondages d'intervalle a été déclarée bloquée depuis 50 min ; un correctif de CI (borner le job
`quality`, sans `timeout-minutes` alors que tout le pipeline l'attend) a été écrit sur cette base,
puis retiré avant merge. L'étape avait duré **93 secondes** : les sondages se suivaient sans qu'une
seule seconde réelle s'écoule entre eux. Le manque de borne sur `quality` est réel et reste au
backlog ci-dessous — mais il se justifiera par le défaut lui-même, pas par un incident inventé.

## Reste ouvert après ce cycle

- **Les 20 suites rouges de cet environnement sont un angle mort mesurable, pas un décor.** Elles ne
  compilent pas (`PostReactionService.ts:354`, `groupBy` non typé par le client Prisma généré ici) et
  ne peuvent donc contredire aucun cycle — c'est ce qui a laissé passer le troisième témoin de ce
  cycle. **Réparer cette compilation locale vaudrait plus qu'un cycle de correctif** ; en attendant,
  tout cycle touchant `PostService`/`PostReactionService` liste ses sites par `grep`.
- **Le job CI `quality` n'a aucun `timeout-minutes`** alors que `test`, `prisma` et `build`
  l'attendent tous par `needs: quality` : il hérite du défaut GitHub de 6 h, et une étape bloquée y
  gèlerait tout le pipeline. Ses deux étapes étant `continue-on-error`, une borne ne peut pas faire
  échouer une PR pour du bruit. Onze des douze jobs du fichier sont dans ce cas ; seul `test` est
  borné. Changement d'un mot par job, à faire dans sa propre PR.
- **La fenêtre soft-delete → hard-delete laisse les liens actifs sur un post déjà masqué.** Une
  passe en régime permanent, davantage pendant un rattrapage de passif. Se ferme en bornant la passe
  de soft-delete (`findMany` + `updateMany`), ce qui est aussi ce que réclamerait tout autre effet
  ancré sur le masquage — **candidat sérieux pour un prochain cycle, à faire d'un bloc plutôt que
  deux fois à moitié.**
- **Les liens des posts détruits AVANT ce correctif restent `isActive: true` en base**, sans cible
  et sans chemin pour les retrouver — leur `targetId` désigne des ObjectId qui n'existent plus. Un
  script les détecterait par absence de cible, sur le patron de `repair-mention-user-ids.ts`. Action
  humaine : cette routine n'a aucun accès MongoDB.
- **`softDeleteRetentionMs` reste du code mort** (hérité du cycle 54) : assigné et journalisé, jamais
  lu par `cleanup()`. Le corriger, c'est choisir entre supprimer le champ et ré-ancrer la seconde
  passe — décision de conception à part entière, et elle se pose en même temps que la borne
  ci-dessus.
- **Le nom `ExpiredStoriesCleanupService` ment sur son périmètre** (hérité du cycle 54).
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  footgun mécanique, sans risque à fermer, en file depuis le cycle 26.
- **`post_comment` et `comment_like` n'exposent pas `context.commentId`** (hérité du cycle 52) —
  leur lien ne vit que dans `metadata.commentId`, et le payload APNs porte l'aveu écrit de
  l'asymétrie (`params.context.commentId || params.metadata.commentId`).
- Inchangés : `broadcastCommentDeleted` n'annonce que la cible et pas le sous-arbre (traverse le
  Swift que cet environnement ne compile pas) ; le push APNs/FCM déjà délivré n'est pas rappelé ;
  l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne peut pas
  tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 54 — Le balayage tournait toutes les heures et ne balayait rien

Le backlog du cycle 53 portait une tête bien formée : « les posts `STATUS` expirent et ne sont
balayés par rien ». Elle était juste. Mais en allant vérifier ce que le balayage faisait des
stories — le type qu'il connaît — il est apparu qu'il n'en faisait rien non plus. La tête du
backlog décrivait la moitié visible d'un défaut dont l'autre moitié était que **le balayage n'a
jamais rien balayé**.

## D1 — la passe de soft-delete n'appariait aucun post

Son filtre était `deletedAt: null`. Sur le connecteur MongoDB de Prisma, un filtre nul ne matche
QUE les documents où le champ est **présent-et-null** ; `post.create` n'écrit jamais cette colonne,
donc sur un post vivant elle est **ABSENTE**.

Ce n'est pas une déduction : le dépôt a déjà payé ce piège en production. `posts/softDelete.ts`
existe pour lui, et le commentaire de `postIncludes.ts` en donne le compte-rendu — « the naive
`null` filter then silently drops EVERY live post, which emptied the feed / reels / stories
endpoints in production (all posts returned `data: []` while the collection was full) ». Le cycle 53
lui-même a corrigé la même erreur sur `firstMessageSentAt`, en revue pré-merge, la veille.

Cette passe portait **le dernier `deletedAt: null` du modèle `Post`** — tous les autres sites lisent
`NOT_DELETED`. Du côté ÉCRITURE cette fois : au lieu de masquer tous les posts vivants d'une
lecture, il les excluait tous d'un balayage. `softDeleted` valait 0 à chaque heure. Et comme la
passe de hard-delete exige un `deletedAt` non nul, elle ne voyait que les stories supprimées **à la
main** — ni la purge des médias (G7), ni la libération des usages de sons, ni le retrait des
notifications (cycle 53) ne se sont jamais appliqués à une story périmée. Trois cycles de travail
branchés sur un chemin mort.

## D2 — un type éphémère sur deux

`type: 'STORY'`. Un `STATUS` expire en 1 h, disparaît bien des lectures à l'échéance
(`getStatuses`/`getDiscoverStatuses` filtrent `expiresAt > now`) et sa ligne vivait pour toujours.

La cause n'est pas l'oubli mais la **duplication** : celui qui POSE l'échéance (`PostService`) et
celui qui l'HONORE portaient chacun sa copie de la liste. Les deux dérivent désormais de
`posts/ephemeralPosts.ts`, et la liste des types est elle-même dérivée des clés de la table des
durées — un type éphémère ajouté là reçoit son échéance ET son balayage.

## D3 — la fournée n'était bornée par rien

Sans conséquence tant que D1 la gardait vide. Corrigée, la première passe affronte tout
l'historique. Or le retrait des notifications **rejette** à son plafond (40 000 lignes) et s'exécute
AVANT toute destruction : sans borne il aurait renoncé, rien n'aurait été détruit, et la passe
suivante aurait retrouvé le même ensemble. **Non pas lente — bloquée.** C'est exactement la leçon
89.5 du cycle précédent (« un plafond change de sens quand l'entrée change de nature »), rencontrée
cette fois par anticipation plutôt qu'en revue.

Fournée bornée à 500 posts, la plus anciennement périmée d'abord, réglable ; une fournée pleine est
journalisée — le signal que le cycle 53 notait comme manquant.

## D4 — réparer D1 éteignait une fonctionnalité livrée

Trouvé en écrivant les conséquences de D1, pas en le codant. `getStories` renvoie à un AUTEUR ses
propres stories périmées pendant **sept jours**, pour que « Mes stories » puisse les archiver — et
sa requête est gardée par `deletedAt: NOT_DELETED`. Un soft-delete posé à l'échéance aurait donc
vidé « Mes stories » au bout d'une heure. La fonctionnalité ne marchait que parce que D1 rendait la
passe inerte : **la réparer la cassait.**

Le balayage attend désormais la fin de la fenêtre d'archive avant de masquer — il est le lecteur
SUIVANT, pas le concurrent. La fenêtre est passée dans `ephemeralPosts.ts` et `PostFeedService`
l'en réexporte : deux copies dériveraient, et le jour où celle du feed s'allongerait, le balayage la
devancerait en silence.

## Plan
- [x] T1 — enquête : la tête du backlog confirmée (D2), puis le chemin lui-même trouvé mort (D1)
- [x] T2 — RED : 8 témoins sur D1/D2/D3, puis 2 de plus sur D4
- [x] T3 — GREEN : `NOT_DELETED`, table des types éphémères, fournée bornée, attente de l'archive
- [x] T4 — source unique : `PostService` et `PostFeedService` branchés sur `ephemeralPosts.ts`
- [x] T5 — sondes de fidélité : cinq défauts réintroduits un par un, plus une re-sonde
- [x] T6 — gates : suite gateway complète sous bun, comparée à une BASELINE sur arbre propre
- [x] T7 — changeset + ADR + ce relevé + leçon

## Vérification

Rouge observé avant correctif : 8 témoins sur 13 tombent (les 5 verts portent sur le module neuf).

**Sondes de fidélité** — chaque témoin re-vérifié en réintroduisant volontairement son défaut,
restauration par **copie** et non par `git checkout` (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| `deletedAt: NOT_DELETED` → `null` (D1) | 2 |
| type scalaire `'STORY'` au soft-delete (D2a) | 2 |
| type scalaire `'STORY'` au hard-delete (D2b) | 3 |
| borne de fournée retirée (D3) | 3 |
| `STATUS` retiré de la table des durées | 3 |

**Une sonde a trouvé un faux vert et l'a fait corriger.** À la première passe, la sonde D2b ne
faisait tomber que 2 témoins : le témoin de bout en bout restait VERT sur un balayage borné aux
stories, parce que son double Prisma rendait la même ligne quelle que soit la question posée. Il
mesurait la chaîne de destruction, jamais ce qui y entre. Double corrigé pour HONORER le filtre de
type ; la re-sonde fait bien tomber 3 témoins. C'est la leçon 2 (« le test passe » ≠ « le test
verrait la régression ») rencontrée sur un double qui simplifiait l'API qu'il simule.

**Baseline explicite plutôt que lecture d'un total.** L'environnement de cette routine porte une
erreur de typage pré-existante (`PostReactionService.ts:354`, `groupBy` non typé par le client
Prisma généré ici) qui empêche 20 suites de COMPILER — 0 test en échec, 20 suites qui ne démarrent
pas. Comparer un total à celui d'un cycle précédent aurait été trompeur. Suite complète relancée sur
l'arbre PROPRE (`git stash`) : **20 suites en échec, 619 vertes, 15 784 tests, 0 échec de test.**
Avec le correctif : **mêmes 20 suites**, 620 vertes, la suite neuve en plus. Aucune régression, et
la preuve ne repose pas sur ma parole quant à ce qui était déjà rouge.

`tsc --noEmit` : aucune erreur imputable aux fichiers touchés (seul subsiste le bruit de résolution
`@meeshy/shared/prisma/client`, présent à l'identique sur des fichiers jamais touchés — le
type-check de la CI est d'ailleurs `continue-on-error`).

## Reste ouvert après ce cycle

- **Le passif ne se rattrape que passe par passe.** À la mise en production le balayage devient
  effectif pour la première fois : 500 posts/heure, 12 000/jour. Aucune réparation rétroactive des
  lignes DÉJÀ orphelines (médias au `postId` nul, usages de sons, notifications de posts détruits à
  la main avant ce correctif) — action humaine, sur le patron de `repair-mention-user-ids.ts`.
- **`softDeleteRetentionMs` reste du code mort** : le champ est assigné et journalisé, mais
  `cleanup()` ne le lit pas. Il documente une intention (6 h de grâce entre masquage et destruction)
  que la passe n'implémente pas — le hard-delete est ancré sur `expiresAt`, pas sur `deletedAt`.
  Non touché ce cycle : le corriger, c'est choisir entre supprimer le champ et ré-ancrer la seconde
  passe, ce qui est une décision de conception à part entière.
- **Le nom `ExpiredStoriesCleanupService` ment maintenant sur son périmètre** (il balaie aussi les
  `STATUS`). Renommer invaliderait six documents d'archive qui le citent nommément ; la doc de
  classe porte la correction à la place. À trancher si le service prend un troisième type.
- **Les `TrackingLink` d'une story détruite ne sont toujours pas désactivés par la passe** (hérité
  du cycle 53) ; `broadcastCommentDeleted` n'annonce que la cible et pas le sous-arbre (hérité du
  cycle 52, traverse le Swift que cet environnement ne compile pas — leçon 88c) ; `post_comment` et
  `comment_like` n'exposent pas `context.commentId` ; le push APNs/FCM déjà délivré n'est pas
  rappelé ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne peut
  pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 53 — Une story périmée n'est pas une story détruite

Le cycle 52 laissait cette tête en backlog sous le nom « les stories expirées ne retirent pas leurs
notifications ». La leçon 18 dit quoi en faire : une piste héritée est une **hypothèse à réfuter
d'abord**. Elle a été réfutée sur le mot qui décide tout — *expirées* — puis confirmée sur l'autre
moitié, celle que son propre énoncé nommait déjà sans qu'on l'entende : *hard-delete*.

## D1 (la piste, et pourquoi elle était fausse)

L'audit est parti d'une piste plus élégante que celle du backlog. `Notification.expiresAt` existe,
les sept lectures d'inbox l'honorent depuis `visibleNotificationsWhere`, et le cycle précédent
(PR #2751) venait de brancher les **quatre** producteurs ancrés sur un message pour qu'ils en
héritent. Une story est le contenu éphémère canonique : `Post.expiresAt`, écrit à l'insertion et
jamais modifié — vérifié, les deux seuls autres sites d'écriture sont des `create` de repost.
Mieux encore, **six** producteurs reçoivent déjà `postExpiresAt` de leurs appelants et le déposent
dans `context.postExpiresAt`, une ligne au-dessus de la colonne qui les masquerait. Toute la forme
du défaut jumeau était là : *l'échéance arrive au producteur et s'arrête juste avant la colonne.*

**C'est faux, et le vérifier a demandé de lire les clients.** `context.postExpiresAt` n'est pas une
échéance oubliée en route : c'est une fonctionnalité livrée des deux côtés. Le web en tire
« · expirée » (`notification-helpers.ts:553`), iOS en tire `expiryLabel` et
`isLinkedContentExpired` (`NotificationModels.swift:823/829`). Le produit **montre** délibérément
la notification d'une story périmée, marquée comme telle. Estampiller la colonne l'aurait masquée
côté serveur et rendu mort le code des deux clients — la régression exacte que le cycle 51 avait
appris à chercher sous le nom de « faux positif ».

La différence avec le message éphémère est réelle et se lit dans la donnée, pas dans l'intention :

| | message éphémère | story périmée |
|---|---|---|
| Ce que la ligne montre | un libellé générique (`protectedPreview`) | un vrai extrait, un acteur, une vignette |
| Ce que la cible répond | rien, le message est détruit à l'échéance | **encore le post** — `getPostById` ne filtre pas l'expiration |
| Geste juste | masquer | montrer, marqué « expirée » |

## D2 (le défaut, là où il est vraiment)

`ExpiredStoriesCleanupService` est le **seul chemin de hard-delete de post du gateway** (vérifié :
les deux seuls `post.deleteMany` du dépôt sont les siens). Sept jours après l'expiration, il détruit
les lignes `Post` des stories, de leurs reposts et de tous leurs commentaires. À cet instant les
deux appuis de la notification tombent **ensemble** : sa copie dénormalisée décrit un contenu qui
n'existe plus, et son `view_post` n'ouvre plus qu'un 404. Le badge non lu, lui, ne peut plus être
décrémenté par personne — on ne lit pas ce qui n'est plus là.

Toutes les stories expirent. Toutes finissaient donc par laisser leurs lignes.

C'est bien ce que le backlog du cycle 52 décrivait — « hard-delete les posts après 7 jours sans
passer par `applyPostRemovalEffects` ». La piste « plus élégante » l'avait déplacé de sept jours et
d'un cran de sévérité. **La note d'origine avait raison ; c'est la relecture qui s'était trompée.**

Sa question ouverte — « le hard-delete déclenche-t-il une cascade que le soft-delete ne déclenchait
pas ? » — se répond en lisant le modèle : `Notification` n'a de relation que vers `User` et
`Message`. Aucune vers `Post`. Rien ne se déclenche, dans un sens comme dans l'autre.

## D3 (placement) — la passe nommait déjà la règle, pour un autre effet

Le retrait ne passe PAS par `applyPostRemovalEffects` : cette liste écrirait une ligne
`AdminAuditLog` pour un balayage sans acteur, et re-libérerait des usages de sons que la passe
libère déjà. Elle nomme les effets d'un retrait **décidé par quelqu'un** ; ceci est une fin de vie.

En revanche la passe porte déjà, au-dessus de `releasePosts`, la règle qui gouverne exactement ce
cas : « placé AVANT les suppressions de posts, et il REJETTE volontairement : `SoundUsage.postId`
n'a ni relation ni cascade, donc supprimer les posts après un échec de libération laisserait des
usages que plus aucun chemin n'atteindrait. » `context.postId` a la même forme — ni relation, ni
cascade. Le retrait prend donc la même place et le même contrat, et la règle n'a pas eu à être
inventée : **elle était écrite trois lignes plus bas, pour son voisin.**

## D4 (la cible est une fournée) — et le plafond change de sens avec elle

`retractPostNotifications` prend désormais une **liste**, comme son jumeau
`retractCommentNotifications` : un `$in` sur stories ∪ reposts, au lieu d'une lecture par post. Les
notifications des commentaires détruits partent avec — toute la famille du fil porte aussi
`context.postId`.

Son plafond de drainage **rejette** au lieu d'avertir, et c'est l'entrée qui l'exige, pas un goût
pour la sévérité : tant qu'elle était UN post, le plafond ne bornait aucune audience réaliste. Elle
est maintenant une heure d'expirations de toute la plateforme — un ensemble que rien ne borne. Un
plafond atteint en silence laisserait l'appelant détruire les posts, et les lignes restantes
n'auraient alors plus **aucun** chemin de retrait, la passe suivante ne voyant plus les posts. Le
rejet rend la reprise possible, et elle converge : les lots déjà lus ont bien été supprimés.

## Plan
- [x] T1 — enquête : la piste héritée réfutée sur les clients, puis confirmée sur le hard-delete
- [x] T2 — RED (unité) : liste, `$in`, liste vide, plafond qui rejette
- [x] T3 — RED (câblage) : stories ∪ reposts, retrait avant destruction, renoncement sur échec,
      annonce par destinataire, aucune question quand rien n'a expiré, sans annonceur
- [x] T4 — GREEN : `retractPostNotifications` élargi + appel gardé dans la passe de hard-delete
- [x] T5 — sondes de fidélité (leçon 45b/93) : cinq défauts réintroduits un par un
- [x] T6 — gates : suite gateway complète sous bun, `tsc --noEmit` propre
- [x] T7 — changeset + ADR + ce relevé

## Vérification

Rouge observé avant le correctif : les six témoins de câblage tombent, l'appel n'existant pas.

**Sondes de fidélité** — chaque témoin re-vérifié en réintroduisant volontairement le défaut qu'il
prétend attraper, restauration par **copie** et non par `git checkout` (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| appel du retrait supprimé de la passe | 5 |
| retrait borné aux stories (reposts oubliés) | 1 |
| retrait placé APRÈS les suppressions | 2 |
| plafond qui avertit au lieu de rejeter | 1 |
| liste vide qui interroge quand même Mongo | 1 |

**Deux suites voisines ont dû être réparées, et les deux réparations disent quelque chose.**
`postRemovalEffects.test.ts` verrouillait la forme scalaire du filtre — assertion mise à jour, le
comportement mesuré est inchangé. `ExpiredStoriesCleanupService.sounds.test.ts`, lui, est tombé
parce que son double Prisma ne connaît pas `$runCommandRaw` : le retrait rejetait, et la libération
des usages — ce que cette suite mesure — n'était plus atteinte. C'est **exactement** le contrat
voulu (le retrait gouverne la passe), observé depuis une suite qui ne le teste pas. Ajouter les deux
doubles n'affaiblit donc rien : c'est la même leçon que le commentaire déjà présent dans ce fichier
à propos de `soundUsage` — un double manquant transforme une garde en avale-tout silencieux.

Suite gateway complète sous bun (parité CI) : **639 suites, 16 241 tests, tout vert**.
Couverture globale lignes **95,76 %** — inchangée. `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Aucune ligne déjà orpheline n'est rattrapée**, comme aux cycles 51 et 52 : le correctif ne vaut
  que pour les destructions à venir. Réparable par le patron de `repair-mention-user-ids.ts` —
  action humaine, cette routine n'a aucun accès MongoDB.
- **Les posts `STATUS` expirent et ne sont balayés par rien.** Le balayage filtre `type: 'STORY'` ;
  une story dure 21 h et meurt à 7 jours, un statut dure 1 h et sa ligne vit pour toujours. Leurs
  notifications mènent donc toujours quelque part — ce n'est pas un défaut de notification, c'est
  un balayage qui manque, et le trou de disque associé (médias, usages de sons) est le même que
  celui que le cycle G7 a fermé pour les stories. À instruire pour lui-même.
- **Les `TrackingLink` d'une story détruite ne sont pas désactivés par la passe.** Sur le chemin de
  retrait DÉCIDÉ, `applyPostRemovalEffects` les désactive ; une story qui meurt de vieillesse n'y
  passe jamais. Un `/l/<token>` visant une story détruite reste donc actif et pointe une ligne
  absente. Défaut voisin, non instruit ce cycle — vérifier d'abord ce que résout un lien dont la
  cible n'existe plus.
- **Une passe peut désormais bloquer sur elle-même.** Plafond de drainage atteint ⇒ rien n'est
  détruit cette heure-là. Voulu (la reprise converge), mais retarde d'autant la récupération de
  disque, et rien ne mesure aujourd'hui la fréquence de ce cas.
- **`broadcastCommentDeleted` n'annonce que la cible, pas le sous-arbre** (hérité du cycle 52,
  inchangé) : la route émet un seul `commentId` là où `deleteComment` en a soft-deleté N, et les
  réponses restent affichées chez les clients connectés jusqu'au prochain chargement du fil. Le
  correctif traverse gateway + shared + web + SDK iOS — dont le Swift, que cet environnement ne
  sait pas compiler (leçon 88c : ne pas livrer ce qu'on ne peut pas prouver).
- **`post_comment` et `comment_like` n'exposent pas `context.commentId`** (hérité du cycle 52) ;
  le retrait des `Mention` d'un post n'est pas dans la liste d'effets ; le push APNs/FCM déjà
  délivré n'est pas rappelé ; l'arbitrage `delete-for-me` du cycle 12 attend une validation
  humaine ; `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 52 — Le commentaire partait ; ce qu'il avait écrit dans l'inbox des autres restait

Le cycle 51 nommait cette tête en la donnant explicitement pour une **hypothèse à réfuter d'abord**
(leçon 18), avec trois questions à instruire dans l'ordre. Les trois ont été instruites. Le défaut
est confirmé ; **la piste, elle, était fausse sur le point qui décide toute l'implémentation.**

## D1 (les trois questions du cycle 51, dans l'ordre)

**Q1 — qui écrit `PostComment.deletedAt`, et est-ce la configuration « quatre écrivains sans
unité » du cycle 14 ?** Non. Un seul écrivain interactif : `PostCommentService.deleteComment`,
atteint par la seule route `DELETE /posts/:postId/comments/:commentId`. Le second site,
`ExpiredStoriesCleanupService`, ne soft-delete pas : il **hard-delete** les commentaires d'une story
expirée depuis 7 jours, dans un cycle de vie où c'est le post entier qui part. Pas de liste d'effets
nommée à créer, donc — l'écrire pour un unique appelant aurait fabriqué l'indirection que les
cycles 45b/51 justifient par la PLURALITÉ des écrivains. L'appel va directement dans `deleteComment`.

**Q2 — `context.commentId` désigne-t-il toujours LE commentaire supprimé ?** Oui quand il est
présent — et c'est ce « quand » qui est le vrai résultat. En relisant les écrivains plutôt que le
nom de la colonne (leçon 18 du cycle 18), les huit types producteurs se répartissent en **trois**
familles, pas une :

| Chemin qui porte le lien | Types |
|---|---|
| `context.commentId` SEUL | `comment_reaction` |
| `metadata.commentId` SEUL | **`post_comment`**, `comment_like` |
| les deux | `comment_reply`, `user_mentioned` (mention en commentaire), `story_new_comment`, `story_thread_reply`, `friend_story_comment` |

La piste du cycle 51 énumérait les sept premiers comme écrivains de `context.commentId`. Deux d'entre
eux ne l'écrivent pas — dont `post_comment`, la notification la **plus fréquente** de toute la
famille : une par commentaire, vers l'auteur du contenu. Un retrait transposé littéralement du
jumeau post, qui ne connaît que `context.<clé>`, aurait donc laissé en base la majorité du volume,
en passant tous ses tests. La trace de cette asymétrie était déjà dans le code — le payload APNs
lit `params.context.commentId || params.metadata.commentId` — et personne ne l'avait lue comme
l'aveu qu'elle est.

**Q3 — retrait ou MARQUAGE, comme la réponse à une demande d'amitié ?** Retrait. Ce qui tranche est
ce qui reste au bout du lien : le commentaire est filtré partout à la lecture (`getComments` et
`getReplies` excluent `deletedAt`), donc la ligne n'a plus rien à afficher **et** rien où mener. Le
marquage était l'arbitrage de la demande d'amitié RÉPONDUE parce que la ligne `FriendRequest`, elle,
survit — la notification y est *consommée*, pas orpheline. Ici rien ne survit. Et `deleteComment`
rejette `FORBIDDEN` pour tout autre que l'auteur : il n'existe donc pas de retrait de modération
dont la notification serait la seule trace, le troisième faux positif cherché au cycle 51.

## D2 (la seconde différence) — la cible est une liste, pas un id

`deleteComment` soft-delete le **sous-arbre entier**, à profondeur arbitraire, parce que
`commentCount` compte le fil complet. Le retrait reçoit exactement la liste d'ids que le soft-delete
a écrite. Traiter la seule cible aurait laissé les notifications des réponses emportées avec elle —
un défaut invisible depuis la cible, puisque la cible, elle, aurait été correctement nettoyée.

`parentCommentId` reste VOLONTAIREMENT hors du filtre. C'est la seule autre clé de `context` qui
désigne un commentaire, et elle ne désigne jamais le sujet de la ligne : sur un `comment_reply`,
`commentId` est la réponse et `parentCommentId` le commentaire auquel on répond. Le cas « le parent
disparaît » est déjà couvert par le sous-arbre.

## D3 (câblage) — la route n'a rien à câbler

Même résolution que `applyPostRemovalEffects` et `applyMessageRemovalEffects` : l'annonceur est un
**défaut de paramètre** sur `getSharedNotificationService()`. Sur une méthode, le défaut est évalué
à chaque appel — ce qui est ici nécessaire et pas seulement commode : le service partagé n'est
enregistré qu'au démarrage du socket, après la construction des routes. Une injection par
constructeur aurait capturé `undefined`.

## Plan
- [x] T1 — enquête : les trois questions du cycle 51, écrivains relus un par un
- [x] T2 — RED (unité) : les deux chemins JSON lus ; chaque famille de types couverte
- [x] T3 — RED (unité) : sous-arbre, annonce par destinataire, voisins épargnés, ordre, drainage,
      liste vide, sans annonceur, échec Mongo remonté
- [x] T4 — RED (câblage) : même liste d'ids que le soft-delete, annonce après l'écriture durable,
      suppression réussie malgré un retrait en échec, rien de retiré si la suppression est refusée
- [x] T5 — GREEN : `retractCommentNotifications` + appel best-effort dans `deleteComment`
- [x] T6 — sondes de fidélité (leçon 45b) : quatre défauts réintroduits un par un
- [x] T7 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T8 — changeset + CHANGELOG + ce relevé

## Vérification

Rouge observé avant le correctif : `Cannot find module '../retractCommentNotifications'`.

**Sondes de fidélité** — chaque témoin central re-vérifié en réintroduisant volontairement le défaut
qu'il prétend attraper, restauration par **copie** et non par `git checkout` (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| filtre sur le seul `context.commentId` | 3 (dont « retire aussi les lignes dont le lien ne vit que dans metadata ») |
| retrait borné à `[commentId]` au lieu du sous-arbre | 1 (« TOUT le sous-arbre soft-deleté ») |
| appel au retrait supprimé de `deleteComment` | 2 |
| annonce placée AVANT l'écriture durable | 1 (« annonce APRÈS l'écriture durable ») |

Suite gateway complète sous bun (parité CI) : **639 suites, 16 220 tests, tout vert** (333 s).
Couverture globale lignes **95,76 %** — inchangée. `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Aucune ligne déjà orpheline n'est rattrapée**, comme au cycle 51 : le correctif ne vaut que pour
  les suppressions à venir. Réparable par le patron de `repair-mention-user-ids.ts` — action
  humaine, cette routine n'a aucun accès MongoDB.
- **`post_comment` et `comment_like` n'exposent pas `context.commentId`**, alors que leurs six
  cousins le font. Ce n'est pas qu'une gêne pour le retrait : le commentaire de `createNotification`
  dit que « `postId`/`commentId` vivent dans `context` (cible de navigation) » et que le schéma de
  réponse REST les expose — donc la navigation **in-app** vers le commentaire exact ne peut pas
  fonctionner pour ces deux types, seul le payload APNs s'en sortant par son repli sur `metadata`.
  À instruire comme un défaut de navigation à part entière (lire d'abord ce que le web et le SDK iOS
  consomment réellement), et non à corriger en passant : c'est un contrat client.
- **Les stories expirées ne retirent pas leurs notifications.** `ExpiredStoriesCleanupService`
  hard-delete les posts après 7 jours sans passer par `applyPostRemovalEffects` : toutes les
  notifications d'une story expirée survivent, exactement comme celles d'un post supprimé avant le
  cycle 51. Volume potentiellement supérieur au cas post (toutes les stories expirent). À vérifier
  avant d'écrire : le hard-delete déclenche-t-il une cascade que le soft-delete ne déclenchait pas ?
  `Notification` n'a pas de relation vers `Post`, donc a priori non — mais c'est précisément le genre
  de déduction que ce cycle a appris à ne pas faire sans lire.
- **`broadcastCommentDeleted` n'annonce que la cible, pas le sous-arbre.** La route émet un seul
  `commentId` alors que `deleteComment` en a soft-deleté N. Les réponses restent affichées chez les
  clients connectés jusqu'au prochain chargement du fil. Défaut voisin, non instruit ce cycle.
- **Le retrait des `Mention` d'un post n'est pas dans la liste d'effets** (hérité du cycle 51,
  inchangé) ; le push APNs/FCM déjà délivré n'est pas rappelé ; `.gitignore:177` porte un `post-*`
  non ancré et non scopé ; `login_new_device` sans contexte de consommation ; l'arbitrage
  `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne peut pas tourner sur le
  gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 51 — Le jumeau côté post avait reçu la liste, jamais les notifications

Le cycle 50 nommait cette tête en toutes lettres, et la leçon 18 dit quoi en faire : une piste
héritée est une **hypothèse à réfuter d'abord**. Réfutation tentée, défaut confirmé, correctif
suggéré confirmé lui aussi — mais seulement après avoir cherché le cas qui l'aurait rendu faux.

## D1 (racine) — la liste nomme trois effets, le quatrième n'y a jamais figuré

`applyPostRemovalEffects` existe pour une raison écrite dans son propre en-tête : la console avait
rattrapé un par un, à trois cycles d'intervalle, ce que le service faisait et qu'elle ne faisait
pas — les usages de sons, puis la diffusion, puis l'audit et les liens de partage. « Chaque omission
a attendu son propre incident parce que rien ne NOMMAIT la liste. »

La liste a été écrite. Elle nomme l'audit, les `TrackingLink`, les usages de sons. Elle ne nomme pas
les `Notification`. Le jumeau côté message les retire depuis le cycle 47, et ce jumeau est nommé
dans le commentaire de tête du fichier — la comparaison était à une ligne de distance et personne ne
l'a faite, parce que **ce qui manque à une liste ne se voit pas en lisant la liste**.

Le mécanisme est celui des cycles 46/47/48/50, à sa cinquième occurrence et à sa plus grande
échelle : retrait doux (`deletedAt`), donc pas de cascade ; lien porté par `context.postId`, un
chemin dans un blob JSON, donc aucune relation déclarée à ne pas se déclencher ; copie
**dénormalisée** du contenu prise à la création, donc aucun filtre à la lecture ne peut rattraper —
`content`, `metadata.commentPreview`, et `metadata.firstAttachmentUrl`, qui est la vignette du média
retiré. ≈ 8 100 lignes non lues en production au diagnostic du 2026-08-04.

## D2 (réfutation de la piste) — trois faux positifs cherchés, aucun trouvé

La piste disait « filtrer sur `context.postId` ». Le cycle 18 a montré qu'un filtre qui porte le nom
d'une relation ne porte pas forcément la relation. Trois cas ont donc été cherchés avant d'écrire :

1. **Une notification dont `context.postId` désigne un AUTRE post que celui qu'elle concerne.**
   `post_repost` était le candidat : il porte `context.postId = originalPostId` et le repost lui-même
   dans `metadata.repostId`. Supprimer le repost ne retire donc rien du post d'origine, et supprimer
   l'original retire bien la notification « X a reposté votre post », qui n'a effectivement plus de
   destination. Le seul écrivain asymétrique va dans le bon sens.
2. **Une notification ancrée sur un post mais dont la cible vivante est ailleurs** (typiquement une
   réponse de story qui atterrit dans une conversation). Les onze producteurs de `context.postId` ont
   été relus : tous désignent le post lui-même, aucun ne double la clé avec un `messageId` vivant.
3. **Une notification de modération « votre post a été retiré »** qui serait créée par le retrait et
   emportée par lui. Aucune n'existe — ni le service ni la route console n'en créent.

Rien n'oblige donc à distinguer par `type`, et c'est ce qui rend le filtre sûr.

## D3 (les deux différences avec le jumeau message) — elles décident l'implémentation

| | message rappelé | post retiré |
|---|---|---|
| Lien vers la ligne | colonne `Notification.messageId` | `context.postId`, chemin JSON |
| Audience | quelques destinataires nommés | auteur + fil + amis prévenus |
| Requête | `findMany` Prisma | `$runCommandRaw` (Prisma ne filtre pas les chemins JSON sur MongoDB) |
| Scope `userId` | inutile | **projeté**, l'annonce se groupe par destinataire |
| Volume | une passe suffit | **drainage** par lots |

Le drainage est la seule addition que le jumeau n'a pas. Un lot plein ne prouve pas que la base est
vide, et une lecture unique laisserait la queue en place **sans le moindre signal** — le premier
lot, lui, a réussi. Lots de 200 en série : `announceNotificationsRetracted` déclenche un recalcul de
compteurs par destinataire distinct, donc le lot borne la rafale de lectures concurrentes, et la
sérialisation garde le pic à un lot quelle que soit la taille de l'audience. Plafond de 200 lots :
il ne borne aucune audience réaliste, il empêche une boucle infinie si la suppression cessait un
jour de faire progresser la lecture.

## D4 (câblage) — les deux routes n'ont rien à câbler

Le cycle 50 anticipait « l'annonceur doit descendre jusqu'à `applyPostRemovalEffects`, qui ne reçoit
ni `NotificationService` ni port étroit ». Vrai, mais la descente n'a coûté aucun paramètre aux
appelants : `applyMessageRemovalEffects` résout déjà son annonceur par **défaut de paramètre** sur
`getSharedNotificationService()` — le service partagé du processus, le seul câblé avec `io`. Le même
défaut ici couvre les deux routes (`DELETE /posts/:postId` via `PostService.deletePost`, et
`DELETE /admin/posts/:postId` qui écrit `deletedAt` en direct) sans toucher ni au constructeur à
sept paramètres de `PostService`, ni à la signature de `deletePost`, ni aux deux routes.

Le port `RetractedNotificationAnnouncer` déménage de `messaging/` vers `notifications/`, à côté de
son unique implémenteur. Le redéclarer sous `posts/` aurait fabriqué deux ports rivaux pour une
seule règle — la configuration même que ces modules d'effets existent pour empêcher (cycle 45b).
`messaging/` le ré-exporte : aucun importateur historique ne bouge.

## D5 (place dans la liste) — après l'audit, avant les deux autres

L'audit reste le premier effet écrit : c'est la trace de modération, et c'est la seule des quatre
dont la perte est une perte de conformité. Le retrait vient juste après, avant les liens de partage
et les usages de sons, parce que c'est le seul des quatre dont le **retard se voit** — tant qu'il
n'a pas eu lieu, l'extrait du contenu retiré et la vignette de son média restent affichés dans
l'inbox de toute l'audience. Best-effort comme les trois autres : `deletedAt` est déjà committé
quand la liste s'exécute, et un retrait qui échoue ne doit pas transformer une suppression réussie
en 500.

## Plan
- [x] T1 — RED (unité) : lecture par chemin JSON `context.postId`, projection `_id` + `userId`
- [x] T2 — RED (unité) : toute l'audience retirée, chaque ligne annoncée à SON destinataire
- [x] T3 — RED (unité) : un autre post et une notification hors post ne bougent pas
- [x] T4 — RED (unité) : l'annonce vient APRÈS l'écriture durable
- [x] T5 — RED (unité) : drainage au-delà d'un lot plein ; arrêt au premier lot incomplet
- [x] T6 — RED (unité) : rien à retirer → aucune suppression, aucune annonce ; sans annonceur → les
      lignes partent quand même ; échec Mongo → remonte (la liste d'effets décide de l'absorber)
- [x] T7 — RED (liste) : `applyPostRemovalEffects` retire ; un échec n'emporte ni la suppression ni
      les trois effets historiques
- [x] T8 — GREEN : `retractPostNotifications` + 4e effet + port déménagé
- [x] T9 — sondes de fidélité (leçon 45b) : trois défauts réintroduits un par un
- [x] T10 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T11 — changeset + CHANGELOG + ce relevé

## Vérification

Rouges observés avant le correctif : `Cannot find module '../retractPostNotifications'` sur la suite
d'unité, et TS2554 (« Expected 3-4 arguments, but got 5 ») sur la suite de liste d'effets.

**Sondes de fidélité** — chaque témoin central re-vérifié en réintroduisant volontairement le
défaut qu'il prétend attraper, restauration par **copie** et non par `git checkout` (leçon 93) :

| Défaut réintroduit | Témoin qui tombe |
|---|---|
| `userId: objectId(rows[0]?.userId)` (tout le monde rabattu sur le premier destinataire) | « annonce chacune à SON destinataire » |
| `return total` inconditionnel en fin de boucle (pas de drainage) | « draine au-delà d'un lot plein » |
| appel au retrait supprimé de la liste d'effets | « retire les notifications que le post a produites » |

Suite gateway complète sous bun (parité CI) : **638 suites, 16 204 tests, tout vert** (386 s).
Couverture globale lignes **95,76 %** — inchangée. `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Aucune ligne déjà orpheline n'est rattrapée.** Le correctif ne vaut que pour les suppressions à
  venir ; les ≈ 8 100 lignes des posts déjà supprimés restent en base. Réparable par le patron des
  scripts existants (`repair-mention-user-ids.ts`) — action humaine, cette routine n'a aucun accès
  MongoDB.
- **Piste pour le cycle suivant, à traiter en HYPOTHÈSE (leçon 18).** Le même mécanisme a un sixième
  candidat, un cran en dessous du post : la suppression d'un **commentaire**. `context.commentId`
  est écrit par `comment_reaction`, `post_comment`, `comment_reply`, `comment_like`,
  `story_new_comment`, `story_thread_reply` et `friend_story_comment` ; le retrait d'un commentaire
  est doux lui aussi (`PostComment.deletedAt`, cf. `loadCommentPostAcl`). À vérifier AVANT d'écrire,
  et dans cet ordre : (1) qui écrit `PostComment.deletedAt`, et ces écrivains partagent-ils une
  liste d'effets nommée, ou sont-ils la configuration « quatre écrivains sans unité » du cycle 14 ?
  (2) `context.commentId` désigne-t-il toujours LE commentaire supprimé, ou parfois son parent
  (`context.parentCommentId` existe séparément — donc a priori oui, mais c'est exactement le genre
  de colonne dont il faut lire les écrivains et non le nom) ? (3) le retrait d'un commentaire
  doit-il vraiment emporter la notification, ou est-ce un cas de MARQUAGE comme la réponse à une
  demande d'amitié ? Rien ne dit que l'arbitrage du post se transpose.
- **Le retrait des `Mention` d'un post n'est pas dans la liste non plus.** `reconcilePostMentions`
  retire les lignes des partants à l'ÉDITION ; aucun appel équivalent au retrait. Défaut probable de
  la même famille, non instruit ce cycle — le vérifier avant de l'écrire.
- **Le push APNs/FCM déjà délivré n'est pas rappelé.** Retirer la ligne éteint la liste in-app et la
  cloche, pas la bannière déjà posée sur l'écran verrouillé. Chantier de contrat, pas correctif.
- **`.gitignore:177` porte un `post-*` non ancré et non scopé** — il masque *tout* fichier dont le
  nom commence par `post-`, à n'importe quelle profondeur. Rencontré en écrivant ce cycle : le
  changeset nommé `post-removal-…` n'apparaissait pas dans `git status`, renommé pour contourner.
  Aucune perte active aujourd'hui (`apps/web/__tests__/components/v2/post-card-enhanced.test.tsx`
  est déjà suivi, donc le motif ne s'y applique plus), mais tout fichier `post-*` créé désormais
  disparaît en silence. Non corrigé ici : le motif est voisin d'un bloc « Version files » sans
  commentaire propre, et le restreindre demande de savoir ce qu'il visait — à instruire séparément.
- Hérités et inchangés : `login_new_device` sans contexte de consommation ; l'arbitrage
  `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne peut pas tourner sur le
  gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 50b — La famille était de cinq. Elle est de quatre, et les quatre héritent.

> **Session parallèle.** Deux sessions ont livré un cycle 50 en même temps, et pour une fois dans la
> MÊME famille : le 50 ci-dessous retire la notification d'une demande d'amitié annulée, celui-ci
> fait hériter aux notifications l'échéance du message qu'elles désignent. Aucun recouvrement de
> code — l'un touche le retrait par référent, l'autre la péremption par échéance.

Le cycle 49b a branché les trois producteurs que l'éventail d'un message appelle et a nommé les deux
qui restaient, sans les traiter : la réaction et la traduction prête. Ce cycle les prend, et l'un des
deux se révèle ne pas être un producteur.

## L'énumération, parce qu'elle est vérifiable

Quatre — pas trois, pas six — méthodes `create*` de `NotificationService` posent un
`context.messageId`. Le compte se refait en une commande, et c'est ce qui fait la valeur de la
revendication « la famille est complète » : `createMessageNotification`, `createMentionNotification`,
`createReactionNotification`, `createReplyNotification`. Les quatre estampillent désormais
l'échéance.

## Ce que chacun coûte : rien

**La réaction** lisait déjà le message pour en tirer l'extrait (`select: { content: true }`) —
`expiresAt` voyage dans la même lecture. **La mention par édition** avait son paramètre depuis le
cycle précédent, sans personne pour le lui passer : les deux transports REST chargent le message par
`include` (l'échéance était déjà là, à portée de main), et le transport socket ajoute un champ à un
`select` qu'il émettait déjà. Zéro requête ajoutée sur les deux chemins — la même contrainte que le
cycle 49b s'était donnée, tenue pour les mêmes raisons.

## Le cinquième n'écrivait rien

`createTranslationReadyNotification` n'avait **aucun appelant de production** : un test était sa
seule invocation dans tout le dépôt. Il n'a jamais écrit une ligne `Notification`, et aucun client
n'a jamais reçu ce type. Ce n'était donc pas « le producteur qui n'hérite pas d'échéance » — c'était
un producteur qui ne produit pas.

Retiré. Mais retirer la méthode ne suffisait pas : `NotificationTypeEnum.TRANSLATION_READY` reste
déclaré (le SDK iOS le décode, et un client déployé ne doit pas buter dessus), et c'est exactement la
forme que la leçon 92 décrit — une valeur déclarée qu'un audit lit comme une fonctionnalité. Elle
porte désormais la mention explicite qu'aucun producteur ne l'émet, et le renvoi vers l'homonyme ZMQ
`translation_ready`, lui bien vivant, qui annonce une traduction au gateway sans notifier personne.

Le test qui l'atteignait est retiré avec elle, et remplacé par la phrase qui explique pourquoi : un
test qui est le SEUL appelant de son sujet ne mesure pas du code vivant, il en entretient
l'apparence.

## Plan

- [x] T1 — RED : une réaction à un message éphémère hérite de son échéance
- [x] T2 — témoin : une réaction à un message ordinaire n'invente aucune échéance
- [x] T3 — RED : une mention ajoutée en ÉDITANT un message éphémère hérite de son échéance
- [x] T4 — témoin : l'édition d'un message ordinaire transmet `null`, jamais une échéance inventée
- [x] T5 — les trois transports d'édition alimentent le champ (socket + PUT + PATCH)
- [x] T6 — retrait du producteur sans appelant + annotation de l'énumération partagée
- [x] T7 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T8 — changeset + ce relevé

## Revue

Sonde : les deux estampilles neutralisées ensemble → **3 rouges**. Les deux attendus, plus un
troisième qui mérite d'être nommé : le test « réconcilie et ne notifie QUE les entrants » compare la
totalité de `commonData`. Il tombe parce que le champ a disparu de l'objet — c'est-à-dire qu'il tient
aussi, gratuitement, le témoin `messageExpiresAt: null` du chemin ordinaire. C'est le cas où
l'égalité stricte, que le cycle 49b a assouplie ailleurs, se révèle utile : ici l'objet EST le
contrat de l'appel, et personne d'autre ne le compose.

`tsc --noEmit` a d'abord rendu deux erreurs sur `routes/conversations/core.ts` (`firstMessageSentAt`
absent du type Prisma) : client généré périmé après la fusion de `main`, aucun rapport avec ce lot.
Régénéré, la compilation est propre.

## Reste ouvert après ce cycle

- **Les clients ne s'auto-périment toujours pas**, et le parseur socket du web lit à la RACINE ce
  que le serveur envoie sous `state` — les deux points hérités du 49b, inchangés.
- **`getUserNotifications` reste sans appelant de production.** Même forme que le producteur retiré
  ici, mais la route `/notifications` refait sa requête à la main : supprimer la méthode demanderait
  d'abord de faire appeler le service par la route, ce qui est un autre geste.
- **Les points hérités restent ouverts tels quels** : le push déjà remis reste sur l'appareil au
  rappel ; les mentions du chemin de lien attendent l'extraction qui écrit `Message.validatedMentions` ;
  aucun client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de lien n'entrent pas
  dans le pipeline audio ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine.

---

# Cycle 50 — La demande d'amitié partait ; sa notification restait, sans destination

Tête prise dans la famille que les cycles 46/47/48 ont ouverte sans la fermer : **une ligne
dénormalisée survit au retrait de son référent parce que le retrait ne l'a jamais nommée.** Trois
occurrences déjà traitées (`TrackingLink` d'un message rappelé, `Mention`, `Notification` d'un
message rappelé), toutes du côté message. La quatrième est ailleurs, et c'est ce qui l'avait
gardée invisible : elle est sur la route qui supprime une demande d'amitié.

## D1 (racine) — le seul consommateur devient inatteignable au moment où la ligne part

`DELETE /friend-requests/:id` fait trois choses : il lit la demande, il **supprime la ligne**, il
émet `friend_request:cancelled` à l'autre partie. Il ne touche pas la seule chose DURABLE que la
demande avait produite — la notification « X vous a envoyé une demande d'amitié », écrite par
`createFriendRequestNotification` dans l'inbox du **destinataire**.

Rien d'autre ne l'en retirait :

- `Notification.context` est un blob JSON, pas une clé étrangère. Aucun `onDelete: Cascade` ne peut
  se déclencher sur `context.friendRequestId` — même mécanisme exactement que celui qui laissait les
  `Notification` d'un message rappelé en base (cycle 47), à ceci près qu'ici il n'y a même pas de
  relation déclarée à ne pas se déclencher.
- Sa seule voie de consommation est `markFriendRequestNotificationsAsRead`, appelée par la route
  soeur `PATCH …/:id` quand on **répond**. Or on ne répond plus à une demande qui n'existe plus : la
  route 404 sur `findFirst`. La voie de sortie se ferme à l'instant même où la ligne part.

Résultat : notification **non lue indéfiniment**, comptée dans la cloche et dans le badge, avec un
`metadata.action: accept_or_reject_contact` qui n'ouvre plus qu'un écran répondant 404. Les deux
sous-cas de la route la produisent, parce que la suppression est inconditionnelle : l'expéditeur qui
annule, et le destinataire qui écarte sans répondre.

## D2 (pourquoi ça a survécu) — la route voisine fait le geste correct, sous un autre nom

Le `PATCH` marque comme lues (cycle antérieur, `markFriendRequestNotificationsAsRead`). À la
relecture d'un seul fichier, la famille « demande d'amitié » a donc l'air pourvue : le mot
`notification` apparaît, scopé sur `context.friendRequestId`, avec sa garde anti-IDOR et son
`notification:counts`. Ce qui manque n'est pas un contrôle absent partout — c'est **le même contrôle
sous un verbe différent**, et le verbe différent est précisément ce qui le rend invisible.

C'est la configuration du cycle 14 (un écrivain sur quatre hors du rang), avec une variante : les
deux routes ne DOIVENT pas faire le même geste, donc leur asymétrie n'est pas en soi un signal.

## D3 (arbitrage) — retrait, pas marquage

Ce qui tranche est ce qui reste au bout du lien, pas qui a cliqué.

| Route | La ligne `FriendRequest` | La notification est… | Geste |
|---|---|---|---|
| `PATCH` accept/reject | reste, statut changé | **consommée** | marquer lue |
| `DELETE` (les deux sous-cas) | **partie** | **morte** — rien à afficher, rien où mener | retirer |

Même arbitrage, pour la même raison, que le rappel d'un message (`retractMessageNotifications`,
cycle 47), et même geste — le seul que les clients savent déjà recevoir (`notification:deleted`,
écouté par le web et par le SDK iOS), doublé d'un `notification:counts` sans lequel la cloche
resterait sur un compteur incluant des lignes que le serveur vient de supprimer.

## D4 (trois corollaires du caractère inconditionnel de la suppression)

1. **Aucun filtre `isRead`** — seule différence de prédicat avec le marquage. Une notification déjà
   lue est tout aussi morte qu'une non lue ; la laisser garderait dans la liste une ligne sans
   destination.
2. **Le destinataire est toujours `receiverId`**, quel que soit celui des deux qui a appelé :
   `createFriendRequestNotification` ne notifie que lui. Le scope `userId` reste la garde anti-IDOR
   que porte déjà le marquage — le retrait ne l'élargit pas.
3. **`context.friendRequestId` n'appartient qu'à `friend_request`.** Vérifié plutôt que supposé : le
   `friend_accepted` de l'expéditeur porte `context.conversationId`, jamais cette clé. Le retrait ne
   peut donc pas l'emporter au passage — y compris sur une demande ACCEPTÉE puis supprimée, la route
   ne filtrant pas sur `status`.

## D5 (forme de la requête) — supprimer les ids RELUS, pas le prédicat

La lecture passe par `$runCommandRaw` pour la raison déjà établie par le marquage (Prisma ne filtre
pas les chemins JSON sur MongoDB). Mais la suppression porte sur les ids **relus**, pas sur le
prédicat : l'ensemble supprimé et l'ensemble annoncé sont alors identiques par construction, et
aucune ligne ne peut disparaître sans son `notification:deleted`. C'est l'inverse du choix fait par
`retractMessageNotifications`, et délibérément : là-bas, filtrer sur le prédicat FERMAIT une course
avec l'éventail de notification du même message (cycle 48) ; ici il n'y a pas d'éventail — une
demande produit UNE notification, à sa création, longtemps avant. `singleBatch` ferme le curseur
côté serveur au lieu de le laisser ouvert.

## Plan
- [x] T1 — RED (service) : lecture par chemin JSON **sans** filtre `isRead`
- [x] T2 — RED (service) : suppression des ids relus + `notification:deleted` par ligne + un
      `notification:counts`
- [x] T3 — RED (service) : l'annonce vient APRÈS l'écriture durable
- [x] T4 — verrous (service) : aucune ligne → aucune suppression, aucune annonce ; userId
      non-ObjectId (session anonyme) → 0 sans requête ; Mongo en échec → 0 sans exception
- [x] T5 — RED (route) : les DEUX sous-cas retirent la notification du **receveur**
- [x] T6 — RED (route) : un retrait en échec ne fait pas échouer la route et n'emporte pas
      `friend_request:cancelled`
- [x] T7 — GREEN : `NotificationService.retractFriendRequestNotifications` + appel dans la route
- [x] T8 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T9 — changeset + CHANGELOG + ce relevé

## Vérification

Rouges observés sur les deux surfaces avant le correctif : la suite service ne COMPILAIT pas
(`retractFriendRequestNotifications` inexistante — TS2551 pointant sur
`createFriendRequestNotification`), les deux tests de route tombaient sur `Number of calls: 0`.
Après : 69/69 sur les deux fichiers, `tsc --noEmit` propre.

Suite gateway complète sous bun (parité CI) : **635 suites, 16 180 tests, tout vert** (479 s).
Couverture globale lignes **95,76 %** (95,65 % au cycle 26 relevé) — en hausse.

## Reste ouvert après ce cycle

- **`applyPostRemovalEffects` ne retire pas les notifications du post supprimé — même défaut, blast
  radius bien plus large. TÊTE DU PROCHAIN CYCLE.** Le cycle 47 nomme lui-même `applyPostRemovalEffects`
  comme « le jumeau côté post » de `applyMessageRemovalEffects` ; le jumeau a reçu l'audit, les liens
  de partage et les usages de sons, jamais les notifications. Or la suppression d'un post est un
  retrait DOUX (`deletedAt`), donc, comme pour le message, aucune cascade ne se déclenche : toutes
  les notifications portant `context.postId` (`post_like`, `post_comment`, `comment_reply`,
  `story_new_comment`, `friend_new_story`, `friend_new_post`, …) survivent avec l'extrait
  dénormalisé du contenu retiré. Le diagnostic du 2026-08-04 en compte **≈ 8 100 non lues** en
  production, contre une dizaine pour la famille demande d'amitié fermée ici. Deux différences de
  forme à traiter, aucune bloquante : le filtre n'est PAS scopé à un `userId` (un post notifie N
  destinataires, donc la relecture doit projeter `userId` et l'annonce se grouper par destinataire —
  `announceNotificationsRetracted` le fait déjà), et l'annonceur doit descendre jusqu'à
  `applyPostRemovalEffects`, qui ne reçoit aujourd'hui ni `NotificationService` ni port étroit (le
  patron existe : `PostSoundReleaser` dans le même fichier, `RetractedNotificationAnnouncer` côté
  message) — `PostService` n'a pas de `notificationService` dans son constructeur, mais les deux
  routes appelantes (`routes/posts/core.ts`, `routes/admin/posts.ts`) ont `fastify.notificationService`.
  L'écriture durable ne doit pas dépendre du câblage socket : port **optionnel**, comme
  `retractMessageNotifications(prisma, id, announcer?)`.
- **Aucune notification déjà écrite n'est rattrapée.** Le correctif ne vaut que pour les suppressions
  à venir ; les lignes orphelines des demandes déjà supprimées restent en base. Réparable par le
  patron des scripts existants (`repair-mention-user-ids.ts`) — action humaine, cette routine n'a
  aucun accès MongoDB.
- **Le push APNs/FCM déjà délivré n'est pas rappelé.** Retirer la ligne éteint la liste in-app et la
  cloche, pas la bannière déjà posée sur l'écran verrouillé. Fermer ça demanderait un push silencieux
  de collapse — chantier de contrat, pas correctif.
- **`login_new_device` reste sans contexte de consommation** (159 non lues en prod au 2026-08-04) :
  aucune des trois clés supportées par `markContextNotificationsAsRead` ne s'y applique, et sa seule
  sortie est le read-by-types. Relevé, pas un défaut de correction évidente.
- Hérités et inchangés : l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ;
  `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9) ;
  `getMentionsForMessage`/`getRecentMentionsForUser` n'ont aucun consommateur d'écran.

---

# Cycle 49b — Le champ existait, le prédicat existait, personne ne les avait présentés

> **Session parallèle.** Deux sessions ont livré un cycle 49 en même temps, sur des sujets sans
> recouvrement : le 49 ci-dessous ferme la quatrième porte d'entrée d'une conversation (`unban`),
> celui-ci la péremption des notifications. Aucun fichier commun hors ce relevé. Le 49 note en
> backlog que « la péremption (`expiresAt`) sans équivalent au rappel » reste ouverte — c'est exact
> à l'instant où il a été écrit, et c'est précisément ce que ce lot ferme.

Le cycle 48 a laissé la péremption en tête de son backlog, correctement décrite :

> `createMessageNotification` refuse un message déjà expiré, mais un message qui expire APRÈS la
> création de sa notification laisse la ligne — et son extrait — en base. Contrairement au rappel, la
> péremption n'est pas un événement : personne ne passe à l'instant T. Il faudrait un balayage, ou une
> lecture qui filtre.

Une seule chose y était fausse, et elle change le diagnostic : **l'extrait ne reste pas**, parce qu'il
n'a jamais été écrit. `protectedPreview` remplace le contenu d'un message éphémère par un libellé
générique AVANT la création. Ce qui survit n'est donc pas une fuite de contenu — c'est une ligne qui
ne montre rien, ne mène nulle part (`action: view_message` ouvre un message absent), et porte un badge
non lu que plus aucune lecture ne peut décrémenter : on ne lit pas ce qui n'est plus là.

## Ce que l'enquête a trouvé

`Notification.expiresAt` existe depuis l'origine du modèle. `formatNotification` le publie,
`notificationStateSchema` le laisse traverser Fastify, `packages/shared/types/notification.ts` en
dérive `isNotificationExpired`, et `isNotificationUnread` s'en sert pour définir « non lue ET valide ».
Toute la moitié LECTURE de la règle était déjà écrite, jusqu'aux clients.

Et aucun producteur n'écrivait la colonne. `createNotification` accepte un `expiresAt` que personne ne
lui passait ; les sept lectures serveur l'ignoraient. Deux moitiés d'une même règle, mortes chacune de
son côté, séparées par une ligne de plomberie. Il n'y avait pas de mécanisme à inventer — seulement à
brancher.

## Les trois choix

**L'échéance vient du message, jamais de l'appelant.** Le chemin `new_message` la prend de sa
relecture VIVANTE — celle que la garde d'admission fait déjà, donc zéro lecture ajoutée. La réponse et
les mentions la reçoivent de l'éventail, qui la tient déjà dans `FanOutMessage`, plutôt que de la
relire une fois par destinataire : le coût que les cycles 44 et 47 ont refusé deux fois. Les deux
sources ne peuvent pas diverger — `Message.expiresAt` est écrit à l'insertion et jamais modifié
ensuite (vérifié : aucun `message.update` ne le touche).

**Un filtre à la lecture, pas un balayage.** La péremption n'est pas un événement ; un balayage
périodique laisserait toujours une fenêtre entre l'expiration et son passage. Le filtre est exact à la
milliseconde et ne coûte aucune écriture. Contrepartie assumée, et c'est l'inverse du cycle 48 : là où
le rappel devait SUPPRIMER (la ligne détenait une copie du contenu), ici masquer suffit — la ligne ne
détient rien.

**Sept lectures, un seul prédicat.** `emitCountsUpdate` porte déjà en commentaire la trace d'une
divergence passée entre le prédicat du badge et celui de la liste (`readAt: null` contre
`isRead: false`). Sept copies de la nouvelle condition l'auraient rejouée : liste REST, son total,
compte non-lus REST, les deux compteurs socket, le badge embarqué dans le push, le digest e-mail. Une
unité, `visibleNotificationsWhere`.

## Plan

- [x] T1 — unité partagée `visibleNotificationsWhere`, appelée par les sept lectures
- [x] T2 — RED : le compte non-lus laisse tomber la ligne dont le message a expiré
- [x] T3 — témoins : une ligne sans échéance, et une échéance à VENIR, restent comptées
- [x] T4 — RED : la liste ET son total excluent la ligne expirée (pagination fantôme sinon)
- [x] T5 — RED : les compteurs poussés par socket disent la même chose que la liste
- [x] T6 — RED : la route `/notifications` masque la ligne expirée, liste et total
- [x] T7 — RED : le digest ne relance personne pour une ligne expirée
- [x] T8 — RED : `new_message`, réponse et mention héritent de l'échéance du message
- [x] T9 — index `[userId, isRead, expiresAt]` + migration 010 (idempotente, crée avant de supprimer)
- [x] T10 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T11 — changeset + ce relevé

## Revue

Sonde en trois temps, parce que le lot a deux moitiés indépendantes et qu'une seule sonde n'aurait
prouvé qu'une moitié :

1. filtre de lecture neutralisé → **5 rouges**, et ce sont les cinq lectures (compte non-lus, liste +
   total, compteurs socket, route REST, digest) ;
2. estampille producteur neutralisée → **2 rouges** (message éphémère, mention) ;
3. plomberie de l'éventail neutralisée → **2 rouges** (réponse + mention, et le témoin `null`).

Les trois témoins de lecture — ligne sans échéance, échéance à venir, message ordinaire — sont verts
avant comme après. Celui de l'échéance à venir n'est pas décoratif : il est le seul à distinguer un
`gt` d'un `lt`, une inversion qui masquerait exactement les notifications qu'il faut montrer.

Le double Prisma des tests n'enregistre pas les `where` : il les **évalue** contre des lignes
(`__tests__/helpers/notification-where.ts`, partagé par les trois fichiers). Un test qui compare la
clause reçue à celle qu'il attend ne vérifie que sa propre copie — il passe aussi bien sur une clause
juste que sur une clause fausse écrite deux fois. Le double jette sur toute clé qu'il ne sait pas
interpréter, pour qu'un filtre d'une autre forme échoue au lieu d'être ignoré en silence.

L'index n'est pas un ajout mais un REMPLACEMENT : `[userId, isRead]` est un préfixe de
`[userId, isRead, expiresAt]`, donc rien ne perd son plan et le coût d'écriture ne monte pas d'un
index. Sans lui, le `$or` serait un filtre résiduel — un fetch de document par candidat sur un
compteur qui tourne une fois par destinataire de CHAQUE message.

## Reste ouvert après ce cycle

- **Les clients ne s'auto-périment pas.** Une liste laissée ouverte à l'instant de l'expiration garde
  la ligne jusqu'au prochain rafraîchissement : le serveur ne la sert plus, mais rien ne l'annonce.
  `isNotificationExpired` existe côté partagé et n'est appelé nulle part ; le web l'importe sans
  l'utiliser. Fermable côté client sans rien changer au serveur.
- **Le parseur socket du web lit à la RACINE ce que le serveur envoie sous `state`.**
  `notification-socketio.singleton.ts` lit `data.expiresAt` / `data.isRead` / `data.createdAt` (avec
  un commentaire affirmant que le backend les met à la racine) alors que `formatNotification` les met
  dans `state`. Conséquence aujourd'hui bénigne — `isRead` retombe sur `false` et `createdAt` sur
  `new Date()`, ce qu'une notification neuve est de toute façon — mais `expiresAt` n'atteint jamais le
  client par ce chemin. Défaut réel, non instruit ici.
- **Une réaction sur un message éphémère n'hérite d'aucune échéance.**
  `createReactionNotification` lit déjà le message (`select: { content: true }`) : y ajouter
  `expiresAt` serait gratuit. Écarté de ce cycle pour ne pas mélanger deux familles de producteurs ;
  le geste est identique.
- **L'édition d'un message éphémère produit une mention sans échéance.**
  `messageMentions.notifyNewlyMentioned` est le second appelant de
  `createMentionNotificationsBatch` et son `MentionTargetMessage` ne porte pas `expiresAt` — il
  faudrait le remonter jusqu'à ses propres appelants. Le nouveau paramètre est optionnel : ce chemin
  garde exactement son comportement d'avant.
- **`getUserNotifications` n'a aucun appelant en production.** La route `/notifications` refait la
  requête à la main plutôt que d'appeler le service ; seuls des tests atteignent la méthode. Les deux
  ont été traitées ici (elles répondent à la même question), mais la duplication elle-même reste, et
  c'est elle qui rendait la divergence possible.
- **Les points hérités restent ouverts tels quels** : le push DÉJÀ remis reste sur l'appareil au
  rappel (aucun `apns-collapse-id` ni retrait à distance) ; les mentions du chemin de lien attendent
  l'extraction qui écrit `Message.validatedMentions` ; aucun client iOS n'écoute `link:message:new` ;
  les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio ; l'arbitrage
  `delete-for-me` du cycle 12 attend une validation humaine.

---

# Cycle 49 — Débannir n'est pas une porte d'entrée, mais ça en était devenu une

Tête prise là où le cycle 40 avait laissé sa propre règle. Ce cycle-là avait unifié « que faire de
la ligne `Participant` déjà là quand quelqu'un (re)entre » dans `resolveConversationEntry`, et il
avait énuméré les portes : le lien de partage, l'ajout de participant, l'invitation. Trois. Il en
existait une quatrième, que personne n'avait comptée parce qu'elle ne s'appelle pas « entrer » :
`PATCH …/participants/:userId/unban`.

## Ce que les deux moitiés du geste écrivaient

```ts
ban:   data: { bannedAt: now,  isActive: false, leftAt: now  }
unban: data: { bannedAt: null, isActive: true,  leftAt: null }
```

Sans condition, l'une comme l'autre. Sur le cas qu'on imagine en les lisant — bannir un membre
actif, puis le débannir — elles sont exactes et inverses l'une de l'autre.

Mais `ban` cherche sa cible **sans filtrer `isActive`**, et c'est délibéré : bannir un ancien membre
est précisément ce qui l'empêche de revenir par un lien de partage, `resolveConversationEntry`
refusant toute entrée sur `bannedAt`. Cette capacité est réelle, elle est même la raison d'être du
`bannedAt` dans la décision du cycle 40, et ce cycle ne la retire pas.

Le cas existe donc, et sur lui les deux écritures font autre chose que ce que leurs noms annoncent.

### Lot A — bannir effaçait le départ

`leftAt` était réécrit à l'instant du bannissement alors qu'il datait un départ volontaire vieux de
plusieurs mois. L'information n'était pas remplacée par une meilleure : elle était perdue. Et c'est
elle, précisément, qui aurait permis à l'autre moitié de savoir quoi rendre — le défaut du Lot B
n'était pas réparable après coup parce que le Lot A avait détruit sa preuve.

### Lot B — débannir faisait entrer

`{ isActive: true, leftAt: null }` sur une personne que le bannissement n'avait pas sortie — parce
qu'elle était déjà dehors — n'annule rien : **ça crée une appartenance.** Suivent, dans la même
requête, les trois choses qu'une porte d'entrée fait et qu'un débannissement ne devrait pas faire :

1. **Le rang périmé revient.** Aucune des trois portes reconnues ne rend son rang à un revenant —
   « un rang se donne, il ne se retrouve pas dans une ligne périmée » (leçon 89, inscrite dans
   l'en-tête de `conversationEntryAdmission.ts`). Celle-ci le rendait, `role` n'étant jamais réécrit.
2. **Les sockets sont rebranchées de force.** `joinUserToConversationRoom` sur quelqu'un qui était
   parti de lui-même : il reçoit à nouveau les messages d'une conversation qu'il avait quittée.
3. **La conversation réapparaît chez lui**, sans qu'il ait rien demandé et sans qu'aucun chemin
   d'invitation ait été emprunté.

Le correctif ne change pas ce que le geste veut dire, il le rend exact : **un débannissement rend ce
que le bannissement a pris, ni plus ni moins.** Le bannissement, lui, est levé dans TOUS les cas —
sinon « débannir » ne lèverait rien et toutes les portes continueraient de refuser. Une personne
partie d'elle-même puis bannie puis débannie redevient donc libre de revenir par une porte, ce qui
est exactement l'état que `resolveConversationEntry` sait lire (`rejoin`).

### La trace, sans champ nouveau

Savoir laquelle des deux histoires s'est produite ne demande aucune colonne de plus. Une fois que
bannir cesse d'écraser `leftAt`, le bannissement laisse lui-même sa réponse dans la ligne :

| ce qui s'est passé              | `leftAt`            | `bannedAt` |
|---------------------------------|---------------------|------------|
| banni alors qu'il était membre  | instant du ban      | le même    |
| banni alors qu'il était parti   | son départ, intact  | plus tard  |

L'égalité est **exacte par construction** — les deux champs reçoivent le même objet `Date`, jamais
deux lectures d'horloge — et non une comparaison à la milliseconde près qu'une coïncidence pourrait
tromper. Les lignes écrites avant ce cycle portent toutes cette égalité, puisque l'ancien
bannissement écrivait les deux ensemble : elles conservent donc à l'identique le comportement
qu'elles ont toujours eu. **Aucune réparation de base n'est nécessaire** — c'est la première fois
depuis le cycle 27 qu'un correctif de cette famille ne laisse pas un script derrière lui, et c'est
le choix de la trace qui l'achète.

La décision vit dans une unité pure, `services/conversations/conversationBanState.ts`, à côté de
celle du cycle 40 dont elle est le complément : `conversationEntryAdmission` dit qui peut entrer,
`conversationBanState` dit ce qu'un bannissement prend et ce qu'un débannissement rend.

## Lot C — le débannissement n'oubliait pas la ligne mise en cache

`participant-lookup-cache` mémorise `isActive` pendant 30 s pour éviter une lecture par message
envoyé. Son en-tête énumère les sites qui l'invalident : « leave/ban/kick/delete-for-me ». Le
débannissement n'y est pas, et ne l'appelait pas.

Conséquence, sur le cas nominal cette fois — bannir un membre actif puis le débannir : pendant une
demi-minute, la personne réintégrée restait `isActive: false` pour le chemin d'envoi, et chacun de
ses messages était refusé sans qu'aucune ligne en base ne le justifie. Le même motif que les Lots A
et B, à un étage différent : une moitié du geste tient une obligation que l'autre moitié ignore.

## Lot D — les compteurs de membres suivaient l'ÉVÉNEMENT, pas le fait

`conversation:participant-banned` et `conversation:participant-unbanned` ne disaient rien de leur
effet sur l'effectif ; les clients le déduisaient de la réception.

- **Web** (`use-socket-cache-sync`) : `memberCount - 1` / `+ 1` sans condition.
- **iOS** (`ConversationListViewModel`) : idem, **puis `schedulePersist()`** — la valeur fausse est
  écrite dans le cache local, donc la dérive survit au redémarrage.
- **Android** : expose bien les deux événements mais n'en dérive aucun effectif. Rien à corriger —
  vérifié, pas déduit (leçon 88).

Les deux événements portent maintenant `membershipEnded` / `membershipRestored`. Optionnels, et leur
absence se lit comme `true` : un serveur antérieur à ce contrat ne bannissait qu'en retirant, et lire
son silence comme « aucun effet » aurait fait ignorer tous ses bannissements. Côté iOS la lecture est
nommée (`didEndMembership`, `didRestoreMembership`) plutôt que laissée à un `== true` que le prochain
appelant écrirait de travers.

## Preuve

**24 tests neufs, RED observé avant chaque correctif.**

- `services/conversations/conversationBanState.test.ts` — 11 cas sur l'unité pure, dont les deux
  compositions ban∘unban qui énoncent l'involution recherchée.
- `routes/conversations/ban-departed-member.test.ts` — 8 régressions au niveau route. Le double
  Prisma **discrimine sur le `where` ET projette sur le `select`** : un champ reste indisponible à
  la route tant qu'elle ne l'a pas demandé, exactement comme Prisma. Sans cette projection,
  « la route lit `leftAt` » serait vrai dans le test et faux en production — c'est la précaution que
  le cycle 39 avait dû inventer pour le Lot B, réutilisée ici pour la même raison.
- `use-socket-cache-sync.test.tsx` — 2 cas sur la dérive du compteur web.
- `MessageSocketMiscEventTests.swift` — 4 cas de décodage SDK, dont les deux qui fixent la lecture
  de l'absence (`nil ⇒ true`).

Suites vertes : gateway complet, `tsc --noEmit` propre ; web `use-socket-cache-sync` (57/57), et
aucune erreur `tsc` nouvelle sur `apps/web` (1184 avant, 1184 après — condition préexistante).

## L'audit qui a mené ici, et ce qu'il a ÉCARTÉ

La question du cycle 37 — « quelles appartenances sont jointes sans `isActive` ? » — a été balayée
mécaniquement cette fois plutôt que site par site : **784** lectures `prisma.participant.find*` dans
le gateway, dont **12** de forme appartenance (`where` portant à la fois `userId` et
`conversationId`, sans `isActive`). Les douze ont été classées, et **onze sont légitimes** :

- **Faux positifs de la recherche** (2) — `MeeshySocketIOManager` cherche par `id` (clé primaire),
  `conversationId` n'apparaît que dans le `select`.
- **Résolutions, pas des admissions** (2) — `CallService` résout le `Participant.id` de l'initiateur
  d'un appel ; filtrer sur `isActive` ferait échouer la résolution au lieu de refuser un accès.
- **Historique, où le filtre serait le défaut** (1) — `CallService.listHistory` charge le pair d'une
  conversation directe pour nommer un appel passé. Un pair qui a quitté depuis doit rester nommé :
  ajouter `isActive` effacerait le nom sur les entrées d'historique les plus anciennes.
- **Réamorçage de la conversation globale** (4, `InitService`/`AuthService`) — la recherche sert à ne
  PAS re-ajouter quelqu'un ; trouver la ligne inactive d'un partant volontaire et s'abstenir est
  exactement le comportement voulu.
- **Classements d'administration** (1) — `admin/system-rankings` énumère les admins de conversation ;
  écart de qualité de donnée, sans conséquence d'accès, laissé tel quel.
- **`ban` lui-même** (1) — délibérément sans filtre, cf. plus haut ; c'est le fil qui a mené à ce
  cycle.

Ce que le balayage a rendu n'est donc pas un douzième défaut de la même forme : c'est le constat que
**la famille est propre**, et que le défaut restant était de l'autre côté du geste — non pas « qui
peut entrer » mais « ce que le geste inverse rend ». La question du cycle 37 peut être considérée
comme épuisée sur le gateway.

## Reste ouvert après ce cycle

- **Qui a le droit de débannir ? Pas le même que celui qui a le droit de bannir.** `ban` exige
  seulement un rang STRICTEMENT supérieur à celui de la cible — un `moderator` peut donc bannir un
  `member` — mais `unban` exige le rang `admin`. Un modérateur peut bannir sans pouvoir défaire son
  propre geste. C'est cohérent à l'intérieur de chaque moitié, donc ce n'est pas un défaut au sens
  de ce cycle, mais c'est une asymétrie de la même famille que celles des cycles 34 et 38b
  (édition/suppression, appartenance active de l'auteur) — **les trois attendent le même arbitrage
  produit et devraient être tranchées ensemble**, pas une par une.
- **Rien ne borne la durée d'un bannissement.** `bannedAt` est un instant, jamais une échéance : un
  bannissement est définitif jusqu'à ce qu'un admin passe. WhatsApp et Telegram offrent tous deux un
  bannissement temporaire. Capacité absente, pas défaut — à instruire comme produit.
- **`resolveBanWrite` ne dit pas ce qu'un ancien membre banni voit de la conversation.** Il ne
  change rien à l'état visible : la ligne était déjà inactive, `GET …/messages` la refusait déjà.
  Vérifié, mais non couvert par un test de bout en bout faute d'accès base.
- **Les points hérités du cycle 48 restent ouverts tels quels** : la péremption (`expiresAt`) sans
  équivalent au rappel ; le push déjà remis qui reste sur l'appareil ; les mentions du chemin de lien
  sans extraction ; aucun client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de
  lien hors pipeline audio ; l'arbitrage `delete-for-me` du cycle 12.
- **`eslint` ne peut toujours pas tourner sur le gateway** : aucun `eslint.config.js` depuis la
  migration ESLint v9. Condition préexistante, non couverte par la CI.

---

# Cycle 48 — La course que le cycle 47 a nommée sans la fermer

Le cycle 47 a fait retirer, au rappel d'un message, les notifications qu'il avait produites, et il a
laissé la course ouverte — écrite dans le code même, en commentaire du `deleteMany` :

> une notification créée entre la lecture et l'écriture (l'éventail court après le retrait) part
> avec les autres. Elle n'est alors pas annoncée — un écran en retard, **à corriger par une garde
> d'admission côté éventail**.

La première moitié est juste. La seconde nomme le mauvais remède, et c'est le point de ce cycle.

## Pourquoi une garde d'ADMISSION ne pouvait pas fermer cette fenêtre

Le `deleteMany` du rappel filtre sur `messageId` : il emporte donc tout ce qui existe À SON INSTANT,
et rien de ce qui naît après lui. La ligne qui fuit n'est pas celle créée « entre la lecture et
l'écriture » — celle-là part bien avec les autres — c'est celle créée APRÈS le balayage.

Une relecture en TÊTE d'éventail rétrécit la fenêtre sans jamais la fermer : `deletedAt` peut être
committé entre la relecture et la création. C'est exactement le trou que porte DÉJÀ la garde de
`createMessageNotification`, présente depuis longtemps et documentée comme telle. L'étendre aux deux
autres créateurs aurait donc payé une lecture par ENVOI de message — le coût que le cycle 47 avait
lui-même chiffré pour reculer — sans clore quoi que ce soit.

## Le geste qui ferme

Une relecture de `deletedAt` à l'AUTRE bout, après l'éventail.

Soit D l'instant du commit de `deletedAt`, X celui du `deleteMany` du rappel (X > D par
construction : les effets de retrait tournent après le commit), [c1..cn] les créations de l'éventail
et R sa relecture finale (R > cn) :

- **X > cn** — le `deleteMany` du rappel voit toutes nos lignes. Rien ne survit.
- **X < cn** — alors D < X < cn < R, donc R lit `deletedAt` non nul et l'éventail retire lui-même.

Aucun troisième cas. La fenêtre est fermée, pas rétrécie.

Le placement est aussi ce qui la rend gratuite. Après `onFanOut`, les notifications sont déjà
parties : la lecture n'entre pas dans le chemin de latence du push, là où la garde d'admission
l'aurait allongé pour TOUS les envois. C'est l'inverse exact du compromis que le cycle 47 avait
refusé.

## Trois choix, aucun cosmétique

**La garde porte sur l'audience VISÉE, pas sur le compte rendu.** `onFanOut` dit ce qui est
réellement parti ; un créateur qui écrit sa ligne puis jette la laisserait derrière lui avec un
compteur à zéro, donc sans relecture. `owesReplyNotification || mentions.length || candidats.length`
ne peut pas rater ce cas, et laisse toujours l'éventail sans destinataire ne rien payer.

**`deletedAt` non nul est la SEULE preuve d'un rappel.** Un message introuvable à la relecture ne
fait rien retirer : aucun chemin du gateway ne supprime un message physiquement (vérifié — pas un
seul `message.delete`/`deleteMany`), et retirer sur une non-preuve viderait des inboxes. Le sens sûr
de l'erreur est ici de GARDER, à l'inverse du rappel lui-même.

**Le retrait devient une unité partagée.** `retractMessageNotifications` sort de `private` :
fermer une course demande le même geste aux deux bouts — au rappel pour les lignes déjà écrites, en
fin d'éventail pour celles que le rappel n'a pas pu voir. Deux copies auraient divergé comme les
listes d'effets de suppression avaient divergé avant `applyMessageRemovalEffects`.

## Plan

- [x] T1 — unité partagée `retractMessageNotifications`, appelée par les deux bouts
- [x] T2 — RED : un rappel qui court après l'éventail voit ses lignes retirées
- [x] T3 — témoin : un message vivant garde ses notifications
- [x] T4 — RED : les lignes emportées sont annoncées à leurs destinataires
- [x] T5 — témoin : un éventail sans destinataire ne relit pas le message
- [x] T6 — témoin : un message introuvable ne fait rien retirer
- [x] T7 — RED : une relecture qui jette n'emporte ni l'éventail ni son compte rendu
- [x] T8 — gates : 633/633 suites, 16143 tests, `tsc --noEmit` propre
- [x] T9 — changeset + CHANGELOG + ce relevé

## Revue

Sonde : `if (attemptedFanOut)` neutralisé en `if (false && attemptedFanOut)` — **3 rouges** sur 6
tests neufs, et ce sont les bons trois (T2, T4, T7). Les trois autres sont des témoins verts avant
comme après, par construction : ils disent ce que le correctif ne doit PAS faire.

Le mock `message.findUnique` du fichier de test a dû apprendre à aiguiller sur `where.id`. Deux
questions distinctes passent désormais par ce délégué et elles ne portent pas sur le même message —
l'auteur du message CITÉ avant l'éventail, l'état vivant du message ENVOYÉ après. Un double qui
rendrait la même ligne aux deux ne pourrait pas distinguer un défaut de l'un du défaut de l'autre.

Première version de la garde : `reply || mentions > 0 || regular > 0`. Elle a fait tomber T2 et T4,
et c'est le test qui a corrigé le code, pas l'inverse — les doubles rendent `null`/`0`, donc « rien
créé », donc pas de relecture. En cherchant pourquoi, le vrai défaut apparaît : ce compteur ne dit
pas ce qui a été ÉCRIT, il dit ce qui a été écrit ET rendu. Un créateur qui commit puis jette
échappe aux deux. D'où le passage à l'audience visée.

Couverture des trois fichiers touchés : 100 % des lignes, `retractMessageNotifications.ts` à 100 %
sur les quatre métriques.

## Reste ouvert après ce cycle

- **La péremption (`expiresAt`) n'a pas d'équivalent.** `createMessageNotification` refuse un
  message déjà expiré, mais un message qui expire APRÈS la création de sa notification laisse la
  ligne — et son extrait — en base. Contrairement au rappel, la péremption n'est pas un événement :
  personne ne passe à l'instant T. Il faudrait un balayage, ou une lecture qui filtre sur
  `Message.expiresAt` à l'affichage de l'inbox. Chantier distinct, à instruire séparément.
- **Le push DÉJÀ remis reste sur l'appareil** (hérité du cycle 47). Aucun `apns-collapse-id` ni
  retrait à distance n'est envoyé au rappel. Ce cycle rend d'autant plus probable qu'un push parte
  puis soit retiré en base : la relecture d'après-éventail retire la LIGNE, pas la bannière déjà
  affichée. Fermable côté APNs par un push `mutable-content` de retrait.
- **Les points hérités restent ouverts tels quels** : les mentions du chemin de lien attendent
  l'extraction qui écrit `Message.validatedMentions` ; aucun client iOS n'écoute `link:message:new` ;
  les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio ; l'arbitrage
  `delete-for-me` du cycle 12 attend une validation humaine.
- **Fermé ce cycle — l'audit des émetteurs par room personnelle contre la clé `userId ?? id`.**
  Le backlog le portait depuis le cycle 25b, en soupçon (« rien ne garantit que les autres la
  respectent »). Instruit par recherche et non par déduction, comme il le demandait : 53 sites
  `ROOMS.user(` sur 19 fichiers. Le résultat est propre. `emitConversationPreviewUpdate`, celui que
  le backlog nommait, charge `id` ET `userId` et émet par `participantUserRooms()` — le helper
  canonique — avec la règle inscrite en commentaire au-dessus du `select`. Les sites qui passent un
  identifiant nu le tiennent d'un `User.id` (destinataire de notification, créateur de conversation,
  liste de participants inscrits), jamais d'un `Participant`. Une seule exception délibérée, et déjà
  documentée en tant que telle : `callEndedFanout` filtre `userId: { not: null }` parce que
  l'audience de terminaison doit refléter l'audience d'INVITATION — `call:initiated` porte le même
  filtre, un participant sans compte n'est jamais sonné, et s'il rejoint l'appel il est de toute
  façon dans `ROOMS.call(callId)`. Le point sort du backlog.
- **Fermé depuis le cycle 47, vérifié ce cycle** : « iOS n'écoute pas `notification:deleted` » n'est
  plus vrai. `MessageSocketManager` l'écoute et le publie sur `notificationDeleted`, que
  `NotificationToastManager` consomme. Le point sort du backlog.

---

# Cycle 47 — L'inbox de notifications gardait une COPIE du message rappelé

Le cycle 46 a sorti le message rappelé de l'inbox de mentions et a laissé, écrite noir sur blanc,
la piste suivante : « la notification de mention survit au rappel — la ligne `Notification` et le
push déjà remis portent le contenu du message ». Elle était juste, et elle sous-estimait la portée :
ce ne sont pas les mentions, ce sont les **cinq** types de notification ancrés sur un message.

## Pourquoi le correctif du cycle 46 ne pouvait pas couvrir celui-ci

Les deux défauts se ressemblent — un message rappelé reste lisible ailleurs — et ils demandent des
correctifs de nature OPPOSÉE. C'est le point à retenir de ce cycle.

Une ligne `Mention` ne porte qu'une clé étrangère. Le contenu qu'elle affiche, la route va le
chercher dans `Message.content` à chaque appel : ajouter `deletedAt: null` à l'admission suffit, et
c'est réversible — restaurer le message rendrait sa mention.

Une ligne `Notification` porte une **copie**. `createNotification` écrit `content` et
`metadata.messagePreview` au moment de la création, à partir de l'extrait qu'on lui passe, et ne
relit jamais le message ensuite. Il n'existe aucun filtre à la lecture qui puisse rattraper ça :
la donnée est là, dénormalisée, servie telle quelle par `GET /notifications` et par
`NotificationFormatter`. Le seul geste qui la retire est de retirer la ligne.

## Ce que le rappel laissait derrière lui

Rien ne supprime la ligne. Le `onDelete: Cascade` déclaré sur `Notification.message` demande une
suppression **physique** ; le retrait doux ne bascule que `deletedAt`, donc la ligne `Message` reste
et la `Notification` avec elle. **Troisième occurrence du même mécanisme** après les `TrackingLink`
(cycle 43) et les `Mention` (cycle 46) — à ce stade, la question « qu'est-ce qu'une cascade ne fera
PAS ? » mérite d'être posée systématiquement devant tout modèle qui référence `Message`.

Concrètement : Bob écrit « désolé @alice, [quelque chose qu'il regrette] », puis supprime. La
conversation le perd chez tout le monde, en direct. Alice le garde dans sa liste de notifications —
extrait intégral, identité de l'auteur, titre de la conversation — à chaque ouverture, sans date de
fin. Et pas seulement Alice : la réponse (`message_reply`), la réaction (`message_reaction`), le
message régulier (`new_message`) et la traduction prête (`translation_ready`) écrivent tous
`context.messageId`, donc tous laissaient une ligne derrière eux.

Un détail qui n'en est pas un : `createMessageNotification` porte DÉJÀ, depuis longtemps, une garde
de course explicite — elle relit le message juste avant l'éventail et abandonne sur `deletedAt`,
avec ce commentaire : « we MUST NOT leak the original content via the banner ». La règle était donc
déjà énoncée dans ce fichier, pour la fenêtre de quelques centaines de millisecondes de l'éventail.
Personne ne l'avait étendue à la fenêtre qui compte vraiment — celle qui s'ouvre APRÈS et ne se
referme jamais.

## Le correctif

Un quatrième effet dans `applyMessageRemovalEffects`, l'unité que les trois écrivains interactifs de
`deletedAt` traversent. C'est la raison d'être du fichier : un effet ajouté là s'applique aux trois,
et il n'y a plus de « second écrivain » à tenir à jour de mémoire.

Trois choix, aucun cosmétique.

**Le filtre porte sur `messageId`, pas sur la conversation.** `createNotification` renseigne la
colonne depuis `context.messageId` pour les cinq types ancrés : une seule clé les couvre tous. Le
témoin dédié — les notifications d'un AUTRE message de la même conversation restent — est celui qui
tomberait si quelqu'un élargissait.

**Retrait, pas neutralisation du contenu.** Une notification dont le message n'existe plus n'a rien
à afficher ET rien où mener : son `action: view_message` ouvrirait une conversation sur un message
absent. C'est aussi le seul geste que les clients savent déjà recevoir — `notification:deleted` est
écouté par le web depuis le cycle qui l'a introduit.

**L'écriture durable ici, l'annonce déléguée.** Supprimer des lignes non lues change le badge : sans
annonce, la cloche resterait sur un compteur incluant des lignes que le serveur vient de supprimer,
jusqu'au prochain démarrage à froid — une incohérence que le correctif aurait CRÉÉE. Mais l'écriture
ne doit pas dépendre du câblage socket. D'où le port étroit `RetractedNotificationAnnouncer`, sur le
modèle du `PostSoundReleaser` du jumeau côté post, dont le défaut est le `NotificationService`
PARTAGÉ (le seul câblé avec `io`) : `notification:deleted` par ligne vers la room de SON
destinataire, puis **un seul** `notification:counts` par destinataire quel qu'ait été son nombre de
lignes. Sans annonceur — worker, script, test — les lignes partent quand même.

## Plan

- [x] T1 — RED : les notifications du message rappelé sortent de la base
- [x] T2 — témoin : celles d'un AUTRE message restent (vert avant ET après)
- [x] T3 — RED : chaque ligne retirée est annoncée à son destinataire
- [x] T4 — RED : le retrait a lieu même sans annonceur câblé
- [x] T5 — RED : une annonce qui jette n'emporte pas le retrait déjà committé
- [x] T6 — les quatre effets restent indépendants (l'échec de l'un n'emporte pas les autres)
- [x] T7 — GREEN : `retractMessageNotifications` + `announceNotificationsRetracted`
- [x] T8 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T9 — changeset + CHANGELOG + ce relevé

## Revue

Le double mérite d'être noté, pour la raison inverse de celui du cycle 46. Là-bas, il fallait qu'un
`where` absent laisse la ligne rappelée REVENIR. Ici, il faut qu'un `where` absent fasse disparaître
TROP : c'est la sémantique de Prisma (`deleteMany({})` supprime tout), et c'est la seule façon dont
le témoin T2 puisse échouer sur une garde manquante. Le double traite donc `undefined` comme
« aucune contrainte » aux deux bouts, `findMany` comme `deleteMany`. Les deux directions de l'erreur
sont couvertes par la même mécanique.

Quatre rouges observés sur le retrait (sonde : l'appel désactivé, 4 tests tombent, 3 restent verts
— exactement les trois qui doivent l'être des deux côtés). Un cinquième sur la déduplication des
compteurs (sonde : `Set` remplacé par la liste brute, le test « une seule fois par destinataire »
tombe).

Placement dans la liste des effets : le retrait passe en deuxième, juste après le décompte des
compteurs et avant les deux effets qui interrogent la conversation. C'est le seul des quatre dont le
retard se lit comme une fuite — le contenu rappelé reste affiché tant qu'il n'a pas eu lieu — et il
ne dépend d'aucun des trois autres.

## Reste ouvert après ce cycle

- **La fenêtre de course de l'éventail n'est pas fermée pour la réponse et les mentions.** Une
  notification créée APRÈS le passage du retrait survit — et n'est même pas annoncée, puisque le
  `deleteMany` la balaie sans que personne l'ait relue. `createMessageNotification` porte sa propre
  garde (relecture + abandon sur `deletedAt`) ; `createMentionNotification` et
  `createReplyNotification` n'en ont pas. Le bon endroit est `notifyMessageRecipients` — un seul
  point d'entrée, une seule relecture pour les trois créateurs et tous les destinataires, au lieu
  d'une par destinataire. Coût mesuré à l'avance : +1 lecture par ENVOI de message sur le chemin
  chaud, ce qui est la raison pour laquelle ce cycle ne l'a pas prise — à instruire contre les
  objectifs de débit avant de l'ajouter.
- **iOS n'écoute pas `notification:deleted`.** Le web le traite (`use-notifications-manager-rq`,
  `notification-socketio`) ; aucune occurrence dans `apps/ios` ni `packages/MeeshySDK`. La liste iOS
  ne retirera donc la ligne qu'au prochain `GET /notifications`. Correct au fond, en retard à
  l'écran — et c'est un diff `apps/ios` + SDK, donc une autre lane.
- **Le push DÉJÀ remis reste sur l'appareil.** Aucun `apns-collapse-id` ni retrait à distance n'est
  envoyé au rappel. Le contenu affiché en bannière avant la suppression y demeure jusqu'à ce que la
  personne l'écarte. Fermable côté APNs (push `mutable-content` de retrait), chantier propre.
- **Le balayage des messages vides (`MaintenanceService`, 4e écrivain) ne retire rien.** Il
  n'appelle délibérément pas `applyMessageRemovalEffects` — un message au contenu blanc ne porte
  aucun lien à désactiver. Il laisse en revanche ses `Notification` pendantes. Fuite nulle (le
  contenu était vide) mais lignes orphelines pointant vers un message retiré : à traiter avec le
  décompte des compteurs, que ce balayage ne peut pas faire non plus.
- **Les mentions ne sont pas propagées en temps réel** (reconduit du cycle 46) : `message:deleted`
  part vers les salons de conversation, aucun signal ne dit à un client affichant l'inbox de
  mentions de retirer la ligne.
- **`UserMessageDeletion` est écrite et lue par personne** (reconduit du cycle 46) — arbitrage
  `delete-for-me` en attente de validation humaine depuis le cycle 12.
- Reconduits des cycles 44/45 : les compteurs déjà dérivés restent en base ; le plancher reste
  absent des décréments ; `emitConversationPreviewUpdate` et les autres émetteurs par room
  personnelle n'ont pas été audités contre la clé `userId ?? id`.

---

# Cycle 46 — Le rappel d'un message s'arrêtait à la porte de l'inbox de mentions

Supprimer un message, dans ce produit, est un **rappel** : les quatre écrivains de `deletedAt`
vident `translations`, diffusent `message:deleted`, désactivent les `/l/<token>` que le message
emportait, recalculent `lastMessageAt`. Le message disparaît de partout.

Sauf d'un endroit. `GET /mentions/me` rendait `Message.content` sans jamais regarder `deletedAt` —
le seul chemin du gateway dans ce cas.

## Le défaut, et pourquoi il ne se referme jamais tout seul

`MentionService.getRecentMentionsForUser` interrogeait `mention.findMany` sur le seul
`mentionedUserId`. Sa route soeur, **dans le même fichier**, écrit pourtant la règle complète :

```ts
// routes/mentions.ts — GET /mentions/messages/:messageId
prisma.message.findFirst({
  where: { id: messageId, deletedAt: null,
           conversation: { participants: { some: { userId, isActive: true } } } },
})
```

Deux lecteurs, une seule règle, et un seul des deux la porte.

Ce que cela donne : Bob écrit « désolé @alice, [quelque chose qu'il regrette] », puis supprime.
La conversation le perd chez tout le monde, en direct. Alice le garde — contenu intégral, identité
de l'auteur, titre de la conversation — dans son inbox de mentions, à chaque ouverture, sans date
de fin.

**Rien ne l'en retire jamais**, et c'est le point qui rend le défaut permanent plutôt que
transitoire :

- l'unique `mention.deleteMany` du dépôt est la réconciliation d'édition
  (`replaceMessageMentions`), qui ne supprime que les mentionnés **partants** d'un texte réécrit —
  elle ne connaît pas la suppression ;
- `Mention.message` déclare bien `onDelete: Cascade`, mais une cascade ne se déclenche que sur une
  suppression **physique**. Le retrait doux ne bascule que `deletedAt` : la ligne `Message` reste,
  donc la ligne `Mention` aussi. Même mécanisme que les `TrackingLink` survivants du cycle 43.

Second trou de la même garde absente : une ligne `Mention` survit à `Participant.isActive = false`.
Une personne retirée d'un groupe y lit encore son entrée — et le **titre de conversation est relu
live** à chaque appel, donc il peut avoir changé après son départ.

## Le correctif

L'admission de la route soeur, portée dans `getRecentMentionsForUser` :

```ts
where: {
  mentionedUserId: userId,
  message: {
    deletedAt: null,
    conversation: { participants: { some: { userId, isActive: true } } },
  },
}
```

Deux choix, et aucun n'est cosmétique.

**Dans le service, pas dans la route.** La ligne `Mention` n'est atteignable que par cette
fonction : c'est le seul endroit qu'un futur lecteur ne peut pas oublier. La placer dans la route
aurait reproduit la configuration qui a produit le défaut — une règle correcte répétée en N
endroits, dont l'un finit par manquer. Même argument qu'au cycle qui a mis les contrôles de
périmètre dans `writeConversationPreferences`.

**Filtrage à la lecture, pas purge des lignes au retrait du message.** Purger dans
`applyMessageRemovalEffects` aurait laissé derrière lui toutes les lignes DÉJÀ en base (un script de
réparation de plus, après ceux des cycles 25 et 27), et n'aurait rien pu faire du cas appartenance —
qu'aucun nettoyage à l'écriture ne peut voir, puisque le départ arrive après. Le filtre couvre les
deux, et il est réversible : restaurer un message rendrait sa mention, ce qu'une purge interdirait.

## Plan

- [x] T1 — RED : une mention dont le message est rappelé sort de l'inbox
- [x] T2 — RED : une mention d'une conversation quittée sort de l'inbox
- [x] T3 — témoin : une mention vivante dans une conversation rejointe reste (vert avant ET après)
- [x] T4 — GREEN : la garde d'admission dans `getRecentMentionsForUser`
- [x] T5 — le verrou « on filtre sur l'utilisateur, pas sur un participant » relâché en
      `objectContaining` sans perdre son intention
- [x] T6 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T7 — changeset + CHANGELOG + ce relevé

## Revue

Le double de test mérite d'être noté, parce que c'est lui qui fait la différence entre un test qui
prouve quelque chose et un test qui accompagne. Les assertions voisines de ce `describe` portent sur
la **forme** de l'appel (`toHaveBeenCalledWith(objectContaining({ take: 50 }))`). Une assertion de
plus sur la forme du `where` aurait été verte dès l'instant où le champ existe, sans jamais dire que
la ligne rappelée disparaît.

`honourWhere(rows)` rend un `mention.findMany` qui **applique le `where` qu'il reçoit** aux lignes
qu'on lui donne. Il ne connaît pas le `where` attendu : si la production n'en déclare aucun, la
ligne rappelée revient et le test tombe. C'est exactement ce qui a été observé — deux rouges, la
ligne `recalled` puis la ligne `left` présentes dans le résultat — avant que la garde n'existe. Un
double qui rend ses lignes quel que soit le filtre laisserait passer ce défaut ; c'est la leçon du
cycle 45b, appliquée ici avant plutôt qu'après.

Le témoin T3 est vert des deux côtés du correctif. Son rôle est d'interdire de trop resserrer : une
garde qui viderait l'inbox passerait T1 et T2 sans broncher.

Vérifié aussi, et sans changement nécessaire : `getMentionsForMessage` (l'autre lecteur de
`Mention`) est appelé exclusivement derrière la garde de la route soeur, qui la porte déjà.

## Reste ouvert après ce cycle

- **Le rappel n'est pas propagé à l'inbox en temps réel.** `message:deleted` part vers les salons
  de conversation ; un client qui affiche l'inbox de mentions n'a aucun signal lui disant de retirer
  la ligne, et la relira au prochain `GET`. Correct à la lecture, en retard à l'écran — le même
  écart qu'entre un compteur juste et un compteur poussé.
- **La notification de mention survit au rappel.** La ligne `Notification` et le push déjà remis
  portent le contenu du message. Le filtre de ce cycle ne les atteint pas : c'est un autre lecteur,
  avec sa propre question (faut-il retirer une notification déjà affichée, ou seulement la vider de
  son contenu ?).
- **`UserMessageDeletion` est écrite et lue par personne.** Quatre écritures dans
  `routes/user-deletions.ts`, zéro lecture dans tout le dépôt : « supprimer pour moi » un message
  n'a aucun effet observable. Volontairement hors de ce cycle — c'est l'arbitrage `delete-for-me`
  que le cycle 12 a laissé en attente de validation humaine, et l'inbox ne doit pas trancher seule
  une question qui appartient à la liste de messages.
- Reconduits du cycle 44 : les compteurs déjà dérivés restent en base (script de réparation en lot,
  candidat autonome) ; le plancher reste absent des décréments ; `ConversationMessageStats` reste un
  dénormalisé sans propriétaire (JSON en lecture-modification-écriture non atomique) ; les messages
  SYSTÈME ne sont comptés par personne alors que `recompute()` les compte — trancher AVANT de câbler.
- Reconduits du cycle 43 : `TrackingLink.messageId` reste une colonne trompeuse ; le décompte de
  références relit le texte pour retrouver une relation.
- Reconduits des cycles 40-42 : E2EE web de bout en bout ; `signedPreKeySignature` invérifiable ; le
  reste de `PreferencesService` (479 lignes) mort ; colonnes `User.signal*` mortes ; pré-clé à usage
  unique non unique ; `POST /signal/session/establish` n'établit aucune session ; `registrationId`
  iOS déborde le `maximum` documenté ; doublons `Participant` ; « qui a le droit d'épingler ? » ;
  asymétrie édition/suppression ; `eslint` inopérant sur le gateway (pas d'`eslint.config.js` depuis
  ESLint v9).

---

# Cycle 45b — Addendum d'une session parallèle : les tests du cycle 45 ne voyaient pas le défaut du cycle 45

Deux sessions ont livré le cycle 45 en parallèle, sur **le même défaut**. Celle-ci arrive seconde.

Arbitrage défaut par défaut (leçon du cycle 23), pas « qui est arrivé en premier » : **le correctif
de production ci-dessous est strictement plus large** et il est conservé intégralement. Il couvre
deux sites que cette session n'avait pas vus — la quatrième copie verbatim dans
`POST /messages/:id/status`, et la garde contre un `select` amputé des deux identités, qui aurait
déversé tout le trafic dans l'unique room `user:undefined`. Le module concurrent de cette session
(`emitToParticipantRooms`) a été **supprimé** à la fusion : deux helpers rivaux pour la même règle
valent moins que l'un ou l'autre.

Ce qui est ajouté par-dessus ne touche donc à aucune ligne de production. **C'est la partie que la
session arrivée première n'a pas faite, et elle n'est pas cosmétique : ses propres tests ne
capturent pas le défaut qu'elle corrige.**

## Le faux vert, mesuré et non supposé

Dans `MeeshySocketIOManager.test.ts`, toutes les chaînes se déversent dans un `io.to` unique.
`expect(ioState.to).toHaveBeenCalledWith(ROOMS.user('part-anon'))` prouve alors qu'**un** émetteur a
adressé cette room — **jamais lequel**. Or sur le chemin `broadcastMessage`, `conversation:updated`
n'est pas seul à viser cette room : `emitUnreadCountsToRecipients` l'adresse déjà correctement
depuis le cycle 42.

Vérifié par expérience, pas par raisonnement : le fanout `conversation:updated` a été **re-cassé**
localement (retour au `filter((p) => p.userId)`), puis les deux tests lancés sur ce code fautif.

| test | sur le code re-cassé |
|---|---|
| `emits CONVERSATION_UPDATED to every participant user room…` (session 1) | **PASSE** |
| `addresses an accountless participant by its participant id in CONVERSATION_UPDATED` (celui-ci) | **ÉCHOUE** |

Le premier test resterait donc vert si quelqu'un régressait demain exactement le défaut que le
cycle 45 vient de corriger. C'est la seule raison d'être de cet addendum.

*(Le test de drain de la session 1 n'a pas ce défaut : il fait `ioState.to.mockClear()` et
`_emitDeliveryForDrainedMessages` n'a qu'un émetteur — l'assertion lâche y suffit.)*

## Trois doubles de test corrigés

- **`MeeshySocketIOManager.test.ts`** — `recordEmitChains(ioState)` remplace le temps d'un test le
  `io.to` partagé par une chaîne qui garde room et événement ensemble, et restaure le double
  d'origine en `finally` pour qu'aucun test suivant n'hérite de l'override.
- **`MessageHandler.test.ts`** — même problème sur `makeIO()` (un `mockToResult` unique). Le test du
  chemin d'envoi WS monte un double enregistreur local et n'affirme que sur les rooms de
  `conversation:updated`.
- **`MessageHandlerEditDelete.test.ts`** — `target.to.mockReturnValue(target)` rabattait toute
  chaîne sur son **premier** salon : un émetteur chaîné y était indiscernable d'un émetteur qui
  aurait oublié tous les salons sauf le premier. `emitToConversationParticipants` chaînant les
  accusés, le trou restait ouvert quelle que soit la forme retenue pour `conversation:updated`.

## Écarté volontairement

Cette session chaînait aussi `conversation:updated` (une émission au lieu de N). La session 1 a
**délibérément** gardé la boucle, en argumentant que les deux familles d'émetteurs ne partagent pas
une forme d'émission et que seule la liste de rooms leur est commune. L'argument tient ; le gain
était marginal. Non réimposé — la structure de la session 1 est conservée telle quelle.

---

# Cycle 45 — La piste du cycle 43 nommait un émetteur ; il y en avait cinq, et le plus lourd n'était pas un accusé

Tête prise dans la dernière ligne du cycle 43, littérale : « `emitConversationPreviewUpdate` et les
autres émetteurs par room personnelle n'ont pas été audités contre la même clé. La règle « adresser
par `userId ?? id` » vaut pour tout émetteur personnel [...] À instruire par une recherche sur
`ROOMS.user(` plutôt que par déduction. »

La recherche a été faite telle que prescrite (`ROOMS.user(` sur tout `services/gateway/src`, 60
sites, puis tri manuel). Elle valide la piste et la déborde : **cinq** émetteurs défectueux, pas un.

## Le tri qui compte : quelle identité l'appelant tient-il ?

Un `ROOMS.user(x)` n'est fautif que si `x` vient d'une ligne `Participant` — seule table où
l'identité peut être nulle. Les 60 sites se répartissent ainsi :

| famille | exemples | verdict |
|---|---|---|
| `x` est un `User.id` de bout en bout | demandes d'ami, notifications, préférences | **sain** — aucun anonyme concerné par construction |
| `x` vient d'un `Participant` | les 5 ci-dessous | **fautif** |
| `x` vient d'un `Participant`, déjà corrigé | `emitUnreadCountsToRecipients`, `emitToConversationParticipants` | sain (cycles 42–43) |

## R1 — Le défaut le plus lourd n'est pas un accusé de lecture, c'est `conversation:updated`

Le backlog attendait des accusés. Trois des cinq sites émettent `conversation:updated`, et ce signal
pèse plus : c'est le SEUL qui fait remonter une conversation en tête de liste, et le seul par lequel
une conversation créée après la connexion entre dans la liste d'un client déjà en ligne.
`message:new` ne s'y substitue pas — il n'atteint que les sockets encore dans `conversation:<id>`,
que le client posé sur sa liste a précisément quittée.

Les trois chemins d'envoi le sautaient identiquement pour un participant sans compte :

| chemin | émetteur | ligne fautive |
|---|---|---|
| envoi WS | `MessageHandler.broadcastNewMessage` | `if (!p.userId) continue` |
| envoi REST/ZMQ | `MeeshySocketIOManager._broadcastNewMessage` | `if (!p.userId) continue` |
| édition / suppression | `emitConversationPreviewUpdate` | `if (!p.userId ...) continue`, et `select: { userId: true }` |

Conséquence, pour l'invité de lien partagé — le mode d'entrée principal du produit : liste de
conversations **figée**. Aucun re-tri à la réception, aucun rafraîchissement de l'aperçu après
édition ou suppression, et un fil neuf absent jusqu'au refetch manuel.

`emitConversationPreviewUpdate` documentait le manque comme une intention : « Anonymous participants
(no `userId`) are skipped, exactly as the send path does. » La phrase était **exacte sur ses deux
moitiés et fausse sur les deux** — le chemin d'envoi les sautait bien, et c'était son défaut. Son
test unitaire l'affirmait aussi (`it('skips anonymous participants...')`) : un défaut fixé par un
test est un défaut qui ne se corrige plus tout seul. Le test est retourné, en disant pourquoi.

## R2 — Deux copies de l'éventail d'accusés avaient survécu au regroupement du cycle 43

Le cycle 43 en a réuni trois. Il en restait deux, invisibles à sa recherche parce qu'elles ne
ressemblaient pas aux autres :

- `POST /messages/:id/status` (`routes/messages.ts:718`) — **quatrième copie verbatim**, jamais
  recensée. Même `select: { userId: true }`, même filtre.
- `_emitDeliveryForDrainedMessages` — variante : la clé y transite par un `Map<convId, string[]>`
  construit sous `if (row.userId)`, donc le filtre est à la construction, pas à l'émission.

Effet : un expéditeur sans compte reste sur un unique tic « envoyé », y compris au moment où son
destinataire revient en ligne et vide sa file — l'instant précis où l'accusé existe.

## Correctif — extraire la liste de rooms, pas la boucle d'émission

Les deux familles n'ont PAS la même forme d'émission, et vouloir partager la boucle aurait imposé
l'une à l'autre :

- les accusés **chaînent** room de conversation + rooms personnelles (`io.to(a).to(b).emit()`), ce
  qui garantit une livraison au plus une fois par socket présente dans les deux ;
- `conversation:updated` n'adresse **que** les rooms personnelles — une copie vers la room de
  conversation serait inutile pour qui regarde déjà le fil, sa ligne de liste n'étant pas à l'écran.

Ce qu'elles partagent est la liste de rooms, et c'est exactement la ligne que chaque copie ratait.
D'où `participantUserRooms(participants, seed?)`, extraite seule ;
`emitToConversationParticipants` s'appuie dessus, et les cinq sites l'appellent.

Une garde s'y ajoute que les copies n'avaient pas : un participant sans `userId` **ni** `id` ne
nomme aucune room. Deux des sites corrigés sélectionnaient `{ userId: true }` seul — la même erreur
de `select` commise demain n'aurait plus rien sauté, elle aurait déversé le trafic de toutes les
conversations dans l'unique room `user:undefined`, où toute socket y ayant jamais atterri reçoit
tout. Le type dit que le cas est impossible ; les `select` partiels que cette fonction existe pour
corriger disent le contraire.

## Vérification

- 631 suites / 16095 tests verts (bun + jest), `tsc --noEmit` propre.
- Le test qui affirmait le défaut de `emitConversationPreviewUpdate` est retourné et commenté.
- Quatre régressions ajoutées, une par site non couvert : room `user:<participantId>` sur les deux
  chemins d'envoi, sur le rejeu de remise, et sur `POST /messages/:id/status` (dont le double
  Socket.IO du fichier de test ne voyait pas les `.to()` chaînés — il les enregistre maintenant).

## Écarté, avec la raison

- `routes/conversations/core.ts:1129` et `participants.ts:403` adressent des `User.id` venus de la
  charge utile de création / de la route : aucun anonyme n'y transite. Sains.
- `utils/callEndedFanout.ts` filtre `userId: { not: null }` **dans le `where` Prisma**. Ressemblance
  trompeuse : instruit et **écarté comme correct**, voir ci-dessous.

## `callEndedFanout` ressemblait au sixième site — c'est le seul filtre légitime

Le même `userId: { not: null }`, la même forme, et pourtant l'inverse. Ce que l'en-tête du fichier
énonce déjà tranche : « l'audience de terminaison doit toujours refléter l'audience d'invitation ».
Et `call:initiated` (`CallEventsHandler`, requête `conversationParticipants`) porte **exactement le
même filtre**. Un participant sans compte n'est jamais sonné, donc n'a aucune sonnerie à faire taire :
aligner ce fan-out sur la règle générale n'aurait pas corrigé un manque, il aurait diffusé
`call:ended` à quelqu'un qui n'a jamais reçu `call:initiated`.

Le cas qui semblait rester est déjà couvert. Un anonyme **peut** rejoindre l'appel — `CallService.joinCall`
admet sur le seul `Participant.id`, et la bulle « appel en cours » lui parvient comme un message
ordinaire — mais dès qu'il a rejoint, il est dans `ROOMS.call(callId)`, la première room de la liste.

Ce qui manquait était donc la raison écrite, pas le correctif : elle est maintenant dans le fichier,
pour que le prochain passage sur la règle `userId ?? id` ne re-litige pas ce site.

**La question de produit qu'il soulève reste ouverte et n'est pas un bug** : faut-il sonner un invité
de lien partagé ? Aujourd'hui non — et c'est cohérent, il n'a pas de jeton de push. À trancher côté
produit, pas côté correctif.

## Piste pour le cycle suivant

Aucune piste ouverte sur les rooms personnelles : les 60 sites `ROOMS.user(` sont triés, les cinq
fautifs corrigés, le sixième instruit et justifié. La prochaine tête est à prendre ailleurs — les
points hérités des cycles 19/24 restent en tête de file (extraction des mentions du chemin de lien
qui écrit `Message.validatedMentions` ; aucun client iOS n'écoute `link:message:new` ; les pièces
jointes du chemin de lien n'entrent pas dans le pipeline audio).
## Note d'intégration — deux sessions ont numéroté leur cycle « 44 »

Les deux ont pris leur tête dans le cycle 43, mais dans **deux phrases différentes** de sa liste de
restes, et les deux défauts sont disjoints :

| session | tête prise dans | défaut |
|---|---|---|
| celle arrivée sur `main` la première (ci-dessous, reste « 44 ») | « `onMessageDeleted` n'est appelé que par un chemin sur trois » | dérive des compteurs de conversation |
| celle-ci (renumérotée **45**) | « les autres émetteurs par room personnelle n'ont pas été audités contre la même clé » | `conversation:updated` et les accusés ne parvenaient à aucun anonyme |

Rien à arbitrer défaut par défaut (leçon du cycle 23) : aucun des deux ne touche à la logique de
l'autre. Les deux ont modifié `MessageHandler.ts` et `routes/messages.ts`, mais dans des blocs
distincts — le leur sur les effets de compteurs, celui-ci sur le nommage des rooms. La fusion est
textuellement propre ET vérifiée par la suite complète après merge, pas seulement par git.

---

# Cycle 44 — Les compteurs de conversation étaient comptés par un tuyau et débités par un autre

Tête prise dans le « reste ouvert » du cycle 43, qui la désignait nommément :
`conversationMessageStatsService.onMessageDeleted` n'est appelé que par un chemin sur trois, « la
dérive de statistiques est réelle et mesurable ; le correctif est un cycle à lui seul ».

Elle l'était. **Et la moitié qui manquait au tableau était la plus grave** : le cycle 43 avait
compté les appelants du DÉCRÉMENT sans regarder ceux de l'INCRÉMENT. Mis face à face, les deux
listes ne se recouvrent nulle part.

## R1 — Le comptage et le décompte n'habitaient pas les mêmes routes

| geste | écrivains | qui touche `ConversationMessageStats` |
|---|---|---|
| envoi | handler socket `message:send` / `send-with-attachments`, `POST /conversations/:id/messages`, les deux routes de lien de partage, `translation-non-blocking` | **le handler socket, seul** |
| retrait | handler socket `message:delete`, `DELETE /messages/:id`, `DELETE /conversations/:id/messages/:id`, balayage des messages vides | **`DELETE /conversations/:id/messages/:id`, seule** |
| édition | handler socket `message:edit`, `PUT /conversations/:id/messages/:mid`, `PUT /messages/:id`, `PATCH /messages/:id` | **`PUT /conversations/:id/messages/:mid`, seule** |

La route qui décrémente est **celle qu'emploient iOS et la vue web**. Le chemin d'envoi que ces
mêmes clients empruntent en priorité est **REST** (`POST /conversations/:id/messages`), qui ne
compte pas. Un message envoyé depuis un iPhone puis supprimé depuis ce même iPhone **débite un
compteur qu'il n'a jamais crédité**.

Deux propriétés du service transforment cette asymétrie en dommage permanent :

1. **Les décréments sont atomiques et SANS plancher.** Le `Math.max(0, …)` a été délibérément
   abandonné au profit de l'atomicité, sur l'argument — écrit en commentaire — que « des opérations
   équilibrées ne passent jamais sous zéro ». Elles ne l'étaient pas. `totalMessages` descend en
   négatif et y reste.
2. **Il n'existe aucun recalcul périodique.** `recompute()` n'est appelé que paresseusement, quand
   la ligne n'existe pas encore. Le commentaire qui promettait qu'« une dérive résiduelle est
   corrigée par recompute() » désignait un mécanisme qui n'a jamais été planifié — et un autre
   commentaire du même fichier le dit d'ailleurs noir sur blanc à propos de `locationCount`
   (« aucun recalcul périodique »).

## R2 — Trois copies inline d'une règle dont l'autorité est ailleurs

`recompute()` est l'autorité : c'est elle qui reconstruit la ligne depuis les messages, donc elle
qui contredit toute divergence. Elle applique deux règles que les chemins incrémentaux portaient
recopiées :

- la table **MIME → compteur** (`resolveAttachmentType`), recopiée dans le handler socket et dans la
  route de suppression ;
- la **clé de crédit** `sender.userId || senderId`, recopiée aux mêmes endroits.

Les deux copies étaient justes ce jour-là. Rien ne les tenait.

## Correctif — un effet ajouté à l'unité s'applique à tous les tuyaux

Le remède est celui des cycles 42/43, appliqué à la troisième famille : chaque geste du cycle de vie
d'un message a **une** unité, et les compteurs y entrent.

| geste | unité | appelants |
|---|---|---|
| envoi | `runMessagePostSaveEffects` (4ᵉ effet, `messageStats`) | `MessagingService` (socket + REST + translation-non-blocking) et les deux routes de lien |
| retrait | `applyMessageRemovalEffects` (3ᵉ effet) | les trois routes de suppression |
| édition | **`applyMessageEditEffects`** (neuve, jumelle des deux autres) | les quatre transports d'édition |

`resolveAttachmentType` et `statsAuthorKey` sont **exportés** depuis le service : la table MIME et la
clé de crédit ne s'écrivent plus qu'à un endroit, celui où vit `recompute()`.

**Les champs que le comptage réclame sont REQUIS dans les types des trois unités.** Ce n'est pas de
la rigueur décorative : c'est exactement l'omission silencieuse que le cycle referme. Un cinquième
tuyau d'envoi ne compilera pas sans dire qui créditer. La preuve en a été faite en passant — en
retirant temporairement le correctif, la suite `MessagingService` ne compile plus.

Le décompte lit des champs **capturés à l'admission** et jamais relus : deux des trois routes de
suppression détruisent les `MessageAttachment` avant que l'unité ne tourne, une relecture rendrait
toujours une liste vide et les compteurs image/audio/vidéo ne redescendraient jamais.

**Correctif incident, non cosmétique** : le contenu compté est désormais celui qui est **PERSISTÉ**,
et non celui de la requête. Le handler socket comptait le second ; un message chiffré stocke `''`,
si bien que l'incrément divergeait de son propre recalcul dès le premier message E2EE.

**Auto-réparation** : le balayage des messages vides (`MaintenanceService`) est le seul écrivain en
LOT — il ne tient de ses messages que leur id et leur conversation, jamais l'auteur ni le contenu
qu'un décrément demande. Il appelle donc `recomputeIfTracked` une fois par conversation touchée :
le seul geste possible, et celui qui répare en passant la dérive déjà accumulée. La garde
d'existence l'empêche de FABRIQUER des lignes de compteurs (`recompute()` fait un `upsert`) pour des
conversations dont personne n'a jamais demandé les statistiques.

## Preuve

**633 suites, 16 114 tests, tout vert** (avant : 632 / 16 098). `tsc --noEmit` propre. Couverture
lignes **95,75 %**, en hausse (95,65 % au cycle 43).

Les témoins neufs échouent tous sur le code d'avant, vérifié en retirant le correctif :

- unités partagées : 10 rouges sur `messagePostSaveEffects` / `messageRemovalEffects`, 4 sur
  `messageEditEffects` (fichier neuf) ;
- sites d'appel : `MessagingService` crédite les compteurs (LE témoin — l'entrée commune du socket
  et du REST), les deux routes de suppression restantes débitent, les trois transports d'édition
  restants ajustent, le balayage répare ;
- `cleanupEmptyMessages` **n'avait aucun test** — il en a cinq.

**Six tests existants ont dû partir, et c'est le fait le plus instructif du cycle.** Ils
verrouillaient dans le handler socket la classification des MIME et la clé `userId || participantId`
— nommés d'après les numéros de ligne qu'ils couvraient (`line 275`, `line 460`, `line 463`). Tous
passaient. C'est précisément ce qui masquait la panne : ils prouvaient qu'une règle était juste
**là où elle se trouvait**, jamais qu'elle s'appliquait partout où elle devait. Ce qui reste à leur
place est le témoin inverse — le handler ne compte PAS lui-même, sinon l'envoi socket compterait
double.

## Reste ouvert après ce cycle

- **Les compteurs déjà dérivés restent en base.** Le correctif ne vaut que pour l'avenir ; les
  lignes déjà négatives ne se relèveront qu'au passage du balayage des messages vides sur leur
  conversation, ou par un `recompute()` manuel. **Un script de réparation en lot serait un cycle
  utile** — et, contrairement aux deux réparations en attente des cycles 25/27, celui-ci n'a besoin
  d'aucune donnée que la base ne porte déjà.
- **Le plancher reste absent des décréments.** Le correctif rend les opérations équilibrées, ce qui
  était l'hypothèse du choix d'origine — mais une seule panne de `runMessagePostSaveEffects`
  (best-effort, avec `.catch`) suffit à la rompre à nouveau, et rien ne le signale. Un compteur qui
  descend sous zéro devrait au minimum **journaliser**, à défaut d'être plancé.
- **`ConversationMessageStats` reste un dénormalisé sans propriétaire.** Les champs JSON
  (`participantStats`, `dailyActivity`, …) sont toujours écrits en lecture-modification-écriture non
  atomique : deux envois concurrents dans la même conversation peuvent encore s'écraser l'un
  l'autre. Seuls les scalaires sont atomiques. C'est la limite structurelle que ce cycle **ne**
  franchit pas.
- **Les messages SYSTÈME ne sont comptés par personne.** Trois `message.create` contournent
  `MessagingService` : deux dans `CallService` (récapitulatifs d'appel) et un dans
  `routes/conversation-encryption.ts` (« chiffrement activé »). Aucun n'incrémente — mais
  `recompute()`, lui, les compte : la même divergence incrément/recalcul que ce cycle vient de
  fermer, à ceci près qu'elle repose sur une question produit non tranchée. Un message système
  DOIT-il entrer dans `totalMessages` ? Les deux réponses sont défendables ; ce qui ne l'est pas,
  c'est que l'incrément et le recalcul en donnent chacun une. **Candidat sérieux pour le prochain
  cycle** — et il faut trancher AVANT de câbler, sans quoi on aligne le comptage sur un
  `recompute()` dont personne n'a validé le choix.
- Reconduits du cycle 43 : `TrackingLink.messageId` reste une colonne trompeuse (renommage ou table
  de jonction) ; le décompte de références relit le texte pour retrouver une relation.
- Reconduits des cycles 40-42 : E2EE web de bout en bout ; `signedPreKeySignature` invérifiable ; le
  reste de `PreferencesService` (479 lignes) mort ; colonnes `User.signal*` mortes ; pré-clé à usage
  unique non unique ; `POST /signal/session/establish` n'établit aucune session ; `registrationId`
  iOS déborde le `maximum` documenté ; doublons `Participant` ; « qui a le droit d'épingler ? » ;
  asymétrie édition/suppression ; audit du retrait d'un post par l'auteur lui-même.
- **`eslint` ne peut toujours pas tourner sur le gateway** : aucun `eslint.config.js` depuis la
  migration ESLint v9. Condition préexistante, non couverte par la CI — qui ne gate que sur
  `test:coverage`.

---

# Cycle 43 — La piste laissée par le cycle 42 désignait un correctif qui aurait cassé la production

Tête prise dans la « piste pour le cycle suivant » du cycle 42, qui l'énonçait précisément :
`TrackingLink` porte un `messageId`, la suppression d'un message a quatre écrivains, aucun ne
bascule `isActive: false`, « commencer par nommer la liste, pas par corriger les quatre sites ».

Les deux moitiés de cette piste se sont vérifiées inégalement. La liste manquante était réelle, et
plus creuse encore que décrite. **Mais le correctif tel qu'énoncé — désactiver
`where: { messageId }` — aurait été une RÉGRESSION, sur le chemin le plus courant du produit.**

## R1 — La colonne `messageId` ne désigne pas un propriétaire

`findExistingTrackingLink(url, conversationId)` (`TrackingLinkService.ts:226`) rend à **tout**
message de la conversation le lien déjà minté pour la même URL. Une ligne `TrackingLink` est donc
**partagée** entre messages, et `messageId` n'en retient qu'un seul — lequel dépend du chemin :

| chemin | écrivain | politique |
|---|---|---|
| envoi | `MessageProcessor.updateTrackingLinksWithMessageId` | filtre `messageId: null` → **premier** arrivé |
| partage | `TrackingLinkService.updateTrackingLinksMessageId` | `updateMany` sans garde → **dernier** arrivé |

Ce n'est donc pas un lien d'appartenance, c'est une trace de passage. Désactiver sur cette colonne
aurait coupé, dans le cas « envoi », le lien qu'un **autre message toujours affiché** porte encore :
il suffit qu'une URL soit citée deux fois dans une conversation et que le premier message parte.
Dans le cas symétrique (un message qui réutilise un token minté avant lui), la même requête n'aurait
rien fait du tout. Faux positif et faux négatif par la même colonne.

La question qui décide n'est pas *à qui appartient ce lien* — personne ne le sait — mais **un
message vivant le porte-t-il encore**. C'est un décompte de références, et il doit se faire sur les
**deux** représentations d'un token, parce que les deux chemins de minting n'écrivent pas au même
endroit : une syntaxe explicite `[[url]]` / `<url>` **réécrit** le contenu en `m+<token>` et ne
touche pas les métadonnées ; une URL brute laisse le contenu intact et ne nomme le token que dans
`metadata.trackingLinks`. Ne lire qu'une des deux laisserait la moitié des liens actifs pour
toujours.

## R2 — La liste manquante ne contenait pas que les liens

En la reconstituant sur les quatre écrivains, une seconde divergence apparaît, plus visible pour
l'utilisateur que la première :

| effet | handler socket | `DELETE /messages/:id` | `DELETE /conversations/:id/messages/:id` | balayage vides |
|---|---|---|---|---|
| `deletedAt` | ✅ | ✅ | ✅ | ✅ |
| pièces jointes | ✅ | ✅ | ✅ | s.o. |
| recalcul `lastMessageAt` | ✅ | ✅ | ❌ | ❌ |
| désactivation des `/l/<token>` | ❌ | ❌ | ❌ | ❌ |

La colonne en défaut est **la route qu'emploient iOS et la vue web**. Supprimer le dernier message
d'une conversation depuis un iPhone laissait donc la liste des conversations triée sur un message
que plus personne ne peut voir — pendant que le même geste depuis le composer web (qui passe par le
handler socket) la corrigeait. Le balayage des messages vides ne le recalculait pas davantage, et
c'est lui qui retire précisément les messages fantômes susceptibles d'épingler l'ordre.

## Correctif — `applyMessageRemovalEffects`

`services/messaging/messageRemovalEffects.ts`, jumeau d'`applyPostRemovalEffects` et pour la même
raison. Best-effort après un `deletedAt` déjà committé : une suppression réussie ne doit jamais
devenir un 500.

Trois gardes ferment chacune un faux positif distinct :

1. **`targetType: 'EXTERNAL'`** — un lien `POST`/`REEL`/`STORY` appartient au contenu partagé, pas
   au message qui le relaie ; son retrait est déjà tenu par `applyPostRemovalEffects`. Supprimer le
   message qui partage un post ne doit pas casser le partage de ce post ailleurs.
2. **`conversationId`** — un `m+<token>` recopié à la main depuis une autre conversation ne donne
   aucun droit sur le lien d'en face.
3. **Plus aucun message vivant ne le porte** — R1.

Le décompte s'appuie sur un `findRaw` volontairement **large** (`m\+(t1|t2)` sans frontière de mot
attrape aussi `m+t1x`), l'exactitude étant refaite en JS sur les documents rendus : un préfiltre
trop large ne coûte que des lignes lues, un préfiltre trop étroit désactiverait un lien encore
affiché. Même asymétrie sur les pannes — **si le décompte échoue, le lien reste ACTIF** : couper à
tort casse un message vivant et rien ne le rouvre, laisser actif ne coûte qu'un clic compté en trop.

Le recalcul de `lastMessageAt` est repris tel quel des deux chemins qui le tenaient, à une
différence près : la garde CAS relit `lastMessageAt` **au plus près de son écriture** au lieu de le
recevoir joint au message. C'est strictement plus juste (la fenêtre de course rétrécit au lieu de
couvrir tout le handler) et les trois routes économisent la jointure. Il est exporté séparément
sous `recomputeConversationLastMessageAt` : le balayage en lot n'a que cet effet-là à appliquer —
un message au contenu blanc et sans attachement ne porte aucun lien — et une fois par conversation
touchée, pas une fois par message.

## Preuve

`messageRemovalEffects.test.ts` — 16 tests. Le témoin central est **« un survivant protège le
token »** : c'est lui, et lui seul, qui échouerait si quelqu'un revenait au filtre sur `messageId`.
Il a son symétrique en métadonnées (un survivant qui n'a cité que l'URL brute), sans quoi le
décompte ne verrait qu'une des deux représentations. Trois tests de plus sur la route iOS/web,
dont le recalcul de `lastMessageAt` qu'elle ne faisait pas.

Quatre tests existants ont dû être mis à jour — ils lisaient la valeur de garde sur la jointure
`message.conversation`, que le correctif supprime. Deux d'entre eux échouaient d'ailleurs par
**fuite de mock** et non par assertion : leur file `mockResolvedValueOnce` n'était plus consommée au
même rythme, et la valeur restante contaminait le test suivant. Un rappel utile : une file `Once`
dimensionnée sur le nombre d'appels d'un handler couple le test à sa structure interne.

Suites : gateway 630/630 vertes, `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **`conversationMessageStatsService.onMessageDeleted` n'est appelé que par un chemin sur trois.**
  Troisième colonne de la table de R2, délibérément laissée hors de ce cycle : contrairement aux
  deux effets traités, elle exige du message des informations que les deux autres routes ne lisent
  pas (types MIME des pièces jointes, `messageType`, contenu), et c'est un service de compteurs
  dont les semantiques d'incrément/décrément méritent d'être vérifiées avant d'être diffusées à
  trois appelants. La dérive de statistiques est réelle et mesurable ; le correctif est un cycle à
  lui seul, pas un ajout en passant.
- **`TrackingLink.messageId` reste une colonne trompeuse.** Ce cycle cesse de s'en servir pour
  décider, mais ne la retire pas : `routes/admin/users.ts` et `system-rankings.ts` la lisent encore
  pour de l'affichage. Elle mériterait soit un renommage disant ce qu'elle est (dernier/premier
  message à avoir référencé le lien), soit le passage à une vraie table de jonction
  message ↔ lien — laquelle rendrait le décompte de références exact au lieu de le reconstituer
  depuis le texte.
- **Le décompte relit le texte pour retrouver une relation.** Conséquence directe du point
  précédent : `metadata.trackingLinks` et les `m+<token>` du contenu sont deux index dérivés qu'il
  faut tenir d'accord. Une table de jonction supprimerait le `findRaw` et le préfiltre.
- Reconduits du cycle 42 : E2EE web de bout en bout ; `signedPreKeySignature` invérifiable ; le
  reste de `PreferencesService` (479 lignes) mort ; colonnes `User.signal*` mortes (dont
  `signalIdentityKeyPrivate`, emplacement pour une clé privée côté serveur) ; audit du retrait d'un
  post par l'auteur lui-même (décision produit).
- Reconduits des cycles 40/41 : pré-clé à usage unique non unique ; `POST /signal/session/establish`
  n'établit aucune session ; `registrationId` iOS déborde le `maximum` documenté ; doublons
  `Participant` ; « qui a le droit d'épingler ? » ; asymétrie édition/suppression ; `eslint`
  inopérant sur le gateway (pas d'`eslint.config.js` depuis ESLint v9).

# Cycle 42 — Une chaîne de trois ruptures : personne ne sait qu'un utilisateur a des clés

Tête prise dans le « reste ouvert » du cycle 41, qui laissait `POST /signal/keys` inappelable
depuis le web. L'enquête a confirmé ce défaut — et trouvé, en amont, que le corriger n'aurait rien
changé à ce que l'utilisateur voit : **rien, nulle part, ne rapporte qu'un utilisateur a des
clés.** Trois ruptures indépendantes sur la même chaîne, chacune suffisant seule à la couper.

Le cycle 41 a rendu les clés distribuables (`GET /signal/keys/:userId` rendait du base64 décodable
au lieu d'une liste d'octets décimaux). Ce cycle rend leur EXISTENCE observable.

## R1 — La lecture visait quatre colonnes qu'aucune écriture n'alimente

`PreferencesService.getEncryptionPreferences` dérivait `hasSignalKeys` de
`User.signalIdentityKeyPublic`, et rendait `signalRegistrationId`, `signalPreKeyBundleVersion`,
`lastKeyRotation` depuis les colonnes homonymes de `User`.

**Aucun chemin n'écrit ces quatre colonnes.** Le seul écrivain de matériel de clé est
`POST /signal/keys`, et il fait un `upsert` sur la table `SignalPreKeyBundle` — jamais sur `User`.
Vérifié par balayage : hors de cette méthode et de ses tests, les quatre colonnes n'apparaissent
que dans le schéma Prisma qui les déclare et dans un test d'intégration qui les écrit lui-même.
Elles sont `null` pour tout le monde, depuis toujours. La méthode rendait donc `hasSignalKeys:
false` à l'utilisateur iOS dont le bundle est à une ligne de là — celui-ci téléverse le sien au
front montant de l'authentification, à **chaque** ouverture de session.

La même méthode portait un second défaut, indépendant : elle lisait `encryptionPreference` dans le
blob `application` de `UserPreferences`. Le champ est déclaré par `PrivacyPreferenceSchema` et
écrit dans le blob **`privacy`** (`packages/shared/types/preferences/privacy.ts:30`) — l'unique
chemin d'écriture est `PATCH /me/preferences/privacy`. Elle aurait rendu « optional » à
l'utilisateur qui a choisi « always ».

## R2 — Cette lecture n'était atteignable par personne

`services/preferences/PreferencesService.ts` (479 lignes) n'est importé **que par son propre
fichier de tests**. Aucune route ne l'instancie. Le DTO `EncryptionPreferencesDTO` décrivait donc
une réponse qu'aucune requête ne pouvait obtenir, et ses ~300 lignes de tests restaient vertes en
verrouillant les deux erreurs de R1 : les doubles Prisma rendaient précisément les colonnes
mortes qu'on leur demandait, si bien que la suite prouvait la cohérence du mock, jamais celle du
système.

## R3 — Le champ que le web lisait ne traverse pas le fil

`apps/web/components/settings/encryption-settings.tsx:42` dérivait tout le panneau — pastille,
badge « Actif », ID d'enregistrement, date de rotation, présence du bouton « Générer les clés » —
de `user?.signalRegistrationId`, pris sur l'objet `user` de `GET /auth/me`.

`userSchema`, le schéma de réponse à travers lequel Fastify sérialise cette route, ne déclare
**aucun** champ signal. fast-json-stringify n'ignore pas une propriété non déclarée : il la
**retire**. Le champ ne peut pas arriver, quoi que fasse le handler. C'est le mécanisme du cycle 41
dans son autre direction : là il coerçait (`String(Uint8Array)`), ici il ampute — et dans les deux
cas sans lever, sans journaliser, sans que TypeScript relie le handler à son schéma.

Les trois ruptures sont indépendantes : réparer R1 seule ne servirait rien (R2 rend le résultat
inatteignable), réparer R1+R2 ne servirait rien au web (R3 le fait lire ailleurs).

## Correctif — la ligne du bundle EST la source de vérité

`GET /me/preferences/encryption` (nouvelle), adossée à `SignalPreKeyBundle` :

```
hasSignalKeys        ← la ligne existe et isActive
signalRegistrationId ← bundle.registrationId, null sans bundle actif
lastKeyRotation      ← bundle.lastRotatedAt, null sans bundle actif
encryptionPreference ← blob privacy, validé par PrivacyPreferenceSchema.shape (pas de liste locale)
```

Le miroir sur `User` n'est pas réparé, il est **contourné** — le réparer demanderait une double
écriture (donc une dérive possible) et une migration de rattrapage pour tous les bundles déjà
téléversés. La table porte déjà la vérité : la route est juste pour tout utilisateur existant, le
jour du déploiement, sans backfill.

Côté web, `encryptionKeys` est un état serveur distinct des préférences (persisté par le store —
un panneau rouvert affiche immédiatement le dernier statut connu, conformément au principe
cache-first), synchronisé par `syncEncryptionKeys()` au montage du panneau, dans `syncAll()`, et
après un `POST /signal/keys` réussi. Ce dernier appel remplaçait un `GET /auth/me` suivi d'un
`setUser` : un aller-retour qui, par R3, ne pouvait rien rapporter de ce qu'il allait chercher.

**Code mort retiré** : `getEncryptionPreferences` et `updateEncryptionPreference` (les deux seules
méthodes de la classe morte que ce cycle remplace), leurs DTO, le type `EncryptionPreference`
devenu orphelin, et les 117 lignes de tests qui les gardaient. Le reste de `PreferencesService`
demeure mort — retrait à instruire séparément, il excède la famille traitée ici.

## Preuve

`me-preferences-encryption.test.ts` — 9 tests, **9 rouges avant correctif** (404 : la route
n'existait pas). Le fichier **ne mocke délibérément pas** `@meeshy/shared/types/api-schemas`, à la
différence de son voisin `me-preferences.test.ts` : le vrai sérialiseur tourne et toutes les
assertions portent sur le corps parsé. Un test énumère les clés exactes de `data` — c'est ce qui
vérifie que le schéma ne laisse pas fuiter de matériel de clé et qu'il ne retire rien d'attendu ;
un autre assert que le handler ne touche **jamais** `prisma.user` (le double n'expose pas le
modèle : un handler qui le lirait planterait au lieu de passer).

Web : 4 tests neufs sur `syncEncryptionKeys` (dont « une panne réseau ne fait pas disparaître les
clés »), et les tests de statut du panneau réécrits — ils injectaient `signalRegistrationId` dans
l'objet `user`, c'est-à-dire dans le champ que R3 rend inatteignable, et restaient verts pendant
que la production ne pouvait jamais l'afficher. L'un d'eux verrouille désormais l'inverse : un
`signalRegistrationId` posé sur `user` ne doit **pas** faire passer le statut au vert.

Suites complètes : gateway 630/630 (16 068 tests), web 512/512 (11 703 tests), `tsc --noEmit`
propre sur les deux paquets (les erreurs `TS7031` préexistantes du web sont hors des fichiers
touchés).

## Reste ouvert après ce cycle

- **Le web ne sait toujours pas générer de clés.** `encryption-settings.tsx` envoie `{}` à
  `POST /signal/keys` ; le schéma de corps en exige six propriétés — 400 avant le handler. Le
  correctif juste n'est pas d'ajouter un keygen : iOS ne dérive ses sessions que **localement**
  (CryptoKit, à partir du seul `signedPreKeyPublic`), et le web n'a **aucun chemin de
  déchiffrement**. Téléverser un bundle depuis le web ferait chiffrer les pairs iOS vers un
  destinataire incapable de lire — une régression fonctionnelle, pas un progrès. Ce chantier est
  « E2EE web de bout en bout » (WebCrypto X25519/Ed25519 + clés privées en IndexedDB + chemin de
  déchiffrement), pas un correctif. Demi-correctif refusé, consigné entier. Le bouton reste donc
  visible et sans effet pour un utilisateur web — état inchangé par ce cycle, désormais affiché
  sur un statut qui, lui, dit la vérité.
- **`signedPreKeySignature` n'est vérifiable par aucun pair.** iOS signe la pré-clé signée avec une
  clé `Curve25519.Signing` (Ed25519) conservée sous `me.meeshy.e2ee.signingKey`, alors que
  `identityKey` publié est une clé `Curve25519.KeyAgreement` (X25519) — deux clés distinctes. La
  clé de vérification n'est publiée nulle part : le bundle n'a pas de champ pour elle. La signature
  circule donc sans que quiconque puisse s'en servir. Défaut de protocole (champ de schéma +
  déploiement client), hors de la famille traitée ici.
- **Le reste de `PreferencesService` (479 lignes) est mort.** Une classe entière importée
  seulement par ses tests. Ce cycle en a retiré les deux méthodes qu'il remplaçait ; le retrait du
  reste demande de vérifier une à une les méthodes restantes contre leurs équivalents vivants.
- **Les colonnes `User.signalIdentityKeyPublic` / `signalIdentityKeyPrivate` /
  `signalRegistrationId` / `signalPreKeyBundleVersion` / `lastKeyRotation` sont mortes.** Plus
  aucun lecteur après ce cycle, toujours aucun écrivain. `signalIdentityKeyPrivate` mérite une
  attention à part : c'est un emplacement prévu pour une clé privée côté serveur, ce qu'un E2EE ne
  devrait jamais stocker. À retirer du schéma (aucune migration MongoDB nécessaire), avec le
  balayage des données résiduelles éventuelles.
- Reconduits du cycle 41 : la pré-clé à usage unique n'est pas à usage unique (demande un pool +
  un réapprovisionnement client) ; `POST /signal/session/establish` n'établit aucune session ;
  `registrationId` iOS (1…65535) déborde le `maximum: 16383` documenté ;
  `signal-protocol-routes.test.ts` mocke encore les schémas pour ses autres routes.
- Reconduits du cycle 40 : doublons `Participant` en base non dénombrés ; « qui a le droit
  d'épingler ? » ; asymétrie édition/suppression (cycle 38b) et appartenance active de l'auteur
  (cycle 34) à arbitrer ensemble ; `attachments/metadata.ts:185` ; balayage `routes/calls.ts` ;
  file d'attente de fan-out (cycle 32) ; fan-out `member_joined` sans borne (cycle 33b) ;
  `getVisibilityFilteredRecipients` / `filterPostConsumers` (cycle 32) ;
  `DELETE /admin/posts/:postId` (cycle 38) ; `@Display Name` ;
  `createStoryCommentNotificationsBatch` ; les deux scripts de réparation de base ; `eslint`
  inopérant sur le gateway (pas d'`eslint.config.js` depuis ESLint v9).

# Cycle 41 — Le schéma de réponse ne VALIDE pas la sortie du handler : il la RÉÉCRIT

Tête prise dans le « reste ouvert » du cycle 40, qui désignait `POST /signal/session/establish`
comme tête sérieuse : *soit on l'implémente, soit on cesse de consommer une pré-clé qu'on n'utilise
pas.* L'enquête a tranché cette question — et en a trouvé une autre, en amont, qui rendait la
première sans objet : **le seul point de distribution de matériel de clé du serveur rendait des
clés qu'aucun client ne peut décoder.** L'E2EE n'a jamais pu s'établir.

## D1 — `GET /signal/keys/:userId` rendait des clés indécodables (sévérité CRITIQUE)

La colonne stocke du base64. `signalPreKeyBundleSchema` documente du base64 (« base64-encoded, 32
bytes »). iOS `E2EAPI.BackendPreKeyBundle` déclare `identityKey: String // Base64`. **Les trois
côtés du contrat sont d'accord.** Le handler, lui, décodait chaque champ en `Uint8Array` avant de
répondre.

Fastify sérialise un 200 **à travers** le schéma de réponse déclaré (fast-json-stringify). Un champ
typé `string` ne rejette pas une valeur non-string : il la **coerce** par `String(value)`. Et
`String(Uint8Array)` est la liste décimale des octets. Vérifié en exécutant le sérialiseur réel
(fast-json-stringify 7.0.1) :

```
DB stocke (base64) : YW4taWRlbnRpdHkta2V5LTMyLWJ5dGVzLWxvbmchISE=
sur le fil          : "97,110,45,105,100,101,110,116,105,116,121,…"
```

Chaîne complète, confirmée par lecture directe du client : iOS décode le champ **sans erreur** (une
`String` reste une `String`), puis `Data(base64Encoded:)` rencontre des virgules — hors alphabet
base64 — et rend `nil`. `E2ESessionManager.getOrCreateSession` lève `SessionError.invalidBase64Payload`
(ligne 175), le `catch` inscrit le pair dans `failedSessionAttempts` pour **600 s**, et le
`ConversationViewModel` envoie en clair (DEBUG) ou marque `encryption_failed` (release). Pour
**chaque pair, à chaque tentative.** Aucune session E2EE n'a jamais pu être dérivée.

**Pourquoi personne ne l'avait vu.** Le défaut n'est visible qu'à travers le sérialiseur, et le
fichier de tests voisin (`signal-protocol-routes.test.ts`) **mocke `@meeshy/shared/types/api-schemas`**
en remplaçant `getPreKeyBundleResponseSchema` par `{ type: 'object', additionalProperties: true }`.
Ce mock retire précisément l'étape qui abîme les données. Ses six tests sur cette route assertent
`statusCode` et `success` — jamais la forme d'un champ — et restaient verts pendant que le fil
portait des clés inutilisables. C'est le deuxième aveuglement structurel trouvé dans ce même fichier
en deux cycles (cycle 40 : ses doubles Prisma ne discriminaient pas sur le `where`).

**Correctif** : rendre la ligne telle qu'elle est stockée. Le `select` la restreignait déjà aux
onze champs du schéma — les parties privées (`identityKeyPrivate`, `signedPreKeyPrivate`) n'y sont
pas et n'y entrent pas. L'étape de décodage n'avait **aucun consommateur** à servir.

## D2 — `POST /signal/session/establish` détruisait une pré-clé qu'il ne distribuait à personne

La question du cycle 40, tranchée. La route mettait `preKeyId`/`preKeyPublic` à `null` chez le
destinataire. Or sa réponse ne porte **aucun matériel de clé** — seulement un message — et le
bundle qu'elle composait sur vingt lignes à partir de la ligne lue n'était **lu par personne**.

Ce n'est donc pas une consommation : c'est une destruction. Elle ne devient une consommation que
chez la route qui **distribue** — `GET /signal/keys/:userId`. Laissée en place, tout participant
actif pouvait retirer la pré-clé à usage unique de n'importe quel autre membre, au rythme du rate
limit, **sans rien recevoir en échange** ; et rien ne la reconstitue, les clients ne téléversant un
bundle qu'au front montant de l'authentification (`MeeshyApp.swift`, edge `isAuthenticated`
false→true). C'est l'épuisement de pré-clés que l'en-tête du fichier dit prévenir.

**Correctif** : retrait de l'écriture destructrice. Les deux gardes d'appartenance active du cycle
40 restent — la route garde un rôle réel, elle **autorise** une session, elle n'en établit pas.

## D3 — code mort

L'interface `PreKeyBundle` et ses deux constructions (une par route) disparaissent avec D1 et D2 :
plus aucun lecteur. Diff net **-85 / +62**, dont l'essentiel des ajouts est du commentaire.

## Ce que ce cycle retient de sa forme

Les cycles 37-40 cherchaient des **prédicats** absents dans des `where`. Ici le défaut n'est dans
aucune requête : il est dans la **frontière de sortie**, là où un schéma qu'on lit comme une
validation est en réalité une transformation. Un handler n'est pas typé contre son schéma de
réponse — TypeScript ne relie pas les deux — et le sérialiseur ne lève pas : il coerce. Entre les
deux, aucune alarme. Seul un test qui traverse le sérialiseur **réel** peut voir la sortie.

## Preuve

Nouveau `signal-prekey-bundle-wire-format.test.ts` — 6 tests, **5 rouges avant correctif**, qui
n'mocke délibérément PAS les schémas : le vrai `signalPreKeyBundleSchema` pilote le vrai
sérialiseur, et les assertions portent sur le corps parsé. La sortie d'échec imprimait littéralement
`"115,105,103,110,101,100,…"` là où le test attendait le base64 stocké, et l'appel
`{data: {preKeyId: null, preKeyPublic: null}}` de la destruction de pré-clé. Valeurs **distinctes
par champ** (une constante partagée laisserait passer un handler qui intervertit deux champs) et
prédicat `isDecodableBase64` qui reproduit ce que fait `Data(base64Encoded:)`.

Deux tests existants verrouillaient le défaut D2 (`signal-protocol-routes.test.ts`,
`signal-session-departed-member.test.ts`) : réécrits pour asserter l'absence d'écriture, en gardant
une preuve observable que le handler va au bout de ses gardes (`findUnique` appelé).

Clients vérifiés dans les quatre langages (leçon 88) : iOS est le seul client complet (GET puis
POST, dérivation **locale** à partir du seul `signedPreKeyPublic`) ; web n'appelle que `POST
/signal/keys`, et avec un corps vide (`{}`) que le schéma rejette en 400 — défaut distinct,
consigné ; Android et le SDK Swift n'ont aucun appelant. **Aucun client ne lit `preKeyId`/
`preKeyPublic`**, donc aucune capacité vivante n'est retirée par D2.

## Reste ouvert après ce cycle

- **La pré-clé à usage unique n'est toujours pas à usage unique.** `GET /signal/keys/:userId` la
  distribue autant de fois qu'on la demande. Le correctif juste — la réclamer atomiquement à la
  distribution — demande d'abord un **pool** de pré-clés (le schéma n'a qu'un seul emplacement,
  `preKeyId`/`preKeyPublic` scalaires) et un chemin de **réapprovisionnement** côté client. Réclamer
  l'unique emplacement au premier `GET` laisserait tous les pairs suivants sans pré-clé et rien pour
  la refaire : demi-correctif refusé, consigné entier.
- **`POST /signal/session/establish` n'établit toujours aucune session.** Elle autorise, et le dit
  maintenant dans ses logs et ses commentaires. La vraie établissement demande
  `@signalapp/libsignal-client` et un magasin de sessions côté serveur — et se heurte à une question
  d'architecture : dans un E2EE, l'état de session appartient au client, pas au serveur. Sa réponse
  annonce encore `E2EE session established successfully` : chaîne inchangée à dessein (aucun lecteur,
  contrat d'API stable), à revoir avec la question ci-dessus.
- **`POST /signal/keys` est inappelable depuis le web.** `encryption-settings.tsx:104` envoie `{}` ;
  le schéma de corps exige six propriétés — 400 avant le handler. Le bouton « Générer les clés » ne
  peut pas aboutir. Défaut réel, hors de la famille traitée ici (sortie de clés), non corrigé.
- **`registrationId` iOS déborde la borne documentée** : `getOrCreateStableId` tire dans 1…65535,
  `signalPreKeyBundleSchema` annonce `maximum: 16383` (14 bits, borne du Signal Protocol). Rien ne
  rejette : `generatePreKeyBundleRequestSchema` ne borne pas ce champ à l'entrée, et `maximum` dans
  un schéma de RÉPONSE n'est pas appliqué par le sérialiseur (vérifié — même raison que D1 : ce
  schéma transforme, il ne valide pas). Dérive de spécification, pas de panne. Non corrigé —
  demande une décision (élargir la borne documentée ou borner le client).
- **Le fichier de tests `signal-protocol-routes.test.ts` mocke encore les schémas** pour les autres
  routes. Deux aveuglements structurels y ont été trouvés en deux cycles ; le troisième viendra du
  même endroit.
- Reconduits du cycle 40 : doublons `Participant` en base non dénombrés ; « qui a le droit
  d'épingler ? » ; asymétrie édition/suppression (cycle 38b) et appartenance active de l'auteur
  (cycle 34) à arbitrer ensemble ; `attachments/metadata.ts:185` ; balayage `routes/calls.ts` (cinq
  jointures d'appartenance) sur la question du cycle 37 ; file d'attente de fan-out (cycle 32) ;
  fan-out `member_joined` sans borne (cycle 33b) ; `getVisibilityFilteredRecipients` /
  `filterPostConsumers` (cycle 32) ; `DELETE /admin/posts/:postId` (cycle 38) ; `@Display Name` ;
  `createStoryCommentNotificationsBatch` ; les deux scripts de réparation de base ; `eslint`
  inopérant sur le gateway (pas d'`eslint.config.js` depuis ESLint v9).

# Cycle 40 — Le prédicat manquant n'a pas de valeur juste : il en a deux, opposées

Tête prise dans le « reste ouvert » du cycle 39, qui reposait la question du cycle 37 pour la
quatrième fois : **quelles appartenances sont jointes sans `isActive` ?** Les cycles 37, 38b et 39
l'ont traitée comme une question à une seule réponse — ajouter le filtre. Ce cycle trouve la famille
où **ajouter le filtre est exactement le mauvais correctif sur deux sites sur trois.**

Un départ n'efface pas la ligne `Participant` : `POST …/leave` écrit `{ isActive: false, leftAt }`,
et `POST …/ban` écrit en plus `bannedAt`. Toute porte d'entrée d'une conversation hérite donc d'une
question que le schéma rend inévitable — *une ligne existe peut-être déjà, et son état dit ce qu'il
faut en faire.* **Les trois portes y répondaient différemment, et aucune ne la traitait.**

## Lot A — les trois portes d'entrée

| porte | recherche de l'existant | ce qu'obtenait un ancien membre | ce qu'obtenait un BANNI |
|---|---|---|---|
| `POST /conversations/join/:linkId` (lien de partage) | `{ conversationId, userId }` — **sans `isActive`** | « vous êtes déjà membre », 200, **jamais réintégré** | 200 « déjà membre » |
| `POST /conversations/:id/participants` (ajout par un admin) | `{ …, isActive: true }` puis **`create`** | une **SECONDE ligne** | une **ligne neuve et ACTIVE** |
| `POST /conversations/:id/invite` | `participants` inclus `where: { isActive: true }` puis **`create`** | une **SECONDE ligne** | une **ligne neuve et ACTIVE** |

Trois défauts distincts, produits par le même prédicat absent, **dans les deux directions
opposées** :

1. **Trop permissif — le bannissement s'évade par la porte d'à côté (sécurité).** Bannir écrit
   `isActive: false`. Les deux portes d'ajout ne cherchent que les lignes actives, ne trouvent donc
   pas le banni, et lui **créent une ligne neuve et active**. Le bannissement est défait sans passer
   par `POST …/unban` — qui exige le rang `admin` là où `POST …/participants` s'ouvre aussi aux
   `moderator`. **Un modérateur, qui n'a pas le droit de débannir, débannissait par un chemin qui ne
   s'appelle pas ainsi et n'écrit aucune trace.**
2. **Trop restrictif — on ne revient jamais (produit).** La porte du lien trouve la ligne inactive,
   en conclut « déjà membre » et répond 200 **sans rien écrire**. Le client navigue alors vers une
   conversation que `GET /conversations/:id/messages` refuse, puisqu'elle exige une appartenance
   ACTIVE (cycle 39, lot B). Aucun autre chemin ne réactive la ligne — `unban` seul le fait, et
   encore faut-il avoir été banni. **Quitter une conversation rejointe par lien était définitif**, et
   l'écran ne disait rien d'autre que « vous êtes déjà membre ».
3. **Lignes en double.** `Participant` ne porte **aucune contrainte d'unicité** sur
   `(conversationId, userId)` : le schéma ne rattrape rien. Deux lignes actives pour la même
   personne, c'est une identité d'expéditeur ambiguë (`findFirst` en choisit une au hasard), un
   fan-out doublé, des non-lus comptés deux fois et des réactions attribuées à un fantôme.

**Ce que ce cycle retient de sa forme.** Les cycles 37 à 39 ont appris à chercher le filtre absent.
Ici, « ajouter `isActive: true` » réparait la porte 1 **en aggravant** les portes 2 et 3 : le filtre
fait tomber l'ancien membre dans le `create`, donc dans la seconde ligne. Le prédicat manquant n'a
pas de valeur juste dans l'absolu — **elle dépend de ce qu'on fait ensuite de la ligne trouvée.**
C'est cette décision-là, et pas le filtre, qui devait exister à un seul endroit.

`resolveConversationEntry` (`services/conversations/conversationEntryAdmission.ts`) est cet endroit :
une lecture, quatre issues (`banned` / `already-member` / `rejoin` / `create`). Elle lit **toutes**
les lignes de la paire, pas la première — les deux portes d'ajout en ont produit des doubles avant
ce correctif, et un `findFirst` sur un jeu contenant une ligne bannie et une ligne active répondrait
selon l'ordre de Mongo. L'agrégat est conservateur (le bannissement l'emporte, puis l'appartenance
active) et réintègre la ligne la plus récente, ce qui **fait converger l'état sans script de
réparation**.

**Ce que la règle unifiée retient.** Union des intentions, jamais intersection — sauf sur le
bannissement, seule capacité retirée par ce cycle, et retirée dans le sens que `POST …/ban` énonce
explicitement. `joinedAt` est **conservé** à la réintégration : il ne date pas la ligne, il borne
l'historique visible quand le lien porte `allowViewHistory: false`, et le remettre à maintenant
retirerait à quelqu'un qui revient des messages qu'il avait déjà légitimement lus. `role` et
`permissions`, eux, repartent de ce que la porte donne à un nouvel arrivant : un ancien `admin` qui
revient par un lien PUBLIC ne récupère pas son rang dans une ligne périmée (leçon 89).

Clients vérifiés dans les quatre langages (leçon 88) : web `use-conversation-join.ts` /
`invite-user-modal.tsx`, SDK Swift `ShareLinkService.joinAuthenticated`, iOS, Android. La forme de
réponse d'une réintégration est **identique** à celle d'une jointure neuve — `JoinAuthenticatedResponse`
documente d'ailleurs cette idempotence — donc aucun décodeur ne bouge ; le 403 du banni emprunte le
même canal que le 410 du lien expiré, déjà traité partout.

## Lot B — établir une session E2EE depuis une conversation qu'on a quittée

`routes/signal-protocol.ts` annonce en en-tête qu'il protège contre le « key scraping » et
l'« épuisement des pré-clés ». `GET /signal/keys/:userId` tient la promesse : conversation partagée
où **les deux côtés** sont `isActive: true`, ou amitié acceptée.

Cent lignes plus bas, dans le **même fichier**, les deux gardes de `POST /signal/session/establish`
ne filtraient **ni l'une ni l'autre**. Et cette route n'est pas en lecture seule : elle **consomme la
pré-clé à usage unique du destinataire** (`preKeyId: null, preKeyPublic: null`).

Conséquence : un ancien membre — dont la ligne survit à `isActive: false`, et qui garde en cache
local l'identifiant de la conversation — **détruisait à volonté la pré-clé de n'importe quel membre
resté**. C'est l'épuisement de pré-clés que l'en-tête dit prévenir, atteint par la porte qui ne
vérifie pas ce que la porte voisine vérifie. Symétriquement, une session s'ouvrait vers un
destinataire parti, qui n'y lira jamais rien.

Le correctif est le `where` du jumeau, sur les deux côtés. iOS (`E2ESessionManager.getOrCreateSession`
→ `E2EAPI.establishSession`) est le seul appelant et appelle `fetchBundle` juste avant, sur la route
déjà filtrée : **aucune capacité vivante n'est retirée.**

## Preuve

**20 tests neufs, RED→GREEN, 14 rouges observés** avant correctif :
`conversation-rejoin-and-ban-evasion.test.ts` (14 tests, 9 rouges — dont le `create` appelé avec une
cible bannie, imprimé dans la sortie d'échec) et `signal-session-departed-member.test.ts` (6 tests,
5 rouges). Plus 13 tests d'unité sur `conversationEntryAdmission`.

Les doubles Prisma de ces deux fichiers **discriminent réellement** — sur `isActive` et `bannedAt` —
et c'est ce qui les rend capables de voir les défauts. Celui de `signal-protocol-routes.test.ts`
rend ses deux lignes **dans l'ordre d'appel, quel que soit le `where`** : il ne pouvait structurellement
pas mesurer le lot B, et son commentaire d'en-tête annonçait pourtant couvrir « user not a
participant → 403 ».

Un faux positif a été corrigé en cours de route : le premier harnais donnait à l'appelant des portes
d'ajout le rang `member`, si bien que le 403 de **rang** satisfaisait l'assertion qui mesurait le 403
de **bannissement**. Le test passait pour la mauvaise raison.

Suite gateway : **627/627 suites, 16 049 tests verts**, `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Les doublons `Participant` déjà en base ne sont pas comptés.** `resolveConversationEntry` les
  fait converger à la prochaine entrée, mais une paire dont les deux lignes sont ACTIVES reste
  ambiguë et personne ne sait combien il y en a. Un script de dénombrement (pas de réparation)
  demanderait un accès MongoDB — action humaine, comme les deux scripts déjà en attente.
- **`POST /signal/session/establish` n'établit aucune session.** Le `preKeyBundle` que la route
  compose sur vingt lignes n'est **lu par personne** : `signalService` est récupéré, testé non-nul,
  puis abandonné. Le seul effet observable de la route est de **détruire** la pré-clé du
  destinataire. Ce n'est pas un oubli à corriger d'un appel — la vraie établissement de session
  demande `@signalapp/libsignal-client` côté serveur et un magasin de sessions ; la route porte un
  `Note:` qui le dit. **Tête sérieuse du prochain cycle**, à instruire avant de toucher : soit on
  l'implémente, soit on cesse de consommer une pré-clé qu'on n'utilise pas.
- **Qui a le droit d'épingler ?** (cycle 39) — inchangé, toujours en attente d'une décision produit.
- **L'asymétrie édition/suppression sur l'appartenance du non-auteur** (cycle 38b) et
  **l'appartenance active de l'auteur** (cycle 34) attendent le même arbitrage, à trancher ensemble.
- **`attachments/metadata.ts:185`** lit toujours `registeredUser?.role` dans le jeton — vérifié ce
  cycle, non corrigé : c'est la suppression d'une pièce jointe par son déposant ou un admin GLOBAL,
  sans dimension de conversation, donc hors de la famille traitée ici.
- **Reste à balayer sur la question du cycle 37** : les **appels** (`routes/calls.ts`, cinq jointures
  d'appartenance). Les **réactions** ont été vérifiées ce cycle — `ReactionHandler` filtre déjà
  `isActive` sur ses deux chemins, et les lectures de `ReactionService` sont des enrichissements,
  pas des gardes. Le **partage de lien** est traité par le lot A.
- **La file d'attente de fan-out** (D1 du cycle 32) — neuvième report, même raison : aucun accès aux
  logs de production.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b).
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`DELETE /admin/posts/:postId` devrait déléguer à `PostService.deletePost`** (cycle 38).
- **`@Display Name` inextractible dans le domaine social** — quatorzième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`.
- **Les deux scripts de réparation de base** attendent un accès MongoDB — action humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis ESLint v9.
  Condition préexistante, non couverte par la CI — qui ne gate que sur `test:coverage`.

# Cycle 39 — Le cycle 38b a unifié qui peut supprimer. Personne n'avait vérifié QUOI on mute.

Tête prise dans le « reste ouvert » du cycle 38b, qui désignait l'épinglage comme candidat immédiat
à la question du cycle 37. Le candidat désigné (`routes/messages.ts:779-788`) n'était pas
l'épinglage mais la route `/history` — et l'enquête sur le geste d'épingler a rendu **autre chose,
et de plus grave** : les deux moitiés du geste ne mutent pas le même objet.

`PUT …/messages/:messageId/pin` **localise** le message dans la conversation avant d'écrire.
`DELETE …/messages/:messageId/pin` ne l'a jamais fait.

## Lot A — dépingler écrivait par identifiant seul

```ts
await prisma.message.update({ where: { id: messageId }, data: { pinnedAt: null, pinnedBy: null } });
```

Aucun `conversationId`. La seule chose vérifiée en amont est que l'appelant est membre actif de la
conversation **de la route** — jamais que le message en fait partie. Il suffit donc d'être membre
actif de N'IMPORTE QUELLE conversation pour dépingler le message de N'IMPORTE QUELLE autre, à
condition d'en connaître l'id. Ce n'est pas une hypothèse de laboratoire : **tout ancien membre
garde en cache local les identifiants de tous les messages qu'il a vus** avant de partir.

Trois défauts sortent de la même ligne :

1. **L'écriture croisée.** Une permission de conversation A produit une mutation dans la
   conversation B.
2. **La diffusion part au mauvais monde.** `message:unpinned` est émis vers
   `conversation:${conversationId}` — celui de la ROUTE. Les clients réellement concernés ne
   reçoivent rien : leur épingle reste affichée jusqu'au prochain chargement complet, sans qu'aucun
   événement ne les détrompe. Le rejeu hors ligne (`enqueueOfflineMessageMutation`) est enfilé sur
   la même mauvaise conversation.
3. **Un identifiant inconnu rendait 500.** Prisma lève P2025, le `catch` le traduit en
   `sendInternalError` — là où le jumeau qui épingle rend un 404 franc. Même geste, deux formes.

Le correctif est la garde du jumeau, mot pour mot, avant toute écriture. Ce que ce cycle retient de
sa forme : **tous les siblings du fichier la portaient déjà** — pin, `consume`, l'édition, la
suppression, toutes localisent le message par `{ id, conversationId }`. Le dépinglage était la seule
entrée du fichier à écrire par id seul. Un défaut n'a pas besoin d'être subtil pour survivre huit
cycles : il lui suffit d'être le seul membre d'une famille à ne pas faire ce que toute la famille
fait, dans une fonction assez courte pour qu'on la lise sans la comparer.

Clients vérifiés dans les quatre langages (leçon 88) : iOS `MessageService.unpin`
(`ConversationViewModel:3448`) et Android `MessageApi.unpin`. Aucun ne perd de capacité — le
`conversationId` qu'ils envoient est toujours celui du message.

## Lot B — quitter une conversation n'en fermait pas les accusés de lecture

Question du cycle 37, reposée telle quelle sur une autre famille : **quelles appartenances sont
jointes sans `isActive` ?** Un départ ne supprime pas la ligne `Participant`, il la passe à
`isActive: false`. Quatre gardes ne filtraient pas dessus :

| garde | ce qu'un ancien membre pouvait encore faire |
|---|---|
| `GET /messages/:messageId/status-details` | lire qui a lu / reçu un message |
| `GET /attachments/:attachmentId/status-details` | lire qui a écouté / vu une pièce jointe |
| `POST /attachments/:attachmentId/status` | **écrire** ses propres reçus d'écoute et de consultation |
| `GET /messages/:messageId/read-status` | lire le statut de lecture d'un message |

La troisième est celle qui se voit côté produit : un ancien membre **réapparaissait dans la liste
« qui a écouté »** que consultent les membres restants. Une conversation qu'on a quittée continuait
d'enregistrer notre passage.

Ce qui rend ces quatre-là instructives, c'est leur voisinage. Dans `routes/message-read-status.ts`,
**quatre gardes sur cinq** filtrent déjà `isActive: true` — la cinquième est la seule à ne pas le
faire, dans le même fichier, à quelques dizaines de lignes. Dans `routes/messages.ts`, deux sur cinq
filtraient. Ce n'est pas une règle absente du système : c'est une règle appliquée partout **sauf
ici**, ce qu'aucune revue de diff ne voit et qu'aucun test ne mesurait.

Aucune capacité vivante n'est retirée : `GET /conversations/:id/messages` exige déjà l'appartenance
active, donc un ancien membre ne peut plus charger ce dont il consultait les statuts.

## Lot C — la route `/history` retirée, pas réparée

Le cycle 38b la désignait comme « une copie de la forme *rôle de conversation OU rôle du jeton* ».
Elle en est bien une — la **quatrième**, divergente : rôles globaux lus dans le **jeton** et non en
base, appartenance jointe **sans `isActive`**. Mais la réparer aurait été soigner une façade.

`GET /messages/:messageId/history` promet l'historique des modifications d'un message. **Aucun
historique n'est stocké** : le schéma Prisma n'a ni modèle d'édition, ni `previousContent`, ni
`editHistory`. La route rendait `originalContent: message.content` — le contenu **courant**,
présenté sous le nom de l'original — avec un `TODO: implémenter un système d'historique` juste
au-dessus. Et aucun des quatre clients ne l'appelle (vérifié en TypeScript web, Swift SDK et app,
Kotlin).

Une route morte qui rend une donnée fausse sous un nom trompeur et porte une règle d'admission déjà
périmée : les trois raisons pointent dans la même direction. Retirée, avec ses tests. Le jour où
l'historique d'édition sera construit, il lui faudra un stockage et l'unité d'admission partagée —
pas une cinquième copie.

Retiré au passage : la jointure `participants` de `PUT /messages/:messageId`, devenue morte quand
`admitMessageEdit` a repris la décision au cycle 33. Plus rien ne lisait son résultat ; elle
continuait de coûter une jointure par édition, et de donner à lire une garde qui n'en était plus une.

## Preuve

15 tests neufs, RED→GREEN, **7 rouges observés** avant correctif :
`conversation-message-pin.test.ts` (7) et `departed-member-status-gates.test.ts` (8). Les doubles
Prisma de ces deux fichiers **discriminent réellement** — sur `conversationId` pour le premier, sur
`isActive` pour le second. Un mock qui rend la même ligne quel que soit le `where` aurait laissé
passer exactement les défauts mesurés ici ; c'est la précaution qui manquait aux harnais existants,
dont les mocks rendent une liste de participants constante (raison pour laquelle aucun d'eux n'a
jamais pu voir le Lot B).

Suite gateway : **622/622 suites, 15 970 tests verts**, `tsc --noEmit` propre, couverture lignes
**95,65 %**.

## Reste ouvert après ce cycle

- **Qui a le droit d'épingler ? Personne ne l'a jamais décidé.** Les deux routes n'exigent que
  l'appartenance active : **tout membre peut épingler et dépingler n'importe quel message**, y
  compris défaire l'épingle posée par un admin de conversation. C'est cohérent entre les deux
  moitiés du geste, donc ce n'est pas un défaut au sens de ce cycle — mais c'est le seul geste de
  conversation partagé qui n'a AUCUNE règle de rôle, là où WhatsApp et Telegram le réservent aux
  admins en groupe. `PostService.pinPost` exige l'auteur, ce qui donne au dépôt deux réponses pour
  un même verbe. **Tête sérieuse du prochain cycle si une décision produit est disponible** ; sinon
  la laisser ouverte plutôt que trancher à l'aveugle — même arbitrage que l'asymétrie
  édition/suppression du cycle 38b.
- **La question du cycle 37 n'est toujours pas épuisée** — troisième cycle consécutif où elle rend
  une famille entière. Restent à balayer, mêmes deux formes (rôle lu dans le jeton, appartenance
  jointe sans `isActive`) : les **réactions**, les **membres de conversation**, le **partage de
  lien** (`routes/conversations/sharing.ts`) et les **appels** (`routes/calls.ts` porte cinq
  jointures d'appartenance dont l'audit reste à faire).
- **`attachments/metadata.ts:185`** lit encore `registeredUser?.role` dans le jeton — dernier
  survivant connu de cette forme dans la famille message, non touché ici faute de l'avoir instruit.
- **L'asymétrie édition/suppression sur l'appartenance du non-auteur** (cycle 38b) et
  **l'appartenance active de l'auteur** (cycle 34) attendent toujours le même arbitrage produit, et
  devraient être tranchées ensemble.
- **`DELETE /admin/posts/:postId` devrait déléguer à `PostService.deletePost`** (cycle 38) : les
  `TrackingLink` d'un post retiré par la modération résolvent toujours, et aucune ligne
  `AdminAuditLog` n'est écrite.
- **La file d'attente de fan-out** (D1 du cycle 32) — huitième report, même raison : elle demande de
  savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b).
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — treizième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9. Condition préexistante, non couverte par la CI — qui ne gate que sur `test:coverage`.

# Cycle 38b — Deux sessions ont livré le cycle 38 en parallèle, sur la MÊME question

Le cycle 37 laissait une question précise : « quoi d'autre identifie l'acteur d'une mutation par une
propriété de l'objet muté plutôt que par le contexte d'authentification ? ». Deux sessions l'ont
reprise en parallèle et ont trouvé **deux défauts différents, tous les deux réels** :

- **Cycle 38 (ci-dessous)** — le miroir : un contexte d'authentification passé là où une propriété de
  l'objet est attendue, sur la diffusion du retrait d'un post.
- **Cycle 38b (ce bloc)** — le geste jumeau entier : `admitMessageEdit` avait un frère manquant, et
  les trois transports de SUPPRESSION portaient trois règles divergentes.

Les deux sont conservés intégralement : ils ne touchent aucun fichier source commun, et **aucune des
deux réponses ne contient l'autre**. La leçon d'intégration du cycle 23 s'applique — comparer défaut
par défaut, jamais « qui est arrivé en premier ». Ce qui est ajouté ici, au-delà des deux blocs :
la question du cycle 37 a rendu **deux** familles de défauts d'un coup, ce qui est en soi le signe
qu'elle n'est pas épuisée. Elle reste posée telle quelle pour le cycle 39.

## Cycle 38b — Les cycles 33/34 ont unifié QUI peut ÉDITER. Personne n'avait unifié qui peut SUPPRIMER.

Tête prise dans le « reste ouvert » du cycle 37, à la question qu'il posait mot pour mot : **quoi
d'autre identifie l'acteur d'une mutation par une propriété de l'objet muté plutôt que par le
contexte d'authentification ?** La réponse n'était pas un site isolé — c'est le geste jumeau tout
entier. `messageEditAdmission.ts` existe depuis le cycle 33 ; `messageDeleteAdmission.ts` n'existait
pas, et les **trois** transports de suppression portaient chacun leur copie de la règle. Les trois
avaient divergé.

## Ce que les trois copies répondaient

| entrée | client | auteur | rôle CONVERSATION | rôle GLOBAL | appartenance ACTIVE |
|---|---|---|---|---|---|
| socket `message:delete` | web (composer) | oui | **oui** | MODERATOR/ADMIN/BIGBOSS | non exigée |
| `DELETE /messages/:messageId` | **Android** (`MessageApi.kt:40`) | oui | **oui** | + **`CREATOR`** (mort) | **non filtrée — membre INACTIF admis** |
| `DELETE /conversations/:id/messages/:mid` | **iOS** (`MessageService.swift:138`) + web (`message.service.ts:75`) | oui | **NON** | MODERATOR/ADMIN/BIGBOSS | oui |

Les quatre clients ont été vérifiés dans les quatre langages (leçon 88). **Aucune entrée n'est
morte.**

## Lot A — un admin de conversation supprimait depuis Android et recevait 403 depuis son iPhone

La route conversation-scopée annonçait en commentaire « les modérateurs/admins/créateurs de **cette
conversation** » et lisait `membership.user.role` — le rôle **GLOBAL**. Un admin ou modérateur de
conversation (`Participant.role`, minuscules) qui n'est qu'un `USER` global n'y passait jamais.

Ce que ça donne pour un utilisateur : **la même personne, sur le même message, obtenait trois
réponses selon le client qu'elle tenait en main.** Le bouton « supprimer » fonctionnait dans le
composer web (socket) et sur Android, et échouait en 403 sur iPhone et dans la vue web — les deux
clients qui passent par cette route. Rien dans l'interface ne distingue les deux chemins : le geste
est le même, la personne est la même, le message est le même.

C'est exactement le patron de la **leçon 88b** — un commentaire qui affirme une règle que le code
n'applique pas. Celui-ci nommait même la bonne règle : il décrivait l'intention, pas le code, et
trois cycles ont relu la ligne en la croyant.

## Lot B — quitter une conversation n'y retirait pas le pouvoir de supprimer

`DELETE /messages/:messageId` — la route d'Android — joignait les participants avec
`where: { userId }` et **sans `isActive: true`**. Les deux autres transports filtrent. Une ligne
`Participant` laissée derrière par un départ conservait donc indéfiniment le rôle qu'elle portait :
un ancien admin, parti depuis des mois, supprimait toujours les messages de la conversation.

Défaut de sécurité au sens strict — une permission qui survit à la révocation du lien qui la
justifiait — et invisible : rien ne l'expose côté client, et aucun test ne l'avait mesuré.
# Cycle 24 — Le sixième écrivain : éditer par socket écrivait du texte brut là où REST créait un lien

Tête laissée par le cycle 23 :
« **`MessageHandler.handleMessageEdit` ne repasse toujours pas par le traitement des liens
`[[url]]` / `<url>`** que la route REST applique avant de sauver
(`trackingLinkService.processExplicitLinksInContent`). Éditer un message par socket pour y coller
un lien traçable écrit le texte brut ; par REST, le même geste crée le lien. Sixième asymétrie du
même handler, et la seule qui reste sur le contenu lui-même. »

Vérifié, et c'est bien le cas. Mais la prescription décrivait le symptôme, pas le bloc : en allant
lire ce que REST fait *vraiment* de ses liens, on trouve que l'obligation a **deux moitiés**, que
REST n'en tient qu'une, et que la seconde n'est tenue par **personne** à l'édition.

## Les deux moitiés

Un message porte deux choses différentes à propos de ses URLs, et le chemin de CRÉATION
(`MessageProcessor.saveMessage`) fait les deux :

| | Ce que ça fait | Où c'est rangé |
|---|---|---|
| **Liens explicites** | `[[url]]` / `<url>` → `m+<token>` : l'utilisateur a demandé le tracking par sa syntaxe | dans le **contenu**, réécrit |
| **URLs brutes** | mapping `url → token`, contenu INTACT : le client route le clic vers `/l/<token>` en gardant l'URL lisible et son aperçu vidéo | `metadata.trackingLinks` |

À l'édition, avant ce cycle :

| # | Défaut | Ce que l'utilisateur voyait |
|---|---|---|
| D1 | l'édition socket ne réécrivait AUCUN lien explicite | coller `[[https://…]]` par socket persistait les crochets en toutes lettres, définitivement ; le même geste par REST créait le lien |
| D2 | **ni REST ni socket** ne recomposait `metadata.trackingLinks` | une URL brute ajoutée par édition restait intraçable **pour toujours** — le même texte, envoyé tel quel, aurait été tracé |
| D3 | idem, à l'inverse | remplacer une URL laissait en base le token de celle que le texte ne contient plus, et le clic sur la nouvelle n'était jamais compté |
| D4 | l'édition socket retraduisait depuis le texte REÇU | (conséquence de D1) les traductions auraient décrit un texte que la base ne porte pas |
| D5 | l'algorithme de réécriture existait en **deux exemplaires** | `MessageProcessor.processLinksInContent` et `TrackingLinkService.processExplicitLinksInContent`, recopiés ligne pour ligne — protection markdown, réutilisation de token, repli sur l'URL nue, réparation des séquences `$` |

D5 explique D1 : il n'y avait pas d'endroit évident à appeler. Le chemin socket n'a pas « oublié »
un appel, il n'avait aucun appel à faire qui soit manifestement le bon.

## La forme du correctif — souder, puis dédupliquer

`reconcileEditedLinks` (`services/messaging/messageLinks.ts`) réunit les deux moitiés en un point
d'appel public unique, exactement comme `reconcileEditedMentions` du cycle 23 :

```ts
const { processedContent } = await linkService.processExplicitLinksInContent({ … });
const trackingLinks = await linkService.collectContentTrackingLinks({ content: processedContent, … });
return { processedContent, trackingLinks, reconciled: true };
```

**L'ordre n'est pas cosmétique** : le mapping des URLs brutes se calcule sur le contenu DÉJÀ
réécrit, sinon une URL qui vient de devenir `m+<token>` serait recollectée comme si elle était
encore brute et recevrait un second token.

Les deux appelants d'édition passent par là — la route REST (qui perd son bloc `try/catch` déplié)
et `MessageHandler.handleMessageEdit`. Et `MessageProcessor.processLinksInContent` délègue
désormais à `TrackingLinkService` : **il n'y a plus qu'une règle**, testée là où elle vit.

## `metadata` : établi vide ≠ rien établi (et c'est un blob PARTAGÉ)

Deux gardes distinctes, pour deux dangers distincts :

1. **`metadata` n'est réécrit que si `reconciled`.** Un `[]` venu d'une panne transitoire effacerait
   un mapping vivant — et un lien de tracking effacé ne revient jamais : personne ne relit le texte
   après coup, et le clic part alors vers l'URL d'origine sans jamais être compté. À l'inverse, un
   texte édité qui ne porte plus d'URL **doit** produire `metadata.trackingLinks` absent : c'est un
   vide ÉTABLI. Les deux cas sont testés séparément, des deux côtés.
2. **Fusion, jamais affectation.** `Message.metadata` porte aussi `postReplyTo` — un snapshot GELÉ
   du post cité, irrécupérable une fois la story expirée — et `location`. Écrire
   `{ trackingLinks }` par-dessus détruirait les deux. `mergeTrackingLinksIntoMetadata` lit, retire
   la clé, la repose si elle a un contenu, et rend `null` quand il ne reste plus rien à ranger.

Le **contenu**, lui, est persisté dans tous les cas : l'édition de l'utilisateur n'est pas
optionnelle, et une panne de tracking ne doit pas l'annuler. Sur échec, c'est le texte non réécrit.

## Lot C — le rôle `CREATOR`, qui n'existe pas

La même route testait `authRequest.authContext.registeredUser?.role === 'CREATOR'`. L'enum `UserRole`
contient `USER, ADMIN, MODERATOR, BIGBOSS, AUDIT, ANALYST, AGENT` — **pas `CREATOR`**. La branche ne
pouvait jamais être vraie. Elle ne causait aucun bug ; elle donnait à lire une permission
inexistante, ce qui suffit à égarer le prochain audit. (`CREATOR` existe bien dans le dépôt, comme
rôle de **communauté** — `MemberRole.CREATOR`. Deux espaces de nommage, un mot.)

Au passage, le rôle global se lit désormais en **base** et non dans le jeton : un rôle révoqué depuis
l'émission du jeton ne supprime plus. C'est ce que faisaient déjà le socket et
`admitMessageEdit`.

## Lot D — ce que l'unité rend, et pourquoi elle rend plus qu'un booléen

`admitMessageDelete` rend `{ admitted, actorParticipantId? }`. Le second champ n'est pas une
commodité : le cycle 37 a établi que la file de rejeu hors ligne doit exclure **l'acteur** dans les
deux monnaies d'identité, et le handler socket tirait ce `Participant.id` du `include` du message
qu'on vient de retirer. Sans le rendre, son appelant referait la lecture — ou, bien pire, retomberait
sur `message.senderId`, qui désigne l'**AUTEUR** dès qu'un modérateur supprime. C'est précisément le
défaut que le cycle 37 a fermé ; le rouvrir en refactorant aurait été le résultat le plus bête
possible de ce cycle.

Il est `undefined` pour l'auteur (son `Participant.id` **est** `message.senderId`, que l'appelant
tient déjà) et pour l'admin global non participant (aucune ligne à lire). Il n'est **jamais** rendu
avec un refus — un test le verrouille, pour que rien ne puisse l'employer sans avoir lu `admitted`.

## Ce que l'unification a coûté en lectures : moins que rien

Les trois transports joignaient les participants **sur tous les chemins**, y compris celui de
l'auteur — le cas de très loin le plus fréquent. L'unité ne lit rien pour l'auteur, une fois pour un
non-auteur membre (rôle de conversation ET rôle global dans la même ligne), deux fois pour un
non-auteur non membre. Les deux `include` correspondants ont été retirés des requêtes de message.

## Le choix de règle, et ce qu'il ne tranche pas

La règle unifiée est **l'UNION des trois intentions, jamais leur intersection** : les trois copies
voulaient admettre le rôle de conversation (deux le faisaient, la troisième l'annonçait), et deux
admettaient le rôle global sans appartenance. Unifier vers l'union ne retire donc **aucune capacité
vivante** — seuls le membre INACTIF et le `CREATOR` mort disparaissent, et ni l'un ni l'autre n'était
voulu. Aucun transport n'est narrowed sur un chemin que quelqu'un emprunte.

Ce que ce cycle **ne** tranche **pas**, et laisse explicitement à un arbitrage humain :
`admitMessageEdit` EXIGE une appartenance active du non-auteur, `admitMessageDelete` non. Un
`BIGBOSS` peut donc supprimer un message dans une conversation où il n'est pas, mais pas l'éditer.
Les deux positions se défendent — corriger le texte d'autrui à distance est plus intrusif que retirer
un contenu signalé — mais l'écart est réel et mérite une décision produit, pas un alignement
silencieux décidé par une routine. Aligner dans un sens ou dans l'autre est mécanique une fois la
décision prise : un `PRIVILEGED_GLOBAL_ROLES` partagé, deux unités jumelles, une garde à déplacer.

## Vérification

- **`PRIVILEGED_GLOBAL_ROLES` est désormais exporté et partagé** par les deux unités. Deux ensembles
  écrits séparément dériveraient — c'est la maladie même que ces deux fichiers soignent.
- **32 tests neufs, écrits AVANT l'implémentation, 6 rouges observés au niveau TRANSPORT** :
  - `messageDeleteAdmission.test.ts` (neuf, 26 cas) — RED complet (le module n'existait pas) : les
    trois branches d'admission, `isActive: true` vérifié sur la requête elle-même, le refus de
    `CREATOR`, le refus de `USER`/`AUDIT`/`ANALYST`/`AGENT`, l'auteur qui ne coûte aucune lecture,
    le message ANONYME dont personne n'est l'auteur, les cinq cas du `Participant.id` rendu, et
    quatre cas d'échec FERMÉ — dont « une lecture d'appartenance en échec n'ouvre pas la porte au
    rôle global », qui vérifie que la dégradation ne fabrique pas un second chemin.
  - `messages-extended.test.ts` — 5 cas sur la route d'**Android**, **3 rouges** : l'admin de
    conversation admis, la requête d'appartenance filtrée `isActive: true`, le `BIGBOSS` global.
  - `conversation-messages-advanced.test.ts` — 4 cas sur la route d'**iOS et du web**, **3 rouges** :
    l'admin de conversation, le modérateur de conversation, le `BIGBOSS` non participant.
  - Le test du cycle 37 (« l'AUTEUR hors ligne reçoit la suppression quand un admin modère ») est
    **conservé tel quel dans son assertion** et re-câblé sur la nouvelle lecture : c'est lui qui
    prouve que le refactor n'a pas rouvert le défaut qu'il gardait.
- **`tsc --noEmit` : 0 erreur** (après `prisma generate` + build de `packages/shared`, cf. CLAUDE.md).
- **Suite gateway complète : 618 suites, 15 950 tests, tout vert.** Couverture lignes **95,66 %**
  (inchangée), branches **89,03 %**. `messageDeleteAdmission.ts` : **100 % lignes, 100 % branches,
  100 % fonctions**. `messageEditAdmission.ts` reste à 100 %. `MessageHandler.ts` : 98,20 % lignes,
  96,10 % branches.
- **Deux fichiers de tests socket ont dû être re-câblés** (`MessageHandlerEditDelete.test.ts`,
  `MessageHandler.core.test.ts`) : ils injectaient l'appartenance dans le `include` du message. Leurs
  **assertions sont inchangées** — seule la source de la donnée bouge. C'est délibéré : un test dont
  on change l'assertion en même temps que le code ne prouve plus rien.

## Reste ouvert après ce cycle

- **L'asymétrie édition/suppression sur l'appartenance du non-auteur** (ci-dessus) — la seule
  question que ce cycle a ouverte et délibérément pas fermée. **Tête sérieuse du prochain cycle si
  une décision produit est disponible** ; sinon, la laisser ouverte plutôt que trancher à l'aveugle.
- **La question du cycle 37 reste partiellement ouverte** : elle a rendu un geste entier (la
  suppression), pas un site isolé. À reposer sur les autres familles de mutation — réactions,
  épinglage, membres de conversation — en cherchant les rôles lus dans le **jeton** plutôt qu'en base,
  et les appartenances jointes **sans `isActive`**. `routes/messages.ts:779-788` (l'épinglage) porte
  encore une copie de la forme « rôle de conversation OU rôle du jeton » qui n'a pas été touchée ici :
  candidat immédiat, même patron, même remède.
- **`admin/messages.ts` n'a AUCUNE route de suppression** — la modération globale passe forcément par
  les routes utilisateur. C'est ce qui rend le chemin « rôle global sans appartenance » nécessaire
  aujourd'hui, et c'est ce qu'il faudrait construire avant de pouvoir le retirer.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision (un auteur qui a quitté peut encore éditer ses messages par les quatre entrées). Elle est
  le miroir exact de l'asymétrie ci-dessus ; les deux devraient être tranchées ensemble.
- **La file d'attente de fan-out** (D1 du cycle 32) — septième report, même raison : elle demande de
  savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b).
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — douzième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9. Condition préexistante, non couverte par la CI — qui ne gate que sur `test:coverage`.

# Cycle 38 — Un retrait de contenu doit s'annoncer, et s'annoncer au bon monde.

Tête prise exactement où le cycle 37 la posait : « quoi d'autre identifie l'acteur d'une mutation par
une propriété de l'objet muté plutôt que par le contexte d'authentification ? ». La réponse est
arrivée en **miroir** — le défaut trouvé est l'exact inverse de celui cherché : ici c'est le
**contexte d'authentification qui était passé là où une propriété de l'objet est attendue**. Même
famille, même cause (acteur et cible ont longtemps coïncidé), sens opposé.

## Lot A — la suppression modérée s'annonçait au graphe social du MODÉRATEUR

`DELETE /posts/:postId` autorise « l'auteur, OU un modérateur et plus » (`PostService.deletePost`,
`canModerate`). Les trois diffusions de retrait reçoivent ensuite un `authorId` dont
`SocialEventsHandler` se sert pour **déplier un graphe social** (`getFriendIds` /
`getVisibilityFilteredRecipients`) et pour ajouter la feed room de cette personne aux destinataires.

La route y passait `authContext.registeredUser.id`.

| qui | ce qu'il devrait recevoir | ce qu'il recevait |
|---|---|---|
| l'auteur du post retiré | `post:deleted` | **rien** |
| ses amis, qui ont le post au fil | `post:deleted` | **rien** |
| les amis du modérateur | rien | `post:deleted` d'un post qu'ils n'ont pas |

Rien ne rejoue ces événements et aucun client ne refetch spontanément : le post restait **affiché
dans le fil de tous ses lecteurs, auteur compris**, jusqu'à un rafraîchissement manuel. Le retrait
était committé en base et invisible partout où il comptait. Seuls les spectateurs du détail étaient
épargnés, par `ROOMS.post(postId)` — qui, lui, ne dépend d'aucune identité.

**Le chemin voisin portait déjà la bonne lecture.** `DELETE /posts/:postId/comments/:commentId`
(`comments.ts`) relit `post.authorId` en base avant de diffuser, pour cette raison exacte. Troisième
cycle consécutif où le correctif existait à quelques fichiers de distance sans qu'aucun test ne le
relie à son jumeau (leçon 90).

## Lot B — la console d'administration ne s'annonçait à personne

`DELETE /admin/posts/:postId` écrit `deletedAt` **sans passer par `PostService.deletePost`**. La
route porte déjà un commentaire sur ce que ce raccourci a coûté une fois : les usages de sons,
jamais libérés, corrigés par un cycle précédent. Le même raccourci laissait tomber toute la
diffusion — `post:deleted` / `story:deleted` / `status:deleted` ne partaient **jamais** depuis
l'admin. Un post retiré par la modération restait vivant à l'écran de chacun.

La route ne sélectionnait d'ailleurs pas de quoi le faire : son `select` s'arrêtait à
`{ id, deletedAt, authorId }`, sans `type` (qui choisit l'événement) ni `visibility` /
`visibilityUserIds` (qui refiltrent l'audience d'un STATUS).

## Le seam — `broadcastPostRemoval`

Trois familles de contenu vivent dans la même table `Post` et voyagent sur trois événements
distincts, parce que les clients s'y abonnent séparément. **Choisir le bon est une règle, pas un
détail d'appel** — et elle n'a aucune raison d'exister en deux exemplaires quand les deux routes
retirent le même objet. `services/gateway/src/socketio/broadcastPostRemoval.ts` la porte une fois,
avec ses deux invariants écrits noir sur blanc (l'audience se déplie depuis l'AUTEUR ; la visibilité
accompagne le STATUS), et reste best-effort : le retrait est committé quand il s'exécute.

## Vérification

- **8 tests neufs, écrits AVANT l'implémentation, 6 rouges observés** :
  - Lot A — 3 rouges (`Received: …032` là où `…031` était attendu, sur POST / STORY / STATUS) et
    **1 vert délibéré** : l'auteur qui supprime lui-même. Sans ce témoin, les trois autres passeraient
    au vert avec n'importe quel identifiant : c'est lui qui prouve que le test mesure « l'auteur » et
    pas « une chaîne ».
  - Lot B — 3 rouges à `Number of calls: 0` (aucune diffusion n'existait) et 1 vert : une instance
    sans `socialEvents` décoré (serveur Socket.IO non monté) supprime sans broncher.
- **Un test existant asseyait l'ancien comportement** (`core-extended.test.ts`) — sa fixture rendait
  un document soft-deleté **sans `authorId`**, ce que Prisma ne fait jamais. Fixture rendue fidèle,
  assertion conservée.
- **Suite gateway complète : 619 suites, 15 921 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %** (inchangée), branches 89,03 %. `broadcastPostRemoval.ts` : 100 %
  lignes / 100 % branches. `routes/admin/posts.ts` : 99,11 %. `routes/posts/core.ts` : 95,18 %.
- Aucun changement de format sur le fil : le payload portait déjà `authorId`, il porte désormais le
  bon. Vérifié qu'aucun client ne le lit — iOS (`SocialSocketManager` → `payload.postId`), web
  (`data.postId` / `data.storyId`), Android (aucun modèle ne décode le champ).

## Reste ouvert après ce cycle

- **Tête sérieuse du prochain cycle — `DELETE /admin/posts/:postId` devrait déléguer à
  `PostService.deletePost`.** Ce cycle a fermé la 2ᵉ omission de ce raccourci ; il en reste **deux,
  vérifiées** : (1) les `TrackingLink` du post ne sont **pas désactivés** — les liens de partage d'un
  post retiré par la modération **continuent de résoudre** (`isLinkActive` ne regarde que
  `isActive`/`expiresAt`, jamais le `deletedAt` de la cible) ; (2) **aucune ligne `AdminAuditLog`**
  n'est écrite, là où `deletePost` en écrit une pour toute suppression non-auteur — la route se
  contente d'un `fastify.log.info`. Le blocage à lever d'abord : `deletePost` ne distingue pas
  « introuvable » de « déjà supprimé » (filtre `NOT_DELETED` → `null` dans les deux cas) alors que la
  route rend 404 vs 400, et construire `PostService` dans ce fichier fait construire `MediaService`
  au montage. Piste : garder le `findUnique` de pré-contrôle pour la sémantique HTTP, déléguer le
  retrait.
- **`PUT /posts/:postId` passe l'acteur là où l'auteur est attendu** (3 diffusions +
  `reconcilePostMentions`). **Ce n'est pas un défaut aujourd'hui** : `updatePost` lève `FORBIDDEN`
  pour tout non-auteur, décision produit explicite (« un modérateur ne peut PAS modifier un poste »).
  C'est une **coïncidence, pas une garantie** — exactement la configuration qui a produit le lot A et
  le lot A du cycle 37. À rendre inconditionnel le jour où cette règle bouge, pas avant : aucun test
  ne peut distinguer les deux tant que le service les fait coïncider.
- Le reste du backlog du cycle 37 est inchangé : appartenance active de l'auteur, file d'attente de
  fan-out (D1 du cycle 32, 7ᵉ report), borne de concurrence de `member_joined`,
  `getVisibilityFilteredRecipients` / `filterPostConsumers` qui ne se citent pas, `@Display Name`
  social, `createStoryCommentNotificationsBatch`, les deux scripts de réparation de base.
- **`eslint` ne peut toujours pas tourner sur le gateway** (pas d'`eslint.config.js` depuis ESLint
  v9). Condition préexistante ; la CI ne gate que sur `test:coverage`.

# Cycle 37 — Les cycles précédents ont unifié QUI peut éditer. Le reste du système croyait encore que l'éditeur est l'auteur.

Tête prise dans le « reste ouvert » du cycle 36, mais pas à l'endroit qu'il désignait : son candidat
— l'inventaire « quel client emploie quelle route » — **existe déjà**. Il a été écrit en tête de
`services/messaging/messageEditAdmission.ts` (section « QUI APPELLE QUOI », les quatre entrées avec
leur client et le fichier exact) par le cycle qui a écrit la leçon 88. Vérifier avant d'exécuter,
deuxième cycle consécutif où c'est le premier geste utile.

Reste alors la vraie question que les cycles 33 à 36 ont ouverte sans la refermer : **ils ont changé
qui peut éditer un message. Qu'est-ce qui, ailleurs, tenait encore l'ancienne réponse pour acquise ?**

## Lot A — la file de rejeu hors ligne excluait l'AUTEUR au lieu de l'ÉDITEUR

`enqueueForOfflineParticipants` exclut l'acteur : on ne rejoue pas à quelqu'un l'événement qu'il
vient de produire. Le handler socket `message:edit` — transport PRIMAIRE — désignait cet acteur par
`message.senderId`, le `Participant.id` de l'**auteur**.

Les deux coïncidaient tant qu'on ne pouvait éditer que ses propres messages. `admitMessageEdit`
(cycles 33/34) rend explicitement `asModerator: true` pour un éditeur non-auteur : depuis, la
personne exclue n'est plus l'acteur, c'est **la cible**.

| qui | ce qu'il devrait recevoir | ce qu'il recevait |
|---|---|---|
| l'auteur, hors ligne, dont on modère le message | l'édition, au rejeu | **rien, jamais** |
| le modérateur qui édite | rien | rien (exclu par sa présence, par accident) |

Le second n'était couvert que par le hasard : `connectedUsers.has(queueKey)` écarte tout participant
connecté, et un éditeur qui parle par socket l'est. L'exclusion par identité ne servait plus qu'à
écarter la seule personne qu'il fallait servir.

Ce que ça donne pour un lecteur : rien ne rejoue l'événement et aucun client ne refetch
spontanément. La copie locale de l'auteur garde donc le texte d'**avant** modération — c'est-à-dire
exactement le contenu que la modération retirait — pendant que toute la conversation lit le texte
corrigé. Divergence permanente entre deux clients d'une même conversation, invisible des deux côtés :
le modérateur voit son geste appliqué, l'auteur n'a aucune raison de douter de ce qu'il lit.

**Le jumeau portait déjà le correctif.** `handleMessageDelete`, quinze lignes plus bas dans le même
fichier, écrit noir sur blanc : « Skip the DELETER, not the author. A moderator/admin may delete
another user's message (`message.senderId` is the author's participant id, not the actor's) ». Le
raisonnement était disponible, formulé, à portée de regard — et il n'avait **aucun test**, donc rien
ne l'a jamais rapproché de son frère.

## Lot B — la cause : un paramètre nommé d'après une valeur, pas d'après un rôle

Le helper privé était positionnel, et son deuxième paramètre s'appelait `senderParticipantId`. Ce nom
ne décrit pas ce que la fonction en fait (exclure l'acteur) mais ce que l'appelant avait sous la
main (l'auteur du message). Un appelant qui cherche quoi passer trouve `message.senderId` et le
passe : le nom du paramètre **valide** le geste au lieu de le questionner.

Il devient un paramètre-objet nommé d'après le RÔLE — `actorParticipantId` / `actorUserId`, comme
l'unité partagée qu'il enveloppe et qui documente déjà les deux monnaies. Le chemin de suppression y
gagne `actorUserId` en plus de son `Participant.id` : l'admin GLOBAL qui n'est pas participant n'a
pas de ligne à charger (`participants[0]?.id` vaut `undefined`, donc n'exclut personne) mais a
toujours un `User.id`.

## Lot C — la docstring qui affirmait la règle d'avant

L'en-tête de `handleMessageEdit` annonçait encore « Permissions: only the message author can edit
their own message ». Depuis les cycles 33/34, c'est faux. C'est cette phrase qui rendait
`message.senderId` cohérent au relecteur : si seul l'auteur édite, alors l'auteur EST l'acteur, et le
code se lit juste. Corrigée pour renvoyer à `admitMessageEdit`.

## Vérification

- **3 tests neufs, écrits AVANT l'implémentation, 1 rouge observé** (les deux autres sont des
  verrous sur du comportement déjà correct) :
  - « queues the edit for the OFFLINE AUTHOR when a moderator edits their message » — **rouge :
    `Number of calls: 0`**, la file ne recevait rien du tout.
  - « never queues the edit back to the EDITOR, by identity rather than by presence » — l'acteur est
    retiré de `connectedUsers` exprès : sans cela le test ne distingue pas l'exclusion par identité
    de l'exclusion par présence, et passerait au vert quel que soit le correctif.
  - le jumeau côté suppression, qui verrouille enfin le correctif que ce chemin portait sans test.
- `makeHandler` accepte désormais un `deliveryQueue` — sans lui `enqueueForOfflineParticipants`
  retourne immédiatement, et **aucun** des trois tests ne pourrait rien mesurer.
- **Suite gateway complète : 616 suites, 15 896 tests, tout vert** (cycle 36 : 616 / 15 893 — les 3
  tests neufs, exactement). `tsc --noEmit` propre. Couverture lignes **95,66 %**, branches
  **89,05 %** — inchangée. `MessageHandler.ts` : 98,21 % lignes, 96,42 % branches.

## Reste ouvert après ce cycle

- **Le candidat du cycle 36 est clos** : l'inventaire des quatre transports vit en tête de
  `messageEditAdmission.ts`. Ne pas le réécrire ailleurs.
- **Piste ouverte par ce cycle** : les cycles 33/34 ont élargi QUI peut éditer. Le lot A est le
  premier endroit trouvé qui tenait encore l'ancienne réponse. La question à reposer telle quelle au
  prochain cycle : **quoi d'autre, dans le gateway, identifie l'acteur d'une mutation par une
  propriété de l'objet muté plutôt que par le contexte d'authentification ?** Chercher les
  `message.senderId`, `post.authorId`, `conversation.createdBy` passés là où un `userId` de requête
  est attendu.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision : un auteur qui a quitté une conversation peut encore éditer ses messages par les quatre
  entrées.
- **La file d'attente de fan-out** (D1 du cycle 32) — sixième report, même raison : elle demande de
  savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`invalidateCacheForMessage` n'a plus d'appelant hors de la classe** (cycle 35) — gardé public
  délibérément. À ne pas re-câbler depuis une route.
- **`@Display Name` inextractible dans le domaine social** — onzième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.

# Cycle 36 — Les cycles précédents ont unifié ce qu'une édition EXIGE, PRODUIT et PÉRIME. Pas ce qu'elle PUBLIE.

Tête prise à l'endroit que le cycle 35 désignait. La consigne qu'il laissait s'est avérée
**fausse**, et la vérifier avant de l'exécuter est le résultat le plus important de ce cycle.

## Lot 0 — la consigne du cycle 35 aurait cassé la file offline d'Android

Le cycle 35 concluait : « `PATCH /messages/:messageId` n'a toujours aucun appelant de production…
**Tête sérieuse du prochain cycle** : la retirer, elle et son service client. »

Il n'avait cherché l'appelant que côté **web**. Côté Android :

```
apps/android/sdk-core/.../outbox/OutboxFlushWorker.kt:161
    when (apiCall { messageApi.edit(row.targetId, body) }) {
apps/android/core/network/.../api/MessageApi.kt:34
    @PATCH("messages/{id}")
```

**C'est le chemin par lequel Android rejoue les éditions faites hors ligne.** La retirer aurait
transformé chaque flush d'édition offline en 404 — silencieusement, puisqu'un rejeu de file n'a pas
d'écran pour se plaindre. Le transport n'est pas mort : il est le seul que ce client emploie.

Ce que le cycle 35 avait vu est vrai pour une moitié seulement : **le client WEB** de cette route
était mort. C'est lui, et lui seul, qui est retiré (lot C).

La leçon tient en une ligne, écrite dans `lessons.md` : **« aucun appelant » ne se conclut pas d'une
recherche sur un seul client.** Ce dépôt en porte quatre — web, iOS, Android, SDK Swift — et
`grep` sur `.ts` n'en voit qu'un.

## Lot A — deux transports sur quatre publiaient la traduction du texte d'AVANT

Le cycle 35 a fermé cette fuite côté **cache mémoire** (`invalidateCacheForMessage`, désormais en
tête de la retraduction). Elle restait grande ouverte sur le chemin le plus visible : la **réponse
HTTP** et la charge **`message:edited`** diffusée à toute la conversation.
# Cycle 20 — L'accusé atteint enfin celui qui l'a produit : l'éventail de rooms laissait tomber tout participant sans compte

## Constat

Ce cycle a démarré sur le premier point ouvert du cycle 18 (l'accusé « remis » inatteignable
depuis les routes de lien) et l'a trouvé **déjà mergé sur `main` à mi-parcours**, produit en
parallèle par une autre exécution de la routine (`73fadd58`). Le travail dupliqué a été
abandonné. Ce qui suit est le **défaut résiduel** que la relecture de ce correctif a fait
apparaître, et qu'il ne pouvait pas voir depuis son propre périmètre.

## Diagnostic

### D1 — l'anonyme acquitte la remise et n'apprend jamais qu'elle a eu lieu

`73fadd58` a fait entrer le participant anonyme dans le filtre de présence
(`_presenceKey = userId ?? id`) et dans la lecture de préférences. Trois lignes plus bas, la
diffusion est restée inchangée :

```ts
for (const p of participants) {
  if (!p.userId) continue;          // ← l'anonyme qui vient d'acquitter est ici
  const userRoom = ROOMS.user(p.userId);
  ...
}
```

Le participant anonyme entre donc dans le NUMÉRATEUR de `getLatestMessageSummary` sans entrer
dans la diffusion qui l'annonce. Son test d'accompagnement fige la croyance :
`expect(roomTargets).not.toContain('user:<anonParticipantId>')`, commenté « l'acquitteur
anonyme n'a pas de room personnelle ».

### D2 — cette room existe, et le dépôt le dit à trois fichiers de distance

`AuthHandler._authenticateAnonymousUser` fait rejoindre `ROOMS.user(participant.id)` à toute
socket anonyme, sous un commentaire écrit en réparant ce défaut sur un autre canal :

> « La room personnelle DOIT utiliser `ROOMS.user(...)` — […] la seule room que TOUT émetteur
> d'événement personnel adresse (`io.to(ROOMS.user(participant.userId ?? participant.id))`).
> Joindre la room `socketUser.id` nue laissait la socket anonyme dans une room qu'aucun
> émetteur n'adresse, si bien que `conversation:unread-updated` n'atteignait jamais les
> participants anonymes. »

La room de conversation n'est pas un substitut : c'est la raison d'être du chaînage. Un client
parti sur la liste des conversations a quitté `conversation:<id>` et n'est joignable que par sa
room personnelle — donc le destinataire que l'éventail laissait tomber est exactement celui qui
ne regardait pas.

### D3 — trois copies verbatim, le même angle mort, deux qui ne lisent même pas l'identité de repli

| Site | Sélection | Éventail |
|---|---|---|
| `MessageHandler.autoDeliverToOnlineRecipients` | `{ id, userId }` | `if (!p.userId) continue` |
| `broadcastReadStatusUpdate` (`routes/message-read-status.ts`) | `{ userId }` | `if (!p.userId) continue` |
| diffusion d'accusé (`routes/conversations/messages.ts`) | `{ userId }` | `if (!p.userId) continue` |

Deux des trois ne chargent pas `Participant.id` : l'identité de repli n'est pas ignorée, elle
n'est pas lue. La forme correcte existait pourtant depuis le cycle 17 dans
`emitUnreadCountsToRecipients` (`ROOMS.user(recipient.userId ?? recipient.id)`), à un fichier
des trois copies fausses.

Conséquence produit, sur les trois chemins : un participant anonyme n'apprend ni qu'un pair a
lu, ni que la remise qu'il vient lui-même d'acquitter a eu lieu.

## Plan
- [x] T1 — RED : `emitToConversationParticipants` adresse un participant sans compte par son id
- [x] T2 — GREEN : `socketio/emitToConversationParticipants.ts` (chaînage, dédup, rooms rendues)
- [x] T3 — les trois copies convergent sur l'unité, les deux `select` chargent `id`
- [x] T4 — l'assertion négative de `MessageHandler.autoDeliver.test.ts` corrigée en positive
- [x] T5 — RED→GREEN sur les deux routes via leur API HTTP publique
- [x] T6 — gates : suite gateway complète + `tsc --noEmit`
- [x] T7 — changeset + CHANGELOG + lessons
- [x] T8 — PR, CI vert, merge sur main

Sur les deux routes REST d'édition, l'écriture du contenu ne vidait pas `translations`. Un **second**
`update`, placé dans le bloc de retraduction, s'en chargeait — mais **après** la lecture qui compose
la charge utile :

| transport | `translations: null` dans l'écriture du contenu | charge utile composée avant l'invalidation |
|---|---|---|
| socket `message:edit` (PRIMAIRE) | oui | non — payload construit en mémoire |
| `PATCH /messages/:messageId` (Android) | oui | non |
| `PUT /messages/:messageId` (iOS) | **non** | **oui** |
| `PUT /conversations/:id/messages/:messageId` (web) | **non** | **oui** |

Les deux transports fautifs sont exactement ceux des deux clients à écran. La ligne relue portait le
texte d'APRÈS et les traductions d'AVANT, et c'est cette paire qui partait vers tous les clients.

Ce que ça donne pour un lecteur : le **Prisme Linguistique** fait que la plupart ne voient QUE la
traduction. Un francophone dans une conversation anglaise recevait `message:edited` avec le nouveau
texte anglais **et** l'ancienne traduction française — et son client affichait l'ancienne, présentée
comme la traduction de la nouvelle. Jusqu'à ce que la retraduction asynchrone pousse la suivante :
une fenêtre courte en secondes, permanente en pratique, et parfaitement invisible pour l'éditeur,
qui lui voit l'original.

L'invalidation **appartient à l'écriture du contenu** : un nouveau texte périme ses traductions à
l'instant où il est écrit, pas trois `await` plus tard. Elle rejoint donc le `data` de l'écriture —
déjà gardée par `deletedAt: null` — et le second `update` disparaît. C'est la même forme de
correctif que le lot A du cycle 35 : la règle va là où le geste se produit, pas chez ses appelants.

Les commentaires des deux routes **affirmaient l'inverse de ce que le code faisait** (« la
retraduction qui précède a déjà invalidé `translations`, donc le payload reflète cet état : `[]` »).
Un commentaire qui décrit un ordre que le code n'a pas est ce qui a permis au défaut de survivre à
trois cycles de revue de ces mêmes routes. Corrigés tous les deux.

## Lot B — la retraduction passe par l'entrée publique du service

`retranslateMessageAsync` est l'entrée publique, et le handler socket l'emploie correctement. Les
deux routes REST atteignaient `_processRetranslationAsync` — la méthode privée qu'elle expose —
derrière un `as any`. Deux vocabulaires pour un même geste, dont un qui perce l'encapsulation et
coûte une assertion de type que `fastify.translationService` (typé `MessageTranslationService`) rend
inutile. Reste ouvert du cycle 35, fermé ici : deux `as any` en moins.

## Lot C — le client web mort de la route PATCH

`apps/web/services/messages.service.ts` retiré, avec son test. Le dépôt portait **deux** objets
exportés sous le nom `messagesService` : celui de `services/conversations/messages.service.ts`
(vivant — `markAsRead`, `getReadStatuses`, `getMessageStatusDetails`, importé par trois hooks) et
celui-ci, réexporté par le barrel `@/services` mais importé par son seul fichier de test. Un
développeur écrivant `import { messagesService } from '@/services'` obtenait silencieusement le
mort. Les types `Message`, `CreateMessageDto`, `UpdateMessageDto` qu'il exportait n'avaient eux non
plus aucun consommateur.
### Le travail perdu n'était pas le diagnostic

La collision a coûté le code, pas la lecture. Relire ce qui venait d'atterrir — plutôt que de
constater le doublon et refermer — a produit un défaut que le correctif jumeau ne pouvait pas
voir : son périmètre s'arrêtait au filtre de présence, et le trou était dans la diffusion trois
lignes plus bas. **Après une collision, comparer et publier la différence.**

### Une assertion négative protège le défaut

`not.toContain('user:<anon>')` n'échoue jamais tant que la croyance qu'elle encode reste fausse
dans le code. Elle ne verrouille donc pas un contrat, elle verrouille un état. Ici elle
affirmait l'inverse exact d'un `socket.join` documenté, et le commentaire qui la justifiait
citait la room de conversation comme substitut — ce qu'elle n'est précisément pas.

C'est la moitié correcte de la consigne du cycle 35 — celle qui ne touche aucun client vivant.

## Vérification

- **9 tests neufs, écrits AVANT l'implémentation, 9 rouges observés** :
  - `message-edit-stale-translation.test.ts` (neuf) — 6 cas sur `PUT /messages/:messageId` : la
    réponse HTTP sans traduction périmée, la charge `message:edited` sans traduction périmée,
    l'invalidation dans l'écriture du contenu sous la garde `deletedAt`, l'absence de fenêtre à
    l'instant de la relecture, l'absence de seconde écriture, et l'appel à `retranslateMessageAsync`.
  - `conversation-messages-advanced.test.ts` — 3 cas sur `PUT /conversations/:id/messages/:messageId`.
  - Les deux harnais emploient un **fake Prisma STATEFUL** (les écritures mutent la ligne, les
    lectures la rendent) : le défaut est un problème d'**ordre** entre écritures et lecture, qu'un
    mock à valeur fixe ne peut pas exprimer — il rendrait la même valeur avant et après le
    correctif, donc passerait au vert sans rien prouver. `transformTranslationsToArray` est laissé
    **non mocké** dans le fichier neuf, pour la même raison : un mock rendant `[]` masque exactement
    ce qu'on mesure.
- **Suite gateway complète : 616 suites, 15 893 tests, tout vert** (cycle 35 : 615 / 15 884).
  `tsc --noEmit` propre. Couverture lignes **95,66 %**, branches **89,05 %** — inchangée.

## Reste ouvert après ce cycle

- **`invalidateCacheForMessage` n'a plus d'appelant hors de la classe** (cycle 35) — gardé public
  délibérément. À ne pas re-câbler depuis une route.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision : un auteur qui a quitté une conversation peut encore éditer ses messages par les quatre
  entrées.
- **La file d'attente de fan-out** (D1 du cycle 32) — cinquième report, même raison : elle demande
  de savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — dixième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.
- **Piste ouverte par le lot 0** : les quatre transports d'édition existent parce que quatre clients
  ont chacun choisi le leur. Aucun inventaire ne dit quel client emploie quelle route. Un tel
  inventaire — même un simple tableau en tête de `messages-advanced.ts` — aurait évité l'erreur du
  cycle 35, et évitera la prochaine. Candidat pour le cycle 37.

# Cycle 36b — Addendum d'une session parallèle : ce que l'édition ÉCRIT, et le module qu'on ne peut pas prouver

Deux sessions ont livré leur cycle 36 en parallèle. **Les deux ont trouvé indépendamment le même
fait Android** (lot 0 ci-dessous / leçon 88) : `PATCH /messages/:messageId` porte la lane
`EDIT_MESSAGE` de la file offline d'Android et ne doit pas être retirée. La convergence vaut
confirmation ; le récit du lot 0 de la session ci-dessus est gardé, celui de cette session est retiré
au profit du sien.

Les deux têtes n'ont **aucune intersection de défaut** : l'une porte sur ce que l'édition **PUBLIE**
(traductions périmées dans la réponse HTTP et la charge `message:edited`), l'autre sur ce qu'elle a
le droit d'**ÉCRIRE**. Le seul recouvrement est le nettoyage `_processRetranslationAsync` →
`retranslateMessageAsync`, que les deux sessions ont fait au même endroit et à l'identique — fusionné
en gardant les commentaires de la session ci-dessus. (Leçon d'intégration du cycle 23 : comparer
défaut par défaut, jamais « qui est arrivé en premier ».)

## Lot A — le quatrième transport laissait une édition VIDER un message

`admitEditedContent` (`services/messaging/messageEditContent.ts`), jumeau de `admitMessageEdit` :
celui-ci dit QUI peut éditer, le neuf dit ce que l'édition a le droit d'**écrire**. La règle est
courte — un message ne peut pas devenir vide, à moins qu'une pièce jointe ne le porte à elle seule
(retrait de légende) — et elle vivait recopiée à trois endroits sur quatre transports. Le quatrième,
celui d'Android, ne la portait pas du tout :

| entrée                                     | garde de vacuité | vide + pièce jointe |
|--------------------------------------------|------------------|---------------------|
| socket `message:edit` (PRIMAIRE)           | oui              | admis               |
| `PUT /conversations/:id/messages/:mid`     | oui              | admis               |
| `PUT /messages/:messageId` (iOS)           | oui              | admis               |
| **`PATCH /messages/:messageId` (ANDROID)** | **aucune**       | **refusé**          |

Sa seule protection était le `minLength: 1` de son schéma JSON, **et il se trompait dans les deux
sens à la fois** :

- **trois espaces le satisfont.** Le `.trim()` de la ligne suivante les réduisait à la chaîne vide,
  et la ligne partait en base avec `content: ""`. C'est un `update`, pas un patch partiel : le texte
  d'origine était déjà écrasé, et un `message:edited` **vide** s'en allait vers tous les clients de
  la conversation. La sortie RED du test le montre littéralement —
  `data: {"content": "", "isEdited": true, "translations": null}`.
- **il refusait en même temps la chaîne vide LÉGITIME**, celle qui retire la légende d'un message à
  pièce jointe, que les trois autres transports acceptent : un utilisateur Android ne pouvait pas
  effacer une légende.

Une garde qui compte les caractères **bruts** ne décide jamais de ce qu'elle croit décider : c'est le
contenu **après `trim`** qui part en base, et c'est donc lui, et lui seul, que la règle doit regarder.

L'unité rend le contenu à écrire **en même temps que** le verdict. C'est délibéré, et c'est ce qui
empêche la divergence de repousser : le `.trim()` recopié chez chaque appelant est exactement
l'endroit où le transport iOS avait déjà jeté un `TypeError` sur un `content` absent (traduit en 500
par le catch). Un appelant qui obtient son texte de l'unité ne peut plus diverger d'elle. Les trois
`.trim()` d'appelant et les deux formulations différentes du même refus disparaissent avec.

Le schéma JSON du PATCH ne garde que le plafond (`maxLength: 10000`, parité avec
`EditMessageBodySchema`) : un schéma de corps ne peut pas connaître les pièces jointes. La route les
lit désormais (`attachments: { select: { id: true } }`) — sans elles, la garde ne peut pas trancher.

## Vérification

- **21 tests neufs**, écrits AVANT l'implémentation, **RED observé sur les deux niveaux** : les tests
  d'unité échouent à la résolution du module quand l'implémentation est retirée ; les tests de route
  montrent l'écriture fautive (`prisma.message.update` appelé avec `content: ""`).
- `messageEditContent.test.ts` — 12 cas : refus du vide / des espaces seuls / des blancs non-espace
  (tabulation, saut de ligne) / d'un `content` absent ou `null` sans pièce jointe ; admission des
  mêmes AVEC pièces jointes ; bords retirés, blancs intérieurs préservés.
- `conversation-messages-advanced.test.ts` — 5 cas sur le PATCH, dont celui qui compte : les espaces
  seuls refusés **et le message épargné** (`update` jamais appelé).

## Reste ouvert propre à cette session

- **ANDROID — la file d'attente hors ligne retente ce que le serveur n'acceptera JAMAIS, et bloque
  la file pendant qu'elle le fait.** Défaut le plus grave trouvé ce cycle ; **non corrigé, faute de
  pouvoir le prouver** (leçon 88c). **Tête du prochain cycle qui disposera d'un toolchain Android.**
  - `SendResult` documente le contrat, `ARCHITECTURE.md §5` l'exige (« transient-vs-permanent
    classification, 404-as-success »), `ApiError` porte `httpStatus` — et **quatorze des quinze
    senders l'ignorent**, écrasant tout échec en `TransientFailure`. Seul `SEND_FRIEND_REQUEST`
    classe correctement, via `FriendRequestSend.classify` : le patron existe déjà, appliqué à une
    lane sur quinze.
  - `OutboxDrainer` est en **FIFO strict** et une `TransientFailure` **arrête la lane**. Un 403
    définitif (fenêtre de 24 h dépassée, auteur retiré de la conversation) bloque donc tous les
    messages suivants de cette conversation pendant `MAX_ATTEMPTS = 5` tentatives, backoff
    exponentiel WorkManager depuis 10 s — de l'ordre de **cinq minutes** de blocage de tête de file
    pour une erreur qui ne guérira pas.
  - À l'épuisement, `onExhausted` n'a **aucun cas** pour `EDIT_MESSAGE` / `DELETE_MESSAGE`
    (`else -> Unit`), alors que `editOptimistic` a déjà peint l'édition dans le cache local :
    l'appareil montre le texte édité **pour toujours**, le serveur n'a jamais rien appliqué, personne
    d'autre ne le voit. Divergence locale silencieuse et définitive.
  - Correctif esquissé : un classificateur pur partagé (`OutboxDelivery.classify`) sur le patron de
    `FriendRequestSend` — permanents `{400, 403, 404, 422}`, 404 → `Success` pour les suppressions
    idempotentes, tout le reste transitoire (garder 401/409/429 transitoires est délibéré : un blip
    d'authentification ou un rate-limit ne doit pas jeter la file) — appliqué aux quatorze sites,
    plus un `onExhausted` qui re-hydrate la conversation pour EDIT/DELETE.
- **Aucun toolchain Android n'est disponible depuis cette routine, et aucune CI ne couvre Android.**
  `dl.google.com` est refusé par la politique réseau de l'environnement (403 sur CONNECT) : ni le SDK
  Android ni le dépôt Maven Google ne sont atteignables, `:sdk-core:test` ne peut pas tourner. Et
  `.github/workflows/` ne contient **aucun** job Gradle. **Deux actions humaines distinctes :**
  (a) ajouter un job CI Android — sans quoi ce module restera hors de portée de cette routine
  indéfiniment, et c'est la condition qui débloque tout le reste ouvert Android ci-dessus ;
  (b) corriger le défaut depuis une machine outillée.
- **L'inventaire « quel client emploie quelle route »**, que la session ci-dessus propose pour le
  cycle 37, est appuyé par cette session : les deux ont dû le reconstruire à la main, chacune de son
  côté, pour la même route.
- **`Test Python (translator)` se fige au teardown et heurte le plafond de 30 min — flake
  préexistant, observé sur ce cycle.** La suite atteint **99 % des tests, tous PASSED, en 8 min 40**
  — soit exactement le temps du même job sur main (#9012 : 8 min 30) — puis reste bloquée 21 minutes
  de plus sans produire une ligne. Ce n'est donc pas un échec d'assertion ni une lenteur : c'est un
  **gel après la fin effective de la session**. La dernière ligne du journal avant le silence est
  `RuntimeWarning: coroutine 'AsyncMockMixin._execute_mock_call' was never awaited` — une coroutine
  d'`AsyncMock` jamais attendue, qui survit à la session et empêche pytest de rendre la main ; le
  runner finit par tuer `uv` et `pytest` en processus orphelins. Piste : chercher les `AsyncMock`
  dont le retour n'est pas `await`é (ou les `MagicMock` employés là où un `AsyncMock` est attendu) et
  ajouter une fermeture explicite de boucle au teardown. **Sans accès à un rerun de job** (l'API
  refuse `rerun_failed_jobs` et `cancel_workflow_run` à cette intégration), la seule relance possible
  depuis cette routine est un commit vide — coûteux et bruyant. Deux actions humaines : corriger le
  mock fautif, et ouvrir les droits de rerun à l'intégration.

---

# Cycle 35 — Les cycles précédents ont unifié ce qu'une édition EXIGE et ce qu'elle PRODUIT. Pas ce qu'elle PÉRIME.

Tête prise dans le « reste ouvert » du cycle 34, à l'endroit qu'il désignait — la divergence
restante « sur ce que l'édition ÉCRIT » entre les quatre transports. En allant la mesurer, elle
s'est avérée être la moins grave des trois choses qui se tenaient là.

Les quatre entrées d'édition sont, depuis les cycles 33/34 : le handler socket `message:edit`
(transport PRIMAIRE), `PUT /conversations/:id/messages/:messageId` (la vue d'édition web, qui porte
un sélecteur de langue), `PUT /messages/:messageId` (le client iOS) et `PATCH /messages/:messageId`
(sans appelant de production — voir le reste ouvert).

## Lot A — la traduction du texte d'AVANT survivait à l'édition, sur trois transports sur quatre

`translationCache` est un LRU de 1000 entrées **sans TTL**, servi **avant** la base par
`getTranslation` (ligne 3022) et par `_processTranslationsAsync` (ligne 510). Une édition invalide
`Message.translations` en base ; l'entrée mémoire, elle, survivait. Un lecteur recevait donc la
traduction du texte d'avant pour le texte d'après — jusqu'à l'éviction LRU, c'est-à-dire au bout de
mille autres messages traduits, donc potentiellement jamais sur une instance calme.

La purge existait — `invalidateCacheForMessage`, ajoutée par un cycle antérieur — et elle était
câblée à **un seul** des quatre transports :

| transport | `translations: null` en base | purge du cache mémoire |
|---|---|---|
| socket `message:edit` (PRIMAIRE) | oui | **non** |
| `PUT /messages/:messageId` (iOS) | oui | **non** |
| `PATCH /messages/:messageId` | oui | **non** |
| `PUT /conversations/:id/messages/:messageId` | oui | oui |

La cause tient dans la docstring de la méthode : « **must be called before** triggering a
re-translation ». Une obligation adressée aux appelants est une obligation que le quatrième
appelant oubliera — c'est le même patron que les cycles 33b et 34 ont fermé sur le mute et sur
l'admission, à ceci près qu'ici la consigne était écrite noir sur blanc et que trois appelants sur
quatre ne l'ont jamais lue.

La purge appartient à la **retraduction**, pas à ses appelants : « retraduire » signifie exactement
que l'ancien résultat ne vaut plus. Elle est donc en tête de `_processRetranslationAsync`, **avant
tout `await` et avant tout court-circuit** — un contenu vidé ou un message introuvable ne relance
aucune traduction mais périme l'ancienne exactement pareil, et rien ne repasserait l'effacer. La
purge explicite de la route est retirée dans le même mouvement : la garder ferait repartir la règle
à deux exemplaires.

Le test qui compte n'est pas « la purge a été appelée » mais celui écrit côté **LECTURE** :
après une retraduction, `getTranslation` ne rend plus le texte d'avant.

## Lot B — omettre la langue réétiquetait le message en français

`originalLanguage` est **optionnel** dans `EditMessageBodySchema`. La route le déstructurait avec un
défaut `= 'fr'` et le re-persistait **inconditionnellement**. Une édition qui ne revendiquait aucune
langue écrivait donc `originalLanguage: 'fr'` sur un message anglais — **et** relançait la
retraduction en annonçant « fr » comme langue source, ce qui produit du charabia dans toutes les
langues cibles de la conversation.

Le champ n'est pas décoratif sur cette route : c'est la seule des quatre servie par une vue qui
porte un sélecteur de langue (`EditMessageView`, `selectedLanguage`). Le défaut n'est donc pas
« écrire la colonne », c'est **écrire une valeur que personne n'a revendiquée**. Omettre veut dire
« je n'affirme rien sur la langue », pas « c'est du français ». La colonne n'est plus touchée quand
le corps est muet ; la retraduction repart de la valeur stockée. Le comportement quand le corps la
déclare — canonicalisation `fr-FR` → `fr`, codes irréductibles verbatim — est inchangé, et ses deux
tests préexistants le verrouillent toujours.

## Lot C — la dernière écriture d'édition sans garde de concurrence

`prisma.message.update({ where: { id } })` réussit quel que soit `deletedAt`. Une suppression
concurrente entre la lecture (qui, elle, filtre `deletedAt: null`) et l'écriture faisait
**ressusciter** la ligne avec un contenu neuf, et `message:edited` partait vers des clients qui
l'avaient déjà retirée. Les trois autres transports portaient déjà la garde ; celle-ci était la
dernière sans. Elle prend la même, et le `P2025` que Prisma lève alors devient un **404** — pas un
500, qui ferait retenter un client qui n'a rien à retenter — exactement comme sur le sibling
`PATCH /messages/:messageId`, dont la traduction d'erreur est reprise telle quelle.

## Nettoyage

`logger.info('===== ENTERED TRY BLOCK FOR MENTIONS =====')` tournait à chaque édition, au niveau
INFO, sur le bloc de **retraduction** — pas sur celui des mentions. Retiré.

## Vérification

- **9 tests neufs**, écrits AVANT l'implémentation, **9 rouges observés** :
  - `MessageTranslationService.branches.test.ts` — 5 cas : la purge déclenchée par
    `retranslateMessageAsync` lui-même, l'isolement aux autres messages, la purge malgré le
    court-circuit sur contenu vide, la purge malgré un message introuvable (le `catch` de l'unité
    avale — la purge doit donc précéder la lecture), et la conséquence exprimée côté LECTURE.
  - `conversation-messages-advanced.test.ts` — 4 cas : la colonne laissée intacte quand le corps
    l'omet, la retraduction repartant de la langue stockée, la garde `deletedAt: null` sur
    l'écriture, le 404 plutôt que le 500 quand elle mord.
- **Suite gateway complète : 615 suites, 15 884 tests, tout vert.** `tsc --noEmit` propre.
  Couverture globale lignes **95,66 %**, branches 89,05 %.

## Reste ouvert après ce cycle

- **`invalidateCacheForMessage` n'a plus d'appelant hors de la classe.** Gardé public
  délibérément : c'est une capacité légitime du service, et sa docstring dit désormais l'inverse de
  ce qu'elle disait — la retraduction l'appelle elle-même, ce n'est pas une consigne aux appelants.
  À ne pas re-câbler depuis une route.
- ~~**`PATCH /messages/:messageId` n'a toujours aucun appelant de production** … **Tête sérieuse du
  prochain cycle** : la retirer, elle et son service client.~~ **❌ CONSIGNE ERRONÉE — NE PAS
  EXÉCUTER. Corrigée au cycle 36 (voir plus bas).** Le cycle 35 n'avait cherché l'appelant que
  côté **web**. `apps/android/sdk-core/.../outbox/OutboxFlushWorker.kt:161` appelle
  `messageApi.edit(...)` → `@PATCH("messages/{id}")`
  (`apps/android/core/network/.../api/MessageApi.kt:34`) : **cette route est le chemin par lequel
  Android rejoue les éditions faites hors ligne.** La retirer aurait cassé silencieusement la file
  d'attente offline d'Android — l'édition serait partie en 404 au flush, sans écran pour le dire.
  Seul le **client web** de cette route était mort, et c'est lui qui a été retiré au cycle 36.
- ~~**`_processRetranslationAsync` est appelé via `(translationService as any)` par les deux routes
  REST**~~ — **fait au cycle 36.** Les deux routes emploient désormais `retranslateMessageAsync`.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision : un auteur qui a quitté une conversation peut encore éditer ses messages par les quatre
  entrées.
- **La file d'attente de fan-out** (D1 du cycle 32) — quatrième report, même raison : elle demande
  de savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — neuvième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26). Même classe de défaut que le lot B de ce cycle — un défaut de valeur là où l'absence
  aurait dû ne rien affirmer — et il reste ouvert.
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.
  S'y ajoute désormais un troisième candidat : les `Message.originalLanguage` déjà réétiquetés en
  `'fr'` par le lot B avant ce correctif restent faux en base. Non réparable automatiquement — rien
  ne distingue un « fr » écrit par le défaut d'un « fr » légitime.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.

---

# Cycle 34b — La sourdine échouait FERMÉ, et un éventail tombé emportait ses deux frères

Numéroté **34b** : une session parallèle a livré son cycle 34 pendant celui-ci (« ce qu'une édition
EXIGE », ci-dessous). Les deux têtes n'ont AUCUNE intersection — l'une unifie les quatre tests
d'admission à l'édition d'un message, l'autre porte sur le repli des préférences de notification et
l'isolement des trois éventails — et aucun fichier n'est touché par les deux. Rien à arbitrer défaut
par défaut cette fois (leçon d'intégration du cycle 23, reprise aux 25b, 32b, 33b et 34) : les deux
tiennent ensemble, fusionnés à la main et revalidés sur la suite complète. Là où les deux « reste
ouvert » citent le même point (file de fan-out, `getVisibilityFilteredRecipients`, `@Display Name`,
eslint), c'est le même report, pas deux.

Tête annoncée par le « Reste ouvert » du cycle 33b, prise sans arbitrage : `filterMutedRecipients`
échouait fermé alors que tout son voisinage échoue ouvert et le dit. En remontant ses appelants pour
mesurer la portée, le défaut s'est avéré n'être que la moitié visible d'un second, plus grave, à
l'étage au-dessus — celui-là jamais nommé par aucun cycle.

## Lot A — une préférence de confort illisible faisait taire une obligation de livraison

`filterMutedRecipients` lit `UserConversationPreferences.isMuted` pour décider qui, dans une
audience, ne veut pas être dérangé. Il n'avait **aucun `try`**. Une lecture en échec — un incident
Mongo transitoire suffit — remontait telle quelle jusqu'au `.catch` de l'appelant, qui journalisait
et laissait tomber la notification.

Le voisinage immédiat a déjà tranché la même question, trois fois, dans l'autre sens, et l'écrit
noir sur blanc :

| unité | comportement en cas d'échec de lecture | commentaire dans le code |
|---|---|---|
| `loadNotificationPrefs` | notification créée | « fail open » |
| `_loadReadReceiptOptOuts` | tout le monde reste visible | « repli ouvert » |
| `PrivacyPreferencesService.fetchFromDatabase` | idem | cité par le précédent |
| **`filterMutedRecipients`** | **notification perdue** | **—** |

L'arbitrage n'est pas symétrique. Le mute est une préférence de **confort** ; la notification est une
obligation de **livraison**. Quand on ne sait plus laquelle des deux s'applique, un ping de trop se
pardonne — un message jamais annoncé, non. Et il ne se joue pas à l'unité : depuis le cycle 33b cette
porte garde **cinq familles** (`message_reaction`, `message_reply`, `member_joined`,
`member_removed`, `member_left`) plus l'éventail d'arrivée entier. Un hoquet de lecture les taisait
donc toutes, d'un coup, pour tout le monde — et le cycle 33b, en faisant passer trois familles de
plus par cette porte, avait élargi le rayon du défaut sans le voir.

Repli ouvert, log d'erreur, tous les candidats rendus.

## Lot B — trois éventails indépendants dans un seul `try`

En vérifiant la portée du lot A, une seconde chose est apparue chez l'appelant le plus chaud.

`notifyMessageRecipients` sert **trois** éventails, dans cet ordre : réponse, mentions, messages
réguliers. Ils sont indépendants **par construction** — leurs audiences se déduisent des ENTRÉES de
la fonction (`validatedMentionUserIds`, l'auteur du message cité), jamais du résultat de l'éventail
précédent. Ils partageaient pourtant un unique `try { … } catch`.

Conséquence : une panne dans le PREMIER annulait purement et simplement les deux suivants, qui
n'étaient jamais atteints. Un hoquet Mongo sur la notification de réponse d'**une** personne faisait
taire le message pour **toute** la conversation — mentions comprises, c'est-à-dire la seule famille
qui perce toutes les autres suppressions. L'ordre d'exécution décidait qui survivait, et il plaçait
la famille la plus importante derrière la moins importante.

Le lot A ferme la porte d'entrée que ce cycle avait identifiée ; il ne ferme pas celle-là. Tout ce
qui lit la base dans ces trois éventails — `createReplyNotification`, le lot de mentions,
`createMessageNotification` — peut encore lever pour une autre raison que le mute.

Trois changements, tous dans la même unité :

1. **`runLot(name, onError, whenLost, run)`** — chaque éventail est isolé, rend une valeur de repli
   quand il tombe, et l'erreur remontée **nomme** l'éventail en gardant l'originale en `cause`.
   Avant, trois pannes distinctes arrivaient au même `onError` sous le même libellé.
2. **`Promise.allSettled`** dans l'éventail régulier, au lieu de `Promise.all` : le destinataire dont
   la lecture de contexte hoquette n'emporte plus le compte rendu de ses voisins, dont les
   notifications sont déjà parties. Un seul signalement pour tout l'éventail, pas un par
   destinataire — sur un groupe large, une panne commune produirait autant de lignes de log que de
   membres.
3. **`listeningRegularRecipients`** — la lecture inline de `userConversationPreferences`
   (« mentions seulement » OU sourdine) qui filtre l'éventail régulier passe au **repli ouvert**,
   comme le lot A. Elle portait exactement le même défaut que `filterMutedRecipients`, sur la même
   colonne `isMuted`, à trente lignes de distance.

## Le compte rendu devait suivre, sinon l'isolement serait invisible

`onFanOut` annonçait `mentions: validatedMentionUserIds.length` et `regular: regularRecipients.length`
— l'**audience visée**, pas le résultat. Avec l'isolement, un éventail entièrement tombé aurait
continué d'annoncer son audience comme si elle avait été servie : le correctif se serait caché
lui-même dans les logs.

Les trois valeurs disent désormais ce qui est réellement **parti** — le total rendu par le lot de
mentions, les créations non nulles pour le reste. C'est le principe posé par
`createMemberJoinedNotificationsBatch` au cycle 33b (« le compte rendu est celui des notifications
réellement créées, pas la taille de l'audience visée »), appliqué là où il manquait. Le port
`MessageNotificationTarget` déclare du coup le retour du lot de mentions (`Promise<number>` au lieu
de `Promise<unknown>`) : il est lu, donc il se déclare.

## Vérification

- **17 tests neufs**, écrits AVANT l'implémentation, **14 rouges observés** :
  - `mutedRecipients.test.ts` — 9 rouges. Le repli ouvert du helper (tous les candidats rendus,
    l'échec journalisé, la promesse qui ne rejette jamais) **et** les cinq familles + l'éventail
    d'arrivée vérifiés au niveau du SERVICE, pas seulement du helper : c'est là que le rayon se
    mesure.
  - `messageNotificationFanOut.test.ts` — 5 rouges. L'éventail réponse tombé qui n'annule ni les
    mentions ni les réguliers, l'éventail mentions tombé qui n'annule pas les réguliers, le
    destinataire régulier en échec qui n'emporte pas les autres, le compte rendu ramené à zéro quand
    tout tombe, et l'erreur qui NOMME l'éventail. Plus deux tests qui verrouillent ce qui devait le
    rester : la réponse ne se déclare partie que si elle l'est, et les préférences illisibles
    laissent tout le monde notifié.
- Le test existant « rend compte de l'éventail à son appelant » assertait `{mentions: 1, regular: 1}`
  avec des doubles rendant `0` et `null` : il mesurait l'intention. Ses doubles ont été rendus
  réalistes plutôt que l'assertion affaiblie.
- **Suite gateway complète : 614 suites, 15 846 tests, tout vert** (avant : 613 / 15 820).
  `tsc --noEmit` propre. Couverture globale lignes **95,66 %**, `mutedRecipients.ts` et
  `messageNotificationFanOut.ts` à **100 %** tous les deux.

## Reste ouvert après ce cycle

- **`runLot('regular', …)` a un `catch` presque inatteignable** : `listeningRegularRecipients` se
  replie seule et `allSettled` ne rejette pas. Il tient l'invariant « aucun éventail ne lève »
  structurellement plutôt que par audit ligne à ligne, et garde les trois éventails symétriques —
  gardé délibérément, à ne pas retirer au motif qu'il ne se déclenche pas.
- **Le repli ouvert de `listeningRegularRecipients` couvre aussi `mentionsOnly`**, qui n'est pas la
  sourdine. Même arbitrage, assumé : sur un incident de lecture, un utilisateur « mentions
  seulement » reçoit une notification de message régulier plutôt que rien.
- **La file d'attente de fan-out** (D1 du cycle 32) reste ouverte, inchangée, et pour la même raison
  qu'aux cycles 32 et 33b : elle demande de savoir ce que la troncature mesure en production, et
  cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`member_removed` reste une boucle d'appels unitaires**, délibérément (cycle 33b) : audience
  bornée par le rôle.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — huitième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** attendent une exécution avec accès MongoDB — action
  humaine.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.


---

# Cycle 34 — Les cycles précédents ont unifié ce qu'une édition PRODUIT. Pas ce qu'elle EXIGE.

Tête désignée par le cycle 33, prise telle quelle : « une seule unité d'admission à l'édition,
nommée, plutôt que quatre tests d'admission qui ont déjà prouvé qu'ils dérivent ».

## Le décompte, deuxième passage

Le cycle 33 avait dressé la table de ce qu'une édition PRODUIT (liens, mentions) et l'avait rendue
uniforme. Voici celle de ce qu'elle EXIGE, telle qu'elle était encore ce matin :

| entrée | fenêtre 24h | modérateur admis | appartenance | `deletedAt` gardé | qui l'appelle |
|---|---|---|---|---|---|
| socket `message:edit` | oui | **non** | implicite | oui | web (composer) |
| `PUT /conversations/:id/messages/:messageId` | oui | oui | oui | oui | **web** (`message.service.ts`) |
| `PUT /messages/:messageId` | **non** | **non** | **non** | oui | **iOS** |
| `PATCH /messages/:messageId` | **non** | **non** | oui | **NON** | personne |

Correction au décompte du cycle 33, qui attribuait le `PATCH` au web : `messagesService.updateMessage`
existe, mais **aucun écran ne l'appelle** — seuls ses propres tests. Le web édite par le socket
(composer) et par le `PUT` conversation-scopé. Trois entrées vivantes, quatre règles.

## Ce que l'utilisateur voyait

**La fenêtre de 24h se traversait en changeant de verbe HTTP.** Le socket et le `PUT` conversation
la refusent ; les deux entrées `/messages/:messageId` ne la connaissaient pas. Un iPhone éditait
donc un message de trois ans que le même geste depuis le web refusait de toucher — et ce n'est pas
une divergence de confort, c'est le contournement complet d'une règle que le produit énonce.

**Le modérateur que l'UI web autorise se voyait refuser par le composer.** `BubbleMessage.canEdit`
rend vrai pour `isOwnMessage || hasModeratorPrivileges(userRole)`. Le geste réussit par le `PUT`
conversation-scopé et échoue par le socket, qui filtrait `sender: { userId }` dans sa lecture.

**Un message SUPPRIMÉ se réécrivait par le `PATCH`.** Ni garde à la lecture, ni garde à l'écriture.
Un `update` par id réussit quel que soit `deletedAt` : la ligne ressuscitait avec un contenu neuf,
`message:edited` partait vers des clients qui l'avaient déjà retirée, l'API répondait succès.

## Lot A — `admitMessageEdit`, l'unique énoncé

`services/messaging/messageEditAdmission.ts`. L'auteur édite 24h ; un rôle **GLOBAL** privilégié lui
rouvre la porte au-delà ; un tiers n'édite que membre ACTIF + rôle privilégié, sans fenêtre — un
modérateur corrige précisément ce qui traîne.

Coût : **aucun aller-retour ajouté**. La branche modérateur lit appartenance ET rôle en une seule
requête — la forme (`include: { user: { select: { role } } }`) que la route conversation-scopée
employait déjà. La branche auteur-hors-fenêtre en lit une. Le chemin nominal n'en déclenche aucune.
Toute lecture échoue **fermée**.

## Lot B — les quatre entrées, chacune dans son vocabulaire

Une politique, quatre traductions. Les deux routes `/messages/:messageId` gardent leur **404** sur
les refus non temporels au lieu d'adopter le 403 de leur sœur : passer à 403 en ferait un oracle
d'existence pour qui sonde des ObjectIds. Une seule politique n'oblige pas à un seul code HTTP.

La lecture Prisma du socket et du `PUT` iOS n'**encode** plus la règle. Elles filtraient
`sender: { userId }` : la ligne d'un message qu'on n'a pas écrit n'atteignait jamais la décision.
Un test par transport verrouille désormais que le `where` ne porte plus la politique — c'est la
forme la plus durable du correctif, puisque c'est ce `where` qui rendait l'unification impossible.

## Lot C — le `PATCH` et son message ressuscité

`deletedAt: null` à la lecture, garde de concurrence optimiste à l'écriture (`where: { id,
deletedAt: null }`), `P2025` traduit en **404 et non en 500** : une suppression concurrente n'est
pas une panne, et la rendre en 500 ferait retenter un client qui n'a rien à retenter.

## Ce que ce cycle a délibérément REFUSÉ de faire

**Exiger l'appartenance active de l'AUTEUR.** Le `PATCH` le faisait ; les trois transports vivants
tiennent l'authorship pour suffisant. Rendre la règle commune plus stricte que les trois chemins
réels aurait été une restriction neuve déguisée en unification — et livrée sans qu'on la nomme.
« Un auteur qui a quitté la conversation peut-il encore éditer ? » est une bonne question produit ;
elle se tranche pour les quatre à la fois, pas en passant sur celle que personne n'appelle.

**Retirer l'édition modérateur.** Premier réflexe, et il était faux : l'intégrité voudrait que nul
ne réécrive sous le nom d'autrui. Mais `BubbleMessage.canEdit` propose le geste, donc la capacité
est vivante et voulue. Un agent qui aurait « unifié » en supprimant la branche modérateur aurait
retiré une fonctionnalité en croyant fermer un trou. Le code client est la source de vérité sur ce
que le produit promet — le lire AVANT de trancher est ce qui a changé la conclusion.

## Vérification

- **26 tests neufs, 10 rouges observés** avant implémentation.
  - `messageEditAdmission.test.ts` (18 cas, **100 % lignes**) — les deux branches, la borne
    **inclusive** à 24h pile, le `createdAt` illisible qui n'a jamais bloqué personne et ne bloque
    toujours pas, le modérateur non-membre refusé, le message d'auteur anonyme que seul un
    modérateur modère, les trois pannes qui refusent.
  - 4 cas sur le `PUT` iOS, 5 sur le `PATCH`, 2 sur le socket — dont, sur les deux transports dont
    la lecture encodait la règle, un verrou sur le `where`.
- **Suite gateway complète : 614 suites, 15 840 tests, tout vert** (avant : 613 / 15 799).
  `tsc --noEmit` propre. Couverture lignes **95,64 %**.

## Reste ouvert après ce cycle

- **`appartenance active de l'auteur` — la question posée ci-dessus attend une décision produit.**
  Aujourd'hui : un auteur qui a quitté une conversation peut encore éditer ses messages par les
  quatre entrées. Défendable (ce sont ses mots) comme l'inverse (il n'a plus de session là-bas).
  **Candidat sérieux pour le prochain cycle** — le correctif est mécanique une fois la règle
  choisie, puisqu'il n'y a plus qu'un endroit où l'écrire.
- **`PATCH /messages/:messageId` n'a aucun appelant de production.** `messagesService.updateMessage`
  n'est invoqué que par ses propres tests. Une entrée d'écriture sans écran est une surface
  d'attaque qui ne rend rien. **Tête sérieuse du prochain cycle** : la retirer, elle et son service
  client, plutôt que de continuer à la maintenir à parité — ce cycle vient de payer ce prix.
- **`PUT /conversations/:id/messages/:messageId` re-persiste `originalLanguage` depuis le corps de
  la requête** là où les trois autres réutilisent la valeur stockée. Divergence restante sur ce que
  l'édition ÉCRIT, du même genre que celles que ce cycle vient de fermer sur ce qu'elle EXIGE.
- **La file d'attente de fan-out** (héritée du cycle 32, D1) — troisième report.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas.
- **`@Display Name` reste inextractible dans le domaine social** — huitième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29.
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). Action humaine.

---

# Note d'intégration — cycle 34 par-dessus le cycle 33b

Une session parallèle a livré le cycle **33b** (ci-dessous) pendant celui-ci. Aucune intersection :
33b porte sur le mute des allées et venues et le fan-out d'appartenance, le cycle 34 sur l'admission
à l'édition d'un message. Rien à arbitrer défaut par défaut (leçon d'intégration du cycle 23, reprise
aux 25b, 32b et 33b) — les deux tiennent ensemble, fusionnés à la main et revalidés sur la suite
complète. Le « reste ouvert » du cycle 34 ci-dessus vaut par-dessus celui de 33b ; là où les deux
citent le même point (file de fan-out, `getVisibilityFilteredRecipients`, `@Display Name`, eslint),
c'est le même report, pas deux.

# Cycle 33b — Le mute ne faisait pas taire les allées et venues, et chaque membre repayait la même requête

Numéroté **33b** : une session parallèle a livré son cycle 33 pendant celui-ci (« le transport
primaire d'iOS », ci-dessous). Les deux têtes n'ont AUCUNE intersection — l'une porte sur les
obligations d'une édition de message selon son transport, l'autre sur le mute et le fan-out
d'appartenance — donc rien à arbitrer défaut par défaut cette fois (leçon d'intégration du cycle 23,
reprise aux 25b et 32b) : les deux tiennent ensemble, et le code des deux a été fusionné à la main
puis revalidé sur la suite complète.

Tête prise après relecture du reste ouvert du cycle 32 : la file d'attente de fan-out (D1) attend
de savoir **ce que** la troncature mesure en production, or cette routine n'a aucun accès aux logs.
Construire la file maintenant serait choisir entre file, pagination et borne relevée à l'aveugle —
exactement ce que le cycle 32 a refusé de faire. Le fan-out d'appartenance, lui, ne demandait aucune
donnée de production pour être jugé : il porte deux défauts lisibles dans le code.

## Lot A — « en sourdine » ne couvrait pas les allées et venues

`UserConversationPreferences.isMuted` était respecté par trois familles de notifications —
`new_message`, `message_reply`, `message_reaction` — et par elles seules. Trois autres, toutes
attachées à une conversation, passaient outre : **`member_joined`, `member_removed`,
`member_left`**. Une conversation mise en sourdine continuait donc de sonner à chaque va-et-vient,
et **d'autant plus fort qu'elle est active** — donc précisément dans le cas qui a motivé le mute.
Le toggle global `memberJoinedEnabled` existait, mais il coupe le type PARTOUT : il ne permet pas de
faire taire un groupe bavard tout en gardant les arrivées ailleurs.

La ligne de partage retenue n'est pas « message ou pas » mais **ambiant ou adressé** :

| respecte le mute (AMBIANT) | perce le mute (ADRESSÉ) |
|---|---|
| `new_message`, `message_reply`, `message_reaction` | `user_mentioned` |
| `member_joined`, `member_removed`, `member_left` | `added_to_conversation`, `removed_from_conversation` |
| | `member_promoted` / `member_demoted` / `member_role_changed` |

Mettre une conversation en sourdine dit « ne me raconte pas ce qui s'y passe », pas « ne me dis pas
que j'en suis sorti ». Un événement dont le destinataire est le SUJET reste adressé et passe outre,
comme la mention par convention WhatsApp. Le tableau vit dans `mutedRecipients.ts`, à côté du filtre
qu'il gouverne — et **la frontière est verrouillée par trois tests** sur les types qui percent, pas
seulement par ceux sur les types qui se taisent : sans eux, la règle dériverait au premier
« appliquons-la partout ».

La règle avait déjà deux exemplaires (réaction, réponse) et devait en gagner trois. Elle passe par
une porte unique, `isConversationMutedFor(userId, conversationId, type)` : un même verdict, un même
log, une même **place dans l'ordre d'exécution** — avant toute lecture de contexte et avant tout
compteur mutant. Ce dernier point n'est pas cosmétique : le test « muted-conversation reactions do
not consume the pair throttle budget » (cycle GW3) l'exigeait déjà pour les réactions, et il valait
d'être rendu structurel plutôt que redécouvert par site.

## Lot B — une arrivée est UN événement, pas N

`createMemberJoinedNotification` fait trois lectures : profil du nouveau membre, conversation,
effectif. **Aucune ne dépend du destinataire.** Les deux appelants l'appelaient en boucle, une fois
par membre déjà présent : un ajout dans un groupe de 200 personnes payait donc ~600 requêtes pour
trois résultats distincts, et le surcoût croissait avec la taille du groupe — là où il fait mal.
Avec le lot A, la question du mute s'y ajoutait, une requête par destinataire de plus.

`createMemberJoinedNotificationsBatch(recipientUserIds, common)` lit le contexte **une fois**
(`MemberJoinedSnapshot`), demande le mute **une fois** pour toute l'audience, puis diffuse. Le compte
rendu est celui des notifications **réellement créées**, pas la taille de l'audience visée : une
préférence de type ou un DND côté destinataire en écarte sans que ce soit une erreur.

Le second appelant (`routes/conversations/sharing.ts`, jointure par lien) aggravait le tableau d'une
autre manière : sa boucle `await`ait **chaque administrateur à la suite**, dans la requête HTTP. La
réponse « vous avez rejoint » attendait que le dernier d'entre eux soit notifié. Un seul appel
maintenant, et la confirmation au nouvel arrivant reste unitaire — un destinataire, une notification.

## Vérification

- **20 tests neufs**, dont **6 rouges observés** avant implémentation (3 suppressions par le mute,
  la non-lecture du contexte pour un destinataire en sourdine, et les 2 sites de fan-out passés au
  batch). Les 14 autres verrouillent ce qui était déjà juste et devait le rester : les trois types
  qui **percent** le mute, l'équivalence payload batch/unitaire, l'audience vide qui ne touche pas la
  base, le doublon de destinataire, le nouveau membre introuvable, le décompte réel.
- **Suite gateway complète : 613 suites, 15 820 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,67 %** (inchangée), `mutedRecipients.ts` à 100 %.
- Une suite préexistante (`NotificationService-new-methods.test.ts`) est tombée sur le lot A : son
  double Prisma n'avait ni `userConversationPreferences` ni `participant`. Elle avait **raison de
  tomber** — le service lit désormais ces modèles — et le double a été complété, pas contourné.

## Reste ouvert après ce cycle

- **`member_removed` reste une boucle d'appels unitaires, délibérément.** Son audience est bornée par
  le rôle — `creator` / `admin` / `moderator` — donc quelques personnes, là où `member_joined` fanne
  vers TOUS les membres déjà présents. Le lot A y ajoute une requête de mute par destinataire ; c'est
  le prix assumé sur une audience de cet ordre, et la raison pour laquelle un seul des deux frères a
  été batché. À revoir si un jour une conversation peut compter des dizaines de modérateurs.

- **`filterMutedRecipients` échoue FERMÉ.** Si la lecture des préférences lève, la notification est
  perdue (le rejet remonte au `.catch` de l'appelant). Le voisinage fait l'inverse et le dit :
  `shouldCreateNotification` « fail open : en cas d'erreur de lecture des prefs, on crée la
  notification », `_loadReadReceiptOptOuts` « repli ouvert ». Un incident Mongo transitoire avale
  donc aujourd'hui toutes les notifications de réaction/réponse/appartenance au lieu d'en laisser
  passer quelques-unes de trop. **Tête du prochain cycle** — comportement préexistant, hors de la
  tête de celui-ci, mais désormais partagé par cinq familles au lieu de deux.
- **Le fan-out `member_joined` n'a aucune borne** — ni de lignes, ni de concurrence. Le `Promise.all`
  du batch reprend le parallélisme non borné que la boucle avait déjà (et que
  `createMentionNotificationsBatch` a aussi) : sur un groupe de plusieurs milliers de membres, une
  seule arrivée déclenche autant d'écritures simultanées. À arbitrer avec la file d'attente de
  fan-out (D1 du cycle 32), pas séparément.
- **La file d'attente de fan-out** (D1 du cycle 32) reste ouverte, inchangée, et pour la même
  raison : elle demande de regarder ce que la troncature mesure en production.
- **`createMemberLeftNotification` et `createTranslationReadyNotification` n'ont aucun appelant de
  production.** Le premier a reçu le mute (il est le frère exact de l'arrivée et de l'exclusion) ;
  le second a été laissé tel quel — « ta traduction est prête » se lit comme la fin d'une action
  demandée, donc adressée. À trancher le jour où l'un des deux trouve un appelant.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — septième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.

---

# Cycle 33 — Les cycles précédents ont câblé « le transport primaire d'iOS ». Aucun n'avait câblé celui d'iOS.

Le « Reste ouvert » du cycle 32 proposait la file d'attente de fan-out, sous réserve que « rien de
plus grave n'apparaisse ». Quelque chose de plus grave est apparu, à l'étage d'en dessous : les
obligations d'une édition de message dépendent encore du transport employé — et les deux transports
que les clients emploient RÉELLEMENT sont ceux qui n'en portent aucune.

## Le décompte

L'édition d'un message a **quatre** points d'entrée. Ce qu'ils faisaient avant ce cycle :

| entrée | fichier | liens traçables | mentions | qui l'appelle |
|---|---|---|---|---|
| socket `message:edit` | `MessageHandler` | oui | oui | web (composer) |
| `PUT /conversations/:id/messages/:messageId` | `messages-advanced.ts` | oui | oui | **personne** |
| `PUT /messages/:messageId` | `routes/messages.ts` | **non** | **non** | **iOS** (`MessageService.editMessage`) |
| `PATCH /messages/:messageId` | `messages-advanced.ts` | **non** | **non** | **web** (`messages.service.ts`) |

Les deux unités partagées existaient déjà, écrites par les cycles précédents, et elles étaient
justes. Elles avaient simplement été branchées sur la mauvaise route. Deux commentaires — dans
`emitMentionCreated.ts` et dans `messages-advanced.ts` — désignaient « le transport PRIMAIRE du
client iOS, qui édite via `PUT /messages/:id` » **au-dessus du câblage de
`PUT /conversations/:id/messages/:messageId`**. Le chemin nommé et le chemin câblé n'étaient pas
le même. Le commentaire, lui, se lisait comme une preuve que le trou était fermé.

## Ce que l'utilisateur voyait

Éditer « salut @alice » en « salut @bob » **depuis un iPhone** : Alice reste mentionnée (ligne
`Mention`, `validatedMentions`, inbox `/mentions`, surlignage), Bob n'est nommé nulle part, ne reçoit
ni notification ni `mention:created`. Le même geste depuis le composer web (socket) fait tout
correctement. Idem pour `[[url]]` : envoyé, le texte produit un lien traçable ; **édité** depuis iOS
ou depuis `messages.service.ts`, les crochets restent en dur dans le message, définitivement.

## Lot A — `PUT /messages/:messageId`, le transport d'iOS

`processExplicitLinks` AVANT l'écriture, `reconcileEditedMentions` + `emitMentionCreated` après, et
le contenu traité devient le SEUL en circulation : base, mentions, retraduction, payload diffusé.

Une différence assumée avec le sibling PUT : la réconciliation précède le `findUniqueOrThrow` de
relecture. Elle écrit `validatedMentions` en base, donc la relecture rend l'état réconcilié sans
recopiage conditionnel — et quand elle n'a RIEN pu établir, la ligne porte toujours la valeur
précédente, qui est la bonne. Le garde-fou `if (reconciled)` du sibling existe parce qu'il tient un
objet rendu par l'écriture ; ici il n'y a rien à garder.

La réconciliation est bien APRÈS le `updateMany` gardé : un `DELETE` concurrent rend `count === 0`,
la route répond 404 et ne réconcilie rien sur un message que le client a déjà retiré.

## Lot B — `PATCH /messages/:messageId`, le transport du web

Même traitement, avec le garde-fou `if (reconciled)` du sibling puisqu'il tient lui aussi l'objet
rendu par `update`.

## Lot C — le `content.trim()` qui plantait sur le seul cas que la garde autorise

`content` est OPTIONNEL dans `UpdateMessageBodySchema`, et l'omettre est précisément la façon de
retirer la légende d'un message à pièce jointe — un cas que la garde d'entrée autorise
explicitement (`(!content || …) && !messageHasAttachments`). L'écriture faisait ensuite
`content.trim()` : TypeError, traduit en 500 par le catch. Le seul cas explicitement permis était le
seul que l'écriture ne savait pas traiter. `content?.trim() ?? ''`.

## Lot D — les commentaires qui nommaient la mauvaise route

Corrigés aux deux endroits, et `broadcastMessageMutation.ts` — dont l'affirmation était JUSTE, elle,
puisque cette unité-là est bien câblée sur `routes/messages.ts` — reçoit le chemin complet, l'ambiguïté
entre les deux `PUT` étant exactement ce qui a permis la confusion. La leçon du 2026-08-07 (3) — « une garantie énoncée dans un commentaire
n'est pas une garantie du système » — se double ici d'un corollaire : un commentaire qui nomme le
chemin qu'il ne câble PAS ne se contente pas de ne rien garantir, il **détourne activement** le
prochain audit. Les cycles suivants ont relu ces lignes et conclu que le cas iOS était traité.

## Vérification

- **10 tests neufs**, **8 rouges observés** avant correctif :
  - `message-edit-mention-parity.test.ts` (6, dont 5 rouges) — réconciliation, `mention:created` aux
    seuls entrants, traitement des liens avant écriture, contenu traité en circulation unique,
    légende retirée sans 500 ; plus le cas qui doit RESTER muet (course de suppression : `count === 0`
    → 404 et aucune réconciliation).
  - `conversation-messages-advanced.test.ts` (4, dont 3 rouges) — mêmes obligations sur le PATCH, plus
    le `validatedMentions` qui ne doit PAS être écrasé quand la réconciliation n'établit rien.
- **Suite gateway complète : 613 suites, 15 799 tests, tout vert.** `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Quatre points d'entrée pour une édition, dont un que personne n'appelle**
  (`PUT /conversations/:id/messages/:messageId`). Les quatre partagent désormais les mêmes unités,
  mais chacun réimplémente ses propres gardes de permission — et elles DIVERGENT : le PATCH n'a pas
  la fenêtre de 24h ni le bypass modérateur, le `PUT /messages/:messageId` filtre par
  `sender: { userId }` (donc aucun bypass du tout). **Tête du prochain cycle** : une seule unité
  d'admission à l'édition, nommée, plutôt que quatre tests d'admission qui ont déjà prouvé qu'ils
  dérivent. C'est le motif exact des cycles 30-31, un étage plus bas.
- **La file d'attente de fan-out** (héritée du cycle 32, D1). La troncature est mesurable depuis le
  cycle 32 ; il faut regarder ce qu'elle mesure avant de choisir.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas.
- **`@Display Name` reste inextractible dans le domaine social** — septième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29.

---

# Cycle 32b — Addendum d'une session parallèle

Deux sessions ont livré le cycle 32 en parallèle, sur la même tête (« la troncature est muette »).
Le cycle 32 ci-dessous est **le plus large** — il porte en plus les lots B et C sur les défauts
permissifs — et sa forme sur la troncature est la meilleure sur deux points, gardés tels quels :
le type nommé (`FanoutBucket` / `StoryNotificationRecipients`), et le log placé **dans**
`getStoryNotificationRecipients` plutôt que chez un appelant, ce qui le rend vrai pour tous.
Cette session s'aligne dessus et n'apporte que ce qui manquait. (Leçon d'intégration du cycle 23,
reprise au 25b : comparer défaut par défaut, jamais « qui est arrivé en premier ».)

## Ce que l'addendum ajoute — 1. la borne payait ses exclus sur son propre budget

Défaut que le cycle 32 n'a pas touché, et qui est **antérieur** à la question de la troncature :
deux des trois requêtes écartaient des gens **après** le `take`, pas dedans.

| requête | écarté par la requête | écarté après coup |
|---|---|---|
| `postComment` | `commenterId` | **`authorId`** |
| `postReaction` | `commenterId` | **`authorId`** |
| `friendRequest` | — | `authorId` (structurel, voir plus bas) |

Une ligne écartée après coup a quand même consommé sa place sous la borne. Et l'auteur n'est pas un
engagé quelconque de son propre fil : **c'est le plus prolifique**, parce que répondre à chacun de
ses commentateurs est le comportement normal d'un auteur. Sur un post où l'auteur a répondu à tout
le monde, ses propres réponses évinçaient donc, une pour une, des destinataires réels — en silence,
et d'autant plus fort que le post marchait bien. La borne annonçait 500 destinataires et en servait
moins, sans que rien ne le dise.

**Correctif.** `authorId: { notIn: [commenterId, authorId] }` dans le `where`. La borne compte
désormais des destinataires, plus des lignes dont une partie était jetée d'avance.

**Les `filter` en aval RESTENT, et ce n'est pas une garde en double.** Le `notIn` protège le
**budget** ; les `filter` tiennent la **postcondition** de la méthode publique — « ni l'auteur ni le
commentateur ne sortent d'ici », vrai quelle que soit la clause `where` du jour. C'est ce qui
distingue ce cas du `COMMUNITY` décoratif retiré au cycle 31 : là c'était une branche de décision
inatteignable, ici c'est ce dont une méthode répond. Les deux tests qui l'encodaient sont tombés
quand je les avais retirés — ils avaient raison, ils sont restés.

Sur `friendRequest` l'auteur ne peut PAS sortir par la requête : il ancre **chaque** ligne
d'amitié. Sa présence y est structurelle, pas budgétaire — rien à corriger.

## Ce que l'addendum ajoute — 2. la ligne témoin, parce que `>=` crie au loup à la borne

Le cycle 32 déduit la troncature de « la requête a rendu **autant** de lignes que la borne »
(`length >= FANOUT_ROW_CAP`). C'est un signal juste dans l'esprit, faux au point exact où son propre
commentaire promet de trancher : un seau de **très exactement** 500 engagés est COMPLET, et il est
déclaré tronqué. Sur le seau des amis, la conséquence n'est pas théorique — un auteur à exactement
500 amis émet un `warn` de troncature à **chacune** de ses publications, pour toujours.

**Correctif : `take: FANOUT_ROW_CAP + 1`.** La ligne excédentaire est un **témoin**, jamais un
destinataire — lue, comptée, puis jetée par un `slice`. La borne de diffusion ne bouge pas d'un
destinataire ; seul le verdict devient exact, et le test passe de `>=` à `>`.

**Portée du témoin, dite honnêtement.** Sur `friendRequest` (pas de `distinct`) il est **exact** :
une 501e ligne existe si et seulement si la base en avait plus de 500. Sur les deux requêtes
`distinct`, il reste un signal **suffisant** — jamais déclenché à tort, mais capable de se taire sur
une troncature que la déduplication a repliée en deçà de la borne. Ce n'est pas gênant là où ça
compte : le seau où la troncature est de loin la plus probable est celui des amitiés — un auteur à
plus de 500 amis est banal, un post à plus de 500 commentateurs distincts ne l'est pas — et c'est
précisément celui où le compte est exact.

## Vérification de l'addendum

- **15 tests neufs**, dont **13 rouges observés** avant implémentation (le 15e — « sous la borne, on
  se tait » — était vert d'emblée : il n'y avait alors aucun `warn` du tout, ce qui est exactement le
  cas à verrouiller contre un futur `warn` trop bavard).
- **Les 4 tests du cycle 32 qui nourrissaient exactement `FANOUT_ROW_CAP` lignes** passent à
  `FANOUT_ROW_CAP + 1` : sous la sémantique du témoin, 500 lignes veut dire « complet ». Le cas
  « exactement 500 → aucune troncature » devient un test à part entière — c'est le point que `>=`
  manquait.
- Le témoin est éprouvé sur ses **trois** régimes : 500 pile → pas de troncature ; 501 → troncature
  signalée ; et dans les deux cas la 501e n'est jamais notifiée.

## Reste ouvert après l'addendum

- **La file d'attente de fan-out** reste la tête du prochain cycle, telle que le cycle 32 la pose
  (D1) — inchangé, et mieux instrumenté : le verdict de troncature ne remonte plus de faux positifs,
  donc ce que les logs mesureront sera lisible tel quel.
- Tout le reste ouvert du cycle 32 ci-dessous est inchangé.

---

# Cycle 32 — Une troncature muette, et les défauts permissifs que le cycle précédent n'avait pas atteints

Deux têtes prises ensemble, parce qu'elles se sont révélées être la même question posée à deux
étages. Celle laissée par le cycle 31 (livré en parallèle par une autre session, mergé en premier,
et repris tel quel ici — sa forme était la bonne) : « **`getStoryNotificationRecipients` plafonne à
500 lignes par seau** sans le dire au destinataire ni au log. Sur un post viral, un fan-out
silencieusement tronqué ressemble à un fan-out complet. **Tête du prochain cycle.** »

Et ce que ce cycle 31 n'avait pas atteint : il a rendu `visibility` requis sur un lot, mais le
défaut permissif vivait aussi chez l'appelant, dans trois autres lots, et sur huit méthodes de
diffusion temps réel.

## Lot A — la borne était légitime, son silence ne l'était pas

Quatre lectures bornées à 500 alimentent les fan-out de notification. Une liste rendue à la borne
exacte est **indiscernable** d'une liste complète : le seau paraît entier, et le 501e destinataire
n'apprend jamais rien. Le cas le plus net n'est même pas le post viral mais
`createFriendContentNotificationsBatch` : tri `updatedAt desc`, borne fixe, donc chez un auteur qui
dépasse durablement la borne ce sont **toujours les mêmes** — les contacts les plus anciens — qui
n'apprennent aucune de ses publications. Un silence structurel, pas un incident.

Correctif dans la ligne du corollaire du cycle 27 (« une valeur vide *établie* et une valeur vide
*qu'on n'a pas pu établir* doivent être DISTINGUABLES dans le type de retour ») : la borne devient
`FANOUT_ROW_CAP`, partagée par les quatre `take` — une constante ne peut pas dériver du test qui la
surveille — la saturation entre dans le type de retour (`truncatedBuckets: FanoutBucket[]`) et dans
le log (`postId`, `authorId`, seaux, borne).

## Lot B — le défaut permissif ne vit pas que dans la signature

`SocialEventsHandler` portait `visibility: string = 'PUBLIC'` et `visibilityUserIds: string[] = []`
sur **huit** méthodes de diffusion et sur l'énumérateur `getVisibilityFilteredRecipients` lui-même.
Un appelant qui les omettait diffusait un post `PRIVATE` à tous les amis de l'auteur, ou un `EXCEPT`
sans sa liste noire.

Aucun appelant de production ne les omettait — et c'est exactement l'argument : le retrait ne coûte
rien, la conservation coûte le premier oubli. Les deux paramètres deviennent requis ; le build a
lui-même désigné les deux harnais qui s'appuyaient sur le défaut.
`createFriendContentNotificationsBatch` reçoit le même traitement que ses trois lots voisins.

## Lot C — et il se réinstalle chez l'appelant

Le cycle 31 a rendu `visibility` requis sur `createStoryCommentNotificationsBatch` ; son unique
appelant passait `post.visibility ?? 'PUBLIC'`. Le défaut avait simplement changé d'étage, hors de
vue du build. Même motif dans `routes/posts/interactions.ts`, deux fois, avec un cast en prime :
`(post as { visibility?: string }).visibility ?? 'PUBLIC'` — alors que `postAcl`, la tranche ACL
autoritative, est chargée **trois lignes plus haut** pour la garde d'interaction. Le cast disait que
la forme rendue par `likePost` n'était pas sûre de porter le champ ; la réponse n'était pas de
deviner une valeur, mais de lire celle qu'on avait déjà.

## D1 — pourquoi le lot A ne va pas jusqu'à la file d'attente

Le commentaire du code propose depuis longtemps « a background queue for fan-out ». Ce cycle ne la
construit pas : une file change le modèle de livraison (ordre, reprise, idempotence) et mérite son
propre cycle. Rendre la troncature **observable** est ce qui manquait pour pouvoir décider — on ne
sait aujourd'hui ni à quelle fréquence la borne est atteinte, ni sur quels seaux.

## D2 — ce qui n'a PAS été refait après la session parallèle

Le cycle 31 a été livré deux fois, en parallèle. La branche arrivée première portait la meilleure
forme sur trois points (le contrat `Set | null` de la lecture DM, qui distingue la panne de
l'absence ; le refus du seul résidu plutôt que de tout le lot ; les 14 fixtures qui verrouillent
l'accord des deux formes cas par cas), et son choix assumé de relire les co-membres plutôt que de
recopier une règle d'admission localement est défendable. Elle est gardée telle quelle : ce cycle ne
réécrit rien de ce qu'elle a livré, il prend la suite là où elle s'arrête.

## Vérification

- **6 tests neufs** (`__tests__/unit/services/NotificationService.fanouttruncation.test.ts`),
  **5 rouges observés** : la saturation de chacun des trois seaux, le log qui nomme le post et le
  seau, la borne du graphe ami côté publication — et les deux cas sous la borne qui ne doivent RIEN
  consigner (sans eux, un log inconditionnel passerait les autres).
- **Suite gateway complète : 612 suites, 15 789 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,67 %** (95,66 % avant).
- Le lot B et le lot C ne changent aucun comportement observable : ils déplacent au build ce qui
  n'était protégé que par la discipline des appelants. Aucun test neuf ne peut en témoigner — la
  suite existante sert de filet, et les deux harnais que le compilateur a fait tomber sont la preuve
  que la garde mord.

## Reste ouvert après ce cycle

- **La file d'attente de fan-out** (cf. D1). La troncature est désormais mesurable ; le prochain pas
  est de regarder ce qu'elle mesure avant de choisir entre file, pagination et borne relevée.
  **Tête du prochain cycle si rien de plus grave n'apparaît.**
- **`getVisibilityFilteredRecipients` et `filterPostConsumers` traitent une visibilité inconnue de la
  même façon (retomber sur les amis), mais par deux chemins qui ne se citent pas.** L'un est un
  énumérateur, l'autre un test d'admission — les fusionner serait la faute du cycle 28 ; les faire
  se référencer mutuellement suffirait.
- **`@Display Name` reste inextractible dans le domaine social** — sixième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.

---

# Cycle 31 — Deux tests d'admission pour une seule question, et le seau qui n'en avait aucun

Tête laissée par le cycle 30 : « **Deux tests d'admission coexistent** : `filterPostAudience`
(amis stricts) et `canUserConsumePost` (amis ∪ contacts DM). Un contact DM non-ami reçoit donc une
notification de réponse mais pas de mention. **Candidat sérieux pour le prochain cycle.** »

Pris tel quel. Le défaut annoncé était réel — et en le corrigeant, l'outil qu'il a fallu construire
a rendu visible un second trou, plus grave, dans le même fichier.

## Lot A — les deux tests d'admission avaient divergé

Une seule question, « celui-là a-t-il le droit de LIRE ce post ? », posée sous trois formes :

| forme | qui | audience AVANT |
|---|---|---|
| clause `where` | `buildPostVisibilityOrFilter` (feed, post unique) | amis ∪ contacts DM |
| destinataire unique | `canUserConsumePost` (fil, notifications unitaires) | amis ∪ contacts DM |
| lot de candidats | `filterPostAudience` (mentions) | **amis stricts** |

Trois formes imposées par la manière dont la question se pose — pas par l'audience. La troisième
avait dérivé, et la conséquence est observable par l'utilisateur : un contact DM non-ami voit le
post dans son feed, peut en ouvrir le fil, reçoit une notification quand on répond à son
commentaire — et **rien** quand on le nomme dans ce même post. Sous-livraison silencieuse.

**Correctif.** `filterPostAudience` → **`filterPostConsumers`**. Le renommage n'est pas cosmétique :
la doctrine posée au cycle 29 (D1) veut qu'un point d'entrée choisisse son audience en la
**nommant**, et l'ancien nom ne disait pas laquelle des deux il appliquait — c'est précisément ce
qui a permis la dérive. La branche `FRIENDS`/`EXCEPT` consulte désormais le lien DM.

**Le coût est nul sur le cas dominant.** `filterDirectContactIdsAmong` — pendant BORNÉ de
`getDirectConversationContactIds`, comme `loadFriendIdsAmong` l'est du graphe ami — n'est interrogé
que pour le **résidu** : les candidats dont l'amitié n'a rien dit. Un lot entièrement composé d'amis
ne coûte pas une requête de plus qu'avant. Les candidats déjà écartés par la liste noire `EXCEPT`
sortent des bornes avant toute lecture, comme dans `canUserViewPost`.

**Une panne partielle ne détruit pas ce qui est établi.** Le graphe ami qui échoue ne laisse rien —
on refuse tout. Le graphe DM qui échoue ne laisse indéterminé que le résidu — on garde les amis et
on refuse le reste. Distinguer les deux, c'est le corollaire du cycle 27 appliqué à un filtre.

**L'anti-dérive est un test de conformité, pas une implémentation partagée.** Fusionner les deux
formes serait faux : `filterPostConsumers` matérialise les co-membres (`getCommunityCoMemberIds`)
là où `canUserConsumePost` tranche en pairwise (`doUsersShareCommunity`) — c'est la raison d'être
des deux. 14 fixtures traversent donc les deux fonctions depuis le **même** double de graphe et
doivent rendre le même verdict.

## Lot B — le seau « engagés antérieurs » n'avait aucun test d'admission

Trouvé en branchant le lot A. `createStoryCommentNotificationsBatch` sert trois seaux :

| seau | nature | garde AVANT |
|---|---|---|
| auteur | possède le post | exempt, correct |
| `friendIds` | **sortie d'énumérateur** — amis actuels dépliés du graphe | table locale, correct |
| `previousCommenterIds` | **ensemble arbitraire** — commentateurs antérieurs ∪ réacteurs | table locale, **faux** |

La table locale `canSeePost` ne lisait aucun graphe : `default: return true` couvrait `FRIENDS`, et
`EXCEPT` se contentait de la liste noire. Pour les amis c'est juste — ils sont amis par
construction. Pour les engagés antérieurs c'est un trou : ils étaient admis **quand ils ont engagé
le post**, et une dés-amitié ou une édition de visibilité les en sort sans toucher à leur
commentaire. Un post `PUBLIC` passé en `FRIENDS` emporte d'un coup tous ceux qui n'ont jamais été
amis — et chacun reçoit `story_thread_reply` avec l'extrait du nouveau commentaire.

C'est le trou que le cycle 30 avait fermé pour la notification UNITAIRE de la même population
(`comment_reply` → `canNotifyAboutPost`). Le seau de fan-out l'avait gardé.

`engagedAudience` passe par `filterPostConsumers`. `canSeePost` devient `canSeeAsFriend` — il ne
filtre plus que les amis — et son cas `COMMUNITY`, devenu inatteignable, est retiré plutôt que
laissé en garde décorative (repéré par la ligne non couverte 1906, pas par relecture).

## Lot C — `visibility` requis (dette des cycles 28, 29, 30)

`visibility?` à défaut `PUBLIC` sur `createStoryCommentNotificationsBatch`, annoncé trois fois comme
« mécanique, sans risque ». Devenu `visibility: string | null | undefined` requis. Une visibilité
nulle se lit désormais comme `FRIENDS`, jamais comme publique.

Nuance apprise en le faisant : contrairement à ce qu'annonçait le cycle 28, la requiredness ne
protège **que la production** ici — `services/gateway/tsconfig.json` exclut `**/__tests__/**`, donc
aucun harnais n'échoue au build. Le seul appelant de production (`routes/posts/comments.ts`) est
bien couvert ; les 3 harnais ont été rattrapés par leurs assertions, pas par `tsc`.

## Vérification

- **19 tests neufs** : 14 fixtures de conformité + 8 cas de fan-out + 5 cas de borne/panne côté lot,
  et 3 cas de service pour la mention d'un contact DM. **10 rouges observés** avant implémentation
  (7 lot A, 3 lot B), vérifiés en neutralisant la branche DM puis en la rétablissant.
- **3 harnais** complètent leur double Prisma (`participant`) : sans lui, l'exception avalée faisait
  passer leurs refus pour des refus d'ACL — ils prouvaient moins qu'ils n'en avaient l'air.
- **Suite gateway complète : 611 suites, 15 783 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %** ; `postAudience.ts` et `directContactVisibility.ts` à 100 % lignes.

## Reste ouvert après ce cycle

- **`canUserInteractWithPost` reste amis stricts** et c'est volontaire (décision 2026-07-08) : ce
  cycle n'a réaligné que le côté CONSOMMATION, où les trois formes répondent maintenant à
  l'identique. L'asymétrie voir ⊇ interagir est intacte — ne pas la « réaligner » sans re-décider.
- **`getStoryNotificationRecipients` plafonne à 500 lignes par seau** sans le dire au destinataire ni
  au log. Sur un post viral, un fan-out silencieusement tronqué ressemble à un fan-out complet.
  **Tête du prochain cycle** si rien de plus grave n'apparaît.
- **`@Display Name` reste inextractible dans le domaine social** — cinquième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, et donc aucune passe de lint n'a pu tourner sur ce cycle non plus.

---

# Cycle 30 — Les notifications du fil suivaient l'auteur du commentaire, pas l'audience du post

Suite directe du cycle 29, sur la tête qu'il avait lui-même désignée : « `createCommentReplyNotification`
et `createCommentLikeNotification` ne filtrent pas leur destinataire unique. **Prochain lot naturel.** »

## Ce qui était ouvert

Trois notifications à destinataire UNIQUE visent l'auteur d'un commentaire :
`createCommentReplyNotification`, `createCommentLikeNotification` et
`createCommentReactionNotification` (chemin socket).

Leur destinataire A pu commenter — donc il était admis **à ce moment-là**. Rien ne garantit qu'il
le soit encore : une dés-amitié, ou une édition de visibilité via `PUT /posts/:postId`, le sort de
l'audience **sans toucher à son commentaire**. Les deux événements sont ordinaires.

Ce qui partait alors sur son écran verrouillé n'est pas un ping :

| notification | ce qu'elle portait |
|---|---|
| `comment_reply` | `replyPreview` — un extrait du contenu d'un **TIERS** — plus `parentCommentPreview` et la **vignette du post** (`resolvePostMedia` → `firstAttachmentUrl`, `postThumbnailUrl`) |
| `comment_like` | cette même vignette de post restreint |
| `comment_reaction` | un lien de tap vers un post qui le refuserait |

Le cycle 29 avait fermé la lecture et l'écriture du fil ; il restait ce qui en découle.

## D1 — la garde résout le post elle-même

Le cycle 28 avait tranché l'inverse pour les lots de mention : `visibility` **requis** en paramètre,
pour que TypeScript refuse l'appel incomplet à la compilation. Ici le choix est l'autre, et pour une
raison mesurable : ces trois méthodes sont invoquées en **fire-and-forget APRÈS la réponse**
HTTP/socket (toutes leurs invocations sont suivies d'un `.catch()` détaché). La requête
supplémentaire ne coûte donc rien d'observable, là où le cycle 28 gardait un chemin d'écriture chaud.

Et une garde sans paramètre ne peut pas être **désarmée par omission** — pas même par un appelant
futur qui ignorerait la règle. C'est la même propriété que D2 du cycle 28 visait, obtenue sans
élargir l'API de trois méthodes.

`canNotifyAboutPost(postId, recipientId)` : `loadPostAcl` puis `canUserConsumePost`. Audience de
**consommation** (amis ∪ contacts DM) — être informé d'un contenu qu'on a le droit de lire dans le
fil est la même question que le lire. **En panne ou post introuvable, on REFUSE** : une notification
manquée se rattrape en ouvrant le post, un extrait poussé ne se rappelle pas.

## D2 — `NOT_DELETED` sort de `postIncludes`

Brancher la garde a fait tomber **16 suites** de `NotificationService` d'un coup. Le diagnostic est
plus intéressant que le symptôme : `postVisibility` importait `NOT_DELETED` depuis `postIncludes`,
qui construit ses `Prisma.validator` **au chargement du module**. Les harnais de notification
doublent le client Prisma et n'ont aucune raison de connaître les formes d'`include` des posts —
ils cassaient sur un import qu'ils n'avaient pas demandé.

Corriger les 16 harnais aurait masqué le vrai défaut : un module d'ACL feuille ne doit pas dépendre
d'un module de formes. `NOT_DELETED` vit désormais dans `services/posts/softDelete.ts`, re-exporté
par `postIncludes` pour ses appelants historiques. **16 rouges → 6**, et les 6 restants sont la
vraie déclaration d'audience.

## Vérification

- **11 tests neufs** (`__tests__/unit/services/NotificationService.threadaudience.test.ts`),
  **6 rouges observés** : le destinataire dés-ami, le post devenu `PRIVATE`, la liste `ONLY`, le
  post introuvable qui refuse, l'auteur toujours admis sur son propre `PRIVATE`, le `PUBLIC` qui
  n'interroge pas le graphe — et deux verrous qui vérifient que la **vignette n'est même pas lue**
  quand le destinataire est hors audience.
- **7 harnais** complètent leur double : audience du post, et `PostVisibility` (le module d'ACL
  compare `post.visibility` à l'enum Prisma — un double qui ne l'expose pas fait valoir `undefined`
  à toute comparaison, donc refuser).
- **Suite gateway complète : 609 suites, 15 751 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %**.

## Reste ouvert après ce cycle

- **Deux tests d'admission coexistent** : `filterPostAudience` (lots de mention, amis stricts) et
  `canUserConsumePost` (fil + notifications unitaires, amis ∪ contacts DM). Un contact DM non-ami
  reçoit donc une notification de réponse mais pas de mention. L'écart est **conservateur** (sous-
  livraison, jamais fuite) et les deux formes diffèrent — lot de candidats arbitraires contre
  destinataire unique déjà engagé. Les unifier demande de re-décider si `filterPostAudience` doit
  admettre les contacts DM. **Candidat sérieux pour le prochain cycle.**
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  annoncé par les cycles 28 et 29, toujours ouvert. Mécanique, sans risque.
- **`@Display Name` reste inextractible dans le domaine social** — quatrième report.
- Les autres points du cycle 29 (réparations base à lancer à la main, suppression de branche
  distante impossible depuis cette routine, `eslint` inopérant sur le gateway) sont inchangés.

---

# Cycle 29 — Le fil d'un post n'héritait d'aucune de ses règles d'audience

Tête laissée par le cycle 28 :
« **`@Display Name` reste inextractible dans le domaine social.** […] **Tête du prochain cycle si
rien de plus grave n'apparaît** — deux cycles de suite, quelque chose de plus grave est apparu. »

Trois cycles de suite. Le défaut annoncé retourne à la file, avec sa raison inchangée.

## Ce qui était ouvert

Les six routes de `routes/posts/comments.ts`, le like/unlike REST du post et les quatre handlers de
réaction socket ne consultaient **jamais** `Post.visibility`. Un utilisateur authentifié connaissant
un `postId` pouvait, sur un post `PRIVATE` / `ONLY` / `FRIENDS` / `COMMUNITY` :

| surface | ce qu'elle donnait |
|---|---|
| `GET /posts/:postId/comments` | tout le fil — contenu, médias, auteurs |
| `GET .../comments/:commentId/replies` | idem, et sans même regarder le post |
| `POST /posts/:postId/comments` | **écrire** dedans, puis notifier l'auteur |
| `POST`/`DELETE .../like` | réaction persistée sur un commentaire du fil |
| `comment:reaction-add` / `-remove` | idem par socket |
| `post:reaction-add` / `-remove` | réaction sur le post lui-même |
| `POST`/`DELETE /posts/:postId/like` | réaction REST sur le post lui-même |

Différence de nature avec le cycle 28 : cette fuite est **tirée par l'appelant**, pas poussée. Elle
ne demande aucun préalable — ni mention, ni relation, ni notification — seulement un identifiant.

## Pourquoi c'était visible dans le dépôt

Le post, lui, était protégé : `PostService.getPostById` et `recordMediaDownloads` appliquent
`buildVisibilityFilter`, et `post:join` refusait déjà l'abonnement à la room d'un post restreint
via `canUserViewPost`. Le fil était la seule île sans ACL.

Et la preuve était dans le fichier même : `CommentReactionHandler` **importait** `canUserViewPost`
et portait un wrapper privé `_canUserViewPost` — que rien n'appelait. L'intention avait été écrite,
le branchement n'avait jamais eu lieu.

## D1 — une asymétrie documentée n'est pas une asymétrie appliquée

`postVisibility.ts` porte depuis la décision 2026-07-08 : le filtre de LISTE admet amis ∪ contacts
DM, tandis que `canUserViewPost` — « ce qui garde RÉAGIR / COMMENTER » — reste amis stricts. Cette
règle n'existait qu'en prose : rien ne permettait de l'appliquer à UN objet.

Quatre primitives la rendent exécutable, dans le fichier qui la documente plutôt que dans un module
de plus :

| primitive | question | audience |
|---|---|---|
| `loadPostAcl` | tranche ACL de ce post | — (`null` si absent OU supprimé) |
| `loadCommentPostAcl` | ... du post PORTANT ce commentaire | — (id d'URL jamais cru) |
| `canUserConsumePost` | peut-il LIRE le fil ? | amis ∪ contacts DM |
| `canUserInteractWithPost` | peut-il ÉCRIRE / RÉAGIR ? | amis stricts |

Les deux verdicts ne diffèrent que par `canUserViewPost(..., { includeDirectContacts })`. Un point
d'entrée choisit son audience en la **nommant**, pas en réglant un booléen.

Choisir la consommation pour la lecture n'est pas un élargissement, c'est l'absence d'une
régression : un contact DM non-ami à qui le feed montre déjà une story `FRIENDS` doit pouvoir en
lire les commentaires. Le verdict d'interaction en aurait fait un 404 — une garde qui casse un
lecteur légitime n'est pas une garde.

## D2 — l'identifiant du chemin ne vaut rien

Trois surfaces adressent leur cible par `commentId` tout en recevant un `postId` (segment d'URL ou
champ de payload) : les réponses, les likes de commentaire, les réactions socket. Le post y est
désormais résolu **DEPUIS le commentaire**. Sans cela, un appelant annonçait le post public de son
choix tout en visant le fil d'un post privé — le `postId` reçu n'est plus qu'une adresse de room et
un segment de chemin.

## Les deux transports répondent pareil

`likePost` et `PostReactionService.addReaction` ne vérifient, eux aussi, que l'existence et le
non-effacement du post. Gardier le seul chemin socket aurait fait dépendre l'ACL du **transport** :
un client refusé sur `post:reaction-add` réussissait en repassant par `POST /posts/:postId/like`.
Les deux reçoivent donc la même garde et le même refus indistinct.

## D3 — refuser sans confirmer

`404` partout, jamais `403`, et `null` indistinct entre post absent, supprimé et invisible. Même
doctrine que `recordMediaDownloads` : distinguer ferait de la route un oracle d'existence de posts
privés. Côté socket, l'ACK rend « Post/Comment not found » pour la même raison.

## Coût

- Cas dominant (post `PUBLIC`) : une requête bornée, **aucune** lecture de graphe ensuite.
- `FRIENDS`/`EXCEPT` : une requête d'amitié ; le contact DM n'est consulté qu'en dernier recours.
- `EXCEPT` court-circuite sur sa liste noire **avant** toute lecture de graphe (nouveau).
- `doUsersShareDirectConversation` est le pendant **pairwise** de `getDirectConversationContactIds`,
  exactement comme `doUsersShareCommunity` l'est de `getCommunityCoMemberIds` : deux requêtes
  bornées au lieu de matérialiser le carnet d'adresses. Définition du contact DM reprise mot pour
  mot du feed. **En panne, il refuse.**

## Contreparties assumées

**1. Un contact DM non-ami perd le droit d'ÉCRIRE dans le fil d'un post `FRIENDS`/`EXCEPT` qu'il
peut pourtant VOIR** (il garde la lecture). C'est le seul cas où une action qui réussissait pour un
utilisateur *voyant* le post échoue désormais — il mérite d'être appelé par son nom plutôt que
caché derrière « on ferme un trou ». Ce n'est pas un effet de bord : c'est exactement la décision
produit du 2026-07-08 citée dans `postVisibility.ts` (« un DM-contact peut ouvrir une story FRIENDS
et compter comme viewer, mais pas y réagir »), restée sans point d'application jusqu'ici. Si
l'équipe produit veut au contraire ouvrir l'interaction aux contacts DM, la correction tient en une
ligne (`canUserInteractWithPost` passant `includeDirectContacts: true`) — et doit se faire en
RE-DÉCIDANT l'ACL, jamais en retirant la garde. **Point de validation humaine.**

**2. Un utilisateur qui perd l'accès à un post ne peut plus retirer une réaction qu'il y avait
laissée.** Elle lui est de toute façon invisible, et une ACL qui dépend du sens du geste est un
footgun ; le retrait suit donc la pose. À rouvrir si un cas d'usage réel apparaît.

## Vérification

- **51 tests neufs**, écrits AVANT l'implémentation, **24 rouges observés** :
  - `__tests__/unit/services/posts/postThreadAccess.test.ts` — 22 cas (les six modes, l'auteur
    toujours admis sur son `PRIVATE`, le contact DM admis en lecture ET refusé en écriture, le post
    résolu depuis le commentaire, la visibilité inconnue qui restreint, la panne qui refuse, les
    court-circuits sans requête).
  - `__tests__/unit/routes/posts/comments-audience.test.ts` — 17 cas sur les cinq routes, dont
    « le `:postId` du chemin ne vaut rien » et « lire est ouvert là où écrire est refusé ».
  - `__tests__/unit/routes/posts/interactions-audience.test.ts` — 8 cas sur le like/unlike REST,
    dont « un contact DM non-ami est refusé, comme sur le chemin socket ».
  - 9 cas d'audience ajoutés aux deux suites de handlers socket, dont « le `postId` du payload
    n'est pas cru ».
- **15 harnais ont dû déclarer leur audience.** C'est voulu, et c'est le même choix qu'au cycle 28 :
  un double qui n'expose pas la tranche ACL échoue au lieu de rendre un verdict par défaut.
- Le wrapper mort `_canUserViewPost` est retiré.
- **Suite gateway complète : 608 suites, 15 740 tests, tout vert** (avant : 605 / 15 682).
  `tsc --noEmit` propre. Couverture lignes **95,66 %**, en légère hausse.

## Reste ouvert après ce cycle

- **`@Display Name` reste inextractible dans le domaine social** — rendu à la file une TROISIÈME
  fois, même raison mesurée : les deux clients insèrent un **handle**, jamais un nom d'affichage
  (web `MentionAutocomplete` → `onSelect(suggestion.username)`, iOS `FeedCommentsSheet` →
  `"@\(username) "`). Le cas ne se produit qu'en frappe manuelle. **Tête du prochain cycle si rien
  de plus grave n'apparaît.**
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  candidat sérieux annoncé par le cycle 28, non traité : ce cycle a trouvé plus grave dans le même
  chemin. Un seul appelant, qui passe bien le paramètre ; le rendre requis est mécanique.
  **Candidat sérieux pour le prochain cycle**, deux fois annoncé.
- **`createCommentReplyNotification` et `createCommentLikeNotification` ne filtrent pas leur
  destinataire unique** — l'auteur du commentaire parent reçoit un extrait de la réponse **et la
  vignette du post** (`resolvePostMedia`) sans test d'audience. Le cas exige une restriction
  postérieure à son commentaire (dés-amitié, édition de visibilité), donc plus étroit que ce cycle,
  mais c'est le même défaut : `filterPostAudience` s'y applique tel quel. **Prochain lot naturel.**
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). À lancer SANS `--apply`
  d'abord. Action humaine — cette routine n'a aucun accès MongoDB.
- **Les `PostMention` périmées déjà écrites restent en base** (cycle 27, inchangé).
- **Aucune lecture déjà servie n'est rattrapable.** Le correctif ne vaut que pour l'avenir ; les
  fils restreints déjà lus l'ont été.
- **`getMentionsForMessage` / `getRecentMentionsForUser` n'ont aucun consommateur d'écran**
  (cycle 27, inchangé).
- **`MeeshySocketIOManager.getConversationParticipantsForMention`** reste un deuxième exemplaire du
  chargeur de participants (cycle 21, inchangé).
Deux doubles de `TrackingLinkService` ne stubaient que 3 méthodes et **inventaient donc le contrat**
(`MessageProcessor.test.ts`, `conversation-messages-advanced.test.ts`). Ils ont échoué bruyamment
dès que le code a appelé la vraie surface — ce qui est le bon comportement (cf. leçon du 2026-08-07).
Ils reflètent désormais le contrat réel. Les 13 tests qui exerçaient l'exemplaire DUPLIQUÉ de
l'algorithme dans `MessageProcessor` sont remplacés par 3 tests de délégation : l'algorithme a une
seule maison, et un seul lieu de test (`TrackingLinkService.test.ts` +
`TrackingLinkService.dollarSequences.test.ts`, séquences `$` comprises — le cas `<url>` qui n'y
existait pas y a été ajouté).

## Vérification

```
services/gateway : 601 suites / 15640 tests — tous verts
tsc --noEmit     : propre
```

Nouveaux tests : 13 sur l'unité (`reconcileEditedLinks` × 8, `mergeTrackingLinksIntoMetadata` × 5),
11 sur le chemin socket (contenu réécrit persisté + diffusé, retraduction depuis le texte réécrit,
collecte sur le contenu réécrit, mapping d'une URL ajoutée, voisins de `metadata` préservés, vide
établi qui efface, panne qui n'efface rien, hoist top-level, omission du champ sur panne), 4 sur la
route REST (mapping minté et persisté, voisins préservés, vide établi, panne qui n'efface rien),
1 sur le repli `$` du chemin `<url>`.

## Reste ouvert après ce cycle

- **`MessageHandler.handleMessageEdit` ne recalcule pas `conversationMessageStatsService
  .onMessageEdited`** que REST appelle après édition. Septième asymétrie du même handler — la
  dernière recensée, et elle porte sur les statistiques de conversation, pas sur le message.
  **Tête du prochain cycle.**
- **Le payload `message:edited` porte `trackingLinks: []` quand le texte n'en a plus.** Le décodeur
  iOS (`MessageModels.swift`) ne retient le champ top-level que s'il est NON vide, puis retombe sur
  `metadata.trackingLinks` — absent du payload d'édition. Un client qui fusionne
  `{ ...cached, ...edited }` garde donc un mapping périmé jusqu'au prochain rechargement REST.
  Inoffensif (l'URL n'est plus dans le texte, l'entrée est inerte), mais le contrat de décodage
  mériterait de distinguer « champ absent » de « champ vide », comme le fait déjà le serveur.
- **L'édition REST n'émet toujours aucun `mention:created`** (cycle 21). Le chemin socket le fait ;
  REST n'a pas d'`io` sous la main — le câblage passe par `fastify.socketIOManager`.
- **Le domaine social extrait encore avec `extractMentions`.** `routes/posts/core.ts` (création ET
  édition) et `routes/posts/comments.ts` : un `@John Doe` dans un post ou un commentaire ne nomme
  personne — jamais, pas seulement à l'édition.
- **`repair-mention-user-ids.ts` n'a jamais été exécuté** — aucun accès base depuis cette routine.
  À lancer sans `--apply` d'abord.
- **`MentionCreatedEventData.mentionedParticipantId` reste dans les types partagés** et n'est peuplé
  par aucun émetteur ; le SDK iOS le décode. Champ mort des deux côtés.
- **`getMentionsForMessage` et `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est toujours un deuxième
  exemplaire du chargeur de participants** (cycle 21, inchangé).
- **`getLatestMessageSummary` résume le DERNIER message de la conversation, pas celui qu'on vient
  d'acquitter** (cycle 19, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9. Condition préexistante ; la CI ne gate que sur `test:coverage`.
- **La suppression de branche distante échoue depuis cette routine** — à supprimer depuis
  l'interface GitHub.

---

# Cycle 28 — Nommer quelqu'un ne lui donne pas le droit de VOIR

Tête laissée par le cycle 27 :
« **`@Display Name` reste inextractible dans le domaine social.** […] **Tête du prochain cycle
si rien de plus grave n'apparaît.** »

Quelque chose de plus grave est apparu, dans le bloc voisin du même chemin. Le défaut annoncé est
rendu à la file, avec la raison (voir *Reste ouvert*).

## Ce que les deux lots de mention faisaient

`createPostMentionNotificationsBatch` et `createCommentMentionNotificationsBatch` poussaient une
notification `user_mentioned` à **tout** utilisateur nommé dans le texte, sans jamais regarder qui
avait le droit de voir le post. La charge utile n'est pas un simple ping : elle porte
`postPreview` / `commentPreview` — un extrait de 100 caractères du contenu — et
`action: 'view_post'`.

Nommer `@carol` dans un post `PRIVATE`, `ONLY [bob]`, `FRIENDS` (Carol n'étant pas amie) ou
`COMMUNITY` (Carol n'étant pas membre) lui envoyait donc **un extrait du contenu sur son écran
verrouillé**, plus un lien de tap vers un post qui la refuserait. Le même trou existait pour un
commentaire : l'extrait du fil d'un post restreint partait vers un mentionné hors audience.

C'est une fuite de contenu, pas de métadonnée, et elle est **irréversible** — une notification
poussée est arrivée.

## Pourquoi c'était visible dans le dépôt

Ces deux lots étaient les **seules** surfaces d'éventail du domaine social à ne pas filtrer.
Toutes leurs voisines le font déjà, chacune sous un commentaire qui l'explique :

| surface | filtre |
|---|---|
| `createStoryCommentNotificationsBatch` | `canSeePost` (ONLY/EXCEPT/PRIVATE/COMMUNITY) |
| `createFriendContentNotificationsBatch` | branches ONLY/EXCEPT/COMMUNITY |
| `SocialEventsHandler.getVisibilityFilteredRecipients` | tous les broadcasts temps réel |
| `StoryTextObjectTranslationService.resolveBroadcastRecipients` | garde `PRIVATE` explicite |
| **les deux lots de mention** | **aucun** |

## D1 — l'admission n'est pas l'énumération

Toutes les gardes existantes sont des **énumérateurs** : auteur → liste de destinataires, obtenue
en dépliant son graphe. Une mention pose la question **inverse** — l'ensemble des nommés est
ARBITRAIRE (n'importe quel `@handle` du texte) et il faut trancher, un par un, « celui-là a-t-il le
droit ? ».

Réutiliser un énumérateur ici aurait été faux, et de façon coûteuse : pour `PUBLIC` ils rendent
`friendIds`. C'est un choix de **ciblage** (on ne pousse une publication qu'aux contacts), pas une
règle d'admission — un post public se **lit** par n'importe qui. Un inconnu légitimement nommé dans
un post public aurait perdu sa notification, soit le cas le plus courant de tous.

D'où `services/gateway/src/services/posts/postAudience.ts` → `filterPostAudience`, le test
d'admission, distinct et nommé comme tel :

| `visibility` | admis | coût |
|---|---|---|
| `PUBLIC` | tout le monde | **aucune requête** |
| `FRIENDS` | les amis de l'auteur | 1 requête bornée |
| `EXCEPT` | les amis, moins `visibilityUserIds` | 1 requête bornée |
| `ONLY` | exactement `visibilityUserIds` | aucune |
| `COMMUNITY` | les co-membres (cache Redis existant) | mutualisée |
| `PRIVATE` | personne | aucune |
| inconnue | comme `FRIENDS` — **jamais** comme publique | 1 requête bornée |

Trois décisions dans cette table :

1. **L'auteur est toujours admis**, y compris sur un `PRIVATE` : il possède le post, et aucun
   graphe ne l'affirme (on n'est pas ami avec soi-même).
2. **Une visibilité inconnue retombe sur `FRIENDS`**, pas sur `PUBLIC` : un mode ajouté demain au
   schéma sans passer par cette table restreint par défaut au lieu d'ouvrir en grand.
3. **En panne, on REFUSE.** L'échec d'une notification légitime est réparable (la ligne
   `PostMention` est persistée, la mention reste visible en ouvrant le post) ; la fuite ne l'est
   pas. `getCommunityCoMemberIds` rendait déjà `[]` sur exception — même politique.

La requête d'amitié est **bornée aux candidats** (`in: [...candidates]` des deux côtés) et non au
graphe entier : un auteur à 5 000 contacts nommant une personne coûte l'intersection, pas 5 000
lignes. Et le cas dominant — post public — ne coûte **rien**.

## D2 — une garde qu'on peut désarmer par omission n'est pas une garde

`createStoryCommentNotificationsBatch` prend `visibility?` avec défaut `PUBLIC` : oublier le
paramètre rouvre le trou en silence. Les deux lots de mention reçoivent au contraire
`visibility` **requis** (et `postAuthorId` requis côté commentaire, l'audience étant celle du POST
et non celle du commentateur). TypeScript refuse alors l'appel incomplet à la compilation.

C'est la raison de ne PAS avoir choisi l'autre option — recharger le post depuis `postId` dans le
lot : le paramètre requis donne la même garantie, sans requête supplémentaire sur un chemin
d'écriture chaud, et l'échoue au build plutôt qu'à l'exécution. La contrepartie assumée : **9
harnais** ont dû déclarer leur audience. Ils l'ont fait en `PUBLIC` avec la raison écrite — ils
portent sur le contenu, la langue, la priorité, le débit et l'auto-mention, pas sur le droit de
voir.

## Ce qui n'est PAS filtré, et pourquoi

Les lignes `PostMention` / `CommentMention` continuent d'être écrites pour **tous** les nommés.
Elles consignent un FAIT sur le texte (« ce post nomme Carol »), vrai quelle que soit l'audience ;
seule la **livraison** est conditionnée. Trois raisons :

1. Élargir plus tard la visibilité d'un post ne doit pas laisser un mentionné sans ligne.
2. Le consommateur d'affinité (`PostFeedService.getMentionsByPost` → `getReelSeed`) ne classe que
   des `candidateIds` **déjà filtrés par le feed** — vérifié : aucune seconde fuite par ce chemin.
3. Une ligne manquante ne se reconstruit pas (personne ne relit le texte après coup), là où une
   notification manquée est rattrapée par l'ouverture du post.

Les listes de déduplication des routes (`mentionedUserIds` → `excludeUserIds`) restent
**volontairement** l'ensemble complet des nommés. Un mentionné hors audience exclu des buckets de
priorité inférieure ne perd rien : ces buckets appliquent leur propre filtre de visibilité et
l'auraient écarté aussi.

## Vérification

- **25 tests neufs**, écrits AVANT l'implémentation, RED observé à chaque étape :
  - `__tests__/unit/services/posts/postAudience.test.ts` — 15 cas, unité à **100 % lignes et
    branches** (les six modes, l'amitié dans les deux sens, la borne aux candidats, l'auteur
    toujours admis, la panne qui refuse, la visibilité inconnue qui restreint, les court-circuits
    sans requête).
  - `__tests__/unit/services/NotificationService.mentionaudience.test.ts` — 10 cas sur les deux
    lots, dont « l'audience est celle du POST, pas celle du commentateur » et « aucune notification
    quand le graphe est illisible ».
- **4 régressions au niveau ROUTE** : l'audience du post persisté atteint le lot (création),
  l'audience **APRÈS** édition est celle qui s'applique (restreindre et nommer dans la même requête),
  l'audience du post atteint le lot de commentaire, et un post commenté introuvable ne notifie
  personne.
- **Suite gateway complète : 605 suites, 15 682 tests, tout vert** (avant : 603 / 15 655).
  `tsc --noEmit` propre. Couverture globale lignes **95,65 %**, en hausse.

## Reste ouvert après ce cycle

- **`@Display Name` reste inextractible dans le domaine social** — tête annoncée par le cycle 27,
  rendue à la file une seconde fois, et pour la même raison mesurée : les deux clients insèrent un
  **handle**, jamais un nom d'affichage (web `MentionAutocomplete` → `onSelect(suggestion.username)`,
  iOS `FeedCommentsSheet` → `"@\(username) "`). Le cas ne se produit qu'en frappe manuelle. Coût non
  nul : un post n'a pas de participants, l'audience équivalente (auteur + commentateurs + amis, cf.
  `getUserSuggestionsForPost`) demanderait deux requêtes de plus sur un chemin d'écriture chaud.
  **Tête du prochain cycle si rien de plus grave n'apparaît** — deux cycles de suite, quelque chose
  de plus grave est apparu.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  le footgun que D2 vient de fermer sur les mentions reste ouvert là. Il n'a aujourd'hui qu'un seul
  appelant, qui passe bien le paramètre ; le rendre requis est mécanique et sans risque.
  **Candidat sérieux pour le prochain cycle.**
- **Les commentaires n'ont pas de route d'édition** — `comments.ts` n'expose que création,
  like/unlike et suppression. Il n'y a donc rien à réconcilier côté `CommentMention` aujourd'hui ;
  le jour où une édition de commentaire apparaît, elle doit naître avec `reconcilePostMentions`
  pour jumeau.
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). À lancer SANS `--apply`
  d'abord. Action humaine — cette routine n'a aucun accès MongoDB.
- **Les `PostMention` périmées déjà écrites restent en base.** Les lignes de mentionnés retirés
  avant le cycle 27 survivent. Réparable par le même patron que les deux scripts ci-dessus.
- **Aucune notification déjà poussée n'est rattrapable.** Le correctif de ce cycle ne vaut que pour
  les mentions à venir ; les extraits partis vers des mentionnés hors audience sont arrivés.
- **`getMentionsForMessage` / `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran (cycle 27, inchangé).
- **`MeeshySocketIOManager.getConversationParticipantsForMention`** est toujours un deuxième
  exemplaire du chargeur de participants (cycle 21, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9 (`bun run lint` échoue immédiatement). Condition préexistante, non couverte par la CI
  — qui ne gate que sur `test:coverage`.
- **La suppression de branche distante échoue depuis cette routine** (`git push --delete` répond
  « Everything up-to-date » sans agir). Les branches mergées s'accumulent côté remote — à supprimer
  depuis l'interface GitHub.

---

# Cycle 25b — Addendum d'une session parallèle

Deux sessions ont livré le cycle 25 en parallèle. Le refactor des liens de la PR #2650 est
**strictement meilleur** : en réunissant les deux copies, il a trouvé que `createdBy` recevait un
`Participant.id` là où la route `/tracking-links` attend un `User.id` pour AUTORISER l'accès. La
seconde session s'aligne dessus et n'apporte que ce qui manquait — appliqué par-dessus, jamais à la
place. (Leçon d'intégration du cycle 23 : comparer défaut par défaut, jamais « qui est arrivé en
premier ».)

Le cadrage du `@Display Name` social revient au cycle 26 ci-dessus, mieux étayé : les deux clients
insèrent un **handle**, jamais un nom d'affichage. La note de cette session sur le sujet est donc
retirée au profit de la sienne.

## Champ mort retiré — `MentionCreatedEventData.mentionedParticipantId`

Porté par le backlog depuis le cycle 24, vérifié et retiré. Les **trois** émetteurs de
`mention:created` — envoi WS (`MessageHandler`), envoi REST/ZMQ (`MeeshySocketIOManager`), édition
(`emitMentionCreated`) — l'omettent : il n'a jamais circulé sur le fil. Le SDK iOS le décodait dans
`MentionCreatedEvent`, et rien ne lisait la propriété.

Le test de décodage SDK garde la clé dans le JSON **et lui en ajoute une inconnue** : ce qui compte
désormais n'est plus la valeur du champ mais le fait qu'une clé inconnue ne casse pas le décodage —
donc qu'aucun client ne souffre d'une gateway qui l'enverrait encore.

À ne pas confondre avec la colonne physique `Mention.mentionedParticipantId` (Prisma/Mongo), bien
vivante et utilisée par les scripts de migration.

## Écarté après enquête — `getLatestMessageSummary` n'est pas un défaut

Le backlog le portait depuis le cycle 19 : « résume le DERNIER message de la conversation, pas
celui qu'on vient d'acquitter ». **Ce n'en est pas un, et le "corriger" serait une régression.**

iOS applique le `summary` via `bufferBatchDelivery(conversationId:event:)` — un lot au niveau
**conversation**, jamais par message (`ConversationSocketHandler.swift:801`). Le contrat client est
donc « état de livraison de la conversation, ancré sur son dernier message », ce que la méthode
calcule exactement.

Si le serveur résumait le message ACQUITTÉ, lire un vieux message #5 produirait un résumé « lu »
que le client appliquerait **en lot à tous les messages**, y compris #7 non lu. Passer au
par-message demanderait de plumber des reçus par message des deux côtés client : chantier de
contrat, pas correctif. Retiré du backlog comme défaut.
- Les points hérités du cycle 19 restent ouverts tels quels : `getLatestMessageSummary` décrit
  le DERNIER message de la conversation et non celui qu'on vient d'acquitter ; les mentions du
  chemin de lien attendent toujours l'extraction qui écrit `Message.validatedMentions` ; aucun
  client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de lien n'entrent pas
  dans le pipeline audio ; l'arbitrage `delete-for-me` du cycle 12 attend une validation
  humaine.
- **`emitConversationPreviewUpdate` et les autres émetteurs par room personnelle n'ont pas été
  audités contre la même clé.** Ce cycle a traité les trois copies de l'éventail d'accusés ; la
  règle « adresser par `userId ?? id` » vaut pour tout émetteur personnel, et rien ne garantit
  que les autres la respectent. À instruire par une recherche sur `ROOMS.user(` plutôt que par
  déduction.

## Review — Follow-ups différés audio immersif iOS (2026-08-11, branche `fix/ios-audio-followups`)

Traite les 4 follow-ups différés du chantier "audio immersif iOS" (merge `02c7f69b4`, mémoire
`project_ios_immersive_audio_2026_08_11`). 3 commits + revue finale de branche (Opus) : APPROVE
avec réserves, mergeable.

**Livré (commits `1691b2b62`, `b15d67ca6`, `982b0e390`, `7b89f02f9`)** :
- Warning Sendable sur `beginBackgroundTaskProvider` résolu (`@Sendable` sur le type du handler).
- Cold-open du plein écran audio depuis une conversation (tap direct, aucune lecture en cours)
  câble désormais `conversationName`/`queueTailProvider` — `AudioMediaView.fullscreenSource(for:)`,
  threadé sur 5 niveaux de vues (`MessageListViewController` → `ThemedMessageBubble` →
  `BubbleStandardLayout` → `AudioMediaView`/`AudioCarouselView`).
- Convention d'id synthétique du plein écran standalone unifiée avec les 3 sites
  `CoordinatedAudioPlayer` inline (feed/commentaire/post).
- Vérification manuelle iPhone SE 375pt : rangée transport (reculer/play/avancer/AirPlay) OK,
  aucun changement de code nécessaire.
- Test ajouté verrouillant la capture PER-ITEM de `queueTailProvider` (trouvé par la revue finale :
  le test original stubbait `{ _ in ... }` sans jamais vérifier l'id reçu — un provider recevant
  l'id de la VUE au lieu de celui de l'ITEM aurait cassé l'avance de file en multi-audio pager sans
  faire rougir un seul test).

**Découverte non liée à ce mini-chantier, à traiter séparément** : `AudioFullscreenView` plante de
façon déterministe sur simulateur iPhone SE (3e gen) / iOS 18.2 (~250-900ms après ouverture,
assertion libdispatch main-queue ~400-500ms après le push `NowPlayingInfo`). Confirmé PRÉ-EXISTANT
(`cd7504e5e`, ancêtre de `main`, plante aussi) — ces 3 commits ne l'aggravent pas. L'hypothèse
"AirPlayRoutePicker" a été RÉFUTÉE par deux expériences contrôlées (délai de montage du picker,
délai de `startPlayback()` — même signature de crash dans les deux cas). Racine encore inconnue,
dans une assertion AVKit/MediaPlayer fermée. Périmètre (autre device/OS ?) non déterminé — à
tester sur iPhone 16 Pro et/ou device réel avant de pouvoir clore. Note : la "dette pbxproj"
initialement soupçonnée pour `CoordinatedAudioPlayer.swift` était un faux positif du worktree
d'investigation (pas régénéré) — `main` a bien les 4 références attendues, aucune action requise.

**Follow-ups non-bloquants restants (verdict de la revue finale)** :
- Artwork Now Playing du cold-open reste celui de l'EXPÉDITEUR (`item.authorAvatarURL`,
  `AudioFullscreenView.swift:575`) alors que le nom est désormais celui de la CONVERSATION
  (`item.nowPlayingContextName`) — incohérent avec `ConversationViewModel.playAudio` qui passe la
  paire `currentConversationName`/`currentConversationArtworkURL`. Fix : ajouter un
  `nowPlayingContextArtworkURL` sur `AudioFullscreenSource`, même threading que
  `nowPlayingContextName` (5 fichiers, même patron que le commit `b15d67ca6`).
- `PostDetailView.swift:~1941-1952` (cold-open d'un repost cité) : `conversationId` pointe le
  repost cité mais `author`/`caption`/`createdAt` viennent toujours du post extérieur — même classe
  de bug que `7ddcb6f22` avait corrigée côté inline, ici seulement pour le chemin froid (le chemin
  chaud `playKeepingQueue` est sain). Fix : petite conversion `DetailMediaAuthor` → `ProfileSheetUser`.
- `AudioFullscreenSource.conversationId` porte 3 sens différents (vraie `Conversation.id` / id
  d'entité porteuse / `nil`) documentés par de la prose plutôt qu'un renommage — `playbackSessionId`
  éliminerait le besoin d'expliquer. Touche l'API publique du coordinator, hors scope d'un mini-fix.

## Review — 3 chantiers UI Liquid Glass/menu (2026-08-12, branches fix/message-more-menu-and-media + feat/inline-video-liquid-glass + feat/scroll-to-bottom-morph, mergées dans main)

Workflow autonome (Opus, 51 agents, TDD RED-GREEN + revue par tâche + revue finale holistique par
piste) sur 3 sous-projets indépendants. Verdicts des 3 revues finales : **MERGEABLE AVEC RÉSERVES**
(message-more), **MERGEABLE AVEC RÉSERVES** (inline-video), **MERGEABLE** (scroll-morph). Aucun
Critical sur les 3 pistes. Gate complet réel vérifié sur chaque worktree + sur le résultat fusionné.

**Corrigé avant merge** (pas un follow-up, déjà fait) : le bouton "Enregistrer" du sous-menu média
affichait dès qu'un message avait ≥1 attachment non-location, alors que la règle SSOT du dépôt
(`MessageActionResolver.saveableAttachmentCount == 1`) exige EXACTEMENT UN — un message à 3 photos
aurait silencieusement sauvegardé la première seulement. Fix + test corrigés avant le merge.

**Follow-ups Important non-bloquants (verdict des revues finales)** :
- **Auto-PiP en arrière-plan désormais armé pour TOUTE vidéo inline** (`inline-video`, 6 surfaces :
  bulle, pièce jointe de bulle, feed, détail de post, média de commentaire, attachment de bulle) —
  conséquence directe des 2 décisions produit prises pendant le brainstorm (câbler le PiP + élargir
  `inlineDefault` partout). `MediaLifecycleBridge.prepareForBackground` ne met plus en pause une
  vidéo dont le PiP s'engage. Invisible en simulateur (`isPictureInPictureSupported()` y est
  toujours faux) — à ajouter explicitement à la checklist de vérification device, avec le scénario
  bulle-en-lecture → passage aux réels (contention du `pipController` singleton partagé).
- `apps/ios/meeshy.sh` : le nouveau garde-fou anti-tests-non-enregistrés (`verify_test_classes_are_compiled`,
  Leçon 120) utilise `nm | grep -oF` — correspondance par SOUS-CHAÎNE. 7 paires de classes en
  collision existent aujourd'hui (`RouterTests` ⊂ `DeepLinkRouterTests`/`ComposerIngestRouterTests`/
  `AudioBubbleRouterTests`/`NotificationContentRouterTests`, `ConversationViewModelTests` ⊂
  `NewConversationViewModelTests`, `StatusViewModelTests` ⊂ `ConnectionStatusViewModelTests`,
  `BubbleEquatableTests` ⊂ `ThemedMessageBubbleEquatableTests`) : si l'une devenait orpheline, la
  garde ne la verrait pas. Fix : ancrer sur le nom manglé Swift (préfixe de longueur, ex.
  `11RouterTests`) au lieu du nom nu. Fichier PARTAGÉ par tous les worktrees iOS — coordonner avant
  d'y toucher.
- `_FullscreenRenderer` (plein écran vidéo) n'opte toujours pas pour le PiP après un expand depuis
  l'inline : le `pipController` singleton reste lié au layer inline masqué. No-op en pratique
  aujourd'hui, mais `prepareForBackground` y consomme jusqu'à 400ms d'attente inutile. Suivi
  naturel : propager `enablesPip` à la surface plein écran aussi.

**Follow-ups Minor (dette, aucun ne bloque)** :
- 3ᵉ copie verbatim de la construction `MediaSaveRequest` dans `ConversationView.swift` (757, 1800,
  1950) — extraction en helper `requestSaveFirstMedia(of:)` recommandée.
- Cibles incohérentes dans le sous-menu média : Supprimer vise `attachments.first?.id` (sans filtre
  `.location`), Enregistrer vise `first(where: { $0.type != .location })` — pré-existant, rendu
  visible par le regroupement des 2 actions dans un seul dialog.
- `.media` reste gaté par `canDelete` (`MessageActionResolver.swift:92`) — un média REÇU (non
  admin/mod) ne voit pas ce point d'entrée Enregistrer/Transférer (atténué : `.saveMedia` primaire
  et `.forward` pellet couvrent déjà le cas).
- `isCompactShape` (scroll-to-bottom) porte un nom inversé — renvoie `true` pour la capsule LARGE,
  `false` pour le cercle compact. `usesCapsuleShape` dirait la vérité ; figé dans 4 tests.
- Glyphe média dupliqué entre `unreadCallIndicator` (app) et `CallNoticePresentation.mediaGlyph`
  (`BubbleCallNoticeView.swift:278`) — extraire un helper partagé sur `CallNoticePresentation`.
- Accessibilité : `scrollToBottomAccessibilityLabel` ne mentionne pas l'état d'appel — VoiceOver
  n'annonce que "N messages non lus", alors que manqué/échoué se distinguent SEULEMENT par la
  teinte (WCAG 1.4.1, couleur seule).
- Aucun des 3 fichiers de plan n'a ses cases `- [ ]` cochées après exécution — les plans ne
  reflètent plus l'état d'avancement réel pour une session qui reprendrait. Sans impact fonctionnel.

**Découverte annexe, HORS PÉRIMÈTRE de ce chantier** : le gate complet sur le résultat fusionné a
révélé `CallViewAccessibilityTests.test_hasActiveEffects_alsoChecksAdvancedFilters_notIsEnabledAlone`
ROUGE de façon déterministe (reproduit isolément, 1/36 dans la classe) — `hasActiveEffects` ne
vérifie que `config.isEnabled`, pas `config.hasAdvancedFilters`. Fichier dernièrement touché par
`7b8f7e33d` (PR #2859, "calls: updateCallStatus duration anchor + video filter silent no-op"),
totalement étranger aux 3 chantiers ci-dessus. Poussé sur `main` tel quel (pré-existant, pas
introduit par ce travail) — à triager par qui possède la zone calls/effets vidéo.

---

## Cycle 84 — mesure du gate iOS (réponse aux items 1 et 2 de la tête de cycle)

Les trois seuls runs `pull_request` d'`ios-tests.yml` existants au 2026-08-12 06:00 UTC (tous sur
`claude/keen-hamilton-ghcir8`, la branche qui a câblé le gate au cycle 83), relevés par l'API
Actions :

| Run | `Restore DerivedData` | `Resolve SPM` | **`Build for testing`** | `Save DerivedData` | Total job |
|---|---|---|---|---|---|
| `31564979638` | **1 s** (miss) | 122 s | **393 s** (6m33) | 32 s | **606 s** (10m06) |
| `31565952871` | 14 s (hit) | 23 s | **199 s** (3m19) | 17 s | **298 s** (4m58) |
| `31566561699` | 15 s (hit) | 41 s | **295 s** (4m55) | 25 s | **432 s** (7m12) |

### Item 1 — le « régime permanent à 4m54 » était le meilleur des deux points, pas la moyenne

Le cycle 83 disposait de DEUX points (10m02 à froid, 4m54) et a retenu le second comme régime
permanent. Le troisième point tombe à **7m12** : le régime chaud lui-même varie, `Build for testing`
allant de **3m19 à 4m55** d'un run chaud à l'autre. Moyenne des trois : **7m25**.

**Correction à porter au dossier** : la projection n'est pas 340 poussées × ~5 min ≈ 1 700 min, mais
340 × ~7,4 min ≈ **2 500 min de runner macOS/mois**. Cela reste très en-dessous de l'estimation
~18 min qui accompagnait le câblage — **le gate demeure justifié**, et aucune coupe n'est requise ;
c'est le chiffre consigné qui doit être corrigé, pas la décision.

Réserve d'honnêteté : les trois runs portent sur des commits quasi identiques de la même branche
(deux d'entre eux ne touchent que des `.md` et le YAML). Les builds chauds mesurés sont donc un
**meilleur cas** ; une PR qui remue vraiment du Swift reconstruira davantage. Trois points restent
trois points — à re-mesurer quand la population de runs `pull_request` aura grossi.

### Item 2 — le cache DerivedData profite bien aux PR (hypothèse confirmée, à une réserve près)

L'étape `Restore DerivedData build cache` répond en **1 s au premier run** (rien à restaurer, clé
neuve) puis en **14 s et 15 s** aux deux suivants : ce sont de vraies restaurations, pas des miss.
Et l'effet est visible là où il compte — `Build for testing` passe de **393 s à froid** à
**199 s / 295 s à chaud**, soit **25 à 49 % de moins**.

Les deux modes ne se piétinent donc **pas** le cache : la première hypothèse du cycle 83 (les
produits d'un build `generic/platform=iOS Simulator` se réutilisent) est **soutenue par la mesure**.

**Ce qui reste non vérifié** : les trois runs sont tous des runs de PR. La question croisée —
un build de PR (`generic/…`, arm64 épinglé) réutilise-t-il ce qu'un build de `dev` (`id=<sim>`) a
écrit, et réciproquement — demande de comparer un run de PR à un run de `dev` consécutifs sous la
même lignée de clés. Aucun couple de ce genre n'existe encore.

### Observation annexe, hors périmètre du gate

La suite complète sur `dev` (`push`, 28 à 54 min) est **rouge très fréquemment** : sur les 20
derniers runs `push dev` d'`ios-tests.yml`, on relève des `failure` les 08-11 (×3), 08-10 (×2),
08-09 (×2), 08-07, 08-06 et 08-04. Le gate de PR ne voit rien de tout cela — il est compile seule,
et c'est le compromis assumé — mais une suite de référence durablement rouge prive le dépôt du
signal que le gate ne prétend pas donner. À triager par qui possède la suite iOS.

### Ce que le cycle 84 n'a PAS instruit

L'item 3 (porte `actions: write` close, pas de `workflow_dispatch` pour la routine) est inchangé et
n'a pas été retesté — rien n'indiquait un changement côté intégration GitHub App.

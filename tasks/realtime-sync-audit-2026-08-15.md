# Realtime sync audit — 2026-08-15 (continuous-improvement pass)

Passe ciblée sur le **rejeu hors ligne** (`RedisDeliveryQueue` +
`_drainPendingMessages`), la seule surface temps-réel que les audits
`2026-07-05` / `2026-07-11` n'avaient pas parcourue famille d'événements par
famille d'événements. Environnement Linux : gateway + `packages/shared`
testables, iOS/SDK non compilables ici (cf. findings #2–#4 du `2026-07-05`).

**Conclusion : un défaut réel trouvé, corrigé et mergé (PR #3012). Un candidat
adjacent écarté avec preuve** — détail ci-dessous pour éviter qu'un prochain
cycle ne le ré-instruise, ou pire, ne l'implémente.

## Méthode

Inventaire des familles d'`eventType` que la file de remise sait rejouer
(`packages/shared/types/delivery-queue.ts`), croisé avec l'inventaire des
événements serveur que la gateway diffuse **après** l'instant de l'envoi. Toute
diffusion post-envoi qui n'a pas d'entrée de file correspondante est un candidat :
la room `conversation:<id>` ne contient que des sockets **connectées**, donc un
émetteur qui ne s'adresse qu'à elle perd l'événement pour toujours — rien ne le
rejoue au reconnect et aucun client ne refetch spontanément.

Couvert avant ce cycle : `new`, `edited`, `deleted`, `reaction-added`,
`reaction-removed`, `attachment-reaction-added`, `attachment-reaction-removed`,
`pinned`, `unpinned`, `link-message`, `attachment-updated`.

## Défaut corrigé — `message:translation` n'avait aucun rejeu hors ligne

`MeeshySocketIOManager._handleTextTranslationReady`

La traduction NLLB atterrit **une à deux secondes après l'envoi**, par ZMQ, et
n'était diffusée qu'à `io.to(ROOMS.conversation(id))`. Or le `message:new` mis en
file de remise à l'ENVOI porte `translations: []` — la traduction n'existait pas
encore à cet instant. Séquence complète :

```
t0    Alice envoie « Hello ».  Bob est hors ligne.
      → message:new mis en file pour Bob, translations: []
t0+1s NLLB rend « Bonjour ».
      → io.to(conversation:<id>).emit(message:translation)   ← Bob n'y est pas
      → RIEN n'est mis en file pour Bob
t1    Bob se reconnecte.
      → le drain rejoue message:new … sans traduction
      → Bob lit « Hello », définitivement
```

Même classe que le défaut que `emitAttachmentUpdated` ferme pour la
transcription d'une note vocale (`eventType: 'attachment-updated'`), jamais
traitée côté TEXTE : le Prisme Linguistique devenait fonction de la
**connectivité** du lecteur, pas de ses préférences de langue.

**Livré** : `eventType: 'translation'`, rejoué comme `MESSAGE_TRANSLATION` par
`_drainedEventName`, `dedupKey` scopé à `messageId:targetLanguage` (l'identité de
dédup par défaut `(messageId, eventType)` est MUTABLE pour tout type ≠ `'new'` —
sans clé par langue, chaque nouvelle langue supersède la précédente en place et
le lecteur hors ligne ne converge que sur la dernière arrivée). PR #3012,
squash-mergée (`cbdf124b`). CI : 15 checks, tous verts.

## Candidat écarté — la 2e audience de `message:translation`

**Hypothèse initiale** (formulée dans la section « Future Considerations » de la
PR #3012, avant instruction) : `message:translation` devrait aussi chaîner les
rooms PERSONNELLES des participants, comme `emitAttachmentUpdated` le fait pour
sa 2e audience — « iOS ne joint `conversation:<id>` qu'à l'ouverture du fil, donc
un lecteur resté sur la liste n'est dans AUCUNE room de conversation ».

**Pourquoi c'est faux ici, contrairement au cas de la pièce jointe** :

1. **Un lecteur connecté hors de la room n'a jamais reçu le message non plus.**
   `message:new` est room-scopé pour les DESTINATAIRES —
   `MessageHandler.broadcastNewMessage` n'émet vers une room personnelle que
   pour l'EXPÉDITEUR (`ROOMS.user(senderUserId)`, payload avec `clientMessageId`).
   Un destinataire connecté mais hors du fil ne reçoit que `conversation:updated`
   (la ligne de liste). Son cache MESSAGE se remplit à l'ouverture du fil, par
   REST — et la réponse REST porte déjà **toutes** les traductions. Il n'y a donc
   rien à rattraper.
2. **La seule fenêtre résiduelle dure ~1–2 s.** Le seul lecteur dont le cache
   contient le message SANS sa traduction est celui qui avait le fil ouvert à
   l'arrivée du message puis l'a quitté (quittant la room) avant que NLLB ne
   réponde. C'est exactement la latence ZMQ d'une traduction texte.
3. **C'est là que le cas AUDIO diverge, et c'est ce qui justifie son fan-out.**
   Whisper puis NLLB+Chatterbox rendent l'audio traduit langue par langue,
   sur des secondes à des minutes — une fenêtre où quitter le fil est le
   comportement NORMAL, pas une coïncidence de 2 secondes.

**Coût du fix si on l'implémentait quand même** : un message d'une conversation
à N langues produit N événements `message:translation`. Room-scopé, chacun ne
touche que les lecteurs ayant le fil ouvert. Chaîné sur les rooms personnelles,
chaque participant reçoit les N — dont N−1 dans des langues qu'il ne lit pas
(le payload n'est pas filtrable par lecteur : les clients REMPLACENT leur carte
de traductions, cf. la même contrainte documentée sur `emitAttachmentUpdated`).
Ce serait une régression de bande passante, sur mobile, pour fermer une fenêtre
de 2 secondes déjà couverte par le rejeu hors ligne livré ci-dessus.

**Décision : ne pas implémenter.** La 3e audience (hors ligne) était le vrai
trou, et elle est fermée. La borne actuelle de la 2e — `emitConversationPreviewUpdate`
sous `PreviewUpdateScope` (`onlyIfLatestIs` + `onlyIfPreviewCarriesLanguage`),
qui sert la ligne de LISTE et elle seule — est le bon compromis, pas une
omission.

## Surfaces vérifiées correctes pendant ce cycle (ne pas re-vérifier)

- **`enqueueForOfflineParticipants`** — exclusion d'acteur sur les DEUX identités
  (participant id / user id), clé de file `userId ?? id` alignée sur la
  convention de room personnelle du drain, best-effort non-throwing.
- **`RedisDeliveryQueue.ENQUEUE_DEDUP_LUA`** — `'new'` immuable (retour 0),
  tout autre type superseded en place (LSET, retour 2). C'est ce qui interdit
  d'enrichir l'entrée `'new'` en file plutôt que d'ajouter un eventType, et ce
  qui rend la `dedupKey` par langue obligatoire.
- **`_emitDeliveryForDrainedMessages`** — filtre `eventType === 'new'` : aucune
  des familles de mutation (traduction comprise) ne peut faire avancer une coche
  d'accusé de réception.
- **Payload de file du chemin d'envoi** — `broadcastPayload` n'est PAS filtré par
  langue (le filtrage vit dans `_emitMessageNewByLanguage`, par groupe de
  langues, au moment de l'emit live). Une entrée en file est donc correcte pour
  tous les destinataires hors ligne, quelles que soient leurs langues.

## Environnement de vérification (parité CI)

```bash
bun install --ignore-scripts                                  # postinstall grpc-tools bloqué par le proxy
cd packages/shared && npx prisma generate --generator client
cd packages/shared && bun run build                           # sinon @meeshy/shared non résolu au type-check
cd services/gateway && bun x jest --config=jest.config.json    # 716 suites / 17553 tests
cd packages/shared && bun x vitest run                         # 54 fichiers / 1542 tests
```

---

# Cycle 22 (2026-08-15) — `translation:request` : le chemin CACHE parlait une langue qu'aucun client ne lit

Passe suivante de la routine « amélioration continue temps réel ». Le cycle 21
avait fermé le rejeu HORS LIGNE de `message:translation` ; ce cycle repart du
même événement par l'autre bout — non plus « qui le reçoit », mais **quelle
forme il a selon le chemin qui l'émet**.

**Conclusion : un défaut réel trouvé, corrigé, testé.** Trois surfaces balayées
sans rien trouver sont listées en fin de section pour qu'un prochain cycle ne
les ré-instruise pas.

## Méthode

Deux balayages mécaniques avant toute lecture ciblée :

1. **Matrice `SERVER_EVENTS` × émetteurs gateway × écouteurs web** (125 events).
   7 events émis sans écouteur web : `attachment:reaction-added/removed`,
   `message:read-status-updated` (faux positif — dual-émis avec le legacy
   `read-status-updated`, que le web écoute), `location:live-started/updated/stopped`
   (déjà noté au cycle précédent, aucun consommateur web), `heartbeat:ack`
   (le web émet `heartbeat` mais n'écoute pas l'accusé — informatif, sans effet).
2. **Matrice `CLIENT_EVENTS` × émetteurs clients × handlers gateway** (58 events).
   Aucun trou réel : les `CALL_*` sont servis par `CALL_EVENTS` (autre objet de
   constantes), et `CLIENT_EVENTS.USER_STATUS` n'est émis par personne — iOS ne
   fait que l'écouter. Entrée morte, sans conséquence.

Puis la question que les deux matrices ne posent pas : **quand un même event a
PLUSIEURS émetteurs, émettent-ils la même forme ?** C'est là qu'était le défaut.

## Le défaut — deux constructeurs pour une seule charge utile

`SERVER_EVENTS.MESSAGE_TRANSLATION` a deux émetteurs dans `MeeshySocketIOManager` :

| chemin | quand | forme émise |
|---|---|---|
| `_handleTextTranslationReady` | retour ZMQ de NLLB (cache MISS) | `TranslationEvent` ✅ |
| `_handleTranslationRequest` (branche cache) | réponse à `translation:request` (cache HIT) | `{ messageId, translatedText, targetLanguage, confidenceScore }` ❌ |

La seconde forme n'a ni tableau `translations`, ni le nom `translatedContent`
que `TranslationData` porte. Or les deux clients prennent le contrat au mot :

- **Web** — `TranslationService.handleTranslationEvent` : ni `data.translation`
  ni `data.translations` ⇒ `return` nu. Pas un log.
- **iOS** — `MessageSocketManager` : `decode(TranslationEvent.self, …)`, où
  `translations: [TranslationData]` n'est **pas** optionnel ⇒ décodage en échec,
  événement perdu.

Séquence complète :

```
Alice appuie sur « traduire en français ».
  → translation:request { messageId, targetLanguage: 'fr' }
  → getTranslation() rend un HIT (quelqu'un a déjà lu ce message en français)
  → socket.emit(message:translation, { messageId, translatedText, … })
  → web : return nu             |  iOS : decode échoue
  → RIEN à l'écran, aucune trace
```

Et l'ironie du sens : la traduction à la demande ne « marchait » que sur cache
**MISS**, servie par l'autre constructeur. Plus une traduction était déjà prête,
moins elle arrivait — le Prisme Linguistique devenu fonction de l'état du cache
serveur.

**Pourquoi ça a survécu.** Le test qui couvrait cette branche
(`MeeshySocketIOManager.test.ts`, « emits MESSAGE_TRANSLATION when cached
translation found ») **assertait la forme cassée** :
`expect.objectContaining({ translatedText: 'Bonjour', targetLanguage: 'fr' })`.
Récidive exacte du D4 du cycle 7 — « les tests validaient une coïncidence ».

## Le correctif

`socketio/buildTranslationEvent.ts` — constructeur UNIQUE, appelé par les deux
chemins. C'est la correction, pas un détail de style : deux copies d'une même
charge utile ont dérivé exactement comme le cycle 8 l'avait constaté sur le
corps REST des liens de partage.

Trois décisions inscrites dans le module :

- **`cached` dit la provenance** (`true` sur le chemin cache, `false` au retour
  ZMQ) au lieu du `false` écrit en dur qu'avait l'unique constructeur correct.
- **`id` UNIQUE par émission** quand la ligne n'en a pas (`${messageId}_${lang}_${now}`,
  repli déjà utilisé par le chemin ZMQ). Le web déduplique sur
  `${messageId}_${translation.id}` et ne purge ce registre qu'au centième
  événement : un id STABLE ferait avaler la réponse à une demande **explicite**
  de l'utilisateur au motif qu'une émission antérieure portait la même identité
  — soit le symptôme même qu'on ferme.
- **`confidenceScore` par `??`, jamais `||`** : une confiance de 0 est une
  valeur, pas une absence.

Côté web, le `return` nu devient un `logger.warn` nommant les clés reçues.
Ignorer une charge utile qu'on ne sait pas lire reste la bonne posture — c'est
le SILENCE qui a permis la survie, pas le rejet.

## Gates

- [x] 1 RED discriminant vu rouge sur la passerelle avant correctif
      (`Array.isArray(payload.translations)` → `false`)
- [x] `buildTranslationEvent.test.ts` : 11 témoins (contrat, replis, unicité d'id)
- [x] `MeeshySocketIOManager.test.ts` : 337 verts (336 pré-existants inchangés)
- [x] Suite gateway complète verte
- [x] Web : `__tests__/services` + `__tests__/hooks/queries` — 63 suites / 2215 verts
      (dont 2 nouveaux témoins sur `translation.service`)
- [x] `tsc --noEmit` gateway : 0
- [x] `tsc --noEmit` web : 1229, base pré-existante **inchangée** (mesurée
      avant/après par `git stash`)

## Surfaces vérifiées correctes pendant ce cycle (ne pas re-vérifier)

- **`/sync` (SyncEngine A1–A3)** — endpoint enregistré (`route-registration.ts:210`)
  mais **aucun client ne l'appelle** : ni web, ni SDK iOS. Auditer plus loin ce
  fichier n'a aucun effet en production tant que le client n'existe pas. Le
  keyset `(updatedAt, id)`, le budget d'octets (`trimToByteBudget`, préfixe +
  au-moins-une-ligne + exclusion de la ligne qui franchit), le report de curseur
  par stream et le retrait de checkpoint (`SYNC_CHECKPOINT_LAG_MS`) ont été relus
  sans trouver de défaut.
- **`emitWithSeq` / `SequenceService`** — les deux seuls appelants émettent
  `NOTIFICATION_NEW` ; le LOCKSTEP client documenté en tête de fichier tient.
- **`StatusHandler` (typing)** — suppression multi-appareil sur les deux chemins
  (`handleSocketDisconnecting`, `retractTypingIn`), tracking avant le portillon
  de throttle, purge de la fenêtre à la retraction. Correct.
- **`ConnectionService` / `SocketIOOrchestrator` (web)** — le cul-de-sac « JWT
  expiré au boot ⇒ aucun socket, rien ne réarme » est **déjà fermé**
  (`authManager.registerOnTokensUpdated` → `onTokensUpdated`), de même que la
  re-registration des écouteurs (`listenersAttachedSocket`).
- **`emitToConversationParticipants` / `participantUserRoomTargets`** — règle
  `userId ?? id` centralisée, chaînage (livraison au plus une fois par socket).

## Environnement de vérification (parité CI)

```bash
bun install --ignore-scripts                                  # postinstall grpc-tools bloqué par le proxy
cd packages/shared && npx prisma generate --generator client
cd packages/shared && bun run build
cd services/gateway && bun x jest --config=jest.config.json
cd apps/web && bun x jest __tests__/services __tests__/hooks/queries
```

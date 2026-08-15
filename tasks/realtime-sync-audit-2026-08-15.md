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

---

# Cycle 23 (2026-08-15) — l'aperçu POUSSÉ ignorait le masquage personnel du lecteur

Passe suivante de la routine « amélioration continue temps réel ». Les cycles 21
et 22 avaient pris `message:translation` par ses deux bouts (qui le reçoit, quelle
forme il a). Ce cycle change de famille : **`conversation:updated`, la ligne de
liste** — et non plus « qui/quelle forme » mais **pour QUI le contenu est-il
seulement le bon ?**

**Conclusion : un défaut réel trouvé, corrigé, testé, avec son garde-fou de
récurrence.** Cinq surfaces balayées sans rien trouver sont listées en fin de
section pour qu'un prochain cycle ne les ré-instruise pas.

## Méthode — trois balayages, dont un neuf

1. **`SERVER_EVENTS` × écouteurs iOS** (125 events, jamais croisés ainsi : le
   cycle 22 avait fait la matrice WEB). 19 events qu'iOS n'écoute pas. Le plus
   sérieux — `message:hidden-for-me` / `message:restored-for-me`, la
   synchronisation multi-appareil du « supprimer pour moi » — est un trou
   CLIENT, non vérifiable ici (aucune toolchain Swift sous Linux, cf. cycle 21).
   **Consigné pour un cycle disposant d'un runner macOS ; non tenté à l'aveugle.**
2. **Événements à ≥ 2 émetteurs gateway** (37), c'est-à-dire la sonde qui avait
   payé au cycle 22, passée cette fois mécaniquement sur toute la table.
   `read-status:updated` (6 émetteurs) et `conversation:unread-updated` (6) sont
   déjà unifiés — rien à prendre.
3. **La question qu'aucune des deux matrices ne pose** : un émetteur qui
   RECALCULE du contenu le recalcule-t-il pour le bon lecteur ? C'est là qu'était
   le défaut.

## Le défaut — un dernier message global poussé à des lecteurs qui l'avaient retiré

`emitConversationPreviewUpdate` (5 appelants : édition WS, suppression WS, les
cinq routes REST de mutation via `broadcastMessageMutation`, la traduction qui
atterrit) recalcule le dernier message de la conversation :

```ts
prisma.message.findFirst({ where: { conversationId, deletedAt: null }, … })
```

`deletedAt` ne porte QUE le « supprimer pour tous ». Le masquage **personnel**
vit dans deux autres tables — `UserMessageDeletion` (« supprimer pour moi ») et
`UserConversationPreferences.clearHistoryBefore` (« effacer l'historique ») —
qu'aucun `deletedAt` ne croise. Le message ainsi recalculé était poussé tel quel
dans la room personnelle de CHAQUE participant.

```
Alice fait « supprimer pour moi » sur le dernier message.
  → sa bulle disparaît, sa ligne de liste avance : correct.
Puis n'importe quelle mutation de la conversation — Bob édite un AUTRE message,
quelqu'un supprime, une traduction atterrit :
  → emitConversationPreviewUpdate recalcule latest = LE MESSAGE MASQUÉ
  → io.to(user:alice).emit(conversation:updated, { lastMessagePreview: <son texte> })
  → la ligne de liste d'Alice réaffiche ce qu'elle venait d'en retirer.
```

Et le REST lui donnait raison au refetch suivant : `GET /conversations` et la
recherche de conversations résolvent l'aperçu sous le masquage personnel depuis
longtemps (`resolveVisibleLastMessages`). **Les deux moitiés du même produit se
contredisaient selon le canal** — et avec `staleTime: Infinity` sur la liste web,
c'est la version fausse qui restait à l'écran. Même défaut, identique, pour
`clearHistoryBefore` : « effacer l'historique » puis la ligne qui ressuscite le
dernier message d'avant l'effacement.

**Pourquoi ça a survécu.** Il existe un garde-fou dédié à exactement cette
question (`personal-history-hiding-surface-guard.test.ts`) : il dénombre, fichier
par fichier, chaque lecture de `Message` sous `src/routes/` PUIS sous
`src/services/`, et exige de chacune une classification. `emitConversationPreviewUpdate`
est sous `src/socketio/` — ni l'un ni l'autre. Le garde comptait des LECTURES
(« ce que l'API rend quand on la questionne ») ; un émetteur temps réel ne répond
à aucune question, il POUSSE. La frontière était déclarée, mais sur deux axes
seulement, et le défaut vivait sur le troisième.

## Le correctif

`socketio/utils/personalPreviewOverride.ts` — `resolvePersonalPreviewOverrides`
rend `userId -> son propre dernier message visible`, et ne contient QUE les
lecteurs pour qui l'aperçu global est masqué.

Trois décisions inscrites dans le module :

- **Deux temps, parce que la question chaude n'est pas la question complète.**
  L'appelant tourne sur le chemin le plus fréquenté du service. La sonde ne
  demande que « CE message-ci est-il masqué pour l'un d'eux ? » — deux lectures
  indexées (clé unique `userId_messageId` ; seuils d'effacement POSTÉRIEURS au
  message seulement). Personne de concerné ⇒ on s'arrête là, ce qui est le cas de
  l'écrasante majorité des diffusions. Le masquage COMPLET et le `findFirst` de
  repli ne sont payés que par les lecteurs concernés. Même économie en deux temps
  que `resolveVisibleLastMessage` énonce pour la liste REST, restatée par LECTEUR
  au lieu de par conversation.
- **Le repli se calcule sous le masquage COMPLET du lecteur**, jamais sous le
  seul message sondé : masquer les trois derniers messages est un geste
  ordinaire, et un repli calculé sur un seul rendrait le suivant, masqué lui
  aussi.
- **`Map.has`, jamais `get() ?? latest`** : une entrée qui vaut `null` dit
  « cette personne n'a plus AUCUN message visible ici » (historique entièrement
  effacé), ce qu'un repli sur l'aperçu global rendrait exactement à l'envers.

Côté appelant, la moitié du payload qui dépend du message (`lastMessageId`,
`lastMessageAt`, `senderId`, `location`) sort de `basePayload` pour être résolue
par lecteur — `location` comprise : servir la position du message global à qui ne
le voit pas placerait une épingle sous un aperçu qui parle d'autre chose. La
projection devient une constante partagée par les deux requêtes, sans quoi le
payload d'un lecteur masquant perdrait des champs que celui de son voisin porte.

**Repli OUVERT** quand la sonde échoue : carte vide, donc l'aperçu global pour
tout le monde — l'état d'avant ce module. Même arbitrage que
`loadPersonalHistoryHiding` (« serving unfiltered »), et il vaut a fortiori ici :
faire disparaître la ligne de liste de toute une conversation parce qu'une table
de préférences est illisible serait bien pire que l'aperçu qu'on rate. Rapporté
par un `warn` du module et NON au `onError` de l'appelant : la diffusion n'a pas
échoué, elle a dégradé.

**Aucun changement client.** Le payload garde sa forme ; seul son contenu devient
juste. Web, iOS et Android en profitent sans livraison.

## Garde-fou de récurrence

Le garde-fou du masquage personnel gagne un **troisième balayage** : tout fichier
de `src/socketio/` qui RECALCULE un dernier message (`findFirst` +
`orderBy createdAt desc`) ET diffuse `conversation:updated` doit passer par
`resolvePersonalPreviewOverrides`. Le critère est la forme du défaut, pas le nom
du fichier — une recherche par id (le fichier en contient deux) n'est pas un
recalcul d'aperçu et ne déclenche rien.

## Gates

- [x] 3 RED discriminants vus rouges avant correctif — le plus parlant :
      `lastMessageId` reçu `"msg-latest"` par le lecteur qui l'avait supprimé
      pour lui
- [x] `personalPreviewOverride.test.ts` : 9 témoins (carte, coût, repli ouvert)
- [x] `emitConversationPreviewUpdate.test.ts` : 23 verts (20 pré-existants
      inchangés, doubles étendus aux deux tables de masquage)
- [x] `personal-history-hiding-surface-guard.test.ts` : 12 verts (11 + le
      troisième balayage)
- [x] Suite gateway complète verte
- [x] `tsc --noEmit` gateway : 0 — dont la déduplication de `MutationPrisma`,
      qui redéclarait un `Pick` jumeau de `PreviewPrisma` et l'a fait diverger
      dès l'ajout des deux modèles

## Surfaces vérifiées correctes pendant ce cycle (ne pas re-vérifier)

- **`read-status:updated` / `message:read-status-updated`** — les CINQ émetteurs
  (les deux routes REST d'accusé, `autoDeliverToOnlineRecipients`, le drain hors
  ligne, le rattrapage au join) passent tous par `emitToConversationParticipants`
  avec la même forme de payload. La sonde du cycle 22 ne rend rien ici.
- **`conversation:unread-updated`** — 6 sites, tous `{ conversationId, unreadCount }`.
  `emitUnreadCountsToRecipients` exclut l'expéditeur sur les DEUX identités et
  adresse les anonymes par `Participant.id`.
- **`filterMutedRecipients`** — le mute par conversation est honoré à la fanout
  de notifications, avec la ligne ambiant/adressé documentée et un repli ouvert.
- **`RedisDeliveryQueue.peek` / `drain`** — les deux trient par `enqueuedAt`
  avant toute limite, précisément parce que le supersede-en-place (LSET) garde
  le slot d'origine en estampillant un `enqueuedAt` plus récent. Les deux chemins
  (Redis, mémoire, et l'état mixte) sont alignés.
- **`_drainedEventName`** — la table est TOTALE sur l'union `eventType` de
  `delivery-queue.ts` ; aucun type ne retombe par accident sur `MESSAGE_NEW`.
- **`personalMessageVisibilitySync`** — le writer unique de `UserMessageDeletion`
  tient bien ses trois obligations (persister, rétracter la notification,
  diffuser à `user:{id}`), avec des postures d'échec délibérément distinctes.

## Reste ouvert (non tenté, faute d'environnement)

- **iOS n'écoute ni `message:hidden-for-me` ni `message:restored-for-me`.** Le
  serveur diffuse pourtant les deux à la room personnelle, et le web les traite.
  Un « supprimer pour moi » fait sur iPhone ne converge donc sur aucun autre
  appareil de la même personne. À reprendre depuis un runner macOS — la matrice
  du § Méthode donne les 18 autres events non écoutés.

# Cycle 24 (2026-08-15) — le filtre de confidentialité de la présence coûtait le SERVEUR, pas la question

Passe suivante de la routine « amélioration continue temps réel ». Les cycles 21
et 22 avaient pris `message:translation` par ses deux bouts, le cycle 23
`conversation:updated` par son audience. Ce cycle change à nouveau de famille —
**`user:status`, la présence** — et de question : non plus « qui reçoit / quelle
forme / pour qui est-ce juste », mais **combien coûte une diffusion, et en
fonction de QUOI ce coût grandit.**

**Conclusion : un défaut de passage à l'échelle réel trouvé, corrigé, testé.**
Quatre sondes rendues vides sont listées en fin de section pour qu'un prochain
cycle ne les ré-instruise pas.

## Méthode — quatre sondes, dont deux neuves

1. **Contrat d'ACK** (neuve) : pour chaque `socket.on(CLIENT_EVENTS.X)`, tout
   chemin de sortie répond-il au callback ? Un `return` muet laisse l'UI
   optimiste de l'expéditeur pendue jusqu'à son propre timeout. 56 écouteurs
   balayés mécaniquement, tous les `return` nus classés. **Rien** : les seuls
   `return` non suivis d'un callback sont POSTÉRIEURS à l'ACK (garde
   `unchanged` de `PostReactionHandler` / `CommentReactionHandler`).
2. **`CLIENT_EVENTS` × écouteurs gateway** (neuve, miroir des matrices des
   cycles 22 et 23 qui allaient dans l'autre sens). 58 events déclarés. Les 24
   sans écouteur sont les `CALL_*` (servis par la table `CALL_EVENTS`, faux
   négatifs) plus `USER_STATUS`, déclaré dans les DEUX tables depuis toujours et
   émis seulement serveur→client. Déclaration morte, pas un défaut.
3. **Couverture du rejeu hors ligne** : les 11 `eventType` de la file
   (`_drainedEventName`) ont tous un émetteur qui les enfile. Rien à prendre.
4. **Le coût d'une diffusion** — c'est là qu'était le défaut.

## Le défaut — une transition de présence portait un `$in` dimensionné par la gateway entière

`_broadcastUserStatus` doit exclure les viewers en relation de blocage
bidirectionnel avec la personne dont le statut change. Il le faisait ainsi :

```ts
const onlineOtherUserIds = [...this.connectedUsers.keys()].filter(id => id !== user.id);
const blockedUserIds = await getBlockedUserIdsAmong(this.prisma, user.id, onlineOtherUserIds);
```

`getBlockedUserIdsAmong(prisma, userId, candidateIds)` est une sonde **bornée par
son audience** : `findMany({ where: { id: { in: candidateIds }, blockedUserIds: { has: userId } } })`.
La forme est juste tant que `candidateIds` est une audience. Ici la liste de
candidats était **toute la population connectée du serveur**.

Or ce chemin s'exécute à CHAQUE transition de présence : chaque connexion, chaque
déconnexion, et — en rafale — pour chaque user que le balayage de maintenance
(`updateOfflineUsers`) passe hors ligne d'un coup. Le coût d'une seule connexion
grandissait donc avec le nombre de personnes **déjà connectées**, ce qui rend le
total quadratique en connexions sur une plateforme dont la cible affichée est
100k+ messages/seconde.

Le même appel portait un second terme, purement synchrone :

```ts
for (const bid of userRow?.blockedUserIds ?? []) {
  if (ids.includes(bid)) blocked.add(bid);   // O(|blockedUserIds| × |ids|)
}
```

`Array.includes` dans une boucle : avec `ids` = la population connectée et une
personne ayant bloqué quelques centaines de comptes, l'intersection devenait des
millions de comparaisons de chaînes **sur la boucle d'événements**, à chaque
transition de présence.

**Pourquoi ça a survécu.** La règle est implémentée DEUX fois, et l'autre copie
est juste. `StatusHandler._getBlockedSocketIdsInRoom` — le canal `typing`, voisin
immédiat — borne ses candidats aux participants de la conversation, et son
commentaire dit explicitement s'aligner sur `_broadcastUserStatus`. Les deux
copies rendent le même résultat ; elles ne diffèrent que par la **taille de la
liste de candidats**, la seule propriété qu'aucun test ne regardait. Une revue
qui compare les deux les trouve d'accord.

## Le correctif

`utils/blocking.ts` — `getBlockRelatedUserIds(prisma, userId)` rend la relation
de blocage COMPLÈTE d'une personne, **sans liste de candidats**. Le coût est
borné par la relation elle-même (vide pour la quasi-totalité des comptes) au lieu
de l'être par le serveur.

Trois points inscrits dans le module :

- **L'échange est neutre en comportement.** L'ancien code calculait
  `candidats ∩ relation`, puis mappait vers les sockets via `userSockets`. Un id
  en relation de blocage qui ne possède AUCUN socket vivant n'apporte rien à
  `.except()` — exactement ce que le pré-filtre par `connectedUsers` retirait.
  L'intersection se fait désormais en mémoire, contre `userSockets` (vidé à la
  déconnexion par `AuthHandler.handleDisconnection`), au lieu d'être payée en
  base. Le témoin `still excludes a blocked viewer who is connected` fige ce
  raisonnement en incluant un bloqueur hors ligne dans le résultat de la requête.
- **`getBlockedUserIdsAmong` n'est PAS remplacé** : sa forme `$in` reste la bonne
  pour ses trois autres appelants, dont les candidats sont de vraies audiences
  (les participants d'une conversation pour `typing`, les contacts d'un snapshot
  pour `_applyPresencePrefs`). Le défaut n'était pas la fonction, c'était
  l'appelant qui lui donnait le serveur entier pour audience.
- **`ids.includes` devient un `Set`** dans `getBlockedUserIdsAmong` : le terme
  synchrone bénéficie à TOUS les appelants, y compris ceux dont les candidats
  sont déjà bornés.

`schema.prisma` — `@@index([blockedUserIds])` sur `User`. Sans lui, la requête
« qui m'a bloqué ? » privée de son filtre `id` devient un COLLSCAN : l'index
multikey est ce qui rend le nouveau chemin borné plutôt que simplement déplacé.
Additif, à créer par `prisma db push` comme les 212 autres index du schéma.

**Aucun changement client.** La forme du payload et l'audience effective sont
inchangées ; seul le coût de leur calcul l'est.

## Gates

- [x] 1 RED discriminant vu rouge avant correctif — le témoin
      `WITHOUT enumerating the connected population` échoue contre l'appelant
      d'origine (vérifié en restaurant le code pré-correctif, puis restauré)
- [x] `blocking.test.ts` : 17 verts (12 pré-existants inchangés + 5 témoins sur
      le nouveau résolveur, dont la forme de requête SANS filtre `id`)
- [x] `MeeshySocketIOManager.test.ts` : 339 verts (337 pré-existants inchangés)
- [x] Suite gateway complète : 718 suites / 17588 tests verts
- [x] `prisma validate` : schéma valide avec le nouvel index
- [x] `tsc --noEmit` gateway : 0
- [x] Migration mongosh jumelle `011_user_blocked_user_ids_index.js`, enregistrée
      dans `run_migrations.sh` et le README

## Surfaces vérifiées correctes pendant ce cycle (ne pas re-vérifier)

- **Contrat d'ACK des 56 écouteurs `socket.on`** — chaque chemin de sortie
  répond, et le wrapper de `MeeshySocketIOManager` rattrape en plus tout `throw`
  par un `callback?.({ success: false })`. Les `return` nus détectés sont tous
  postérieurs à l'ACK.
- **`participantUserRooms` / `ROOMS.user(userId ?? id)`** — les 60+ sites
  d'appel sont conformes ; les seuls qui nomment `ROOMS.user()` avec un `User.id`
  brut sont des routes REST sous `requiredAuth`, où l'identité anonyme ne peut
  pas se présenter.
- **`_joinUserConversations`** — toutes les conversations sont rejointes à
  l'auth, avec retry et une escalade en `error` sur échec persistant. La
  présence diffusée aux rooms de conversation atteint donc bien la liste, qui
  est l'écran où les pastilles vivent.
- **Couverture du rejeu hors ligne** — les 11 `eventType` de
  `_drainedEventName` ont chacun un émetteur qui les enfile via
  `enqueueForOfflineParticipants`.

## Reste ouvert (inchangé depuis le cycle 23)

- **iOS n'écoute ni `message:hidden-for-me` ni `message:restored-for-me`.**
  Toujours non tenté : aucune toolchain Swift sous Linux. À reprendre depuis un
  runner macOS.

---

# Cycle 25 (2026-08-15) — le client choisissait l'ADRESSE de la diffusion

Passe suivante de la routine « amélioration continue temps réel ». Les cycles
21–22 ont pris `message:translation` par ses deux bouts, le 23 l'AUDIENCE de
`conversation:updated`, le 24 le COÛT de `user:status`. Ce cycle change encore de
famille — **les réactions sociales** (`comment:reaction-*`, `post:reaction-*`) —
et de question : non plus « qui reçoit / quelle forme / combien ça coûte », mais
**d'où vient l'ADRESSE de la diffusion, et qui a le droit de la choisir**.

**Conclusion : deux défauts réels trouvés, corrigés, testés.** Quatre sondes
rendues vides sont listées en fin de section pour qu'un prochain cycle ne les
ré-instruise pas.

## Méthode — la sonde « autorité de l'entrée »

Pour chaque `socket.on(...)` qui diffuse, deux questions DISTINCTES, là où les
audits précédents n'en posaient qu'une :

1. **Autorisation** — l'acteur a-t-il le droit d'agir sur la ressource nommée ?
   (balayée au cycle 24 par le contrat d'ACK, verte)
2. **Adresse** (neuve) — la ressource vers laquelle l'événement PART est-elle
   dérivée du serveur, ou reprise du payload client ?

La seconde est la bonne question parce que la première peut être verte pendant
que la seconde est rouge : c'est exactement ce qui s'est produit. Un handler qui
vérifie *« peux-tu réagir à CE commentaire ? »* puis diffuse vers *« le post que
tu m'as nommé »* a résolu deux entités différentes en croyant n'en résoudre
qu'une.

Matrice des handlers × primitive d'autorisation, puis relecture de chaque
diffusion :

| Handler | Autorisation | Adresse de diffusion |
|---|---|---|
| `ReactionHandler` | `resolveParticipantFromMessage` | `message.conversationId` (serveur) ✅ |
| `AttachmentReactionHandler` | `resolveParticipantFromMessage` + liaison PJ↔message | `service.resolveConversationId` (serveur) ✅ |
| `PostReactionHandler` add/remove | `resolveInteractionTarget` | `targetPostId` (serveur) ✅ |
| `PostReactionHandler` sync | **rien** ❌ | — |
| `CommentReactionHandler` add/remove | `loadCommentPostAcl` ✅ | **`validated.postId` (client)** ❌ |
| `CommentReactionHandler` sync | **rien** ❌ | — |

## D1 — l'adresse venait du client alors que la vérité était déjà en main

`CommentReactionHandler.handleAddReaction` / `handleRemoveReaction`

`loadCommentPostAcl(prisma, commentId)` rend `{ postId, post }` — le post du
COMMENTAIRE — et le handler l'appelle déjà, pour son verdict d'audience. Il
jetait le `postId` et gardait celui du payload pour les trois usages qui
comptent : la room (`io.to(ROOMS.post(validated.postId))`), le `postId` du
payload (`createUpdateEvent(..., validated.postId)`), et la notification.

**(a) Volet fonctionnel — les reposts.** Un repost simple n'a pas de vie sociale
propre : `handleJoinPost` redirige ses lecteurs vers la room de la RACINE
(`resolveConsumptionTarget`), et `routes/posts/comments.ts` écrit ses
commentaires sur cette même racine (`targetPostId`). Le client, lui, envoie l'id
de la carte AFFICHÉE — le repost (`StoryViewer.tsx` → `currentStoryId`,
`SocialSocketManager.reactToComment(postId:)`). Séquence :

```
Le fil du repost R (racine P) est ouvert chez Alice et Bob.
  join    → tous deux entrent dans post:P          (redirection)
  cache   → commentaires cachés sous la clé R      (id de la carte)
Alice réagit au commentaire C (C.postId = P).
  client  → comment:reaction-add { postId: R }
  gateway → ACL sur C : OK
          → io.to(post:R).emit(...)                ← room VIDE
  Bob     → ne reçoit rien, jamais
  Alice   → ACK success + UI optimiste : tout va bien de son côté
```

Silencieux des deux côtés : aucune erreur, aucun log, un ACK positif. Le retrait
est le pire sens des deux — les lecteurs gardent une réaction supprimée.

**(b) Volet intégrité.** `postId` est la CLÉ de cache client
(`patchCommentInPostCaches` web, `FeedPersistenceActor` iOS). Un `postId`
arbitraire — le payload n'était comparé à rien — écrivait l'agrégation d'un
commentaire dans le cache d'un post étranger, et divulguait au passage son
existence et son décompte à l'audience de ce post.

**Pourquoi ça a survécu.** La règle est implémentée DEUX fois et l'autre copie
est juste : `PostReactionHandler` porte `targetPostId` dans sa room ET son
payload depuis la tâche 9 du chantier reposts. Les deux rendent le même résultat
en nominal — les deux ids coïncident dès que le post n'est pas un repost — et ne
diffèrent que sur l'entrée que personne ne testait : celle où ils DIVERGENT.
Récidive exacte de la forme du cycle 24 (deux implémentations d'accord entre
elles, l'écart sur une propriété qu'aucune assertion ne regardait).

Pire : un **doublon de test figeait le défaut**. Le mock de
`src/socketio/handlers/__tests__/` déclarait `loadCommentPostAcl → postId:
'post-1'` pendant que l'assertion attendait `post:${POST_ID}` — soit exactement
le monde impossible où le commentaire vit sur un post et son événement part vers
un autre. Le mock a été aligné sur le monde nominal ; la divergence est couverte,
avec le vrai module d'ACL, par `src/__tests__/unit/socketio/`.

**Correctif.** `const postId = thread.postId` sur les deux chemins, utilisé pour
la room, le payload et la notification. Zéro requête ajoutée.

## D2 — la synchronisation des réactions n'avait aucune garde d'audience

`CommentReactionHandler.handleRequestSync`, `PostReactionHandler.handleRequestSync`

Les deux appelaient leur service juste après l'authentification et le
rate-limit. Aucune question d'audience. **La garde de la room ne bornait donc
rien** : au lieu de s'abonner aux événements, il suffisait d'en demander l'état.

Le versant commentaire est le plus net : `CommentReactionSync` porte les
`userIds` de chaque réacteur (`CommentReactionService.getCommentReactions`
agrège `userIds` par emoji). Un `commentId` suffisait à obtenir le **roster
nominatif** d'un commentaire porté par un post `PRIVATE` hors audience. Le
versant post ne rend que des décomptes (`getPostReactions` n'agrège pas
d'identités) — divulgation plus faible, même trou.

**Correctif.** Audience de **CONSOMMATION** (`canUserConsumePost` — amis ∪
contacts DM), la même que la lecture du fil et que `handleJoinPost`, jamais
celle d'INTERACTION : un contact DM non-ami lit légitimement le fil, le gater
sur les amis stricts en ferait un 404 que la lecture REST n'impose pas. Refus
indistinct (`Comment not found` / `Post not found`), pas de 403-oracle. Le
versant post hérite de la redirection des reposts simples — sans elle il rendait
un état qui n'est pas celui que la room diffuse ensuite.

## Gates

- [x] RED discriminants vus rouges avant correctif : 6 pour D1 (dont
      `post:507f…90ff` reçu là où `post:507f…9022` était attendu), 4 pour D2
- [x] 4 suites de réactions : 140 verts
- [x] Suite gateway complète : **719 suites / 17608 tests verts**
- [x] `tsc --noEmit` gateway : 0
- [x] CHANGELOG + ce journal

## Surfaces vérifiées correctes pendant ce cycle (ne pas re-vérifier)

- **Cycle de vie des rooms de conversation.** Les quatre chemins de sortie
  (`leave.ts`, `ban.ts`, `participants.ts` DELETE, `delete-for-me.ts`) font
  quitter `ROOMS.conversation` aux sockets vivants du partant ; les dix chemins
  d'entrée passent par `joinUserToConversationRoom`. Symétrie complète.
- **Autorisation des handlers conversationnels.** `ReactionHandler`,
  `AttachmentReactionHandler`, `LocationHandler`, `MessageHandler`,
  `StatusHandler` passent tous par `resolveParticipant{,FromMessage}`, qui
  re-vérifie `isActive` en base — un membre retiré/banni depuis son connect est
  rejeté. La liaison PJ↔message d'`AttachmentReactionHandler` ferme déjà l'IDOR
  jumeau du D1 sur son propre périmètre.
- **`handleJoinPost` / `handleLeavePost`.** Redirection `resolveConsumptionTarget`
  symétrique à l'entrée et à la sortie, exclusion éphémère comprise.
- **Adresse de diffusion des handlers de message.** Toutes dérivées du serveur
  (`message.conversationId`), aucune reprise de payload client.

## Reste ouvert (inchangé depuis le cycle 23)

- **iOS n'écoute ni `message:hidden-for-me` ni `message:restored-for-me`.**
  Toujours non tenté : aucune toolchain Swift sous Linux. À reprendre depuis un
  runner macOS.

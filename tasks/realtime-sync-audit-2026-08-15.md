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

# Cycle 25 (2026-08-15) — la file de rejeu hors ligne n'avait de borne que du côté qui ne sert jamais

Routine « amélioration continue temps réel ». Les cycles 21–23 avaient pris la
FORME et l'AUDIENCE des événements (`message:translation`,
`conversation:updated`) ; le cycle 24 a changé de question pour **en fonction de
quoi le coût d'une diffusion grandit**, et l'a trouvée dans la présence. Ce
cycle garde la question du coût mais change de FAMILLE : non plus la diffusion
vivante, mais son complément — la **file de rejeu hors ligne**, c'est-à-dire ce
qui se passe pour quelqu'un que la diffusion n'a pas pu atteindre.

## Méthode — quatre balayages, dont deux neufs

1. **`SERVER_EVENTS` × écouteurs clients** (neuf ; le cycle 24 avait fait le
   sens inverse, `CLIENT_EVENTS` × écouteurs gateway). Les 125 événements
   serveur croisés contre iOS (`socket.on("…")`), web (`SERVER_EVENTS.…` et
   littéraux) et la gateway. Résultat : rien à prendre, mais la carte est
   maintenant écrite (voir « Surfaces vérifiées »).
2. **Multi-appareil des préférences par-utilisateur** (pin/mute/archive/
   catégories/réorganisation). Déjà juste : `conversationPreferencesSync.ts` est
   un écrivain UNIQUE qui tient ensemble les trois obligations (persister,
   incrémenter `version`, diffuser).
3. **Couverture d'enfilement des 11 `eventType`** de `_drainedEventName` :
   chacun a bien au moins un appelant qui l'enfile (revérifié, inchangé depuis
   le cycle 24).
4. **Le coût d'une mise en FILE** — c'est là qu'était le défaut. Le cycle 24
   avait posé la question au chemin vivant ; personne ne l'avait posée au
   chemin hors ligne.

## Le défaut — une tranche plafonnée, sa jumelle sans borne, dans le même fichier

`RedisDeliveryQueue` a deux tranches :

- la **mémoire**, repli d'urgence quand Redis est injoignable, plafonnée depuis
  qu'elle existe : `MEMORY_QUEUE_MAX_USERS = 1000`,
  `MEMORY_QUEUE_MAX_PER_USER = 50`, avec une éviction qui prend soin de trancher
  par `enqueuedAt` et non par emplacement de tableau ;
- **Redis**, celle qui porte en réalité tous les arriérés, **sans aucune
  borne** : un `RPUSH` par événement, aucun `LTRIM`, pour seule limite le TTL de
  48 h.

Trois coûts grandissaient donc librement avec l'arriéré d'un seul absent, et le
premier n'est pas celui du stockage :

**1. Le coût d'une mise en file.** `ENQUEUE_DEDUP_LUA` lit la liste ENTIÈRE
(`LRANGE 0 -1`) et `cjson.decode` **chaque** entrée à **chaque** appel, pour
trouver l'entrée `(identité de dédup, eventType)` qu'il devra éventuellement
remplacer. Un script Lua s'exécute **atomiquement dans le thread unique de
Redis** : le coût de mettre en file un événement pour un absent était payé par
tous les autres clients de ce Redis, et il grandissait avec ce qui était déjà en
file pour cet absent. Remplir une file de N coûte O(N²) décodages de Redis
bloqué. Même forme que le défaut du cycle 24 — le coût d'une opération
dimensionné par l'état accumulé — mais sur une ressource pire, parce qu'elle est
mono-thread et partagée par toute la passerelle.

**2. La rafale de rejeu.** `_drainPendingMessages` émet chaque entrée drainée,
une par une : la reconnexion d'un absent de longue date devenait une boucle
d'émissions sans borne vers un téléphone qui vient tout juste de revenir.

**3. La mémoire Redis**, retenue 48 h.

**Pourquoi ça a survécu.** Les deux tranches sont deux moitiés du **même
fichier**, décrites par des commentaires voisins et longs. Une lecture qui les
compare voit deux stratégies de dédup cohérentes, deux évictions qui parlent
toutes deux d'`enqueuedAt`, deux replis symétriques. La seule propriété qui les
distinguait — **l'existence d'une borne** — n'était énoncée nulle part, ni dans
un commentaire ni dans un test.

## Le correctif

`DELIVERY_QUEUE_MAX_PER_USER = 500` (`packages/shared/types/delivery-queue.ts`),
appliqué par `LTRIM KEYS[1], -tonumber(ARGV[5]), -1` après chaque `RPUSH` :
la borne conserve les N arrivées les plus RÉCENTES. Elle borne les trois coûts
d'un seul geste — le balayage ne peut plus rien lire au-delà du plafond, le
rejeu ne peut plus le dépasser, l'arriéré stocké non plus.

Deuxième changement, et il **ne se déduit pas du premier** : le remplacement
d'une entrée mutable (`edited` / `deleted` / `reaction-*` / `translation`…) ne se
fait plus par `LSET` à son ancien emplacement, mais par `LREM` + `RPUSH` **en
queue**.

> Une entrée remplacée sur place porte l'horodatage le plus RÉCENT tout en
> occupant l'emplacement le plus ANCIEN. Un `LTRIM`, qui tranche par
> emplacement, aurait donc évincé précisément l'édition la plus fraîche et figé
> le destinataire sur un contenu périmé.

C'est exactement la divergence emplacement/`enqueuedAt` que la tranche mémoire
énonce déjà à sa propre éviction — la forme « en queue » la supprime à la source
en réalignant l'ordre des emplacements sur l'ordre d'arrivée. Les deux formes
sont **équivalentes pour le drain**, qui retrie par `enqueuedAt` de toute façon,
et l'unicité de la valeur par `(identité de dédup, eventType)` — l'invariant que
ce script maintient et sur lequel `PRUNE_STALE_LUA` s'appuie déjà — garantit que
`LREM … 1 entry` retire bien l'entrée visée. Le chemin de remplacement n'a pas
besoin de `LTRIM` : il retire une entrée et en pousse une, la longueur ne bouge
pas.

Les deux plafonds restent volontairement de tailles différentes, et le fichier le
dit maintenant : celui de la mémoire borne le **tas de la passerelle** sur 1000
users à la fois pendant une panne Redis ; celui de Redis borne le **CPU Redis**,
sa mémoire et la rafale de reconnexion.

**Aucun changement client.** La forme des événements rejoués et leur ordre sont
inchangés.

## Limite de vérification, énoncée

Le dépôt n'a **aucun double Redis capable d'exécuter du Lua** (`makeMockRedis`
bouchonne `eval`), donc le comportement de la tranche Redis n'est pas
observable depuis TypeScript. Les témoins portent sur les deux surfaces qui le
sont — les arguments que le script reçoit, et le texte du script lui-même — et
c'est dit explicitement en tête du `describe`. Ce sont de vrais contrats (le
plafond doit atteindre le script ; le script doit borner la liste avec), mais
ce ne sont pas des témoins de comportement. La tranche mémoire, elle, garde ses
témoins comportementaux d'origine.

## Gates

- [x] 3 RED discriminants vus rouges avant correctif — les témoins de contrat du
      script échouent contre le Lua d'origine (vérifié en restaurant
      `LSET` + absence de `LTRIM`, puis restauré)
- [x] `RedisDeliveryQueue.test.ts` : 90 verts (86 pré-existants + 4 témoins)
- [x] Suite gateway complète : 719 suites / 17601 tests verts
- [x] Suite `packages/shared` : 54 fichiers / 1542 tests verts
- [x] `tsc --noEmit` gateway : 0
- [x] CHANGELOG + journal d'audit (§ Cycle 25)

## Surfaces vérifiées correctes pendant ce cycle (ne pas re-vérifier)

- **`SERVER_EVENTS` (125) × écouteurs clients.** Aucun événement émis par la
  gateway n'est orphelin des DEUX clients, à une exception documentée et
  volontaire : `message:read-status-updated`, dual-émis depuis le 2026-07-05 en
  parallèle du legacy `read-status:updated` que web (`presence.service.ts`) et
  iOS (`MessageSocketManager`) écoutent tous deux — période de coexistence de
  ~3 mois non écoulée (`tasks/socketio-events-cleanup.md` §3). Trois
  déclarations sans émetteur NI écouteur : `call:translation-requested`,
  `call:translation-enabled`, `call:transcription-result`. Asymétries connues et
  hors périmètre gateway : `attachment:reaction-*` et `location:live-*` (iOS
  seulement), `friend-request:*`, `message:hidden-for-me` /
  `message:restored-for-me` (web seulement).
- **Le `_seq` du SyncEngine est en lockstep.** La gateway n'estampille QUE
  `notification:new` (deux sites, tous deux dans `NotificationService`), et les
  deux clients n'observent `_seq` que sur cet événement (iOS
  `SyncSeqTracker.observe`, web `observeSyncSeq`). Le sous-ensemble observé
  égale l'ensemble estampillé, donc aucun faux trou.
- **Préférences par-conversation multi-appareil.** `conversationPreferencesSync.ts`
  est l'écrivain unique : il persiste, incrémente `version` et diffuse
  `USER_PREFERENCES_UPDATED` dans la même fonction. Les routes PUT/DELETE/
  reorder et les trois routes de `user-deletions.ts` passent toutes par lui.
- **Les 11 `eventType` de `_drainedEventName`** ont chacun au moins un appelant
  qui les enfile (revérifié par balayage de `eventType: '…'`).

## Reste ouvert (inchangé depuis le cycle 23)

- **iOS n'écoute ni `message:hidden-for-me` ni `message:restored-for-me`.**
  Toujours non tenté : aucune toolchain Swift sous Linux. À reprendre depuis un
  runner macOS.
- **Aucun double Redis Lua-capable.** Tant qu'il n'y en a pas, toute évolution
  de `ENQUEUE_DEDUP_LUA` / `DRAIN_LUA` / `PRUNE_STALE_LUA` reste vérifiable
  seulement par contrat. Un `ioredis-mock` avec support `eval`, ou un service
  Redis en CI, rendrait ces trois scripts testables comportementalement.

# Cycle 26 (2026-08-15) — le rejeu hors ligne livrait le contenu des conversations quittées pendant l'absence

Routine « amélioration continue temps réel », enchaînée sur le cycle 25 (mergé).
Les cycles 21–23 avaient pris la FORME et l'AUDIENCE des événements, les cycles
24–25 leur COÛT (diffusion vivante, puis file de rejeu). Ce cycle garde la file
de rejeu comme terrain mais change de question : non plus « combien ça coûte »
mais **« contre quelle autorité, et à quel INSTANT, l'audience de la file est-elle
décidée ? »**.

## Méthode — quatre balayages, un seul productif

1. **Fenêtre connexion/déconnexion autour de `connectedUsers`** (neuf). Le
   prédicat d'enfilement est `connectedUsers.has(key)` ; il répond « connecté »,
   alors que la question utile est « le room emit vivant l'atteindra-t-il ? ».
   Les deux divergent dans la fenêtre entre l'inscription au registre et la
   jonction aux rooms. **Déjà juste, et documenté** : les deux chemins d'auth
   (`_authenticateJWTUser`, `_authenticateAnonymousUser`) joignent les rooms
   AVANT `_registerUser`, avec le commentaire qui nomme exactement ce risque.
   Côté déconnexion, le chemin inscrit atteint `connectedUsers.delete` sans
   aucun `await` intermédiaire ; seul le chemin ANONYME en-appel traverse des
   `await` Prisma avant la suppression — fenêtre réelle mais étroite, notée, non
   livrée (voir « Constats latents »).
2. **Adhésion tardive à une room** (`joinUserToConversationRoom`). 10 sites
   d'appel couvrent l'ajout de membre, l'invitation, le lien partagé, le
   débannissement, l'amitié, les devices. Rien à prendre.
3. **Contrôle d'appartenance de `conversation:join`.** Le chemin inscrit
   vérifie `bannedAt`, `leftAt` ET `isActive === false` ; le chemin anonyme
   vérifie `isActive: true`, ce qui suffit puisque `resolveBanWrite` écrit
   toujours `isActive: false`. Rien à prendre (seul l'intitulé de la raison
   renvoyée diffère : `not_a_member` au lieu de `banned`).
4. **Le canal DIFFÉRÉ face aux fins d'appartenance** — c'est là qu'était le
   défaut. Les trois balayages précédents avaient tous porté sur le canal
   VIVANT ; personne n'avait posé la même question à son complément.

## Le défaut — quatre routes ferment le canal vivant, aucune n'atteint le différé

Quatre routes mettent fin à une appartenance, et toutes les quatre font
visiblement, avec commentaire, le geste d'éviction :

| route | transition | éviction de `conversation:<id>` |
|---|---|---|
| `leave.ts` | départ volontaire | ✅ |
| `participants.ts` | retrait par un admin | ✅ |
| `ban.ts` | bannissement | ✅ |
| `delete-for-me.ts` | suppression pour soi | ✅ |

Aucune ne touche `RedisDeliveryQueue`, qui garde jusqu'à 48 h d'événements de
cette même conversation — messages, éditions, réactions, traductions — et les
rejouait INTÉGRALEMENT à la reconnexion suivante. La classe n'a d'ailleurs
aucune méthode capable de le faire (`enqueue` / `drain` / `peek` / `size` /
`cleanup` ; `cleanup` est purement TTL), et `_drainPendingMessages` n'a jamais
porté le moindre contrôle d'appartenance.

**La conjonction n'a rien d'exotique — c'est le cas courant.** On retire d'un
groupe quelqu'un qui n'est pas là : absent quand les messages s'enfilent,
toujours absent quand son appartenance prend fin, il reçoit à son retour
l'arriéré complet d'une conversation dont `GET /conversations` ne lui sert plus
la ligne.

Deux conséquences distinctes :

1. **Autorisation** — du contenu livré APRÈS la fin de l'autorisation qui le
   justifiait.
2. **Cohérence de la liste** — une conversation ressuscitée dans une liste dont
   ces mêmes routes viennent de la retirer, les clients appliquant `message:new`
   à leur store local.

**La cause est une confusion de temps.** L'audience de la file est décidée à la
MISE EN FILE, par `enqueueForOfflineParticipants`, sur l'appartenance de cet
instant-là. Entre l'enfilement et la LIVRAISON il y a précisément l'absence —
c'est-à-dire la fenêtre pendant laquelle on quitte un groupe.

## Le correctif — relire l'autorité au dernier instant possible

`_dropEndedMemberships(userId, isAnonymous, drained)`, appelé par
`_drainPendingMessages` entre le `drain()` et la première émission. Une entrée
dont l'appartenance a pris fin n'est pas rejouée, et ne compte dans **aucun**
des trois signaux :

- l'émission elle-même ;
- `pending-messages:delivered`, dont `count` et `conversationIds` ne portent
  plus que le rejoué ;
- l'accusé de réception — qui affirme « ce message est arrivé chez son
  destinataire », et mentirait à son auteur s'il était affirmé d'un message
  qu'on vient justement de refuser de livrer.

Quand tout est écarté, **plus rien n'est émis** — pas même un
`pending-messages:delivered` à zéro, qui ferait boucler un client s'en servant
pour déclencher une réconciliation.

**Une garde unique, pas quatre purges.** Purger la file depuis chaque route
aurait ajouté une CINQUIÈME copie d'une obligation à une famille qui en comptait
déjà quatre — la dérive exacte que `enqueueForOfflineParticipants` documente en
tête de fichier après cinq réimplémentations. Lire l'autorité à la LIVRAISON la
rend valable pour les quatre routes et pour toute transition future, sans
qu'aucune ait à s'en souvenir, et supprime la course résiduelle (un enfilement
en vol juste après une purge).

**Échec OUVERT sur une panne, FERMÉ sur une réponse.** Le drain est destructif :
les entrées ont déjà quitté la file quand la garde s'exécute. Une réponse « plus
membre » fait autorité et l'entrée est jetée. Une absence de réponse n'autorise
rien à conclure — jeter l'arriéré parce que la base n'a pas répondu échangerait
une fuite rare (panne ET retrait ET arriéré simultanés) contre une perte de
données probable, une tempête de reconnexions étant exactement le moment où la
base est sous pression. L'état d'avant le correctif était de toute façon ouvert
à 100 % : la garde ne peut donc que réduire la surface, jamais l'élargir.

**`bannedAt` filtré en JS, pas dans le `where`.** Sous MongoDB un
`bannedAt: null` ne matche pas les documents où le champ est ABSENT (jamais
écrit) et exclurait les lignes historiques — le piège que `ban.ts` documente
déjà pour `leftAt` (audit C5). La clé de lecture suit la convention
d'enfilement (`userId` pour un inscrit, `Participant.id` pour un invité de lien
partagé), et la requête est bornée aux seules conversations effectivement
drainées.

**Aucun changement client** : la forme et l'ordre des événements rejoués sont
inchangés, seule leur audience l'est.

## Pourquoi ça a survécu

Les quatre routes font toutes, visiblement et avec commentaire, le geste
d'éviction. Une lecture qui les compare voit **quatre fermetures cohérentes du
canal vivant** — et repart rassurée. Rien, nulle part, ne nommait le canal
DIFFÉRÉ qu'aucune des quatre n'atteignait : ni un commentaire, ni un test, ni
une méthode sur `RedisDeliveryQueue` qu'on aurait pu constater inutilisée. Le
silence d'une capacité ABSENTE est plus difficile à voir que celui d'une
capacité présente et non appelée.

## Constats latents — relevés, NON livrés, avec leur raison

1. **Fenêtre de déconnexion anonyme.** `AuthHandler.handleDisconnection`
   traverse des `await` Prisma (recherche des participations d'appel actives,
   `leaveCall` en boucle) AVANT `connectedUsers.delete`. Pendant ces quelques
   dizaines de ms, la socket a déjà quitté ses rooms (Socket.IO les vide avant
   `disconnect`) mais le registre dit encore « connecté » : un événement émis
   dans cette fenêtre n'atteint ni la room ni la file. Étroit, et propre au
   participant ANONYME en appel. Non livré ce cycle pour ne pas mêler une
   réorganisation de la séquence de déconnexion d'appel à un correctif
   d'autorisation.
2. **`conversation:any`.** Chaque socket JWT rejoint cette room à
   l'authentification ; **aucun émetteur du dépôt ne l'adresse** (balayage
   gateway + web + iOS + Android : une seule occurrence, le `join` lui-même).
   Entrée d'adaptateur par socket, sans lecteur. Retrait trivial mais hors sujet
   de ce cycle.
3. **Dilution de la file par des entrées mortes.** Le plafond
   `DELIVERY_QUEUE_MAX_PER_USER` (500, cycle 25) tranche par arrivée : des
   entrées devenues indélivrables peuvent évincer des entrées délivrables avant
   que la garde ne les écarte. Une purge à l'éviction supprimerait ce
   second-ordre — mais c'est une optimisation de ressource, pas une correction
   d'autorisation, et elle rouvrirait la question des quatre copies. Le TTL de
   48 h la borne déjà.

## Surfaces vérifiées correctes — ne pas ré-instruire

- Ordre jonction-des-rooms / inscription au registre sur les DEUX chemins
  d'auth (§ balayage 1).
- Les 10 sites d'appel de `joinUserToConversationRoom` (§ balayage 2).
- Le contrôle d'appartenance de `conversation:join`, chemins inscrit et anonyme
  (§ balayage 3).
- Le cache `(userId, conversationId) → participantId` de `MessageHandler` :
  positif uniquement (aucune entrée négative, donc aucun blocage persistant
  après une adhésion), invalidé par les cinq routes qui mutent l'appartenance.

## Gates

- [x] 8 RED discriminants vus rouges avant correctif (9e témoin : échec ouvert
      sur panne, vert des deux côtés par construction — il interdit qu'un
      durcissement ultérieur transforme la garde en perte de données)
- [x] `MeeshySocketIOManager.test.ts` : 348/348 verts
- [x] Suite gateway complète : **719 suites / 17612 tests verts**
      (cycle 25 : 719 / 17601 — +11)
- [x] `tsc --noEmit` gateway : 0 erreur
- [x] CHANGELOG + journal d'audit (§ Cycle 26) + `lessons.md` (Leçon 258)

## Note de méthode — deux témoins voisins ré-outillés

Deux témoins pré-existants utilisaient `prisma.participant.findMany` comme
sonde d'un chemin qui n'avait qu'un appelant, et qui en a maintenant deux. Leur
COMPORTEMENT asserté est inchangé ; seule leur sonde a été rendue
discriminante — la lecture d'appartenance est la seule des deux à demander
`select.bannedAt`. C'est le pendant du corollaire de la Leçon 255 : un test qui
prouve « rien ne s'est passé » par l'absence d'appel à un mock partagé cesse de
prouver quoi que ce soit dès qu'un second appelant partage ce mock.

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

## Candidat pour le cycle suivant — `DELETE /posts/:postId/comments/:commentId`

Troisième instance PROBABLE de la même classe, **délibérément non traitée dans
cette passe** parce qu'elle n'est pas gratuite, contrairement à D1 et D1 bis.

La route soft-supprime par `commentId` (le service vérifie la propriété du
commentaire), puis relit le post par le `:postId` de l'URL et s'en sert pour
TROIS choses : le `postId` du broadcast, le `commentCount` annoncé, et surtout
**l'audience du fan-out** (`post.authorId`, `post.visibility`,
`post.visibilityUserIds` passés à `broadcastCommentDeleted`). Rien ne vérifie
que ce post est celui du commentaire.

Conséquence attendue : l'audience d'une suppression est dérivée d'un post que
l'appelant choisit — et sur un repost simple, le cas non-malveillant, la
suppression est annoncée à une room où les lecteurs du fil ne sont pas.

**Pourquoi ce n'est pas le même correctif à une ligne près.**
`PostCommentService.deleteComment` rend `{ success, deletedCommentIds,
parentId }` — **pas** `postId`. La vérité n'est donc PAS en scope, à la
différence de D1/D1 bis où `thread.postId` était déjà chargé. La corriger
demande soit une lecture supplémentaire, soit d'élargir le retour du service ; et
le chemin de **rejeu idempotent** (`onDuplicate` ne rend qu'un `{ id }`) n'a
aucune ligne vivante à relire, donc il faut lui écrire un repli explicite plutôt
que de laisser `undefined` adresser la diffusion. Trois décisions à prendre, pas
un renommage : ça mérite sa propre passe, avec ses propres témoins.

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
# Cycle 26 (2026-08-15) — le client choisissait l'ADRESSE de la diffusion

Passe suivante de la routine « amélioration continue temps réel ». Les cycles
21–22 ont pris `message:translation` par ses deux bouts, le 23 l'AUDIENCE de
`conversation:updated`, le 24 le COÛT de `user:status`, le 25 celui de la file
de rejeu hors ligne. Ce cycle change encore de famille — **les réactions
sociales** (`comment:reaction-*`, `post:reaction-*`) — et de question : non plus
« qui reçoit / quelle forme / combien ça coûte », mais **d'où vient l'ADRESSE de
la diffusion, et qui a le droit de la choisir**.

(Numéroté 26 après coup : le cycle 25 — la borne de `RedisDeliveryQueue`, PR
#3021 — a atterri sur `main` pendant cette passe, qui a été rebasée dessus.)

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

## D1 bis — le MÊME défaut sur le jumeau REST

`POST /posts/:postId/comments/:commentId/like` (`routes/posts/comments.ts`)

Trouvé en balayant les autres émetteurs de la même famille, après D1. Identique
trait pour trait, sur l'autre transport : la route résout l'audience depuis le
commentaire (`loadCommentPostAcl`, et son commentaire dit même « le post est
résolu depuis le commentaire, **jamais** depuis le `:postId` du chemin »), puis
diffuse et notifie avec `request.params.postId`.

La garde tenait donc la promesse écrite ; la DIFFUSION ne la tenait pas — et
comme pour D1, la vérité (`thread.postId`) était déjà en scope, à quinze lignes.

Même correctif : `const commentPostId = thread.postId`, utilisé par
`broadcastCommentLiked` et par la relecture de `post.type` qui type la
notification (le discriminant qui décide de la surface ouverte au tap).

**Ce que ça confirme.** La sonde ne devait pas s'arrêter au handler qui l'avait
déclenchée : un invariant d'adressage se viole partout où le même fait est servi
par plusieurs transports. Le canal socket et le canal REST du même geste
produisent tous deux `comment:reaction-*` / `comment:liked` vers
`ROOMS.post(...)` ; il fallait les corriger tous les deux ou aucun.

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
      `post:507f…90ff` reçu là où `post:507f…9022` était attendu), 2 pour D1 bis,
      4 pour D2
- [x] 4 suites de réactions : 140 verts
- [x] Suite gateway complète : **719 suites / 17614 tests verts**
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
- **Aucun double Redis Lua-capable.** Tant qu'il n'y en a pas, toute évolution
  de `ENQUEUE_DEDUP_LUA` / `DRAIN_LUA` / `PRUNE_STALE_LUA` reste vérifiable
  seulement par contrat. Un `ioredis-mock` avec support `eval`, ou un service
  Redis en CI, rendrait ces trois scripts testables comportementalement.

# Cycle 27 (2026-08-15) — le rejeu hors ligne livrait le contenu des conversations quittées pendant l'absence

Routine « amélioration continue temps réel », enchaînée sur le cycle 25 (mergé).
Le cycle 26 a été pris entre-temps par une session parallèle (PR #3023, l'adresse
de diffusion des réactions de commentaire) : ce cycle prend donc le numéro 27.
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
- [x] CHANGELOG + journal d'audit (§ Cycle 27) + `lessons.md` (Leçon 259)

## Note de méthode — deux témoins voisins ré-outillés

Deux témoins pré-existants utilisaient `prisma.participant.findMany` comme
sonde d'un chemin qui n'avait qu'un appelant, et qui en a maintenant deux. Leur
COMPORTEMENT asserté est inchangé ; seule leur sonde a été rendue
discriminante — la lecture d'appartenance est la seule des deux à demander
`select.bannedAt`. C'est le pendant du corollaire de la Leçon 255 : un test qui
prouve « rien ne s'est passé » par l'absence d'appel à un mock partagé cesse de
prouver quoi que ce soit dès qu'un second appelant partage ce mock.
---

# Cycle 28 (2026-08-15) — l'entrée du client ne fixait pas que l'adresse, mais l'AUDIENCE

Passe suivante de la routine « amélioration continue temps réel ». Ce cycle ne
change pas de question : il **prend délibérément le candidat que le cycle 26
avait consigné avec sa preuve** plutôt que de le redécouvrir par le symptôme —
`DELETE /posts/:postId/comments/:commentId`, troisième instance de la classe
« autorité de l'entrée », laissée de côté parce qu'elle n'était pas gratuite.

**Conclusion : le défaut est réel, corrigé, testé. La famille des commentaires
est désormais CLOSE** — les six chemins du fil dérivent leur adresse du serveur.

## Ce que le cycle 26 avait laissé à décider

Trois points, tous tranchés ici :

| Question ouverte | Décision |
|---|---|
| La vérité n'est pas en scope (`deleteComment` ne rend pas `postId`) | Élargir le RETOUR du service — il tient déjà `comment.postId` pour décrémenter `commentCount`. Zéro requête ajoutée. |
| Le rejeu idempotent (`onDuplicate → { id }`) n'a aucune ligne vivante à relire | La ligne **survit** au soft-delete : `deletedAt` la marque, ne l'efface pas. `postId` est donc relisible ; le sous-arbre, masqué par `NOT_DELETED`, ne l'est pas. Repli explicite. |
| Que faire si aucune adresse serveur n'est dérivable | **Ne rien annoncer.** Se taire et diffuser-à-tort laissent tous deux la ligne à l'écran ; seul le second pollue un fil étranger. |

## Le défaut — trois décisions prises par un paramètre d'URL

La route supprime par `commentId` seul (le service vérifie la propriété du
commentaire — l'autorisation, elle, était juste), puis relisait un post par le
`:postId` du CHEMIN et s'en servait pour :

1. `postId` du payload — la **clé de cache** client (`patchCommentInPostCaches`
   web, `FeedPersistenceActor` iOS) ;
2. `commentCount` — un compteur lu sur un post que la suppression n'a pas
   décrémenté ;
3. `authorId` / `visibility` / `visibilityUserIds` — passés à
   `broadcastCommentDeleted`, donc **la liste de diffusion elle-même**
   (`getVisibilityFilteredRecipients` + `commentBroadcastRooms`).

**C'est en quoi ce site est PIRE que D1 du cycle 26.** Là-bas, l'entrée client
nommait une room : l'événement partait au mauvais endroit. Ici la même valeur
CALCULE l'audience — l'appelant ne choisissait pas seulement *où*, mais *à qui*,
en nommant un post dont l'ACL lui convenait.

**Volet fonctionnel — les reposts, le cas non-malveillant.** Un repost simple
n'a pas de fil propre : `resolveInteractionTarget` écrit ses commentaires sur la
RACINE, et `handleJoinPost` y redirige ses lecteurs. Le client, lui, envoie l'id
de la carte AFFICHÉE.

```
Le fil du repost R (racine P) est ouvert chez Alice et Bob.
  join     → tous deux entrent dans post:P        (redirection)
Alice supprime son commentaire C (C.postId = P).
  route    → DELETE /posts/R/comments/C
           → service : soft-delete C + descendants, P.commentCount--
           → post lu par R, broadcast vers post:R  ← room VIDE
  Bob      → garde la ligne supprimée à l'écran, définitivement
```

Aucun refetch ne l'en débarrasse : `getComments` filtre `parentId: null`, donc
un sous-arbre supprimé ne revient par aucune lecture. Muet des deux côtés —
200 OK, UI optimiste correcte chez Alice.

**Volet intégrité.** Le `:postId` n'était comparé à rien : l'audience d'un post
PUBLIC arbitraire recevait la suppression d'un commentaire vivant sur un post
`PRIVATE`, avec le `commentCount` du post nommé — soit l'écriture d'un compteur
faux dans le cache d'un fil étranger.

## Correctif

- `PostCommentService.deleteComment` rend `postId: comment.postId` — la ligne
  est déjà chargée et sert deux lignes plus haut au décrément. Zéro requête.
- La route dérive `commentPostId` du RÉSULTAT : lecture d'ACL, payload,
  `commentCount` et audience du fan-out en découlent tous.
- `onDuplicate` relit `postComment.findUnique({ id }, select: { postId })` — la
  ligne soft-supprimée porte encore son post.
- Adresse absente ⇒ **aucune diffusion** (repli explicite, jamais `undefined`).
- Le `:postId` du chemin n'est plus lu du tout par ce handler.

## Sondes rendues vides — la famille des commentaires est close

Balayage des SIX chemins du fil, après le correctif (méthode du cycle 26 : ne
jamais s'arrêter au site qui a déclenché la sonde) :

| Chemin | Adresse / audience | Verdict |
|---|---|---|
| `GET /posts/:postId/comments/:commentId/replies` | `loadCommentPostAcl(commentId)` | ✅ (porte même la règle en commentaire) |
| `POST /posts/:postId/comments` | `resolveInteractionTarget` → `targetPostId` | ✅ |
| `PATCH …/comments/:commentId` | `comment.postId` (résultat du service) | ✅ — le jumeau CORRECT du défaut |
| `POST …/comments/:commentId/translate` | `loadCommentPostAcl(commentId)` | ✅ |
| `POST` / `DELETE …/comments/:commentId/like` | `thread.postId` | ✅ (corrigé au cycle 26, D1 bis) |
| `DELETE …/comments/:commentId` | `:postId` du chemin | ❌ **ce cycle** |

Un seul des six divergeait. Vérifié aussi, vert : `PostTranslationService`
diffuse `comment:translation-updated` depuis `comment.postId` (l. 439–450), et
`admin/agent.ts` est le seul autre couple d'ids d'URL du service — hors famille.

**Corollaire de doublon, récidive exacte du cycle 26.** Le mock de
`comments.test.ts` déclarait `deleteComment → { postId: 'post-001' }` pendant
que les assertions attendaient `postId: POST_ID` (`507f…9022`) : le monde
impossible où le commentaire vit sur un post et son annonce part vers un autre,
promu au rang de spécification. Doubles réalignés sur un monde possible ; les
cas où les deux ids DIVERGENT sont désormais déclarés explicitement, un par un.

## Gates

- [x] 6 RED discriminants vus rouges avant correctif (1 contrat de service,
      3 adresse/audience/compteur, 2 rejeu)
- [x] Suites voisines : 21 suites / 793 tests verts
- [x] Suite gateway complète : **719 suites / 17620 tests verts** (17614 au
      cycle 26 — exactement les 6 témoins neufs, aucune suite déplacée) ;
      **17629 après merge manuel de `main`**, le cycle 27 parallèle en ayant
      apporté 9 de plus
- [x] `tsc --noEmit` gateway : 0
- [x] CHANGELOG + ce journal + leçon 259

## Reste ouvert (inchangé depuis le cycle 23)

- **iOS n'écoute ni `message:hidden-for-me` ni `message:restored-for-me`.**
  Aucune toolchain Swift sous Linux. À reprendre depuis un runner macOS.
- **Aucun double Redis Lua-capable** pour `ENQUEUE_DEDUP_LUA` / `DRAIN_LUA` /
  `PRUNE_STALE_LUA`.

## Candidat pour le cycle suivant

La classe « autorité de l'entrée » est épuisée sur les posts/commentaires. La
question NEUVE à porter au cycle 29, jamais posée par les cycles 21–28 : **le
MOMENT de la diffusion par rapport à la durabilité du fait** — un événement émis
avant que son écriture ne soit committée laisse les clients tenir un fait que le
serveur peut encore nier, et rien ne le rétracte. Recenser les émetteurs qui
diffusent depuis l'intérieur d'une transaction, ou avant le `await` qui persiste.

> Cette sonde a été portée par le **cycle 30**, pas 29 : une session parallèle a
> pris le numéro 29 entre-temps (PR #3029).


# Cycle 29 (2026-08-15) — la déconnexion d'un invité anonyme ouvrait une fenêtre de perte sèche

Routine « amélioration continue temps réel », enchaînée sur le cycle 27 (mergé,
PR #3024 ; le numéro 28 a été pris entre-temps par une session parallèle, PR #3027). Ce cycle **encaisse un constat latent du précédent** plutôt que d'en
ouvrir un nouveau : le cycle 27 avait relevé cette fenêtre au § « Constats
latents » et l'avait explicitement NON livrée, pour ne pas mêler une
réorganisation de la séquence de déconnexion d'appel à un correctif
d'autorisation. Ce motif de report ayant disparu avec le merge, la dette est
prise ici.

## Le défaut — la garde jumelle existait, sur l'autre chemin

Le chemin de CONNEXION porte déjà la garde, écrite noir sur blanc dans
`_authenticateJWTUser` : joindre les rooms **avant** d'inscrire le socket dans
`connectedUsers`, parce que la livraison est gatée uniquement sur
`connectedUsers.has(clé)`. Un destinataire qui « paraît en ligne » sans être
dans la room perd l'événement des DEUX côtés à la fois :

- écarté de la file hors ligne, puisqu'il a l'air joignable ;
- absent de la diffusion de room, puisqu'il ne l'est pas.

À la déconnexion, l'ordre doit être inverse — **désinscrire d'abord** — et il ne
l'était pas.

`handleDisconnection` est branché sur `disconnect`, que Socket.IO émet **après**
avoir vidé les rooms du socket. Le manager l'énonce lui-même, à trois lignes de
là, sur son écouteur `disconnecting` voisin : « la diffusion vise les rooms de la
conversation, et `disconnect` s'exécute après en être sorti. » Tout `await` placé
entre cette sortie et le `connectedUsers.delete` est donc une fenêtre de perte
sèche — pas un retard, une perte : rien ne rejoue ce qui n'a été ni diffusé ni
mis en file.

| chemin | `await` avant la désinscription | fenêtre |
|---|---|---|
| inscrit (JWT) | aucun | nulle — **sûr par accident** |
| anonyme | ≥ 1 à CHAQUE déconnexion | réelle |

Le chemin anonyme traverse au moins un `await` à **chaque** déconnexion
d'invité : la recherche des participations d'appel actives s'exécute
inconditionnellement dans le bloc `if (isAnonymous)`, **pas seulement quand un
appel est en cours**, et la boucle de `leaveCall` qui la suit peut en ajouter
plusieurs.

**La fenêtre s'élargit sous charge.** Sa durée est celle d'un aller-retour
Prisma, donc elle croît avec la profondeur de la file d'attente de la base —
c'est-à-dire au moment exact où une rafale de déconnexions (redémarrage de
passerelle, coupure réseau) rend la perte à la fois la plus probable et la plus
massive. Même forme que les cycles 24 et 25 : un coût dimensionné par l'état
accumulé, qui se paie quand tout va déjà mal.

## Le correctif

`this.connectedUsers.delete(userIdOrToken)` remonte avant le bloc de nettoyage
d'appel — synchrone, aligné sur ce que le chemin inscrit obtenait déjà sans le
dire.

La garde anti-clobber qui suit (« une reconnexion a-t-elle atterri pendant le
nettoyage ? ») **garde tout son sens et en gagne en exactitude** : elle ne
gouverne plus que l'écriture « hors ligne » en base et sa diffusion. Et comme la
désinscription a désormais lieu AVANT le nettoyage, une reconnexion qui atterrit
entre les deux s'est réinscrite elle-même — il n'y a plus de suppression
séquencée après l'écriture plus fraîche de quelqu'un d'autre, ce que l'ordre
précédent rendait structurellement possible.

Vérifié avant de déplacer : `CallEventsHandler` ne lit `connectedUsers` nulle
part, donc rien dans le bloc awaité ne dépend de l'inscription qu'on retire.

**Aucun changement client.**

## Pourquoi ça a survécu

Parce que la garde jumelle EXISTE et qu'elle est documentée — sur le chemin
qu'on relit naturellement, celui de l'entrée. Une lecture qui cherche « cette
garde est-elle présente ? » la trouve, et s'arrête. Personne n'avait posé au
chemin de SORTIE la question que le chemin d'ENTRÉE avait déjà résolue.

## Gates

- [x] 1 RED discriminant vu rouge avant correctif — un témoin qui observe
      `connectedUsers` **depuis l'intérieur** du nettoyage awaité (la seule
      position d'où la fenêtre est visible ; l'observer après coup ne montre
      rien, l'état final étant correct des deux côtés)
- [x] 1 témoin de non-régression sur la garde anti-clobber (vert des deux
      côtés) — il interdit que la remontée la coûte
- [x] `AuthHandler.test.ts` (les deux suites) : 75/75 verts
- [x] Suite gateway complète : **719 suites / 17625 tests verts** avant le merge
      de main (cycle 27 : 719 / 17623 — +2) ; **720 suites / 17643 tests verts**
      après le merge manuel de `origin/main` (le cycle 28 d'une session
      parallèle, PR #3027, ajoute une suite et ses témoins)
- [x] `tsc --noEmit` gateway : 0 erreur
- [x] CHANGELOG + journal d'audit (§ Cycle 29) + `lessons.md` (Leçon 261)

## Constats latents — report du cycle 27, toujours non livrés

1. **`conversation:any`** — chaque socket JWT rejoint cette room ; balayage
   repo-wide (gateway + web + iOS + Android, toutes extensions) : **deux
   occurrences en tout, le `join` et son log d'échec.** Aucun émetteur. Retrait
   trivial, gardé pour un cycle qui touchera déjà `AuthHandler`.
2. **Dilution de la file par des entrées mortes** — inchangé depuis le cycle 27 ;
   le TTL de 48 h la borne déjà.
3. **`next/font/google` résout au BUILD** — chaque build CI dépend de
   l'accessibilité de `fonts.gstatic.com`. Observé rouge une fois sur la PR
   #3024, vert au rejeu. Fragilité réelle de la CI, hors du domaine temps réel.
---

# Cycle 30 (2026-08-15) — le MOMENT de la diffusion par rapport à la durabilité du fait

Routine « amélioration continue temps réel », enchaînée sur le cycle 28 (mergé,
PR #3027). Numéroté 30 et non 29 : une session parallèle a pris le 29 pendant
cette passe (PR #3029, la fenêtre de perte sèche de l'invité anonyme) — les deux
passes coexistent sans conflit résiduel, seuls trois fichiers de journal se
touchaient et les deux contributions y sont conservées.

Sonde annoncée en clôture du cycle 28 : **un événement émis avant que son
écriture ne soit committée laisse les clients tenir un fait que le serveur peut
encore nier, et rien ne le rétracte.** Recenser les émetteurs qui diffusent
depuis l'intérieur d'une transaction, ou avant l'`await` qui persiste.

## Sondes rendues vides — la classe « annoncer avant d'écrire » est propre

| Sous-classe | Méthode | Verdict |
|---|---|---|
| Émission DANS un callback `$transaction` | balayage par appariement d'accolades des 35 blocs `$transaction` de la gateway, prédicat `emit\|broadcast\|to(ROOMS\|notify\|publish` | **0 site** |
| Émission AVANT l'`await` qui persiste | balayage de tout `src/`, tout `.emit(` suivi d'une écriture Prisma dans les 25 lignes | 1 candidat, **faux positif** (`NotificationService.markAsRead` : l'écriture repérée appartient à `markAllAsRead`, la voisine) |
| Écriture Prisma détachée (`void` / sans `await`) sous une émission | balayage des écritures non attendues | 12 sites, **tous** dans `StatusService` / caches — aucun ne porte d'annonce conditionnée |

Le domaine APPEL est la **référence** de la classe, pas son défaut : `call:end`
diffuse volontairement AVANT l'écriture autoritaire (`fast-path broadcast`) et
compense l'échec par `forceEndOrphanedCallSession` +
`forceEndOrphanedCallAfterOptimisticBroadcast` — annonce optimiste ET
rétractation. `buildRingingTimeoutHandler` fait l'inverse et le fait aussi bien :
`updateMany` conditionnel gagnant d'abord, émissions ensuite.

L'oracle utile n'était donc pas « qui annonce trop tôt ? » mais **« qui annonce
un fait DIFFÉRENT de celui qu'il a écrit ? »** — et là, un site diverge.

## Défaut corrigé — une clôture GLOBALE annoncée comme une suppression PERSONNELLE

`DELETE /conversations/:id/delete-for-me` (`routes/conversations/delete-for-me.ts`)

Les deux événements de la famille portent leur contrat dans
`socketio-events.ts`, et ils s'opposent terme à terme :

| Événement | Contrat déclaré |
|---|---|
| `CONVERSATION_CLOSED` | « `Conversation.isActive` is set to `false` … disappears from **every member's list**. Broadcast to the **conversation room** so all members react » |
| `CONVERSATION_DELETED` | « removes the conversation from the **caller's own** device list only — the conversation **stays active for every other participant** » |

La route n'émettait que le SECOND. Or deux de ses branches exécutent le PREMIER :

```
if (participant.role === 'creator') {
  if (isEmptyDirect)      → conversation.update({ isActive: false })   ← clôture GLOBALE
  else if (!successor)    → conversation.update({ isActive: false })   ← clôture GLOBALE
}
→ io.to(ROOMS.user(caller)).emit(CONVERSATION_DELETED)   ← « stays active for every other participant »
```

La branche `isEmptyDirect` **nomme elle-même** le cas qui fait mal, dans son
propre commentaire : « fermer plutôt que transférer, **même s'il reste un autre
participant actif** ». Ce participant-là :

1. **n'apprend rien en direct** — aucune émission ne le vise. `CONVERSATION_DELETED`
   part vers `ROOMS.user(<appelant>)` ;
2. **n'apprend rien plus tard** — et c'est le point non évident.
   `loadConversationTombstones` (`utils/delta-tombstones.ts`) reconstitue les
   disparitions à partir de TROIS sources : `closedAt > since`,
   `Participant.deletedForMe > since`, `Participant.leftAt|bannedAt > since`.
   La route n'écrivait **aucune des trois** pour lui : `deletedForMe` est celle
   de l'appelant, il n'a ni quitté ni été banni, et la clôture n'écrivait que
   `isActive: false` — **jamais `closedAt`**. Aucun delta ne pouvait donc porter
   la fermeture, à aucune date.

Le `@@index([closedAt])` du schéma dit d'ailleurs la même chose en clair :
« `closedAt > since` est le SEUL des trois streams … qui ne parte pas d'un
`userId` indexé ». Le champ n'est pas décoratif, **il EST le canal de rattrapage**.

Reste au participant orphelin : `GET /conversations` filtre bien `isActive: true`
à la racine du `whereClause`, donc une réconciliation COMPLÈTE finit par retirer
la ligne. Entre-temps — et les deux clients PERSISTENT (cache disque iOS,
`staleTime: Infinity` web) — il garde à l'écran une conversation que le serveur a
fermée, et **aucune garde `Conversation.isActive` n'existe sur le chemin d'envoi** :
il peut y écrire des messages que l'appelant (participant `isActive: false`,
`deletedForMe` posé) ne recevra jamais.

### Le jumeau correct, à quelques fichiers de là

`DELETE /conversations/:id` (`core.ts`) fait exactement les deux gestes qui
manquaient, et son commentaire décrit **le même bug déjà corrigé une fois** :
« Adressée à la seule room de conversation, la clôture n'atteignait que les
membres ayant le fil OUVERT ». Le correctif le recopie plutôt que de l'inventer :

- **écriture** : `{ isActive: false, closedAt: now, closedBy: userId }` sur les
  DEUX branches. La branche « aucun successeur » n'a aucun AUTRE membre à
  prévenir (c'est sa condition même) mais doit rester ENREGISTRÉE comme
  clôture : une ligne `isActive: false` sans `closedAt` est une conversation
  fermée dont la base ignore qu'elle l'a été ;
- **diffusion** : `emitToConversationParticipants(CONVERSATION_CLOSED)` — les
  rooms PERSONNELLES, pas la seule room de conversation, parce qu'un client posé
  sur la LISTE a quitté `conversation:<id>` et n'est joignable que là ;
- **audience ramenée PAR l'écriture** (`include: { participants: … }`), jamais
  par une requête de plus. Raison de `core.ts` mot pour mot — « une seconde
  requête … pourrait tomber sur un état déjà modifié » — plus une raison propre
  à cette sonde : une requête supplémentaire APRÈS des écritures committées est
  un mode d'échec gratuit, qui rendrait `500` une opération intégralement réussie ;
- **émission après la DERNIÈRE écriture** — une annonce ne précède jamais la
  durabilité du fait qu'elle annonce, ce que cette sonde même exige. L'appelant
  figure dans l'audience (capturée à l'écriture, où il est encore actif) et
  reçoit donc les deux événements : c'est exact — les deux faits sont vrais pour
  lui — et c'est la sémantique de `core.ts`, où l'auteur de la clôture reçoit
  aussi son annonce.

**Tests** — 6 témoins neufs dans
`__tests__/unit/routes/conversations/delete-for-me.test.ts` (4 rouges avant
correctif, 2 verts d'emblée : les non-régressions). La suite ne mesurait PAS la
propriété en cause — le scénario « DM vide » n'instanciait aucun autre
participant, donc aucune assertion ne pouvait distinguer « annonce correcte » de
« aucune annonce ». Deux assertions préexistantes épinglaient `data: { isActive:
false }` à l'exact : elles figeaient la forme INCOMPLÈTE de l'écriture, réalignées.

### Les deux clients consomment déjà l'événement — vérifié, aucun changement requis

La correction ne vaut que si `conversation:closed` est écouté. Il l'est, des
deux côtés, et avec exactement le payload que le nouvel émetteur produit :

- **web** — `presence.service.ts` s'abonne à `SERVER_EVENTS.CONVERSATION_CLOSED`
  et `use-socket-cache-sync.ts` (l. 795) retire la conversation du cache
  infini + purge sa `detail` query ;
- **iOS/SDK** — `SocialSocketManager` fanne le payload dans le publisher
  `conversationDeleted` (témoin B6, `SocialSocketAdditionalTests`), dont le
  commentaire dit s'aligner sur « the live `conversation:closed` payload from
  `core.ts` » — la forme `{ conversationId, closedBy, closedAt }` que ce
  correctif émet à l'identique.

C'est ce qui rend l'entrée CHANGELOG « aucun changement client » vérifiée et
non supposée : le canal existait, seul l'émetteur manquait.

## Gates

- [x] 4 RED discriminants vus rouges avant correctif (2 adresse/audience, 2 durabilité)
- [x] 2 non-régressions vertes d'emblée (membre ordinaire, transfert d'ownership :
      une garde qui émettrait TOUJOURS passerait les 4 premiers)
- [x] Suites voisines : 62 suites / 720 tests verts
- [x] `tsc --noEmit` gateway : 0

## Constats latents — relevés, NON livrés

1. **`presence:user:<id>` et `presence:anon:<id>` sont ÉCRITS et jamais LUS.**
   `StatusService` renouvelle ces deux clés Redis à chaque tick d'activité
   (throttle 5 s) ; un `grep` sur tout le monorepo — gateway, web, translator,
   iOS — ne rend aucun lecteur. Deux `SET` réseau par tick pour une valeur que
   personne ne consulte. Non livré ce cycle : c'est de l'hygiène, pas un défaut
   de synchronisation, et le retrait mérite sa propre passe (vérifier qu'aucun
   outil d'exploitation ne les lit hors dépôt).
2. **`leave.ts` est le 4e écrivain de `isActive: false` et n'écrit pas non plus
   `closedAt` — mais sans victime.** Balayage complet de la famille (méthode du
   cycle 26 : ne jamais s'arrêter au site qui a déclenché la sonde) :

   | Écrivain | `closedAt` | Diffusion | Verdict |
   |---|---|---|---|
   | `core.ts` `DELETE /conversations/:id` | ✅ | `CONVERSATION_CLOSED` | ✅ le jumeau modèle |
   | `delete-for-me.ts` — DM vide | ❌ → ✅ | aucune → `CONVERSATION_CLOSED` | ❌ **ce cycle** |
   | `delete-for-me.ts` — sans successeur | ❌ → ✅ | aucune (personne d'autre) | ❌ **ce cycle** |
   | `leave.ts` — créateur dernier membre | ❌ | aucune | ⚠️ latent |

   `leave.ts` ne ferme que si `otherActiveCount === 0` : par construction il n'y
   a personne à prévenir, donc l'absence de diffusion est correcte. Reste le
   `closedAt` manquant — et il n'a pas de victime non plus, vérifié plutôt que
   supposé : le partant reçoit un tombstone `leftAt` (posé par la même route),
   et tout participant devenu inactif en tient un aussi (`participants.ts`
   estampille `leftAt` au retrait, `ban.ts` `bannedAt`, `delete-for-me`
   `deletedForMe`) — les trois sources du stream sont couvertes. C'est donc une
   incohérence de champ, pas un trou de synchronisation : une conversation
   fermée dont la base ignore qu'elle l'a été. **Non livré** pour tenir le diff
   sur le défaut réel ; à reprendre avec la sonde ci-dessous, dont il relève.

3. **Aucune garde `Conversation.isActive` sur le chemin d'envoi.** Un participant
   encore actif d'une conversation FERMÉE peut y écrire ; le message est
   persisté et diffusé normalement. Le correctif ci-dessus retire la cause
   principale (l'orphelin apprend maintenant la clôture), mais la garde
   elle-même reste absente — un client qui ignore l'événement, ou une clôture
   concurrente d'un envoi en vol, retombent dessus. À traiter comme sa propre
   sonde : « quels chemins d'écriture ignorent l'état terminal de leur conteneur ? »

## Reste ouvert (inchangé depuis le cycle 23)

- **iOS n'écoute ni `message:hidden-for-me` ni `message:restored-for-me`.**
  Aucune toolchain Swift sous Linux. À reprendre depuis un runner macOS.
  S'y ajoute maintenant : vérifier que les clients traitent `conversation:closed`
  reçu hors du fil ouvert (le correctif l'y adresse désormais).
- **Aucun double Redis Lua-capable** pour `ENQUEUE_DEDUP_LUA` / `DRAIN_LUA` /
  `PRUNE_STALE_LUA`.

## Candidat pour le cycle suivant

Le constat latent #2 généralisé, et jamais posé par les cycles 21–30 : **quels
chemins d'écriture ignorent l'état TERMINAL de leur conteneur ?** Une
conversation `isActive: false`, un post supprimé, un appel `ended`, une
communauté archivée — chacun a des routes qui écrivent dedans. Recenser, pour
chaque conteneur porteur d'un état terminal, les écrivains qui ne le vérifient
pas.

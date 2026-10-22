# Parité iOS → Android : `sdk-persistence-cache-offline`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**50 features iOS** : 14 absentes, 33 partielles, 3 divergentes, 0 complètes sur Android. **41 lots** planifiés (≈27280 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**sdk-persistence-cache-offline** (couverture Android estimée ≈ 30 %)

Cette partie est le socle « local-first » d'iOS : cache SWR typé (CachePolicy, CacheCoordinator, 27+ stores GRDB L1/L2 chiffrés), base SQLite de messages à ~70 colonnes avec acteur de persistance (fusion idempotente, tombstones, ledger de réactions, éphémères/vue unique, rétention, FTS5), flux social persisté, outbox durable à 25 sortes de mutations (classification d'erreurs, backoff par ligne, reprise après kill, pastille de sync), brouillons et file de publication de stories, stores RAM de conversations/catégories avec registre de non-lus, caches disque média (LRU, épingles, pression disque, funnel réseau, purge sélective) et enregistrement photothèque dédoublonné. Android a déjà une vraie base Room (v16, 14 entités), un cacheFirstFlow à 4 états, un outbox WorkManager à 22 kinds avec coalescing/lanes/dépendances et des brouillons DataStore : environ 30 % de la surface est couvert. Les écarts structurants sont : fallbackToDestructiveMigration (une montée de version détruit l'outbox et les médias en file), aucun cache disque audio/vidéo ni purge sélective, aucun chiffrement au repos ni isolation par compte, flux social et commentaires uniquement en mémoire, médias en file stockés en BLOB Room, erreurs d'envoi toutes traitées comme transitoires (5 tentatives brûlées en panne), pas de registre de non-lus ni de fenêtre « sauter à un message », pas de recherche FTS locale, pas de pastille de synchronisation, pas de reprise de lecture audio/vidéo. Les priorités P0 sont la migration sans perte, le flusher d'outbox classé, le stockage fichier des médias en file, le flux social persisté, la fusion de messages et le registre de non-lus.

## Notes transverses

1. FICHIERS CHAUDS PARTAGES (a serialiser ou a eclater avant tout). MessageRepository.kt (634 l.) : le lot persist-messages-repository-decoupage l'eclate en collaborateurs (MessageSendCoordinator, MessageMutationWriter, MessageEnrichmentWriter, MessageReceiptWriter) SANS changement d'API publique ; tous les lots messages ajoutent ensuite leur logique dans des fichiers NEUFS et ne touchent le facade que par une delegation d'une ligne. OutboxFlushWorker.kt (369 l., 22 senders + onExhausted dans un seul when) : persist-outbox-registre-senders le remplace par un registre Hilt multibinding (@IntoMap @OutboxKindKey) ; chaque nouveau kind (lots outbox-kinds-*, publication, commentaires, reactions, conversation-etat) ajoute UN fichier de sender, jamais une ligne dans le worker. MeeshyApplication.kt : persist-app-lifecycle-hooks introduit AppLifecycleHook (onAppCreate/onForeground/onBackground/onTrimMemory) en multibinding ; les balayages au demarrage (reconciliation d'envois, orphelins de fichiers, retention, ephemeres, pression disque, flush L1) s'y enregistrent sans editer l'Application. ChatViewModel.kt (2248 l.), ConversationListViewModel.kt (1046 l.), PostRepository.kt (720 l.), ConversationRepository.kt (535 l.), SdkModule.kt (providers) et ApiMessage dans Message.kt sont hors budget de taille (plafond dur 1200 l. de la directive) : un lot qui les touche EXTRAIT son code dans un fichier neuf (coordinateur, source de cache, presenter) et n'y laisse que du cablage ; il ne grossit pas le fichier. libs.versions.toml, build.gradle.kts de module et les strings.xml (values, -fr, -es, -pt seulement presents aujourd'hui, l'iOS cible 7 langues : ajouter les 3 manquantes releve du domaine localisation, ici on renseigne les 4 existantes) sont aussi des points de collision : un seul lot par vague les modifie.
2. VERSIONS ROOM : plusieurs lots ajoutent des entites/colonnes (cache-entries-store, outbox-schema-metadonnees, media-file-queue, messages-schema-colonnes-locales, messages-etat-envoi-historique, messages-traductions-persistees, recherche-fts-moteur, feed-store-room, feed-commentaires-persistes, stories-brouillons-stockage, engagement-vues-persistees, galerie-conversation-index eventuellement). Ils editent tous MeeshyDatabase.kt (@Database entities + version) et DatabaseModule.kt : les fusionner SERIELLEMENT, chaque lot prenant la prochaine version libre au moment du merge avec sa Migration(from,to) dans un fichier dedie migration/Migration_<from>_<to>.kt + son JSON de schema ; la garde CI du lot persist-room-migrations rougit sinon. Ordre recommande : room-migrations, cache-entries-store, outbox-schema-metadonnees, media-file-queue, messages-schema-colonnes-locales, feed-store-room, messages-etat-envoi-historique, messages-traductions-persistees, recherche-fts-moteur, feed-commentaires-persistes, stories-brouillons-stockage, engagement-vues-persistees. Aucun backfill via json_extract (JSON1 non garanti en API 26) : backfill Kotlin post-migration.
3. CONSTATS VERIFIES DANS L'ARBRE QUI CHANGENT LE PLAN. (a) Android n'envoie NI l'en-tete X-Client-Mutation-Id (middleware gateway clientMutationId.ts, format cmid_<uuid v4 minuscule>, = OutboxIds.cmid()) NI aucun clientMutationId : la dedup MutationLog est donc inoperante cote Android ; persist-outbox-flusher-classifie l'ajoute (Call.Factory/interceptor lisant un element de contexte pose par le sender ; a defaut un @Header par methode d'API) et traite 410 comme deja applique. (b) OutboxEntity.kindEnum = OutboxKind.valueOf(kind) LEVE sur un kind inconnu (ligne ecrite par un build plus recent) : decodage tolerant dans persist-outbox-schema-metadonnees. (c) ApiMessage ne porte PAS callSummary, avis systeme (joinNotice), sticker, lieu, liens suivis, senderIsAnonymous/hasAccount, contour d'avatar, recipientCount, viewOnceOpenedAt, champs de chiffrement : sans eux la relecture hors-ligne les perd (persist-messages-schema-colonnes-locales les ajoute avec valeurs par defaut ; coordonner avec le domaine messages/bulles qui ajoute les memes champs, ajouts en append-only). (d) MessageApi n'a pas de listAround alors que le gateway sert deja ?around= (messages-list.ts). (e) Pas de room-testing dans le catalogue, exportSchema=false, aucune migration. (f) allowBackup=false est deja pose mais pas de dataExtractionRules (transfert appareil Android 12+). (g) EncryptedConversationLockStore/EncryptedTokenStore chiffrent deja leurs secrets : reutiliser leur approche Keystore plutot que d'en inventer une troisieme.
4. LOIS PURES A POUSSER DANS :core:model (prouvables localement par ./apps/android/meeshy.sh jvm-check) : LoadState/PaginationState/PaginationCursor, CacheDiff et modes d'ecriture, AccountStorageKey/LiveOwner/SessionPurgeDecision, OutboxUiProjection/OutboxUiItem, ReactionLedger, PendingRowEventBuffer, MessageMergePolicy, MessageWindow, InlineTimestampRule, OptimisticRollback, EphemeralDeadline/QuoteCascade/ViewOnceSeal, ConversationReadLedger, ConversationMergeRules, StoryPublishRetryPolicy, MediaCacheKey/MediaPinTable/LruEvictionPlan/DiskPressureReclaimPlan/MediaCacheDirective/TransferProgressCadence/DeviceMediaTier, PurgeMatrix, PlaybackPositionLaw, InterruptionResumeLedger, MediaSignature. Compose, Hilt, Room, WorkManager, Media3, Coil ne se prouvent que par la CI android.yml : les ecrans restent minces.
5. RISQUES TECHNIQUES. (i) SQLCipher : sqlcipher-android n'embarque pas de natif pour la JVM hote, donc Robolectric ne peut pas ouvrir une base chiffree ; les parties pures (fournisseur de cle, plan de migration) se testent en JVM, l'ouverture chiffree en androidTest/instrumente. Le SQLite embarque par SQLCipher regle aussi le point 6. (ii) Bascule de compte : MeeshyDatabase est un @Singleton et les DAO sont fournis depuis cette instance ; fermer puis rouvrir sur un autre fichier doit etre PROUVE (un Flow Room collecte avant la bascule re-emet apres) ; plan B documente = recreation du processus apres une bascule. (iii) FTS : unicode61 remove_diacritics=2 exige SQLite >= 3.27 (API 30+) ; sans SQLCipher, replier sur remove_diacritics=1 sous API 30 et le tester. (iv) Coil DiskCache n'a aucune notion d'epingle : les medias epingles (stories vues) vivent dans un repertoire frere hors LRU servi par un interceptor ; Media3 SimpleCache stocke des spans (pas un fichier unique) : tout export (enregistrer, adopter un fichier local) passe par startFile/commitFile et un MediaFileExporter, pas par une URL de fichier. (v) auto_vacuum=INCREMENTAL ne s'applique qu'avant la creation des tables : base existante = PRAGMA + VACUUM unique en tache de maintenance. (vi) Les stores hors-ligne dont la feature n'existe pas encore cote Android (carnet d'adresses, timeline, affilies, journaux reseau d'appels, transcriptions d'appels, progression d'engagement, statuts hors barre) ne sont PAS dans ces lots : ils s'ajouteront comme simples CacheStore (lot cache-entries-store) quand leur ecran sera porte par le domaine concerne.
6. LOIS TRANSVERSES. Prisme Linguistique : la projection enregistrement->bulle (mapper unique) applique langue systeme > regionale > destination personnalisee > locale appareil > fr et renvoie l'ORIGINAL (jamais translations.first) quand aucune traduction ne matche ; aucune cle de cache n'est indexee par langue de lecture. Presence (directive 2026-08-25) : un cache de profils/participants/amis ne rejoue jamais isOnline/lastActiveAt au-dela de ce que le serveur a servi, absence de presence => aucun point d'avatar (les lots cache-stores-profils-participants et caches-ram-amitie-noms le prouvent). E2EE fail-closed : un message en clair n'est jamais ecrit dans un fil chiffre (MessageEncryptionGuard) et un echec de chiffrement local se propage, sans repli en clair. Couleur d'accent de conversation : les composants nouveaux (pastille, historique d'envoi, galerie) utilisent accentColor de la conversation, les couleurs d'etat semantiques restent statiques. Aucun lot ne regresse le cache-first : pas de spinner sur cache non vide, offline = etat discret et jamais ecran d'erreur.
7. HORS PERIMETRE ANDROID (documente, pas de lot) : DatabaseSuspension 0xDEAD10CC, App Group partage avec la NSE (le service FCM tourne dans le meme processus), BGProcessingTask de flush (Room ecrit en direct), StoryQueueMigrator/MigrateLegacyQueues (pas d'ancienne file Android), CTFramesetter et colonnes de layout persistees (Compose mesure a la volee).
8. PLAN DE VAGUES SUGGERE. V1 (aucune dependance) : room-migrations, app-lifecycle-hooks, cache-policy-loadstate, compte-lois-stockage, outbox-registre-senders, messages-repository-decoupage, conversations-registre-non-lus, media-cache-modele-lois, caches-ram-amitie-noms. V2 : cache-entries-store, outbox-schema-metadonnees, db-ouverture-resiliente, outbox-flusher-classifie, media-file-queue, messages-schema-colonnes-locales, conversations-fusion-en-place, media-cache-images, media-cache-audio-video. V3 : cache-registry-l1-flush, sqlcipher, outbox-file-attente, messages-fusion-ingestion, media-tus-reprise, messages-fenetre-moteur, feed-store-room, stories-brouillons-stockage, pastille-sync-modele, recherche-fts-moteur. V4 : le reste des lots messages, outbox-kinds-*, publication/commentaires, pastille UI, compte-cache-par-compte, conversations-sections/pont, stories, engagement, telechargement/adoption, purge selective, lecture.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `persist-app-lifecycle-hooks` | F0 | P0 | S | 280 | socle-points-d-extension-de-l-app | Les services de persistance se réveillent et se vident aux bons moments (démarrage, premier plan, arrière-plan, mémoire basse) |
| `persist-cache-entries-store` | F0 | P0 | L | 1300 | persist-room-migrations, persist-cache-policy-loadstate | Les listes secondaires se rouvrent instantanément depuis le disque grâce à un cache générique à écriture différentielle |
| `persist-cache-policy-loadstate` | F0 | P0 | M | 380 |  | Chaque écran affiche le cache d'abord avec les mêmes fenêtres de fraîcheur qu'iOS, et ne montre jamais une erreur hors-ligne |
| `persist-cache-registry-l1-flush` | A | P0 | M | 600 | persist-cache-entries-store, persist-app-lifecycle-hooks, socle-points-d-extension-de-l-app | Les listes déjà vues s'ouvrent en moins d'une image, et le cache se vide proprement au logout et sous pression mémoire |
| `persist-compte-lois-stockage` | A | P0 | S | 350 |  | Le stockage sait à quel compte appartient chaque cache et ne se purge jamais pendant l'initialisation |
| `persist-conversations-fusion-en-place` | A | P0 | M | 800 | persist-conversations-registre-non-lus, liste-decoupage-viewmodel | La liste de conversations réagit instantanément aux événements, avec une seule règle de fusion pour la mémoire et le disque |
| `persist-conversations-registre-non-lus` | A | P0 | M | 600 | relais-cache-messages-temps-reel, socket-salles-conversation-ouverte | Le badge de non-lus dit toujours la vérité, quel que soit l'appareil ou le chemin qui l'a changé |
| `persist-media-cache-modele-lois` | A | P0 | M | 550 | persist-cache-policy-loadstate | Le cache média sait ce qu'il garde, ce qu'il peut évincer et ce qu'il doit épingler |
| `persist-media-file-queue` | F0 | P0 | M | 800 | persist-room-migrations, persist-outbox-registre-senders, persist-app-lifecycle-hooks | Un média enregistré hors-ligne est stocké en fichier et repart tout seul au retour du réseau, même si l'app a été tuée |
| `persist-messages-envoi-optimiste` | A | P0 | M | 800 | persist-messages-schema-colonnes-locales, persist-outbox-file-attente-cycle-de-vie, persist-media-file-queue, persist-messages-repository-decoupage, liste-conversations-fil-complet-et-contrat-apercu, chat-viewmodel-state-split | Mon message apparaît à l'instant dans le fil, même hors-ligne, et un échec se défait sans toucher au reste |
| `persist-messages-evenements-precoces-tombstones` | A | P0 | M | 800 | persist-messages-repository-decoupage, persist-messages-fusion-ingestion, chat-viewmodel-state-split | Modifier, supprimer ou réagir à un message reste cohérent même si l'événement arrive avant le message |
| `persist-messages-fenetre-moteur` | A | P0 | M | 650 | persist-messages-schema-colonnes-locales, persist-messages-fusion-ingestion, persist-messages-repository-decoupage, chat-viewmodel-state-split | Le fil de messages se pagine vers le haut et saute vers un ancien message, depuis le disque quand il y est |
| `persist-messages-fenetre-ui-saut` | A | P0 | M | 650 | persist-messages-fenetre-moteur, composer-glass-shell, chat-viewmodel-state-split, chat-bulle-decoupage-composants | Taper sur une citation ancienne, un résultat de recherche ou la pastille de synchro saute au bon message sans perdre sa place |
| `persist-messages-fusion-ingestion` | A | P0 | M | 900 | persist-messages-schema-colonnes-locales, socle-points-d-extension-de-l-app, socle-pipeline-push-et-cycle-de-vie | Un message reçu deux fois (REST, socket, notification) ne produit ni doublon ni clignotement et n'écrase pas l'état local |
| `persist-messages-repository-decoupage` | A | P0 | M | 500 |  | Le dépôt de messages est découpé en collaborateurs ciblés pour que les évolutions hors-ligne avancent en parallèle |
| `persist-messages-schema-colonnes-locales` | A | P0 | M | 950 | persist-room-migrations, persist-messages-repository-decoupage, message-fil-decodage-complet-et-tolerant | Chaque message se relit du disque avec tout son contexte : réponse, transfert, sticker, lieu, avis système |
| `persist-outbox-file-attente-cycle-de-vie` | A | P0 | M | 800 | persist-outbox-schema-metadonnees, persist-outbox-flusher-classifie, persist-messages-repository-decoupage, persist-outbox-registre-senders | Je vois mes envois en échec, je peux les relancer ou les annuler, et la file ne grossit pas sans fin |
| `persist-outbox-flusher-classifie` | F0 | P0 | M | 1000 | persist-outbox-schema-metadonnees, persist-outbox-registre-senders, persist-app-lifecycle-hooks, reseau-pipeline-reessai-erreurs | Les envois en attente repartent seuls au retour du réseau sans brûler leurs tentatives, et un refus définitif échoue tout de suite |
| `persist-outbox-kinds-compte-amis-conversations` | A | P0 | M | 1100 | persist-outbox-registre-senders, persist-outbox-flusher-classifie, persist-outbox-file-attente-cycle-de-vie | Accepter une demande d'ami, créer ou modifier une conversation et régler son compte fonctionnent hors-ligne |
| `persist-outbox-kinds-social-stories` | A | P0 | M | 800 | persist-outbox-registre-senders, persist-outbox-flusher-classifie, persist-outbox-file-attente-cycle-de-vie, feed-room-cache-and-realtime, post-service-endpoints, story-viewer-decomposition-and-nav-graph | Reposter, voir une story, supprimer ou aimer un commentaire fonctionnent hors-ligne et ne se perdent jamais |
| `persist-outbox-registre-senders` | F0 | P0 | M | 650 |  | Ajouter un nouveau type d'action hors-ligne ne demande plus qu'un fichier, sans toucher au worker d'envoi |
| `persist-outbox-schema-metadonnees` | F0 | P0 | M | 380 | persist-room-migrations, persist-outbox-registre-senders | Chaque envoi en attente porte son prochain essai, son erreur et son propriétaire, et un kind inconnu ne fait plus planter l'app |
| `persist-room-migrations` | F0 | P0 | M | 450 | dependances-gradle-scene-medias | Une mise à jour de l'app ne détruit plus la file d'envoi, les médias en attente ni les points de reprise |
| `persist-cache-stores-notifications-communautes` | A | P1 | M | 900 | persist-cache-entries-store, persist-cache-registry-l1-flush | Les notifications, communautés et liens de partage se rouvrent instantanément, même hors-ligne et après un redémarrage |
| `persist-cache-stores-profils-participants` | A | P1 | M | 700 | persist-cache-entries-store, persist-conversations-fusion-en-place | Profils, participants et sessions actives s'affichent depuis le disque dès l'ouverture, avec la présence telle que servie |
| `persist-caches-ram-amitie-noms` | A | P1 | S | 380 |  | Le bouton « Ajouter / En attente / Ami » est correct partout dès le démarrage, et les @mentions affichent le bon nom, même hors-ligne |
| `persist-compte-cache-par-compte` | A | P1 | M | 1000 | persist-room-migrations, persist-cache-registry-l1-flush, persist-compte-lois-stockage, reprise-sur-base-locale-corrompue, bascule-de-compte-et-isolation, socle-points-d-extension-de-l-app, persist-outbox-registre-senders | Changer de compte n'expose jamais les données de l'autre, et revenir sur un compte retrouve son cache et ses envois en attente |
| `persist-conversation-etat-hors-ligne` | A | P1 | M | 420 | persist-outbox-flusher-classifie, persist-outbox-file-attente-cycle-de-vie, persist-conversations-fusion-en-place, persist-outbox-registre-senders, liste-decoupage-viewmodel | Quitter, masquer ou supprimer une conversation hors-ligne est appliqué à l'instant et envoyé plus tard |
| `persist-datastores-fichiers-chiffres` | A | P1 | M | 450 | persist-sqlcipher-base-chiffree, persist-media-file-queue | Brouillons, aperçus de catégories et fichiers de médias en file sont chiffrés au repos |
| `persist-media-cache-audio-video` | A | P1 | M | 750 | persist-media-cache-modele-lois | Vocaux et vidéos déjà écoutés se rouvrent sans réseau, avec un cache LRU qui épargne les épingles |
| `persist-media-cache-images` | A | P1 | M | 600 | persist-media-cache-modele-lois, socle-points-d-extension-de-l-app | Photos et vignettes déjà vues se rouvrent instantanément sans réseau, dans un budget d'espace maîtrisé |
| `persist-messages-accuses-monotones` | A | P1 | M | 450 | persist-messages-schema-colonnes-locales, persist-messages-repository-decoupage, socket-routage-evenements-ordre-arrivee | Les coches de distribution et de lecture ne reculent jamais et survivent au redémarrage |
| `persist-messages-citations-expediteurs` | A | P1 | M | 650 | persist-messages-schema-colonnes-locales, persist-messages-fusion-ingestion, socket-routage-evenements-ordre-arrivee | Les citations, transferts, étoiles et noms d'expéditeurs restent à jour et lisibles hors-ligne |
| `persist-messages-etat-envoi-historique` | A | P1 | M | 650 | persist-messages-schema-colonnes-locales, persist-outbox-flusher-classifie, persist-messages-repository-decoupage, persist-room-migrations | Un message envoyé passe par des états clairs (file, envoi, envoyé, distribué, lu, échec) et son historique d'envoi se consulte |
| `persist-messages-registre-reactions` | A | P1 | M | 550 | persist-messages-schema-colonnes-locales, persist-messages-repository-decoupage, persist-outbox-registre-senders, persist-outbox-flusher-classifie, message-fil-decodage-complet-et-tolerant | Mes réactions et celles des autres restent justes, hors-ligne comme après un écho serveur, et on voit qui a réagi |
| `persist-messages-retention` | A | P1 | S | 320 | persist-messages-schema-colonnes-locales, persist-app-lifecycle-hooks, persist-outbox-schema-metadonnees | L'historique local reste léger : purge des vieux messages, des éphémères échus et des lignes mortes |
| `persist-messages-traductions-persistees` | A | P1 | M | 550 | persist-messages-schema-colonnes-locales, persist-messages-repository-decoupage, persist-messages-evenements-precoces-tombstones, prisme-descente-stricte-loi, message-fil-decodage-complet-et-tolerant, persist-room-migrations, chat-viewmodel-state-split | Les traductions, transcriptions et pistes audio traduites déjà reçues s'affichent immédiatement à la réouverture |
| `persist-sqlcipher-base-chiffree` | A | P1 | M | 520 | persist-room-migrations, reprise-sur-base-locale-corrompue, coffre-securise-par-compte, dependances-gradle-scene-medias | Messages, conversations et file d'envoi sont chiffrés au repos et illisibles sans la clé de l'appareil |
| `persist-stories-brouillons-liste` | A | P1 | M | 650 | persist-stories-brouillons-stockage, socle-points-d-extension-de-l-app, persist-room-migrations, composer-socle-decoupage-et-dependances | Une liste « Mes brouillons » montre mes stories en cours avec leur vignette et me les fait reprendre à l'identique |
| `persist-stories-brouillons-stockage` | A | P1 | M | 950 | persist-room-migrations, persist-media-file-queue | Je peux garder plusieurs brouillons de story et les reprendre intacts avec leurs médias |
| `persist-media-cache-ressources` | A | P2 | M | 700 | persist-media-cache-images, persist-media-cache-audio-video, persist-app-lifecycle-hooks | Quand le téléphone manque d'espace ou de mémoire, l'app libère son cache média intelligemment sans casser une lecture en cours |

### Lots fusionnés ou retirés par l'architecture

- `persist-media-tus-reprise-apres-kill` → `tus-envoi-depuis-fichier-reprenable` (merge-into) : Même lecture TUS par tronçons depuis le disque, checkpoint par empreinte et reprise après kill. Hérite : persist-media-file-queue.
- `persist-db-ouverture-resiliente` → `reprise-sur-base-locale-corrompue` (merge-into) : Même ouverture résiliente de la base (corruption, disque plein) ; un seul propriétaire de DatabaseModule pour ce sujet. Hérite : persist-room-migrations, persist-app-lifecycle-hooks.
- `persist-pastille-sync-modele` → `etat-connexion-et-regles-pastille` (merge-into) : Même loi de pastille (hors ligne, reconnexion, envois, échecs) ; une seule source d'état. Hérite : persist-outbox-file-attente-cycle-de-vie.
- `persist-pastille-sync-ui` → `pastille-synchro-globale-affichage` (drop-duplicate) : Même pastille flottante globale.
- `persist-recherche-fts-moteur` → `recherche-index-local-fts` (merge-into) : Même index FTS local (messages, conversations, personnes) ; une seule table FTS. Hérite : persist-messages-schema-colonnes-locales.
- `persist-recherche-fts-ui` → `recherche-globale-local-d-abord` (merge-into) : Mêmes résultats locaux à la frappe complétés par le serveur.
- `persist-conversations-pont-temps-reel` → `relais-cache-conversations-participants` (merge-into) : Même application ordonnée des événements de conversation au cache. Hérite : persist-conversations-fusion-en-place, persist-messages-fusion-ingestion.
- `persist-conversations-sections-et-ordre` → `liste-sections-etat-et-ordre` (merge-into) : Même synchronisation des sections/catégories avec le serveur. Hérite : persist-conversations-fusion-en-place.
- `persist-feed-store-room` → `feed-room-cache-and-realtime` (merge-into) : Même fil cache-first sur disque ; le fil se range dans le CacheEntriesStore générique (pas de table dédiée). Hérite : persist-room-migrations, persist-cache-policy-loadstate, persist-cache-entries-store.
- `persist-feed-commentaires-persistes` → `comments-engine-core` (merge-into) : Mêmes commentaires persistés et rouverts depuis le disque.
- `persist-publication-hors-ligne-posts` → `post-publish-outbox` (merge-into) : Même publication de post hors ligne avec reprise des envois partiels. Hérite : tus-envoi-depuis-fichier-reprenable.
- `persist-commentaires-hors-ligne` → `comment-send-outbox` (merge-into) : Même commentaire hors ligne visible « en attente », jamais envoyé sous un autre compte. Hérite : tus-envoi-depuis-fichier-reprenable.
- `persist-stories-publication-reprise` → `publication-story-arriere-plan-et-file-durable` (merge-into) : Même publication de story différée et reprise. Hérite : persist-outbox-flusher-classifie, persist-media-file-queue, persist-stories-brouillons-stockage.
- `persist-stories-vues-registre` → `story-viewed-ledger-and-impressions` (merge-into) : Même registre des stories vues, hors ligne. Hérite : persist-outbox-kinds-social-stories, persist-compte-lois-stockage.
- `persist-engagement-vues-persistees` → `analytics-counting-delivery` (merge-into) : Mêmes compteurs de vues durables par lots rejouables. Hérite : persist-outbox-flusher-classifie.
- `persist-lecture-audio-focus` → `lecture-focus-audio-et-coordination-des-lecteurs` (merge-into) : Même lecture unique avec focus audio et reprise après appel.
- `persist-lecture-reprise-consommation` → `reprise-position-multi-appareil-et-vu-par` (merge-into) : Même reprise de position de lecture.
- `persist-media-telechargement-flux-adoption` → `telechargement-media-registre-unique` (merge-into) : Même téléchargement unique en flux vers le disque. Hérite : persist-media-cache-modele-lois, persist-messages-repository-decoupage, persist-media-file-queue.
- `persist-media-enregistrement-sans-doublon` → `enregistrement-media-galerie-sans-doublon` (merge-into) : Même enregistrement en galerie sans doublon.
- `persist-galerie-conversation-index` → `chat-media-index-store` (merge-into) : Même index local des médias d'une conversation. Hérite : persist-cache-entries-store.
- `persist-stockage-purge-selective` → `cache-purge-storage-screens` (merge-into) : Même écran de stockage et purge par type et domaine.
- `persist-outbox-kinds-rapports-consommation` → `consommation-rapport-fiable-hors-ligne` (merge-into) : Mêmes rapports d'écoute / ouverture fiables hors ligne. Hérite : persist-outbox-registre-senders, persist-outbox-flusher-classifie, persist-outbox-file-attente-cycle-de-vie.
- `persist-messages-ephemeres-vue-unique` → `ephemere-echeance-par-lecteur-et-reveil-unique` (merge-into) : Même disparition exacte de l'éphémère, hors ligne et dans les citations. Hérite : persist-messages-schema-colonnes-locales, persist-messages-evenements-precoces-tombstones.

## Features

### Le badge de non-lus dit toujours la vérité, quel que soit l'appareil ou le chemin qui l'a changé

`pco-conversation-read-ledger` · Android : **absente** · P0 · effort M

ConversationReadLedger est le registre UNIQUE de tout ce qui change un non-lu sur l'appareil, en sept formes d'événement : serverUnread (conversation:unread-updated), serverReceipt (read-status:updated par NOUS : accusé + compteur voyagent ensemble), localOpen / localOpenSet (conversation(s) ouverte(s), multi-fenêtre), localMarkRead, localMarkUnread, snapshot(rows, source: cache \| server) et forget. Précédence en quatre rangs, écrite UNE fois : 1) conversation OUVERTE ⇒ elle se LIT à 0 (projection de counts(excludingOpen), jamais une écriture : sinon le compte servi pendant l'affichage est perdu et la fermeture rend 0 à une conversation encore non lue) ; 2) un accusé de lecture serveur est MONOTONE (lastReadAt non strictement postérieur = rejeu, jeté en entier avec son compteur ; seule comparaison de dates du registre, entre deux horloges SERVEUR, jamais Date()) ; 3) hors conversation ouverte le compteur SERVI gagne sur le local ; 4) un geste local est un optimistic update qui cède au prochain événement serveur (localMarkUnread efface la frontière serveur et pose max(1, compteur)). Le discriminant source distingue des lignes relues du cache (sèment les inconnues sans écraser un compteur suivi) de lignes lues fraîchement au serveur (autoritaires) : un retour au premier plan après une lecture faite sur un autre appareil remet ainsi le badge à zéro. Il remplace cinq copies divergentes de la précédence et trois formules de total.

Écarts :
- Android a markReadOptimistic / markUnreadOptimistic (écriture directe dans le payload Room + READ_RECEIPT/MARK_UNREAD) et ConversationDao.totalUnreadCount(), mais aucun registre : unread-updated déclenche seulement un refresh. Créer un registre unique avec les sept formes d'événement.
- Rang 1 : une conversation ouverte se lit à 0 par PROJECTION (counts excluant l'ouverte), jamais par écriture, avec localOpenSet pour le multi-fenêtre / tablette / pliable.
- Rang 2 : accusé de lecture serveur monotone sur lastReadAt (jeté en entier avec son compteur s'il n'est pas strictement plus récent), comparé uniquement à une autre horloge serveur.
- Rang 3/4 : le compteur servi gagne hors conversation ouverte ; les gestes locaux sont optimistes et cèdent au serveur ; marquer non lu efface la frontière serveur et pose max(1, compteur).
- snapshot(rows, source) : le cache sème sans écraser un compteur suivi, le serveur est autoritaire ; un retour au premier plan après lecture sur un autre appareil remet le badge à zéro.
- Une seule formule de total pour badge d'application, onglet, widget et notification (aujourd'hui SUM SQL + dérivations séparées).
- forget(conversationId) quand la conversation est quittée, supprimée ou le membre banni.

Rendu : Pastille de non-lus sur la ligne de conversation et badge d'icône d'app : tombent à l'instant du geste, jamais de compteur non nul sur la conversation actuellement ouverte, jamais de recul après un accusé rejoué.

Transposition Android : Registre RAM Swift → singleton Kotlin (StateFlow) alimenté par le pont socket, persisté dans ConversationEntity.unreadCount ; ouverture = ActiveConversationStore existant.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationReadLedger.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationReadLedgerState.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/ActiveConversationStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/ConversationDao.kt`

### Le fil d'actualité et les commentaires s'ouvrent instantanément depuis le disque, aussi hors-ligne

`pco-feed-comments-offline-store` · Android : **absente** · P0 · effort M

PostRecord (feed_posts) persiste contenu, médias JSON, auteur et contour, lieu partagé, audience EXCEPT/ONLY avec sa liste nommée, compteurs de portée (vues, impressions…), résumé de réactions et repost ; PostRecord+FeedPost projette le cache vers le modèle de rendu avec la MÊME résolution Prisme (APIPost.resolveTranslation) et les mêmes conversions média/repost, les blobs indécodables dégradant en champ vide. CommentRecord (feed_comments) garde le résumé de réactions emoji→compte issu de comment:reaction-added/removed, le lieu et les médias réécrits par comment:media-updated (transcription et variantes TTS) pour survivre au redémarrage. FeedPersistenceActor écrit, poste feedStoreShouldRefresh et purge au logout ; FeedStore (@MainActor) observe, charge le fil initial et sert la pagination hors-ligne depuis le cache.

Écarts :
- Le feed Android n'a qu'un cache mémoire (_feedCache, « Room-backed FeedEntity added in Phase 3 ») : un cold start repart sur un skeleton, en violation du cache-first. Créer les entités Room feed_posts, feed_comments et feed_translations.
- Persister auteur et contour, lieu, audience EXCEPT/ONLY avec liste nommée, compteurs de portée, résumé de réactions, repost, médias JSON (y compris transcription et variantes TTS réécrites par comment:media-updated).
- Projection cache → modèle de rendu avec la même descente Prisme que le réseau, sans logique de langue dupliquée ; blobs indécodables dégradés en champ vide.
- Fallback hors-ligne de pagination depuis le cache et reprise du curseur persisté.
- Observation Room avec rafraîchissement ciblé après écriture, purge complète au logout et plafonds de CachePolicy (100 posts, 500 commentaires).
- Mutations locales (like, favori, commentaire optimiste) persistées en préservant l'horloge de fraîcheur.

Rendu : Le fil s'affiche immédiatement avec les posts en cache ; skeleton seulement à froid ; la pagination hors-ligne continue depuis le cache puis montre une ligne « Hors-ligne » discrète en pied de liste.

Transposition Android : FeedPersistenceActor + notification feedStoreShouldRefresh → DAO Room + Flow ; FeedStore → ViewModel du feed.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/PostRecord.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/PostRecord+FeedPost.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/CommentRecord.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedPersistenceActor.swift`
- `apps/ios/Meeshy/Features/Main/Stores/FeedStore.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`

### Une pastille indique ce qui est en cours d'envoi, ce qui a échoué, et mène à l'élément concerné

`pco-sync-pill-outbox-feed` · Android : **absente** · P0 · effort M

OutboxPendingIndicator possède trois sujets : le nombre d'opérations en attente (pending + inflight), l'alerte de quasi-saturation (80 % de maxQueueSize 500 = 400) et le haut de file (50 OutboxUIItem au plus) pour la SyncPill. Les kinds markAsRead, reportAttachmentStatus, markStoryViewed, consumeAfterRead et reportContentCapture ne comptent PAS pour l'indicateur (même liste pour le compteur et la pastille, sinon un lu qui traîne s'allume dans l'un et pas l'autre). OutboxUIItem est l'instantané d'une ligne : kind (message, reaction, edit, delete, story, postComment, postReaction), titlePreview tronqué avec ellipse, iconKind (texte, audio, image, vidéo, fichier, réaction, sticker), nombre de pièces, source de navigation (conversation + ancre de message, post, story, inconnue), statut, createdAt et updatedAt (l'entrée terminale n'est affichée que dans une courte fenêtre mesurée sur la DERNIÈRE écriture, sinon un envoi ancien qui échoue maintenant naîtrait périmé). OfflineQueuePillProviding expose le flux d'items et retryItem. Libellés français de la pastille : « Envoi de message / d'audio / d'image / de vidéo / de fichier / de sticker / de réaction », « Édition de message », « Suppression de message », « Publication de story », « Envoi de commentaire », « Réaction au post », et pour les échecs « Message non envoyé », « Édition non envoyée », « Story non publiée », « Commentaire non envoyé ».

Écarts :
- Android n'a qu'une bannière de connexion (HIDDEN, SYNCING, RECONNECTING, OFFLINE) : aucun flux d'éléments en attente lisible par l'UI. Créer un modèle OutboxUIItem (kind, titlePreview tronqué, iconKind, nombre de pièces, source de navigation, statut, createdAt, updatedAt) projeté depuis observeAll() et limité à 50 éléments.
- Compteur et pastille calculés avec la même liste de kinds exclus (markAsRead, rapports de lecture média, vues de story, consommation flamme-œil, déclaration de capture).
- Alerte de quasi-saturation à 80 % de la capacité de file.
- Entrées terminales (échec ou abandon) affichées seulement dans une courte fenêtre mesurée sur updatedAt, jamais sur createdAt.
- Source de navigation : conversation avec ancre du message (id local de la bulle optimiste pour un envoi, id serveur pour édition/suppression/réaction), post, story ; ancre nulle quand la charge est illisible (jamais viser un message inexistant).
- Libellés localisés par kind et par nature de pièce (voir description) en 7 langues, et action Réessayer qui appelle retryItem.
- La pastille elle-même (rotation entre entrées, tap → navigation) est une surface UI : à construire en Compose en consommant ce flux.

Rendu : Capsule compacte 22 pt (la grande taille ×1,6 n'apparaît que pour la frappe d'amis) ; pastille de statut de 6 pt : brand indigo dégradé (en cours), ambre (hors-ligne / reconnexion), vert (« En ligne » transitoire ~4 s au retour), rouge (échec définitif) ; une entrée à la fois qui tourne, compteur à droite ; tap sur une entrée avec source navigue vers le message, le post ou la story.

Transposition Android : SyncPill (capsule SwiftUI qui tourne) → Surface Compose en haut de l'écran / indicateur dans le TopBar ; peut aussi alimenter une notification de progression ongoing pour les envois longs.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxPendingIndicator.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxUIItem.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueuePillProviding.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConnectionBanner.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxRepository.kt`

### Les données locales (messages, conversations, cache) sont chiffrées au repos

`pco-encrypted-local-storage` · Android : **absente** · P1 · effort M

Les stores GRDB déclarés encrypted: true (conversations, messages, stories, notifications, demandes d'amis, bloqués, sessions, carnet d'adresses, historique d'appels, préférences…) chiffrent chaque ligne en AES-GCM avec une clé tenue au Keychain. Un échec de chiffrement lève .encryptionFailed (jamais de repli en clair, ce qui fuirait du plaintext dans SQLite si la clé est corrompue) ; un échec de déchiffrement à la lecture rend nil et retombe sur le réseau (SWR). L'empreinte contentHash est préfixée de l'identité de clé pour que changer de clé invalide.

Écarts :
- Le commentaire de MeeshyDatabase annonce SQLCipher (ADR-013) mais DatabaseModule construit Room sans SupportFactory : messages, conversations et outbox sont en clair. Brancher SQLCipher (passphrase aléatoire enveloppée par une clé AES-256-GCM de l'Android Keystore, StrongBox si dispo) ou un chiffrement par ligne (Tink AEAD) selon la décision ADR.
- Migrer la base claire existante vers la base chiffrée (sqlcipher_export) sans perdre l'outbox ni les médias en file.
- Échec de chiffrement = erreur propagée (jamais de repli en clair) ; échec de déchiffrement = cache miss silencieux qui déclenche une revalidation réseau.
- Chiffrer aussi les DataStore qui contiennent du contenu (brouillons de conversation, brouillon du composer de story, snapshot de catégories) et les fichiers de la file média.
- Exclure base, DataStores et fichiers de file des sauvegardes Android (allowBackup/dataExtractionRules) pour que la clé non exportable ne rende pas une restauration illisible.
- Perte de clé (Keystore invalidé, réinstallation, changement biométrique) : détecter, purger le cache et repartir à froid sans crash.

Transposition Android : Clé Keychain + AES-GCM par ligne → Android Keystore (AES-256-GCM) + SQLCipher pour Room ou Tink AEAD sur les payloads.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheL2.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift`

</details>

Android existant : `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/MeeshyDatabase.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/DatabaseModule.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/EncryptedTokenStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/lock/EncryptedConversationLockStore.kt`

### La recherche trouve conversations, personnes et messages instantanément, même hors-ligne

`pco-local-fts-search` · Android : **absente** · P1 · effort M

messages_fts est une table FTS5 à contenu externe (le contenu reste dans messages, triggers insert/update/delete) avec tokenizer unicode61 remove_diacritics 2 : une requête accentuée française se replie de la même façon sur les trois portées. SearchIndex (acteur) tient deux tables FTS5 autonomes conversations_fts et users_fts, projections du cache (le cache reste la source de vérité) maintenues par DELETE puis INSERT, classées BM25, avec sanitisation (guillemets échappés, aucun opérateur FTS5 brut injecté). Un backfill initial indexe le cache existant ; GlobalSearchViewModel amorce les résultats locaux avant l'arrivée du REST.

Écarts :
- La recherche globale est REST uniquement (trois volets en parallèle) et la recherche dans une conversation ne couvre que la fenêtre chargée : créer des tables FTS Room (@Fts4, tokenizer unicode61 remove_diacritics=2) pour messages, conversations et utilisateurs.
- Indexation incrémentale à l'upsert, à l'édition et à la suppression des messages (triggers ou écriture explicite), plus un backfill au premier lancement.
- Sanitisation des requêtes (échapper les guillemets, neutraliser les opérateurs) et classement par pertinence (équivalent BM25 via matchinfo).
- Amorcer les résultats locaux avant la réponse du REST puis dédoublonner par id avec tri stable pour éviter les sauts.
- Recherche dans une conversation et saut vers un résultat via la fenêtre « autour d'un message ».

Rendu : Les résultats locaux apparaissent à la frappe sans spinner, puis se complètent avec ceux du serveur sans saut ; groupes Conversations / Personnes / Messages, requête surlignée dans les extraits.

Transposition Android : FTS5 externe GRDB → Room @Fts4(contentEntity) (ou FTS5 via SupportSQLite) avec tokenizer unicode61.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Search/SearchIndex.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/SearchIndexMigrations.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/search/GlobalSearchRepository.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/GlobalSearchViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatSearch.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/search/RecentSearchesStore.kt`

### Photos, vocaux et vidéos déjà vus se rouvrent instantanément sans réseau, dans un budget d'espace maîtrisé

`pco-media-disk-cache-lru` · Android : **absente** · P1 · effort L

DiskCacheStore (acteur) est le cache média typé : un L1 mémoire de Data brut (80 Mo par défaut, budget réduit pour audio/vidéo qui passent par des URL de fichier), un L2 disque de fichiers nommés par SHA-256 de l'URL avec TTL et budget en octets LRU (Images 300 Mo, Audio 200 Mo, Vidéo 1 Go, Vignettes 150 Mo ; 1 Go pour la vidéo parce qu'une seule story vidéo pèse ~275 Mo). Quatre instances : images, audio, video, thumbnails. API : load / save / store(honoring response), data(for:), localFileURL, isCached, seed(copyingLocalFile:) et adopt(localFile:) (déplacer un fichier local sous une clé canonique), registre de téléchargements en vol (un seul transfert par clé), evictExpired, evictOverBudget, clearAll, estimatedDiskBytes. Pinning : pin(key, until:) rend une clé non évincable jusqu'à une échéance (rejeu hors-ligne R5 — le store ne décide pas CE qui mérite une épingle, la politique côté app le fait, ex. les médias d'une story vue jusqu'à son expiration), persisté dans un sidecar caché .pins.json pour qu'un balayage au boot n'évince pas une épingle du lancement précédent. Une clé dont la dernière réponse interdisait le stockage (no-store / no-cache) n'écrit ni disque, ni L1, ni bitmap décodé.

Écarts :
- Aucun cache disque typé : les images passent par le cache disque par défaut de Coil (dossier image_cache), l'audio et la vidéo sont lus en streaming sans cache (les dossiers media/audio et media/video de MediaCacheStore ne sont jamais remplis) : créer quatre caches typés (images, audio, vidéo, vignettes) avec budgets 300/200/1000/150 Mo, TTL et éviction LRU.
- Clé de fichier SHA-256 de l'URL canonique ; localFileURL pour les players (audio/vidéo lus depuis un fichier local).
- Épingles (pin jusqu'à une échéance, persistées dans un sidecar) exemptes de l'éviction LRU ET TTL : politique côté app « médias d'une story vue jusqu'à son expiration ».
- seed / adopt d'un fichier local sous une clé canonique (voir adoption du média envoyé).
- Respect de Cache-Control : no-store / no-cache ne persistent rien (voir funnel réseau).
- Un seul transfert en vol par clé (dédoublonnage) et L1 mémoire borné avec budget réduit pour audio/vidéo.
- Pour Media3, utiliser SimpleCache + CacheDataSource avec évincement LRU (LeastRecentlyUsedCacheEvictor) et clés canoniques ; pour Coil, DiskCache.Builder avec maxSizeBytes.

Rendu : Aucun spinner sur média déjà vu : affichage immédiat depuis le disque, y compris hors-ligne ; placeholder ThumbHash/vignette tant que le plein format charge.

Transposition Android : DiskCacheStore GRDB/fichiers → Coil DiskCache (images, vignettes) + Media3 SimpleCache/LeastRecentlyUsedCacheEvictor (audio, vidéo) dans cacheDir ; sidecar d'épingles → fichier JSON ou table Room.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore+Pinning.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBox.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaCacheStore.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`

### Les médias se téléchargent une seule fois, en flux vers le disque, avec les bons droits et sans gaspiller le réseau mobile

`pco-media-network-funnel-streaming` · Android : **absente** · P1 · effort M

Tout fetch distant d'un store passe par UN entonnoir (DiskCacheStore+NetworkFunnel) : les appelants concurrents d'une même clé partagent UNE tâche (la même note vocale chargée 2-3 fois en parallèle saturait une liaison lente, NSURLError -1001 × 50). Un appelant rejoint le transfert en vol quel que soit son profil ; si ce transfert, plus restreint (préchargement différé interdit de réseau facturé), échoue sur le réseau, il reprend avec SON profil (#11283). DiskCacheStore+NetworkRequest construit la requête : l'origine de l'API Meeshy (même scheme+host+port) reçoit Authorization: Bearer (prioritaire) ou X-Session-Token, car certaines routes média sont protégées ; toute autre origine (CDN, tiers) reste NUE (un jeton ne fuite jamais), http(s) et ports implicites normalisés. DiskCacheStore+FileTransfer + MediaFileDownloader téléchargent vers un FICHIER (URLSessionDownloadTask) jamais vers un Data (une vidéo de 30 Mo ne transite pas en RAM), puis le déplacent sous sa clé ; la progression est cadencée (TransferProgressCadence : au plus un rapport par intervalle minimal, plus toujours le premier et le dernier, sinon des centaines de rapports par seconde republient toutes les surfaces). MediaTransferProfile (priorité immediate vs deferrable) dérive la configuration de session (une session ne change pas de config après création, donc une session par profil) selon le réglage de données mobiles. MediaCacheDirective lit Cache-Control : persist (cache nominal), revalidateEachUse (private, no-cache : éphémère vivant), refuse le stockage (private, no-store : vue unique encore dans son sursis) ; un 404 signifie fichier rappelé, expiré ou consommé.

Écarts :
- Un seul transfert par clé de média partagé par tous les appelants (images, audio, vidéo, vignettes), avec reprise sous le profil propre de l'appelant si le transfert partagé plus restreint échoue.
- Authentification conditionnelle : Bearer ou X-Session-Token UNIQUEMENT vers l'origine de l'API Meeshy (comparaison scheme+host+port avec ports implicites), requête nue vers tout autre hôte (Coil/OkHttp : intercepteur sélectif).
- Téléchargement en flux vers un fichier puis déplacement sous la clé, sans Data résident, pour audio et vidéo ; progression cadencée (premier + dernier rapport, intervalle minimal) pour ne pas recomposer toutes les surfaces à chaque paquet.
- MediaTransferProfile immediate vs deferrable relié au réglage de données mobiles / réseau facturé (NetworkConditionMonitor + MediaDownloadPreferencesStore existent) pour différer les préchargements.
- Lecture de Cache-Control : no-store ⇒ jamais écrit, no-cache ⇒ revalider à chaque usage, 404 ⇒ média rappelé/expiré/consommé (ne pas réessayer, nettoyer).
- Aujourd'hui les fichiers passent par DownloadManager (documents) et Coil sans ces règles : unifier derrière un entonnoir de téléchargement.

Rendu : Progression de téléchargement affichée dans la bulle (anneau/barre) mise à jour à cadence limitée ; aucun clignotement quand plusieurs surfaces montrent le même média.

Transposition Android : URLSession par profil + URLSessionDownloadTask → OkHttp avec Interceptor d'auth par origine + téléchargement en fichier (Okio) ; profil deferrable → WorkManager avec contrainte NetworkType.UNMETERED selon le réglage.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore+NetworkFunnel.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore+NetworkRequest.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore+FileTransfer.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/MediaFileDownloader.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/MediaTransferProfile.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/MediaCacheDirective.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/NetworkModule.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/NetworkConditionMonitor.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaDownloadPreferencesStore.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownloader.kt`

### L'historique local reste léger : purge des vieux messages, des éphémères échus et des lignes mortes

`pco-message-retention-purge` · Android : **absente** · P1 · effort S

Retention.purgeOldMessages(retentionMonths: 6 par défaut) s'exécute au lancement et supprime les messages plus anciens avec cascade sur message_translations, message_transcriptions, message_audio_translations, pending_ids et send_attempts (le serveur reste la source : une pagination les rechargera). Housekeeping.deleteAll(conversationId) purge une conversation sur 403 / accès révoqué avec cascade aux tables enfants (aucun orphelin) ; deleteExpiredEphemeral balaie les échus. Côté acteur : clearOutbox, clearAllMessagesForLogout, purgeExhaustedOlderThan(jours) et pendingOutboxCount.

Écarts :
- Aucune rétention : seules clearConversation() et clear() existent. Ajouter un balayage au lancement (messages de plus de 6 mois) avec cascade aux tables enfants (traductions, transcriptions, pistes audio traduites, ids en attente, tentatives d'envoi).
- Purge d'une conversation sur 403 / accès révoqué / conversation supprimée, avec cascade sans orphelin.
- Purge des lignes d'outbox épuisées plus anciennes que N jours.
- Borne de taille de la table messages par conversation (cohérente avec le plafond de CachePolicy.messages).
- Exécuter la rétention via WorkManager (idle + charging) pour ne pas retarder le démarrage.

Transposition Android : Purge au lancement → WorkManager périodique/au démarrage (OneTimeWork idle) ; cascade → clés étrangères Room ON DELETE CASCADE.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+Retention.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+Housekeeping.swift`

</details>

Android existant : `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/MessageDao.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`

### Publier un post ou commenter hors-ligne : la publication attend, reprend ses envois partiels et peut être annulée

`pco-offline-post-comment-publication` · Android : **absente** · P1 · effort M

OfflineQueue+PostMediaProgress mémorise la progression d'un téléversement multi-médias : un réel à trois médias (13 + 2,1 + 40,7 Mo) était épuisé alors que les trois fichiers étaient intacts parce que dispatchCreatePost reparcourait localMediaPaths depuis l'index 0 à chaque rejeu ; chaque média fini est désormais rangé (UploadedPostMedia) et la suite reprend. OfflineQueue+CommentMedia fait de même pour les commentaires, avec l'instant du téléversement : le serveur balaie au bout de 24 h un média pré-téléversé non réclamé, donc un rejeu tardif re-téléverse (fichier toujours sur disque) plutôt que de présenter un id disparu (fenêtre de présentation sous 24 h) ; un commentaire en attente appartient à son auteur (ownerId prouvé, notTheAuthor sinon), unsentComments(postId) liste les non-envoyés et cancelCreateComment les retire. OfflineQueue+PublicationCancel : « Supprimer » une publication encore en file retire la ligne (removed) ou, si elle est en vol, pose une marque d'annulation durable (cancelRequested) vérifiée au prochain point de contrôle ; recoverLastUnsentPost restaure le composer depuis la dernière publication bloquée.

Écarts :
- Publier un post ou un réel et commenter passent par le réseau direct (FeedViewModel.publishPost, uploadMedia) : hors-ligne l'action est perdue. Ajouter les kinds createPost et createComment avec médias, hors-ligne et reprise automatique.
- Mémoire de progression d'upload multi-médias (UploadedPostMedia) qui survit à une tentative échouée et reprend à l'index suivant au lieu de l'index 0.
- Horodater chaque id téléversé et re-téléverser quand il a dépassé la fenêtre de présentation (24 h côté serveur moins marge), le fichier source restant sur disque.
- Commentaire en attente rattaché à son auteur (ownerId) : jamais visible ni rejoué sous un autre compte ; unsentComments(postId) pour afficher « non envoyé ».
- Annulation d'une publication encore en file (removed) ou en vol (marque cancelRequested durable + point de contrôle) et recoverLastUnsentPost pour rouvrir le composer sur une publication bloquée.
- Annuler un commentaire non envoyé (cancelCreateComment) et dédupliquer un second enfilage identique (hasUnsentRow).

Rendu : Un commentaire non envoyé s'affiche dans le fil avec l'état « En attente » (atténué, icône horloge) et un geste pour annuler ; un post bloqué propose « Reprendre » et « Supprimer ».

Transposition Android : Mêmes kinds d'outbox + dossier de fichiers en file ; annulation en vol → colonne cancelRequestedAt et vérification entre deux PATCH.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue+CommentMedia.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue+PostMediaProgress.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue+PublicationCancel.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/FeedViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/PostRepository.kt`

### Un média que je viens d'envoyer ne se retélécharge jamais une fois confirmé par le serveur

`pco-optimistic-media-adoption` · Android : **absente** · P1 · effort S

À l'ACK, quand fileUrl d'une pièce optimiste passe de file:// (chemin local du bac à sable) à https:// (URL canonique), le fichier local est déplacé dans le cache média typé sous la clé canonique : la prochaine lecture de l'URL canonique est un hit disque instantané. No-op si previousFileUrl est nil (message reçu), déjà https (rafraîchissement REST), nouvelle URL non http(s) (upload échoué), fichier local absent ou pièce .file/.location. En production l'adoption s'exécute au niveau SDK (adoptSDKLevel) AVANT l'UPDATE de la ligne, pour que la clé soit chaude au re-render ; le helper de l'app est déprécié et ne sert plus qu'aux tests.

Écarts :
- Dans reconcileSent, copier ou déplacer le fichier local vers le cache média disque sous la clé de l'URL canonique (clé de cache Coil / Media3) avant de réécrire la ligne.
- Mêmes no-ops : déjà https, fichier source absent, upload échoué, documents et localisations.
- Supprimer le fichier de la file média (pending) une fois adopté.
- Coil : ImageLoader.diskCache.openEditor(clé canonique) pour les images ; audio/vidéo : cache typé de la fonctionnalité disque (ou SimpleCache Media3).

Transposition Android : Adoption dans DiskCacheStore → écriture dans le cache disque Coil (images) et le cache média typé (audio, vidéo).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/OptimisticAttachmentAdopter.swift`

</details>

### Un vocal ou une vidéo reprend là où je me suis arrêté, et la forme d'onde montre déjà ce que j'ai écouté

`pco-playback-position-consumption` · Android : **absente** · P1 · effort M

AudioPlaybackPositionStore et VideoPlaybackPositionStore (miroirs stricts) gardent la dernière position de lecture par pièce jointe (clé opaque attachmentId, valeur position en secondes + updatedAt), plafonnés à 500 entrées avec élagage des moins récemment mises à jour (égalités départagées par clé) dans un singleton UserDefaults dont la logique pure (set / remove / prune / position) est testable sans UserDefaults. MediaConsumptionStore est distinct : la progression « au repos » MONOTONE (ne fait que croître, gardée après la fin pour qu'un média entièrement écouté reste « consommé ») — fraction maximale atteinte bornée à 0...1 — utilisée pour teinter la forme d'onde d'un vocal ou la barre de progression d'une vidéo AVANT que la lecture démarre.

Écarts :
- Créer un store de positions de lecture audio et vidéo par attachmentId (DataStore), plafonné à 500 entrées avec élagage LRU et tri déterministe en cas d'égalité, logique pure testée.
- Reprendre la lecture à la dernière position au lancement d'un vocal ou d'une vidéo, et effacer la position à la fin ou quand le média est rejoué depuis le début.
- Store de consommation monotone (fraction maximale atteinte, jamais décroissante, conservée après la fin) distinct des positions.
- Teinter la forme d'onde d'un vocal et la barre de progression d'une vidéo selon cette consommation dès l'affichage de la bulle.

Rendu : Forme d'onde d'un vocal teintée (couleur d'accent de la conversation) jusqu'à la fraction consommée, avant lecture ; barre de progression vidéo pré-remplie ; reprise visible par le curseur à la position mémorisée.

Transposition Android : UserDefaults JSON → DataStore Preferences/Proto, par compte.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/AudioPlaybackPositionStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/VideoPlaybackPositionStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/MediaConsumptionStore.swift`

</details>

### Une story que j'ai vue reste marquée vue, même hors-ligne et après un rafraîchissement du plateau

`pco-story-viewed-ledger` · Android : **absente** · P1 · effort S

StoryViewedLedger garde les stories qu'un compte a VUES sur cet appareil avec le moment de la vue (StoryViewedEntries, protocole StoryViewedLedgerProviding). Avant #9804 l'état « vu » n'était qu'un drapeau dans l'instantané du plateau (recent_tray_v2) : tout chemin qui reconstruisait le plateau depuis le serveur sans le plateau en mémoire le perdait (préchargement de liste, cold start sur cache vide, tirer-pour-rafraîchir) et l'anneau épais revenait, tant que le serveur n'avait pas reçu la vue (hors-ligne) ou ne la recevrait jamais (ses propres stories : le serveur n'enregistre pas la vue de l'auteur). Le registre est une source DISTINCTE de l'instantané, réinjectée à chaque reconstruction.

Écarts :
- Créer un registre local persistant story → date de vue par compte (DataStore ou table Room) séparé du cache du plateau.
- Réinjecter l'état « vue » à chaque reconstruction du plateau (revalidation, cold start, refresh) pour que l'anneau ne repasse pas en « non vu ».
- Couvrir les stories de l'utilisateur lui-même (le serveur n'enregistre pas la vue de l'auteur).
- Mettre en file la vue côté serveur via un kind markStoryViewed coalescé par story (aujourd'hui markViewed est un appel direct perdu hors-ligne).

Rendu : Anneau de story : fin et grisé une fois vue, épais et coloré tant que non vue ; ne repasse jamais en épais après une revalidation.

Transposition Android : StoryViewedLedger (UserDefaults par compte) → DataStore Preferences par compte.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/StoryViewedLedger.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`

### Quand le téléphone manque d'espace, l'app libère son cache média intelligemment sans casser une lecture en cours

`pco-media-disk-pressure-eviction` · Android : **absente** · P2 · effort M

DiskPressureReclaimPlan est la règle pure d'éviction (IL8, #11286) : sous triggerFreeBytes de capacité libre, évincer du plus ancien au plus récent (LRU sur la date de modification) jusqu'à atteindre targetFreeBytes ; jamais une victime : une épingle active, un téléchargement en cours, un fichier servi par URL depuis moins de readRegistry.window (CacheReadRegistry : un player reçoit une URL de fichier et la lit à côté du store sans le prévenir, donc « récemment servi » protège le fichier qu'un player s'apprête à ouvrir ; au-delà de la fenêtre un player qui a déjà OUVERT le fichier continue de lire après suppression, le descripteur gardant l'inode). DiskCacheStore+DiskPressure lit la capacité réelle du volume (échec de lecture ⇒ aucune éviction, fail-open, URL neuve à chaque lecture car une URL met en cache ses valeurs de ressource). DiskPressureSweeper (côté app) déclenche une passe sur les quatre caches au lancement et à chaque retour au premier plan, au plus une par 10 minutes, jamais deux à la fois, jamais sur le fil principal.

Écarts :
- Implémenter la règle pure de reclaim (seuil déclencheur, cible, LRU par date de modification, fichiers protégés) avec tests, sur les quatre caches typés.
- Lire l'espace libre réel (StatFs sur cacheDir, ou StorageManager.getAllocatableBytes) en échec ouvert : une lecture impossible n'évince rien.
- Registre « récemment servi » pour protéger un fichier remis à un player, plus les épingles actives et les téléchargements en cours.
- Déclencheur côté app : au lancement et à chaque retour au premier plan (ProcessLifecycleOwner), au plus une passe par 10 minutes, jamais concurrente, hors fil principal ; écouter aussi ACTION_DEVICE_STORAGE_LOW.
- Variante WorkManager (idle, batterie non faible) pour une passe périodique.

Transposition Android : volumeAvailableCapacityForImportantUsage → StatFs / StorageManager ; didBecomeActive → ProcessLifecycleOwner.onStart ; BGTask → WorkManager.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore+DiskPressure.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskPressureReclaimPlan.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheReadRegistry.swift`
- `apps/ios/Meeshy/Core/DiskPressureSweeper.swift`

</details>

### Le composer de story signale discrètement que je suis hors-ligne et que ma story partira à la reconnexion

`pco-story-timeline-offline-badge` · Android : **absente** · P2 · effort S

OfflineIndicatorBadge est une capsule ambiante, non alarmante (ni rouge, ni modale, ni bannière), affichée dans la barre du haut de l'éditeur timeline uniquement quand l'appareil est hors-ligne et qui ne consomme aucun espace quand il est connecté. Libellé « Hors-ligne » avec glyphe avion, texte indigo 300 à 80 % d'opacité sur une capsule ultraThinMaterial ; accessibilité combinée « Hors-ligne — votre story sera publiée à la reconnexion ».

Écarts :
- Ajouter la capsule « Hors-ligne » (icône avion + texte) dans la TopBar du composer de story, visible seulement hors-ligne et sans réserver d'espace quand connecté (seule la chaîne stories_composer_media_pending existe).
- Ajouter la contentDescription « Hors-ligne — votre story sera publiée à la reconnexion » et les traductions des 7 langues.
- Utiliser le token indigo 300 à 80 % sur une surface translucide (équivalent Material blur/tonal) sans rouge ni dialogue.

Rendu : Capsule, police 11 pt medium, icône avion à la taille xxs, couleur indigo300 à 80 %, padding horizontal sm et vertical 3 pt, fond ultraThin (verre) ; invisible et sans emprise quand en ligne ; aucune animation alarmante.

Transposition Android : Capsule ultraThinMaterial → Surface Compose translucide (MeeshyGlassSurface) avec icône Flight/airplane.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Views/Indicators/OfflineIndicatorBadge.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/res/values-fr/strings.xml`

### Une mise à jour de l'app ne détruit ni les messages en attente d'envoi ni le cache

`pco-db-migrations-no-data-loss` · Android : **divergente** · P0 · effort M

iOS versionne son schéma par migrations nommées et append-only (v1_create_tables à v10, feed_v1 à feed_v6, msg_v1_* plus colonnes ajoutées messages_*, outbox à outbox_v4, send_attempts, messages_fts5, search_idx_v1), protocole DatabaseMigration, exécutées au cold start sur le fil principal en attendant la barrière d'écriture (busy timeout 5 s, la NSE peut tenir un verrou sur le fichier de l'App Group). Rien n'est détruit : colonnes nullables ajoutées, reconstruction de table quand une clé primaire change, purge ciblée (v10 purge les canvas ré-encodés par v1). Les trois groupes (cache, messages, feed) s'enregistrent dans un migrator partagé.

Écarts :
- Room est en version 16 avec fallbackToDestructiveMigration() et exportSchema = false : toute montée de version SUPPRIME toutes les tables, y compris outbox (messages, réactions, stories non envoyés), media_blobs (médias en file) et tus_upload_checkpoint. Remplacer par de vraies Migration(from, to) ou AutoMigration pour chaque bump.
- Activer exportSchema = true, versionner le répertoire schemas et écrire des tests MigrationTestHelper qui rejouent chaque pas.
- Interdire la destruction des tables durables (outbox, media_blobs, checkpoints TUS, watermarks sync_meta) : si une migration échoue, ne reconstruire que les tables de cache (reconstructibles) et conserver l'outbox.
- Limiter fallbackToDestructiveMigrationOnDowngrade aux seules tables de cache.
- Garde CI qui échoue si la version change sans migration ni schéma JSON, et documenter la v16 actuelle comme baseline.
- Prévoir la reconstruction de table (copie, drop, rename) pour les changements de clé primaire, comme iOS l'a fait pour les brouillons multi-story.

Transposition Android : GRDB DatabaseMigrator (migrations nommées) → Room Migration/AutoMigration + schémas JSON exportés.

<details><summary>Sources iOS (9)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Migrations/DatabaseMigration.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Migrations/AppDatabaseMigrations.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageDatabaseMigrations.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/FeedDatabaseMigrations.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Migrations/FeedMigrations.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Migrations/MessageMigrations+Columns.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Migrations/MessageMigrations+Outbox.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Migrations/MessageMigrations+Tables.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/SearchIndexMigrations.swift`

</details>

Android existant : `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/MeeshyDatabase.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/DatabaseModule.kt`

### Un vocal, une photo ou un fichier enregistré hors-ligne part tout seul au retour du réseau, même si l'app a été tuée

`pco-offline-media-message-uploads` · Android : **divergente** · P0 · effort M

OfflineQueue+Audio en deux phases : A) la ligne d'outbox est insérée, B) le fichier est copié dans Documents/pending-audio (chemin relatif stable renvoyé à l'appelant pour qu'il remplace l'URL volatile tmp/recording_*.m4a). Si la copie échoue après l'insertion, la ligne passe .failed (le flusher ne rejoue pas contre un fichier absent) et l'appelant doit défaire son UI optimiste ; si l'insertion échoue, aucun fichier fantôme n'est créé. enqueueAudio(s) et enqueueMedia (plusieurs pièces, natures alignées, nom d'origine) gèrent audio, image, vidéo, fichier ; enqueuePostMedia sert les publications. TusUploadCheckpoint persiste, par SHA-256 des octets du fichier, l'URL de session TUS et byteOffset : un retry reprend le PATCH à l'offset au lieu de repartir de zéro, y compris après un kill. Au boot, un pending dont le fichier a disparu est marqué failed, et les fichiers orphelins sont nettoyés à l'état terminal (appliqué ou épuisé).

Écarts :
- MediaBlobStore stocke les octets bruts dans un BLOB Room (MediaBlobEntity.bytes) : une lecture au-delà d'environ 2 Mo dépasse la fenêtre de curseur SQLite (SQLiteBlobTooBigException) et tout le média reste en mémoire pendant l'upload (TusUploadRepository l'écrit lui-même : la reprise ne survit pas à un kill). Passer à un stockage fichier (filesDir/pending-media/<cmid>) avec chemin relatif persisté et upload en flux depuis le fichier.
- Enfilage en deux phases (ligne d'abord, copie du fichier ensuite) avec marquage failed si la copie échoue et aucun fichier fantôme si l'insertion échoue.
- Reprise TUS après kill : clé de checkpoint dérivée du hash du fichier et offset persisté, source lue paresseusement depuis le fichier (aujourd'hui seule la reprise intra-process fonctionne).
- Balayage au démarrage : ligne pending dont le fichier a disparu → failed ; suppression des fichiers orphelins à l'état terminal (appliqué ou épuisé).
- enqueueMedia multi-pièces (natures alignées par index) pour audio, image, vidéo, fichier, avec nom d'origine, et chemin de publication de post.
- Migrer les blobs existants vers des fichiers sans perdre les uploads en file.

Rendu : La bulle vocale/média apparaît immédiatement avec progression indéterminée puis déterminée ; hors-ligne, l'état « en attente » est affiché par la pastille, jamais par une erreur.

Transposition Android : Documents/pending-audio → context.filesDir/pending-media (hors sauvegarde) ; upload TUS en flux via RequestBody.writeTo(sink) depuis un File.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue+Audio.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/TusUploadCheckpoint.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaBlobStore.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/MediaBlobEntity.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/TusUploadRepository.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/TusUploadCheckpointEntity.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaUploadQueue.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaUploadSender.kt`

### Changer de compte n'expose jamais les données de l'autre, et revenir sur un compte retrouve son cache

`pco-cache-account-isolation` · Android : **divergente** · P1 · effort M

Le cache vivant n'a aucune colonne propriétaire : CacheCoordinator+Accounts tient un marqueur persistant liveOwner (unrecorded, nobody, interrupted, account(clé)). CacheAccountBinder lie le cache au compte ACTIF dans l'ordre des demandes (file sérielle, une liaison déjà faite est sans effet) : archive le cache du compte quitté s'il est conservé (compte sauvegardé), restaure l'archive du compte entrant, sinon efface ; une bascule interrompue efface le contenu orphelin. MessageStoreAccountKey = utilisateur + environnement (prod et staging ont le même id) et chaque compte a SON fichier de base des messages. SyncCheckpointVault met de côté et rend le point de reprise de sync avec son cache (un point de reprise sans son cache ferait prendre une liste vide pour à jour). SessionPurgeDecision n'autorise la purge qu'à la fin de session CONSTATÉE (sessionResolved ET non authentifié), jamais au cold start avant checkExistingSession : une course d'abonnement Combine avait effacé 25 messages et 7 lignes d'outbox à chaque démarrage.

Écarts :
- Une seule base Room pour tous les comptes, vidée par clearAllTables() au logout (SessionTeardown) : repasser sur un compte conservé repart à froid et un envoi non parti est perdu. Passer à une base par compte (fichier nommé d'après hash(userId + environnement API)) avec DataStores préfixés par compte.
- Marqueur liveOwner persistant et liaison sérielle (Mutex ou Channel) à chaque entrée/sortie de session : archiver, restaurer ou effacer ; une bascule interrompue efface.
- Conserver le cache des comptes de SavedAccountsStore et l'oublier à forget(compte) ; sweep(keeping: comptes sauvegardés) au démarrage.
- Règle SessionPurgeDecision tri-état (résolue/authentifiée) : ne jamais purger pendant l'initialisation (un StateFlow rejoue sa valeur initiale false à tout nouvel abonné).
- Clé d'environnement (production vs staging) dans l'identité du compte pour que le même id ne partage pas un fichier.
- Point de reprise de sync (watermarks sync_meta, SyncSeqState) mis de côté avec son cache : ne jamais appliquer le watermark d'un compte au cache d'un autre.
- Le wipe doit aussi supprimer les fichiers de la file média, les DataStores et les caches disque du compte non conservé.

Transposition Android : Fichier GRDB par compte + archive → fichiers Room par compte (context.getDatabasePath) + DataStore par compte ; App Group partagé avec la NSE → inutile (le service FCM tourne dans le même process).

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheAccountBinder.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator+Accounts.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageStoreAccountKey.swift`
- `apps/ios/Meeshy/Core/SessionPurgeDecision.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/SavedAccountsStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionRepository.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/DatabaseModule.kt`

### Toutes les listes (conversations, profils, notifications, communautés, appels…) se rouvrent instantanément depuis le disque

`pco-cache-coordinator-l1-l2-stores` · Android : **partielle** · P0 · effort L

CacheCoordinator est le registre unique des stores GRDB typés (conversations, messages, conversationMedia, participants, profils, feed, commentaires, stories, stats, participantProfiles, notifications, liens de partage/suivi/communauté, communautés, brouillons, transcriptions et journaux réseau d'appels, statuts, amis, demandes, bloqués, sessions, recherche utilisateurs, carnet d'adresses, affiliés, historique d'appels, timeline, catégories, tags, préférences). Chaque GRDBCacheStore a un L1 mémoire borné (maxL1Keys 20, LRU) devant un L2 SQLite cache_entries (namespace, itemId, position, contentHash SHA-256, lastFetchedAt). L'écriture est un diff : lignes sorties supprimées, lignes au plaintext inchangé sautées, seul le reste est chiffré et écrit. Trois modes d'écriture : save (un fetch réseau avance l'horloge SWR), savePreservingFreshness (une mutation locale ne rend pas la clé faussement fraîche) et saveAsStale (instantané poussé par la NSE : se peint ET se revalide). Un dirty-set est vidé avec debounce, flushAll(deadline) par ordre de criticité à la mise en arrière-plan et à la terminaison (BGProcessingTask de secours), éviction mémoire sur memory warning, reset()/invalidateAll() parcourent l'inventaire unique de stores (aucun oublié au logout).

Écarts :
- Stores Room absents : profils (30 j, 100), participants paginés, participantProfiles, notifications (aujourd'hui en mémoire dans NotificationRepository), communautés et liens (partage, suivi, communauté, affilié), engagementProgress, transcriptions et journaux réseau d'appels, userSearch, carnet d'adresses, timeline, sessions, tags utilisateur, préférences utilisateur et par conversation, conversationMedia ; feed et commentaires ont leur propre fiche.
- Introduire une table générique cache_entries (namespace, key, itemId, position, contentHash, lastFetchedAt, payload) et un CacheStore<K,V> générique pour ne pas créer une entité Room par ressource.
- Écriture-diff par contentHash et suppression des lignes sorties : une revalidation sans changement ne réécrit rien et n'invalide donc aucun Flow Room (évite la recomposition de toute la liste).
- Trois modes d'écriture distincts (fetch réseau avance l'horloge de fraîcheur, mutation locale la préserve, instantané poussé par FCM la date juste au-delà de la fenêtre fraîche pour forcer revalidation).
- L1 mémoire borné (20 clés, LRU) devant Room pour des lectures synchrones au scroll, avec vidage sur ComponentCallbacks2.onTrimMemory.
- Flush ordonné par criticité sur ON_STOP et trim mémoire critique, et inventaire unique de stores parcouru par reset()/invalidateAll() avec un test de complétude qui rougit si un store est oublié (leçon iOS #7146 : le carnet d'adresses du compte précédent survivait).
- Patch des caches sur événements sociaux (like d'un post → caches feed et favoris) pour que la valeur affichée ne régresse pas à la revalidation.

Rendu : Invisible mais mesurable : ouverture d'une liste depuis L1 en moins d'une frame, jamais de spinner sur cache non vide.

Transposition Android : GRDB DatabasePool + cache_entries → Room + table générique ; BGProcessingTask de flush → inutile (Room écrit en direct), garder le flush L1→Room sur ON_STOP ; memory warning → onTrimMemory.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheL2.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/CacheEntry.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DBCacheMetadata.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheBackgroundFlushTask.swift`

</details>

Android existant : `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/MeeshyDatabase.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/ConversationEntity.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/SyncMetaEntity.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/CallHistoryCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/category/CategorySnapshotStore.kt`

### La liste de conversations réagit instantanément aux gestes et aux événements, avec une seule règle de fusion

`pco-conversation-store-ram-ssot` · Android : **partielle** · P0 · effort M

ConversationStore est la source de vérité en RAM de l'état par utilisateur de chaque conversation chargée (acteur, éditeurs Combine par conversation et pour la liste) : hydrate / hydrateList / hydrateMetadata / hydrateFromCache, apply(mutation, for:) = optimistic + outbox + dispatch + ACK/rollback, flushOutbox, adoptLocalAppearance, applyRemote (USER_PREFERENCES_UPDATED avec garde de version), applyReadReceipt, applyServerUnread, applyConversationDeleted/Restored, applyConversationUpdated (remontée en tête sur nouveau message + métadonnées titre/avatar), applyUserUpdated (profil d'un contact : nom composé, avatar, bannière sur la ligne de conversation directe), createSectionAndAssign, reorderConversations / applyRemoteReorder (glisser pour réordonner). ConversationStoreMergeRules sont des règles PURES partagées par le store RAM et l'écrivain du cache disque, pour qu'ils ne divergent jamais sur le sens d'un payload socket ; ConversationUpdatedStoreEvent porte une identité de dernier message tri-état (.unchanged pour une clé absente, .replaced(nil) pour « plus aucun message visible pour ce lecteur »), l'auteur du dernier message et le groupe média. Les événements et les seams (ConversationPreferenceWriting, ConversationCacheReading, ConversationLifecycleWriting, ConversationCategoryCreating) découplent le store de la couche socket et du réseau.

Écarts :
- Room fait office de SSOT avec des gestes optimistes (pin, mute, archive, catégorie, nom, réaction, tags) et applyRemoteConversationPreferences, mais la plupart des événements socket (unread-updated, conversation:updated, restored, participant-left) déclenchent seulement requestRefresh() (re-fetch de la liste) au lieu d'une fusion en place : implémenter des règles de fusion pures (remontée en tête, titre/avatar, compteur) appliquées au cache.
- Identité de dernier message tri-état (inchangé / remplacé / remplacé par rien) pour qu'une clé absente n'efface pas l'aperçu mais que « plus aucun message visible pour ce lecteur » le fasse.
- Traiter user:updated : repeindre nom composé, avatar et bannière de la ligne d'une conversation directe avec ce contact (aucun traitement côté sdk-core).
- Garde de version sur user:preferences-updated pour ignorer un événement plus ancien que l'état local.
- Glisser pour réordonner (reorderConversations) avec POST reorder + applyRemoteReorder, et createSectionAndAssign (créer une catégorie et y ranger).
- applyConversationRestored avec lecture bornée, applyConversationDeleted pour participant retiré/banni (MOI pour sujet).
- Une seule règle de fusion partagée par la mémoire et le disque pour que deux transports ne disent pas deux choses différentes.

Rendu : La ligne remonte en tête avec animation courte quand un message arrive ; le compteur et l'aperçu changent sans rechargement de la liste ; le glisser-déposer de réordonnancement est instantané et se corrige silencieusement si le serveur refuse.

Transposition Android : ConversationStore RAM + Combine → fonctions de fusion pures + Flow Room dans ConversationRepository (le disque reste SSOT) ; seams → interfaces Kotlin injectables.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStoreEvents.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStoreMergeRules.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStoreSeams.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStoreServiceAdapters.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationUpdatedStoreEvent.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationCacheSource.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`

### Modifier, supprimer ou réagir à un message reste cohérent même si l'événement arrive avant le message

`pco-message-edit-delete-tombstones` · Android : **partielle** · P0 · effort M

EditDelete : markEdited avec garde d'ordre sur editedAt (marge pour l'aller-retour Date GRDB, un < strict serait faux), applyServerEdit fait suivre le nouveau texte aux citations (sauf placeholder protégé ou citation scellée), markEditedLocally pour l'optimiste, markDeleted(deletedAt, sparingOpenedViewOnce, expired). PendingRowEventBuffer garde en mémoire, bornée en nombre ET en durée, les événements arrivés avant leur message (tombstones, éditions, réactions) et les rejoue dans l'ordre édition → réactions → suppression, qui l'emporte. Mutations : saveTranslation/deleteTranslations (les traductions du texte d'avant sont supprimées quand le contenu change, par localId OU serverId), applyCallNoticeUpdate, purgeMessages, markUndeleted (rollback d'une suppression), updatePinned, updateBlurred, markConsumed, updateViewOnceCount. PendingOutboxLookup liste les messages portant une mutation d'outbox encore en attente pour qu'un snapshot REST périmé n'annule ni l'édition, ni la suppression, ni la réaction optimistes ; retourner [] désactiverait la garde, donc ni la requête ni le décodage ne échouent en silence.

Écarts :
- editOptimistic, deleteOptimistic et setPinnedOptimistic existent, mais aucun tampon d'événements « avant leur message » (tombstone, édition, réaction) borné en nombre et en durée, rejoué dans l'ordre édition → réactions → suppression.
- Garde d'ordre sur editedAt (avec marge d'arrondi) pour qu'une édition ancienne rejouée ne régresse pas une plus récente.
- Faire suivre aux citations (messages qui répondent) le nouveau texte d'une édition, sauf placeholder protégé ou citation déjà scellée.
- markDeleted avec sparingOpenedViewOnce et expired, et markUndeleted pour le rollback d'une suppression optimiste refusée.
- Garde « mutations en attente » : lire l'outbox pour savoir quels messages ont une édition/suppression/réaction non livrée et empêcher un snapshot REST de les écraser ; échec de lecture = erreur bruyante, pas liste vide.
- Suppression des traductions et transcriptions persistées d'un message dont le contenu change, par id local ET id serveur.
- purgeMessages(ids) et mises à jour de flags (épinglé, flouté, consommé, compteur de vues uniques) en écritures ciblées.

Rendu : Message supprimé : placeholder « Message supprimé » en italique gris, bulle réduite ; message édité : mention « modifié » discrète près de l'heure ; édition et suppression s'appliquent à l'instant et reviennent en arrière si le serveur refuse.

Transposition Android : PendingRowEventBuffer (valeur pure) → data class Kotlin pure possédée par le repository ; PendingOutboxLookup → requête OutboxDao par kind/targetId.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+EditDelete.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/PendingRowEventBuffer.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+Mutations.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/PendingOutboxLookup.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxCoalescer.kt`

### Chaque message se relit du disque avec tout son contexte (réponse, transfert, sticker, lieu, avis système)

`pco-message-record-schema` · Android : **partielle** · P0 · effort M

MessageRecord (~70 colonnes) : identité (localId, serverId, conversationId, senderId), contenu (originalLanguage, messageType, messageSource, contentType), machine à états (state, retryCount, lastError), chiffrement (isEncrypted, encryptionMode, encryptedPayload), réponse et transfert (replyToId, storyReplyToId, forwardedFrom*, replyToJson, forwardedFromJson), éphémère et effets (expiresAt, ephemeralDuration, effectFlags, maxViewOnceCount, viewOnceCount, viewOnceOpenedAt colonne LOCALE par lecteur), édition/suppression/épingle, expéditeur dénormalisé pour l'affichage hors-ligne (nom, username, couleur, avatar, isAnonymous, hasAccount, contour d'avatar), suivi de livraison (deliveredCount, readCount, deliveredToAllAt, readByAllAt, recipientCount servi), horodatages, blobs JSON (pièces, réactions, mentions, callSummary, joinNotice, lieu, sticker, liens suivis), colonnes de layout de bulle et changeVersion. MessageRecord+ToMessage convertit en modèle de domaine ; +JSONText écrit/relit les blocs texte avec journalisation du champ en échec ; +ServedLanguage adopte la langue d'origine servie ; +SystemNotice fait porter à joinNoticeJson l'avis d'arrivée, de capture ou d'arrivées regroupées, gardé par son kind ; PendingIdRecord relie id temporaire et id serveur.

Écarts :
- MessageEntity ne porte que id, conversationId, seq, payload JSON d'ApiMessage, createdAt, cachedAt, sendState : ajouter les colonnes LOCALES qui ne sont pas dans le payload serveur et doivent survivre à un refresh (viewOnceOpenedAt par lecteur, retryCount, lastError, état local complet, changeVersion).
- Ajouter les colonnes requêtables nécessaires à la rétention, au FTS, aux épingles et aux éphémères : serverId, senderId, messageType, deletedAt, expiresAt, pinnedAt, isEncrypted.
- Séparer localId (cid_<uuid v4 minuscule>) et serverId avec une table pending_ids pour réconcilier l'écho socket et la ligne optimiste sans doublon.
- Vérifier que ApiMessage porte (et que le cache restitue) les blocs gravés pour la relecture hors-ligne : replyTo/postReplyTo, forwardedFrom, callSummary, avis système (member-joined, content-capture, members-arrived), sticker, lieu, liens suivis, senderIsAnonymous/HasAccount, contour d'avatar, recipientCount ; sinon ils disparaissent au relaunch.
- Une seule conversion enregistrement → modèle de domaine (équivalent de ToMessage) appliquant le Prisme Linguistique (preferredLanguages) au lieu de la répartir dans BubbleContentBuilder.
- Chiffrement de bout en bout : conserver encryptedPayload et encryptionMode sur la ligne et ne jamais écrire du clair dans un fil chiffré (fail-closed).

Transposition Android : MessageRecord GRDB → entité Room MessageEntity étendue (colonnes locales + payload JSON) ; ToMessage → mapper unique record→ApiMessage→bulle.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord+ToMessage.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord+JSONText.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord+ServedLanguage.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord+SystemNotice.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/PendingIdRecord.swift`

</details>

Android existant : `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/MessageEntity.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/MessageDao.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/LocalMessage.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Message.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`

### Un message reçu deux fois (REST, socket, notification) ne produit ni doublon ni clignotement et n'écrase pas l'état local

`pco-message-upsert-merge-ingest` · Android : **partielle** · P0 · effort M

APIMessageUpsert (+Attachments, +Merge) fusionne un message serveur dans la ligne existante en préservant l'état local plus riche (colonnes de layout, champs optimistes, viewOnceOpenedAt, réactions locales). L'égalité == de MessageRecord est volontairement O(1) (localId + changeVersion) : MessagePersistenceActor+UpsertEquality compare donc champ à champ les seules colonnes que la branche update mute, et n'écrit ni ne monte changeVersion que si une valeur change ; seules les conversations réellement modifiées reçoivent une notification de rafraîchissement (PersistenceNotifications). IncomingBatchReconciler réconcilie un lot de données minimales (pré-persistance par la NSE à 6 champs) sans détruire un payload riche. MessagePersistenceActor met en tampon les ingestions (bufferIncoming, bufferIncomingAPIMessages), expose le prisme ordonné du lecteur pour graver la citation, et +Reads lit une fenêtre avant une date, les traductions et la résolution localId/serverId ; +Migration fait l'upsert des chemins load/refresh/pagination.

Écarts :
- MessageCacheSource.persist remplace le payload entier par upsertAll : passer à une fusion champ par champ qui préserve les colonnes locales (viewOnceOpenedAt, état d'envoi, chemins locaux des pièces optimistes, réactions optimistes en attente) quand un snapshot REST est plus ancien.
- Écrire seulement si une valeur mutée a changé (comparaison ciblée) pour ne pas relancer l'émission Room qui recompose toute la liste de bulles (coût déjà noté en #5189).
- Tampon d'ingestion avec coalescence : rafale de message:new de plusieurs conversations → une seule transaction.
- Chemin « donnée minimale » (message poussé par une data-message FCM : 6 champs) qui ne détruit pas un payload riche déjà en cache et se complète au REST suivant.
- Garde mutations en attente : un snapshot REST ne doit pas annuler une édition, suppression ou réaction encore dans l'outbox (voir tombstones).
- Gravure de la citation (replyTo) avec le prisme ordonné du lecteur résolu à l'enfilage, jamais dans la boucle d'écriture.
- Notification de rafraîchissement par conversation pour les écrans qui n'observent pas Room, et lecture d'une fenêtre avant une date (cursor par createdAt) en plus du seq.

Transposition Android : Acteur MessagePersistenceActor → repository suspend + transaction Room unique sur un dispatcher dédié ; NSE pré-persist → handler de data-message FCM qui écrit dans Room.

<details><summary>Sources iOS (10)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/APIMessageUpsert.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/APIMessageUpsert+Attachments.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/APIMessageUpsert+Merge.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/IncomingBatchReconciler.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+UpsertEquality.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+IncomingMessageData.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+Migration.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/PersistenceNotifications.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+Reads.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/MessageDao.kt`

### Le fil de messages se peint depuis le disque, se pagine vers le haut et saute vers un ancien message sans perdre sa place

`pco-message-windowed-store` · Android : **partielle** · P0 · effort M

MessageStore (@MainActor) observe la base par notifications de rafraîchissement (pas d'observation GRDB directe, qui plante sous Swift 6) : loadInitialSnapshot peint le dernier fenêtrage, loadOlder(before:) pagine vers le haut, loadWindow(around:newerEdge:) charge une fenêtre autour d'un message ancien (réponse citée, résultat de recherche, ancre de la pastille de sync), extendJumpedWindow et restoreLatestWindow reviennent au présent, enterSearchMode(ids) borne le fil aux résultats, conceal/reveal masquent temporairement des ids sans écrire, dropGoneEphemerals retire les éphémères morts, requestRealtimeRefresh coalesce les rafraîchissements, publishWouldBeNoOp saute les publications identiques et les conversions en modèle de domaine sont mémoïsées par changeVersion.

Écarts :
- Aucune fenêtre « autour d'un message » : taper sur une citation ancienne, ouvrir un résultat de recherche ou une entrée de la pastille de sync ne peut pas sauter hors de la fenêtre chargée (historyWindow ne fait que croître vers le haut). Ajouter loadWindow(around) depuis Room ou REST (around) avec rendu scrollable.
- Modes de fenêtre explicites (dernier, sauté avec bord récent half/latest, recherche par ids) et bouton « revenir au dernier message » (restoreLatestWindow).
- conceal/reveal d'ids pour les suppressions optimistes et les éphémères consommés sans réécrire le disque.
- dropGoneEphemerals : retirer du flux les éphémères échus, citations comprises.
- Ne pas republier un snapshot identique (comparaison peu coûteuse) en complément de BubbleMemoCache, et mémoïser la conversion bulle par changeVersion.
- Conserver une ancre de scroll stable lors des prepends (pagination vers le haut) pour éviter tout saut visuel.

Rendu : Le fil reste ancré (aucun saut) quand l'historique se charge au-dessus ; le saut vers un message ancien surligne brièvement la bulle cible ; skeleton de bulles seulement si la fenêtre n'est pas en cache, jamais de spinner plein écran.

Transposition Android : MessageStore + notifications → Flow Room fenêtré (flatMapLatest sur la fenêtre) dans le ViewModel du chat ; loadWindow(around) → requête Room bornée par createdAt/seq ou GET messages?around.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageCacheSource.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/MessageDao.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Je vois mes messages en échec, je peux les renvoyer ou les annuler, et la file ne grossit pas sans fin

`pco-offline-queue-actor-lifecycle` · Android : **partielle** · P0 · effort M

OfflineQueue (acteur) : enqueue(OfflineQueueItem) avec plafond de 500 lignes et alerte à 80 % (400), signal mutationEnqueued qui déclenche un flush immédiat, retryItem(outboxId) (attempts à 0, lastError nil, pending, nextAttemptAt maintenant), retryByClientMessageId (bulle en échec), retryAll, cancelPendingSend, clearSendMessageRow, dequeue, clearAll. bootRecovery() rend un BootRecoveryReport : tout inflight d'un processus précédent repasse pending (la dédup cmid du gateway neutralise le doublon) et un pending dont le fichier audio local n'existe plus passe failed. outcomeStream(for: cmid) est un AsyncStream alimenté par OutboxOutcomeRegistry (observateurs par jeton, un annulé ne retire que sa continuation, tombstones FIFO pour qu'un abonné tardif reçoive l'issue au lieu d'attendre pour toujours). OfflineQueue+TerminalRetention retire de la file les lignes terminales jetables (7 lignes exhausted de la veille occupaient la file depuis 25 h). OfflineQueueItem porte cid_<uuid v4 minuscule>, ids et natures de pièces alignés, chemins audio locaux, storyReplyToId, transfert, sticker, protection, nom d'origine ; MigrateLegacyQueues migre les anciennes files JSON (idempotent) ; OfflineQueueProtocols expose hasUnsentRow(kind, anchor) pour éviter un doublon.

Écarts :
- Les issues d'OutboxRepository passent par un SharedFlow sans replay (buffer 128) : un ViewModel qui s'abonne après la livraison attend pour toujours. Ajouter un registre d'issues avec tombstones FIFO bornés et observateurs par jeton (l'annulation d'un seul ne vide pas les autres).
- Ajouter retryAll (relancer tous les échecs), retryByClientMessageId, cancelPendingSend (supprimer l'envoi en attente ET sa ligne optimiste) et clearSendMessageRow.
- BootRecoveryReport (inflight → pending, lignes dont le fichier local a disparu → failed) journalisé, exécuté au démarrage ET au retour premier plan.
- Plafond de file (500) avec alerte à 80 % exposée à l'UI ; refus clair au-delà plutôt qu'éviction silencieuse.
- GC des lignes terminales jetables (par kind) pour que la file ne garde pas indéfiniment des échecs sans issue ni écran.
- hasUnsentRow(kind, anchor) pour interdire l'enfilage d'un doublon (réaction identique déjà en route).
- Rattacher chaque ligne à son compte propriétaire (ownerId) : une publication en attente appartient à son auteur, jamais au compte suivant.
- Types de ligne d'envoi complets : ids et natures de pièces alignés par index, chemins locaux, citation de story, transfert, sticker, protection, nom d'origine.

Transposition Android : OfflineQueue acteur + AsyncStream → OutboxRepository (Room) + SharedFlow par cmid avec replay/tombstones ; bootRecovery → appelé par le worker et par Application.onStart (ProcessLifecycleOwner).

<details><summary>Sources iOS (10)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue+Recovery.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue+Retry.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue+TerminalRetention.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueueItem.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueuePayloads.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueueProtocols.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxOutcomeRegistry.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MigrateLegacyQueues.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/SendablePassthrough.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxDependencyKey.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxPayloadGrafts.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Mon message apparaît à l'instant dans le fil, même hors-ligne, et un échec se défait sans toucher au reste

`pco-optimistic-send-staging-rollback` · Android : **partielle** · P0 · effort M

OptimisticMessageStager écrit la ligne optimiste dans la base AVANT tout ACK : stageOffline (ligne puis aperçu de liste ; si l'outbox échoue ensuite, la bulle passe .failed et le renvoi reste possible), stageOnline, stageMedia (bulle avec fichiers locaux file:// avant la fin du TUS, réponse déjà résolue par l'hôte, sticker, protection vue unique/flou/éphémère, citation de story). Le fil observe la base, donc aucun append parallèle. MessagePersistenceActor+Writes porte insertOptimistic, markOptimisticFailed (court-circuite la machine : l'enfilage n'a jamais atteint le réseau), recordSendAttempt, applyEvent, reconcileFailedFromOutbox et reconcileOrphanedSendingRows (lignes SENDING orphelines après un kill). OptimisticRollback défait SON geste (retire la ligne posée, ou remet la ligne ôtée à son index borné) au lieu de restaurer un instantané qui effaçait commentaires arrivés par socket, pages chargées et autres envois optimistes.

Écarts :
- Réconciliation au démarrage : ligne SENDING sans ligne outbox (kill entre l'insert et l'enfilage) → FAILED ; ligne FAILED dont l'outbox repart → SENDING.
- Stager média : bulle optimiste avec chemins locaux (content:// ou file://) avant l'upload pour image, vidéo, audio, fichier, sticker, avec protection (vue unique, flou, éphémère) et réponse déjà résolue.
- Mettre à jour l'aperçu de liste de conversations au moment de l'envoi optimiste (dernier message, remontée en tête) et le recalculer au rollback.
- Rollback ciblé (retirer la ligne posée / remettre la ligne ôtée à son index) pour les autres gestes optimistes (commentaires, posts, réactions) plutôt qu'une restauration d'instantané.
- markOptimisticFailed avec message d'erreur si l'enfilage échoue (disque plein, base indisponible) pour que l'utilisateur puisse renvoyer.

Rendu : La bulle optimiste est identique à une bulle envoyée avec l'horloge d'envoi (SendingClockReveal) ; en échec : icône d'erreur et « Appuyer pour renvoyer » ; jamais de disparition silencieuse de la bulle.

Transposition Android : Stager + Writes → MessageRepository.sendOptimistic/stageMedia dans une transaction Room ; OptimisticRollback → fonctions pures sur la liste d'état du ViewModel.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/OptimisticMessageStager.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/OptimisticRollback.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+Writes.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageMediaWriteBack.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Toutes les actions courantes (accepter une demande, créer une conversation, liker, commenter, signaler…) fonctionnent hors-ligne

`pco-outbox-mutation-kinds` · Android : **partielle** · P0 · effort M

iOS fait passer 25 sortes de mutations par la même file : sendMessage, sendReaction, editMessage, deleteMessage, markAsRead, sendFriendRequest, respondFriendRequest (accept ou reject), blockUser, unblockUser, createConversation, updateConversation (titre, description, avatar), updateProfile, updateSettings, publishStory, repostStory (repost privé en conversation), createPost, repostPost (targetType obligatoire, jamais laissé au repli serveur qui ferait d'une source éphémère un post permanent), markStoryViewed (coalescé par storyId), toggleLikePost, createComment, deleteComment, toggleLikeComment, reportAttachmentStatus (non coalescé : chaque rapport porte une trace), consumeAfterRead (consommation des messages flamme-œil lus à la sortie de la conversation) et reportContentCapture (capture d'un contenu qui disparaît, durable 24 h, une annonce par acteur/message/sorte). MutationPayloads.swift définit les payloads Codable (chacun avec clientMutationId, dédup MutationLog) ; OfflineQueue+Mutations fournit l'enfilage générique (conversationId sentinelle pour les lignes hors conversation), enqueueEdit (coalescing édition après envoi, suppression après édition), enqueueDelete, enqueueReaction (inserted, droppedNew, cancelledBoth) et hasUnsentRow ; le shim StickerShim garde les anciennes signatures enqueueMedia compatibles.

Écarts :
- Kinds manquants côté Android (22 présents : SEND/EDIT/DELETE_MESSAGE, ADD/REMOVE_REACTION, READ_RECEIPT, MARK_UNREAD, UPDATE_CONVERSATION_PREFS, UPDATE_PROFILE, UPDATE_SETTINGS, UPDATE_PRIVACY_SETTINGS, PUBLISH_STORY, UPLOAD_MEDIA, BLOCK/UNBLOCK_USER, SEND_FRIEND_REQUEST, PIN/UNPIN_MESSAGE, LIKE/UNLIKE/BOOKMARK/UNBOOKMARK_POST) : respondFriendRequest (accepter/refuser hors-ligne), createConversation, updateConversation (titre, description, avatar), repostStory, createPost avec médias, repostPost, markStoryViewed, createComment, deleteComment, toggleLikeComment, reportAttachmentStatus, consumeAfterRead, reportContentCapture.
- Chaque payload porte un clientMutationId envoyé au gateway pour le MutationLog (userId, clientMutationId) afin de rendre tout rejeu idempotent.
- Règles de coalescing complètes : édition après envoi fusionnée dans le message encore en file, suppression après envoi annihile les deux, suppression après édition remplace l'édition ; report d'un rapport d'écoute non coalescé ; markStoryViewed coalescé par story.
- Ligne hors conversation (profil, blocage, amis, réglages) avec identifiant sentinelle stable pour que les requêtes par conversation ne la confondent jamais.
- Surcharges d'enfilage média avec sticker, protection (vue unique, flou, éphémère) et nom d'origine du fichier, sans casser les anciens appelants.
- Valeurs de kind disque stables et append-only avec test de verrouillage (renommer un kind est une migration).

Transposition Android : OutboxKind iOS → enum OutboxKind Kotlin (même nommage de payload) ; payloads Codable → @Serializable data classes.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Mutations/MutationPayloads.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue+Mutations.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineMessageQueueing+StickerShim.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxCoalescer.kt`

### Les envois en attente repartent seuls au retour du réseau, sans brûler leurs tentatives, et un refus définitif échoue tout de suite

`pco-outbox-queue-model-and-flusher` · Android : **partielle** · P0 · effort M

OutboxRecord : kind aux valeurs disque stables (25 cas, append-only), status pending/inflight/failed/exhausted, attempts, nextAttemptAt, lastError, clientMessageId servant de clé de dédup côté passerelle (MutationLog userId + clientMutationId), waitingForFanoutOriginSince, cancelRequestedAt ; chaque kind dit s'il compte pour l'indicateur « Synchronisation… » et si une ligne terminale est jetable. OutboxFlusher.flush() : gate réseau (hors-ligne ⇒ ne dispatche rien et rend une échéance de 60 s, jamais nil, sinon plus rien ne réveille la file), claim atomique pending→inflight, reclaim des inflight orphelins après 30 min, 5 tentatives avec backoff exponentiel 2→30 s par ligne (nextAttemptAt). Classification : session expirée (401) différée SANS consommer le budget ; panne de TRANSPORT (connexion, DNS, timeout, roaming) sans budget ; refus définitif 400/403/404/410/413/422 et limite quotidienne de gestes ⇒ exhausted dès la 1re tentative ; 408/429/503/5xx/409 réessayables ; dépendance (fan-out) attendue au plus 30 min depuis la première attente réelle ; annulation par l'auteur ; journal des tentatives ; nettoyage des fichiers locaux à l'état terminal. OutboxDrainTriggers draine au retour du socket ET au front montant du réseau ; OutboxMutationRules coalesce markAsRead (curseur monotone, dernier gagne).

Écarts :
- Les senders d'OutboxFlushWorker renvoient TransientFailure pour tout échec d'API (SEND_MESSAGE, EDIT, DELETE, réactions, lus…) : une 404 sur une conversation inexistante ou une 403 brûle cinq tentatives puis épuise, et une panne réseau de quelques minutes épuise aussi. Classer : 400/403/404/410/413/422 ⇒ PermanentFailure immédiat ; 401 ⇒ différé sans budget (refresh de session) ; IOException de transport ⇒ sans budget ; 5xx/408/429 ⇒ budget.
- nextAttemptAt par ligne (backoff exponentiel 2→30 s plafonné) à la place d'un unique Result.retry() du worker : une ligne en backoff ne bloque pas les autres lanes ni ne relance tout le worker.
- Reclaim des INFLIGHT périmés (plus de 30 min) à chaque flush, au lieu d'un recoverInflight global en tête de worker qui remet aussi les lignes réellement en vol.
- Gate réseau explicite (NetworkConditionMonitor) qui rend une échéance (60 s) : ne jamais renvoyer « rien à planifier » sans filet.
- Déclencheurs multiples : retour du socket (SocketManager.connected), retour du réseau (callback de connectivité), enqueue (debounce ~250 ms en travail expédité), premier plan ; pas seulement la contrainte WorkManager NETWORK_CONNECTED.
- Dépendances : attente bornée à 30 min mesurée depuis la première attente réelle (waitingSince), puis échec normal ; annulation durable par l'auteur d'une publication en vol (cancelRequestedAt + point de contrôle).
- Chaque ligne envoie son clientMutationId au gateway (MutationLog) ; un 410 Gone signifie « déjà appliqué », jamais rejouer ; limite quotidienne de gestes terminale jusqu'à resetAt.
- Journal des tentatives (voir historique d'envoi) et nettoyage des fichiers locaux de la ligne à l'état terminal (appliquée ou épuisée).
- Coalescing markAsRead monotone par conversation (dernier gagne) et exclusion de certains kinds du compteur de synchronisation (voir pastille).

Transposition Android : OutboxFlusher + OutboxRetryScheduler (BGTask, Combine) → OutboxFlushWorker WorkManager (expedited + périodique) avec réplanification fine au nextAttemptAt le plus proche ; déclencheurs → ConnectivityManager.NetworkCallback + SocketManager.connected.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxFlusher.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxDrainTriggers.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxDeferralError.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/QueueTiming.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxMutationRules.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxDrainer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxCoalescer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushPlan.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/OutboxEntity.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/OutboxDao.kt`

### Un écran affiche toujours le cache d'abord, avec les mêmes fenêtres de fraîcheur que sur iOS

`pco-swr-cache-policy-states` · Android : **partielle** · P0 · effort M

Règle cache-first / stale-while-revalidate commune : CacheResult (fresh, stale, expired, empty) classé par CachePolicy (ttl, staleTTL, maxItemCount, emplacement GRDB ou disque avec budget en octets). CacheFirst.paintable peint le frais ET le périmé ; seul un cache vide laisse place au skeleton, et un cache expiré repeint la dernière donnée connue du disque (loadIgnoringExpiry) plutôt qu'un écran vide hors-ligne. CacheFirstLoader pilote apply + LoadState (idle, cachedStale, cachedFresh, loading, loaded, offline, error), revalidation silencieuse annulable, refresh() force-réseau pour le tirer-pour-rafraîchir, un échec de revalidation ne retire rien de ce qui est peint et un échec de persistance ne régresse pas l'état. PaginationState (idle, loadingMore, exhausted, error) et PaginationCursor persisté pour reprendre le scroll à la plus grande profondeur atteinte.

Écarts :
- Aligner la table de CachePolicy sur iOS : messages ttl 6 mois, fraîcheur 2 min, plafond 600 (Android : 30 j) ; stories 72 h (24 h) ; feed 7 j, fraîcheur 5 min, 100 posts (6 h / 2 min) ; commentaires 1 h, 500 ; notifications 24 h, fraîcheur 2 min, 200 ; historique d'appels 30 j, 300 ; profils 30 j, 100 ; stats 6 h, 10 ; participants 24 h / 5 min ; conversationMedia 6 mois / 10 min.
- Ajouter maxItemCount à CachePolicy (troncature des plus anciens à l'écriture) et un emplacement de stockage (Room ou disque avec maxBytes) pour que images 300 Mo, audio 200 Mo, vidéo 1 Go et vignettes 150 Mo soient décrits au même endroit.
- Exposer un LoadState partagé (idle, cachedStale, cachedFresh, loading, loaded, offline, error) : un échec réseau hors-ligne doit donner offline, jamais error, et ne jamais effacer ce qui est peint.
- Ajouter PaginationState (idle, loadingMore, exhausted, error) distinct de LoadState et un PaginationCursor persisté avec le cache pour reprendre la pagination au cold start.
- Ajouter refresh() force-réseau distinct du chemin cold-start pour le tirer-pour-rafraîchir, avec revalidation silencieuse annulable à la disparition de l'écran.
- Garantir par store testé que l'état expiré repeint la dernière donnée disque (Syncing(value) le fait déjà côté Android) et que loadIgnoringExpiry existe sur chaque store qui a un cache disque.

Rendu : Aucun spinner si le cache n'est pas vide, même expiré ; skeleton (MeeshySkeleton) uniquement sur cache vide au cold start ; état offline = pastille/bannière discrète, jamais un écran d'erreur plein ; état error = texte discret + action Réessayer.

Transposition Android : GRDBCacheStore + CacheFirstLoader → Room + SwrCacheSource/cacheFirstFlow ; LoadState → sealed interface exposée en StateFlow par les ViewModels.

<details><summary>Sources iOS (8)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheResult.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheFirst.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheFirstLoader.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheStoreProtocols.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheIdentifiable.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/LoadState.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/PreferenceCacheModels.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/CachePolicy.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/CacheResult.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/cacheFirstFlow.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/classifyCache.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/SwrCacheSource.kt`

### Un vocal se lit proprement : une seule lecture à la fois, reprise après un appel, erreurs visibles

`pco-audio-player-engine` · Android : **partielle** · P1 · effort M

AudioPlayerManager (ObservableObject) joue une URL de média résolue (MeeshyConfig.resolveMediaURL) : fichier local du cache si présent (AVAudioPlayer), sinon streaming (AVPlayer avec cacheKey, observateur périodique) ; playData / playLocalFile ; progression à 10 Hz (progress, duration), erreur de lecture exposée (lastPlaybackError, effacée au prochain succès) pour qu'un tap ne reste pas muet. Hooks onWillPlay / onDidStop pour la coordination (un seul média joue à la fois). InterruptionResumeLedger : le système arrête le lecteur avant la notification d'interruption (appel entrant), donc l'état ne dit plus qu'il jouait ; l'intention de lecture est mémorisée et la lecture reprend à la fin de l'interruption seulement si elle jouait. Libération des ressources depuis le deinit (Timer 10 Hz, observateur périodique) et de la session audio (call-aware) pour ne pas fuir.

Écarts :
- Un seul média audio joue à la fois (onWillPlay / onDidStop → coordinateur de lecture) et arrêt de l'ancien lecteur quand un autre démarre.
- Gestion du focus audio (AudioFocus) : pause/duck sur perte transitoire (appel, autre app), reprise à la fin seulement si la lecture était en cours (intention mémorisée), abandon du focus à l'arrêt.
- Source : fichier local du cache disque si présent, sinon streaming avec écriture en cache (clé canonique).
- Progression à ~10 Hz exposée (progress, duration) et état d'erreur de lecture visible (puis effacé au prochain succès) au lieu d'un tap silencieux.
- Libération garantie (ExoPlayer.release, timers, focus) à la disparition de la bulle ou de l'écran, y compris sans stop() explicite.

Rendu : Barre/forme d'onde qui avance en continu à 10 Hz ; état d'erreur discret sur la bulle vocale (icône + Réessayer) ; une pause automatique pendant un appel reprend toute seule après.

Transposition Android : AVAudioPlayer/AVPlayer + AVAudioSession → Media3 ExoPlayer + AudioManager/AudioFocusRequest.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/AudioPlayerManager.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`

### La galerie d'une conversation montre tous ses médias, pas seulement ceux déjà défilés

`pco-conversation-media-index` · Android : **partielle** · P1 · effort M

CacheCoordinator.conversationMedia tient un index PAR GENRE de média (ConversationMediaKind.indexKey) de la conversation ENTIÈRE, sans plafond (là où messages ne garde qu'une fenêtre), avec une rétention de 6 mois et une fenêtre fraîche de 10 minutes pour que chaque ouverture de la galerie revalide en silence ce qu'elle peint depuis le disque (SWR). Ce qui retire un message ou une conversation de la vue doit le retirer de TOUS les genres : invalidateConversationMedia(conversationId) purge tous les genres (sortie de la liste, historique effacé, suppression de la conversation) et dropFromConversationMedia(conversationId, messageId) retire un message de tous les genres (suppression, expiration) — un document supprimé qui survivrait dans l'onglet Documents serait un contenu fantôme, et une invalidation visant la seule clé nue laisserait six genres intacts.

Écarts :
- La galerie Android est dérivée des seuls messages de la fenêtre chargée (ConversationMediaGallery.of(messages…)) : un média ancien hors fenêtre n'apparaît pas. Créer un index persisté par genre (images, vidéos, audio, documents, liens…) de la conversation entière, alimenté par un endpoint média de la conversation et revalidé en silence.
- Rétention 6 mois, fraîcheur 10 min, pas de plafond d'éléments.
- Invalidation sur sortie de conversation / historique effacé / suppression, sur TOUS les genres, et retrait d'un message supprimé ou expiré de tous les genres (jamais un contenu fantôme).
- Peindre la galerie depuis le disque à l'ouverture avant le réseau (cache-first).

Rendu : Onglets par genre (Photos, Vidéos, Audio, Documents, Liens) qui se remplissent instantanément depuis le disque ; un média supprimé disparaît de tous les onglets.

Transposition Android : conversationMedia GRDB (clé par genre) → table Room conversation_media (conversationId, kind, payload) avec revalidation SWR.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator+ConversationMedia.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`

### Les événements temps réel de conversations et de catégories sont appliqués dans l'ordre, au bon endroit

`pco-conversation-socket-bridge` · Android : **partielle** · P1 · effort M

ConversationStoreSocketBridge relie les diffusions du MessageSocketManager aux stores : conversation:updated → applyConversationUpdated, conversation:deleted → applyConversationDeleted, conversation:restored → lecture bornée puis applyConversationRestored, conversation:participant-left / -banned quand MOI suis le sujet → applyConversationDeleted, user:preferences-updated (portée conversation, versionné) → applyRemote, user:preferences-reordered → applyRemoteReorder, user:updated → applyUserUpdated, read-status:updated → applyReadReceipt, conversation:unread-updated → applyServerUnread (le SEUL fil qui porte le compteur de non-lus, #6997), category:created/updated/deleted et categories:reordered → UserCategoryStore.applyRemote. read-status:updated n'est appliqué que si type == read (une livraison ne fait pas avancer un curseur de lecture), lastReadAt et unreadCount sont tous deux présents, et userId == currentUserId (le même broadcast atteint les pairs). Chaque événement entre dans une file ordonnée (OrderedEventLane) à consommateur unique, appliquée dans l'ordre d'arrivée ; la correspondance socket → store vit ici pour que les stores restent agnostiques du transport.

Écarts :
- MessageSocketManager décode déjà conversation:updated/deleted/restored, unread-updated, read-status:updated, participant-left et préférences ; mais l'application est faite dans ConversationListViewModel (donc seulement quand l'écran vit) : déplacer le pont dans le SDK, démarré par RealtimeSessionCoordinator pour toute la session.
- File d'événements ordonnée à consommateur unique (Channel) pour appliquer dans l'ordre d'arrivée et éviter les courses entre un unread-updated et un conversation:updated.
- Garde d'identité sur read-status:updated (type read, lastReadAt et unreadCount présents, userId == moi) avant d'avancer le curseur.
- Traiter user:updated, user:preferences-reordered et participant-left/banned (moi pour sujet) en fusion directe plutôt que par refresh complet.
- Router les événements de catégories vers le store de catégories (voir fiche catégories).

Transposition Android : Pont Combine → collecte de SharedFlow du MessageSocketManager dans un singleton démarré par RealtimeSessionCoordinator, avec Channel ordonné.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStoreSocketBridge.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStoreSocketFeeds.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/RealtimeSessionCoordinator.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CategorySocketManager.kt`

### Épingler, mettre en sourdine ou archiver une conversation hors-ligne est appliqué à l'instant puis synchronisé

`pco-conversation-state-outbox` · Android : **partielle** · P1 · effort M

ConversationStateOutbox est la file persistée (SQLite, survit au kill) des UserStateMutation en attente : chaque OutboxTask est versionné par schéma (une ligne écrite par un build plus récent est ignorée au boot au lieu de faire planter le chargeur), porte une clé de coalescing (convId, clé) où la nouvelle tâche remplace l'ancienne, tandis que deleteForUser et leave produisent des clés uniques et ne se coalescent jamais. Les mutations purement locales sont rejetées à l'enfilage. flush rend un OutboxDispatchOutcome (completed, failedPermanent(reason) : 4xx, on retire et l'appelant défait son optimiste, failedTransient(reason) : on garde) avec OutboxBackoff 5 × 2^n plafonné à 60 s.

Écarts :
- Android passe par UPDATE_CONVERSATION_PREFS avec un snapshot complet (dernier gagne) : équivalent pour pin, mute, archive, catégorie, nom, réaction, tags, mentionsOnly. Reste à mettre en file aussi leave, deleteForMe et deleteForAll (aujourd'hui NetworkResult directs, perdus hors-ligne), avec clés uniques non coalescées.
- Garde de version de schéma des lignes : ignorer proprement (ne pas planter) une ligne écrite par un build plus récent ; décodeur tolérant aux champs inconnus.
- Rollback de l'état optimiste sur refus définitif (4xx) avec signal à l'UI ; conserver sur échec transitoire.
- Backoff dédié 5 s × 2^n plafonné à 60 s aligné sur le flusher générique.

Transposition Android : ConversationStateOutbox (DatabaseQueue séparé) → lanes conversationPrefs de l'outbox unique Room.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStateOutbox.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxCoalescer.kt`

### La base s'ouvre vite, reste compacte et ne fait jamais planter l'app quand le disque est plein

`pco-db-open-tuning-resilience` · Android : **partielle** · P1 · effort S

AppDatabase construit un writer GRDB entièrement migré qui ne crashe jamais l'app hôte : si le fichier disque est illisible, repli sur une base en mémoire (isInMemoryFallback) pour que les appelants décident de sauter les écritures longue durée ; détection du harnais de test (variables XCTest) pour une base éphémère. DatabaseMaintenance règle SQLite pour un profil lecture majoritaire avec rafales d'écritures socket : PRAGMAs idempotents, cache_size/mmap_size/temp_store posés sur CHAQUE connexion de lecture (le pool en compte seize), auto_vacuum INCREMENTAL, VACUUM ponctuel et compactions périodiques. DatabaseSuspension coupe les verrous à la suspension de l'app (0xDEAD10CC). ResilientDatabaseQueue ouvre les files SQLite secondaires (outbox d'engagement, d'état de conversation, brouillons) avec repli et erreur DatabaseStorageUnavailable.

Écarts :
- Builder Room : journal WAL explicite, executor de requêtes dédié et callback onOpen qui pose synchronous=NORMAL, mmap_size, temp_store=MEMORY et cache_size sur chaque connexion.
- auto_vacuum=INCREMENTAL à la création, puis incremental_vacuum et wal_checkpoint(TRUNCATE) périodiques (WorkManager idle + charging) et sur ON_STOP.
- Ouverture défensive : fichier corrompu, SQLITE_FULL ou disque plein ne doivent pas planter ; tenter de reconstruire le cache en gardant l'outbox lisible, sinon repli en mémoire avec un drapeau isEphemeral exposé à l'UI (avertissement discret).
- DatabaseSuspension : non applicable sur Android (pas de 0xDEAD10CC) ; vérifier seulement qu'aucune transaction longue ne retient la base quand l'app passe en arrière-plan.

Rendu : Si la base retombe en mémoire, bandeau discret « Stockage indisponible, les données ne seront pas conservées » ; jamais de crash au démarrage.

Transposition Android : GRDB DatabasePool + PRAGMAs → Room (WAL) + RoomDatabase.Callback.onOpen ; DatabaseSuspension (0xDEAD10CC) → not-applicable.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/AppDatabase.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DatabaseMaintenance.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/DatabaseSuspension.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/ResilientDatabaseQueue.swift`

</details>

Android existant : `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/DatabaseModule.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/MeeshyDatabase.kt`

### Les coches de distribution et de lecture ne reculent jamais et survivent au redémarrage

`pco-delivery-read-receipts-persist` · Android : **partielle** · P1 · effort M

ReadStatusReceipt.applyReadStatusSummarySync pose un résumé d'accusé sur la ligne qu'il décrit, uniquement si elle est à currentUserId : ligne nommée par id serveur ou local ; non nommée (passerelle d'avant #7433) = dernier message ACQUITTÉ du fil, un envoi en vol sans id serveur ne pouvant pas être ce message ; rend true seulement si la ligne change pour que le worker ne publie qu'un vrai changement. Le dénominateur recipientCount servi est persisté. Housekeeping.updateDeliveryCounters (unitaire ou par lot) ne fusionne que si les nouvelles valeurs sont strictement meilleures. AttachmentConsumption.markAttachmentConsumedByAll marque l'action de consommation primaire d'une pièce comme confirmée par tous les destinataires (attachment-status:updated du seul autre participant d'un 1:1). CallRecording.applyCallNoticeAttachments remplace les pièces de la bulle d'appel ; une rediffusion sans pièce ne retire rien.

Écarts :
- applyReadReceipt existe avec un rang de livraison ; ajouter la fusion « strictement meilleur » des compteurs (deliveredCount, readCount, deliveredToAllAt, readByAllAt) en lot, pour qu'une réponse REST ancienne ne fasse jamais reculer une coche.
- Persister le dénominateur recipientCount servi (indicateur « lu par tous » correct après rechargement).
- Résumé de lecture non nommé (anciennes passerelles) appliqué au dernier message acquitté du fil, jamais à un envoi en vol.
- Marquer une pièce consommée par tous (écoute, ouverture) à partir de attachment-status:updated d'un 1:1 et l'afficher sur la bulle.
- Remplacer les pièces de la bulle d'appel à la transition live → terminal (enregistrement) sans rien retirer quand la rediffusion n'en porte pas.

Rendu : Coche simple (envoyé), double (distribué), double bleue (lu par tous) ; ne régresse jamais ; l'indicateur de groupe suit recipientCount servi.

Transposition Android : Mises à jour ciblées Room (UPDATE conditionnel « meilleur seulement ») plutôt que décodage/réencodage du payload.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+ReadStatusReceipt.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+AttachmentConsumption.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+CallRecording.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Mes vues, temps de visionnage et impressions sont comptés de façon fiable, même hors-ligne ou après un kill

`pco-engagement-event-outboxes` · Android : **partielle** · P1 · effort M

EngagementOutbox est une file d'ajout durable (DatabaseQueue dédiée, une table) des sessions d'engagement : cycle open puis finalized, seules les sessions finalized sont envoyées ; une session persistée dès begin() survit à un crash, un checkpoint écrit la durée courante, bootSweep finalise les sessions ouvertes orphelines avec truncated=true, backoff min(60 s, 2^tentatives × 5 s), purge par ancienneté et nombre de lignes, flush(via:) avec issue EngagementDispatchOutcome. SocialEventsV2Outbox est sa jumelle (jamais mêlée : un refus de la v2 ne touche aucun comptage) : chaque événement est rangé ENCODÉ sous son eventId (un rejeu renvoie les mêmes octets, donc le même identifiant, que la passerelle dédoublonne), la file appartient à un PROPRIÉTAIRE (id du compte ou « visitor ») pour qu'un événement du compte A ne parte jamais sous le jeton du compte B, bornée à 5 000 lignes (les plus anciennes partent), rien de plus vieux que 72 h ne part, un événement de plus de 2 Kio ou déjà présent n'entre pas ; ingère aussi la boîte déposée par l'extension de notification.

Écarts :
- ImpressionBatcher Android regroupe des impressions avec un debounce de 3 s mais uniquement en mémoire (pas de flush en arrière-plan, pas de survie à un kill, de l'aveu de son commentaire) : persister les sessions et événements dans une table Room.
- Cycle open/finalized avec checkpoint de durée, bootSweep des sessions ouvertes orphelines (truncated=true) et purge par ancienneté / nombre de lignes.
- File d'événements v2 : identifiant stable par événement, propriétaire (compte ou visiteur), bornes 5 000 lignes / 72 h / 2 Kio, dédoublonnage par eventId, rejeu des mêmes octets.
- Backoff min(60 s, 2^tentatives × 5 s), flush au retour réseau et au passage en arrière-plan (WorkManager).
- Ingestion de la boîte déposée par le handler de data-message FCM (équivalent NSE) pour ne perdre aucun événement quand l'app est tuée.

Transposition Android : Deux DatabaseQueue GRDB → deux tables Room (engagement_sessions, social_events_v2) vidées par un Worker dédié ; NSE inbox → fichier/table écrite par FirebaseMessagingService.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Store/EngagementOutbox.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/SocialEventsV2Outbox.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/ImpressionBatcher.kt`

### Un message éphémère ou à vue unique disparaît exactement quand il doit, aussi hors-ligne et jusque dans les citations

`pco-ephemeral-viewonce-lifecycle` · Android : **partielle** · P1 · effort M

ViewOnce.markViewOnceOpened scelle la ligne comme vue unique déjà ouverte par CE lecteur (colonne locale viewOnceOpenedAt, permanente) et PURGE son contenu — texte, chiffré, pièces (légendes, vignettes, transcriptions, pistes traduites), sticker, lieu — ne gardant que l'enveloppe (id, auteur, heure, type) ; le drapeau vue unique est posé sur le MESSAGE pour qu'une photo dont seule la pièce portait la vue unique ne redevienne pas visible une fois vidée. EphemeralClock.applyServedEphemeralDeadline grave l'échéance servie (message:countdown-started, remplace la colonne même vers plus tard : expéditeur = max D(u), destinataire = D(u)), en concurrence avec la première réception locale (la plus proche gagne). ExpiredEphemeralRow filtre à la lecture un éphémère échu (mort gravée au registre, message:expired ou échéance passée pendant que l'app dormait) pour que ni la base ni le réseau ne le ressuscitent, citations comprises. QuoteCascade.purgeQuoteCascade supprime transitivement (profondeur bornée) les réponses qui citent un message mort ; Housekeeping.deleteExpiredEphemeral balaie les échus.

Écarts :
- Colonne locale viewOnceOpenedAt (jamais écrasée par le REST) et purge du contenu à l'ouverture (texte, pièces, sticker, lieu) avec affichage « déjà ouvert » permanent.
- Persister l'échéance servie (message:countdown-started) et ephemeralDuration ; projeter min(échéance servie, première réception locale + durée) avec un registre local de première réception par message.
- Filtre de lecture isGone (deletedAt, expiresAt dépassé, flamme-œil consommée) appliqué au fil ET aux citations ; message:expired supprime la ligne.
- Cascade de suppression des réponses qui citent un éphémère mort (profondeur maxDepth, transitive) côté disque.
- Balayage des éphémères échus au démarrage et au retour au premier plan.
- markDeleted avec sparingOpenedViewOnce pour ne pas détruire l'enveloppe d'une vue unique ouverte.

Rendu : Pastille de compte à rebours sur la bulle ; vue unique ouverte : bulle vidée avec libellé « Ouvert » et enveloppe conservée ; mort d'un éphémère : disparition en fondu, sans trou ni « Message supprimé » pour un éphémère consommé.

Transposition Android : Registre de première réception (EphemeralReceiptLedger) → DataStore/Room local ; rendu existant (badge, flou) conservé.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+ViewOnce.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+EphemeralClock.swift`
- `apps/ios/Meeshy/Features/Main/Stores/ExpiredEphemeralRow.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+QuoteCascade.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/EphemeralCountdownBadge.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BlurRevealLifecycle.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffects.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Le bouton « Ajouter / En attente / Ami » est correct partout, instantanément, et ne se casse pas au démarrage

`pco-friendship-cache` · Android : **partielle** · P1 · effort S

FriendshipCache (ObservableObject, @unchecked Sendable) tient en mémoire l'état d'amitié de tout utilisateur (FriendshipStatus) : status(for:), isFriend, hydrate (seed depuis les caches persistés des amis puis récupération paginée fetchAllPages), version monotone incrémentée à chaque mutation pour réagir sans s'abonner à objectWillChange, et les transitions optimistes didSend/didCancel/didAccept/didReject/didReceiveRequest/didRemoveFriend avec leurs rollback (rollbackSendRequest/Accept/Reject). Les hydratations concurrentes sont fusionnées (une seule en vol, propriété par génération) : sans cela deux hydratations au démarrage à chaud (task au lancement + onChange d'auth) faisaient planter applyHydration (removeAll) sur iOS 26. invalidatePersistedFriendCaches et clear au logout.

Écarts :
- L'API de transitions et de rollback existe déjà côté Android ; il manque l'hydratation coalescée (une seule en vol, propriété par génération) pour que deux déclencheurs de démarrage ne se télescopent pas.
- Seed de l'état depuis les caches persistés (amis, demandes reçues et envoyées en Room) AVANT la récupération paginée complète (fetchAllPages).
- Compteur de version monotone pour que les écrans réagissent sans recomposer toute l'application.
- invalidatePersistedFriendCaches pour repartir proprement après une mutation globale et clear au logout (déjà partiel).

Rendu : Bouton d'amitié : Ajouter, En attente, Accepter/Refuser, Ami ; change à l'instant du tap et se corrige si le serveur refuse.

Transposition Android : FriendshipCache ObservableObject → singleton Kotlin avec StateFlow ; déjà aligné sur l'API.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/FriendshipCache.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendshipCache.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendListRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/friend/FriendRequestListRepository.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/dao/FriendDao.kt`

### Enregistrer une photo, une vidéo, un audio ou un fichier : bon endroit, sans doublon, et je sais s'il y était déjà

`pco-media-save-to-library-files` · Android : **partielle** · P1 · effort M

PhotoLibraryManager enregistre images et vidéos dans l'album personnalisé « Meeshy » de la photothèque. Chaque écriture passe par le dédoublonnage (#10370, directive : chercher par signature si le média existe dans le dossier Meeshy, si oui signaler, sinon enregistrer) : PhotoLibraryMediaSignature = empreinte du CONTENU (SHA-256 tronqué à 128 bits), la même quel que soit le chemin qui l'enregistre (enregistrement auto, visionneuse, lecteur plein écran, menu d'un message), portée dans le nom d'origine de l'asset (PHAssetResource.originalFilename) pour retrouver le média après une réinstallation sans demander au serveur. PhotoLibraryDeduplicator (acteur) cherche l'empreinte dans l'album (registre persistant empreinte → identifiant local, alias stable = id de pièce, sonde de l'album) et renvoie PhotoLibrarySaveOutcome (déjà présent : rien n'est écrit, ou ajouté) ; accès « ajout seulement » ou limité ⇒ l'absence ne prouve rien. PhotoLibraryImageWrite : le type est lu dans l'en-tête (CGImageSourceGetType, sans décoder), asIs (EXIF et profil colorimétrique conservés), transcode en JPEG par ImageIO (WebP, AVIF, BMP… que Photos refuse) avec métadonnées, ou rejected. MediaSaveDestination : photothèque (images et vidéos seulement), app Fichiers (l'utilisateur choisit le dossier) ou feuille de partage. MediaFileSaver copie audio et documents dans Documents (visible dans Fichiers) sans jamais écraser (suffixe « clip 2.mp4 ») avec un nom de fichier sûr.

Écarts :
- GalleryImageSaver écrit images et vidéos dans MediaStore (Android 10+) via GallerySaveTargetResolver mais sans dédoublonnage : ajouter une empreinte de contenu (SHA-256 tronqué 128 bits), un registre empreinte → Uri/id, et la détection d'un média déjà présent dans le dossier Meeshy.
- Retour d'issue distinct (ajouté / déjà présent) pour afficher « Déjà enregistré » au lieu de dupliquer le fichier.
- Écrire l'image telle quelle quand le format est accepté (EXIF conservé, sans décoder en Bitmap) et transcoder en JPEG avec métadonnées pour un format refusé ; rejeter ce qui n'est pas une image.
- Destinations : galerie (images/vidéos seulement, album Meeshy via RELATIVE_PATH), Fichiers (ACTION_CREATE_DOCUMENT, l'utilisateur choisit) et feuille de partage (ACTION_SEND avec FileProvider).
- Audio et documents : enregistrer dans Téléchargements/Meeshy (MediaStore.Downloads) sans écraser, avec suffixe numérique et nom de fichier assaini ; aujourd'hui les fichiers passent par DownloadManager sans destination choisie.
- Marque d'origine dans le nom de l'asset pour retrouver le média après réinstallation sans le serveur.

Rendu : Toast/feedback instantané « Enregistré » ou « Déjà enregistré dans Meeshy » ; destinations proposées selon la nature du média (images/vidéos : Galerie ; audio/documents : Fichiers) ; jamais de doublon silencieux.

Transposition Android : PHPhotoLibrary + album Meeshy → MediaStore (Pictures/Meeshy, Movies/Meeshy) ; app Fichiers → Storage Access Framework (ACTION_CREATE_DOCUMENT) ; share sheet → Intent.ACTION_SEND.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/MediaFileSaver.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/MediaSaveDestination.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/PhotoLibraryManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/PhotoLibraryDeduplicator.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/PhotoLibraryImageWrite.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/PhotoLibraryMediaSignature.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/FileAttachmentDownloader.kt`

### Un message envoyé passe par des états clairs (file, envoi, envoyé, distribué, lu, échec) et son historique d'envoi se consulte

`pco-message-delivery-state-send-history` · Android : **partielle** · P1 · effort M

MessageState iOS : draft, queued, sending, sent, delivered, read (progression monotone Comparable) et failed ; MessageEvent : enqueue, startSending, serverAck(serverId, at), delivered(count, at), readBy(userId, at), sendFailed, retry, retryExhausted. MessageStateMachine est pure et rend nil pour une transition invalide ; l'acteur l'applique via applyEvent. SendAttemptRecord est le journal local d'une ligne par tentative de transport (socket-first, rest, socket-fallback, outbox) avec attemptNumber monotone par message, startedAt/finishedAt, outcome et errorMessage ; il survit au serverAck pour la carte « Historique d'envoi » de la vue détails (première tentative et chaque nouvelle).

Écarts :
- La machine d'états Android (QUEUED, SENDING, SENT, DELIVERED, READ, FAILED, RETRYING, EXHAUSTED) existe mais la ligne ne persiste que SYNCED/SENDING/FAILED (LocalSendState) : persister l'état complet pour dériver horloge, coche, double coche et double coche bleue.
- Aligner le vocabulaire des états et événements sur iOS (draft, serverAck, delivered(count), readBy, retryExhausted) ou documenter la table de correspondance pour que les receipts rejoués restent idempotents.
- Créer la table send_attempts (localId, attemptNumber, transport, startedAt, finishedAt, outcome, errorMessage) écrite à chaque dispatch (REST, socket, rejeu outbox), best-effort, sans jamais bloquer le flush.
- Ajouter dans la vue détails d'un message la carte « Historique d'envoi » alimentée par ce journal.
- Brancher applyEvent sur les receipts socket avec rejet des régressions (replay idempotent).

Rendu : Carte « Historique d'envoi » dans les détails du message : liste chronologique, une ligne par tentative (numéro, transport socket/REST/rejeu, heure relative, erreur en rouge discret) ; pas d'icône alarmante pour un succès.

Transposition Android : MessageState/MessageStateMachine → MessageDeliveryState/MessageStateMachine existants ; send_attempts → nouvelle entité Room.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageState.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageStateMachine.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/SendAttemptRecord.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/message/MessageStateMachine.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/LocalMessage.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Mes réactions et celles des autres restent justes, hors-ligne comme après un écho serveur

`pco-reaction-ledger-local` · Android : **partielle** · P1 · effort M

ReactionLedger est la loi pure des réactions écrites dans reactionsJson. La clé d'auteur d'une ligne n'a pas la même nature selon qui l'a écrite : MA réaction (optimiste ou reconstruite du REST) est keyée par currentUserId (le User.id, clé que teste la pastille « c'est moi »), l'écho socket d'un tiers par son Participant.id, la reconstruction REST des réactions des autres n'en porte aucune. appendReaction/removeReaction reçoivent maxCount (aggregation.count servi, borne autoritaire du nombre de lignes d'un emoji) et ownerUserId (l'écho de mon propre ajout se range sous currentUserId, sans double comptage). ReactionOutboxTypes fixe ReactionAction add/remove et ReactionOutboxPayload (valeurs disque stables : un renommage est une migration) ; l'enfilage coalesce add puis remove (inserted, droppedNew, cancelledBoth) pour que la pastille revienne sans attendre le serveur.

Écarts :
- Android persiste des compteurs (Map<String, Int>) et l'ensemble de mes réactions : ajouter des lignes de réaction (emoji, userId ou participantId, createdAt) pour afficher « qui a réagi » hors-ligne.
- Règle d'identité : ma réaction sous User.id, celle d'un tiers sous Participant.id ; l'écho de ma propre réaction est réconcilié sans +2.
- maxCount autoritaire : l'agrégat serveur borne le nombre de lignes d'un emoji.
- Signal d'abandon permanent (404/410/409) qui retire la réaction optimiste (rollback) et notifie l'UI.
- Annulation locale d'un add puis remove (et inverse) sans aller-retour réseau (le coalescer le fait déjà côté file, vérifier le rendu immédiat).

Rendu : La pastille de réaction change à l'instant du tap (optimiste) ; un refus définitif la retire avec une animation discrète, sans toast bloquant.

Transposition Android : ReactionLedger pur → objet Kotlin pur testé ; reactionsJson → colonne ou sous-structure du payload Room.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+Reactions.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReactionLedger.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReactionOutboxTypes.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxCoalescer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/reaction/ReactionRepository.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReactionBreakdown.kt`

### Les citations, transferts et noms d'expéditeurs restent à jour et lisibles hors-ligne

`pco-reply-forward-snapshots-repaint` · Android : **partielle** · P1 · effort M

ReplyReference grave dans replyToJson le blob de citation d'un message ingéré : citation d'un POST (snapshot figé postReplyTo qui survit à l'expiration de la source : mood = emoji + contenu + date ; story = aperçu + compteurs) ou d'un MESSAGE via le même constructeur que APIMessage.toMessage, car ce blob alimente tout rechargement. CitedPost.markCitedPostWithdrawn rend « Story indisponible » chaque citation d'un post retiré, en une seule écriture. SenderRepaint.repaintSender(UserUpdatedEvent) repeint l'expéditeur (nom composé, avatar, contour) de tous ses messages, plus la citation et la référence de transfert qui gravent son id, en ne décodant que les lignes qui contiennent l'id. ReaderPrism résout le prisme ordonné du lecteur à l'enfilage (descente stricte rangs 1→4 sans repli « fr ») pour que la citation du temps réel et celle du rechargement affichent la même langue. Starred.starredSource reconstruit hors réseau ce que retrouve une étoile posée d'un autre appareil (aperçu servi par le Prisme, nature de pièce), nil si supprimé ou à vue unique.

Écarts :
- Snapshot de citation gravé à l'ingestion (réponse à un message, à une story, à un mood) qui survit à l'expiration de la source, avec descente du Prisme.
- Marquage en masse « Story/Publication indisponible » quand le post cité est retiré.
- Repeinture de l'expéditeur sur user:updated (nom composé, avatar, bannière, contour) dans les messages, les citations, les transferts ET la ligne de conversation directe : aucun traitement de user:updated n'existe côté sdk-core.
- Source d'étoile reconstructible hors réseau (message:starred ne porte aucun contenu) : lire le cache, appliquer le Prisme, refuser vue unique et supprimé.
- Résolution du prisme ordonné à l'enfilage (rangs 1→4, locale appareil en 4e) et gravure de la citation avec cette langue, jamais dans la boucle d'écriture.

Transposition Android : ReaderPrism → fonction partagée resolveUserLanguage/descente stricte Kotlin déjà portée côté sdk-core ; blobs JSON → colonnes texte Room.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+ReplyReference.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+CitedPost.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+SenderRepaint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+ReaderPrism.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor+Starred.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/StarredMessagesStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`

### Je vois exactement ce qui occupe mon stockage, par type de donnée et par domaine, et je purge ce que je veux

`pco-storage-selective-purge` · Android : **partielle** · P1 · effort M

CachePurgeService calcule un tableau croisé type de donnée (images, vidéos, audio, documents, messages, réactions, payloads) × domaine (publications, réels, conversations, stories), chaque case mesurée fichier par fichier (ou LENGTH() en base), JAMAIS estimée. Une case est purgeable(bytes) ou unavailable(raison), et la raison est structurelle et affichée telle quelle (une case grisée sans explication passerait pour un bug) : noDedicatedStore (les documents n'ont aucun store, rien à libérer), embeddedInPayload (compteurs de likes, tableau reactions : un champ de payload, purger ne libérerait rien et serait défait au premier rafraîchissement), indivisibleFromPosts (publications et réels partagent le store feed et les mêmes clés de liste), notApplicable (des messages dans le domaine stories). CacheMediaAttribution reconstruit à la demande le domaine d'un média en parcourant les payloads GRDB (posts, groupes de stories, messages) car les stores disque sont indexés par SHA-256 de l'URL sans trace du domaine ; le résidu non attribué (médias présents dont l'entité porteuse a quitté le cache) est mesuré et rapporté pour que la somme des cases égale la taille réelle du cache. DiskCacheStore+Purge fournit diskBytes(forURLs), unattributedDiskBytes(excluding), purge(urls) et purgeUnattributed.

Écarts :
- L'écran Android affiche les octets par catégorie (images, audio, vidéo, vignettes) et un bouton « tout effacer » : ajouter le tableau croisé type × domaine (publications, réels, conversations, stories) et la sélection de cases à purger.
- Types supplémentaires : documents, messages, réactions, payloads, avec disponibilité purgeable(bytes) ou indisponible(raison) ; afficher la raison (aucun store dédié, champ de payload, indivisible des publications, non applicable) plutôt qu'une case grisée muette.
- Index d'attribution média → domaine reconstruit en parcourant les payloads en cache (feed, stories, messages) ; mesurer le résidu non attribué et l'inclure pour que total des cases + non attribué = taille réelle.
- Mesure exacte fichier par fichier avant purge (jamais une estimation) et purge par ensemble d'URL.
- Les caches audio/vidéo/vignettes n'existent pas encore côté Android (voir cache disque) : sans eux le tableau est vide hormis les images.

Rendu : Tableau croisé à cases à cocher : lignes = types de données, colonnes = domaines ; chaque case purgeable montre sa taille exacte, chaque case indisponible est grisée avec sa raison en légende ; total affiché = somme des cases + « Non attribué » ; confirmation avant purge avec taille libérée.

Transposition Android : CachePurgeService → ViewModel du réglage « Stockage » dans les Réglages ; attribution par parcours des payloads Room.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePurgeService.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheMediaAttribution.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore+Purge.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaCacheScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaCacheViewModel.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaCacheStore.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaCacheScanner.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/mediacache/MediaCacheReport.kt`

### Je peux garder plusieurs brouillons de story, les reprendre intacts, et les retrouver listés

`pco-story-drafts-multi` · Android : **partielle** · P1 · effort M

StoryDraftStore persiste en SQLite (GRDB) des brouillons multiples avec transaction : slides, effets, médias (un sous-répertoire de fichiers par brouillon car deux brouillons peuvent partager un element_id), blob d'historique de commandes (annuler/rétablir), métadonnées d'accessibilité (StoryDraftAccessibility : texte alternatif par média, opt-in d'extraction du son, légende par média, clés par id d'élément du composer, decodeIfPresent pour relire un brouillon plus ancien), marqueurs de publication (markPendingPublish gèle le brouillon, recordPublishFailure, clearPendingPublish) et draftEditingPostId (édition d'une story existante). StoryDraftSchema migre le schéma mono-brouillon vers le schéma partitionné par draft_id en reconstruisant les trois tables (SQLite ne change pas une clé primaire) et déplace les fichiers à plat dans le sous-répertoire. listDrafts() rend des StoryDraftSummary sans rien charger : premier texte non vide, première image encore présente (chemin LOCAL), fond de la première slide, composite de toutes les couches posé dès le premier enregistrement, brouillon gelé. lastPersistFailure rend un échec d'écriture discernable d'un succès ; purgeLostMedia retire les médias perdus.

Écarts :
- Android n'a qu'un brouillon à emplacement unique (DataStore) : passer à des brouillons multiples identifiés par draftId, chacun avec son sous-répertoire de médias.
- Liste des brouillons (« Mes stories ») alimentée par un résumé léger sans charger les slides : premier texte, vignette de la première image locale encore présente, fond de la première slide, composite, marqueur « publication en cours ».
- Persister texte alternatif par média, légende par média, opt-in d'extraction du son et historique de commandes (annuler/rétablir) avec lecture rétro-compatible (decodeIfPresent).
- Marqueurs de publication : geler le brouillon pendant la publication, enregistrer l'échec, le dégeler ; draftEditingPostId pour l'édition d'une story publiée.
- Témoin d'échec de persistance (dernière erreur d'écriture) pour distinguer un brouillon jamais écrit d'un brouillon écrit, et purgeLostMedia à la reprise.
- Migration depuis le brouillon unique actuel sans le perdre.

Rendu : Liste de brouillons en cartes avec vignette (première image locale sinon fond de la première slide), premier texte comme titre ou « N diapositives », badge « Publication en cours » sur un brouillon gelé ; reprise du composer à l'identique (slide sélectionnée, calques).

Transposition Android : GRDB StoryDraftStore + fichiers par brouillon → tables Room (drafts, slides, elements) + filesDir/story-drafts/<draftId> ; DataStore actuel migré.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftRows.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftSchema.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftSummary.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftAccessibility.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryComposerDraftStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/StoryComposerDraftSnapshot.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerDraft.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryDraftMediaReconciler.kt`

### Une story publiée hors-ligne part au retour du réseau, et si ses médias ont disparu elle revient éditable avec l'erreur

`pco-story-publish-queue` · Android : **partielle** · P1 · effort M

StoryPublishQueue (acteur singleton) persiste sur disque les stories en attente (payload des slides sérialisé + références aux médias locaux avec vérification de présence avant chaque retry), pilote la boucle de retry et émet succès/échecs : StoryPublishSuccess (queueId, tempStoryId réconcilié avec l'id serveur), StoryPublishFailure avec raison maxRetriesReached, missingLocalMedia(elementIds) ou unrecoverable(message) et le draftId d'origine pour ramener un échec PERMANENT à l'état éditable avec son erreur. API : enqueue, dequeue, updateSlidesPayload, markInFlight/clearInFlight, retryFailedItem, failPermanently, discardFailedItem, recoverLastStuckItem(olderThan), processNext, observeConnection. StoryPublishRetryPolicy : un 4xx est définitif (le rejouer brûle le budget et classe à tort « publication au retour en ligne » alors que l'appareil EST en ligne) sauf 401, 408, 425, 429 ; extraction du code machine d'un refus (EMAIL_NOT_VERIFIED…). StoryOfflineQueue est l'adaptateur historique qui transfère tout vers la file unifiée, StoryQueueMigrator draine les anciens fichiers JSON.

Écarts :
- Android publie via un kind PUBLISH_STORY de l'outbox avec chaîne UPLOAD_MEDIA (dependsOn, greffe des ids réels) et expose pending/failed avec retryPublish/discardPublish : il manque la classification d'erreur de StoryPublishRetryPolicy (4xx définitif sauf 401/408/425/429) et l'extraction du code de refus machine.
- Détection de médias locaux disparus avant chaque retry (missingLocalMedia) et échec permanent qui ramène la story éditable dans son brouillon avec le message d'erreur (draftId d'origine).
- recoverLastStuckItem(olderThan) : reprise de la dernière publication bloquée.
- Réconciliation de l'id temporaire (pending_<uuid>) avec l'id serveur à la livraison (déjà en partie), nettoyage des médias locaux à l'abandon.
- Retry automatique à la reconnexion et un seul traitement en vol à la fois (markInFlight/clearInFlight).

Rendu : Anneau de story de moi en état « en attente » (optimiste) puis réconcilié ; en échec : bande « Story non publiée » avec Réessayer / Supprimer ; un échec définitif rouvre le composer sur le brouillon avec l'erreur.

Transposition Android : StoryPublishQueue (fichier JSON + acteur) → lignes PUBLISH_STORY de l'outbox Room + fichiers de médias en file ; migrator historique → non applicable (pas d'ancienne file Android).

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryOfflineQueue.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishRetryPolicy.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryQueueMigrator.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/PendingStoryPublish.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/FailedStoryPublish.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/PublishMediaWriteBack.kt`

### Les traductions, transcriptions et pistes audio traduites déjà reçues s'affichent immédiatement à la réouverture

`pco-translation-persist-cache` · Android : **partielle** · P1 · effort M

TranslationRecord, TranscriptionRecord et AudioTranslationRecord vivent dans message_translations (index UNIQUE message + langue idx_trans_msg_lang), message_transcriptions et message_audio_translations. TranslationRecordWriter fait un upsert qui cible cet index : deux schémas d'id coexistent pour la même (message, langue) — le fallback socket horodaté et l'id serveur stable — et la ligne est remplacée quelle que soit la source. TranslationCacheRecord (translation_cache) sert de cache L2 par message ; CacheCoordinator expose cacheTranslation/cacheTranscription/cacheAudioTranslation, une hydratation au démarrage, une éviction bornée, un lookup groupé cachedTranslations(for: [ids]) et invalidateTranslations(for:) quand le contenu change.

Écarts :
- Android réécrit le payload entier du message à chaque traduction, transcription ou piste audio reçue (applyTranslation, applyTranscription, applyAudioTranslation) : créer des tables dédiées avec unicité (messageId, langue) et upsert idempotent quel que soit le schéma d'id.
- Cache L1 borné hydraté au démarrage et lookup groupé pour une fenêtre de messages (évite N lectures au scroll).
- Invalidation à l'édition étendue aux transcriptions et pistes audio traduites.
- Cache des traductions à la demande (requestTranslation) pour réafficher sans re-demander, avec éviction bornée.

Rendu : Le Prisme sert la langue préférée sans chargement visible : la traduction en cache s'affiche à l'ouverture, indicateur de langue discret.

Transposition Android : Tables GRDB de traduction → entités Room MessageTranslation/Transcription/AudioTranslation avec index unique.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/TranslationRecords.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/TranslationCacheRecord.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/TranslationRecordWriter.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/translation/TranslationRepository.kt`

### Mes sections de conversations (créer, renommer, colorer, replier, réordonner, supprimer) se synchronisent entre mes appareils

`pco-user-category-store` · Android : **partielle** · P1 · effort M

UserCategoryStore (acteur, éditeurs Combine) tient en RAM les catégories de conversation de l'utilisateur : hydrate / hydrateFromSnapshot, create(name, color, icon), rename, setColor, setIcon, setExpanded, delete, reorder(updates) avec optimistic update et rollback, applyRemote(CategoryRemoteEvent) pour category:created/updated/deleted et categories:reordered. Dépend du protocole UserCategoryWriting (list, create, update partiel, delete, reorder en lot POST /reorder) pour être testable.

Écarts :
- Android sait lister (cache-first, snapshot DataStore) et créer une catégorie, et reçoit les événements de catégories : il manque rename, setColor, setIcon, setExpanded, delete et reorder (REST PATCH/DELETE/POST reorder absents de PreferencesApi) avec optimistic update et rollback.
- Appliquer category:created/updated/deleted et categories:reordered au store (applyRemote) pour la synchronisation multi-appareils.
- createSectionAndAssign : créer une section et y ranger une conversation en un geste.
- Tri stable (ordre serveur) et état replié/déplié persisté.

Rendu : Sections repliables avec chevron, pastille de couleur et icône de la section ; le réordonnancement par glisser-déposer est instantané ; supprimer une section range ses conversations sans les perdre.

Transposition Android : UserCategoryStore actor → CategoryRepository étendu (Flow + mutations optimistes) ; snapshot DataStore conservé.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Store/UserCategoryStore.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/category/CategoryRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/category/CategorySnapshotStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/category/CategoryCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CategorySocketManager.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PreferencesApi.kt`

### Les bulles ne bougent pas pendant le scroll : leur taille est connue avant l'affichage

`pco-bubble-layout-precompute` · Android : **partielle** · P2 · effort S

BubbleLayoutEngine calcule la taille d'une bulle via CTFramesetter (thread-safe) à partir du contenu, des dimensions de la pièce jointe, de la présence d'un aperçu de réponse et du nombre de réactions : largeur de contenu = 75 % de la largeur max moins 2 × 12 de padding, ligne d'horodatage 18, aperçu de réponse 44, barre de réactions 28, horodatage inline (52 + 8 de gap) quand la dernière ligne a la place. Le résultat (taille, largeur de dernière ligne, nombre de lignes, timestampInline) est persisté sur la ligne (cachedBubbleWidth/Height, layoutVersion, layoutMaxWidth) et invalidé globalement par globalLayoutEpoch quand la police ou la largeur change, pour que la liste UIKit connaisse la hauteur sans mesurer.

Écarts :
- Pas de persistance à reproduire : Compose mesure à la volée ; l'équivalent est une liste stable (clés par id, contentType par genre de bulle) qui évite de re-mesurer toute la liste sur recomposition partielle (BubbleMemoCache couvre déjà la mémoïsation du contenu).
- Reproduire la règle d'horodatage inline : inline si largeur de dernière ligne + 52 + 8 tient dans la largeur disponible, sinon ligne dédiée de 18 pt.
- Invalider globalement les mesures quand l'échelle de police système ou la largeur change (rotation, pliable).

Rendu : Largeur max de bulle 75 % de l'écran moins 24 pt de padding horizontal ; hauteur ligne d'horodatage 18 ; aperçu de réponse 44 ; barre de réactions 28 ; horodatage inline si la dernière ligne a 60 pt de libre.

Transposition Android : CTFramesetter + colonnes de layout persistées → Compose (mesure native + clés stables) ; pas de cache disque de layout.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/BubbleLayoutEngine.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/BubbleMemoCache.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`

### Les images et vignettes se décodent à la bonne taille, hors fil principal, sans saturer la mémoire

`pco-decoded-image-thumbnail-memory` · Android : **partielle** · P2 · effort M

DecodedBitmapStore est un NSCache d'UIImage partagé par tous les stores : variantes par palier de taille (bucket de maxPixelSize), décodage réduit (downsampledImage avec maxPixelSize 1200 par défaut) et plafond de décodé résident (50 Mo historiques) qui ne fait que BAISSER pour les appareils de tier bas (maxCacheableDecodedBytes / pixelCeiling selon DeviceMediaTier : 1536 px max sur tier bas, 17 Mo pour un poster 9:16) ; une image démesurée (20K × 20K, > 1 Go décodée) est rendue une fois mais jamais gardée. DecodedImageCache (NSCache coût-basé de CGImage, évincé sur memory warning). ThumbnailPrefetcher (acteur) : vignette décodée en NSCache puis disque, décodage par mmap + CGImageSource JAMAIS sur le MainActor, dossier créé une fois, nom SHA-256 hex (format historique à ne jamais changer). VideoFrameExtractor produit les images d'affiche de vidéo ; AVAssetTrack.naturalDisplaySize() donne la taille d'affichage avec rotation (idiome des rotations cardinales).

Écarts :
- Coil gère déjà un cache mémoire de bitmaps ; il faut en régler le plafond selon le palier de l'appareil (ActivityManager.isLowRamDevice / memoryClass) : décodage max 1536 px et plafond de décodé réduit sur appareils modestes, 1200 px par défaut en liste.
- Refuser de garder en mémoire une image dont le bitmap décodé dépasse le seuil (≈ 50 Mo) : l'afficher une fois, ne pas la conserver.
- Variantes par palier de taille pour ne pas redécoder à chaque densité / taille d'affichage.
- Précharger les vignettes sur disque et les décoder hors fil principal (Coil le fait ; vérifier que le chemin de vignettes de conversation l'emprunte).
- Extracteur d'image d'affiche vidéo avec cache et taille d'affichage tenant compte de la rotation (VideoFirstFrameExtractor existe, à aligner : cache, rotation).

Rendu : Vignette basse résolution (ThumbHash) immédiatement, puis plein format ; jamais de saccade de scroll due à un décodage ; mémoire stable sur appareil modeste.

Transposition Android : NSCache d'UIImage + mmap/CGImageSource → Coil MemoryCache (maxSizePercent selon la RAM) + downsampling Size ; ThumbnailPrefetcher → Coil prefetch / ImageRequest.diskCachePolicy.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DecodedBitmapStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/DecodedImageCache.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/ThumbnailPrefetcher.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/VideoFrameExtractor.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/AVAsset+NaturalDisplaySize.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/ThumbHashPainter.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerPrefetch.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/VideoFirstFrameExtractor.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`

### Mes réglages modifiés hors-ligne sont envoyés au retour du réseau, le dernier gagne

`pco-settings-action-queue` · Android : **partielle** · P2 · effort S

SettingsAction stocke l'endpoint résolu, la méthode HTTP et le corps JSON déjà encodé (PATCH /users/me et voisins) pour qu'un dispatcher le rejoue tel quel. SettingsActionQueue est une file FIFO persistée sur disque qui survit au redémarrage, avec last-write-wins par (endpoint, méthode) fusionné champ par champ (une action neuve pour le même endpoint est combinée à celle en attente), flush au retour de la connectivité via un handler injecté et clearAll au logout. Couvre éditions de profil, préférences de notification, bascule de langue…

Écarts :
- Android couvre profil, notifications et confidentialité via les kinds UPDATE_PROFILE / UPDATE_SETTINGS / UPDATE_PRIVACY_SETTINGS (snapshot complet, dernier gagne) : étendre aux autres réglages synchronisés (langues, traduction, audio, apparence) ou fournir une action générique (endpoint, méthode, corps).
- Fusion champ par champ quand deux actions visent le même endpoint avec des champs différents (aujourd'hui le snapshot le plus récent remplace tout).
- Purge de la file au logout et ordre FIFO conservé entre endpoints différents.
- Rejouer au retour de la connectivité avec le même classement d'erreurs que le flusher d'outbox (définitif vs transitoire).

Transposition Android : SettingsActionQueue (fichier JSON) → lignes d'outbox du lane settings/profile avec coalescing par kind.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Persistence/SettingsActionQueue.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/preferences/PreferencesSyncCoordinator.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxCoalescer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationPreferencesSyncRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/privacy/PrivacyPreferencesSyncRepository.kt`

### Les @mentions s'affichent avec le nom d'affichage de la personne, même hors-ligne

`pco-user-display-name-cache` · Android : **partielle** · P2 · effort S

UserDisplayNameCache associe le username en minuscules à un nom d'affichage, alimenté par les messages et mentions vus (MentionedUser : userId, username, displayName, avatar). La table est BORNÉE à 2 000 entrées avec éviction des plus anciennes par paquet d'un quart pour amortir le décalage du tableau (les noms vus pendant des heures dans de grands groupes s'accumulaient sans fin et allMappings() recopie toute la table à chaque reconstruction). Accès thread-safe par verrou ; displayName(for:), subscript et allMappings() servent à reconstruire le texte d'un message qui mentionne.

Écarts :
- Pas de cache global username → nom d'affichage borné : les mentions sont résolues par répertoire local à la surface (CommentMentionDirectory) ; créer une table partagée de 2 000 entrées avec éviction par quart.
- Alimenter ce cache depuis les mentionedUsers des messages et posts reçus et le consulter au rendu d'un texte mentionnant.
- Clé insensible à la casse (username en minuscules) et accès thread-safe.

Rendu : Une mention s'affiche « @Nom d'affichage » (accentuée, tappable vers le profil) au lieu de « @username » dès que le nom est connu.

Transposition Android : Table verrouillée Swift → classe Kotlin thread-safe (LinkedHashMap + Mutex ou LruCache(2000)).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Cache/UserDisplayNameCache.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentMentionDirectory.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/mention/MentionSearch.kt`


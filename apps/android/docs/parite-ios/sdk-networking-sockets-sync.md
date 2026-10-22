# Parité iOS → Android : `sdk-networking-sockets-sync`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**58 features iOS** : 18 absentes, 37 partielles, 3 divergentes, 0 complètes sur Android. **43 lots** planifiés (≈27980 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**sdk-networking-sockets-sync** (couverture Android estimée ≈ 35 %)

Socle d'infrastructure du SDK iOS : client REST unique (politique par route, réessai 429/503 avec Retry-After, refresh de session en un vol, refus typés, signaux de compte supprimé / âge / fin d'invité / e-mail non vérifié / limites du jour, porte 426), 59 catalogues de routes GÉNÉRÉS depuis route-manifest.json, TUS reprenable par empreinte de fichier, moniteur réseau, deux sockets Socket.IO (messages, social) avec backoff, heartbeat, salles, accusés typés et ~150 événements routés dans l'ordre d'arrivée, et le moteur de synchro de conversations (plein + delta + relais temps réel qui écrit dans le cache + registre du non-lu). Côté app : pastille de synchro globale (ConnectionBanner/SyncPill), PresenceManager et point de présence « ici ». Android a les bases : Retrofit/OkHttp avec refresh sur 401, ServerEnvironment, SocketManager et gestionnaires par domaine, delta-sync des conversations (updatedSince + ETag), SyncSeqTracker, politique de téléchargement média, seuils de présence 1/3/5, repli TUS partiel. Manquent surtout : réessai et politique par route, épinglage de certificat, porte de mise à jour, signaux de refus, heartbeat / backoff / reprise arrière-plan / salles conversation:join, ~60 événements socket (éphémères, marques personnelles, viewing, engagement, appels avancés), envoi par socket avec accusé, relais qui applique les événements au cache (Android relit la liste par GET et seulement écran ouvert), tombstones de delta, registre du non-lu et accusés de réception, pastille globale, PresenceManager unique, et près de la moitié des routes REST. Estimation : environ un tiers de la parité ; plus gros chantier = relais cache temps réel (L), puis familles de routes, TUS depuis fichiers et pastille globale.

## Notes transverses

VÉRIFICATIONS CONTRE L'ARBRE RÉEL (apps/android lu le 2026-10-22) : (1) SocketManager.connect() recrée un socket à chaque appel sans fermer l'ancien et joinRoom n'est qu'une ligne de journal ; (2) MessageSocketManager.buf() = extraBufferCapacity 64 : un tryEmit sous rafale perd des événements sans bruit ; (3) ConversationListViewModel appelle requestRefresh() (GET /conversations) à chaque message:new, unread-updated, conversation:updated, restored et seulement écran composé ; (4) tous les senders de OutboxFlushWorker traduisent NetworkResult.Failure en SendResult.TransientFailure sans distinguer un refus définitif ; (5) ApiError porte DÉJÀ fieldName / suggestions / violations (l'inventaire sous-estime : restent emailOwner, resetAt, limit, retryAfter) ; (6) MeeshyConfig.STAGING (staging.meeshy.me) contredit ServerEnvironment.STAGING (gate.staging.meeshy.me) : le lot identite-client tranche contre l'hôte réellement déployé ; (7) l'outbox Android est typé par OutboxKind (pas de chemin brut persisté) : le « rejeu d'un chemin legacy » de l'inventaire est inutile ici, le cliquet de routes suffit ; (8) core:network n'a pas okhttp-mockwebserver : le lot reseau-pipeline-reessai-erreurs l'ajoute à libs.versions.toml (4.12.0) ; (9) MeeshyApp.kt fait 1202 lignes (au-dessus du seuil 1000) et ChatViewModel 2248 : aucun lot n'y ajoute de logique, uniquement un crochet d'une ligne.

ARCHITECTURE POUR LE PARALLÉLISME (à faire respecter par l'orchestrateur) : les fichiers chauds sont rendus disjoints par construction. (a) reseau-pipeline-reessai-erreurs expose OkHttpClient et Retrofit en singletons Hilt et un multibinding ordonné HttpClientContributor : plus aucun lot n'édite MeeshyApi.create ni NetworkModule ; chaque nouvelle interface Retrofit se déclare dans SON module Hilt (jamais SdkModule.kt, sauf le lot reseau-en-ligne qui y échange une liaison). (b) refus-types-limite-du-jour-mode-lent crée GlobalOverlays (point d'extension Compose unique de :app, un seul crochet dans MeeshyApp.kt) : upgrade, e-mail à valider, session fermée et pastille de synchro s'y inscrivent en @IntoSet. (c) socket-connexion-jeton-identite-idempotente transforme RealtimeSessionCoordinator en armeur d'un multibinding RealtimeAttachable : relais, garde de session, social s'y inscrivent sans l'éditer. (d) socket-routage-evenements-ordre-arrivee GÈLE MessageSocketManager / SocialSocketManager / CallSignalManager : chaque famille d'événements ajoute SA classe (XxxSocketEvents + ses modèles dans un NOUVEAU fichier de :core:model) et son applicateur de cache. (e) relais-cache-messages-temps-reel définit RealtimeCacheApplier (multibinding) : chaque lot d'événements contribue son applicateur à Room dans l'ordre d'arrivée, sans toucher au relais. (f) Fichiers à ordre imposé par depends_on : SocketManager.kt (28 puis 31), ConversationCacheSource.kt (51, 52, 53), ApiResponse.kt / ApiCall.kt (1, 2, 12), OutboxFlushWorker.kt (12, 5, 27, 35 — hunks distincts, ordre de fusion recommandé dans cet ordre), ConversationListViewModel.kt (38 puis 59), ConversationRow.kt (59 puis 60). SocketEvents.kt (:core:model) est modifié par 39 (UnreadUpdateEvent) et 43 (ConversationUpdatedSocketEvent) dans des régions distinctes. (g) MeeshyDatabase : seul sync-chargement-parallele-par-compte monte la version (16 vers 17, migration écrite) ; tout lot d'un autre domaine qui touche le schéma doit se coordonner avec lui.

LOIS TRANSVERSES À TESTER : Prisme Linguistique — l'aperçu de liste écrit par le relais passe par LastMessagePreviewResolver (:core:model/lang) et ReaderPrism (descente stricte, jamais translations.first, la langue d'origine concourt à son rang) ; les échecs de traduction sont un état discret avec relance, jamais un repli sur une autre langue ; l'audio élit sa piste par la langue du texte servi. Présence — vert #34D399 / orange #FBBF24 / gris #9CA3AF affiché / hors ligne = AUCUN point ; typing:start = preuve d'activité (jamais soi-même) ; le client ne fabrique ni ne prolonge une présence que le serveur n'a pas servie (visibilité = amis acceptés, soi, ADMIN, résolue côté gateway) ; le point « ici » (brandPrimary) prime sur la présence. Accent de conversation — le bouton Ajouter et les chips de la pastille prennent accentColor du contexte, jamais une couleur codée ; erreurs/succès restent les couleurs sémantiques statiques. E2EE optionnel et fail-closed : le repli d'envoi par socket ne part JAMAIS en clair pour un texte chiffré sans pièce jointe ; aucun jeton, mot de passe ou contenu de message n'est journalisé (SensitiveBodyLoggingGuard reste en place). Rétrocompatibilité : toute nouvelle clé de réponse est optionnelle (ancien serveur) et tout nouvel en-tête est ignorable (ancien client).

RISQUES : (1) l'épinglage de certificat peut briquer toute la flotte — pin de secours, date d'expiration du pin-set et exemption localhost/custom obligatoires, rotation documentée ; (2) la reprise arrière-plan suit ARCHITECTURE.md §7 (socket tenue seulement au premier plan, FCM en arrière-plan) sauf pendant un appel actif ; (3) Android multiplexe messages et social sur UN SocketManager (contrairement aux deux sockets d'iOS) : le lot social ne doit jamais ouvrir une seconde socket ; (4) le relais est le plus gros chantier (L) et le chemin critique : routage 33 vers relais 36 vers 37 vers familles 39-43 ; (5) les écritures de Room par le relais et les collecteurs encore présents dans ChatViewModel appliquent le même broadcast : toutes les mutations sont idempotentes (la suppression des collecteurs doublons du ViewModel est une dette consignée pour le domaine chat, pas un lot ici) ; (6) le CI android.yml est le seul gate : la logique est poussée dans :core:model (vérifiable localement par ./apps/android/meeshy.sh jvm-check) et les écrans restent minces.

DÉPENDANCES EXTERNES (ext:) À SUIVRE PAR LES AUTRES DOMAINES : ext:auth-screens (écrans 2FA, récupération par téléphone, transfert de numéro, consommateurs des routes du lot routes-authentification), ext:chat-composer-send-button (compte à rebours du mode lent et libellé « Reviens à HH:mm » sous le composeur), ext:bubble-states (états de bulle : traduction impossible, Vu et supprimé, anneau éphémère, Story indisponible), ext:calls-in-call-ui (câblage des nouveaux composables d'appel dans CallScreen / CallViewModel), ext:localisation-7-langues (les 3 langues de libellés absentes de sdk-ui : values, values-fr, values-es, values-pt existent), ext:design-system-glass-surfaces (MeeshyGlassSurface existe déjà pour la pastille). Le gel du 2026-09-16 est levé (#11570) : les lois à miroirs se lisent « TROIS » ; chaque lot qui touche une loi (Prisme, présence, _seq, événements socket) vérifie les deux autres miroirs (web packages/shared, iOS MeeshySDK) dans sa description de PR.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `armement-relais-session-medias-recus` | A | P0 | S | 400 | relais-cache-conversations-participants, socket-reconnexion-heartbeat-arriere-plan, socle-points-d-extension-de-l-app | À l'ouverture de session tous les relais s'arment d'un seul point, et les médias reçus s'enregistrent selon les préférences |
| `envoi-media-arriere-plan-notification` | A | P0 | M | 420 | refus-types-limite-du-jour-mode-lent, persist-outbox-registre-senders | Un envoi de média lancé au premier plan se termine ou se reprend proprement si l'app passe en arrière-plan |
| `etat-connexion-et-regles-pastille` | A | P0 | M | 750 | reseau-en-ligne-source-unique, socket-reconnexion-heartbeat-arriere-plan, persist-outbox-file-attente-cycle-de-vie | Un seul état de connexion et des règles de pastille décident quoi montrer : hors ligne, reconnexion, envois en cours, qui écrit |
| `identite-client-et-environnement-serveur` | F0 | P0 | M | 600 | reseau-pipeline-reessai-erreurs | Le serveur sait quelle version et quel appareil lui parlent, et le serveur choisi pilote tout de façon cohérente |
| `pastille-synchro-globale-affichage` | A | P0 | M | 850 | etat-connexion-et-regles-pastille, refus-types-limite-du-jour-mode-lent, socle-points-d-extension-de-l-app, liste-decoupage-ecran-jetons-lentille | Une pastille discrète en haut de tous les écrans dit hors ligne, reconnexion, envois en cours et qui écrit, et se relance d'un doigt |
| `point-de-presence-ici-et-libelles` | A | P0 | M | 480 | atomes-d-avatar-loi-humeur-et-non-lus | Le point de présence a la bonne couleur, la bonne taille et le bon libellé, avec un point « ici » qui respire |
| `presence-ecrans-migres-vers-gestionnaire` | A | P0 | M | 500 | presence-gestionnaire-unique, point-de-presence-ici-et-libelles, liste-temps-reel-patch-en-place, socket-salles-conversation-ouverte, chat-viewmodel-state-split, liste-decoupage-viewmodel | Les écrans lisent tous la même présence et seul l'avatar concerné se redessine |
| `presence-gestionnaire-unique` | A | P0 | M | 650 | socket-routage-evenements-ordre-arrivee, socket-viewing-presence-frappe, socket-reconnexion-heartbeat-arriere-plan | La présence est la même partout, se met à jour seule et survit au redémarrage |
| `refus-de-session-compte-supprime-age-invite` | A | P0 | M | 850 | session-renouvellement-un-seul-vol, identite-client-et-environnement-serveur, socket-connexion-jeton-identite-idempotente, refus-types-limite-du-jour-mode-lent, socle-points-d-extension-de-l-app | Un compte supprimé ailleurs, un mineur de moins de 13 ans ou un lien d'invité expiré ramènent l'utilisateur au bon écran, et rien d'autre |
| `refus-types-limite-du-jour-mode-lent` | F0 | P0 | M | 950 | reseau-pipeline-reessai-erreurs, reponses-api-suppressions-et-pagination, socle-points-d-extension-de-l-app, persist-outbox-registre-senders | Quand un refus désigne un champ, une limite du jour ou le mode lent, l'écran dit pourquoi et jusqu'à quand |
| `relais-cache-conversations-participants` | A | P0 | L | 1200 | relais-cache-messages-temps-reel, persist-conversations-fusion-en-place, persist-messages-fusion-ingestion, socle-points-d-extension-de-l-app, socket-routage-evenements-ordre-arrivee, liste-decoupage-viewmodel | La liste de conversations suit en direct les changements de conversation, de participants, de réactions et de traductions |
| `relais-cache-messages-temps-reel` | A | P0 | L | 1600 | socket-routage-evenements-ordre-arrivee, socket-salles-conversation-ouverte | Un message reçu pendant que la conversation est fermée met à jour la liste, l'aperçu et le non-lu, même si on rouvre hors ligne |
| `reponses-api-suppressions-et-pagination` | F0 | P0 | S | 350 | reseau-pipeline-reessai-erreurs | Un client qui a manqué un événement apprend quand même qu'une conversation ou une story a disparu |
| `reseau-en-ligne-source-unique` | F0 | P0 | M | 420 |  | L'app sait en temps réel si le réseau est là, sans clignoter ni se tromper au démarrage |
| `reseau-pipeline-reessai-erreurs` | F0 | P0 | M | 900 | dependances-gradle-scene-medias | Chaque appel réseau se réessaie tout seul, échoue lisiblement et ne rejoue jamais un refus définitif |
| `session-renouvellement-un-seul-vol` | F0 | P0 | M | 550 | reseau-pipeline-reessai-erreurs | Une session expirée se renouvelle en silence et une seule fois, et un mauvais mot de passe ne déconnecte personne |
| `socket-accuses-emission-avec-reponse` | A | P0 | S | 320 | socket-routage-evenements-ordre-arrivee, refus-types-limite-du-jour-mode-lent | Les émissions qui exigent une réponse attendent l'accusé du serveur et savent lire un refus |
| `socket-connexion-jeton-identite-idempotente` | F0 | P0 | M | 650 | session-renouvellement-un-seul-vol, identite-client-et-environnement-serveur, socle-points-d-extension-de-l-app | La connexion temps réel s'ouvre une seule fois dès que le compte est connecté, avec les bonnes identités et un jeton valide |
| `socket-evenements-liste-conversations-profils` | A | P0 | M | 1000 | relais-cache-conversations-participants | Une nouvelle conversation, un participant qui arrive ou un profil qui change apparaissent aussitôt dans la liste |
| `socket-evenements-messages-cycle-de-vie` | A | P0 | M | 700 | relais-cache-conversations-participants | Une story citée retirée, une file hors ligne rejouée et une mention arrivent en direct, conversation ouverte ou non |
| `socket-reconnexion-heartbeat-arriere-plan` | A | P0 | M | 800 | socket-connexion-jeton-identite-idempotente, reseau-en-ligne-source-unique, socle-points-d-extension-de-l-app | Une coupure se rattrape vite et sans tempête, la latence est mesurée, et la socket revient dès le retour au premier plan |
| `socket-routage-evenements-ordre-arrivee` | F0 | P0 | M | 850 | socket-connexion-jeton-identite-idempotente | Chaque événement temps réel est décodé hors du fil principal et appliqué dans l'ordre exact où il est arrivé |
| `socket-salles-conversation-ouverte` | A | P0 | M | 420 | socket-connexion-jeton-identite-idempotente, chat-viewmodel-state-split | Ouvrir une conversation rejoint sa salle ; une reconnexion rejoint d'abord celle que l'on lit |
| `socket-traductions-echecs-et-pistes-audio` | A | P0 | M | 650 | relais-cache-conversations-participants, socket-accuses-emission-avec-reponse, persist-messages-repository-decoupage | Les traductions, transcriptions et pistes audio traduites arrivent en direct, avec leurs échecs et leur relance |
| `socket-viewing-presence-frappe` | A | P0 | M | 520 | socket-routage-evenements-ordre-arrivee, socket-salles-conversation-ouverte | On voit en direct qui regarde la conversation et qui écrit, sans rien révéler de plus |
| `sync-chargement-parallele-par-compte` | A | P0 | M | 700 | reponses-api-suppressions-et-pagination, session-renouvellement-un-seul-vol, persist-room-migrations | Au premier lancement ou après une longue absence, la liste de conversations se charge vite, page après page, sans jamais bloquer l'écran |
| `sync-rattrapage-tombstones-trou-sequence` | A | P0 | M | 850 | sync-route-delta-fusion-par-champs, reponses-api-suppressions-et-pagination, socket-reconnexion-heartbeat-arriere-plan, socket-routage-evenements-ordre-arrivee | Au retour au premier plan, seul ce qui a changé est rechargé, et une conversation supprimée ailleurs disparaît |
| `sync-route-delta-fusion-par-champs` | A | P0 | M | 700 | sync-chargement-parallele-par-compte, reponses-api-suppressions-et-pagination | La synchro ne rapatrie que ce qui a changé et ne piétine jamais ce qu'elle ne sert pas |
| `tus-envoi-depuis-fichier-reprenable` | A | P0 | L | 1300 | envoi-media-arriere-plan-notification, session-renouvellement-un-seul-vol, persist-media-file-queue | Un gros média monte en reprenant exactement où il s'est arrêté, même après une coupure ou la mort du processus |
| `bouton-connexion-ami-universel` | A | P1 | M | 480 |  | Un seul bouton Ajouter / En attente / Accepter-Refuser / Contact / Bloqué sur tout profil, avec retour immédiat |
| `catalogue-routes-genere-depuis-manifeste` | A | P1 | M | 750 |  | Les routes REST de la passerelle sont un catalogue généré et vérifié, jamais recopié à la main |
| `epinglage-certificat-passerelle` | A | P1 | S | 280 | reseau-pipeline-reessai-erreurs, socket-connexion-jeton-identite-idempotente | Les échanges avec la passerelle ne passent que par le certificat attendu |
| `images-plus-petite-variante-suffisante` | A | P1 | S | 300 | atomes-d-avatar-loi-humeur-et-non-lus | Les aperçus d'images chargent la plus petite variante suffisante au lieu de l'original de plusieurs Mo |
| `message-envoi-repli-socket-avec-accuse` | A | P1 | M | 450 | socket-accuses-emission-avec-reponse, persist-outbox-registre-senders | Quand l'envoi REST échoue, le message part par la socket avec le même identifiant client et sans doublon |
| `porte-mise-a-jour-obligatoire` | A | P1 | M | 480 | identite-client-et-environnement-serveur, refus-types-limite-du-jour-mode-lent, socle-points-d-extension-de-l-app, dependances-gradle-scene-medias, reseau-pipeline-reessai-erreurs | Une version trop ancienne est bloquée par un écran « Mettre à jour » qui ouvre le Play Store |
| `presence-ici-dans-la-conversation` | A | P1 | M | 480 | socket-viewing-presence-frappe, presence-ecrans-migres-vers-gestionnaire, point-de-presence-ici-et-libelles, socket-salles-conversation-ouverte, socket-routage-evenements-ordre-arrivee, composer-glass-shell, chat-viewmodel-state-split, liste-decoupage-viewmodel | On voit qui regarde la conversation en ce moment sans rien révéler de plus |
| `socket-appel-signalisation-accuses-transcription` | A | P1 | M | 650 | socket-accuses-emission-avec-reponse | Les appels signalent leur fin, leurs erreurs d'accessoires et la transcription en cours de façon fiable |
| `socket-ephemere-vue-unique-capture` | A | P1 | M | 650 | relais-cache-conversations-participants, socket-accuses-emission-avec-reponse | Une vue unique, un message qui s'autodétruit ou une capture d'écran sont signalés à tous en temps réel |
| `socket-position-en-direct-emission` | A | P1 | S | 380 | socket-routage-evenements-ordre-arrivee | Partager sa position en direct dans une conversation, la mettre à jour et l'arrêter |
| `socket-reactions-pieces-jointes-et-marques-personnelles` | A | P1 | M | 550 | relais-cache-conversations-participants, socket-accuses-emission-avec-reponse | Les réactions sur les pièces jointes, mes favoris et mes messages masqués se synchronisent entre mes appareils |
| `socket-social-reactions-abonnements` | A | P1 | M | 850 | socket-routage-evenements-ordre-arrivee, socket-accuses-emission-avec-reponse, socket-reconnexion-heartbeat-arriere-plan | Le fil, les stories et les commentaires bougent en direct, et les réactions sont confirmées par le serveur |
| `briques-transverses-erreurs-au-mieux` | A | P2 | S | 300 |  | Les erreurs « au mieux » et les écritures de cache ne disparaissent plus en silence |
| `socket-engagement-jeu-decor` | A | P2 | M | 450 | socket-routage-evenements-ordre-arrivee, game-network-api | Les récompenses, la progression de jeu et le décor de profil se mettent à jour en direct |

### Lots fusionnés ou retirés par l'architecture

- `routes-authentification-sessions-comptes` → `contrat-api-authentification` (merge-into) : Mêmes routes d'authentification ; AuthApi n'a qu'un propriétaire.
- `routes-moi-preferences-consentements` → `profile-preferences-categories-api` (merge-into) : Mêmes routes /me/preferences et consentements. Hérite : refus-types-limite-du-jour-mode-lent.
- `routes-moi-jeu-decor-autocollants` → `game-network-api` (drop-duplicate) : Routes réparties chez leurs propriétaires : jeu (game-network-api), décor (decor-de-profil-equipe-et-synchronise), autocollants (packs-domain-and-service).
- `routes-utilisateurs-contacts-annuaire` → `carnet-adresses-modeles-et-api` (drop-duplicate) : Mêmes routes /directory et carnet ; les mentions sont posées par mention-contacts-and-lookup.
- `routes-conversations-recus-fils` → `chat-rest-and-outbox-surface` (merge-into) : Mêmes routes de conversation (reçus, lecture, fils, cartes) ; MessageApi/ConversationApi n'ont qu'un propriétaire. Hérite : refus-types-limite-du-jour-mode-lent.
- `routes-messages-pieces-jointes-traduction` → `pieces-jointes-api-transcription-traduction-statut` (merge-into) : Mêmes routes de pièces jointes et traductions asynchrones. Hérite : refus-types-limite-du-jour-mode-lent.
- `routes-fil-stories-statuts-sons` → `post-service-endpoints` (drop-duplicate) : Routes réparties : fil (post-service-endpoints), stories (story-service-rest-surface), sons (sons-bibliotheque-selecteur-et-page).
- `routes-communautes-liens-parrainage` → `communautes-socle-donnees` (drop-duplicate) : Routes réparties : communautés (communautes-socle-donnees), liens (sharelinks-list-and-detail-edit), suivi (analytics-network-surface), parrainage (parrainage-liens-affilies).
- `routes-notifications-appels-chiffrement` → `contrat-reseau-notifications-et-jeton` (drop-duplicate) : Routes réparties : notifications (contrat-reseau-notifications-et-jeton), appels (journal-appels-donnees), clés (cles-e2ee-de-l-appareil-et-bundle-publie).
- `routes-voix-profil-vocal` → `profil-vocal-api-et-consentement` (merge-into) : Mêmes routes du profil vocal.
- `routes-autocollants-packs-cosmetiques` → `packs-domain-and-service` (merge-into) : Mêmes routes de packs et autocollants.
- `routes-signalement-moderation-sante` → `report-service-all-targets` (merge-into) : Mêmes routes de signalement ; le retrait modérateur reste dans moderator-content-removal.
- `validation-email-avant-publier-inviter` → `porte-de-validation-d-e-mail` (merge-into) : Même porte « valider son e-mail sans perdre l'action ». Hérite : refus-types-limite-du-jour-mode-lent.
- `liste-conversations-lit-room-sans-relecture` → `liste-temps-reel-patch-en-place` (merge-into) : Même mise à jour de la liste depuis Room sans relire le serveur ; ConversationListViewModel n'a qu'un propriétaire.
- `socket-appel-controles-participants` → `calls-social-socket-events` (merge-into) : Mêmes événements call:* de participants ; CallSocialSignalManager est leur seul site.
- `socket-appel-enregistrement-cadre-apercu` → `calls-social-socket-events` (merge-into) : Mêmes événements call:* d'enregistrement, cadre et aperçu.
- `sync-non-lu-ouverture-accuses-reception` → `persist-conversations-registre-non-lus` (merge-into) : Même registre de non-lus (conversation ouverte = 0) ; l'accusé de réception rejoint le registre. Hérite : relais-cache-messages-temps-reel, socket-salles-conversation-ouverte.

## Features

### Un compte supprimé ailleurs, un mineur de moins de 13 ans ou un lien d'invité expiré ramènent l'utilisateur au bon écran, et rien d'autre

`nss-http-session-refusal-signals` · Android : **absente** · P0 · effort M

La passerelle signale trois refus de session par REST et par l'événement socket error : ACCOUNT_DELETED (401 ou auth:session-revoked), AGE_BELOW_MINIMUM (403) et, pour un invité de lien, SHARE_LINK_EXPIRED (403) / GUEST_ACCESS_REVOKED (410).

Écarts :
- Compte supprimé : détecter 401 {code:ACCOUNT_DELETED, accountId}, l'événement socket error et auth:session-revoked {deletedAccountId} ; n'agir que si le compte nommé est le propriétaire (JWT d'Authorization, du corps pour /auth/refresh, du handshake pour la socket).
- Poser le compte « en attente de retrait » AVANT de notifier (aucun refus intermédiaire n'invite à se reconnecter), couper SocketManager, purger Room, jetons et SavedAccountsStore, ouvrir l'écran « session fermée ».
- Âge : 403 AGE_BELOW_MINIMUM ⇒ signal global (tout autre 403 reste local) + isAgeRefusal(error) ; déclarer la capacité onboarding-age une fois l'écran d'âge livré ; écran de refus non contournable.
- Invité : GuestSessionEnd.from(code | statut+corps | charge socket) ; en REST ne terminer QUE la session refusée (comparer X-Session-Token), en socket arrêter les reconnexions ; GET /guest-sessions/me.

Rendu : Écrans plein écran sobres : icône, message, un seul bouton de sortie ; aucun retour vers l'écran refusé.

Transposition Android : NotificationCenter → SharedFlow<SessionRefusal> observé par la racine de navigation.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/AccountDeletedSignal.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+ConnectionAccount.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/AgeGateSignal.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/GuestSessionEnd.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+GuestSessionEnd.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/GuestSessionsEndpoint.swift`

</details>

### Au retour au premier plan ou du réseau, la socket revient tout de suite et rattrape ce qui a manqué

`nss-sock-background-network-recovery` · Android : **absente** · P0 · effort M

L'app suspend le transport en arrière-plan et le rouvre au retour ; quand le réseau repasse en ligne alors que la socket est coupée, la reconnexion est immédiate. presence:app-state et call:check-active sont ré-émis à chaque connexion (déjà fait côté Android : AppStatePresenceReporter).

Écarts :
- prepareForBackground / resumeFromBackground / forceReconnect sur ProcessLifecycleOwner (ON_STOP → suspendre après un court délai, ON_START → reconnecter si un jeton existe).
- Observer le réseau (NetworkCallback) : hors ligne → en ligne avec socket coupée ⇒ backoff.reset() + reconnexion immédiate (REST et social).
- isCallActiveGuard : ne jamais recréer la socket pendant un appel (garde la signalisation) ; replanifier un backoff si elle est déjà tombée.
- SharedFlow didReconnect (émis seulement si hadPreviousConnection) consommé par le moteur de synchro ; Android n'expose que connected (à chaque connexion, première incluse).

Transposition Android : scenePhase / UIApplication notifications → ProcessLifecycleOwner.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/MeeshyApplication.kt`

### Ouvrir une conversation rejoint sa salle ; une reconnexion rejoint d'abord celle que l'on lit

`nss-sock-room-membership` · Android : **absente** · P0 · effort S

joinConversation / leaveConversation émettent conversation:join / conversation:leave et mémorisent les salles ; le serveur s'en sert pour le pont de non-lu (« on ouvre pour LIRE »).

Écarts :
- Android n'émet jamais conversation:join / conversation:leave (SocketManager.joinRoom est un no-op de journal) : ajouter joinConversation / leaveConversation avec ensemble joinedConversations.
- roomsToRejoin(joined, active, open) : active d'abord, ouvertes triées, puis le reste ; ré-émettre à CHAQUE connect.
- activeConversationId et openConversationIds (plusieurs fenêtres / tablette / pliable) tenus par le gestionnaire de notifications in-app.
- Écouter conversation:joined, conversation:left, conversation:join-error (invalider le cache des participants, afficher le refus de rejoindre).

Transposition Android : Pur Kotlin ; la règle roomsToRejoin est une fonction pure testable.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketConnectionRules.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocketManager.kt`

### Les routes REST de la passerelle sont un catalogue généré, jamais recopié à la main

`nss-api-endpoint-catalog-generator` · Android : **absente** · P1 · effort M

Côté iOS, tous les MeeshyEndpoint (59 fichiers) sont GÉNÉRÉS depuis services/gateway/route-manifest.json par packages/shared/api/build-swift-endpoints.ts (npm run ios-endpoints:generate) ; les familles de chemins hérités /api/... restent générées pour rejouer des requêtes persistées.

Écarts :
- Ajouter un générateur Kotlin (build-kotlin-endpoints.ts, jumeau de build-swift-endpoints.ts) émettant un catalogue ApiRoutes typé depuis route-manifest.json, lancé par un script npm et vérifié en CI (android.yml).
- Test de cliquet : toute route déclarée dans une interface Retrofit existe dans le manifeste ; toute route du manifeste est classée (implémentée Android / ops-only / hors périmètre mobile).
- Rejeu de requêtes persistées (replayPersistedRequest) : les lignes d'outbox gardent le chemin legacy ; OutboxFlushWorker doit savoir rejouer un chemin brut (rétrocompatibilité des lignes déjà en file).

Transposition Android : enum Swift MeeshyEndpoint → sealed interface/object Kotlin générés.

<details><summary>Sources iOS (8)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/ApiLegacyAttachmentsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/ApiLegacyConversationsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/ApiLegacyMessagesEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/ApiLegacySocketioEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/ApiLegacyUserEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/RootLegacyAttachmentsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/RootLegacyVoiceEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/MeeshyEndpoint.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/MeeshyApi.kt`

### Les échanges avec la passerelle ne passent que par le certificat attendu

`nss-http-certificate-pinning` · Android : **absente** · P1 · effort S

Le client épingle le SHA-256 de la clé publique (SPKI) du serveur, en RSA 2048 / 4096 et EC P-256 / P-384, appliqué au REST et aux sockets.

Écarts :
- Aucun CertificatePinner OkHttp ni network_security_config.xml : ajouter un pin-set (pins courants + de secours, expiration) pour gate.meeshy.me et staging.
- Appliquer le même pinning à la WebSocket Socket.IO (OkHttpClient partagé) ; mode « non configuré » pour localhost / environnement custom.
- Journaliser le refus sans exposer la chaîne ; test de la décision pure (non configuré / accepté / refusé / chaîne illisible).

Transposition Android : URLSessionDelegate → okhttp3.CertificatePinner + res/xml/network_security_config.xml.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/CertificatePinning.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/CertificatePinningDelegate.swift`

</details>

### Quand la limite du jour ou le mode lent d'un nouveau compte bloque un geste, l'écran dit pourquoi et jusqu'à quand

`nss-http-daily-limit-slow-mode` · Android : **absente** · P1 · effort S

Deux refus 429 sont reconnus : la limite quotidienne de commentaires / réactions (jusqu'à l'heure de remise à zéro du compte) et le mode lent des comptes de moins de 24 h dans Meeshy Global (un message toutes les 30 s).

Écarts :
- Reconnaître 429 DAILY_COMMENT_LIMIT / DAILY_REACTION_LIMIT ({code, retryAfter, resetAt, limit, path} à la racine) en REST et dans l'accusé socket ; refus terminal jusqu'à resetAt, jamais rejoué par OkHttp ni par l'outbox.
- Reconnaître 429 NEWCOMER_SLOW_MODE (en-tête Retry-After puis retryAfter de l'enveloppe, jamais moins d'une seconde) : remonter un refus temporaire au lieu d'un rejeu silencieux.
- DailyGestureLimitLedger borné à 64 entrées par identifiant de mutation : OutboxFlushWorker abandonne sans rejeu et l'écran affiche « Reviens à HH:mm ».

Rendu : Texte court sous le composeur ou toast : « Limite du jour atteinte, retour à HH:mm » ; en mode lent, bouton d'envoi grisé avec compte à rebours en secondes.

Transposition Android : Intercepteur OkHttp lisant Retry-After ; ledger en mémoire borné (LinkedHashMap) injecté dans OutboxFlushWorker.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/DailyGestureLimit.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/NewcomerSlowMode.swift`

</details>

### Publier ou inviter sans adresse e-mail prouvée ouvre la validation, puis l'action repart toute seule

`nss-http-email-verification-gate` · Android : **absente** · P1 · effort M

Cinq routes sont gardées derrière une adresse prouvée (invitations par e-mail, publication de post, post depuis pièce jointe, création de lien, plafond de cinq liens actifs).

Écarts :
- Table des routes gardées (/invitations/email, POST /posts, /posts/from-attachment, /links, /conversations/:id/new-link) → EmailGateReason {publish, invite, link, moreLinks}.
- Intercepteur : sur 403 EMAIL_NOT_VERIFIED, suspendre la requête, présenter la validation (EmailVerificationGating injecté par l'app), rejouer à l'identique si validée (le brouillon n'est jamais perdu), sinon propager le refus.
- L'invitation est retenue (heldBack) tant que l'adresse n'est pas connue non prouvée ; l'ouverture préalable évite un aller-retour inutile.

Rendu : Feuille modale de saisie du code à 6 chiffres avec message contextuel « Pour publier, validez votre adresse » (variantes par raison).

Transposition Android : Registry statique → interface EmailVerificationGating fournie par Hilt.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/EmailVerificationGate.swift`

</details>

### Une version trop ancienne est bloquée par un écran « Mettre à jour » qui ouvre le store

`nss-http-upgrade-gate` · Android : **absente** · P1 · effort M

Tout 426 de la passerelle devient une exigence de mise à jour (version minimale + URL du store, lues à la racine du corps, corps illisible toléré) postée à l'interface, qui affiche une porte bloquante.

Écarts :
- Intercepteur 426 → UpgradeRequirement(minVersion, storeUrl) émis sur un SharedFlow observé par la racine de navigation ; rejeu inclus (réponse rejouée après refresh).
- Bootstrap GET /app/min-version (+ /app/shell-version) comparé à BuildConfig.VERSION_NAME avant le premier écran.
- Écran plein écran non dismissible : titre « Mise à jour requise », version minimale, bouton « Mettre à jour » → market://details?id=me.meeshy.app (repli https du storeUrl serveur) ; hors ligne il ne se lève pas.

Rendu : Écran plein écran centré : logo, titre, sous-titre avec la version minimale, bouton primaire plein en dégradé indigo ; pas de bouton retour.

Transposition Android : NotificationCenter(.meeshyUpgradeRequired) → SharedFlow dans un UpgradeGate singleton.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/AppVersionHeader.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/AppEndpoint.swift`

</details>

### Les aperçus chargent la plus petite image suffisante au lieu de l'original de plusieurs Mo

`nss-media-image-variant-selector` · Android : **absente** · P1 · effort S

Moteur pur qui choisit, parmi les variantes responsives WebP et l'original, la plus petite image dont la largeur en pixels est >= cible, sinon la plus grande.

Écarts :
- Moteur pur bestImageUrl(targetWidthPx, variants, original) : candidats = variantes avec url et width > 0, tri, dédoublonnage, original ajouté seulement s'il est strictement plus large.
- Brancher dans MeeshyAvatar, vignettes de bulle, mosaïques, grilles de feed et stories : cible = largeur du composable en px × densité.

Rendu : Aucun changement visuel ; gain de bande passante.

Transposition Android : Coil/ImageRequest.size → largeur cible ; moteur pur dans :core:model.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/ImageVariantSelector.swift`

</details>

### On voit qui regarde la conversation en ce moment sans rien révéler de plus

`nss-pres-here-in-conversation` · Android : **absente** · P1 · effort M

Quand une conversation s'ouvre, se ferme ou reçoit un geste, l'app émet viewing:start / stop / activity (focus quand l'utilisateur écrit) ; les événements entrants alimentent un registre ConversationViewers (absent, ici, actif, concentré).

Écarts :
- Émettre viewing:start à l'ouverture (onResume du chat), viewing:stop à la fermeture / ON_STOP, viewing:activity {focus} sur geste (focus=true pendant la saisie).
- Registre ConversationViewers (arrived, left, snapshot, active, resting après activityHold = 4 s, sessionStarted vide tout) ; isHere / isHereActive / here(userId, conversationId).
- Brancher AvatarPresenceDot.Here sur l'en-tête du chat et les lignes de liste (visible seulement pour les amis autorisés).

Rendu : Point brandPrimary 30 % de l'avatar avec ondes (voir nss-pres-dot-and-labels) ; libellé « Dans la conversation ».

Transposition Android : Lifecycle du chat (ON_RESUME / ON_PAUSE) → émissions viewing ; Task.sleep → delay.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/PresenceManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+ActivitySignals.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Theme/PresenceStyle.swift`

</details>

### Pendant un appel, on invite, coupe le micro d'un participant, réagit, partage l'écran et note la qualité

`nss-sock-call-participant-controls` · Android : **absente** · P1 · effort M

Contrôles d'appel par socket avec accusé : inviter un participant (call:invite-participant → participant-invited, invite-declined / expired), couper le micro en tant que modérateur, réactions d'appel, partage d'écran (call:toggle-screen) et retour de qualité après appel.

Écarts :
- Émissions avec accusé et refus typés (CallControlRefusal) : inviteCallParticipant, muteCallParticipant, sendCallReaction ; événements call:participant-invited, call:invite-declined, call:invite-expired, call:muted-by-moderator, call:reaction-received.
- call:toggle-screen {callId, enabled} (partage d'écran via MediaProjection + foreground service).
- call:quality-feedback : CallFeedbackIssue (cases à cocher) + note, envoyé à la fin de l'appel.

Rendu : Émojis de réaction qui montent depuis le bas de l'écran d'appel ; feuille de feedback avec cases à cocher et étoiles.

Transposition Android : ReplayKit → MediaProjection ; réactions d'appel = émojis flottants.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+CallControls.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+ScreenShare.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+CallFeedback.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt`

### Une vue unique, un message qui s'autodétruit ou une capture d'écran sont signalés à tous en temps réel

`nss-sock-ephemeral-viewonce-events` · Android : **absente** · P1 · effort M

message:countdown-started lance le compte à rebours d'un message éphémère ; message:consumed dit QUI a ouvert une vue unique ; message:view-once-purged vide le contenu ; l'app émet message:capture-detected avec accusé quand une capture d'écran est détectée.

Écarts :
- Écouter message:countdown-started, message:consumed {messageId, viewOnceCount, userId}, message:view-once-purged ; seul le lecteur concerné passe la bulle en « déjà ouvert », les autres n'incrémentent que le compteur.
- Émettre message:capture-detected avec accusé {success, data:{noticedMessageIds}} ; refus d'ensemble UNAUTHENTICATED / VALIDATION_ERROR / NOT_A_PARTICIPANT / RATE_LIMITED / CONVERSATION_CLOSED / TIMEOUT / NO_SOCKET (un refus ne se réessaie pas par un autre transport).
- Détection de capture : FLAG_SECURE sur l'écran de vue unique + Activity.ScreenCaptureCallback (API 34+) ; repli REST POST /conversations/{id}/messages/capture.

Rendu : Bulle vue unique : cadenas / œil barré une fois ouverte, tombstone « Vu et supprimé » ; compte à rebours en anneau sur la bulle éphémère.

Transposition Android : screenshot detection iOS → ScreenCaptureCallback + FLAG_SECURE ; Combine → SharedFlow.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+ViewOnce.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+ContentCapture.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketEvents+Messages.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`

### Quand l'envoi REST échoue, le message part par la socket avec accusé et le même identifiant client

`nss-sock-message-send-fallback` · Android : **absente** · P1 · effort M

Le chemin REST reste le principal ; en repli, message:send (texte) et message:send-with-attachments émettent avec un clientMessageId stable et attendent l'accusé (10 s) qui rend messageId, clientMessageId et createdAt.

Écarts :
- sendAsync / sendWithAttachmentsAsync avec accusé SendMessageAck(messageId, clientMessageId, createdAt) ; charge : conversationId, content, attachmentIds, replyToId, storyReplyToId, forwardedFromId, originalLanguage, messageType, isBlurred, expiresAt, effectFlags, isViewOnce, maxViewOnceCount, isEncrypted, clientMessageId, location, sticker.
- sendViaSocketFallback : texte sans pièce jointe et chiffré ⇒ nul (jamais en clair) ; sinon with-attachments.
- Brancher en repli dans OutboxFlushWorker (SEND_MESSAGE) quand REST échoue réseau / 5xx ; l'idempotence repose sur clientMessageId.

Rendu : Aucun rendu : la bulle passe de « envoi » à « envoyé » à la réception de l'accusé.

Transposition Android : socket.emit avec ack (Ack) + withTimeout 10 s ; ClientMessageId → OutboxIds.cmid().

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+Send.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Mes favoris et mes messages masqués se synchronisent entre mes appareils

`nss-sock-personal-marks-events` · Android : **absente** · P1 · effort S

message:starred (étoile PERSONNELLE posée ou retirée depuis un autre appareil, émise vers la seule room user:<id>), message:hidden-for-me et message:restored-for-me gardent le même état sur tous les appareils du lecteur.

Écarts :
- Écouter message:starred {messageId, conversationId, starred, starredAt}, message:hidden-for-me, message:restored-for-me (PersonalMessageVisibilityRef) ; Android n'a que des magasins locaux.
- Aligner StarredMessagesStore / LocallyHiddenMessagesStore sur ces événements et sur /me/starred-messages, /messages/{id}/delete-for-me|restore-for-me.

Rendu : Étoile dorée sur la bulle ; message masqué disparaît sans animation parasite.

Transposition Android : Pur Kotlin.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+MessageMarks.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketEvents+Messages.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/StarredMessagesStore.kt`

### Un envoi lancé au premier plan se termine ou se reprend proprement si l'app passe en arrière-plan

`nss-upload-background-lease` · Android : **absente** · P1 · effort M

TusUploadManager s'exécute sous une tâche d'arrière-plan qui se termine toujours exactement une fois (succès, échec, annulation, expiration).

Écarts :
- Exécuter les envois lourds sous WorkManager expedited / foreground service de type dataSync avec notification « Envoi en cours » ; fin unique garantie (lease).
- À l'arrêt par le système (onStopped / timeout dataSync) : annuler le PATCH, laisser le checkpoint, remonter une erreur suspendue ; OutboxFlushWorker rejoue et reprend à l'offset accepté.
- Seam de test : fournisseur injectable qui déclenche l'expiration sans application hôte.

Rendu : Notification persistante discrète « Envoi en cours… » avec progression ; canal de faible importance.

Transposition Android : UIApplication.beginBackgroundTask → WorkManager (setExpedited) + ForegroundInfo (FOREGROUND_SERVICE_DATA_SYNC).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/BackgroundTaskProviding.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`

### Profil vocal, autocollants et packs cosmétiques disposent de leurs routes

`nss-api-voice-stickers-packs` · Android : **absente** · P2 · effort L

Catalogue iOS : /voice (15 routes : profil, consentement, analyse, comparaison, transcription, traduction synchrone / asynchrone), /sticker-packs, /packs/{avatar-ring, banner, banner-frame, glory-frame…} et /pack-assets/{file}. Aucune n'existe côté Android.

Écarts :
- Créer VoiceApi (15 routes dont profile/register, profile/consent, analyze, compare, translate/async, job/{jobId}).
- Créer StickerPackApi (sticker-packs, installed, pending, submissions, {slug}/install, {slug}/review) et PackApi (par type de pack : liste, détail, install, purchase, contract, review, submissions, pending, installed) + /pack-assets/{file}.
- Catalogue des types de packs (avatar-ring, banner, banner-frame, glory-frame…) généré avec le reste.

Transposition Android : Retrofit VoiceApi/StickerPackApi/PackApi.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/VoiceEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/StickerPacksEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/PacksEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/PackAssetsEndpoint.swift`

</details>

### Un appel peut être enregistré avec consentement, habillé d'un cadre en direct et prévisualisé avant de décrocher

`nss-sock-call-recording-frames-preview` · Android : **absente** · P2 · effort M

Enregistrement d'appel (request, consentement, started / stopped, audio / vidéo), cadre en direct (call:frame-select → frame-selected avec textes et réponse) et aperçu avant de rejoindre (call:preview-request, call:preview-signal avec négociation).

Écarts :
- requestCallRecording(kind) → recordingId, answerCallRecording(accepted), stopCallRecording ; événements requested / started / stopped ; CallRecordingRefusal typé ; consentement obligatoire des autres participants.
- selectCallLiveFrame(frameId?, texts?, reply?) avec accusé et événement call:frame-selected (CallLiveFrameTexts, CallLiveFrameReply).
- requestCallPreview(callId) et emitCallPreviewSignal(type, from, to, negotiationId, fields) pour l'aperçu WebRTC avant décrochage.

Rendu : Bandeau rouge « Enregistrement » avec compte du temps ; feuille de consentement modale ; cadre en direct = overlay décoratif autour de la vidéo.

Transposition Android : Enregistrement local → MediaRecorder / MediaMuxer ; aperçu = PeerConnection secondaire.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+CallRecording.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+CallLiveFrame.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+CallPreview.swift`

</details>

### Récompenses, progression de jeu et décor de profil se mettent à jour en direct

`nss-sock-engagement-game-profile-events` · Android : **absente** · P2 · effort M

engagement:post-updated (ce qu'un post a rapporté au lecteur), engagement:conversation-updated, game:updated {gameRevision, reason, game} et profile:decor-updated.

Écarts :
- Écouter engagement:post-updated, engagement:conversation-updated, game:updated (un bloc illisible se lit nul et déclenche la relecture de la progression) et profile:decor-updated.
- Brancher sur les écrans correspondants (feed, flamme / ligues, profil) quand ces fonctionnalités existent côté Android.

Rendu : Aucun rendu propre ; déclenche des animations de gain (flamme, coffre) côté jeu.

Transposition Android : NotificationCenter → SharedFlow dans un EngagementChannel.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+ConversationEngagement.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+GameState.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+ProfileDecor.swift`

</details>

### Une pastille discrète en haut de TOUS les écrans dit hors ligne, reconnexion, envois en cours et qui écrit, et se relance d'un doigt

`nss-conn-sync-pill` · Android : **divergente** · P0 · effort M

ConnectionBanner rassemble tous les états de connexion et de file (hors ligne, « En ligne » transitoire, reconnexion après 3 s de grâce, synchronisation, envois en attente, « @pseudo écrit ») dans une pastille unique qui tourne, mène à la source au toucher et relance un envoi échoué.

Écarts :
- Android montre une bande statique pleine largeur sous la barre de la liste de conversations seulement (Synchronisation… / Reconnexion… / Hors ligne) ; iOS montre une pastille flottante capsule sur TOUS les écrans, collée à la barre du composeur et qui suit le clavier (SyncPillPlacement #10840).
- Fenêtre de grâce de 3 s avant « Reconnexion en cours » (une reconnexion rapide ne montre rien) ; confirmation verte « En ligne » ~4 s seulement si un état dégradé a réellement été vu (downWasSurfaced), jamais au démarrage à froid.
- Entrées par opération en attente de l'outbox : libellé concret (« Envoi d'audio », « Envoi d'image »…), icône par type, tap → navigation vers la source (conversation / post / story), échec définitif (failed / exhausted) en rouge sans points d'activité et RELANÇABLE d'un tap (retryOutboxId).
- Entrées de frappe hors conversation : une par conversation non ouverte (triée par id pour une rotation stable), libellé @pseudo, tap → conversation ; la pastille passe en grande taille ×1,6 pendant une frappe, avec accentuation à l'arrivée d'une entrée neuve.
- Rotation 1 entrée / 2,7 s, pause 5 s après un tap, appui long 0,5 s qui gèle rotation + défilement (WCAG 2.2.2), marquee d'un libellé trop long, effacement après 6 s sans nouvelle entrée sauf état persistant ; cède la place au story viewer, aux réels, aux notifications in-app et aux feuilles modales ; Reduce Motion coupe pulsation et animations.

Rendu : Capsule compacte 22 dp (texte footnote ≈ 11 sp medium, point d'état 6 dp pulsant toutes les 0,5 s, padding xs / smPlus, texte max 160 dp) ; grande taille 35 dp pendant une frappe (texte body, point 10 dp, texte max 220 dp). Fond translucide teinté : brand = dégradé indigo (envoi / sync), warning = ambre (hors ligne / reconnexion), success = vert (« En ligne » 4 s), error = rouge (échec définitif). Trois points « … » animés tant que l'opération est en vol. Apparition ressort (0,3 s, amortissement 0,85). Icônes SF → Material Symbols (wifi_off, wifi, mic, photo, play, attach_file, mood).

Transposition Android : Overlay Compose posé dans le Scaffold racine (au-dessus de la barre de navigation, WindowInsets.ime) ; SyncPillEntry → data class.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConnectionBanner.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConnectionBanner.kt`

### La présence (vert, orange, gris ou rien) est la même partout, se met à jour seule et survit au redémarrage

`nss-pres-live-manager` · Android : **divergente** · P0 · effort M

PresenceManager est la source unique de la présence côté app : il ingère user:status, presence:snapshot, typing:start (preuve d'activité ⇒ en ligne, jamais soi-même) et les événements viewing:*.

Écarts :
- Trois copies divergentes (carte presenceByUserId dans la liste, le chat et PresenceOverlay des contacts) au lieu d'un singleton PresenceManager (@Singleton + StateFlow<Map<userId, UserPresence>>) : un ami peut être vert dans la liste et gris dans le chat.
- Ingestion complète : user:status, presence:snapshot, typing:start (lastActiveAt = maintenant, jamais soi-même — TypingPresenceRelay existe mais n'alimente qu'un écran), viewing:arrived / snapshot / active ; seed depuis les participants des conversations listées ; moi-même ⇒ hors ligne.
- Socket coupée ⇒ tous passent isOnline=false en gardant lastActiveAt (noteSocketDisconnected) ; resetForLogout ; présence absente de la carte ⇒ repli sur la valeur servie, sinon aucun point (jamais de fabrication côté client).
- Recalcul des seuils 60 s / 3 min / 5 min toutes les 15 s, republication débouncée 0,4 s seulement si un état change ; persistance presence_map.json (écriture débouncée 1,5 s, âge max 24 h, l'entrée vive gagne).
- Repaint ciblé (LivePresence) : CompositionLocal du résolveur + signal débouncé, lecture par derivedStateOf(userId) pour que seul l'avatar se recompose, jamais la ligne ni la carte.

Rendu : Couleurs : en ligne #34D399 (pulsant), absent #FBBF24, inactif #9CA3AF, hors ligne = aucun point.

Transposition Android : ObservableObject @Published → StateFlow ; Timer 15 s → coroutine ticker.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/PresenceManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PresenceModels.swift`
- `apps/ios/Meeshy/Features/Main/Components/LivePresence.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/PresenceResolverEnvironment.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Presence.kt`

### Un message reçu pendant que la conversation est fermée met à jour la liste, l'aperçu et le non-lu, même si on rouvre hors ligne

`nss-sync-realtime-cache-relay` · Android : **divergente** · P0 · effort L

Un relais permanent (sans écran) souscrit aux événements socket et écrit dans le cache persistant, dans l'ordre d'arrivée (une file ordonnée par famille d'événements, plus une file à part pour les rattrapages réseau).

Écarts :
- Android réagit à chaque événement par requestRefresh() (GET /conversations conflaté) et seulement tant que l'écran de liste est composé ; iOS APPLIQUE l'événement au cache. Conséquences : trafic inutile, aperçu / non-lu retardés d'un aller-retour, rien hors ligne, et un message reçu conversation fermée n'entre jamais dans Room.
- Relais singleton (armé par RealtimeSessionCoordinator) écrivant dans Room : handleNewMessage (message + LastMessageFacet + non-lu + création de la conversation absente via getById), edited, deleted, expired, citedPostWithdrawn, consumed, viewOncePurged, starred, réactions, readStatus, closed / updated / deleted / restored, userUpdated, traductions, audio.
- File ordonnée par famille (OrderedEventLane : submit / barrier / close) : un message:edited ne doit jamais doubler le message:new dont la persistance est suspendue.
- Mutations sans payload (RealtimeMessageMutation : edited, callNoticeUpdated, deleted, expired, citedPostWithdrawn, reaction±, consumed, viewOnceOpened, starred, senderRepainted) idempotentes : le même broadcast atteint le relais ET la conversation ouverte.
- Aperçu de liste : traductions d'aperçu choisies selon les langues du lecteur (Prisme), recalcul après édition et après suppression ; ponts push : peintLesMessagesPrecharges, ensureMessages(force) (un push est une preuve), fetchOlderMessages, updateConversationAfterSend.

Rendu : Aucun rendu propre ; l'effet visible est une liste immédiatement juste (aperçu, badge, tri) sans spinner.

Transposition Android : Combine + OrderedEventLane → Channel(UNLIMITED) + coroutine unique par famille.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Socket.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Ecritures.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Rehydratation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/OrderedEventLane.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`

### Connexion, inscription, vérifications, double authentification et sessions parlent toutes les routes d'authentification

`nss-api-auth-sessions` · Android : **partielle** · P0 · effort M

Catalogue iOS : /auth/login, login/2fa, logout, refresh, register, magic-link, forgot-password (e-mail et téléphone), reset-password, verify-email / verify-phone, phone-transfer (7 routes), 2fa, sessions, /anonymous/*, /invitations/email, /account/deletion/resolve.

Écarts :
- Routes absentes côté Retrofit : /auth/logout, /auth/2fa/verify, /auth/2fa/cancel, /auth/revoke-all-sessions, /auth/reset-password (+ verify-token), /auth/resend-verification, /auth/send-phone-code, /auth/verification/status.
- Récupération par téléphone : /auth/forgot-password/phone/{lookup, verify-identity, verify-code, resend} ; transfert de numéro : /auth/phone-transfer/* (7 routes).
- /anonymous/refresh, /account/deletion/resolve, /me/delete-account{,/cancel,/confirm,/delete-now}.
- Politique : /auth/login* en credentials (401 = identifiants invalides), /auth/refresh|register|magic-link* sans auth, register / verify-email / reset-password en refus structurés.

Transposition Android : Retrofit AuthApi + repositories d'auth ; écrans dans :feature:auth (autre part).

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/AuthEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/AccountEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/AnonymousEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/InvitationsEndpoint.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/AuthApi.kt`

### Conversations, messages, réactions, pièces jointes et traductions disposent de toutes leurs routes

`nss-api-conversations-messages-attachments` · Android : **partielle** · P0 · effort M

Catalogue iOS : /conversations (participants, droits, mark-read / mark-as-received, reçus, stats, analyse, épinglés, réactions, traductions partagées, fils, vue unique, capture, chiffrement), /messages, /reactions, /attachments (14 routes), /uploads, /static, /translate (+jobs), /translate-blocking, /languages.

Écarts :
- Conversations absentes : /{id}/card, /{id}/engagement, /{id}/invite, /{id}/new-link, /{id}/mark-as-received, /{cid}/messages/{mid}/delivery-receipt, /{id}/receipts, /{id}/read-statuses, /{id}/status, /{id}/clear-history, /{id}/pinned-messages, /{id}/shared-translations, /{id}/threads/{mid}, consume / capture.
- Messages absents : /messages/{id}/delete-for-me, /restore-for-me, /read-status, /status-details, /translations, /messages/bulk/delete-for-me ; /reactions/user/{userId}.
- Pièces jointes : /attachments/{id} (+analysis, metadata, status, status-details, thumbnail, transcribe, translate), /attachments/batch/analysis, /attachments/search, /attachments/file/*, /attachments/signed/{token}/*.
- Traduction : /translate et /translate/jobs/{jobId} (traduction asynchrone), /languages ; seul /translate-blocking est branché.

Transposition Android : Retrofit ConversationApi/MessageApi/AttachmentApi.

<details><summary>Sources iOS (10)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/ConversationsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/ConversationCardEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/MessagesEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/ReactionsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/AttachmentsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/UploadsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/StaticEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/TranslateEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/TranslateBlockingEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/LanguagesEndpoint.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ConversationApi.kt`

### Un seul état de connexion alimente toute l'interface : hors ligne, connexion, reconnexion, synchronisation ou connecté

`nss-conn-status-derivation` · Android : **partielle** · P0 · effort S

ConnectionStatusViewModel agrège réseau, socket et file d'écritures hors ligne en un état unique : offline > connecting (socket jamais connectée) > disconnected (une socket connectée a chuté) > syncing (écritures en attente) > connected.

Écarts :
- Android ne dérive que quatre bannières de l'état de la socket (+ isSyncing du SWR) : DISCONNECTED est affiché « Hors ligne » même quand le réseau est présent.
- Combiner trois sources : isOnline (nss-net-reachability), socket {connected, hasConnectedOnce} (scan : première connexion ≠ chute) et nombre d'écritures en attente de l'outbox (pendingCount) ; fonction pure derive(online, connected, pending, hasConnectedOnce).
- Exposer l'état dans un ViewModel d'application (réutilisé par la pastille, la liste et le chat) plutôt que dans ConversationListViewModel seul.

Rendu : Aucun rendu propre ; libellés FR : « Hors ligne », « Connexion en cours », « Reconnexion en cours », « Synchronisation », « En ligne ».

Transposition Android : Combine CombineLatest3 + scan → combine() de trois StateFlow + scan.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConnectionStatusViewModel.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConnectionBanner.kt`

### Chaque appel réseau se réessaie, s'authentifie et échoue de façon lisible sans que l'utilisateur ait à comprendre

`nss-http-request-pipeline` · Android : **partielle** · P0 · effort M

Le client REST unique (APIClient) applique à toute requête une politique par route (auth bearer / aucune / identifiants, réessai standard / jamais, refus typés), réessaie les 429/503 avec Retry-After, refuse les URL invalides.

Écarts :
- Réessai automatique des 429/503 : 3 tentatives max, délai = en-tête Retry-After plafonné à 30 s sinon 2^tentative s ; jamais rejoué pour une limite quotidienne (DAILY_*_LIMIT), un mode lent ni pour /signal/* (aucun intercepteur de réessai côté OkHttp).
- Table de politique par route (MeeshyEndpointPolicy) : authKind bearer / none (/auth/refresh, /auth/register*, /auth/magic-link*) / credentials (/auth/login*, /auth/verification/status), retryPolicy standard / never, rejectionPolicy opaque / structured.
- Taxonomie MeeshyError (network{noConnection, timeout, serverUnreachable}, auth, message, media, forbidden(reason, body), rejected, server(statusCode, message)) avec libellé FR et icône ; Android ne rend qu'ApiError(message, code NETWORK/PARSE/HTTP_n). Mapper SocketTimeoutException→timeout, UnknownHost/ConnectException→serverUnreachable.
- Garde d'URL : refuser avant envoi tout chemin à segment vide, double slash ou slash final (« URL invalide »).
- Décodage JSON hors thread principal + journal « Slow request » (> 1 s, ventilé réseau / décodage) + erreur de décodage détaillée avec le chemin du champ (EventListener OkHttp + Timber).

Rendu : Pas de rendu direct : les erreurs alimentent les états d'erreur des écrans. Icônes iOS par catégorie : réseau wifi.slash, auth lock.fill, serveur server.rack, interdit lock.slash.fill (équivalents Material Symbols wifi_off, lock, dns).

Transposition Android : URLSession → OkHttp ; APIClient singleton → MeeshyApi + intercepteurs OkHttp (RetryInterceptor, EndpointPolicyInterceptor)

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient+Perform.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIRequestPipeline.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClientProviding.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/MeeshyEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/MeeshyEndpointPolicy.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Core/MeeshyError.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/ApiCall.kt`

### Les réponses paginées et les suppressions portent tout ce que le serveur dit, y compris ce qui a disparu

`nss-http-response-envelope` · Android : **partielle** · P0 · effort S

L'enveloppe iOS décode success/data/error, la pagination par curseur ET par offset (avec l'ancre du curseur de la suite) et un bloc meta hors-page portant les tombstones du delta-sync.

Écarts :
- Champ meta absent de ApiResponse : deletedStoryIds(+Truncated), deletedConversationIds(+Truncated), feedRequestId, searchId — seul canal par lequel un client ayant manqué un événement socket apprend qu'une conversation / story a disparu.
- Pagination par curseur (nextCursor, hasMore) et par offset typées séparément ; la page 1 servie au rang porte l'ancre du curseur de la suite (#4175/#4901).
- DELETE tolérant (DeletionAcknowledgement) : un 2xx EST la confirmation, charges {message}, {messageId, deleted, meta}, {deleted:true} ou vide ; Android apiCallUnit suppose data == null.
- DELETE avec motif de retrait par la modération : corps {reason} seulement si un motif est fourni, requête identique à l'octet près sinon (rétrocompatibilité).

Transposition Android : Codable → kotlinx.serialization ; PaginatedAPIResponse → ApiResponse<T> + Pagination.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIResponseTypes.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIResponseMeta.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIError.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/DeletionAcknowledgement.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClientProviding+ContentRemoval.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ApiResponse.kt`

### Une session expirée se renouvelle en silence, la requête repart, et un mauvais mot de passe ne déconnecte personne

`nss-http-session-refresh-replay` · Android : **partielle** · P0 · effort M

Avant d'envoyer une requête bearer dont le JWT est échu, le client rafraîchit la session en un seul vol (single-flight) ; sur 401 il rafraîchit puis rejoue UNE fois, sans jamais agir au nom d'un autre compte.

Écarts :
- Rafraîchissement PROACTIF avant envoi quand le JWT est échu (marge) et la route est bearer ; Android n'agit qu'après le 401.
- Single-flight : RefreshAuthenticator appelle runBlocking { api.auth.refresh } sans verrou, donc N 401 simultanés lancent N refresh ; ajouter un Mutex et une génération de jeton (ne jamais rafraîchir ni rejouer pour un compte devenu actif entre-temps).
- Trois issues du 401 (UnauthorizedStep) : sessionExpired (aucun bearer), expireSession (bearer sur route non bearer), refreshAndReplay ; un 401 de /auth/login ou /auth/login/2fa rend « Identifiants invalides » sans teardown ni refresh.
- Credential abstrait (en-tête + valeur) : Authorization Bearer ou X-Session-Token (invité de lien) ; requestPinned = requête signée par un jeton figé (déconnexion par jeton) et freshAuthToken() exposé à TUS, /sync et au handshake socket.

Rendu : Aucun rendu propre ; l'échec définitif ouvre l'écran « session fermée » (SessionClosedNoticeView côté iOS).

Transposition Android : AuthManager.refreshSession → AuthRepository.refreshSession (Mutex)

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient+Perform.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient+UnauthorizedMapping.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/MeeshyRequestCredential.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/RefreshAuthenticator.kt`

### L'app sait en temps réel si le réseau est là, sans clignoter

`nss-net-reachability` · Android : **partielle** · P0 · effort M

Une source unique du chemin réseau alimente deux lectures : binaire en ligne / hors ligne (débouncée 500 ms, pour pastille, socket et outbox) et qualitative (hors ligne, mauvais cellulaire, bon cellulaire, wifi) qui pilote l'auto-téléchargement des médias (moteur et préférences déjà complets côté Android : MediaDownload.kt, MediaDownloadPreferencesStore).

Écarts :
- Lecture binaire isOffline / isOnline (StateFlow<Boolean>) avec debounce 500 ms et distinctUntilChanged, consommée par la pastille, la reprise socket et le gate réseau de l'outbox.
- Source unique : dériver les deux lectures d'un même ConnectivityManager.NetworkCallback (aujourd'hui le banner de liste lit l'état de la socket et non le réseau).
- Amorçage depuis la photo courante (activeNetwork) — jamais OFFLINE fabriqué avant le premier callback, sinon le gate de l'outbox rejette les mutations enfilées pendant la fenêtre.
- ConnectionType (wifi / cellular / wired / unknown) et seam de test simulateOffline / simulateOnline.

Transposition Android : NWPathMonitor → ConnectivityManager.registerDefaultNetworkCallback (NET_CAPABILITY_VALIDATED, NOT_METERED, TRANSPORT_*).

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkMonitor.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkPathSource.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkConditionMonitor.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPolicyEngine.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPreferences.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/NetworkConditionMonitor.kt`

### À l'ouverture de session, tous les relais temps réel s'arment d'un seul point

`nss-realtime-session-arming` · Android : **partielle** · P0 · effort S

RealtimeRelays.arm() branche, au démarrage d'une session authentifiée : le gestionnaire du fil social, le relais de socket du moteur de synchro (cache), l'enregistrement automatique des médias reçus et la reprise d'un appel lancé depuis une notification.

Écarts :
- RealtimeSessionCoordinator.attachAll() attache les gestionnaires mais aucun relais cache n'est armé : ajouter l'armement du relais de synchro (nss-sync-realtime-cache-relay), du relais social et le désarmement au logout / changement de compte.
- ReceivedMediaAutoSaver : enregistrement automatique des médias reçus (selon préférences) via MediaStore ; CallLaunchResume : reprise d'un appel lancé depuis une notification / un raccourci.
- Ordre garanti : relais armés avant le premier événement ; idempotence (ré-armer vide les abonnements précédents).

Transposition Android : DependencyContainer → Hilt ; MainActor → Dispatchers.Main.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/RealtimeRelays.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/RealtimeSessionCoordinator.kt`

### Les émissions qui exigent une réponse attendent l'accusé du serveur et savent lire un refus

`nss-sock-ack-protocol` · Android : **partielle** · P0 · effort S

emitWithAck rend un SocketAck typé : accepté (charge à la racine, sous data ou absente), refusé (code, message, retryAfter, resetAt, limit) ou échéance (Socket.IO rend « NO ACK »).

Écarts :
- SocketManager.emit(event, data, ack) n'a ni délai ni typage : introduire suspend emitWithAck<P>(event, payload, timeoutMs, payloadAt) → SocketAck<P> {Accepted, Refused, Timeout}.
- Sources de la charge d'accusé : data / root / none ; lecture de error en objet ou en chaîne ; refus d'ensemble UNAUTHENTICATED, VALIDATION_ERROR, NOT_A_PARTICIPANT, RATE_LIMITED, CONVERSATION_CLOSED, TIMEOUT, NO_SOCKET.
- Reconnaître DAILY_REACTION_LIMIT / NEWCOMER_SLOW_MODE dans l'accusé ; CallSignalManager a déjà ses parseurs d'accusé d'appel : les rebaser sur le type commun.

Transposition Android : emitWithAck (SocketIO Swift) → Socket.emit(event, args, Ack) + withTimeoutOrNull + suspendCancellableCoroutine.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketAck.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketAckEmitting.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocketManager.kt`

### La liste de conversations se met à jour en direct : nouvelle conversation, participants, rôles, titre, catégories et profils des pairs

`nss-sock-conversation-events` · Android : **partielle** · P0 · effort M

Événements de conversation : conversation:new / updated / deleted / restored / closed / stats, participants (joined / left / banned / unbanned / role-updated / rights-updated), préférences, catégories, user:updated et annulation / refus de demande d'ami.

Écarts :
- Absents : conversation:new (la conversation apparaît en direct), conversation:participant-joined / -unbanned, participant:rights-updated, conversation:stats, user:updated, user:preferences-reordered, friend-request:cancelled / rejected (retour arrière du cache d'amitié).
- ConversationUpdatedEvent : LastMessagePreviewTranslations / LastMessageIdentity / LastMessageSenderName à trois états (absent = garder, nul = effacer, valeur = remplacer).
- user:updated doit repeindre la liste (nom, avatar, bannière) et l'expéditeur dénormalisé de TOUS les messages du pair, toutes conversations confondues.
- ParticipantRoleUpdatedEvent (infos du participant), SocketEventUser, closed avec raison, ConversationJoinErrorEvent.

Rendu : Apparition animée d'une nouvelle conversation en tête de liste ; badge de rôle mis à jour sans clignotement.

Transposition Android : Combine → SharedFlow ; champs tri-état → sealed interface Field<T> {Absent, Cleared, Value}.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketEvents+Conversations.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/ConversationUpdatedEvent.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/UserPreferencesConversationUpdatedSocketEvent.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`

### Chaque événement entrant est décodé hors du fil principal et livré dans l'ordre d'arrivée

`nss-sock-event-catalog-routing` · Android : **partielle** · P0 · effort M

Le contrat entrant d'une socket est une table déclarative de routes (événement `entité:action-mot` → type décodé → sujet), décodée sur une file série puis livrée au fil principal dans l'ordre d'arrivée.

Écarts :
- Catalogue central des noms d'événements (object SocketEvents aligné sur packages/shared/types/socketio-events.ts, hyphens) — les chaînes littérales sont dispersées dans MessageSocketManager, SocialSocketManager et CallSignalManager.
- Table de routes déclarative (événement, type, sujet, observateur) : installable et testable sans socket ; un décodage raté est journalisé sans casser les autres routes.
- Ordre de livraison : un SharedFlow par événement n'ordonne pas entre événements ; décoder sur un Channel série (UNLIMITED, un seul consommateur) puis publier dans l'ordre d'arrivée.
- buf() = extraBufferCapacity 64 : tryEmit peut perdre silencieusement sous rafale ; choisir un canal illimité pour les événements qui mutent l'état. Événements notification:* avec _seq : déjà complets côté Android (NotificationSyncEvents).

Transposition Android : Combine PassthroughSubject → SharedFlow ; DispatchQueue série → Channel + coroutine Dispatchers.Default.

<details><summary>Sources iOS (12)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketEvent.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketInboundRoute.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketPayloadDecoder.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MainActorDeliveryLane.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketRoutes.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketRoutes+Messages.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketRoutes+Conversations.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketRoutes+Media.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketRoutes+Calls.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketRoutes+Notifications.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketRoutes.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketNotificationEvent.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`

### Les messages reçus, modifiés, supprimés, épinglés ou expirés se reflètent aussitôt, conversation ouverte ou non

`nss-sock-message-lifecycle-events` · Android : **partielle** · P0 · effort M

Événements du cycle de vie d'un message : message:new / edited / deleted / expired / pinned / unpinned, retrait de la story citée (« Story indisponible »), file hors ligne rejouée (message:pending-delivered), statuts de lecture.

Écarts :
- Événements absents : message:cited-post-withdrawn {postId, conversationId, deletedAt} (chaque citation devient « Story indisponible »), message:pending-delivered {count, conversationIds} (resynchroniser les fils touchés), mention:created, attachment-status:updated.
- Fusion des drapeaux : un message:edited porteur d'un résumé d'appel ne pose jamais « modifié » (callNoticeUpdated) ; marksEdited=false pour un avis complété côté serveur.
- Appliquer ces événements à Room même conversation fermée (voir nss-sync-realtime-cache-relay) : Android ne les traite que dans ChatViewModel.
- ReadStatusSummary par message pour les coches de la bulle ; conversation:unread-updated porte un champ bridge à trois états (absent = non calculé, null = effacer, objet = remplacer) absent du modèle Android.

Rendu : Bulle supprimée = tombstone « Message supprimé » ; épinglé = bandeau épinglé ; story citée retirée = carte « Story indisponible ».

Transposition Android : Combine → SharedFlow ; sealed class RealtimeMessageMutation pour les mutations sans payload.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketEvents+Messages.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+MessageMarks.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+CitedPost.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/ReadStatusEvents.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`

### On voit en direct qui est en ligne, qui écrit et qui regarde la conversation

`nss-sock-presence-typing-viewing` · Android : **partielle** · P0 · effort M

user:status et presence:snapshot (résolus par destinataire côté serveur : amis acceptés, soi, ADMIN seulement), typing:start / stop, presence:app-state et la famille viewing:* (start, stop, activity avec focus, snapshot).

Écarts :
- Famille viewing:* absente : émettre viewing:start / stop / activity {conversationId, focus} et écouter les mêmes + viewing:snapshot (ConversationViewingEvent arrived / left / snapshot / active / sessionStarted).
- Émissions gardées par l'état connecté (safeEmit) : typing:start / stop ne partent pas si la socket n'est pas connectée ; Android appelle emit sans garde.
- À la connexion socket : sessionStarted vide les viewers, presence:app-state et call:check-active sont ré-émis (déjà fait pour les deux derniers).
- Helper partagé du nom affiché (displayName sinon username) pour l'indicateur de frappe en conversation, et @username pour la pastille hors conversation.

Rendu : Indicateur de frappe : trois points animés dans la bulle fantôme ; pastille « @pseudo » dans la pill de synchro.

Transposition Android : Pur Kotlin ; ProcessLifecycleOwner pour presence:app-state (déjà en place).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+ActivitySignals.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketEvents+Messages.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketEvents+Conversations.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`

### Une coupure se rattrape vite et sans tempête, et la latence est mesurée

`nss-sock-reconnect-heartbeat` · Android : **partielle** · P0 · effort M

Le client pilote lui-même ses reconnexions : backoff exponentiel 1 s → 60 s avec jitter 0,8–1,2 (remis à zéro à la connexion et au retour du réseau), heartbeat 30 s avec RTT, retraite propre de l'ancien transport.

Écarts :
- Backoff piloté par l'app (plancher 1 s, plafond 60 s, ×2, jitter 0,8–1,2) — Android s'en remet au backoff interne de socket.io (reconnectionDelayMax 30 s, aucun reset au retour réseau).
- Heartbeat 30 s : émettre heartbeat {clientTime} et lire heartbeat:ack (RTT = latencyHintMs × 2, sinon |maintenant − serverTime|) publié en connectionRTT ; aucun heartbeat côté Android.
- SocketDisconnectPolicy : ne réarmer que sur « Got Disconnect » / « Reconnect Failed » ; fermeture volontaire ou refus d'auth ⇒ pas de boucle.
- Retraite du transport : reconnects=false sur l'ancien socket puis fermeture après 12 s ; état ConnectionState {disconnected, connecting, connected, reconnecting(attempt)} + hadPreviousConnection (première connexion ≠ reconnexion).

Rendu : Aucun rendu direct ; libellés « Connexion en cours » / « Reconnexion en cours » dans la pastille.

Transposition Android : Task.sleep annulable → delay ; Timer → coroutine tickant sur Dispatchers.Default.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketReconnectBackoff.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketHeartbeat.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketHeartbeatAck.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketDisconnectPolicy.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketTransportRetirement.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocketManager.kt`

### Les traductions, transcriptions et pistes audio traduites arrivent en direct, avec leurs échecs

`nss-sock-translation-events` · Android : **partielle** · P0 · effort M

message:translation, translation:failed, audio:transcription-ready / failed, audio:translation-ready / progressive / completed / failed, message:translation-shared alimentent le Prisme Linguistique ; translation:request est tamponnée et rejouée à la reconnexion.

Écarts :
- Événements d'échec absents : translation:failed (TranslationFailedEvent), audio:translation-failed, audio:transcription-failed → état « traduction impossible » + relance sur la bulle.
- audio:translations-progressive et audio:translations-completed (pistes audio traduites au fil de l'eau) ; Android ne lit que audio:translation-ready.
- translation:request émise par socket avec TranslationRequestBuffer (max 50, TTL 60 s, dédoublonnage par message + langue, vidage à la connexion) ; Android passe par REST /translate-blocking.
- message:translation-shared : traduction partagée par un membre (SharedTranslation), ouverture de l'enveloppe côté app.

Rendu : Indicateur de traduction discret (icône translate / pastille de langue) ; état d'échec = icône d'alerte avec relance au toucher.

Transposition Android : Pur Kotlin ; tampon = ArrayDeque borné.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketEvents+Media.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+Translations.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/TranslationRequestBuffer.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`

### La connexion temps réel s'ouvre dès que le compte est connecté, avec les bonnes identités, et refuse de partir avec un jeton périmé

`nss-sock-transport-connect` · Android : **partielle** · P0 · effort M

MessageSocketManager ouvre l'unique socket Socket.IO du compte (jamais deux transports armés), vérifie l'expiration du JWT avant de partir, envoie l'identité du client et gère la connexion d'un invité.

Écarts :
- Vérifier l'expiration du JWT (exp − 30 s) AVANT de connecter : si périmé, déclencher refresh / handleUnauthorized plutôt que d'ouvrir un socket voué au refus (SocketConnectOutcome armed / notArmed).
- Charge d'auth socket client:{appVersion, appBuild, platform, deviceModel, osVersion, timezone, deviceLocale, deviceName} en plus de token / sessionToken (Android n'envoie que les jetons).
- Idempotence : ne pas recréer un socket déjà connected / connecting (SocketManager.connect() crée un nouveau socket à chaque appel sans fermer l'ancien : deux sockets vivants, événements en double).
- Connexion invité dédiée (connectAnonymous(sessionToken) : X-Session-Token seul) et mémorisation du jeton présenté pour que auth:token-expired rafraîchisse au nom de CE jeton, jamais du compte actif.
- Écouter auth:token-expired et auth:session-revoked ; événement socket error journalisé, jamais de déconnexion sur une erreur transitoire.

Transposition Android : socket.io-client-swift → io.socket:socket.io-client (Java) via OkHttp.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketProviding.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocketEventRegistering.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+EventHandlers.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/SocketConfig.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocketManager.kt`

### Au premier lancement ou après une longue absence, la liste de conversations se charge page après page sans jamais bloquer l'écran

`nss-sync-cold-start-full-sync` · Android : **partielle** · P0 · effort M

fullSync charge la liste par pages de 100 (suivantes jusqu'à 4 en parallèle, réessai par page, queue bornée à 50 itérations), ou par la route /sync (pages d'ancre, ETag, repli sur le chemin historique).

Écarts :
- Chargement des pages restantes en parallèle (4 max) avec réessai par page (fetchPageWithRetry), récupération des pages perdues et queue bornée ; Android balaie séquentiellement jusqu'à MAX_PAGES = 100.
- Route GET /sync (collections=conversations, since, scope, seq, fields, validateur, cursor) via SyncDeltaClient : pages d'ancre, truncated / hasMore honorés, 304 sur validateur, repli « indisponible » vers GET /conversations.
- Fusion par champs servis (ConversationDeltaRules.fusionneLigneDeSync) : ce que /sync sert avance, ce qu'il ne sert pas (aperçu, traductions, non-lus, participants, préférences, rôle courant) reste au cache.
- Propriété de synchro par compte (SyncOwnership + ownsSession) : au changement de compte la synchro du compte quitté n'écrit plus, et chaque compte garde son point de reprise (SyncCheckpoint : lastSync, lastCleanup, lastFullReconcile).

Rendu : Jamais de spinner sur cache non vide : squelette de 8 lignes (avatar rond, deux lignes de texte) seulement à froid ; pull-to-refresh seul montre un indicateur.

Transposition Android : TaskGroup → coroutineScope + async + Semaphore(4)

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Chargement.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/SyncDeltaClient.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/SyncEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/SyncEngineState.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/SyncCheckpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationCacheSource.kt`

### Au retour au premier plan, seul ce qui a changé est rechargé, et la liste se réconcilie une fois par jour

`nss-sync-delta-catchup` · Android : **partielle** · P0 · effort M

syncSinceLastCheckpoint demande les conversations modifiées depuis le dernier point de reprise (updatedSince), applique les lignes actives, retire les inactives et les tombstones, et n'avance le curseur que si la page prouve sa complétude.

Écarts :
- Tombstones : appliquer meta.deletedConversationIds(+Truncated) APRÈS les upserts ; Android ne retire JAMAIS sur un delta, donc une conversation fermée / quittée / bannie / supprimée-pour-moi depuis un autre appareil reste affichée jusqu'au balayage complet.
- Lignes isActive=false d'un delta : retrait + invalidation du cache de messages de la conversation retirée.
- Anti-rafale de 3 s (deltaSyncCooldown) et rattrapage de reconnexion en attente (reconnectCatchUpPending) qui ne s'absorbe ni dans l'anti-rafale ni dans une synchro en vol.
- Réconciliation complète toutes les 24 h pour purger les fantômes hard-supprimés : Android bascule en balayage complet quand le watermark dépasse keepForMillis (équivalent) ; conserver le garde-fou « curseur avancé seulement si balayage complet ».

Rendu : Aucun rendu propre ; la pastille « Synchronisation » apparaît seulement si la synchro dépasse le délai de grâce.

Transposition Android : Foreground → ProcessLifecycleOwner ON_START ; WorkManager périodique optionnel.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Chargement.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationDeltaRules.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/SyncCheckpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/SyncEngineState.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationCacheSource.kt`

### Le badge de non-lus ne ment jamais : la conversation ouverte compte zéro, les autres se somment

`nss-sync-unread-open-ledger` · Android : **partielle** · P0 · effort M

Un registre synchrone des conversations affichées (compte d'ouvertures par conversation, ordre d'ouverture) force à 0 le non-lu de la conversation que l'on lit, l'exclut du total et coalesce les accusés de réception.

Écarts :
- Registre openConversation / closeConversation avec comptage (la même conversation dans deux fenêtres tablette / pliable : seule la DERNIÈRE fermeture la rend au décompte) ; currentlyOpenConversationId + openConversationIds.
- Forcer à 0 l'unreadCount de la conversation ouverte sur chaque conversation:unread-updated (un snapshot gonflé, ex. 75, est un mensonge visuel) et dès l'entrée ; noteUnreadRemaining restitue le reste réel après une lecture partielle (#7350).
- totalConversationsUnread = somme des non-lus des AUTRES conversations (clamp ≥ 0) pour le badge de retour et les menus ; Android somme Room sans exclure l'ouverte.
- Accusés de RÉCEPTION : POST /conversations/{id}/mark-as-received coalescé (une requête par conversation et par fenêtre ; quota partagé 30 req/min avec mark-read) ; aucun accusé de réception n'est envoyé par Android.

Rendu : Badge numérique sur la ligne et sur le bouton retour (pastille) ; disparaît immédiatement à l'ouverture.

Transposition Android : Locked<OpenConversationLedger> → StateFlow<LedgerState> protégé par Mutex.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngineOpenLedger.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Ecritures.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Socket.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`

### Un gros média monte en reprenant où il s'est arrêté, même après une coupure ou un passage en arrière-plan

`nss-upload-tus-resumable` · Android : **partielle** · P0 · effort M

TusUploadManager envoie les fichiers par tronçons PATCH depuis le disque (jamais en mémoire entière), avec un point de reprise persistant par empreinte SHA-256 du contenu, des baux anti-doublon et la récupération d'une session TUS purgée.

Écarts :
- Source FICHIER lue par tronçons de 10 Mo : Android garde tout en ByteArray (MediaUploadItem.bytes) — une vidéo de 200 Mo explose la mémoire et ne survit pas à la mort du process.
- Clé de checkpoint = empreinte SHA-256 du fichier (+ contexte d'upload + thumbhash) via une mémoire bornée de condensats (chemin + taille + mtime) ; Android clé sur (contexte, nom, mime, taille).
- Baux (TusUploadLeases) : deux envois des mêmes octets ne croisent pas leurs PATCH ; 404 / 410 sur PATCH ⇒ session purgée, checkpoint supprimé, erreur retriable.
- Métadonnées Upload-Metadata : filename, filetype, uploadcontext, thumbhash, capturedinapp, transcription (JSON base64 plafonné ~4 Kio : les segments cèdent d'abord) et nom d'origine (#11531) ; progression par fichier et par file ; ensemencement du cache local après envoi.
- Lot de pièces jointes : pool parallèle borné (Semaphore 3-4) avec résultats rendus dans l'ordre des ENTRÉES (rang de pièce = attachmentIds), première erreur ⇒ annulation des frères ; TusUploadRepository.uploadAll est séquentiel.

Rendu : Barre de progression par pièce dans le composeur et la bulle en cours d'envoi (pourcentage, annuler), états : en file, envoi, reprise, échec avec relance.

Transposition Android : Room TusUploadCheckpointEntity (existe) ; MessageDigest SHA-256 sur InputStream.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/TusUploadCheckpointStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/FileDigestMemo.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/OrderedParallelUpload.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/TusUploadRepository.kt`

### Communautés, liens de partage, liens suivis et parrainage disposent de toutes leurs routes

`nss-api-communities-links-affiliate` · Android : **partielle** · P1 · effort M

Catalogue iOS : /communities (liste, mine, search, membres, rôles, join / leave), /links (carte, messages, membres, arrivées, stats, extend, toggle), /tracking-links (14 routes), /l/{token} et /affiliate/* (8 routes).

Écarts :
- Absentes : /communities/mine, /communities/{id}/members/{memberId} (retrait) ; /links/{identifier}/card, /links/{identifier}/messages, /links/{key}/members, /links/{linkId}/arrivals, /links/{linkId}/stats.
- /tracking-links/* (création, resolve, click, clicks, redirect-status, stats, deactivate, conversation/{id}, user/me, check-token, admin) et /l/{token} (redirection courte).
- /affiliate/{register, tokens(+id), stats, click, track-visit, validate, og}.

Transposition Android : Retrofit CommunityApi/LinkApi/TrackingLinkApi.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/CommunitiesEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/LinksEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/TrackingLinksEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/LEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/AffiliateEndpoint.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/CommunityApi.kt`

### Le profil de l'utilisateur, ses préférences, son consentement et sa progression de jeu se lisent et s'écrivent sur toutes les routes /me

`nss-api-me-preferences-game` · Android : **partielle** · P1 · effort M

Catalogue iOS : /me (birth-date, onboarding, permissions, consents, terms, engagement, export, security-events, profile-decor, stickers, starred-messages, categories), preferences par catégorie, ~24 routes /me/game/* et /user-preferences/*.

Écarts :
- Préférences par catégorie absentes : /me/preferences/{application, audio, message, video, document, encryption} (Android ne couvre que notification, privacy et categories).
- Absentes : /me/onboarding, /me/permissions, /me/consents(+purpose), /me/terms, /me/birth-date, /me/engagement, /me/security-events, /me/profile-decor, /me/stickers, /me/starred-messages(+id), /me/meesh/mint.
- /me/game/* (chest, duo, flame, frames, guide, league, missions, photo-moments, prestige, privacy, season, seasons, showcase, visibility) et /users/{id}/game(+showcase) : aucune présence, refus structurés requis.
- /user-preferences/conversations (liste) + reorder, /user-preferences/communities(+id, +reorder), /user/deleted-conversations (tombstones lus au retour d'un autre appareil).

Transposition Android : Retrofit PreferencesApi/MeApi + stores DataStore.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/MeEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/UserPreferencesEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/UserEndpoint.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PreferencesApi.kt`

### Notifications, historique d'appels et clés de chiffrement disposent de toutes leurs routes

`nss-api-notifications-calls-e2ee` · Android : **partielle** · P1 · effort M

Catalogue iOS : /notifications (liste, counts, read, read-all, read-by-types, par conversation, par post), /calls (création, participants, enregistrements, transcription, historique) et /signal (clés publiques, établissement de session ; jamais réessayées).

Écarts :
- Notifications : /notifications/counts, /read, /read-by-types, /conversation/{id}/read, /post/{id}/read ; Android couvre liste, read-all, unread-count, {id}, {id}/read, device-token.
- Appels : POST /calls, /calls/{id}, /calls/{id}/participants(+participantId), /calls/{id}/recordings/{rid}/attachment, /calls/{id}/transcript, /calls/history/{callId}.
- E2EE Signal : /signal/keys, /signal/keys/{userId}, /signal/session/establish avec retryPolicy never (le chiffrement de bout en bout est optionnel par conversation).

Transposition Android : Retrofit NotificationApi/CallApi/SignalApi.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/NotificationsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/CallsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/SignalEndpoint.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/NotificationApi.kt`

### Fil, stories, statuts, commentaires, sons et hashtags disposent de toutes leurs routes

`nss-api-social-feed-stories` · Android : **partielle** · P1 · effort M

Catalogue iOS : /posts (feed, reels, statuts, stories, nearby, hashtag, impressions en lot, republish, from-attachment, export de média, traductions), /stories/audio, /social/*, /hashtags/trending, /sounds, /status-metrics, /world.

Écarts :
- Absentes de PostApi : /posts/from-attachment, /nearby(+density), /hashtag/{tag}, /engagement/batch, /media/{id}(+caption/translate), /{id}/anonymous-view, /{id}/downloads, /{id}/impression, /{id}/media/{mediaId}/export, /{id}/republish.
- /stories/audio, /sounds/{id}(+posts, +mine), /hashtags/trending, /world(+participants), /status-metrics(+reset), /social/events.

Transposition Android : Retrofit PostApi/StoryApi/SoundApi.

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/PostsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/StoriesEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/SocialEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/HashtagsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/SoundsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/StatusMetricsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/WorldEndpoint.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`

### Recherche de personnes, demandes d'ami, contacts, annuaire et mentions s'appuient sur toutes les routes sociales

`nss-api-users-contacts-directory` · Android : **partielle** · P1 · effort M

Catalogue iOS : /users (profil, recherche, présence, appareils, contacts sync / match, changements de contact, stats, parrainage), /friend-requests, /contacts/resolve, /directory/*, /mentions/* et /u/{username}.

Écarts :
- Absentes : /users/presence, /users/me/contacts (+sync, +match), /users/me/devices(+id), /users/register-device-token, /users/me/username, /users/me/referral-code, /users/{id}/affiliate-token, /users/me/dashboard-stats.
- Annuaire : /directory/availability, /directory/blocks(+userId), /directory/contacts, /directory/people (liste), /directory/presence ; /contacts/resolve (carnet d'adresses : le serveur ne garde que les inscrits).
- /mentions/me, /mentions/messages/{messageId} ; /u/{username} (profil public par pseudo).

Transposition Android : Retrofit UserApi/FriendApi/DirectoryApi.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/UsersEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/FriendRequestsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/ContactsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/DirectoryEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/MentionsEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/UEndpoint.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/UserApi.kt`

### Un seul bouton Ajouter / En attente / Accepter-Refuser / Contact / Bloqué sur tout profil, avec retour immédiat

`nss-conn-action-chip` · Android : **partielle** · P1 · effort M

ConnectionActionView rend, selon la relation résolue (soi, bloqué, contact, demande reçue, demande envoyée, aucune), soit rien, soit un badge, soit des boutons ; les gestes sont optimistes avec retour arrière.

Écarts :
- Composable partagé ConnectionActionChip(userId, userName, accent, onError, onSuccess) : aujourd'hui la logique d'état existe (UserRelationshipRules) mais chaque écran (Discover, Contacts, profil) rend ses propres boutons.
- Six rendus : soi ⇒ vide ; bloqué ⇒ badge rouge « Bloqué » ; contact ⇒ badge vert « Contact » ✓ ; demande reçue ⇒ deux boutons ronds (✕ rouge sur fond teinté, ✓ blanc sur vert) ; demande envoyée ⇒ capsule ambre « En attente » ⏱ (tap = annuler) ; aucune ⇒ capsule accent « Ajouter ».
- Optimiste : applique localement (FriendshipCache) → haptique success / medium → file outbox SEND_FRIEND_REQUEST → rollback + haptique error si la file épuise (outcomeStream(cmid)) ; toasts FR « Demande envoyée / Connexion acceptée / Demande refusée / Demande annulée / Impossible d'… ».

Rendu : Capsules : Ajouter = fond accent, texte blanc, padding md / xs ; En attente = fond ambre 12 %, contour ambre, icône horloge ; Contact = fond vert 12 %, coche ; boutons ronds ≈ 28 dp ; ressort 0,35 s / 0,85 entre états.

Transposition Android : HapticFeedback → HapticFeedbackType.* ; Capsule → Surface(shape = CircleShape)

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Profile/ConnectionActionView.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/UserRelationship.kt`

### Le serveur sait quelle version, quel appareil et quelles capacités lui parlent

`nss-http-client-identity-headers` · Android : **partielle** · P1 · effort S

Chaque requête (et le handshake socket) annonce la version et le build de l'app, la plateforme, le modèle d'appareil lisible, l'OS, le fuseau, la locale / région et le nom de l'appareil.

Écarts :
- En-têtes X-Meeshy-Version, X-Meeshy-Build, X-Meeshy-Platform=android, X-Meeshy-Device (modèle lisible, table identifiant → nom), X-Meeshy-OS, X-Meeshy-Timezone, X-Meeshy-Locale, X-Meeshy-Country ; Android n'envoie que X-Device-Locale et X-Canvas-Caps.
- X-App-Version (versionName) et X-App-Platform=android sur toutes les requêtes ; le serveur en tire storeUrl pour le 426.
- X-Meeshy-Capabilities (onboarding-age, link-device-binding) : ne déclarer que ce que le binaire sait lire ; comparaison de versions numériques façon parseInt||0 (AppVersionHeader.compare / isBelow).

Transposition Android : Bundle.main → BuildConfig/PackageInfo ; UIDevice/identifiant modèle → Build.MANUFACTURER+MODEL (table de noms lisibles)

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/AppVersionHeader.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientCapabilities.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/DeviceModelName.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/DeviceLocaleInterceptor.kt`

### Le serveur choisi (production, staging, local, personnalisé) pilote API, socket, web et médias de façon cohérente

`nss-http-environment-config` · Android : **partielle** · P1 · effort S

MeeshyConfig dérive de l'origine du serveur l'URL d'API, l'origine socket, l'origine web et l'origine statique, résout toute référence média vers une URL sûre et fixe la limite client de 2000 caractères d'un message.

Écarts :
- Validation des URL médias absente : n'accepter que https (ou http en loopback), refuser 10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, laisser passer file:// local ; resolveMediaUrl ne valide rien aujourd'hui.
- MeeshyConfig.STAGING (staging.meeshy.me) contredit ServerEnvironment.STAGING (gate.staging.meeshy.me) : unifier sur un seul point.
- Constante MessageLimits.maxMessageLength = 2000 partagée (au-delà : pièce jointe .txt, #9037) au lieu d'un nombre local au détecteur de collage.

Rendu : Sélecteur d'environnement dans les réglages développeur : libellés Production / Staging / Localhost / Custom + champ hôte.

Transposition Android : UserDefaults → SharedPreferences (ServerEnvironmentStore) ; #if DEBUG → BuildConfig.DEBUG.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MeeshySDK.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Core/MessageLimits.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/ServerEnvironment.kt`

### Un refus du serveur désigne le champ fautif et propose des corrections

`nss-http-field-rejections` · Android : **partielle** · P1 · effort S

Les routes qui déclarent des refus typés (inscription, vérification d'e-mail, réinitialisation de mot de passe, traductions partagées, date de naissance, jeu) lèvent un APIRejection portant le code machine, le champ visé, des suggestions et des violations.

Écarts :
- Politique structured par route (register, verify-email, reset-password, shared-translations, birth-date, game/*) : sur tout 4xx hors 401/403/429 produire un APIRejection typé.
- emailOwner masqué (EMAIL_TAKEN, #8214) pour demander « Est-ce vous ? » sans rien révéler : absent des modèles Android.
- resetAt / limit / retryAfter portés par le refus (limites quotidiennes, mode lent) ; encodage strict des segments de chemin des routes game (A-Za-z0-9-_~).

Rendu : Le message d'erreur se pose sous le champ visé (couleur error) ; suggestions de pseudo en chips tapables.

Transposition Android : APIRejection → data class ApiRejection(code, field, message, suggestions, violations, emailOwner, resetAt, limit).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIRejection.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/GameEndpointPolicy.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/MeeshyEndpointPolicy.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/ApiCall.kt`

### Le point de présence a la bonne couleur, la bonne taille et le bon libellé, avec un point « ici » qui respire dans la conversation

`nss-pres-dot-and-labels` · Android : **partielle** · P1 · effort M

AvatarPresenceDot résout un seul point par avatar : « ici » (la personne regarde cette conversation, brandPrimary) l'emporte sur la présence (en ligne vert pulsant, absent orange, inactif gris, hors ligne = rien).

Écarts :
- AvatarPresenceDot sealed {Presence(state), Here} : « ici » prioritaire ; diamètre max(6 dp, 26 % / 30 % de l'avatar) et centre à 45° (centerOffset) — Android pose un cercle size × 0,26 + 4 dp avec bord de fond sans pulsation.
- Pulsation du point en ligne (pulses) et transition animée entre états (transitionKey) ; contour d'humeur (moodOutline) pour online / here.
- Ondes PresenceHereWave : focused hush (×1,25, 0,2, 2,8 s), here rest (×1,6, 0,3, 2,4 s), active vivid (×1,9, 0,4, 1,8 s) en easeOut répété ; anneau d'arrivée (trait 3, ×3, opacité 0,9 → 0, 0,9 s).
- Libellés localisés (7 langues) : En ligne / Absent / Inactif / Hors ligne / Dans la conversation ; lastSeenLabel « Vu il y a Nmin / Nh / Nj » (< 60 s ⇒ « En ligne »).

Rendu : Couleurs success #34D399, warning #FBBF24, neutral400 #9CA3AF, « ici » = brandPrimary (indigo) ; point avec liseré de la couleur du fond ; bas-droite de l'avatar.

Transposition Android : SwiftUI Circle + scaleEffect + repeatForever → Compose Canvas / graphicsLayer + rememberInfiniteTransition.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Theme/PresenceStyle.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Primitives/PresenceDotWaves.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`

### Les appels sonnent, se connectent et se terminent par la socket avec accusés et ICE à jour

`nss-sock-call-signaling` · Android : **partielle** · P1 · effort M

Signalisation d'appel : call:initiate (accusé 10 s, erreurs typées), call:join (accusé détaillé, 6 s), call:signal (offre / réponse / ICE), ICE rafraîchis, call:end, call:check-active et événements entrants (ended, missed, participant-joined / left, media-toggled, quality-alert, force-leave, translated-segment).

Écarts :
- Événement call:transcription-active (CallTranscriptionActiveData) et émission du segment de transcription local (CallTranscriptionSegmentPayload) absents.
- CallEndEmission : règles d'émission de call:end (raisons, idempotence, rejeu après socket froide) à aligner sur iOS.
- CallAccessoryRequestLedger : rattacher un call:error à la requête accessoire (invitation / mute / réaction / enregistrement) qui l'a provoqué dans une fenêtre de temps ; mémoriser le dernier participant arrivé pour les abonnés tardifs.

Rendu : Aucun rendu propre ; alimente l'écran d'appel et la pastille d'appel en cours.

Transposition Android : CallKit/PushKit → Telecom ConnectionService + FCM data haute priorité (autre part)

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager+CallSignaling.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketEvents+Calls.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/CallOfferData.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/CallParticipantEvents.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/CallEndEmission.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/CallAccessoryRequestLedger.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/CallSignalManager.kt`

### Partager sa position en direct dans une conversation, la mettre à jour et l'arrêter

`nss-sock-live-location-sharing` · Android : **partielle** · P1 · effort S

L'app émet location:live-start (durée, position initiale), location:live-update (positions successives) et location:live-stop ; les autres membres reçoivent location:live-started / updated / stopped.

Écarts :
- Android reçoit started / updated / stopped mais n'émet jamais location:live-start / update / stop {conversationId, …} : ajouter LiveLocationStartPayload / UpdatePayload (JSON) et emitLiveLocationStop.
- Service de premier plan type location pour les mises à jour tant que le partage est actif (FusedLocationProvider), arrêt à l'expiration.

Rendu : Badge « Position en direct » avec compte à rebours (LiveLocationBadge) ; carte avec marqueur qui se déplace.

Transposition Android : CLLocationManager → FusedLocationProviderClient + foreground service (location).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`

### Les réactions sur un message et sur ses pièces jointes apparaissent en direct

`nss-sock-message-reactions-events` · Android : **partielle** · P1 · effort M

reaction:added / removed portent l'agrégat (emoji, compte, participants) ; les réactions de pièce jointe ont leurs propres émissions (attachment:reaction-add / remove) et événements.

Écarts :
- Réactions de pièce jointe : émettre attachment:reaction-add / remove {attachmentId, messageId, emoji} et écouter attachment:reaction-added / removed (AttachmentReactionUpdateEvent) ; aucune présence Android.
- ReactionAggregationEvent (aggregateCount, aggregateParticipantIds) pour caler le compte quand les lignes n'ont pas d'auteur ; reconnaître MA réaction posée d'un autre appareil par le User.id de l'auteur.
- Appliquer les réactions aussi pour une conversation fermée (relais cache).

Rendu : Chips de réaction sous la bulle avec compte ; animation de pop à l'ajout.

Transposition Android : Idem lifecycle ; le geste (appui long sur la bulle → emoji) relève de la part chat.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketEvents+Messages.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`

### Le fil, les stories, les statuts et les commentaires bougent en direct, avec réactions confirmées par le serveur

`nss-sock-social-realtime` · Android : **partielle** · P1 · effort M

SocialSocketManager (socket dédiée côté iOS) relaie post:*, comment:*, story:*, status:*, traductions de post / commentaire / story / légende et conversation:deleted.

Écarts :
- Émissions absentes : feed:subscribe / feed:unsubscribe ; post:reaction-add / remove et comment:reaction-add / remove avec accusé (refus DAILY_REACTION_LIMIT) ; post:reaction-request-sync / comment:reaction-request-sync (resynchronisation d'agrégat).
- Événements absents : post:reaction-added / removed, comment:media-updated, conversation:deleted (côté social) ; Android a comment:reaction-added / removed seulement.
- Salles de post comptées par référence (joinedPostRooms : id → n) et rejointes à chaque reconnexion ; Android émet post:join / leave sans compteur ni replay.

Rendu : Compteurs de likes / commentaires qui s'incrémentent avec animation légère ; réaction confirmée remplace l'état optimiste.

Transposition Android : Deux sockets iOS → un SocketManager partagé côté Android (le serveur multiplexe)

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketEvents.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketProviding.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketRoutes.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocialSocketManager.kt`

### Un trou dans la séquence des événements déclenche un rattrapage exact, pas une relecture à l'aveugle

`nss-sync-seq-gap-resync` · Android : **partielle** · P1 · effort S

Le serveur numérote (_seq) les événements propres à un utilisateur ; le client avance son curseur et détecte next > lastSeq + 1 AVANT d'enregistrer.

Écarts :
- Le détecteur existe (SyncSeqState / SyncSeqTracker, reset au logout) mais seul le flux de notifications resynchronise sur gapDetected : brancher aussi syncSinceLastCheckpoint des conversations.
- Étendre l'observation du _seq aux autres collections émises avec seq par la passerelle (emitWithSeq) au fur et à mesure de leur migration.

Transposition Android : actor SyncSeqTracker → classe synchronisée déjà portée.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Sync/SyncSeqState.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/sync/SyncSeqState.kt`

### Signalements, droits de modération et routes d'exploitation sont atteignables

`nss-api-moderation-ops` · Android : **partielle** · P2 · effort S

Catalogue iOS : /reports, /admin (≈140 routes dont /admin/me/permissions et la modération des publications — les deux seules utilisées par l'app mobile), /health et /socketio.

Écarts :
- /admin/me/permissions et /admin/users/{id}/publications/moderation : permissions du modérateur et retrait motivé de contenu (voir nss-http-response-envelope).
- /health/ready pour le diagnostic de connexion ; le reste d'Admin / Socketio reste hors périmètre mobile (classer « ops-only » dans le cliquet du générateur).

Transposition Android : Retrofit ReportApi/AdminApi (2 routes).

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/AdminEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/HealthEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/SocketioEndpoint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/ReportsEndpoint.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ReportApi.kt`

### Les attentes annulables et les erreurs « au mieux » ont leur équivalent Kotlin et ne disparaissent plus en silence

`nss-core-helpers` · Android : **partielle** · P2 · effort S

Briques Swift du SDK : sommeil annulable, échéance coalescée, porte « le plus récent d'abord », état verrouillé, table d'attentes (tous couverts par les coroutines), et helpers de diagnostic.

Écarts :
- bestEffort { } + interface ErrorRecording (sink vers CrashDiagnostics / Timber), ignorer CancellationException, catégories de log alignées.
- encodeOrLog / decodeOrLog autour de kotlinx.serialization pour ne jamais écrire un null qui détruit un payload en base ; BoundedAsyncResolution = withTimeoutOrNull.
- Optionnel : LatestFirstGate (sémaphore LIFO annulable) si le chargeur de médias en a besoin ; CoalescingDeadline = debounce par clé ; identifiants typés en value class (ConversationId, UserId, MessageId, PostId, StoryId).

Transposition Android : cancellableSleep → delay ; Locked → Mutex ; os.Logger → Timber ; try? → runCatching + log.

<details><summary>Sources iOS (14)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Concurrency/CancellableSleep.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Concurrency/CancellableWaiters.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Concurrency/CoalescingDeadline.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Concurrency/DelayedActions.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Concurrency/LatestFirstGate.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Concurrency/Locked.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Concurrency/TeardownBox.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Concurrency/WaiterTable.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Logging/BestEffort.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Core/CodableLogging.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Core/FileManagerLogging.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Core/BoundedAsyncResolution.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Core/ID.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Core/Logging.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/diagnostics/CrashDiagnostic.kt`


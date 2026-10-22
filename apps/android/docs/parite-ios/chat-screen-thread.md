# Parité iOS → Android : `chat-screen-thread`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**95 features iOS** : 33 absentes, 56 partielles, 6 divergentes, 0 complètes sur Android. **34 lots** planifiés (≈47200 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**chat-screen-thread#1** (couverture Android estimée ≈ 27 %)

Cette partie couvre l'écran de conversation iOS (ConversationView et ses ~45 extensions, 97 fichiers, ~22 000 lignes) : scène en couches (en-tête flottant en verre, fil UIKit inversé, composeur, bulle « retour en bas »), fonds de conversation (Signature animé et fond choisi par le lecteur : modèle, couleur, photo), menus de message (appui long en place, barre de réactions rapide, feuille « Plus… », sélection multiple, transfert, « Imager »), galerie média plein écran (zoom, immersion, pellicule, légendes traduisibles, actions réagir/répondre/créer), lecteur audio de bulle, protections (vue unique, flou, éphémère), stickers, retouche des pièces en attente, modes de lecture (Script, Rivière, Résumé), fil de réponses, écran d'appel entrant et réglages de conversation. Android possède déjà un noyau solide et testé (ChatScreen/ChatViewModel ~5 200 lignes : liste inversée LazyColumn, séparateurs de jour et de non-lus, ancres épinglées, balayage pour répondre, feuille d'actions avec aperçu héros, réactions, traductions par drapeau, recherche locale, brouillon, transfert simple, signalement, visionneuse d'images, pastille de frappe, réglages admin, membres). Les écarts majeurs : aucun fond de conversation personnalisable ni animé, en-tête en TopAppBar standard sans avatar, flamme de série, verre ni mémoire de repli ; pas de modes de lecture ; pas de sélection multiple ; pas de stickers ; pas de lecteur audio ni vidéo dans la bulle (l'audio s'ouvre dans une app externe) ; galerie limitée aux images chargées sans immersion, pellicule, vidéo, scène ni actions ; pas de saut vers un message hors fenêtre (paramètre around du gateway non utilisé) ; recherche uniquement locale (endpoint messages/search déclaré mais inutilisé) ; envoi de pièces jointes limité à un fichier par message sans plateau éditable ni retouche. Le chantier est dominé par le pipeline média (galerie, audio, vidéo, envoi multi-pièces) et par le chrome d'en-tête, deux fondations dont dépendent la plupart des autres fonctionnalités.

**chat-screen-thread#2** (couverture Android estimée ≈ 30 %)

Cette partie regroupe, côté iOS, tout ce qui entoure le fil de conversation sans être la liste de bulles elle-même : le ConversationViewModel et ses ~30 extensions (chargement cache-first GRDB, envoi optimiste socket-first→REST→outbox, rattrapage après reconnexion, accusés de lecture exacts, fenêtres sautées autour d'un message, éphémères / vue unique / flamme-œil, protections armées collantes, restriction d'écriture Global), le gestionnaire d'événements socket, le lecteur audio partagé à file d'attente, le menu d'appui long (aperçu flottant, liste verre, geste vertical, feuille « Plus… », visée par pièce), la fiche conversation (héros, onglets Membres/Médias/Stats/Options, fond et accent, verrou PIN, chiffrement, tableau de bord IA), l'écran Médias/liens/documents et les services SDK REST (ConversationService, MessageService, ScrollDepth).
Android est déjà bien avancé sur le socle : fil cache-first Room avec ETag et rattrapage `after`, outbox FIFO, édition/suppression/épingle/favori/transfert, recherche locale, réactions, explorateur de langues (Prisme), effets de message (10 effets), verrou PIN à 7 modes, feuilles Stats / Analyse / Membres / Réglages admin, pipeline de frappe, lecteur d'aperçu audio dans l'overlay.
Les écarts majeurs sont structurels : aucun lecteur audio/vidéo dans le fil (un vocal s'ouvre dans une app externe), aucune file de lecture ni mini-lecteur, pas de `viewing:*`, pas de rattrapage déclenché à la reconnexion, accusés de lecture « tout marquer lu à l'ouverture » au lieu de l'exactitude par éléments vus, envoi REST seul (pas de socket-first ni de minuteur), base Room unique effacée à chaque déconnexion, une dizaine d'événements socket ignorés (consommation, compte à rebours, masquage pour moi, réactions de pièces, progression audio).
Il manque entièrement : fiche conversation unifiée, onglet Options dans le chat, fond/accent par conversation, écran Médias/liens/documents (kinds), fenêtre autour d'un message (`around`), vue unique à ouvrir, flamme-œil, protections collantes, héritage flou/éphémère à la réponse, visée par pièce, feuille « Plus… » (qui a vu, transcription, sentiment, historique), sélection multiple, détails d'appel depuis une bulle, chiffrement par conversation et numéro de sécurité, télémétrie de défilement.
Estimation de couverture de cette partie : environ 30 % du comportement iOS est présent à l'identique sur Android ; le reste est partiel ou absent. Les priorités P0 sont l'audio dans le fil, le rattrapage à la reconnexion, les accusés exacts, le pipeline d'envoi, le gestionnaire temps réel et la couche REST messages.

## Notes transverses

VUE D'ENSEMBLE. 61 lots, environ 85 100 lignes Kotlin de production (nouvelles + déplacées + modifiées), 6 niveaux de dépendances. Dix lots de vague 0 sans dépendance : chat-screen-composables-split, chat-viewmodel-state-split, chat-destination-and-lock-gate, chat-protection-and-action-laws, chat-rest-and-outbox-surface, chat-audio-laws-and-engine, chat-appearance-model-and-sync, chat-reading-modes-laws, chat-incoming-call-screen, chat-comment-thread-section. Le lot chat-destination-and-lock-gate (porte PIN) est volontairement indépendant des grosses refontes : c'est un correctif de sécurité (notification, lien profond, recherche et partage ouvrent aujourd'hui une conversation verrouillée sans code).

FICHIERS HORS BUDGET (plafond dur 1200, ajout interdit tant qu'on n'a pas extrait) : ChatScreen.kt 2953, ChatViewModel.kt 2248, MessageBubble.kt 1202, MeeshyApp.kt 1202. Cinq lots de fondation créent les coutures : composables-split et hosts-and-composer-split (ChatMessageRow + cinq hôtes ChatBackgroundHost / ChatListHost / ChatHeaderHost / ChatSheetsHost + composeur en trois blocs), viewmodel-state-split (interface ChatController en multibinding @IntoSet, ChatUiState extrait de 52 champs, API publique inchangée), bubble-split-and-interactions (BubbleAttachmentModels/Mapping, BubbleReplyModels/Mapping, rappels de geste), destination-and-lock-gate (ChatDestination.kt hors de MeeshyApp). Tout autre lot passe par ces coutures : aucun lot n'ajoute un champ à ChatUiState ni une ligne à ChatScreen.kt ou MeeshyApp.kt.

FICHIERS CHAUDS RESTANTS ET ORDRE DE FUSION. ChatListHost (~10 lots), ChatSheetsHost (~9), ChatComposer et ses trois blocs (~8), ChatMessageRow (~8), ChatViewModel en délégation d'une ligne (~7). Les lots qui se partagent un fichier sont chaînés par depends_on, un à la fois ; pousser le squelette de branche dans les quinze minutes (règle de la branche poussée) et céder si une branche vivante écrit déjà ces chemins.

BASE DE DONNÉES. MeeshyDatabase.kt / DatabaseModule.kt (version 16, repli destructif, exportSchema=false) sont touchés par media-index-store, message-search (FTS4 : FTS5 n'est pas disponible sous Room) puis per-account-message-store, dans cet ordre imposé par depends_on ; chaque lot incrémente la version. Décider dans services/decisions (apps/android/decisions.md) d'exporter les schémas avant la première migration réelle, et trancher là le choix technique d'une base Room par compte (utilisateur + serveur) avant d'implémenter le lot per-account.

CONTRATS VÉRIFIÉS SUR L'ARBRE RÉEL. 21 événements socket dans packages/shared/types/socketio-events/event-names.ts (+ viewing-event-names.ts) ; les réactions de pièce passent par le socket (attachment:reaction-add/remove), pas par REST ni l'outbox ; « trouver la conversation directe » = ConversationApi.list(type, withUserId) ; les routes REST ajoutées sont énumérées dans chat-rest-and-outbox-surface (around, include_replies/include_translations/languages, view=media, consume, after-read, delete-for-me avec motif, read-status, mark-as-received, engagement, unban, attachments/{id}/status). Paging 3 non adopté : fenêtres Room (ARCHITECTURE §11).

CONVENTIONS. Lois pures dans :core:model (JVM, ./apps/android/meeshy.sh jvm-check), miroirs des lois TS de packages/shared et des lois iOS (content-exit-law, message-action-policy, conversation-appearance, resolveUserLanguage, présence 1/3/5 min, accent de conversation) : la directive #11570 remet Android dans les lois « touche les TROIS ». Nouveaux dépôts, modules Hilt et ressources strings_<lot>.xml dans des fichiers neufs, pour 4 locales Android (iOS en couvre 7 : écart transverse à traiter dans une issue séparée). Le Prisme Linguistique s'applique à tout contenu servi (texte, légendes, transcriptions, aperçus) : descente stricte des rangs, jamais de repli sur translations.first.

PRÉREQUIS EXTERNES (ext:). atelier-imagine (message-export-image), scene-editor (pending-attachment-retouch), sticker-catalog (sticker-sheet), scene-player (gallery-scene-page), e2ee-crypto (encryption-status-sheet : le module :core:crypto est vide aujourd'hui), wallpaper-pack-catalog + lottie-compose au catalogue de versions (background-design-packs). media3-session est ajouté à sdk-core par audio-laws-and-engine : les autres domaines (stories, feed, appels) doivent converger sur son moteur de lecture.

RECOUVREMENTS POSSIBLES AVEC D'AUTRES DOMAINES. Famille bulle (bubble-split-and-interactions), écran d'appel entrant et bulle de résumé d'appel (domaine appels), section de commentaires (domaine feed), stickers et lecteur de scène (domaine stories), menu d'appui long de la liste de conversations (domaine liste de conversations). Arbitrer à la création des issues pour éviter les doublons et les collisions de fichiers.

RISQUES. Types de service de premier plan et politique Google Play (VoiceRecordingService, MediaSessionService) ; FLAG_SECURE sur contenu protégé ; flou d'arrière-plan réel à partir d'API 31 ; SpeechRecognizer sur appareil à partir d'API 31 ; Room exportSchema=false ; surface de collision très élevée sur les hôtes (voir plus haut).

DIRECTIVES PRODUIT. E2EE optionnel par conversation ; traduction serveur fail-closed (inconnu = non lu) ; clair refusé dans une conversation chiffrée ; les fonctions qui exigent le clair côté serveur sont absentes en E2EE et l'interface le dit ; la présence suit resolvePresenceVisibility (amis acceptés, soi, ADMIN/BIGBOSS) ; les protections de contenu (vue unique, flamme-œil, flou, éphémère, chiffré) se mesurent sur tout ce que la charge transporte, pas sur la seule chaîne.

HORS LOT. Indirect.swift est propre à iOS (non porté) ; DownwardExtendedTapShape est couvert dans chat-bubble-split-and-interactions. Chaque issue déclare ses dimensions cibles (les treize dimensions de CLAUDE.md) et dit à la clôture lesquelles sont mûres. est_kotlin_lines = lignes de production (nouvelles + déplacées + modifiées), tests exclus.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `chat-destination-and-lock-gate` | C | P0 | M | 650 | socle-points-d-extension-de-l-app, liste-decoupage-viewmodel, liste-decoupage-ecran-jetons-lentille | Une conversation verrouillée par code demande son code quel que soit le chemin d'ouverture |
| `chat-gallery-pager-core` | C | P0 | L | 1400 | chat-media-index-store, persist-messages-fenetre-moteur, chat-screen-hosts-and-composer-split, media-disponibilite-et-telechargement-auto, lecture-focus-audio-et-coordination-des-lecteurs, chat-viewmodel-state-split | Ouvrir un média plein écran et feuilleter toute la conversation : pincer, glisser pour fermer, réessayer |
| `chat-list-states-pill-and-jump` | C | P0 | L | 2050 | chat-room-sync-and-read-receipts, persist-messages-fenetre-moteur, chat-bulle-decoupage-composants | Le fil montre frappe, début, chargement et erreurs, une pastille unique ramène au bas, et toucher une citation saute au bon message |
| `chat-longpress-overlay-and-quick-bar` | C | P0 | L | 1550 | chat-viewmodel-state-split, actions-message-et-conversation-loi, chat-screen-hosts-and-composer-split, chat-bulle-decoupage-composants, composer-glass-shell | Un appui long ouvre le message en place sur fond assombri, et une barre d'emojis rapides apparaît sous la bulle |
| `chat-media-index-store` | C | P0 | M | 1000 | chat-rest-and-outbox-surface, persist-cache-entries-store, persist-room-migrations | Photos, vidéos, audios, liens et documents d'une conversation sont indexés localement, même jamais chargés |
| `chat-realtime-events-and-local-deltas` | C | P0 | L | 1550 | chat-viewmodel-state-split, socket-routage-evenements-ordre-arrivee | Le fil se met à jour en direct sur tous les événements, sans recharger la conversation |
| `chat-rest-and-outbox-surface` | C | P0 | L | 1650 | refus-types-limite-du-jour-mode-lent, persist-outbox-registre-senders, message-fil-decodage-complet-et-tolerant | Les actions de message faites hors ligne partent à la reconnexion et se défont si le serveur refuse |
| `chat-room-sync-and-read-receipts` | C | P0 | L | 1650 | chat-rest-and-outbox-surface, chat-realtime-events-and-local-deltas, chat-screen-shell-routing, chat-screen-hosts-and-composer-split, chat-liste-items-types-et-entrees, persist-messages-repository-decoupage, socket-connexion-jeton-identite-idempotente, chat-viewmodel-state-split | Les messages manqués reviennent aussitôt, et le serveur n'apprend que ce qui a été vu |
| `chat-screen-composables-split` | C | P0 | L | 2400 |  | L'écran de conversation est découpé en fichiers courts, sans aucun changement visible |
| `chat-screen-hosts-and-composer-split` | C | P0 | M | 1100 | chat-screen-composables-split | L'écran est assemblé de cinq hôtes et le composeur de trois blocs, sans changement visible |
| `chat-screen-shell-routing` | C | P0 | M | 750 | chat-screen-composables-split, chat-viewmodel-state-split, chat-destination-and-lock-gate, composer-glass-shell | L'écran de conversation s'ouvre prêt, obéit au routeur et se referme si l'accès est retiré |
| `chat-translation-requests-and-admission` | C | P0 | M | 550 | chat-realtime-events-and-local-deltas, chat-screen-composables-split, persist-messages-repository-decoupage | Demander une traduction ne livre jamais de clair à la traduction serveur d'un message chiffré |
| `chat-viewmodel-state-split` | C | P0 | XL | 2700 |  | La logique de l'écran est répartie par responsabilité, sans changement visible |
| `chat-gallery-captions-and-actions` | C | P1 | L | 1600 | chat-gallery-stage-and-filmstrip, actions-message-et-conversation-loi, pieces-jointes-api-transcription-traduction-statut, socket-routage-evenements-ordre-arrivee | La légende se lit dans ma langue, et réagir, répondre, créer ou enregistrer se fait depuis le plein écran |
| `chat-gallery-host-bridge` | C | P1 | M | 900 | chat-gallery-pager-core, chat-rich-quoted-reply-and-protections, ouverture-et-sortie-des-vues-uniques-dans-le-chat, image-visionneuse-plein-ecran-alignee, composer-banners, persist-messages-repository-decoupage, chat-viewmodel-state-split | Depuis le plein écran, répondre sans quitter, réagir à la pièce, créer avec ce média, et compter la vue |
| `chat-gallery-stage-and-filmstrip` | C | P1 | L | 1500 | chat-gallery-pager-core, plein-ecran-kit-chrome | Le média occupe un plateau calculé avec plein cadre au toucher, voiles de lisibilité et pellicule de défilement |
| `chat-header-actions-cluster` | C | P1 | M | 1000 | chat-header-glass-band, chat-screen-shell-routing | Les actions de l'en-tête s'effacent au défilement : appel vocal/vidéo, retour à l'appel, partage et barre invité |
| `chat-header-glass-band` | C | P1 | L | 1750 | chat-realtime-events-and-local-deltas, persist-messages-fenetre-moteur, chat-screen-hosts-and-composer-split | L'en-tête de conversation flotte en verre au-dessus du fil : retour avec non-lus, titre et étiquettes dépliables |
| `chat-header-identity-and-flame` | C | P1 | L | 1500 | chat-header-glass-band, chat-bulle-decoupage-composants, chat-room-sync-and-read-receipts, atomes-d-avatar-loi-humeur-et-non-lus | L'avatar d'en-tête ouvre la fiche et les stories, et une flamme montre la série du jour |
| `chat-info-sheet-options-and-settings` | C | P1 | XL | 2750 | chat-header-actions-cluster | La fiche de conversation réunit héros, partage, onglets et réglages, personnels comme d'administration |
| `chat-media-hub-screen` | C | P1 | M | 1000 | chat-media-index-store, chat-info-sheet-options-and-settings | Parcourir Médias, liens et documents d'une conversation par genre, avec recherche et pagination |
| `chat-message-more-sheet-and-views` | C | P1 | L | 1850 | chat-rest-and-outbox-surface, chat-realtime-events-and-local-deltas, chat-longpress-overlay-and-quick-bar | La feuille « Plus… » regroupe vues, historique, traductions, partage et actions avancées d'un message |
| `chat-message-removal-and-command-hardening` | C | P1 | M | 1100 | chat-rest-and-outbox-surface, chat-realtime-events-and-local-deltas, actions-message-et-conversation-loi, chat-screen-hosts-and-composer-split, persist-outbox-registre-senders, persist-messages-repository-decoupage, chat-viewmodel-state-split | Supprimer, épingler, modifier ou réagir avec un retour arrière propre, « pour moi » ou « pour tous » |
| `chat-message-search` | C | P1 | L | 1350 | persist-messages-fenetre-moteur, chat-screen-hosts-and-composer-split, chat-media-index-store, persist-room-migrations, chat-viewmodel-state-split | Rechercher dans la conversation : serveur filtré en place, et hors ligne classé par pertinence |
| `chat-reply-thread-screen` | C | P1 | M | 650 | chat-message-more-sheet-and-views | Le fil de discussion d'un message s'ouvre en plein écran avec ses réponses paginées et un composeur |
| `chat-rich-quoted-reply-and-protections` | C | P1 | L | 1350 | actions-message-et-conversation-loi, chat-bulle-decoupage-composants, chat-viewmodel-state-split, chat-screen-hosts-and-composer-split, ephemere-echeance-par-lecteur-et-reveil-unique, citation-reponse-loi-pure, persist-messages-repository-decoupage, composer-glass-shell | Répondre cite le message ou la pièce en entier, et les protections armées restent actives |
| `chat-selection-and-forward` | C | P1 | L | 1550 | chat-longpress-overlay-and-quick-bar, chat-message-removal-and-command-hardening, liste-menu-actions-conversation, chat-glisser-repondre-transferer, chat-viewmodel-state-split | Sélectionner plusieurs messages puis les transférer ou les supprimer depuis un écran de partage unique |
| `chat-appearance-model-and-sync` | C | P2 | M | 950 | liste-conversations-fil-complet-et-contrat-apercu | Le fond et l'accent choisis pour une conversation se synchronisent entre tous mes appareils |
| `chat-background-design-packs` | C | P2 | M | 800 | chat-background-signature-and-choice, packs-content-store-and-presence, catalogue-d-apparence-embarque, dependances-gradle-scene-medias | Les fonds de pack animés se jouent derrière le fil, ou restent fixes quand on réduit les animations |
| `chat-background-signature-and-choice` | C | P2 | L | 2300 | chat-screen-hosts-and-composer-split, chat-appearance-model-and-sync, chat-media-index-store | Chaque conversation a son fond Signature, ou le fond que le lecteur a choisi : couleur ou photo avec voile et flou |
| `chat-conversation-dashboard-unified` | C | P2 | M | 900 | chat-info-sheet-options-and-settings | Voir le tableau de bord de la conversation : santé IA, anneaux de stats, activité, participants, sentiment et profils |
| `chat-gallery-scene-page` | C | P2 | L | 1600 | chat-gallery-pager-core, lecture-prechargement-et-surface-reutilisable | Une scène de publication s'ouvre comme une page de la galerie, avec sa légende traduisible |
| `chat-polish-and-telemetry` | C | P2 | M | 950 | chat-list-states-pill-and-jump | Les effets rejouent, la frappe fait respirer le composeur, et la profondeur de défilement se mesure discrètement |
| `chat-sticker-wire-and-rasterizer` | C | P2 | M | 850 | composer-attachment-tray, message-fil-decodage-complet-et-tolerant | Un sticker (emoji, gabarit, lieu décoré, Mee, Instant, pack) part comme image ordinaire avec son descripteur |

### Lots fusionnés ou retirés par l'architecture

- `chat-per-account-message-store` → `persist-compte-cache-par-compte` (merge-into) : Même séparation par compte, appliquée aux messages.
- `chat-appearance-picker` → `fond-et-accent-de-conversation` (drop-duplicate) : Même sélecteur de fond et d'accent de conversation. Hérite : chat-appearance-model-and-sync.
- `chat-protection-and-action-laws` → `actions-message-et-conversation-loi` (merge-into) : Même loi « un message protégé ne livre pas son contenu, son menu n'offre que le permis ».
- `chat-protection-chrome-and-lifecycles` → `ouverture-et-sortie-des-vues-uniques-dans-le-chat` (merge-into) : Même cycle de vie des contenus protégés dans le chat. Hérite : chat-bulle-decoupage-composants.
- `chat-bubble-split-and-interactions` → `chat-bulle-decoupage-composants` (merge-into) : Même découpage de MessageBubble.kt ; les rappels de geste rejoignent BubbleCallbacks.
- `chat-message-window-and-projections` → `persist-messages-fenetre-moteur` (merge-into) : Même fenêtre de messages bidirectionnelle depuis le disque.
- `chat-send-pipeline-and-write-restriction` → `persist-messages-envoi-optimiste` (merge-into) : Même envoi optimiste durable ; l'écriture interdite expliquée rejoint ce lot (ComposerSendGate).
- `chat-attachments-staging-tray-and-send` → `composer-attachment-tray` (merge-into) : Même plateau de pièces ; brouillon durable = composer-draft-durable, envoi par lots = multi-attachment-send-plan + pieces-jointes-envoi-groupe-hors-ligne.
- `chat-composer-voice-location-and-gates` → `composer-voice-recorder` (merge-into) : Même vocal dans le plateau ; le lieu est location-picker-screen, les portes composer-zones.
- `chat-piece-targeting-and-previews` → `chat-pieces-reaction-et-apercu` (merge-into) : Même action sur une pièce et aperçu par appui long. Hérite : lecture-moteur-audio-media3, video-moteur-partage-et-montage.
- `chat-conversation-previews` → `apercu-appui-long-surcouche` (drop-duplicate) : Même aperçu de conversation par appui long.
- `chat-list-menu-and-direct-open` → `liste-menu-actions-conversation` (merge-into) : Même menu de conversation ; « Lui écrire » rejoint ce lot.
- `chat-incoming-call-screen` → `calls-screen-shell-and-states` (drop-duplicate) : Même écran d'appel entrant plein écran.
- `chat-call-summary-bubble` → `calls-summary-metadata-bubble` (drop-duplicate) : Même bulle de résumé d'appel.
- `chat-comment-thread-section` → `comment-row-rich` (merge-into) : Même ligne de commentaire avec réponses dépliables.
- `chat-encryption-status-sheet` → `chiffrement-de-conversation-active-depuis-les-reglages` (merge-into) : Même feuille d'état du chiffrement.
- `chat-audio-bubble-player-and-transcript` → `vocal-bulle-branchement-fil` (drop-duplicate) : Même vocal lu dans la bulle ; transcription = transcription-karaoke-dans-la-bulle. Hérite : chat-translation-requests-and-admission.
- `chat-audio-laws-and-engine` → `lecture-moteur-audio-media3` (merge-into) : Même moteur Media3 ; MediaSessionService = lecture-vocal-arriere-plan-et-ecran-verrouille.
- `chat-audio-fullscreen-and-queue-feed` → `audio-plein-ecran-pager-et-transport` (merge-into) : Même plein écran vocal avec file.
- `chat-gallery-video-transport` → `video-plein-ecran-ecran` (merge-into) : Même transport vidéo plein écran.
- `chat-reading-modes-laws` → `loi-modes-de-lecture` (merge-into) : Même loi des modes de lecture.
- `chat-reading-mode-chip-and-flat-rows` → `modes-lecture-interface` (merge-into) : Même chip de mode et rangées plates. Hérite : chat-header-actions-cluster.
- `chat-river-reader-ui` → `riviere-bulles-rails` (drop-duplicate) : Même Rivière.
- `chat-summary-reader-ui` → `resume-vivant-ecran` (drop-duplicate) : Même Résumé vivant.
- `chat-sticker-sheet` → `sticker-conversation-sheet-and-send` (merge-into) : Même feuille de stickers du chat. Hérite : chat-sticker-wire-and-rasterizer.
- `chat-message-export-image` → `imagine-entry-points` (drop-duplicate) : Même entrée « Imager un message ».
- `chat-pending-attachment-retouch` → `retouche-piece-de-conversation` (drop-duplicate) : Même retouche d'une pièce en attente.

## Features

### Écouter les vocaux d'une conversation à la suite dans un lecteur partagé (file, mini-lecteur, écran verrouillé, reprise après appel)

`chat-audio-queue-player` · Android : **absente** · P0 · effort L

`ConversationAudioCoordinator` orchestre la lecture séquentielle des vocaux : moteur unique, file d'éléments (piste effective par vocal selon la bascule du drapeau puis le Prisme, langue, protection), suivant / précédent, vitesse, saut, Now Playing et île dynamique, garde d'appel (refus de lire pendant un appel, suspension / reprise sur interruption système), fermeture à la déconnexion, à la suppression de la conversation ou du message joué. La conversation y verse les vocaux NOUVEAUX d'un autre auteur et marque chaque vocal écouté en fin de lecture ; toucher la zone lecture d'une citation audio joue l'audio cité sur place (seconde touche = pause), sans enchaîner.

Écarts :
- Aucun lecteur audio dans le fil : toucher un vocal exécute `uriHandler.openUri(url)` (ouvre une app externe) ; seul l'aperçu d'appui long a un lecteur. C'est un manque de base de la messagerie vocale.
- Créer un `ConversationAudioCoordinator` (Media3 ExoPlayer + MediaSessionService) : file `QueuedAudio`, `play / playNext / playPrevious / playKeepingQueue / replaceUpcoming / appendUpcoming / seek / skip / setSpeed (cycle) / close`, état publié (piste active, file, lecture, progression, durée, vitesse, fin de lecture).
- Notification média (MediaStyle) à la place de Now Playing / île dynamique ; focus audio et reprise après interruption (`InterruptionResumeLedger`) ; garde d'appel Telecom / état d'appel (refus pendant un appel actif) ; tâche de fond pour l'avance de file.
- Mini-lecteur global (titre, conversation d'origine, couleur d'accent de la conversation) au-dessus du NavHost.
- Fermeture automatique : déconnexion, conversation supprimée, message joué supprimé (retrait des éléments des messages supprimés).
- Alimentation de la file par la conversation : vocaux nouveaux d'un autre auteur, piste effective (bascule manuelle du drapeau puis Prisme audio), langue, protection ; marquage « écouté » en fin de lecture.
- Citation audio : zone lecture de la citation joue l'audio cité (piste du message en mémoire, sinon `quotedAudioTracks` + `AudioTrackLanguageResolver`), refus pour audio protégé / supprimé / expiré.

Rendu : Mini-lecteur capsule verre (titre, contrôles lecture/pause/suivant, progression), vitesse x1 / x1,5 / x2 par tap ; bulle audio avec onde teintée par la consommation ; contrôles ≥ 48 dp.

Transposition Android : AVAudioEngine / AVAudioSession / Now Playing / Live Activity → Media3 ExoPlayer + MediaSessionService + notification MediaStyle + AudioFocus ; CallKit guard → TelecomManager / CallState du module calls ; tâche de fond → foreground service media playback.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationAudioQueueFeed.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+AudioQueue.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+QuotedAudio.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaPreview.kt`

### Toucher une bulle de résumé d'appel rappelle le correspondant ou rejoint l'appel en cours

`chat-call-summary-launcher` · Android : **absente** · P1 · effort S

Un tap sur la bulle de résumé d'appel rappelle (conversation directe seulement, même média audio / vidéo que l'appel résumé) ou rejoint l'appel EN COURS quand la bulle est le message vivant (`call-live`). Les invités anonymes n'ont jamais d'affordance d'appel (pas de demande de micro avant la vérification du serveur). Le nom du correspondant est résolu au mieux depuis un message reçu. `IncomingCall` décrit un appel entrant (id, appelant, type, serveurs ICE, conversation).

Écarts :
- Android a le bouton d'appel d'en-tête et la pastille « Rejoindre l'appel en cours » (sonde `activeCall`) mais aucune bulle de résumé d'appel dans le fil ni de rappel au tap.
- Rendu du message de résumé d'appel (`callSummary` : durée, type, manqué / refusé / en cours) et du message vivant `call-live` « Appel … en cours ».
- Rappel : conversation directe uniquement, même média que l'appel résumé, nom du correspondant résolu au mieux ; rejoindre l'appel en cours via l'ID de session ; invité anonyme exclu.
- Menu d'appui long : verbe « Détails de l'appel » ouvrant la feuille de détail.

Rendu : Carte de résumé d'appel centrée avec icône, durée et état ; carte vivante avec pastille « en cours » et appel à l'action « Rejoindre ».

Transposition Android : CallKit → Telecom ConnectionService ; LiveCallJoiner → CallRoute / CallViewModel.join.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+CallLauncher.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/ActiveCallRepository.kt`

### Voir et activer le chiffrement d'une conversation, et vérifier le numéro de sécurité

`chat-encryption-detail-sheet` · Android : **absente** · P1 · effort M

La rangée de sécurité de la fiche (E2E pour une conversation directe, vérification du numéro de sécurité pour un groupe chiffré) ouvre la feuille « Chiffrement » : chargement du statut, état actif (mode E2EE / Serveur / Hybride avec libellé et description), état inactif avec choix du mode, pied d'activation et bouton Activer, message d'erreur. Le numéro de sécurité s'ouvre dans `SecurityVerificationView`.

Écarts :
- Seul l'avis de début d'historique chiffré existe (`EncryptionDisclaimer`) ; ni feuille de détail, ni rangée de sécurité dans la fiche.
- API statut / activation de chiffrement par conversation (`E2EAPI.ConversationEncryptionStatus`, modes e2ee / server / hybrid) et écrans associés avec états chargement / actif / inactif / erreur.
- Numéro de sécurité et vérification des pairs (SecurityVerificationView) : nécessite le socle crypto (identités, Keystore) — `core:crypto` est vide.
- Directive produit : E2EE optionnel, activé par conversation, traduction sur l'appareil, aucune fonction serveur-clair offerte en mode E2EE, et un message clair dans une conversation chiffrée est refusé.
- Déchiffrement en mémoire des messages E2EE (voir chat-message-merge-projections) et admission de traduction serveur fail-closed (voir chat-prism-translation-requests).

Rendu : Feuille en Form avec titre inline « Chiffrement » et bouton Fermer ; texte d'erreur rouge caption ; Picker de mode avec libellé + description du mode sélectionné ; état inactif explicatif avant le bouton d'activation.

Transposition Android : Keychain → Android Keystore ; Form SwiftUI → liste Material (ListItem) en feuille.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConversationEncryptionDetailSheet.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSecurityRow.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/EncryptionDisclaimer.kt`, `apps/android/core/crypto/src/main/kotlin/me/meeshy/core/crypto/Module.kt`

### Parcourir Médias, liens et documents d'une conversation par genre, avec recherche et pagination

`chat-media-hub` · Android : **absente** · P1 · effort L

Un segment par genre (photos et vidéos, audio, documents, liens, contacts, conversations, lieux) : l'index persisté du genre se peint aussitôt (cache d'abord), la tête se revalide en silence, la pagination par `before` ne se déclenche que quand la liste touche sa fin, le hors ligne reste lisible (l'index vu reste affiché, la recherche filtre le connu) et la recherche (≥ 2 caractères) annule la précédente. Les règles pures (`ConversationMediaHubRules`) projettent des MESSAGES serveur en ÉLÉMENTS par la même partition que la clause serveur. États chargement / chargé / hors ligne / échec avec réessai.

Écarts :
- Aucun écran Médias / liens / documents ; la route `GET …/messages?view=media&kinds=…&q=…&before=…` (`listMedia`) n'existe pas dans `MessageApi`.
- ViewModel à segments (`ConversationMediaKind` : visual, audio, document, link, contact, conversation, location) avec phases loading / loaded / offline / failed, curseurs tête / queue / terminé, pagination vers le bas, réessai.
- Règles pures d'élément (`ConversationMediaHubItem` : pièce, lien + hôte + légende, lieu) et d'admission (mêmes exclusions que la galerie), tri et recherche locale hors ligne.
- Persistance Room d'un index par genre (chiffrée au repos selon la politique du compte, purgée avec le compte).
- Cellules par genre : grille de vignettes, lecteur audio compact, ligne document (nom, taille), carte lien, carte lieu ; ouverture vers la galerie, le lecteur, le document ou « aller au message » (`ConversationMediaHubActions`).

Rendu : Sélecteur de genre en capsules, champ de recherche en tête, grille 3 colonnes pour les visuels, listes pour les autres genres ; squelette sur cache vide, bandeau « hors ligne » discret.

Transposition Android : LazyVStack paginé → LazyVerticalGrid / LazyColumn avec détection de fin de liste ; barre de segments → SecondaryScrollableTabRow.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationMediaHubRules.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationMediaHubViewModel.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`

### Les protections armées restent actives pour les messages suivants, et une réponse hérite du flou et de l'éphémère du message cité

`chat-sticky-protection-reply-contagion` · Android : **absente** · P1 · effort M

Si l'utilisateur arme « éphémère 1 min » (flamme-œil comprise), flou ou vue unique, ces PROTECTIONS (pas les effets décoratifs) restent armées pour tous les messages suivants de la conversation, survivent à l'envoi, à la sortie et à la relance (`ConversationProtectionPreferenceStore`, une entrée UserDefaults par conversation armée). Le message cité impose en plus son flou et son éphémère à la réponse en cours (`ArmedReplyContagion`), sans toucher à l'armement persisté : retirer la citation rend l'armement d'avant.

Écarts :
- Les effets armés se vident à l'envoi (« only a send clears it ») : ajouter un magasin de préférence de protection par conversation (éphémère + durée, flou, vue unique) distinct du brouillon, survivant à l'envoi et au redémarrage.
- Distinguer protections collantes et effets décoratifs à usage unique dans `MessageEffects` / le sélecteur d'effets.
- Contagion de réponse : le message cité (flouté, éphémère) impose son régime à la réponse via la loi SDK `ReplyProtectionContagion` (jumelle de la loi TS de la passerelle) ; indicateur visible dans la bannière de réponse.
- Superposition non destructive : la citation retirée restitue l'armement antérieur intact.

Rendu : Pastilles d'armement (flamme, œil, flou) visibles sur le composeur tant qu'une protection est collante ; bannière de réponse qui montre le régime imposé.

Transposition Android : UserDefaults → DataStore Preferences.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ConversationProtectionPreferenceStore.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+ArmedProtection.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+ReplyContagion.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffects.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffectsEditor.kt`

### Dire au serveur quelle conversation est à l'écran (« est dans la conversation »)

`chat-viewing-presence-reporter` · Android : **absente** · P1 · effort S

`viewing:start` part quand l'écran de la conversation est actif ET l'app au premier plan ; `viewing:stop` quand il se ferme ou que l'app passe en arrière-plan ; chaque (re)connexion ré-émet `viewing:start` car le serveur oublie tout à la déconnexion. Un écran poussé par-dessus ne compte pas ; le plein écran ouvert depuis la conversation (galerie, visionneuse, story, audio, caméra) garde le lecteur dedans et émet `viewing:activity` avec `focus` à l'ouverture puis à chaque battement ; l'écran d'appel fait quitter. Les pairs arrivent par `viewing:start/stop/snapshot/activity`, sans jamais exposer `isOnline` ni `lastActiveAt`.

Écarts :
- Aucun événement `viewing:*` émis ni reçu sur Android ; `joinRoom` du SocketManager n'est jamais appelé.
- Reporter lié au cycle de vie (écran visible = RESUMED du back stack entry ET process au premier plan) avec compteur d'instances visibles (un écran jamais rapporté compte comme visible).
- Ré-émission à chaque `connect` socket ; arrêt à l'arrière-plan ; arrêt sur écran d'appel plein écran.
- Battement `viewing:activity` avec `focus` pendant un plein écran lancé depuis la conversation (galerie, visionneuse d'image, story, lecteur audio, caméra).
- Réception des signaux des pairs (arrivée / départ / activité de regard) pour l'affichage éventuel dans l'en-tête.

Rendu : Aucune surface propre.

Transposition Android : scenePhase / UIApplication → ProcessLifecycleOwner + LifecycleEventObserver du NavBackStackEntry.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ConversationViewingReporter.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/AppStatePresenceReporter.kt`

### Global se lit sans s'écrire avant 18 ans, et les nouveaux comptes sont limités à un message toutes les 30 s

`chat-write-restriction-newcomer-slowmode` · Android : **absente** · P1 · effort S

La liste et le détail servent `viewerWriteRestriction` et la vue remplace alors le composeur par un bandeau. Un envoi parti avant de le savoir reçoit un refus 403 `GLOBAL_ADULTS_ONLY`, définitif : ni socket ni file ne le réessaient, la bulle optimiste est retirée (`withdraw`) et la restriction apprise (`learnedWriteRestriction`) bascule le composeur. Le mode lent des nouveaux comptes est temporaire : la bulle reste en échec, renvoyable, et l'auteur lit pourquoi et dans combien de secondes (« Un message toutes les 30 s pour les nouveaux comptes — réessaie dans N s »).

Écarts :
- Android connaît le rôle d'écriture et le mode lent de conversation (`mayCurrentUserWrite`, `SlowModePolicy`) mais pas la restriction Global (mineur) ni son refus serveur 403 `GLOBAL_ADULTS_ONLY`.
- Classer ce refus comme DÉFINITIF dans l'outbox (jamais de retry), retirer la bulle optimiste et apprendre la restriction pour remplacer le composeur par un bandeau explicatif.
- Mode lent des nouveaux comptes (`NewcomerSlowMode`, `retryAfterSeconds`) : bulle en échec renvoyable + toast localisé avec le délai.
- Bandeau de remplacement du composeur dans la langue du lecteur.

Rendu : Bandeau pleine largeur à la place de la barre de composition, texte court sans jargon.

Transposition Android : FeedbackToastManager → Snackbar / MeeshyToast.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+WriteRestriction.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationWriteAdmission.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/SlowModePolicy.kt`

### Une pellicule de tous les médias de la conversation sert de rail de défilement, tête de lecture à droite

`chatthread-gallery-filmstrip` · Android : **absente** · P1 · effort M

Pellicule horizontale de TOUS les médias visuels, posée sur toute la rangée sous les détails de l'auteur, en bas du plein écran. La tête de lecture est le bord DROIT : l'élément le plus à droite est à chaque instant celui affiché ; on fait défiler la bande de gauche à droite comme une pellicule devant une fenêtre de projection. Mise en page : marge de contenu en tête = largeur de fenêtre − une vignette − marge de queue (sans quoi le premier média ne pourrait jamais atteindre le bord droit) et alignement viewAligned pour s'arrêter sur un média entier, les deux ancrages coïncidant. Vignettes de 54 pt, padding vertical 10, bas 6 (hauteur réservée 80), sélection avec haptique légère, vignette Equatable. Le rail parcourt la série ; la bande de transport parcourt le média.

Écarts :
- Composable Filmstrip : LazyRow à snap (SnapFlingBehavior) avec contentPadding de tête = largeur − vignette − queue pour que le premier média atteigne le bord droit.
- Synchronisation bidirectionnelle avec le pager (le média sous la tête de lecture = page courante ; toucher une vignette y saute) et haptique légère.
- Mesure de la hauteur réservée (vignette 54 + 2x10 + 6 = 80) réutilisée par le solveur de cadrage ; vignettes légères (ThumbHash) et Equatable pour limiter les recompositions.

Rendu : Bande basse de vignettes carrées 54 dp arrondies, vignette courante cerclée accent, fondu noir sous la bande.

Transposition Android : ScrollView viewAligned -> LazyRow + rememberSnapFlingBehavior ; ThumbHash -> ThumbHashPainter (déjà présent).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaFilmstrip.swift`

</details>

### Depuis le plein écran, répondre sans quitter, réagir à la pièce, créer avec ce média, et consommer une vue unique à la fermeture

`chatthread-gallery-host-actions` · Android : **absente** · P1 · effort M

ConversationMediaGalleryLayer porte le montage du plein écran et son câblage. Il enregistre le plein écran pour la capture d'écran protégée, ouvre la galerie sur la pièce (catalogue + porteur de chaque pièce : message), et séquence les présentations : « ouvrir le composer depuis le plein écran » est une suite de deux présentations (armCompose/promotePendingCompose) car SwiftUI ne présente pas un plein écran sur une feuille qui se ferme. Répondre : cite le message porteur et revient au composer (replyToCarrier) ou répond sans quitter le plein écran (sendReplyToMedia, texte + langue). Réagir : toggleAttachmentReaction(pièce, message, émoji). Une vue unique ouverte dans la galerie voit sa consommation attendre la fermeture (consumeOpenedViewOnce) ; la fermeture (handleGalleryDismiss) fait le ménage. Ouvrir un média depuis le plein écran d'un message reprend aussi openMediaFullscreen.

Écarts :
- Résoudre le message porteur de chaque pièce (carrier) pour que la galerie puisse citer, réagir et recomposer.
- Réponse en place (texte + langue) depuis le plein écran, avec citation de la pièce, sans fermer la galerie ; sinon renvoi au composer du fil.
- Réaction à la pièce : API de réaction d'attachement (toggleAttachmentReaction) absente de MessageApi côté Android.
- Séquence de présentations (galerie -> composeur média) sans empiler deux modaux ; nettoyage à la fermeture.
- Consommation d'une vue unique ouverte à la fermeture de la galerie ; blocage de la capture d'écran (FLAG_SECURE) pour un contenu protégé.

Rendu : Barre de réponse universelle ancrée en bas au-dessus du média (elle monte avec le clavier), citation de la pièce en vignette.

Transposition Android : conversationCover/fullScreenCover -> Dialog plein écran ou destination de navigation ; capture protégée -> WindowManager.LayoutParams.FLAG_SECURE.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+MediaGallery.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`

### Le média occupe un plateau calculé : couloirs pour les contrôles, plein cadre au toucher, voiles de lisibilité

`chatthread-gallery-stage-immersion` · Android : **absente** · P1 · effort M

Le plateau est cadré par le solveur MediaStageFraming (SDK) : couloirs d'abord (haut pour le menu et la barre, bas pour la pellicule dont la hauteur réservée est MESURÉE = 54 + 2x10 + 6 = 80 pt, jamais recopiée), cadre ensuite, plancher qui ne mord que sur un cadre court ; ce que le solveur ignore (pellicule, barre haute, média sans dimensions) est décidé par l'hôte. Orchestration du plein cadre : une SEULE écriture de l'état d'immersion par porte (tap, appui long, glissement, double tap latéral) ; entrer referme la traînée d'émojis, met la vidéo en pause seulement si la porte la promet, et annonce une pastille « En pause ». Voiles de lisibilité = ceux de la STORY (StoryReaderScrims) : deux dégradés pleine largeur ancrés en haut et en bas de l'ÉCRAN, ignorant la safe area, sourds au doigt et muets pour VoiceOver, qui suivent le chrome au même ressort (directive 2026-09-18). Le viewport réel est mesuré sur le fond de la galerie.

Écarts :
- Solveur de cadrage (couloirs haut/bas, cadre, plancher) à porter dans le SDK Android (MediaStageFraming) et à adapter à la pellicule et au menu.
- Machine d'état d'immersion (StagePresentation) avec portes tap / appui long / glissement / double tap latéral, une seule fonction d'écriture, effets de bord (traînée d'émojis refermée, pause conditionnelle, pastille « En pause » media.stage.paused).
- Voiles haut et bas pleine largeur ignorant la safe area, ressort partagé avec le chrome, a11y masquée.
- Mesure réelle du viewport (onSizeChanged) plutôt que la taille de la fenêtre ; couloir bas = ce que réserve la pellicule.

Rendu : Dégradés noir 0 -> 0,6 en haut et en bas pleine largeur, cadre média centré entre les couloirs, pastille « En pause » en capsule de verre.

Transposition Android : GeometryReader -> onSizeChanged ; ignoresSafeArea -> WindowInsets.systemBars + enableEdgeToEdge ; ressort -> spring(dampingRatio, stiffness).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Geometry.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Presentation.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Scrims.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`

### Une vidéo ou scène à durée se pilote par une barre de progression, un play/pause discret et un double tap de saut ±10 s

`chatthread-gallery-video-transport` · Android : **absente** · P1 · effort M

La progression des vidéos et scènes à durée descend au couloir bas, juste au-dessus du rail (directive 2026-09-12, #6162/#9577) : barre pleine largeur de l'ÉCRAN (et non du cadre), seulement si le lot a un temps à montrer ; la durée devient plus discrète dans la ligne d'infos et le son/⋯ montent dans la colonne d'actions. Le play/pause plus transparent au centre s'estompe après un délai (fadePlayPauseAfterDelay). Les boutons +10/−10 sont retirés : un double tap sur le tiers GAUCHE recule, sur le tiers DROIT avance, le centre ne réclame rien (aucun SpatialTapGesture sur la zone centrale et allowsHitTesting(false), sinon le tap simple, porte la plus fréquente, serait retardé de 250-300 ms partout). Le saut se borne aux limites du média (MediaStageSeek), avec haptique légère, sur le player partagé.

Écarts :
- Le chat Android ne lit pas la vidéo (aucune surface vidéo dans la bulle ni la galerie) : intégrer ExoPlayer/Media3 avec disponibilité (cache, auto-DL, poster net extrait seulement si le fichier est local).
- Barre de progression pleine largeur au couloir bas avec durée discrète et seek par glissement ; présente seulement pour un lot à durée.
- Play/pause central semi-transparent qui s'estompe, pastille « En pause ».
- Double tap latéral gauche/droite (±10 s) via zones armées sur les seuls tiers latéraux, centre sans détecteur ; saut borné et haptique légère.
- Commandes son/⋯ dans la colonne d'actions.

Rendu : Barre fine accent sur toute la largeur au-dessus du rail, play/pause 56 dp à 40 % d'opacité, indicateurs de saut en pastille de chaque côté.

Transposition Android : AVPlayer/SharedAVPlayerManager -> Media3 ExoPlayer partagé (singleton par session) ; SpatialTapGesture -> detectTapGestures(onDoubleTap) dans des zones latérales.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Transport.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Seek.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`

### L'avatar d'en-tête ouvre la fiche, montre les plus actifs, leur story et leur présence

`chatthread-header-avatar-identity` · Android : **absente** · P1 · effort M

Au toucher, l'avatar de l'en-tête ouvre la fiche (profil du pair d'un direct, détails de toute autre conversation, replié comme déplié et dans l'aperçu) ; un visiteur sans compte garde la simple bascule de l'en-tête. Déplié ou en aperçu il montre l'IDENTITÉ : pile des membres les plus actifs avec points de présence, anneau de story, humeur (emoji) et point « est dans la conversation » (here/actif). Chaque membre de la pile s'ouvre sur sa story si elle existe, sinon son profil ; appui long : voir la story, voir le profil, détails, envoyer un message (DM). Pour un direct, appui long : voir le profil, détails de la conversation. Un seul élément d'accessibilité dit ce que le toucher ouvre (« Voir le profil de Awa », « Voir la conversation Les Amis ») et expose bascule et menu en actions nommées. Un visiteur sans compte n'a ni détails ni profils (403 ACCOUNT_REQUIRED évité).

Écarts :
- Afficher l'avatar de la conversation dans l'en-tête (aujourd'hui seulement un point d'accent et la présence du pair).
- Porte de l'avatar : profil du pair (direct), détails de la conversation (groupe, public, global, communauté), bascule d'en-tête pour l'invité sans compte ; libellé TalkBack décrivant l'action.
- Pile des membres les plus actifs (ConversationActiveMember) avec anneau de story, humeur, points de présence 1/3/5 min et indicateur « ici » ; tap = story sinon profil.
- Menus d'appui long de l'avatar : voir la story, voir le profil, détails, envoyer un message ; actions nommées pour TalkBack.
- Mise à jour de la présence par signal débouncé (PresenceRefreshSignal) sans recomposer tout l'écran.

Rendu : Avatar en contexte conversationHeaderStacked, pile à chevauchement, point de présence vert #34D399 / orange #FBBF24 / gris #9CA3AF (aucun point si hors-ligne), anneau de story aux couleurs du design system.

Transposition Android : contextMenu d'avatar -> DropdownMenu sur appui long ; VoiceOver custom actions -> semantics customActions.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationHeaderAvatarDoor.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshyAvatar.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRingPresentation.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### La fiche de conversation ouvre l'écran « Médias, liens et documents » et en rejoint les médias ou messages

`chatthread-info-sheet-media-hub` · Android : **absente** · P1 · effort M

Le montage de la fiche de conversation (ConversationInfoSheetLayer) emporte aussi son câblage : toucher un média ferme la fiche PUIS ouvre la galerie de la conversation (#8095) sur la pièce — celle du fil, qui sait répondre, réagir et recomposer ; « aller au message » ferme la fiche et le surlignage SCOPÉ du routeur prend le relais (défilement si chargé, sinon fenêtre around). Deux actions, deux SÉQUENCES car une feuille ne se superpose pas à un plein écran qui se ferme. La fiche remonte la conversation CONFIRMÉE par le serveur après enregistrement des réglages (onConversationUpdated) pour que l'en-tête et le fond se repeignent.

Écarts :
- Android a quatre feuilles disjointes (réglages, membres, stats, analyse) sans fiche de conversation unifiée ni onglet « Médias, liens et documents » ; créer la fiche avec ses onglets.
- Onglet Médias/Liens/Documents : liste paginée (GET conversations/{id}/messages?view=media ou index local), toucher un média ferme la fiche puis ouvre la galerie sur la pièce.
- Action « aller au message » : fermeture de la fiche puis surlignage scopé (défilement ou fenêtre around).
- Relayer la conversation confirmée par le serveur (titre, avatar, bannière, réglages) vers l'écran ouvert pour repeindre en-tête et fond.

Rendu : Fiche à onglets avec grille de médias carrés, liste de liens avec aperçu, liste de documents avec icône et poids.

Transposition Android : sheet -> ModalBottomSheet ou destination plein écran ; séquence feuille puis plein écran -> navigation après animation de fermeture.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+InfoSheet.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationSettingsSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMembersSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationStatsSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationAnalysisSheet.kt`

### Sélectionner plusieurs messages pour les transférer ou les supprimer en une fois

`chatthread-selection-mode` · Android : **absente** · P1 · effort M

Le menu d'appui long ou la feuille « Plus… » entre en mode sélection en semant le message touché (point d'entrée unique) ; la sélection ne survit jamais à la sortie. Un message se coche/décoche par tap, plafonné à 100 : le 101e est un NO-OP signalé (haptique d'erreur + toast conversation.selection.capReached), compte affiché (conversation.selection.count). La sélection se lit dans l'ordre du fil, pas dans l'ordre de tap (un transfert groupé garde l'ordre de lecture). « Transférer » est retiré (jamais grisé) si un message sélectionné n'est pas transférable (vue unique, flamme après lecture, flou, loi de sortie #9573). Suppression groupée : « pour tous » exige que TOUS les messages soient éligibles (miens, non supprimés, hors fenêtre, #11214) ; « pour moi » est offert si au moins un message est admis ou n'est jamais parti (#11221), en UNE requête. La Rivière et le Résumé n'ont ni coche ni toucher de sélection et rendent la main au Script.

Écarts :
- Aucun mode sélection : ajouter l'état (ensemble ordonné d'ids, plafond 100) et son entrée depuis le menu d'appui long et « Transférer » de la feuille Plus.
- Cases à cocher animées sur les lignes, barre d'actions de sélection (compte, Transférer, Supprimer, Fermer) et haptique d'erreur + toast au 101e message.
- Transfert groupé dans l'ordre du fil et retrait de « Transférer » si un message n'est pas transférable.
- Suppression groupée « pour tous » (tous éligibles) / « pour moi » en une requête ; sortie automatique du mode après l'action.

Rendu : Coche ronde accent sur chaque ligne, barre basse en verre avec compte, animation d'apparition en ressort.

Transposition Android : mode sélection -> TopAppBar contextuelle + LazyColumn avec cases ; appui long -> onLongClick.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+Selection.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ForwardTargets.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Un texte à vue unique disparaît quand on quitte la conversation, pas quand on le touche

`chatthread-view-once-exit-consumption` · Android : **absente** · P1 · effort S

Directive porteur (recette 1.1.0, #7500) : « pour le texte, le faire disparaître lorsqu'on quitte la conversation uniquement ». Un TEXTE à vue unique se lit sur place (pas de plein écran) : sa consommation ne peut partir ni du toucher (il serait détruit avant lecture) ni d'un minuteur de cinq secondes (qui déciderait du temps de compréhension). Elle part de la SORTIE — retour par navigation, passage en arrière-plan, verrouillage de l'écran, qui sont la même chose vue de l'utilisateur — par un geste IDEMPOTENT. openViewOnce(messageId:) marque le message ouvert ; consumeOpenedViewOnceOnExit consomme tout ce qui a été ouvert. Les médias à vue unique restent consommés à la fermeture de leur plein écran (voir chatthread-gallery-host-actions).

Écarts :
- Suivre les vues uniques TEXTE ouvertes en mémoire (ensemble d'ids) et les consommer côté serveur à la sortie : onStop, retour arrière et verrouillage d'écran, idempotent.
- Ne plus consommer au toucher ni sur minuteur pour un texte ; contenu lu sur place jusqu'à la sortie.
- Brancher le POST de consommation (viewOnceCount) et refléter l'état « Vu et supprimé » après la sortie.

Rendu : Aucun visuel propre ; la puce passe à « Déjà ouvert » puis la bulle devient la tombe « Vu et supprimé » après la sortie.

Transposition Android : scenePhase/didDisappear -> DisposableEffect + LifecycleEventObserver ON_STOP (inclut verrouillage d'écran).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ViewOnceExit.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BlurRevealLifecycle.kt`

### Une flamme-œil fait disparaître un message après qu'on l'a vu et qu'on a quitté la conversation

`chat-after-read-flame-eye` · Android : **absente** · P2 · effort M

Disparition PAR LECTEUR (contrat #8302) : seuls les messages REÇUS et effectivement AFFICHÉS pendant la visite comptent (`AfterReadVisit`, nourri par la même preuve d'affichage que les accusés). À la sortie, `AfterReadConsumption` applique l'effet local (même que `message:expired`) puis la consommation serveur par l'outbox, rejouable hors ligne. L'expéditeur garde son message jusqu'à ce que tous l'aient vu.

Écarts :
- Aucun mode « après lecture » : ni sélecteur dédié, ni suivi des messages vus pendant la visite, ni consommation à la sortie.
- Route de consommation `consumeAfterRead(conversationId, messageIds)` absente ; nouveau type d'outbox (consommation après lecture) avec rejeu hors ligne.
- Effet local à la sortie : suppression Room, index média, aperçu de liste (équivalent de `expireLocally`), sans toucher les messages hors écran.
- Transfert interdit pour un message après lecture (voir chat-forward-message).

Rendu : Icône flamme-œil sur la bulle ; disparition animée au retour dans la conversation.

Transposition Android : onDisappear de la vue → onCleared / DisposableEffect du back stack entry.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+AfterRead.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffects.kt`

### Choisir le fond et l'accent personnels d'une conversation (Signature, modèles, couleur unie, photo avec voile et flou)

`chat-conversation-appearance-picker` · Android : **absente** · P2 · effort L

Feuille « Fond et accent » : sections Modèles (Signature + designs des packs de fonds installés, Lottie compris), Couleur unie (gamme du catalogue embarqué), Photo (images envoyées dans la conversation, admises par `ConversationBackgroundPhotoVerdict`, avec curseurs Voile et Flou) et Mon accent (Automatique + gamme), lien « Plus dans la boutique » et bouton « Rétablir Signature ». Chaque choix s'applique au toucher (optimiste), le réseau confirme, un refus du serveur rétablit l'état d'avant, et l'écho `user:preferences-updated` des autres appareils passe par le store. Le fond est ensuite rendu derrière le fil.

Écarts :
- Aucun sélecteur de fond/accent par conversation ; seul l'accent calculé (`accentHex`) existe, jamais un accent personnel choisi.
- Modèle `ConversationAppearance` (background = signature | design(pack, design) | solid(color) | photo(attachmentId, veil, blur), accent) + champ serveur dans les préférences de conversation (`PUT user-preferences/conversations/{id}`) et écho socket `user:preferences-updated`.
- ViewModel optimiste : snapshot → application locale immédiate → PUT → rollback sur refus ; brouillons des curseurs Voile (défaut 0,3) et Flou synchronisés avec l'état serveur.
- Rendu du fond derrière la LazyColumn du fil (dégradé accent→fond, design de pack, couleur unie par schéma clair/sombre, photo + voile + flou) et dans l'aperçu des tuiles.
- Section Photo : candidates = images de la conversation (via l'index média), états chargement / hors ligne / échec / vide (« Aucune photo envoyée dans cette conversation »).
- Packs de fonds possédés et installés : lecture cache-first par compte (mémo `InstalledWallpapersMemo`), Lottie des designs animés, lien vers la boutique ; catalogue de gamme et noms localisés des designs.
- Accessibilité : cibles ≥ 44 dp, nom localisé et état « sélectionné » exposés à TalkBack.

Rendu : Tuiles 72×96 dp, rayon `sm`, bordure 1 dp textMuted 30 % ou 3 dp accent avec coche cercle blanc en bas à droite quand sélectionnée ; pastilles de couleur cercle 40 dp (bordure 3 dp textPrimary), zone tactile minimale 44 dp ; titres de section footnote bold arrondi ; grille adaptative ; bouton « Terminé » dans la barre de titre ; accent effectif = accent personnel sinon accent calculé de la conversation.

Transposition Android : Sheet SwiftUI NavigationStack+Form → ModalBottomSheet Compose ; PackLottieLayer → lottie-compose ; flou → Modifier.blur (API 31+) avec repli voile opaque.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConversationAppearanceSheet.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationAppearanceViewModel.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/ConversationAccent.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`

### Reprendre un vocal ou une vidéo là où on s'était arrêté, même depuis un autre appareil

`chat-media-resume-sync` · Android : **absente** · P2 · effort S

L'amorçage de la progression média depuis le serveur fusionne deux magasins de sémantiques différentes : la teinte cosmétique de la waveform (`MediaConsumptionStore`, MAX à chaque ouverture) et la position de reprise (audio / vidéo), qui n'applique plus le « premier contact gagnant » mais se met à jour quand une valeur plus récente a été jouée ailleurs.

Écarts :
- Aucun magasin local de position de reprise audio / vidéo ni de teinte de consommation côté Android (pas de lecteur inline non plus).
- Amorçage depuis le statut de consommation servi par le serveur (`attachment-status:updated`, `message:consumed`) à l'ouverture de la conversation.
- Règle de fusion : teinte = MAX ; position de reprise = valeur servie plus récente l'emporte sur l'ancienne locale (jamais figée au premier contact), effacée à la complétion.

Rendu : Onde de la bulle teintée jusqu'au point écouté.

Transposition Android : UserDefaults / stores → DataStore ou table Room ; pur calcul de fusion portable.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+MediaConsumptionSeed.swift`

</details>

### Appui long sur UNE pièce d'un message : l'aperçu montre cette pièce seule et les actions la visent

`chat-message-piece-overlay` · Android : **absente** · P2 · effort M

Un appui long sur une tuile ouvre cette pièce à son ratio, avec défilement horizontal vers les autres pièces du message (compteur « 3/7 ») ; la pièce affichée devient la cible de la bande de réactions et du menu (« Supprimer le média » n'efface plus `attachments.first`) et une entrée « Tout le message » rend l'aperçu entier. Une pièce protégée se montre masquée, sans réaction ni sortie. `MessagePieceTarget` est la règle pure partagée par la feuille Plus, l'overlay et le plein écran.

Écarts :
- Aucune notion de pièce ciblée : `firstFileAttachment` prend la première pièce non image / lieu / audio pour Ouvrir / Partager.
- Overlay de pièce : aperçu à `fittedSize`, HorizontalPager entre pièces, compteur, `focusedPieceId` réécrit par le défilement et lu par l'hôte.
- Règle `MessagePieceTarget` : ce qu'un geste sur une pièce a le droit d'atteindre (suppression de la pièce visée, enregistrement, partage, réaction par pièce) avec sécurité pour les pièces protégées.
- Entrée « Tout le message » (`focusedPieceId = nil`) et réactions par pièce (socket `attachment:reaction-add/remove`).

Rendu : Pièce centrée à son ratio, pastille « 3/7 », pastille « Tout le message » ; pièce protégée en forme masquée.

Transposition Android : TabView paginé → HorizontalPager ; fittedSize → calcul Modifier.aspectRatio avec contraintes.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessagePieceOverlay.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessagePieceTarget.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Mesurer discrètement la profondeur de défilement d'une liste sans coût par image

`chat-scroll-depth-telemetry` · Android : **absente** · P2 · effort S

`ScrollDepthAccumulator` est une structure de taille fixe faite d'entiers (aucune allocation, écriture ni réseau par image) qui décime les échantillons à ≤ 10 Hz et agrège par passage : durée, durée de défilement actif, éléments rendus / visibles, position max, distance, histogramme de vitesse (4 classes), changements de direction, flings, arrêts, rafraîchissements, paginations, fin atteinte. Rien ne part avant la fin du passage ou d'un segment de 60 s (`ScrollListingSummary` → événement social `scrollListing`).

Écarts :
- Aucun suivi de défilement côté Android (`ImpressionBatcher` ne traite que les impressions de posts).
- Porter l'accumulateur pur (≤ 10 Hz, tailles fixes) et la session de liste (segments de 60 s, `finish`) ; brancher sur `LazyListState` (offset, éléments visibles).
- Envoyer le résumé via le lot d'événements sociaux (`scrollListing`) à la fin de passage, jamais par image.

Rendu : Aucune surface propre (télémétrie).

Transposition Android : Pur calcul de modèle portable ; scroll Compose via snapshotFlow sur LazyListState.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ScrollDepth.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/post/ImpressionBatcher.kt`

### Épingler la décoration d'un message-sticker à ma palette depuis le menu du message

`chat-sticker-favorite` · Android : **absente** · P2 · effort S

Pont entre `MessageSticker` (gabarit, slots, emoji de repli — ce qui a été envoyé) et `StickerUsageEntry` (kind, value — ce que la palette retient) avec une priorité : le gabarit passe avant l'emoji de repli (sinon une carte postale serait mémorisée comme « 📍 »). Alimente les verbes ajouter / favori / retirer / épingler la décoration.

Écarts :
- Android n'a aucun message-sticker (ni type dans `BubbleContent`, ni palette dans le composeur) : le préalable est tout le système de stickers.
- Pont gabarit → entrée de palette avec priorité gabarit > emoji, partagé par le menu du message, la bulle et le composeur.
- Verbes de menu « Ajouter à mes stickers », « Épingler la décoration », « Retirer la décoration » conditionnés par l'état de favori connu de l'hôte.

Rendu : Rien de propre : libellés issus du vocabulaire d'action.

Transposition Android : Pur calcul de modèle, portable tel quel en Kotlin.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageStickerFavorite.swift`

</details>

### Le lecteur choisit le fond de chaque conversation : modèle, couleur unie ou photo avec voile et flou, synchronisé entre ses appareils

`chatthread-background-reader-choice` · Android : **absente** · P2 · effort L

Le fond et l'accent personnels d'une conversation (ConversationAppearance : background signature \| design(pack, design) \| solid(color) \| photo(attachmentId, veil, blur), accent par clé de gamme, bascule animer) sont stockés sur les préférences du lecteur et synchronisés entre SES appareils (décodage tolérant par champ). Résolution pure : un fond ne se résout jamais en erreur, ce qui ne se lit pas retombe sur Signature sans spinner. Modèle = catalogue embarqué (premier rendu sans réseau) peint par AppearanceDesignView avec couche Lottie facultative (jouée si « Animer » et pas en économie d'énergie ; première image fixe sous « Réduire les animations ») ; couleur = surface de la gamme dans la teinte du schéma ; photo = pièce de la conversation (messages chargés, mémoire par appareil bornée, sinon route de téléchargement qui vérifie l'appartenance) avec voile jusqu'à 0,8 et flou jusqu'à 24, voile plancher 0,6 sous « Réduire la transparence ». Une panne passagère garde la dernière photo ; seule une pièce disparue ou refusée (404/403/410) ou chiffrée sans clé rend Signature, uniquement si c'est encore la photo du fond. Le choix arrive de trois sources (valeur de navigation, choix local, écho d'un autre appareil) via ConversationAppearanceChange, et l'accent personnel recolore les rôles accent du modèle.

Écarts :
- Aucun modèle ConversationAppearance côté Android : porter le miroir de packages/shared/types/conversation-appearance.ts (version, background, accent, animate) avec décodage tolérant par champ.
- Portage du catalogue AppearanceCatalog (packs/designs/gamme d'accents par schéma) et du peintre AppearanceDesignView, avec couche Lottie (dépendance lottie-compose) et tuiles en cache.
- Résolution ConversationBackgroundResolution (signature/design/solid/photo), voile effectif (plancher 0,6 sous réduction de transparence), accent effectif (personnel sinon calculé).
- Photo de fond : source de la pièce (messages chargés + mémoire par appareil bornée + route de téléchargement avec vérification d'appartenance), photo qui REMPLIT le cadre sans l'agrandir, verdict d'échec (garder la dernière photo sur panne passagère ; Signature sur 404/403/410 ou pièce chiffrée sans clé), libellé TalkBack par date « Photo du 3 mars ».
- Synchronisation multi-appareils : lire/écrire l'apparence dans les préférences de conversation et relayer l'écho socket vers l'écran ouvert (store mutualisé).
- Réglage « Animer » + mode économie d'énergie (PowerManager.isPowerSaveMode) en direct pendant la lecture ; sélecteur de fond côté réglages de conversation (autre part).

Rendu : Photo en scaledToFill clippée au cadre proposé (jamais plus grande que lui, sinon le fil se décale), voile = couche noire/neutre d'opacité veil (0 à 0,8 par pas de 0,05), flou 0-24 ; modèle peint sous le fil sans bloquer le geste ; transitions en fondu.

Transposition Android : AppearanceDesignView/Lottie -> lottie-compose ; UIAccessibility.reduceTransparency -> Settings.Global/AccessibilityManager (contraste) ; économie d'énergie -> PowerManager.isPowerSaveMode.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationBackgroundView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationBackgroundResolution.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationBackgroundPhotoVerdict.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyBackground.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyTheme.kt`

### Chaque conversation a son fond Signature selon son type, avec voiles de chiffrement et de drapeaux

`chatthread-background-signature-animated` · Android : **absente** · P2 · effort M

Fond par défaut d'une conversation, composé depuis son type : direct et bot = intimiste, groupe = dégradé de groupe avec avatars fixes et anneaux pulsés, communauté, public/global/channel/broadcast = globe avec satellites et ondes de signal. S'y ajoutent une surcouche chiffrement (si un mode de chiffrement est actif, E2EE inclus), une surcouche multilingue (drapeaux en orbite dès 3 langues principales), des particules flottantes et des vagues. Les couleurs viennent de la palette déterministe de la conversation (primary, secondary, accent ; fin de dégradé de groupe sur l'accent, fondu de 10 s). Par décision produit (batterie, trace 2026-06) animationsEnabled = false : le fond rend sa composition statique au repos (phase 0) ; le code d'animation reste prêt à être réarmé. « Réduire les animations » (système ou réglage in-app) empêche tout démarrage.

Écarts :
- Le fil de discussion utilise le fond global MeeshyBackground (3 orbes indigo) : créer un composable ConversationAnimatedBackground paramétré par type, chiffrement, nombre de membres, langues principales, accent/secondaire/fin de groupe et mode sombre.
- Implémenter les quatre compositions de base (intimiste, groupe, communauté, global) : anneaux pulsés, avatars fixes sans image distante, globe, satellites, onde de signal (forme Wave).
- Surcouches chiffrement (cadenas/ondes selon serveur vs E2EE) et multilingue (drapeaux de languageToFlag orbitant autour du centre, dès 3 langues).
- Particules flottantes et vagues ; interrupteur global désactivé par défaut (rendu statique), respect de la préférence Réduire les animations et du mode économie d'énergie.
- Calculer les langues principales de la conversation à partir des messages pour l'overlay multilingue.

Rendu : Fond plein cadre sous le fil, opacités faibles pour garder les bulles lisibles ; couleurs dérivées de DynamicColorGenerator (déjà présent côté Android) ; drapeaux emoji, anneaux 120-225 pt d'écart 35 pt, traits dégradés vert success/indigo400.

Transposition Android : SwiftUI Canvas/Shapes -> Compose Canvas ; animations repeatForever -> rememberInfiniteTransition (désactivé par défaut).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationAnimatedBackground.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationBackgroundComponents.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyBackground.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/ConversationAccent.kt`

### Ouvrir une image dans la galerie compte comme une vue pour son expéditeur

`chatthread-gallery-consumption-report` · Android : **absente** · P2 · effort S

Le chemin réel d'une image de message est la galerie de conversation (le chemin d'ImageViewerView est mort en pratique) : elle reporte maintenant « viewed » à l'apparition d'une page, après un seuil de 500 ms (un feuilletage rapide ne compte pas chaque vignette croisée), via POST /attachments/:id/status (messages-writes.ts ; viewCount, viewedAt) lu par l'onglet « Ouvert » (MessageViewsConsumption). Les galeries POST/COMMENTAIRE réemploient la vue mais leurs pièces ne vivent pas dans MessageAttachment côté serveur (404) : elles passent reportsAttachmentConsumption = false. La page quittée et la page entrée sont suivies par identité.

Écarts :
- Reporter l'état viewed (POST /attachments/{id}/status) quand une page de la galerie reste visible 500 ms ; ignorer les pages croisées en feuilletant.
- Drapeau reportsAttachmentConsumption pour les galeries sociales (post, commentaire) afin de ne pas appeler l'endpoint.
- Alimenter l'onglet « Ouvert/Vues » de la feuille Plus du message.

Rendu : Aucun visuel.

Transposition Android : Task.sleep -> delay dans un LaunchedEffect annulé au changement de page.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Consumption.swift`

</details>

### Une scène de publication s'ouvre comme une page de la galerie, avec sa légende traduisible

`chatthread-gallery-scene-page` · Android : **absente** · P2 · effort L

Directive 2026-09-15 : les scènes de post s'ouvrent dans LE même composant que les pièces de conversation (plus un second plein écran). Une page scène est propriétaire de ce qui ne concerne qu'elle : elle ne peint rien elle-même, MeeshyScenePlayer(mode: .reader) est le moteur unique (le même que la carte du fil en .card et le viewer de story) posé aux cotes de la loi de forme (GallerySceneStage, projection de SceneShape.layout), avec les trois portes du plateau (tap, appui long, glissement), un play/pause, un plancher. Sa légende a DEUX sources (propre au média de la scène, ou texte du post en repli) et chacune se traduit par SA route ; la rangée de traduction se pose entre légende et invite, et l'icône ouvre LA feuille de traduction des messages et audios. Montée avec .id(pièce) : la langue choisie appartient au contenu affiché. Le Prisme est servi au player (textes DANS la scène) et à la légende (même descente).

Écarts :
- Aucun player de scène partagé côté Android hors stories : exposer un composable Scene Player (mode reader/card) dans le SDK UI et le monter comme page de la galerie.
- Contexte de scène (GallerySceneContext : post, Prisme du player, Prisme de la légende) et loi de forme GallerySceneStage.
- Légende de scène à deux sources avec rangée de traduction et feuille de traduction (feed.post.translation.title/error).
- Play/pause et plancher de scène ; portes tap/appui long/glissement alignées sur les autres pages.

Rendu : Scène centrée à la forme de la loi (jamais ajustée comme une pièce jointe), légende traduisible sous voile du bas de l'écran, play/pause de scène centré.

Transposition Android : MeeshyScenePlayer -> composable partagé du module stories/sdk-ui ; SceneShape.layout -> loi de forme portée en Kotlin.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+SceneCaption.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlideDeck.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

### Partager la conversation publique d'un geste, et une barre dédiée au visiteur sans compte

`chatthread-header-share-guest` · Android : **absente** · P2 · effort S

Pour une conversation qui porte une adresse publique (<origine web>/chat/<lien>) — le visiteur est entré par un lien, ou la conversation est World Wide dont GET /world sert le lien (reconnue à l'identifiant servi, jamais écrit en dur) — un bouton « Partager » de 28 pt en verre apparaît à côté de l'avatar et ouvre le partage natif. Ailleurs : aucun bouton. Le visiteur anonyme voit une barre d'en-tête dédiée (titre avec emoji favori, bouton partager, avatar non interactif, bouton fermer) ; le fil ne lui offre pas les portes qui répondent 403 ACCOUNT_REQUIRED (qui a vu, liste des participants, fiches). L'entrée World Wide est lue une fois par lancement.

Écarts :
- Résoudre l'adresse publique d'une conversation (lien d'invité ou GET /world pour une conversation global) et afficher le bouton Partager à côté de l'avatar (libellé conversation.header.share) via Intent.ACTION_SEND.
- Mémoriser l'entrée World Wide une fois par lancement (pas de requête à chaque ouverture).
- Barre d'en-tête invité : titre + emoji favori, partager, avatar non interactif masqué à TalkBack, bouton fermer 28 dp (conversation.view.close).
- GuestViewerAccess : masquer les entrées qui mènent à 403 ACCOUNT_REQUIRED (statut de lecture, participants, fiches) pour un invité sans compte.

Rendu : Bouton Partager : cercle de verre 28 pt, glyphe share, même gabarit que le bouton d'appel voisin ; barre invité dans un bloc de verre flottant (rayon xxl-2), marges lg/xs.

Transposition Android : UIActivityViewController dans une sheet -> Intent.createChooser(ACTION_SEND).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationGuestHeaderBar.swift`

</details>

Android existant : `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/ShareLinkEntryScreen.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/GuestJoinViewModel.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileShare.kt`

### Une flamme sous l'avatar montre la série du jour et s'allume à chaque message envoyé

`chatthread-header-streak-flame` · Android : **absente** · P2 · effort M

Quand une série court dans la conversation (streakDays > 0) et que le lecteur ne l'a pas masquée, une flamme dégradée jaune-orange-rouge apparaît juste sous l'avatar de l'en-tête replié avec le compte du jour en chiffres rouges cerclés de blanc. Au gain d'un point, une lueur part de sous l'avatar, fait le tour du cercle et revient s'éteindre dans la flamme, qui s'allume (échelle 1,6, vacillement, trois mèches) avant que le compte monte (défilement numérique). Toucher la flamme la masque (mémoire par conversation sur l'appareil) ; déplier l'en-tête la ramène. L'instantané « 🔥 3 · N (M) » vient de GET /api/v1/conversations/:id/engagement, poussé par le socket engagement:conversation-updated, projeté sur le jour affiché (forDay). Il apparaît aussi comme pastille sous le titre déplié.

Écarts :
- Modèle ConversationEngagementSnapshot (conversationId, totalPoints, todayPoints, streakDays, day) avec projection forDay(today) : points du jour à 0 si le dernier geste n'est pas aujourd'hui, série à 0 au-delà d'hier.
- Endpoint GET conversations/{id}/engagement (Retrofit) et abonnement socket engagement:conversation-updated avec cache et revalidation à l'ouverture.
- Mémoire par conversation de l'en-tête déplié et de la flamme masquée (DataStore).
- Loi d'affichage : flamme visible seulement en-tête replié, non masquée et série en cours ; le masquage tombe au dépliement.
- Rendu de la flamme (dégradé vertical jaune/warning/error), chiffres rouges avec contour blanc 1 dp (12 décalages de 30°), défilement numérique, effet d'orbite de 2 s (part de lueur 0,45, embrasement jusqu'à 0,8, libération du compte à 0,82, trois mèches) en transformations et opacité uniquement ; rejoué à chaque envoi qui incrémente le compte.
- Pastille d'engagement dans la rangée d'étiquettes du titre déplié ; respect de « réduire les animations ».

Rendu : Flamme taille xs, positionnée sous le cercle d'avatar sans le toucher, ne quitte jamais sa place pendant l'effet ; compte en police ronde heavy micro monospacedDigit ; animations uniquement transform/opacity (aucune mise en page).

Transposition Android : Animatable/Animated sur graphicsLayer ; chiffres cerclés -> Text avec drawStyle Stroke + Fill.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationHeaderFlame.swift`

</details>

### « Imager » un message crée une carte image partageable de ce que le lecteur lit

`chatthread-message-export-image` · Android : **absente** · P2 · effort M

Ouvre l'atelier « Imagine » sur le message tel que le lecteur le lit — traduction servie par le Prisme ou original, ses médias, plus ceux du message cité quand il est en mémoire (#8901) ; un vocal part dans la piste que la bulle fait entendre (#8979). Le mode rapide (quick) applique le format par défaut et enregistre dès que la carte est peinte. Annonce d'échec localisée (export.announce.failed).

Écarts :
- Entrée « Imager » dans les menus de message et la feuille Plus.
- Composer la carte depuis le texte servi par le Prisme (traduction préférée ou original), les médias du message et ceux du message cité, la piste audio entendue ; mode rapide avec format par défaut et enregistrement automatique.
- Atelier de rendu « Imagine » (autre domaine) et annonce d'échec localisée.

Rendu : Carte stylée selon le design de l'atelier ; sortie PNG partageable.

Transposition Android : ImageRenderer SwiftUI -> Compose Canvas -> Bitmap + MediaStore ; partage -> ACTION_SEND image.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageExport.swift`

</details>

### Toucher une image ou vidéo en attente l'ouvre dans la retouche de la caméra, sans rien perdre

`chatthread-pending-attachment-retouch` · Android : **absente** · P2 · effort L

Toucher une pièce en attente (#11133) ouvre la retouche de la caméra : mêmes outils, même chrome ; rien n'y oblige (une pièce non touchée part telle quelle). Chaque pièce retouchée est remplacée À SA PLACE, jamais une seconde tuile ni un ré-encodage superflu. La source de la scène est le FICHIER de la pièce (borné à 2 048 px, décodé sur une tâche détachée) — pas la vignette 1 024 px, qui faisait revenir l'image moins définie ; un GIF ne s'offre pas à la retouche (la scène le rendrait fixe). Écriture SÛRE : le nouveau fichier est écrit puis vérifié (présent, taille non nulle) AVANT de supprimer l'ancien ; sinon la pièce d'origine reste. Une prise retouchée reste une prise (#9775) ; une vidéo « bakée » remplace la pièce (#8443, #9124). Une prise ou un média récent se POSE via stageCapture/stageSceneMedia.

Écarts :
- Aucune retouche de pièce en attente dans le chat : tap sur la tuile => éditeur de scène (dessin, texte, stickers, filtres, rognage) hors ligne.
- Décodage borné à 2 048 px de la source (fichier de la pièce) hors thread principal ; GIF exclu de la retouche.
- Remplacement à sa place avec écriture sûre (écrire, vérifier, puis supprimer l'ancien) ; conserver l'état « prise dans l'app » ; vidéo bakée qui remplace la pièce.
- Poser une prise ou un média récent sur le plateau (stageCapture, stageSceneMedia).

Rendu : Éditeur plein écran avec chrome identique à la caméra ; retour sur le plateau avec la tuile mise à jour sans animation de remplacement visible.

Transposition Android : MeeshyImageEditorView/scène caméra -> éditeur Compose réutilisant StoryComposer ; ImageIO downsample -> BitmapFactory.inSampleSize / ImageDecoder.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationImageRetouche.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+SceneRetouch.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt`

### Deux lecteurs alternatifs de la conversation : la Rivière en couloirs et le Résumé

`chatthread-reading-mode-river-summary` · Android : **absente** · P2 · effort XL

Hôtes DÉDIÉS, additifs au fil (jamais bulle par bulle : ne font jamais avancer le curseur de lecture par le chemin habituel), qui rendent la main au fil (Script) par les mêmes retours. La Rivière (chantier iOS lot 1, 2026-08-21, drapeau riviere_mode) : géométrie issue de la loi partagée RiverLaneResolver, texte du Prisme (traduction préférée ou original), un avis système n'est la voix de personne (RiverConversationMapping) ; LARGE par nature (jusqu'à sept couloirs de 300 pt) : ne doit jamais élargir la scène, hôte dans un Color.clear.overlay + ScrollView, zIndex 80 (au-dessus du fil, composeur et bouton bas, sous l'en-tête 100), geste de retour bord désactivé dans ce mode. Le Résumé : hôte dédié dont l'identité bascule EXACTEMENT une fois vide -> peuplé pour que l'autoclosure du StateObject se réévalue avec les messages. L'aperçu de conversation et l'aperçu de message suivent le mode (Résumé et Rivière « Aller au message » = ReadingModeController.landing). #11224 : le menu d'un message s'ouvre par le même point d'entrée presentLongPressMenu.

Écarts :
- Aucun lecteur Rivière ni Résumé : porter le résolveur de couloirs (RiverLaneResolver), le mapping RiverConversationMapping, la vue horizontale défilante multi-couloirs et le Résumé (synthèse de la conversation) dans des composables hôtes dédiés.
- Intégration à l'écran : empilement zIndex, retour au Script, désactivation du geste de retour bord pendant la Rivière, identité stable du Résumé.
- Menu d'un message depuis la Rivière/le Résumé par le point d'entrée unique ; atterrissage « Aller au message » selon le mode.
- Drapeaux de fonctionnalité (isReadingModesEnabled, riviere_mode) et repli sur le fil.

Rendu : Rivière : couloirs de 300 dp côte à côte défilant horizontalement, un couloir par voix, fond du fil visible ; Résumé : cartes de synthèse en liste verticale.

Transposition Android : ScrollView horizontal + couloirs -> LazyRow/Layout personnalisé ; Résumé -> écran avec résumé serveur (ConversationAnalysis existe côté Android).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ReaderLayers.swift`

</details>

### Un chip de mode cycle entre Bulles et Script, et un menu liste tous les modes disponibles

`chatthread-reading-mode-switcher` · Android : **absente** · P2 · effort M

Le chip de mode de lecture (P2 spec Magnificence 17/08 : un SEUL chip, le bouton Aa et sa densité ont disparu) est inséré APRÈS la loupe et jamais avant le bouton d'appel (layoutPriority(1)). Tap = CYCLE des modes disponibles (loi pure ReadingModeCycle), appui long = menu natif listant tous les modes (la Rivière est TOUJOURS au catalogue, grisée avec sa vraie raison quand indisponible). Il n'écrit que par le contrôleur gelé (préférence collante, jamais d'état local dupliqué). Sous drapeau (isReadingModesEnabled) : drapeau OFF => la loi ne rend que .bubbles et le chip disparaît bit-à-bit. Les capacités se résolvent UNE fois à l'init (identité invité/inscrit, drapeau, type de conversation, nombre de membres actifs) et conditionnent l'éligibilité (Rivière jamais en direct). `.script` et `.focal` rendent la MÊME rangée plate uniforme (usesFlatRow), Focal ajoutant une perspective au défilement (retrait Focal iOS 2026-08-18, Script est le mode nominal). En rangée plate, le défilement escamote TOUT le chrome (en-tête, composeur, bouton bas) sauf recherche ouverte, emoji ouvert ou mentions affichées.

Écarts :
- Aucun mode de lecture côté Android (bulles uniquement) : porter ReadingModeOrchestrator (capacités, cycle, atterrissage), le contrôleur de préférence collante par conversation et le drapeau de fonctionnalité.
- Chip dans la grappe d'actions (tap = cycle, appui long = menu de tous les modes avec raison d'indisponibilité).
- Rangée plate Script (identité en tête de groupe, métadonnées alignées) et loi usesFlatRow ; masquage du chrome pendant le défilement avec exceptions (recherche, emoji, mentions).
- Éligibilité par type de conversation (direct/groupe/public/global/broadcast), identité et effectif.

Rendu : Chip de verre circulaire avec glyphe du mode courant ; menu avec une ligne par mode et icône ; rangée plate : avatar 22 + nom, texte pleine largeur sans capsule.

Transposition Android : menu natif iOS -> DropdownMenu ; préférences -> DataStore.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationReadingMode+UsesFlatRow.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ReadingModeChip.swift`

</details>

### Envoyer un sticker emoji, gabarit, lieu décoré, Mee, Instant, bibliothèque ou pack, qui s'affiche comme image partout

`chatthread-stickers` · Android : **absente** · P2 · effort L

Chaque choix de la feuille unique devient un message par le chemin d'envoi de sa famille : emoji rasterisé centré dans un carré transparent + MessageSticker.emoji ; gabarit rendu en PNG + MessageSticker.template (un gabarit que le binaire ne dessine pas part comme son emoji de repli, identique à ce que verrait un lecteur ancien) ; lieu décoré (gabarit de la famille location rempli depuis le lieu, le sticker EST le message, pas un partage de position) ; Mee/Meo (première image du film en PNG + templateId mee.<id>, rejoué animé sur web et iOS) ; Instant (première image avec le texte saisi + emplacements) ; sticker de bibliothèque (favori entre dans la rangée rapide #10842) ; sticker de pack (image de repli + descripteur pack.<slug>.<clé>, octets du cache d'images, un cinématique part avec son fichier d'origine #9210). Le transport est une pièce jointe image ORDINAIRE (seule que voit un lecteur qui ne sait pas dessiner un gabarit) + descripteur MessageSticker. Hors-ligne : mise en file d'attente (enqueueStickerOffline). Le rendu en image est pur et testé.

Écarts :
- Aucune porte sticker dans le chat Android (StickerCatalog n'existe que pour les stories) : feuille unique ENVOYER avec onglets emoji, gabarits, lieu, Mee/Meo, Instants, bibliothèque, packs.
- Rasterisation pure d'un sticker (emoji centré dans un carré transparent, gabarit rendu en PNG) + champ MessageSticker (emoji, template, templateId mee.<id>/pack.<slug>.<clé>) dans la requête d'envoi.
- Repli des gabarits inconnus sur leur emoji ; sticker cinématique envoyé avec son fichier d'origine ; sticker de pack depuis le cache d'images.
- Mise en file hors-ligne d'un sticker (outbox) et rangée rapide des favoris.
- Rendu côté bulle d'un sticker redessiné en vectoriel/animé quand le client sait le faire (autre part).

Rendu : Feuille avec grille de stickers, aperçu animé des Mee, rangée rapide des favoris au-dessus du composeur.

Transposition Android : UIImage rasterizer -> Bitmap/Canvas ; Lottie des Mee -> lottie-compose ; PNG de repli -> Bitmap.compress.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationStickerRendering.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+Sticker.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+StickerSheet.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StickerCatalog.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryStickerElement.kt`

### Envoyer un vocal sans consentement propose la traduction automatique avec ma voix

`chatthread-voice-consent-alert` · Android : **absente** · P2 · effort S

Quand un audio est envoyé sans consentement de profil vocal validé, une alerte propose d'activer la traduction automatique (conversation.voiceConsent.title/message). « Accepter » accorde le consentement de définition du profil vocal ET la traduction utilisant ce profil, puis relance l'envoi ; « Plus tard » envoie tel quel (le composeur n'a pas encore été vidé quand l'alerte interrompt l'envoi). Un avis de consentement manquant reste cliquable sur la bulle audio de l'expéditeur.

Écarts :
- Détecter l'absence de consentement vocal avant l'envoi d'un audio et interrompre l'envoi avec une alerte Accepter / Plus tard.
- Accepter : accorder consentement de définition du profil + traduction avec profil vocal (VoiceConsentRequest existe côté modèle), puis relancer l'envoi.
- Avis « consentement manquant » cliquable sur la bulle audio sortante (shouldShowConsentNotice).

Rendu : Alerte système à deux boutons, texte explicatif court.

Transposition Android : alert SwiftUI -> AlertDialog Compose.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+Presentations.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/VoiceProfile.kt`

### Le badge tombe aussitôt et le serveur n'apprend que ce qui a réellement été vu

`chat-read-exactness-receipts` · Android : **divergente** · P0 · effort M

Point d'entrée UNIQUE de la lecture locale (`ConversationReadSignal`) : cache + frontière `lastReadAt`, store RAM et badge d'icône + widget bougent ensemble, sans réseau. L'accusé serveur (par l'outbox, rejoué hors ligne) n'annonce `caughtUpToMessageId` que si la fenêtre est au sommet et que le message le plus récent a été vu, est à l'écran ou a déjà été rattrapé (loi `ConversationCatchUpLaw`, mémoïsée) ; la sortie du Résumé rattrape. Un observateur `.conversationMarkedRead` évite les fuites et les compteurs de livraison ne se relèvent que si le statut frais est strictement meilleur.

Écarts :
- Android appelle `markReadOptimistic` pour toute la conversation dès l'ouverture (`POST mark-as-read`, outbox READ_RECEIPT) : un message jamais affiché est déclaré lu ; remplacer par la preuve d'affichage (éléments visibles de la LazyColumn avec délai de présence ~300 ms).
- Loi `ConversationCatchUpLaw.caughtUpId` (newestServerId, windowIsAtTip, seen, visible, memoized) et `exitCatchesUp` pour le mode Résumé ; `mark-as-read` avec `messageIds` / `caughtUpToMessageId` / langues consommées.
- Point d'entrée unique de lecture locale touchant les trois surfaces (cache + frontière, store RAM de la liste, badge d'icône + widget) : à ce jour la pastille peut revenir après un rechargement du cache.
- Accusé de réception (`POST mark-as-received`) absent ; compteurs de livraison relevés seulement si le statut frais est strictement meilleur (`DeliveryCounterReconciliation`).
- Aucune barrière client sur `showReadReceipts` (le serveur en a besoin pour avancer le curseur et alimenter `conversation:unread-updated`).

Rendu : Séparateur « nouveaux messages » inchangé ; la pastille de la liste tombe dans le tour de boucle du geste.

Transposition Android : Badge d'icône → ShortcutBadger / compteur de notifications + widget Glance ; NotificationCenter → SharedFlow interne.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ConversationReadSignal.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationCatchUpLaw.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationReadReceiptSender.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationMarkedReadObserver.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+ReadReceipt.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/DeliveryCounterReconciliation.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/DeliveryStatusResolver.kt`

### Un vocal se lit dans la bulle : téléchargement à la demande, pistes traduites, transcription et plein écran avec file d'écoute

`chatthread-audio-media-view` · Android : **divergente** · P0 · effort L

AudioMediaView est le widget audio de la bulle : tant que le fichier n'est pas en cache il montre un bouton de téléchargement et un libellé de taille (avec progression « 410 KB / 850 KB ») ; la disponibilité est lue SYNCHRONE sur le disque au premier rendu (#7660) pour éviter le redimensionnement animé (89 -> 79 pt) à chaque réalisation de la rangée. Lecture via le lecteur commun (play route par ConversationViewModel.playAudio), pistes traduites sélectionnables par drapeau (la langue tapée voyage au canal du message : piste jouée, texte et drapeau suivent d'un même mouvement ; langue d'origine = V.O. explicite), transcription avec révélation automatique pour ses propres messages et, pour un message reçu, selon la préférence audio.autoTranscribeIncoming, choix de départ du Prisme (systemLanguage > regionalLanguage > customDestination > deviceLocale), légende du message intégrée DANS le widget (pattern MIMI), citation hébergée au-dessus de la ligne lecteur (zones avatar/média cités), avis de consentement vocal pour l'auteur, pied de bulle unifié avec drapeaux, tenue .card ou plate. Plein écran du son (ou ouvreur de conversation #10383 qui sait réagir/répondre/créer) avec file d'écoute des vocaux non écoutés qui suivent (queueTailProvider) et carte Now Playing portant la CONVERSATION. Partage de fichier par feuille (ShareSheet).

Écarts :
- AudioBubble Android est une ligne compacte dont le clic fait openUri (app externe) : intégrer un lecteur dans la bulle (Media3) avec play/pause, barre de progression, vitesse, forme d'onde.
- Téléchargement à la demande avec progression et disponibilité résolue de façon synchrone depuis le cache disque (aucun saut de hauteur), politiques d'auto-téléchargement par réseau (NetworkConditionMonitor existe).
- Pistes audio traduites par langue (translatedAudios), sélection par drapeau partagée avec le texte du message, demande de traduction audio à la demande.
- Transcription avec segments, révélation selon audio.autoTranscribeIncoming (propres messages toujours révélés), choix de langue de départ selon le Prisme.
- Légende intégrée dans le widget, citation hébergée dans le lecteur, avis de consentement vocal, pied de bulle unifié.
- Plein écran audio avec file d'écoute des vocaux non écoutés suivants et notification multimédia (MediaSession) portant le nom de la conversation ; ouvreur plein écran de conversation (réagir, répondre, créer).
- Partage de fichier audio via ACTION_SEND (FileProvider).

Rendu : Carte lecteur arrondie dans le fond de bulle (tenue .card) ou ligne plate en script ; bouton play 40 dp, libellé de taille 10 pt sous le bouton uniquement si téléchargement requis, drapeaux de langue en rangée, transcription repliable.

Transposition Android : ShareSheet (UIActivityViewController) -> Intent.createChooser(ACTION_SEND) avec FileProvider ; Now Playing -> MediaSession + notification média ; AVAudioSession -> AudioFocus.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaPreview.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaTransport.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`

### Ouvrir un média plein écran et feuilleter toute la conversation : pincer, déplacer, glisser pour fermer, réessayer en cas d'échec

`chatthread-gallery-pager-zoom` · Android : **divergente** · P0 · effort M

La galerie de conversation feuillette TOUS les médias visuels (image, vidéo) de la conversation, ouverte au tap d'une bulle, en pager paresseux dont chaque page est PROPRIÉTAIRE de sa transformation (zoom/pan en état local : un pincement n'invalide jamais la racine ni les autres pages), id->index construit une fois (O(1)), fenêtre de rendu bornée de part et d'autre de la page courante (les images lointaines se libèrent), préchauffage de la variante affichée dans le NSCache au tap et pour les voisines (jamais le réseau pour une vidéo). Gestes : pincement (MagnificationGesture), déplacement quand zoomé (priorité haute à 1 pt), double tap = bascule du zoom, tap = entrer dans le plein cadre (immersion), appui long 0,4 s = ouvrir le menu, glisser vertical (30 pt) = fermer ou ouvrir le plein cadre selon la porte. La source s'étend sans perdre la page : les pièces des messages jamais chargés arrivent de l'index persisté puis des pages view=media, AVANT la page courante ; la page se suit par IDENTITÉ (currentPageID) et est réaffirmée après la mise en page. Un média introuvable (404/410/403 purgé, expiré, refusé) a un état dessiné : pictogramme + phrase + « Réessayer » qui rejoue la requête (gallery.media.unavailable).

Écarts :
- Le viewer Android ne montre que des IMAGES : ajouter les pages vidéo (et scène) au même pager.
- Le tap ferme la visionneuse sur Android ; sur iOS il entre dans le plein cadre (immersion) et c'est le glissement vertical (ou le bouton) qui ferme : ajouter glisser pour fermer et l'ordre de portes tap / appui long / glissement.
- Appui long 0,4 s ouvrant le menu ⋯ et gestes armés selon (page active, transformée).
- Source qui s'étend : intégrer l'index persisté puis les pages GET conversations/{id}/messages?view=media avant la page courante, en suivant la page par identité.
- État d'échec dessiné avec « Réessayer » (404/410/403, gallery.media.unavailable) au lieu d'un indicateur sans fin sur fond noir.
- Fenêtre de rendu bornée (libérer les pages lointaines), préchauffage de la variante affichée, état de zoom propriétaire de chaque page (éviter de recomposer la racine).
- Consommation signalée à l'ouverture (voir chatthread-gallery-consumption-report) et libellé TalkBack de position (gallery.position).

Rendu : Fond noir plein écran, pages image en aspect fit avec ThumbHash flou sous le plein format, transitions de page natives, zoom jusqu'à ~4x avec rebond, fermeture par glissement avec fondu du fond.

Transposition Android : MagnificationGesture/DragGesture -> detectTransformGestures + draggable ; NSCache -> Coil memory cache ; pager LazyHStack -> HorizontalPager.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Pages.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Rules.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+SourceGrowth.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+LoadFailure.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerPrefetch.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerTransform.kt`

### Chaque compte retrouve sa propre base locale de messages, sans jamais lire celle d'un autre

`chat-per-account-message-store` · Android : **divergente** · P1 · effort M

Sur iOS, un fichier GRDB par compte (utilisateur + environnement serveur) porte la timeline, l'outbox, le fil social et l'index de recherche. `MessageStoreRouter.activate` bascule de façon SYNCHRONE ; une session quittée par un compte gardé sur l'appareil reste ouverte (il retrouve sa base telle qu'il l'a laissée et ne resynchronise que l'écart) ; une session quittée par un compte déconnecté est purgée puis son fichier est retiré, si bien qu'un acteur en vol écrit dans un inode orphelin. Chaque `MessageStoreSession` porte ses propres acteurs d'écriture (messages, fil social), donc l'étanchéité ne dépend pas de l'ordre des tâches. Le store unique historique est adopté et les bases dormantes sont balayées.

Écarts :
- Une seule base Room `meeshy.db` pour tous les comptes : la déconnexion ou le changement de compte fait `clearAllTables()` au lieu de conserver une base par compte (clé = userId + environnement `ServerEnvironmentStore`), donc un compte qui revient repart d'un cache vide.
- Créer un routeur de bases (`MessageStoreRouter`) : map clé→MeeshyDatabase protégée par verrou, `activate(key, keepingOutgoing)` synchrone, `session(ownedBy)`, `dropSessions(keeping)`, `retire(session)` ; les DAO (aujourd'hui des singletons Hilt injectés depuis une base unique) doivent être résolus à travers le routeur.
- Écritures attribuées à un compte : un worker WorkManager / flush d'outbox en vol doit écrire dans la base de SON compte, et rien si ce compte n'est plus actif.
- Déconnexion d'un compte non gardé : purge puis suppression du fichier .db (+ -wal / -shm) ; balayage des bases dormantes au démarrage ; adoption du fichier legacy `meeshy.db` à la première migration.
- `fallbackToDestructiveMigration()` détruit le cache à chaque changement de schéma : incompatible avec « retrouver sa base telle que laissée » ; prévoir de vraies migrations ou une reconstruction cache-first sans flash vide.

Rendu : Aucune surface visible. Critère : un changement de compte repeint la liste et le fil depuis le cache du compte entrant, sans état vide et sans aucun message de l'ancien compte.

Transposition Android : DatabasePool GRDB par compte → une base Room par fichier `meeshy-<userId>-<env>.db` ; NSLock → synchronized / Mutex ; retrait du fichier → `Context.deleteDatabase()`.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Core/MessageStoreRouter.swift`
- `apps/ios/Meeshy/Core/MessageStoreSession.swift`

</details>

Android existant : `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/DatabaseModule.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/MeeshyDatabase.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/SavedAccountsStore.kt`

### L'en-tête de conversation flotte en verre : retour avec pastille de non-lus, titre et étiquettes dépliables, actions qui s'effacent au défilement

`chatthread-header-glass-band` · Android : **divergente** · P1 · effort M

Bande superposée au fil, à deux états mémorisés par conversation sur l'appareil (en-tête déplié, flamme masquée). Replié : bouton retour en verre (chevron dans un créneau fixe de 40 pt + pastille rouge du total de non-lus des AUTRES conversations, plafonnée à 99+, séparateur vertical teinté de l'accent), avatar, grappe d'actions (appel, recherche, puce de mode de lecture) qui s'efface pendant le défilement. Déplié : bloc de verre arrondi flottant avec titre (tap = détails, appui long en direct = détails ou profil), rangée défilable catégorie + étiquettes colorées + pastille d'engagement, aucun bouton d'action. La zone libre de la bande bascule replier/déplier. Trois formes de verre : aucune, bloc flottant, bande bord à bord (aperçu, sans retour, avec porte « ouvrir la conversation complète »). La frappe d'un pair remplace la bande par une barre compacte retour + avatar ; un visiteur anonyme a sa propre barre. La hauteur mesurée de la bande (Dynamic Type) réserve le haut du fil. Titre, avatar et libellé lisent la conversation VIVANTE : renommage, réglages enregistrés, pair mis à jour par user:updated.

Écarts :
- Remplacer la TopAppBar Material par une bande superposée au fil (le fil passe dessous) avec fond verre arrondi, et non une barre opaque qui pousse le contenu.
- Deux états repliée/dépliée avec mémoire par conversation (DataStore : ensemble d'ids dépliés et d'ids dont la flamme est masquée), ressort 0.35/0.8 et transition d'échelle ancrée à droite.
- Bouton retour en verre avec pastille de non-lus des autres conversations (somme hors conversation courante, 99+, libellé a11y a11y.back.with_unread).
- Titre dépliable avec rangée catégorie + étiquettes colorées + pastille d'engagement ; tap = détails, appui long (direct) = détails ou profil.
- Retirer de l'en-tête les icônes que iOS range ailleurs (statistiques, analyse, membres, lien de partage, réglages) : elles passent par la fiche de conversation ; garder appel, recherche, mode.
- Effacer la grappe d'actions pendant le défilement (loi ScrollMotion) et l'en-tête ENTIER en rangée plate ; barre compacte retour + avatar pendant qu'un pair écrit ; barre invité anonyme.
- Forme de verre bord à bord pour l'aperçu et porte « ouvrir la conversation complète » ; hauteur de bande mesurée qui réserve le haut du fil (taille de police système).
- Rafraîchir titre et avatar depuis la conversation vivante (override serveur après enregistrement des réglages, événement user:updated du pair).

Rendu : Bloc flottant : rayon xxl-2 (~22), marges extérieures sm, intérieures sm±2, bord dégradé accent 0.4 -> secondary (léger), ombre teintée accent rayon 8 y 2. Bouton retour : capsule de verre, pastille rouge MeeshyColors.unreadBadgeBackground, cibles 44 dp. Titre en police ronde semi-grasse 17, étiquettes en puces arrondies teintées. Animations ressort 0.3-0.35 / amortissement 0.8, retour haptique léger sur chaque bascule.

Transposition Android : adaptiveGlass / Liquid Glass -> surface translucide + Modifier.blur (API 31+) avec repli couleur unie 85 % ; HapticFeedback.light -> LocalHapticFeedback ; Dynamic Type -> sp et fontScale.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationExpandedHeaderBand.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationHelperViews.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+HeaderControls.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyTopBar.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/CollapsibleHeader.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/ScrollMotionVisibility.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyGlassSurface.kt`

### Une pastille de verre ramène au dernier message et montre non-lus, aperçu, frappe et hors-ligne

`chatthread-scroll-to-bottom-pill` · Android : **divergente** · P1 · effort M

Contrôle unique de retour au présent (la capsule « Messages récents » a été retirée, directive 2026-09-26). Repos : cercle de verre 44x44 avec chevron. Contenu riche : capsule qui bascule (fondu entre deux formes) selon l'ordre de force — recherche de citation (loupe pulsante, « Recherche… », insensible aux taps), page plus récente en vol (« Chargement… » + trois points, après 200 ms), non-lus (badge de compte, aperçu du dernier non-lu avec nom de l'expéditeur en groupe seulement, vignette ThumbHash/URL ou glyphe de type de pièce, détail média « 0:34 · 410 KB » / « 1280×720 · 2.3 MB », notice d'appel avec glyphe et teinte, bouton lecture d'un vocal non lu avec état de lecture), frappe (jusqu'à trois visages dédupliqués, noms sans suffixe « écrit » : un nom, « A, B » ou « A +N », points animés), hors-ligne (wifi.slash + « Hors ligne », teinte neutral500). Teinte accent à 0,85 avec encre lisible choisie au point d'égalité de contraste WCAG ; ne suit PAS le repli du défilement, seulement la proximité du bas. Ancre verticale figée pendant la rédaction. Demander le bas déclare le regarder : l'accusé de lecture part.

Écarts :
- Remplacer le FAB flèche + pastilles séparées par une pastille unique qui bascule cercle <-> capsule (contenu choisi par ordre de force : recherche, chargement, non-lus, hors-ligne, repos).
- États « Recherche… » (loupe pulsante, insensible aux taps) et « Chargement… » (retardé de 200 ms, trois points) absents.
- Aperçu du dernier non-lu : vignette (ThumbHash ou URL), détail média formaté, glyphe de type, notice d'appel teintée, nom de l'expéditeur seulement en groupe ; bouton lecture d'un vocal non lu piloté par le coordinateur audio.
- Pile de visages de frappe (3 maximum, dédupliqués, libellé « A +N ») au lieu d'une pastille texte.
- Teinte accent à 0,85 avec encre lisible WCAG (blanc ou noir) — Android force le blanc ; pastille hors-ligne neutre.
- Accusé de lecture à la demande du bas ; ancre figée pendant la frappe ; badge 99+ ; libellé TalkBack composé (frappe, non-lus).

Rendu : Cercle 44 dp (cible HIG), capsule horizontale pad lg/smPlus, largeur max 260 (aperçu) / 180 (chargement), police subhead semibold, points 4 dp pulsant 0.6 s décalés de 0.15 s, teinte neutral500 0.9 hors-ligne.

Transposition Android : adaptiveGlass(in:tint:) -> surface translucide teintée ; morph Circle/Capsule -> AnimatedContent avec shape crossfade ; SF Symbols -> Material Icons.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ScrollIndicators.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ScrollAffordance.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/RejoinPillPolicy.kt`

### Ouvrir un fil instantanément depuis le cache, sans spinner, puis revalider en silence

`chat-cache-first-thread-load` · Android : **partielle** · P0 · effort M

Le ViewModel central lit d'abord le cache (`ConversationCacheReader` : ligne de liste + fil, `.fresh` et `.stale` servent, `.expired` / `.empty` ne rendent rien), peint les messages avec leurs transcriptions dans la même tranche atomique (sinon des bulles audio sortent sans karaoké), puis revalide par REST, pagine vers l'arrière (`ConversationHistoryLoader`) et rattrape l'absence. Les collaborateurs injectés sont regroupés en un seul agrégat. Il porte aussi les états de chargement initial / ancien / récent / revalidation et l'identité de la conversation pour le mini-lecteur.

Écarts :
- Le cache-first Room, la pagination vers l'arrière, le squelette sur cache vide, l'ETag conditionnel et le verrou de la frontière « non lus » existent et sont plus avancés qu'iOS sur l'ETag.
- Manque : fenêtre bidirectionnelle (`hasNewerMessages`, `isLoadingNewer`, mode fenêtre sautée) et indicateur `isRevalidating`.
- Requêtes de listage sans les paramètres du Prisme : `includeReplies`, `includeTranslations`, `languages` (langues du lecteur) absents de `MessageApi.list` ; le serveur ne sert donc pas les traductions utiles à l'ouverture.
- État `accessRevoked` (écran d'accès retiré), `isConversationClosed`, `otherConversationsUnread` (pastille d'autres non lus), `lastUnreadMessage`, `unreadSeparatorCount`.
- Identité de la conversation exposée au mini-lecteur (nom, avatar, couleur) et conditions de pause quand l'écran n'est pas visible.

Rendu : Aucun spinner sur cache non vide ; squelette uniquement au démarrage à froid ; défilement d'ouverture sur la première bulle non lue.

Transposition Android : GRDB ValueObservation → Room Flow ; CacheResult .fresh/.stale/.expired/.empty → CacheResult SDK (déjà présent).

<details><summary>Sources iOS (7)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+Lifecycle.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+InitialLoad.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationStateStore.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationCacheReader.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationHistoryLoader.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationCollaborators.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/cache/cacheFirstFlow.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatListItems.kt`

### Le fil se met à jour en direct : messages, éditions, suppressions, expirations, épingles, réactions, traductions, transcriptions, consommation, pièces, présence, localisation

`chat-realtime-event-handler` · Android : **partielle** · P0 · effort M

`ConversationSocketHandler` s'abonne à l'ensemble des événements d'une conversation et les rejoue dans une file ORDONNÉE (`OrderedEventLane`) : un enrichissement reçu juste après son `message:new` s'applique après lui. `ConversationIncomingMessageReconciler` réconcilie un `message:new` entrant avec l'écho d'une ligne optimiste, un doublon, l'écho d'un autre appareil ou un message tiers ; le delegate pousse rôle d'un participant, accès révoqué et enrichissement d'une pièce (transcription / pistes traduites) injecté en une tranche puis écrit dans GRDB. La frappe a des minuteurs de sécurité plafonnés (1 000 entrées).

Écarts :
- Événements écoutés par iOS et ignorés par Android : `message:countdown-started`, `message:hidden-for-me` / `message:restored-for-me`, `message:consumed`, `message:pending-delivered`, `message:starred`, `message:translation-shared`, `message:view-once-purged`, `attachment:reaction-added/removed`, `attachment-status:updated`, `audio:translations-progressive` / `-completed` (déclarés dans SocketEvents.kt mais pas écoutés), `audio:transcription-failed`, `audio:translation-failed`, `translation:failed`, `conversation:join-error`, `participant:rights-updated`, `conversation:participant-joined/unbanned`.
- Android réagit à `message:edited` / `deleted` / `expired` / `pinned` par un `refresh` réseau complet de la conversation, là où iOS applique localement le delta ; passer à des mises à jour locales ciblées (Room) pour éviter les allers-retours.
- File d'événements ordonnée (une voie par conversation) garantissant qu'un enrichissement n'est jamais appliqué avant son `message:new`.
- Réconciliateur de message entrant : écho d'une ligne optimiste (rekey), doublon, écho d'un autre appareil ; table de déduplication.
- Enrichissement de pièce injecté en une tranche atomique puis écrit en base pour que la réouverture serve le cache (pas de « pop »).
- Présence : minuteurs de sécurité de la frappe (cap 1 000), effacement du roster à la reconnexion ; accès révoqué (`accessRevoked`) → écran dédié ; conversation fermée (`isConversationClosed`).

Rendu : Effet visible : aucune bulle ne saute ni ne se duplique à la réconciliation, les réactions et traductions apparaissent sans rechargement.

Transposition Android : Combine PassthroughSubject → SharedFlow ; OrderedEventLane → Channel/actor par conversation.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler+MediaEvents.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationIncomingMessageReconciler.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketDelegate.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+SocketDelegate.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SocketEvents.kt`

### Retrouver les messages manqués pendant une coupure, sans requêtes dupliquées

`chat-reconnect-catch-up` · Android : **partielle** · P0 · effort S

À chaque reprise de socket ou retour au premier plan, la conversation rattrape son retard par UN seul `listAfter` : le rattrapage en vol est rejoint tant qu'il couvre le même curseur (un curseur plus ancien repart seul pour ne pas perdre le trou), et un écran quitté par navigation ne rattrape plus (arrive / départ). Mesuré en production : 19 requêtes identiques par reprise avant ce garde.

Écarts :
- Le rattrapage `after` (#5206) n'est déclenché que par `refresh` à l'ouverture ; aucun déclencheur à la reconnexion du socket ni au retour au premier plan de l'app, donc un message manqué pendant une coupure n'apparaît qu'à la prochaine ouverture.
- Garde de rattrapage par conversation : un seul appel en vol, jonction des appels couverts, arrive / départ du lecteur, fenêtre de coalescence ~2 s sur les déclencheurs.
- Déclencheurs : `didReconnect` du SocketManager et ON_START du process ; abonnements retirés quand le ViewModel est libéré.
- Gérer `conversation:join` / `conversation:join-error` (accès révoqué → écran dédié) : Android n'émet jamais de join explicite.

Rendu : Silencieux ; la pastille de synchronisation indique « synchro » pendant le rattrapage.

Transposition Android : didReconnect / retour au premier plan → collecte de l'état de connexion du SocketManager + ProcessLifecycleOwner.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ConversationCatchUpGate.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageCacheSource.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/MessageApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/SocketManager.kt`

### La couche REST des messages sait lister autour d'un message, par genre de média, consommer, masquer et rechercher avec curseur

`chat-sdk-message-rest` · Android : **partielle** · P0 · effort M

`MessageService` offre `list`, `listBefore`, `listAfter(Date)`, `listAround(id)` (tous avec `includeReplies`, `includeTranslations`, `languages` du lecteur), `listMedia(kinds, query, before)`, `send`, `edit`, `delete(reason)`, `hideForMe(ids)`, `pin` / `unpin`, `consumeViewOnce`, `consumeAfterRead(messageIds)` et la recherche (avec curseur). La réponse porte `cursorPagination`, `hasNewer` et le motif des refus.

Écarts :
- `MessageApi` ne connaît que list (offset / limit / before), listConditional (ETag), listAfter, send, edit, delete, search, pin, unpin.
- Manquent : `listAround(around=<id>)`, `listBefore` avec langues, paramètres `includeReplies` / `includeTranslations` / `languages` (Prisme du lecteur), `replyToId` (fil), `listMedia(kinds, q, before)`.
- Manquent : `consumeViewOnce`, `consumeAfterRead`, `hideForMe` (un ou plusieurs ids), suppression avec `reason` (modération), recherche avec curseur serveur (`searchWithCursor`), réponse avec `hasNewer`.
- `delete` Android cible `messages/{id}` sans motif ; iOS passe conversationId + messageId + reason.
- Version « avec langues » des appels pour que le serveur serve directement la traduction utile au lecteur.

Rendu : Aucune surface propre ; condition d'existence du saut vers un message, de l'écran Médias et de la vue unique.

Transposition Android : Interface Retrofit `MessageApi` + modèles `MessagesApiResponse` (cursorPagination, hasNewer).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/MessageService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/MessageApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Envoyer instantanément et sans perte : bulle optimiste, chemin socket puis REST puis file hors ligne, renvoi d'un échec

`chat-send-pipeline` · Android : **partielle** · P0 · effort M

L'envoi écrit d'abord une ligne GRDB optimiste (texte ou média, avec citation optimiste riche), puis tente le socket (socket-first), le REST borné par un minuteur (sinon la file prend le relais) et enfin l'outbox. Des messages DISTINCTS partent en parallèle, seul le même message refiré dans la fenêtre de debounce est refusé ; le retry rejoue le même `clientMessageId` (le serveur dédoublonne) ; l'accusé réécrit l'id optimiste en id serveur (`MessageServerIdRekey`) pour qu'un démarrage à froid ne produise jamais de paire temp / serveur. Le renvoi d'un échec rejoue contenu, langue d'origine (le Prisme ne se réécrit pas), relation (réponse ou transfert) et lieu. `ConversationSendCoordinator` journalise les tentatives (`OutgoingMessageState`).

Écarts :
- Android passe toujours par l'outbox (`sendOptimistic` → `OutboxFlushWorker` REST) : pas de chemin socket-first (`message:send`, `message:send-with-attachments`) ni de repli socket quand le REST échoue.
- Pas de minuteur de garde du POST (iOS borne l'attente pour que l'horloge « envoi en cours » ne dure pas les 60 s de l'URLSession avant le repli) ; le retry doit réémettre le même `clientMessageId`.
- Déduplication du double-tap (fenêtre de debounce par message) sans bloquer des messages distincts en parallèle.
- `OutgoingMessageState` / journal des tentatives par message (nombre, dernière erreur, `isFailed`) et `FailedMessageReplay` conservant langue d'origine, réponse, transfert, lieu.
- Réécriture d'id optimiste → serveur (`cid_…` → id serveur) avant la sauvegarde du cache ; citation optimiste riche (voir chat-quoted-reply-reference).
- Finalisation partagée à l'ACK (`finalizeSuccessfulSend`), refus définitifs (voir chat-write-restriction-newcomer-slowmode), `isEncrypted` / mode de chiffrement sur la ligne optimiste.

Rendu : Horloge d'envoi puis double coche ; en échec, bulle renvoyable d'un geste (« Renvoyer le message »).

Transposition Android : Socket.IO emit avec ack → SocketManager.emit(ack) ; Task.timeout → withTimeout ; OfflineQueue → OutboxRepository.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationSendCoordinator.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+Send.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+OptimisticRecords.swift`
- `apps/ios/Meeshy/Features/Main/Services/MessageRecord+OptimisticText.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/FailedMessageReplay.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/MessageServerIdRekey.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationSendActivity.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationSendPersisting.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/message/MessageStateMachine.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SendLifecycleResolver.kt`

### Joindre photos, fichiers, caméra, lieu et vocal : plateau éditable, bulles optimistes et envoi résilient

`chatthread-attachments-send-pipeline` · Android : **partielle** · P0 · effort L

Enregistrement vocal : la prise se suit dans l'îlot quand on quitte l'app et s'arrête par les mêmes gestes que le composeur ; arrêtée, elle tombe dans le PLATEAU de pièces (modifiable avant envoi : toucher la tuile pour rogner/écouter), rien n'est envoyé, et une prise de moins de 0,5 s est jetée. Sélecteur photo (multiple), import de fichier, ingestion depuis le composeur (collage d'images/texte), capture caméra photo/vidéo (marquée « prise dans l'app »), lieu (SharedPlace, tuile de lieu retirée au tap avec le texte et rétablie si l'envoi échoue). Envoi : MultiAttachmentSendPlanner découpe en messages planifiés ; le texte seul part par un chemin dédié ; chaque lot insère des bulles optimistes (texte puis médias par groupe) avec transcriptions locales des vocaux posées par pièce ET par message, vide le composeur, puis lance l'envoi ; l'invité restreint voit son refus expliqué (GuestAttachmentRefusal). Une confirmation de consentement vocal peut interrompre l'envoi. Les pièces en attente se prévisualisent (miniature 1 024 px).

Écarts :
- Un seul fichier par message : ajouter un plateau de pièces multiples (liste de PendingAttachment avec vignettes, suppression, retouche, rognage audio) avec planificateur de lots (équivalent MultiAttachmentSendPlanner) et bulles optimistes par groupe de médias.
- Le vocal enregistré part aujourd'hui directement ; iOS le dépose dans le plateau (modifiable avant envoi), jette < 0,5 s et le suit hors de l'app (îlot -> notification de premier plan/Live Update).
- Partage de lieu (SharedPlace) avec tuile retirable et rollback si l'envoi échoue : tuile Location désactivée côté Android (showLocation = false).
- Sélecteur multi-photos (PickMultipleVisualMedia), import de fichiers multiples, collage d'images depuis le presse-papiers, mise en forme des vignettes à 1 024 px.
- Transcription locale des vocaux avant envoi (SpeechRecognizer on-device) posée sur la bulle optimiste par pièce et par message.
- Explication du refus serveur pour un invité restreint (GuestAttachmentRefusal) et alerte de consentement vocal avant envoi.
- Envoi texte seul sur chemin dédié, vidage du composeur et mise à jour optimiste cohérents ; marquage « prise dans l'app » pour la caméra.

Rendu : Plateau de tuiles ~56 dp au-dessus du champ, bulles optimistes en état « Envoi… » (bubble.delivery.sending), mosaïque de médias, pastille d'enregistrement avec vumètre.

Transposition Android : PhotosPicker -> ActivityResultContracts.PickMultipleVisualMedia ; fileImporter -> OpenMultipleDocuments ; Live Activity de prise vocale -> notification de service au premier plan ; caméra -> TakePicture/CaptureVideo (déjà présents).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentTray.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatCameraCapture.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentLadder.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/recording/VoiceRecordingPill.kt`

### Toucher une citation, une notification ou un résultat saute au bon message, même hors de la fenêtre chargée, et le fait clignoter

`chatthread-jump-to-message` · Android : **partielle** · P0 · effort M

Aller à un message (citation tapée, notification, résultat de recherche, retour depuis Résumé/Rivière, fiche média) suit un flux unique : message local => défilement immédiat ; sinon la pastille du bas pulse (« Recherche… ») pendant que le serveur renvoie la fenêtre autour du message, puis défilement et surlignage visuel. Le saut est VÉRIFIÉ (ScrollToMessageSettleLaw) : scrollToItem calcule son offset sur des hauteurs estimées, les cellules jamais réalisées se mesurent pendant l'animation et l'atterrissage tombe à côté ; la loi re-vise jusqu'à ce que la cible soit centrée. Le surlignage demandé par le routeur est consommé par un chemin unique, scopé par conversation (un surlignage posé pour une autre conversation n'est ni consommé ni brûlé) ; message introuvable => toast conversation.messageNotFound. La page plus récente d'une fenêtre sautée se charge à la demande (signal « Chargement… » après 200 ms) et le bas d'une fenêtre sautée n'est pas le bas du fil.

Écarts :
- Message hors fenêtre : ReplyJumpResolver rend TargetNotLoaded et l'écran reste inerte ; ajouter le chargement de la fenêtre autour du message (paramètre around du gateway, messages-list.ts) et la bascule en fenêtre sautée.
- Fenêtre sautée bidirectionnelle : charger la page plus RÉCENTE (loadNewer) avec signal « Chargement… » (conversation.loading_newer, seuil 200 ms) et considérer que le bas d'une fenêtre sautée n'est pas le bas du fil ; le bouton « bas » ramène au présent.
- Visée vérifiée : après animateScrollToItem, re-mesurer et re-viser jusqu'à centrage de la cible (média qui se mesure tard) avec nombre d'essais borné.
- Flash/surlignage du message ciblé et état « Recherche… » sur la pastille pendant la récupération.
- Consommer un surlignage demandé par notification/fiche média/lien avec garde de conversation et toast conversation.messageNotFound si le message n'existe plus.

Rendu : Surlignage bref de la bulle ciblée (teinte accent qui s'estompe), pastille du bas en forme capsule avec loupe pulsante pendant la recherche, sans autre animation.

Transposition Android : scrollToItem(.centeredVertically) -> LazyListState.animateScrollToItem + vérification par layoutInfo ; Router.pendingHighlightMessageId -> argument de navigation + SavedStateHandle.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ScrollToMessageSettleLaw.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+HighlightConsumer.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyJump.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScrollGeometry.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/MessageApi.kt`

### Un appui long sur un message l'ouvre en place dans un menu aux actions contextuelles, sur fond assombri et légèrement flouté

`chatthread-longpress-overlay-menu` · Android : **partielle** · P0 · effort M

L'appui long (sur le message ou sur une pièce précise d'un message à plusieurs pièces) présente un overlay : le clavier et le panneau d'options du composeur se ferment AVANT (et sont rendus à la fermeture), l'aperçu s'ouvre À LA PLACE de la cellule pressée (cadre résolu côté UIKit en coordonnées de fenêtre ; repli reconstruit/centré sinon), dans le mode de lecture du fil (rangée plate ou bulle), sans défilement ni délai préalable (#11208). Le fond reçoit un voile = assombrissement + flou léger plafonné à 8 (#11208, décision commune iOS/web en cours #11222), avant l'overlay pour ne flouter que la conversation. Pour une pièce ciblée, l'aperçu ne montre QUE cette pièce avec défilement vers les autres et les actions agissent sur elle (supprimer le média, citer la pièce, enregistrer, partager). Le menu est composé par la fabrique unique MessageMenuContext (verdicts de la loi partagée : copier, transférer, éditer, supprimer, signaler selon vue unique/flou/chiffré/éphémère) et la langue du fil (ThreadLanguage). Le message pressé passe à opacité 0 dans la liste via une enveloppe Equatable (MessageRowEnvelope) pour ne re-rendre que sa cellule ; les frames de bulles sont suivies dans un tracker LRU de 200 entrées. Les confirmations de suppression s'ancrent DANS la conversation (jamais en popover posé sur la liste, iPad).

Écarts :
- Android présente un ModalBottomSheet avec un héros d'aperçu : passer à un overlay plein écran qui ouvre l'aperçu exactement sur le cadre de la cellule (animation de translation depuis sa position), menu qui se place au-dessus/au-dessous selon la place.
- Voile de fond : assombrissement + flou léger ≤ 8 sur la seule conversation (pas sur le menu) ; fermeture qui restitue clavier et panneau d'options.
- Appui long sur une PIÈCE d'un message multi-pièces : aperçu de cette pièce seule avec défilement vers les autres, actions ciblant la pièce (supprimer le média, citer la pièce).
- Menu piloté par une fabrique unique de verdicts (copier/transférer/éditer/supprimer/signaler) respectant vue unique, flou, chiffré, éphémère ; MessageActionMenu existe mais sans la loi de sortie complète.
- Message source masqué (opacité 0) dans la liste pendant l'overlay sans recomposer les autres lignes ; tracker de frames borné (200).
- Haptique légère à l'ouverture ; confirmations de suppression ancrées dans l'écran.

Rendu : Aperçu à 16 pt des bords, voile noir progressif + flou ≤ 8, menu en carte de verre arrondie avec icônes dessinées (SF Symbols -> Material), animation ressort 0.3/0.8, cellule d'origine invisible.

Transposition Android : UIKit cellFrameInWindow -> onGloballyPositioned + boundsInWindow ; blur de fond -> RenderEffect/Modifier.blur sur la couche conversation (API 31+) avec repli assombrissement seul ; HapticFeedback.light -> LocalHapticFeedback.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+OverlayMenu.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationLayers/ConversationBodyPresentations.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageFrameTracker.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageRowEnvelope.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOverlayPreviewHero.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOverlayLayout.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOverlayDragLaw.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageActionMenu.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaPreview.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Le fil de messages défile sans à-coup : liste inversée stable, regroupement par auteur et par jour, cellules mémoïsées

`chatthread-message-list-engine` · Android : **partielle** · P0 · effort M

Fil UIKit inversé (transform scaleY -1, item 0 = bas visuel) en cellules auto-dimensionnées à hauteur estimée apprise, sur une section pleine largeur avec marge de 12 pt. Loi de stabilité du champ visuel : une cellule sous la fenêtre qui se re-mesure (séparateur de jour, texte reconfiguré, image chargée) ou une insertion en tête (message entrant, frappe) ne décale jamais ce que l'œil lit (compensation d'offset) ; une hauteur n'est redemandée que si elle change d'au moins un pixel physique. La préparation du snapshot (items inversés, regroupement par jour, carte serverId -> localId) est mémoïsée par empreinte de composition (le serverId y entre, la version de ligne non). Éléments de liste typés : message, bulle « X écrit… » comme vraie dernière cellule, séparateur de jour flottant (Aujourd'hui / Hier / …) recalculé à minuit, marqueur « Début de la conversation ». Regroupement : même auteur, même jour => une seule identité (têtes et queues de groupe). Réserve haute au repos sous la pilule de jour (hauteur d'en-tête mesurée). La couche de liste remet ~45 rappels : tap média, appui long (message ou pièce), balayage pour répondre ou transférer, ajout de réaction, tap des coches vers l'onglet Vues, réessai d'un envoi échoué, détail d'appel, traduction à la demande, consommation de vue unique, story d'un expéditeur, vues vers la fiche.

Écarts :
- Bulle de frappe comme VRAIE dernière cellule du fil (elle remonte avec les messages entrants) : Android l'affiche hors liste, sous elle.
- Marqueur « Début de la conversation » quand la plus ancienne page est atteinte.
- Compensation de position quand un élément au-dessus du viewport change de hauteur (image qui charge, traduction) : vérifier/ajouter un ancrage (clé stable + correction de scroll) pour que le message lu ne saute pas.
- Rappels manquants côté bulle/liste : balayage dans l'autre sens pour TRANSFÉRER (Android ne balaye que pour répondre), bouton d'ajout de réaction flottant sur la bulle, tap des coches vers l'onglet « Vues » (qui a reçu/lu), tap d'avatar vers profil/story, mentions et liens suivis, détail d'appel, appui long sur une pièce précise, consommation de vue unique, traduction à la demande par message.
- Lecture visible : accumulateur de messages vus (onMessagesSeen) alimentant les accusés de lecture ; badge de nouveaux messages (onNewMessagesBadge).
- Estimation de hauteur apprise du fil courant pour limiter les corrections de layout ; réserve haute sous la pilule de jour liée à la hauteur mesurée de l'en-tête.
- Pilule de jour : retrait quand l'en-tête est déplié ; séparateur de jour recalculé au passage de minuit.

Rendu : Marges horizontales 12 dp, espacement md entre suites d'auteur, zéro entre messages d'une même suite ; séparateur de jour en pilule flottante (Aujourd'hui/Hier/date) sous l'en-tête ; aucune animation de saut lors des insertions en tête.

Transposition Android : UICollectionView compositional layout inversé -> LazyColumn(reverseLayout = true) avec clés stables ; DiffableDataSource -> items(key) + diff de List ; PreferenceKey de frames -> onGloballyPositioned.

<details><summary>Sources iOS (8)</summary>

- `apps/ios/Meeshy/Features/Main/Views/DiffableTypes.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListCell.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListLayout.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListSectionLayout.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageListSnapshotPrep.swift`
- `apps/ios/Meeshy/Features/Main/Views/MessageGroupRules.swift`
- `apps/ios/Meeshy/Features/Main/Views/ThreadHeadClearance.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageListLayer.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatListItems.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageGrouping.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/BubbleMemoCache.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOrdering.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/PinnedDayHeader.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### L'écran de conversation s'ouvre prêt, reprend son état et obéit aux demandes du routeur

`chatthread-screen-shell` · Android : **partielle** · P0 · effort M

ConversationView compose la scène en couches nominales (en-tête flottant zIndex 100, fil, composeur, bulle retour en bas, recherche, bannières, lecteurs alternatifs). Démarrage : restaure la mémoire d'en-tête, démarre le ViewModel une seule fois, observe la synchro, charge les messages (cache d'abord, squelette seulement à froid), demande le marquage lu (flushSeen), connecte le socket puis consomme le surlignage et la recherche demandés. À l'apparition : applique le contexte de réponse (réponse à un mood), choisit la langue de composition par défaut (langue de contenu préférée > langue du clavier actif, jamais Locale.current), restaure le brouillon. À la disparition ou au passage en arrière-plan : flush du brouillon, arrêt d'un enregistrement vocal en cours vers le plateau, persistance durable des pièces en attente, consommation des vues uniques ouvertes. Accès révoqué : toast d'erreur puis retour. Le routeur peut demander à une conversation DÉJÀ à l'écran d'ouvrir la recherche, de surligner un message ou d'armer une réponse : consommé à chaud, scopé par conversation. Mesure du composeur (safe area ajoutée seulement sans clavier) et ancrage du bouton « bas » figé pendant la frappe. Mode aperçu (previewMode) : composeur sans pièces, bascule vue unique, tap sur le fil pour ouvrir la conversation complète. Loi ScrollMotion : les boutons d'action de l'en-tête s'effacent pendant le défilement et reviennent à l'arrêt.

Écarts :
- La route chat/{conversationId} ne porte qu'un identifiant : ajouter les arguments surlignage de message, ouverture de recherche et contexte de réponse (mood, notification) et les consommer à chaud quand l'écran est déjà affiché (équivalent ConversationRouterWatch), scopés par conversation et jamais brûlés pour une autre.
- Accès révoqué (expulsion, bannissement, conversation supprimée) : afficher un toast d'erreur puis revenir en arrière ; aujourd'hui l'écran reste ouvert sur un état figé.
- Langue de composition par défaut : langue de contenu préférée, sinon langue du clavier actif (InputMethodManager) limitée aux langues supportées, sans jamais écraser la préférence in-app.
- Marquage lu piloté par la visibilité (accumulateur de messages vus, déclencheur flushSeen à l'ouverture, au retour au bas et au départ en arrière-plan) au lieu du marquage global à l'entrée.
- Mesure du composeur : ajouter l'inset système bas seulement sans clavier ; figer l'ancre du bouton « retour en bas » pendant la rédaction pour qu'il ne remonte pas à chaque retour à la ligne.
- Mode aperçu (previewMode) ouvert depuis l'appui long d'une notification ou d'une ligne : composeur réduit (texte, vocal, effets, flou, éphémère, bascule vue unique), tap sur le fil = ouvrir la conversation complète.
- Persistance des pièces en attente et arrêt de l'enregistrement vocal vers le plateau au départ de l'écran ou de l'app.
- Loi ScrollMotion : effacer la grappe d'actions de l'en-tête pendant le défilement (sauf recherche ouverte) ; ScrollMotionVisibility existe dans sdk-ui mais n'est pas branché sur le fil.
- Bannière de connexion propre à l'écran pour les hôtes invités (showsOwnConnectionBanner) ; l'état hors-ligne n'apparaît aujourd'hui que dans la pastille du bas.

Rendu : Empilement : fond, fil plein écran sous l'en-tête, composeur ancré bas, bulle retour en bas à droite au-dessus du composeur, en-tête au-dessus de tout (verre). Aucune transition de couche ne redimensionne le fil (opacity/offset seulement). Tokens MeeshySpacing xs/sm/md, accent de conversation pour tout contrôle de contexte.

Transposition Android : InteractivePopEnabler (geste retour bord) -> retour système / geste prédictif Android ; scenePhase -> LifecycleEventObserver ON_STOP/ON_START ; @StateObject unique -> hiltViewModel + SavedStateHandle ; previewMode (sheet à détentes) -> ModalBottomSheet partiellement déplié.

<details><summary>Sources iOS (6)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationLayers/ConversationBodyLifecycle.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationLayers/ConversationBodyStage.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationScrollState.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationViewRules.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/InitialScrollTarget.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScrollGeometry.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Régler SA conversation depuis la fiche : nom personnalisé, favori, épingle, catégorie, étiquettes, muet, archiver, quitter

`chat-conversation-options-tab` · Android : **partielle** · P1 · effort M

Onglet Options : sections Mon affichage (nom personnalisé avec placeholder et effacement, réaction favorite, fond de la conversation), Organisation (épingler, catégorie avec création, étiquettes), Notifications (muet, mentions seulement) et Actions (archiver / désarchiver, quitter le groupe — masqué pour le créateur et en direct —, supprimer pour moi) avec alertes de confirmation. Le ViewModel charge les préférences, applique chaque changement de façon optimiste avec debounce du nom, restaure en cas d'échec et signale `didDelete` / `didLeave` pour fermer l'écran.

Écarts :
- Ces réglages personnels n'existent que dans le menu d'appui long de la liste (`ConversationContextMenu`) ; aucun accès depuis le chat. Les « Réglages » du chat sont l'édition ADMIN (rôle d'écriture, annonce, mode lent, traduction auto), pas les préférences personnelles.
- Créer l'onglet Options de la fiche avec les quatre sections et les textes exacts (« Archiver la conversation ? », « Quitter la conversation ? Vous ne recevrez plus de messages. Votre historique restera consultable. », « Supprimer pour moi — cette conversation sera retirée de votre liste. Les autres membres ne seront pas affectés. »).
- ViewModel dédié au contexte chat (extraire la logique du `ConversationListViewModel`) : chargement des préférences + catégories + étiquettes, debounce du nom personnalisé, rollback avec message d'erreur, fermeture automatique du chat après suppression / départ.
- Bouton « Quitter le groupe » conditionné par `canLeave` (ni direct, ni créateur) ; ligne « Fond de la conversation » vers chat-conversation-appearance-picker.

Rendu : Sections en cartes verre avec séparateurs inset 54 dp, icône colorée à gauche, toggles à droite ; titre de section footnote bold ; champ nom personnalisé avec croix d'effacement.

Transposition Android : Alert SwiftUI → AlertDialog Material ; Toggle → Switch ; rangées de réglages → ListItem.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationOptionsViewModel.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationCategoryPicker.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationTagAutocomplete.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationSettingsSheet.kt`

### Un message éphémère disparaît à son échéance exacte, avec un seul réveil pour tout le fil

`chat-ephemeral-expiry-scheduler` · Android : **partielle** · P1 · effort S

`EphemeralExpiryCoordinator` remplace un Timer par bulle : le texte du compte à rebours bat côté système, et un SEUL réveil dort jusqu'à la PROCHAINE échéance du fil. La loi `EphemeralExpiryLaw` distingue « quand me réveiller » (`deadlines`) et « qu'est-ce qui part maintenant » (`elapsedIds`) ; `EphemeralExpiryTriage` trie échus / en combustion / déjà morts. Le retrait n'a jamais lieu dans la passe courante (réentrance du `didSet` de `messages`) : le réveil est toujours différé, avec animation de combustion, annonce d'accessibilité et persistance.

Écarts :
- Chaque bulle Android tique sa propre horloge (`EphemeralCountdownBadge`) et le serveur retire via `message:expired` → `refresh` ; manque le réveil unique de fil qui calcule la prochaine échéance et fait partir les messages échus localement (Room) sans attendre le réseau.
- Lois pures `EphemeralExpiryLaw` (deadlines / elapsedIds) et `EphemeralExpiryTriage` (échu / en combustion / mort) à porter.
- État « combustion » (`burningEphemeralIds`) avec animation de brûlure avant retrait ; annonce TalkBack ; persistance de la disparition (aperçu de liste, index média).
- Libellé du compte à rebours rendu par le système (équivalent de `Text(timerInterval:)`) pour éviter un recomposition par seconde et par bulle ; événement `message:countdown-started` non écouté.

Rendu : Capsule flamme + compte à rebours sous la bulle ; la bulle brûle puis se replie.

Transposition Android : Task.sleep jusqu'à la prochaine échéance → coroutine avec delay + AlarmManager non requis (premier plan) ; Text(timerInterval:) → LaunchedEffect cadencé ou Chronometer.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+EphemeralExpiry.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/EphemeralExpiryLaw.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/EphemeralExpiryTriage.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/EphemeralCountdownBadge.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EphemeralLifecycle.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BubbleRenderKind.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Transférer un message vers une ou plusieurs conversations ou contacts, même hors ligne, avec le motif d'un refus

`chat-forward-message` · Android : **partielle** · P1 · effort M

Chemin unique de transfert : refus locaux par la loi de sortie (vue unique, flamme après lecture), le flou est imposé par la passerelle, jamais d'`attachmentIds` ni de re-upload (le serveur copie tout ou les seules pièces choisies), durée de flamme choisie ramenée à la source, `clientMessageId` conservé au retry après échec et libéré après succès. Hors ligne : enfilage durable dans l'outbox ; contact sans conversation : échec explicite immédiat. Les refus (vue unique, après lecture, source indisponible, source chiffrée, pièce hors source) ont chacun leur phrase localisée.

Écarts :
- Android renvoie le contenu texte avec `forwardedFromId` / `forwardedFromConversationId` via l'outbox ; manque les refus issus de la loi de sortie (vue unique, flamme après lecture) AVANT envoi et les cinq raisons de refus serveur avec phrases localisées.
- Choix des pièces transférées (`forwardedAttachmentIds`) et durée de flamme choisie dans la feuille ; flou imposé par la passerelle.
- Cible = contact sans conversation (`ShareRecipient`) : résolution / création, ou échec explicite hors ligne ; `ForwardOutcome` { envoyé, en file hors ligne, échec(raison) } avec l'id de conversation RÉSOLU.
- Un seul transfert en vol à la fois par message et coches « déjà transféré » existent ; ajouter l'idempotence `clientMessageId` au retry et sa libération après succès (re-transférer délibérément = second message).
- Conversation source inconnue omise (jamais `""`).

Rendu : Feuille de sélection de cibles avec coche par cible déjà transférée et message d'erreur contextualisé.

Transposition Android : ShareRecipient / répertoire → cibles de ForwardTargets + contacts ; outbox OfflineQueue → OutboxRepository SEND_MESSAGE.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ForwardTargets.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Chercher dans la conversation (serveur et hors ligne) et ne voir que les messages trouvés

`chat-in-conversation-search` · Android : **partielle** · P1 · effort M

La recherche interroge le serveur avec pagination (`searchWithCursor`) et un index FTS5 local classé BM25 pour le hors ligne ; quand une requête a des résultats, la fenêtre de conversation est filtrée sur ces seuls messages (vraies bulles, terme surligné) puis restaurée quand la requête est vidée ou fermée. Idempotent après chaque recherche ou pagination.

Écarts :
- Recherche limitée aux messages DÉJÀ chargés (`toSearchable`), avec navigation précédent / suivant ; la route serveur `GET …/messages/search` existe dans `MessageApi` mais n'est pas utilisée (ni pagination par curseur).
- Pas de mode « fenêtre filtrée » : iOS n'affiche que les résultats comme vraies bulles puis restaure la fenêtre récente (`enterSearchMode(ids)` / `restoreLatestWindow`).
- Pas d'index FTS5 local (Room FTS4) classé par pertinence pour la recherche hors ligne ; recherche sensible aux traductions affichées et aux originaux (déjà faite côté Android sur la fenêtre).
- États : `isSearching`, `searchHasMore`, requête courante ; fin de recherche (`endSearch`) qui restaure fenêtre et résultats.

Rendu : Barre de recherche sous l'en-tête avec compteur « 3/12 », suivant / précédent, terme surligné dans les bulles.

Transposition Android : FTS5 GRDB → Room @Fts4 (ou FTS5 via SQLite requery) ; tri BM25 → matchinfo / rank.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+Search.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Search/MessageSearchService.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatSearch.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/MessageApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/search/SearchTextFolder.kt`

### Ouvrir la fiche d'une conversation : héros, partage, sécurité, épinglés et onglets Membres / Médias / Stats / Options

`chat-info-sheet` · Android : **partielle** · P1 · effort M

Feuille « Conversation » : barre de titre avec engrenage (réservé aux gestionnaires de groupe) et fermeture, en-tête direct ou héros (groupe / public / global) avec type localisé, date de création et état « Notifications désactivées », bouton Bloquer pour une conversation directe, boutons Partager (lien d'invitation + feuille de partage) et Quitter, rangée de sécurité, aperçu des messages épinglés (+ feuille « Voir les N messages épinglés »), puis un sélecteur à quatre onglets (Membres avec recherche, Médias, Stats, Options). Elle remonte à l'hôte la conversation fusionnée après édition (titre / avatar).

Écarts :
- Pas de fiche unifiée : l'en-tête du chat aligne 6 à 8 boutons-icônes (recherche, stats, analyse, membres, lien, réglages admin, appels) qui ouvrent chacun une feuille séparée ; créer la feuille « Conversation » et y déplacer ces entrées.
- En-tête héros / direct absent : avatar, nom, type localisé (Direct, Groupe, Public, Global, Communauté, Channel, Bot, Communication), « Créé le %@ », mention « Notifications désactivées ».
- Bouton « Bloquer cet utilisateur » (conversation directe) avec alerte de confirmation, haptiques medium / success / error, messages « Utilisateur bloqué » / « Erreur lors du blocage ».
- Boutons Partager (création du lien puis ShareSheet système, erreur « Erreur lors de la création du lien ») et Quitter (alerte + « Erreur lors du départ de la conversation »).
- Aperçu des épinglés dans la fiche + « Voir les %d messages épinglés » (liste triée par date d'épinglage décroissante) ; Android n'a que la bannière du fil et une feuille séparée.
- Sélecteur d'onglets : pastille de compte, soulignement 2 dp accent, ressort 0,3/0,8, haptique légère, état sélectionné exposé à l'accessibilité ; onglet Membres avec recherche « Rechercher un membre… », état vide « Aucun membre » et présence.
- Rangée de sécurité (voir chat-encryption-detail-sheet), onglet Médias (chat-media-hub), Stats (chat-conversation-dashboard) et Options (chat-conversation-options-tab).
- Relais `onConversationUpdated` : l'écran hôte doit se mettre à jour quand les réglages ont été enregistrés.

Rendu : Fond = couleur de fond primaire + deux halos accent flous (300 dp blur 80 à 6 %/4 % clair-sombre en haut-gauche, 200 dp blur 60 à 4 %/2 % en bas-droite) ; titre « Conversation » headline semibold arrondi ; boutons ronds 28 dp (engrenage, fermeture) fond textMuted léger ; apparition par ressort 0,5/0,8 ; onglets : label subhead bold quand sélectionné, pastille capsule 10 pt bold.

Transposition Android : Feuille SwiftUI plein écran avec NavigationStack → ModalBottomSheet plein hauteur (ou destination de navigation) ; ShareSheet → Intent.ACTION_SEND ; haptiques → HapticFeedback Compose.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet+Pinned.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationTypeDisplayName.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMembersSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationSettingsSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationStatsSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/PinnedMessages.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ParticipantProfileSheet.kt`

### Toucher une citation ou un résultat de recherche saute au message, même hors fenêtre, puis revient au présent

`chat-jump-to-message-window` · Android : **partielle** · P1 · effort M

`loadMessagesAround` charge une fenêtre GRDB centrée sur le message (`around`), pose l'état sauté (`isInJumpedState`), pagine ensuite vers le plus récent (chaîne de pages plus récentes lancée dès que le bas est visible) et permet de revenir à la dernière page. `ConversationWindowFetcher` sépare la lecture réseau de l'écriture GRDB pour garder la garde « toujours sauté » entre les deux.

Écarts :
- Android ne défile que vers un original DÉJÀ chargé (`ReplyJump.TargetNotLoaded` est inerte) ; il manque la requête `around` (`GET …/messages?around=<id>`) et la fenêtre centrée en base.
- État de fenêtre sautée (`isInJumpedState`, `hasNewerMessages`) avec pagination vers l'avant, annulation de la chaîne quand on quitte la fenêtre, bouton de retour au présent ; garde contre l'écriture d'une page devenue obsolète.
- Indicateur `isSearchingQuotedMessage` pendant la recherche du message cité ; échec → message d'erreur localisé.
- Rattrapage de la transcription et des traductions des messages de la fenêtre sautée.

Rendu : Atterrissage animé sur la bulle visée avec surbrillance brève ; pastille « revenir au présent » en bas.

Transposition Android : Fenêtre GRDB centrée → requête Room par plage de createdAt + flag de mode de fenêtre dans le MessageRepository.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+JumpToMessage.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationWindowFetcher.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyJump.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/InitialScrollTarget.kt`

### Feuilleter TOUS les médias de la conversation en plein écran, même ceux jamais chargés

`chat-media-gallery-index` · Android : **partielle** · P1 · effort M

La galerie navigue sur l'index persisté des porteurs de médias (`ConversationMediaCatalog`, stocké dans `CacheCoordinator.conversationMedia`, `hasMore == false` ⇔ plus rien d'ancien) et non sur la seule fenêtre de messages : un index de mille photos ne coûte que mille lignes de métadonnées, les octets ne sont téléchargés qu'à l'ouverture (fenêtre de rendu bornée ±1 page, aperçu thumbHash / vignette ailleurs). Règles pures partagées (`ConversationMediaRules`) : légende, fiche d'auteur, admission. `ConversationMediaHandler` préchauffe le disque pour les médias visibles ou récents.

Écarts :
- La galerie Android ne couvre que les images des messages CHARGÉS (`ConversationGallery.of(messages…)`) ; ajouter un index persistant de porteurs de médias paginé par `before` (route `view=media&kinds=…`) avec curseur d'épuisement.
- Vidéos et autres types dans la galerie (iOS feuillette photos et vidéos) ; ouverture d'une vidéo avec préchargement (vignette + préroll du lecteur).
- Règles pures d'admission : exclure vue unique, supprimé, échu, masqué pour moi ; légende et fiche d'auteur communes aux deux sources (fenêtre et index).
- Préchargement disque des médias visibles ou récents (images, audio, vignettes vidéo) pour que la grille ne bloque jamais sur le réseau.

Rendu : Fond flou thumbHash pendant le chargement du plein format, légende + auteur + date en bas, pagination horizontale.

Transposition Android : CacheCoordinator → table Room media index + MediaBlobStore ; thumbHash → ThumbHashPainter (déjà présent).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationMediaCatalog.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationMediaRules.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationMediaHandler.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/ImageViewerPrefetch.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/media/MediaBlobStore.kt`

### Supprimer, épingler, modifier et réagir avec retour arrière : pour tous, pour moi, par sélection, une pièce ou un message non envoyé

`chat-message-commands` · Android : **partielle** · P1 · effort M

`ConversationCommandHandler` porte toutes les commandes sur un message : suppression pour tous (fenêtre de 2 h), « supprimer pour moi » (retrait optimiste dans la PROJECTION du fil seulement ; la base, les traductions et l'outbox restent intacts jusqu'à l'accord serveur, un refus lève le filtre), retrait d'une SÉLECTION (les messages des autres portent un motif de modération, les siens partent sans, un envoi raté se retire localement), retrait d'une pièce, retrait d'un envoi non parti (`withdrawUnsent`), épingle, édition, réactions avec limiteur de jetons, consommation vue unique, compensation après épuisement des retries.

Écarts :
- « Supprimer pour moi » est purement local (`LocallyHiddenMessagesStore`, jamais serveur) ; iOS passe par `hideForMe(messageId(s))` serveur (synchronisé aux autres appareils par `message:hidden-for-me` / `message:restored-for-me`) avec retrait dans la projection et rollback au refus.
- Retrait d'une SÉLECTION de messages avec motif de modération (`removeForModeration`, `removeSelection`) et mode sélection multiple dans le fil (verbe « Sélectionner ») — absents.
- Retrait d'une pièce (`removeAttachment`) avec rollback, retrait d'un envoi non parti (`withdrawUnsent`), suppression de l'outbox correspondante.
- Limiteur de jetons de réaction (`consumeReactionToken`) pour éviter le martèlement ; réactions de pièce jointe distinctes des réactions de message.
- Compensation après épuisement des retries de l'outbox (`compensate(OfflineRetryExhausted)`) : restituer l'état d'avant (édition, épingle, suppression).
- Bascule d'épingle avec état précédent (`MessagePinState`) et rollback ; erreurs traduites en phrases localisées (`ConversationErrorText`).

Rendu : Retrait immédiat de la bulle avec rollback animé si le serveur refuse ; barre d'actions de sélection avec compteur.

Transposition Android : OfflineQueue → OutboxRepository (nouveaux kinds HIDE_FOR_ME, REMOVE_ATTACHMENT, MODERATION_REMOVE).

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationCommandHandler.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationCommandPersisting.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationCommandTypes.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+MessageActions.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationForMeRemoval.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/LocallyHiddenMessagesStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageDeletability.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEditability.kt`

### Appui long sur un message : aperçu flottant à sa place, liste d'actions en verre et geste vertical

`chat-message-long-press-overlay` · Android : **partielle** · P1 · effort M

L'overlay iOS pose un voile (sans flou global), rend l'aperçu de la CELLULE du fil elle-même à sa position source (rangée plate en Script/Focal, bulle ailleurs, forme protégée pour vue unique / flouté / chiffré), une barre de réactions rapides avec bouton « + » (sélecteur complet) et la liste verticale d'actions dans une capsule de verre (largeur 240, rangées 44, icônes à l'accent, destructif rouge). Un glissement vertical sur l'ensemble réduit d'abord progressivement l'aperçu (loi de dévoilement, ancré en haut, annulable, état gardé au relâchement), puis le reste du parcours ouvre « Plus… » vers le haut ou ferme vers le bas, avec haptique d'armement émise une seule fois.

Écarts :
- Android présente un `ModalBottomSheet` en bas d'écran (poignée de glissement) avec un « héros » d'aperçu ; iOS montre une capsule verre de 240 dp ancrée près de la bulle et l'aperçu À SA PLACE d'origine (cadre source → repère local, décalage tablette).
- L'aperçu doit être la cellule du fil elle-même (mode de lecture du fil, mêmes entrées que la cellule), jamais une bulle générique ni une capture ; la forme protégée (puce vue unique, flou, chiffré) est choisie EN AMONT et l'appui long ne dévoile ni ne consomme.
- Loi de dévoilement (`MessageOverlayRevealLaw`) absente : glisser vers le haut réduit l'aperçu (ancré en haut) pour dégager le menu coupé d'un long message, image par image, annulable en redescendant, taille gardée au relâchement sans aimant ; plancher 1 pour un message court. Android n'a que la loi à seuils (`OPEN_MORE` / `DISMISS` ±80) sur la poignée.
- Geste sur tout le cluster (aperçu + liste) avec DragGesture min 12 et haptique medium d'armement émise une seule fois ; « Plus… » doit ouvrir la feuille Plus (aujourd'hui OpenMore ouvre l'explorateur de langues).
- Dimensionnement Dynamic Type : hauteur de rangée et colonne d'icône suivent la taille de police (`estimatedSize` cohérent avec le rendu).
- Voile : simple assombrissement easeOut 0,26 s (pas de flou plein écran) ; fermeture par tap sur le voile ; trait modal pour les lecteurs d'écran ; animations remplacées sous « Réduire les animations ».
- Callbacks hôte à câbler : composer, sélectionner, traduire, plus, détails d'appel, export image, réponse, renvoi, enregistrer média.

Rendu : Capsule glass 240 dp, rayon arrondi large, séparateurs inset 52 dp teintés accent, icônes monochromes accent 24 dp, rangée 44 dp min ; barre d'emojis au-dessus ; l'aperçu garde sa position et se réduit vers le haut ; voile noir ~35 % ; ressort pour le retour au repos.

Transposition Android : Overlay SwiftUI plein écran → Popup / Dialog plein écran Compose avec voile ; Liquid Glass → surface translucide + blur (API 31+) avec repli opaque ; DragGesture → pointerInput / draggable.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayCellPreview.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayDragLaw.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayRevealLaw.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOverlayPreviewHero.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOverlayLayout.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOverlayDragLaw.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageActionMenu.kt`

### Le menu d'un message n'offre que ce que le rôle, la conversation et la nature du message permettent

`chat-message-menu-policy` · Android : **partielle** · P1 · effort M

Un vocabulaire UNIQUE de 39 verbes d'action (répondre, renvoyer, transférer, modifier, sélectionner, composer, imager, export rapide, traduire, copier, enregistrer, supprimer / supprimer le média, partager, sticker, ouvrir / copier le lien, ouvrir dans Plans, copier l'adresse, discussion, épingler, favori, qui a vu, réactions, transcription, sentiment, historique, signaler…) donne un libellé et un symbole identiques dans la liste d'appui long, la feuille « Plus… » et le menu du double toucher. `ConversationMenuAuthority` fabrique une seule fois l'autorité du lecteur (rôle plateforme et de conversation, créateur inclus, invité lu à sa session, membre actif, droit d'écrire) et `MessageMenuContext.make` assemble le contexte consommé par `MessageActionPolicy`. `MessageExitTransport` pose un second verrou sur copier / enregistrer / partager.

Écarts :
- Android n'a que 16 actions plates (`MessageAction`) calculées avec `canEdit` / `canDeleteForEveryone` isolés ; il manque une autorité du lecteur (rôle plateforme + rôle de conversation, créateur, invité, membre actif, canSendMessages) et une politique unique par type de conversation.
- Table verbe → libellé + symbole partagée par tous les menus (aujourd'hui libellés dispersés dans ChatScreen / feuilles).
- Actions absentes : Sélectionner (mode sélection), Composer, Imager, Export rapide / Créer (carte d'export en image), Traduire (raccourci), Enregistrer le média (galerie), Supprimer le média (pièce visée), Partager, Détails de l'appel, Discussion, Média, ajouter / favori / épingler une décoration sticker, Renvoyer.
- Actions selon la nature du message (`MessageKindTarget`) : ouvrir le premier lien brut, copier le lien, ouvrir un lieu dans l'app de cartes, copier l'adresse ; liens inertes pour un message protégé.
- Second verrou de sortie (`MessageExitTransport`) : copier / enregistrer / partager refusent silencieusement si la loi de sortie du message l'interdit (vue unique, flamme, flouté, chiffré) même si un menu resté ouvert l'appelle ; haptique succès après copie.
- Divergence à trancher : Android masque « Signaler » sur ses propres messages, iOS l'ajoute inconditionnellement.

Rendu : Icônes monochromes à l'accent de la conversation, destructif en rouge ; libellés exactement ceux du vocabulaire (Modifier, Sélectionner, Transférer, Plus…, Discussion, Qui a vu…).

Transposition Android : Ouvrir dans Plans → Intent ACTION_VIEW `geo:` ; UIPasteboard → ClipboardManager ; SF Symbols → ImageVector Material équivalents (table centralisée).

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageActionVocabulary.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageMenuContext+Make.swift`
- `apps/ios/Meeshy/Features/Main/Services/MessageExitTransport.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageActionMenu.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEditability.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageDeletability.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessagePinToggle.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/GallerySaveTarget.kt`

### Ouvrir la feuille « Plus… » d'un message : actions en pastilles et exploration inline (langue, qui a vu, réactions, transcription, sentiment, historique, signaler)

`chat-message-more-sheet` · Android : **partielle** · P1 · effort M

Grille de pastilles colorées sur surface verre (sections actions / infos / modération) puis contenu d'exploration affiché sous la grille : langues et traductions (avec demande de traduction texte ou audio en cours conservée par le ViewModel), « Qui a vu », réactions (voir + ajouter), transcription, sentiment, historique des modifications, signalement. Elle dit aussi pourquoi la traduction et la transcription serveur sont absentes pour un message chiffré de bout en bout, et confirme avant de supprimer un média.

Écarts :
- Pas de feuille unifiée : l'explorateur de langues, le détail des réactions et le signalement sont trois feuilles séparées ; créer la grille de pastilles et le contenu inline.
- Vues absentes : « Qui a vu » (statut de livraison / lecture par membre), Transcription (karaoké / texte du vocal), Sentiment du message, Historique des modifications (`EditRevision`).
- Ajout d'une réaction depuis la vue Réactions de la feuille ; sélection d'une traduction ou d'une langue audio ; demande de traduction texte / audio avec état « en cours » qui survit à la fermeture de la feuille ; échec de demande publié (`translationRequestFailed`).
- Mention explicite d'une fonction serveur absente quand la conversation est chiffrée de bout en bout.
- Confirmation avant « Supprimer le média » (action destructive) ; couleurs de pastille par action (indigo, warning, info, success, error).

Rendu : Bouton Fermer verre en haut à droite ; pastilles rondes colorées avec libellé dessous, apparition échelonnée de la grille (`gridAppeared`) ; le contenu choisi s'ouvre inline sous la grille.

Transposition Android : Grille de pastilles → LazyVerticalGrid dans ModalBottomSheet ; bandeau d'icônes horizontal avec morph → LazyRow animée.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageDetailExplorer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReactionBreakdown.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReportMessageSheet.kt`

### « Lui écrire » ouvre (ou crée) la conversation directe avec un contact, depuis l'annuaire ou un profil

`chat-open-direct-conversation` · Android : **partielle** · P1 · effort S

`ConversationCreator` poste `/conversations` avec `type: direct` et obtient l'`APIConversation` complète (membres, mode de chiffrement, langues) pour naviguer dans le chat sans GET supplémentaire. L'extension `openDirectConversation` est partagée par le répertoire et les affiliés : même appel, même `catch`, haptique d'erreur et toast « Impossible d'ouvrir la conversation ».

Écarts :
- La création d'une conversation directe n'existe qu'à l'intérieur de l'écran « Nouvelle conversation » ; ni le profil ni le répertoire de contacts n'offrent « Lui écrire ».
- Réutiliser la conversation directe existante (route `findDirectWith(userId)` absente de `ConversationApi`) au lieu d'en créer une seconde.
- Service partagé `openDirectConversation` retournant la conversation complète pour navigation immédiate, avec haptique d'erreur et snackbar « Impossible d'ouvrir la conversation ».

Rendu : Bouton « Message » sur la fiche profil et la ligne de contact.

Transposition Android : FeedbackToastManager → MeeshyToast / Snackbar.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ConversationCreator.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/NewConversationViewModel.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/NewConversationLogic.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`

### Changer la langue d'une bulle et demander une traduction à la demande, sans jamais envoyer de clair à la traduction serveur d'un message chiffré

`chat-prism-translation-requests` · Android : **partielle** · P1 · effort M

`ConversationBubbleLanguageSelection` porte le choix de langue d'une bulle (drapeau) ; une demande de traduction en échec est publiée (`ConversationTranslationRequestFailure`). `ServerTranslationAdmission` est FAIL-CLOSED : aucun texte clair ne part vers la traduction SERVEUR d'un message que le serveur ne lit pas (la conversation ET le message le disent ; un régime inconnu se lit comme non lu) ; la traduction y passe par l'appareil (`DeviceTranslationCoordinator`). `ConversationMediaSenderInfo` alimente la fiche d'auteur de la galerie.

Écarts :
- Le drapeau, la demande de traduction à la demande (`requestOnDemandTranslation`) et l'explorateur de langues existent ; il manque l'échec de demande publié à l'UI (toast / état de ligne) et la demande de traduction AUDIO par pièce (`onRequestAudioTranslation`).
- Admission fail-closed : refuser d'envoyer le clair vers la traduction serveur quand la conversation ou le message n'est pas lisible par le serveur (E2EE) ; régime inconnu = non lisible.
- Traduction sur l'appareil pour les conversations chiffrées (équivalent de `DeviceTranslationCoordinator`, ML Kit Translate) et indication « fonction serveur absente » dans l'interface.
- État par langue des demandes en cours (`translatingTextLanguages` / `translatingAudioLanguages`) conservé à travers la fermeture / réouverture de la feuille.

Rendu : Indicateur discret de langue (drapeau / badge) sur la bulle ; chargement par ligne de langue ; erreur non intrusive.

Transposition Android : DeviceTranslationCoordinator → ML Kit on-device Translation ; événements `translation:request` / `translation:failed` via SocketManager.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationViewModelTypes.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageLanguageStrip.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/LanguageFlagTapResolver.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/translation/TranslationRepository.kt`

### La citation d'une réponse naît complète (miniature, nature, protection) et ne saute pas à l'écho serveur

`chat-quoted-reply-reference` · Android : **partielle** · P1 · effort M

`QuotedReferenceFactory` compose la citation OPTIMISTE d'un message en mémoire, la même que l'écho serveur portera : auteur, couleur, avatar, aperçu texte servi dans la langue du lecteur (placeholder protégé pour vue unique / flouté / chiffré), pièce représentative (ou celle nommée), type, vignette ThumbHash, dimensions, durée, nature de sortie, anonymat de l'auteur, nombre de pièces visuelles. Les médias ne voyagent JAMAIS dans la citation d'un message protégé. Fabrique unique pour la bulle optimiste ET la bannière de réponse du composeur.

Écarts :
- Citation Android basique (auteur + extrait) : manquent vignette ThumbHash, dimensions / durée, type de pièce représentative, nombre de pièces visuelles, nature de sortie, anonymat de l'auteur.
- Protection : placeholder à la place du texte et AUCUN média (URL, vignette) dans la citation d'un message à vue unique / flouté / chiffré ou d'une pièce protégée.
- Fabrique unique alimentant la bulle optimiste et la bannière du composeur (aujourd'hui deux producteurs risquent de diverger) ; langue d'ORIGINE du message cité.
- Tap sur la zone lecture d'une citation audio (voir chat-audio-queue-player) ; tap ailleurs ramène au message (voir chat-jump-to-message-window).

Rendu : Bloc de citation avec barre colorée à la couleur de l'auteur, vignette carrée à gauche pour un média, icône de nature (vocal, photo, fichier), placeholder protégé.

Transposition Android : ReplyReference → modèle `replyTo` enrichi dans ApiMessage / BubbleContent.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/QuotedReferenceFactory.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+ReplyReference.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyJump.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`

### La couche REST des conversations couvre liste paginée, statut reçu / non lu, engagement, participants, droits et bannissement

`chat-sdk-conversation-rest` · Android : **partielle** · P1 · effort M

`ConversationService` expose la liste (offset et curseur `before`), la recherche, `getById`, l'engagement du lecteur (« N (M) 🔥 », `GET /conversations/:id/engagement`), la création, la suppression, `markRead` / `markAsReceived` / `markUnread`, les participants (liste, profil, droits, historique accordé avec plancher de `historyGrantFloor`), « supprimer pour moi », la mise à jour (`update`), `leave`, `ban` / `unban`, la conversation directe avec un utilisateur et les conversations partagées. `ConversationAnalysisService` sert l'analyse.

Écarts :
- Absents de `ConversationApi` : `POST …/mark-as-received`, `GET …/engagement` (série 🔥 affichée dans l'en-tête), `PATCH …/participants/{id}/unban`, `listSharedWith(userId)` (conversations en commun, fiche profil), `findDirectWith(userId)`.
- Liste par curseur `before` (`listPage`) avec `currentUserId` en plus de l'offset ; participants avec `cursor`.
- Droits fins de participant (`updateParticipantRights`) distincts de l'historique accordé ; plancher d'historique (`historyGrantFloor`).
- Mise à jour de conversation (`update`) : encodage des seuls champs modifiés (titre, description, avatar, bannière…).

Rendu : Aucune surface propre ; l'engagement 🔥 alimente l'en-tête de conversation.

Transposition Android : APIClient.request → interface Retrofit `ConversationApi` + `apiCall`.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ConversationApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`

### Toucher « Touchez pour afficher » ouvre un message à vue unique, une seule fois

`chat-view-once-open` · Android : **partielle** · P1 · effort M

Tant qu'il n'est pas ouvert, un message à vue unique est SCELLÉ dans les cinq modes de lecture (aucun mode ne reçoit son contenu). Le toucher de la puce « (1) · Touchez pour afficher » l'ouvre : un média s'ouvre en plein écran (l'hôte le présente, jamais révélé dans la bulle), un texte se lit sur place. L'ouverture est une donnée de la visite tenue par le ViewModel (`revealedViewOnceIds`), pas un état de feuille ; la consommation part au serveur (`consumeViewOnce`).

Écarts :
- Android ne rend que le tombeau « Vu et supprimé » (`Burned`) une fois `viewOnceCount > 0` ; aucun flux d'ouverture : ni puce « Touchez pour afficher », ni consommation côté client.
- Route de consommation (`POST …/messages/{id}/consume-view-once`, réponse `ConsumeViewOnceResponse`) absente de `MessageApi` ; événements `message:consumed` et `message:view-once-purged` non écoutés.
- Scellage du contenu avant ouverture (texte, pièces) dans tous les modes ; ouverture d'un média en plein écran présenté par l'hôte ; texte révélé sur place puis marqué révélé.
- Protection de capture / aperçu (cache dans les applications récentes `FLAG_SECURE`) et cohérence de l'aperçu d'appui long (ne consomme pas).

Rendu : Puce « (1) · Touchez pour afficher » à la place du contenu ; tombeau « Vu et supprimé » après consommation.

Transposition Android : Capture d'écran détectée → FLAG_SECURE ; plein écran → destination Compose dédiée.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+ViewOnce.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BubbleRenderKind.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`

### Un commentaire montre sa racine et ses deux premières réponses, déplie le reste, et propose éditer, supprimer, retirer, traduire

`chatthread-comment-thread-section` · Android : **partielle** · P1 · effort M

ThreadedCommentSection (extrait de FeedCommentsSheet, sert aussi PostDetailView) : racine + deux premières réponses en aperçu, puis le reste une fois déplié (onToggleThread), indicateur de chargement des réponses, bouton « Voir plus de réponses » quand le serveur a d'autres pages (endpoint paginé à 20), likes avec delta optimiste et état en vol, humeur/story/présence de la racine et résolveurs par réponse, réponse surlignée (cible d'une notification). Actions par ligne conditionnées : Supprimer et Modifier (contenu + effets visuels) seulement pour l'auteur, Retirer avec motif pour la modération plateforme (#11151, ContentRemovalPolicy), Demander la traduction vers la langue préférée du lecteur (endpoint à la demande), « Imager » un commentaire met le post en tête (#9686).

Écarts :
- Android a aperçu/dépli des réponses, likes, suppression et traduction par drapeau ; manquent Modifier un commentaire (contenu + effets), Retirer avec motif (modération), Imager un commentaire.
- Pagination des réponses (« Voir plus de réponses », 20 par page) et surlignage de la réponse ciblée par une notification.
- Humeur, anneau de story et présence sur les avatars de racine et de réponses.
- Delta de like optimiste avec état « en vol » par id.

Rendu : Racine avec avatar 40 dp, réponses indentées de 40 dp, bouton « Voir N réponses » en label medium semibold accent, tint de la réponse surlignée.

Transposition Android : CommentRowView -> CommentRow existant à enrichir.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ThreadedCommentSection.swift`

</details>

Android existant : `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsSection.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/PostCommentsViewModel.kt`, `apps/android/feature/feed/src/main/kotlin/me/meeshy/app/feed/CommentThreadState.kt`

### Les réglages d'une conversation se modifient dans une fiche : visuel, infos, permissions, membres, zone dangereuse

`chatthread-conversation-settings` · Android : **partielle** · P1 · effort M

ConversationSettingsView (SDK) : en-tête, section visuelle (bannière héros avec avatar éditables par PhotosPicker, compression avant envoi, toasts d'upload réussi/échoué), section Infos (titre et description multiligne 3-6), section Permissions visible pour ADMIN+ (qui peut écrire : Tout le monde / Membres / Modérateurs / Admins en segmenté désactivé en mode annonce ; mode annonce ; mode lent 0/10 s/30 s/1 min/5 min ; traduction automatique), section Membres (recherche, rôle créateur/admin/modérateur, menu d'actions : promouvoir admin, promouvoir modérateur, rétrograder en membre, expulser, bannir, débannir — les routes filtrent sur la colonne userId, pas participant.id), zone dangereuse (quitter avec confirmation, supprimer pour moi avec confirmation, supprimer pour tous seulement pour qui en a le droit, conversation fermée pour tous les membres). Alertes d'erreur et toasts de réussite pour chaque action. Retour d'une conversation mise à jour (onUpdated) et sortie (onLeft).

Écarts :
- Android n'a que les permissions (qui écrit, annonce, mode lent, traduction auto) réservées aux modérateurs+ : ajouter édition du titre/description, avatar et bannière (upload compressé, toasts), zone dangereuse (quitter, supprimer pour moi, supprimer pour tous).
- Débannir (unban) et liste des bannis absents du sheet de membres ; menu de rôles complet aligné (promouvoir admin/modérateur, rétrograder, expulser, bannir).
- Mode lent : paliers 10 s / 30 s / 1 min / 5 min (vérifier l'alignement avec les secondes Android).
- Alertes de confirmation (quitter, supprimer pour moi, supprimer pour tous) avec leurs messages et toasts de réussite.
- Remonter la conversation confirmée (onUpdated) pour repeindre l'en-tête ; fermeture et sortie (onLeft) après quitter/supprimer.

Rendu : Fiche défilante en sections avec en-têtes, champs sur fond secondaire arrondi sm, interrupteurs teintés accent, zone dangereuse en boutons rouges, bannière héros avec avatar superposé et icône d'édition.

Transposition Android : PhotosPicker + compression -> PickVisualMedia + Bitmap.compress (500 Ko) ; Picker segmenté -> SingleChoiceSegmentedButtonRow.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationSettingsView.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationSettingsSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationSettingsViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMembersSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMembersViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationSettingsForm.kt`

### Supprimer un message demande « pour moi » ou « pour tous », sauf un envoi jamais parti qui disparaît tout de suite

`chatthread-delete-message-flow` · Android : **partielle** · P1 · effort S

Point d'entrée UNIQUE pour demander la suppression (bulle, barre rapide, menu d'appui long, menu natif). Un message jamais envoyé (.failed) n'a rien à confirmer : « pour tous » n'a aucun sens et « pour moi » ne présente aucun risque, donc suppression locale immédiate sans dialogue. Sinon un confirmationDialog ancré dans la conversation propose Supprimer pour moi (conversation.view.delete_for_me) et Supprimer pour tous (conversation.view.delete_for_everyone, avec indication), titre conversation.view.delete_message.title ; « pour tous » n'est offert que sur ses propres messages non supprimés dans la fenêtre autorisée (ContentRemovalPolicy, #11214). La suppression de sélection suit les mêmes règles (« pour moi » en UNE requête).

Écarts :
- Android supprime directement depuis la feuille sans dialogue de confirmation : ajouter le dialogue pour tous/pour moi avec libellés et indication.
- Suppression locale immédiate (sans dialogue) d'un message en échec d'envoi.
- Un point d'entrée unique requestDeleteMessage partagé par bulle, barre rapide, menu d'appui long et sélection.
- Prise en compte de la politique ContentRemovalPolicy (modération plateforme) pour retirer le message d'un autre.

Rendu : Dialogue à deux actions destructives (rouge) + Annuler ; feedback haptique d'avertissement à l'ouverture.

Transposition Android : confirmationDialog -> AlertDialog / BottomSheet de confirmation ancré dans l'écran.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageDeletability.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/LocallyHiddenMessagesStore.kt`

### Le brouillon survit à tout : texte, réponse, langue, effets, flou, éphémère et pièces

`chatthread-draft-persistence` · Android : **partielle** · P1 · effort S

ConversationDraftCoordinator persiste tout l'état de composition (texte, citation en ligne, langue choisie, effets, flou, durée éphémère) pour que rien ne se perde quand l'app est tuée en pleine phrase ; les brouillons vides sont purgés. Persistance immédiate en fin de mot ou champ vidé, débouncée de 400 ms en milieu de mot ; un SEUL déclencheur surveille citation/langue/effets/flou/éphémère. Les refs de pièces jointes sont l'autorité du handler d'arrière-plan (copie durable) : une frappe intermédiaire les PRÉSERVE. À la reprise, les vignettes des pièces restaurées sont décodées HORS du fil principal à 1 024 px (même borne que le chemin nominal, car la sortie de la retouche réécrit le fichier), pour ne pas coûter ~140 Mo et plusieurs dizaines de ms à la première image.

Écarts :
- ConversationDraft ne contient ni références de pièces jointes ni vignettes : ajouter les refs durables (copie interne) du plateau, préservées par les frappes intermédiaires, et restaurées à l'ouverture.
- Décoder les vignettes restaurées hors du thread principal à 1 024 px (ImageDecoder/Coil) pour ne pas retarder la première frame.
- Persistance des pièces au passage en arrière-plan et à la disparition de l'écran ; purge du brouillon vide.
- Vérifier le débounce 400 ms avec flush immédiat en fin de mot ou champ vidé.

Rendu : Aucun visuel propre : le plateau d'attachements se repeint à l'identique avec ses tuiles de ~56 pt.

Transposition Android : UserDefaults DraftStore -> DataStore + dossier interne files/drafts ; ImageIO downsampling -> ImageDecoder.setTargetSize.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+DraftCoordinator.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+DraftThumbnails.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/DraftAutosave.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationDraft.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/ConversationDraftStore.kt`

### Transférer un message ou une pièce vers d'autres conversations depuis un écran de partage unique

`chatthread-forward-share` · Android : **partielle** · P1 · effort M

« Transférer » ouvre l'écran de partage unique (sheet) avec pour sujet la pièce choisie (menu d'une pièce) ou le message et la sélection multiple ; la feuille se referme AVEC le groupe (#4005) et le plein écran du composeur ne se présente qu'une fois la feuille démontée. Elle offre « Enregistrer » (loi de sortie MessageExitTransport), « Imager la discussion » (la discussion chargée jusqu'au message choisi, dans la langue du lecteur, partagée en image via l'atelier « Imagine », absent quand la discussion n'a rien à peindre ou cite un contenu protégé #9573) et un second point d'entrée vers l'appui long. Les couvertures de composition (ConversationComposeCovers) portent la porte du composeur média (créer avec ce média) et l'aperçu d'un média cité.

Écarts :
- Android ne transfère qu'UN message vers UNE conversation (ForwardPickerSheet) : ajouter le transfert d'une pièce précise et de la sélection multiple dans l'ordre du fil.
- Entrées « Enregistrer » et « Imager la discussion » de l'écran de partage.
- Séquençage fiable des présentations (feuille démontée avant le plein écran du composeur).
- Couverture « créer avec ce média » (story/réel/post) et aperçu plein écran d'un média cité.
- Interdire le transfert des messages protégés (loi de sortie) en masquant le bouton au lieu de le griser.

Rendu : Feuille avec liste de destinations, aperçu du contenu transféré en tête, bouton envoyer accent.

Transposition Android : écran de partage -> ModalBottomSheet plein écran avec recherche de destinations ; UIActivityViewController -> ACTION_SEND.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+Forward.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+Presentations.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ForwardTargets.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ShareTargetViewModel.kt`

### Réagir, répondre ou créer avec le média depuis le plein écran, et un menu ⋯ pour enregistrer ou partager

`chatthread-gallery-actions-menu` · Android : **partielle** · P1 · effort M

Une colonne verticale d'actions (disques de verre de chrome plein écran 40 pt, cibles 44 pt : un doigt qui RATE une action atterrirait sur le cadre et entrerait en plein écran) à droite du cadre : Réagir (affiche la traînée d'émojis au-dessus du bloc bas, échelle 1,5, défilable, ouverte seulement à la demande, refermée par un second appui, un choix ou un changement de page), Répondre (route décidée par FullscreenReplyRoute : barre universelle AU-DESSUS du média sans fermer, ou renvoi au fil, ou aucun ; jamais pour un média protégé), Créer avec ce média (composeur story/réel/post). Chaque action n'existe que si la pièce l'offre (loi 4 : un contrôle sans effet est ABSENT) et une pièce protégée n'a même pas d'entrée. Le menu ⋯ du couloir haut (GalleryExitGatedMenu) enregistre/partage la pièce courante : une page porte une ŒUVRE (scène de post, export baké) ou une PIÈCE jamais les deux, avec note de marque (gallery.menu.brand.meeshy/none) et gallery.menu.share ; haptique légère.

Écarts :
- Android n'a que le bouton « Enregistrer » en haut à droite : ajouter la colonne d'actions Réagir / Répondre / Créer avec ce média (disques 40 dp, cibles 44 dp) et le menu ⋯.
- Traînée d'émojis ouverte à la demande, couche supérieure sans rognage, marge basse = gouttière du plateau (MediaStageVeil).
- Route de réponse (composer en place au-dessus du média / renvoi / aucune) et interdiction pour un média protégé (ComposableAttachment.isProtected).
- Menu ⋯ : Enregistrer, Partager hors de Meeshy (ACTION_SEND), sujet œuvre vs pièce, note de marque, haptique.
- Chaque contrôle absent si la pièce ne l'offre pas (hôtes sociaux : pas de réaction par média).

Rendu : Disques de verre adaptatifs 40 dp, glyphe fixe (doctrine 82i, ne scale pas), colonne alignée à droite du cadre, traînée d'émojis scrollable à l'échelle 1,5 par-dessus tout.

Transposition Android : FullscreenActionButton -> IconButton dans Surface translucide ; UIActivityViewController -> ACTION_SEND ; sauvegarde -> MediaStore (GalleryImageSaver existe).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Actions.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Menu.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/GalleryImageSaver.kt`

### La légende d'un média se lit dans ma langue, se dénoue au tap et se traduit par une rangée de drapeaux

`chatthread-gallery-captions` · Android : **partielle** · P1 · effort M

Sous le média, un bloc auteur / date / légende / format. La légende servie est le texte de la langue courante — SOURCE UNIQUE pour l'affichage ET VoiceOver (un lecteur d'écran qui énoncerait une autre langue que celle affichée affirmerait quelque chose de faux). La rangée de langues se pose au-DESSUS du bandeau (pas dedans, car le bandeau se déplie au tap : deux gestes sur une même surface), ordonnée pour ne pas danser d'un rendu à l'autre, métriques de la rangée méta d'un réel (32 pt), ABSENTE quand il n'y a rien à basculer. La langue choisie est PAR MÉDIA ; le repli de la légende (captionExpanded) se remet à chaque page. Le bloc de métadonnées affiche l'auteur (avatar + nom + date) seulement si l'information est fournie, puis « largeur × hauteur · poids · durée » (la durée est la feuille qui observe le moteur) ; une scène n'a ni format, ni dimensions, ni poids. Libellés VoiceOver par pièce (imageAccessibilityLabel).

Écarts :
- Android affiche la légende du message telle quelle et une ligne « auteur · temps » : ajouter le bloc complet avec avatar de l'auteur, date, dimensions, poids, durée, format.
- Légende multilingue (captionServings) avec rangée de drapeaux au-dessus du bandeau, langue choisie par média, absente s'il n'y a rien à basculer, ordre stable.
- Bandeau de légende dépliable au tap et repli remis à chaque page.
- Libellé TalkBack = même texte que l'affichage ; liens suivis de la légende (captionLinks).
- Une scène n'affiche ni format, ni dimensions, ni poids.

Rendu : Rangée de langues 32 dp au-dessus d'un bandeau voilé, légende en body medium blanc sur dégradé, ligne méta en caption avec point médian, avatar de l'auteur 24 dp.

Transposition Android : drapeaux emoji -> même rendu texte ; VoiceOver label -> contentDescription.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+Captions.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+CaptionLanguages.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView+MediaMetadata.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/viewer/MeeshyImageViewer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`

### Appeler depuis l'en-tête : menu vocal/vidéo, retour à l'appel en cours, rejoindre un appel perdu

`chatthread-header-call-controls` · Android : **partielle** · P1 · effort S

Le créneau d'appel de l'en-tête ne lit qu'un instantané d'appel (CallHeaderSnapshot), sans s'abonner au gestionnaire d'appel. Au repos : un menu d'appel (vocal / vidéo ; pour un groupe, appel de la conversation avec le CallKit du groupe). Appel actif ICI : pastille verte avec la durée « Toucher pour revenir » (jamais un deuxième appel depuis l'en-tête). Appel perdu côté appareil (relance, crash) mais vivant côté serveur : pastille « Rejoindre », réconciliée par REST (ActiveCallService) à chaque changement de conversation ou début/fin d'appel local. Un lecteur qui ne peut pas lancer d'appel (#10207) rejoint seulement un appel en cours. Le créneau n'existe que si la conversation s'appelle ; l'engagement est revalidé en même temps.

Écarts :
- Regrouper appel vocal et vidéo dans un seul menu en capsule de verre (libellés call.start.menu, call.start.audio, call.start.video ; version groupe call.group.start.menu) au lieu de deux icônes séparées.
- Pastille verte « Toucher pour revenir » avec durée vivante lorsqu'un appel local est actif dans cette conversation (call.header.return) ; Android masque seulement la pastille de rejoindre.
- Appel de groupe lancé depuis l'en-tête (callee = conversation) et règle canStart = false : lecteur sans droit d'appel ne peut que rejoindre.
- Revalider la réconciliation à chaque changement d'appel local (début/fin) et pas seulement à la reprise de l'écran.
- Libellés VoiceOver/TalkBack call.header.rejoin.a11y et aides contextuelles du menu.

Rendu : Cercle de verre 28 pt, cible 44 dp ; pastille verte success avec durée en chiffres monospace ; pastille Rejoindre en accent ; icônes téléphone/caméra remplies.

Transposition Android : CallKit/CallHeaderSnapshotStore -> Telecom ConnectionService + état d'appel observable (StateFlow) ; pastille -> chip persistant.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationLayers/ConversationHeaderCallButton.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/RejoinPillPolicy.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallPill.kt`

### Un appel entrant sonne en plein écran : anneaux pulsants, avatar, accepter, refuser ou refuser avec un message

`chatthread-incoming-call-screen` · Android : **partielle** · P1 · effort M

IncomingCallView (bannière in-app, app au premier plan) : fond sombre fixe, anneaux concentriques (4 anneaux de 120 + 35 pt, dégradé success 0,4 -> indigo400 0,2, pulsation 1,2 s décalée de 0,2 s) autour de l'avatar qui rebondit au ressort, nom de l'appelant (police ronde title semibold blanc, repli « Inconnu »), libellé « Appel entrant » / « Appel vidéo entrant », badge de type, bouton d'écoute de l'appelant avant de décrocher (CallPreviewSoundButton, #8480), aperçu vidéo de l'appelant en fond plein écran (CallPreviewBackdrop, 2026-09-30), boutons accepter/refuser et « Refuser avec un message » (CallDeclineSheet). Accepter tranche les permissions AVANT de répondre : micro refusé => on raccroche (un appel accepté sans micro se connecte muet) ; caméra refusée => on répond en audio. Annonce VoiceOver à l'apparition (call.incoming.a11y.announced). Animations coupées sous Reduce Motion. Sur le chemin CallKit, l'UI système répond et CallManager.answerCall porte la garde de repli.

Écarts :
- L'écran d'appel Android réutilise CallScreen avec accepter/refuser ; ajouter les anneaux pulsants, rebond de l'avatar, libellés vocal/vidéo et badge de type.
- « Refuser avec un message » (CallDeclineSheet) absent.
- Aperçu avant de décrocher : bouton d'écoute de l'appelant et fond vidéo de l'appelant.
- Règles de permissions : micro refusé => raccrocher ; caméra refusée => répondre en audio (partiellement présent via withMediaPermissions).
- Annonce TalkBack à l'apparition, respect de la réduction des animations.

Rendu : Fond sombre fixe (texte blanc), anneaux dégradés vert/indigo, avatar central 120 dp rebondissant, boutons accepter (vert) et refuser (rouge) en bas, sous-bouton « Refuser avec un message ».

Transposition Android : CallKit/PushKit -> Telecom ConnectionService + notification plein écran FCM haute priorité ; bannière in-app -> écran IncomingCall plein écran ; sonnerie -> CallToneController.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/IncomingCallView.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/IncomingCallViewModel.kt`, `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallToneController.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/DeclineCallReceiver.kt`

### L'appui long sur une ligne de liste ouvre un menu à icônes dessinées avec sous-panneaux Favori et Déplacer vers

`chatthread-list-context-menu` · Android : **partielle** · P1 · effort M

Menu contextuel custom (le menu natif iOS 26 n'affiche pas les icônes SF) de 260 pt de large, self-contained (aucun couplage à la liste ni aux gestionnaires), cascadant root -> Favori / Déplacer vers / Plus par un enum Panel avec en-tête retour. Racine : Épingler/Désépingler, Mettre en silence/Réactiver, Marquer lu/non lu, Détails, Renommer (selon capacités). Favori : huit emojis (⭐️❤️🔥💎🎯✨🏆💡) ou retirer. Déplacer vers : chaque section/catégorie puis « Mes conversations ». Plus : Inviter mes amis, Verrouiller/Déverrouiller, Archiver/Désarchiver (retiré pour Global d'un mineur, #9929), Bloquer/Débloquer (DM bloquables), Signaler, Ouvrir dans l'admin, Quitter, Supprimer. Les verdicts viennent de la loi partagée ConversationActionPolicy (#11215) — les MÊMES que le menu natif. Hauteur de rangée et colonne d'icônes scalées avec Dynamic Type ; chaque entrée est exposée comme action nommée à VoiceOver ; MenuRowHighlightButtonStyle.

Écarts :
- Android couvre épingler, silence (avec mentions seulement), lu/non lu, favori, renommer, verrouiller, catégories, étiquettes, archiver, quitter, supprimer ; manquent Détails, Inviter mes amis, Bloquer/Débloquer (DM), Signaler, Ouvrir dans l'admin.
- Loi partagée ConversationActionPolicy pour décider des entrées (archiver retiré pour Global d'un mineur, quitter/supprimer selon le rôle).
- Sous-panneau Favori à huit emojis fixes (vérifier l'alignement) et sous-panneau Déplacer vers avec « Mes conversations ».
- Actions nommées TalkBack pour toutes les entrées, hauteur de rangée scalée à la taille de police.

Rendu : Carte de verre 260 dp, rangées 44 dp min avec colonne d'icônes 24 dp, séparateurs fins, entrées destructives en rouge, icône + label.

Transposition Android : contextMenu -> Popup/DropdownMenu avec panneaux en cascade.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationContextMenuView.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationCategoryReassignment.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`

### À froid un squelette de bulles, en cas d'erreur une bannière fermable sous l'en-tête

`chatthread-loading-error-states` · Android : **partielle** · P1 · effort S

Squelette de démarrage à froid : six fausses bulles alternant gauche/droite (SkeletonMessageBubble) empilées avec 96 pt de marge haute (alignement sur la transition du dégradé) et la réserve basse du composeur, libellé a11y conversation.view.loading_messages. Il n'apparaît que si la pagination demande un spinner bloquant ET qu'il n'y a aucun message (jamais sur un cache non vide). Bannière d'erreur : verre ultraThin, triangle d'alerte warning, texte caption sur 2 lignes, bouton xmark.circle.fill (a11y « Fermer »), glisse depuis le haut sous la bande d'en-tête (72 pt déplié, 56 replié).

Écarts :
- Bannière d'erreur dismissible quand la liste n'est pas vide (Android n'affiche ChatNotice que si messages.isEmpty ; une erreur d'envoi ou de synchro avec des messages affichés reste invisible).
- Aligner le squelette sur iOS : six bulles alternées, marge haute 96 dp, bas réservé au composeur, libellé TalkBack.
- Marge de la bannière dépendante de l'état replié/déplié de l'en-tête.

Rendu : Bannière : HStack avec icône warning, texte caption max 2 lignes, fermer secondary ; padding md/sm ; squelette horizontal 14 dp (md+2) de marge.

Transposition Android : .ultraThinMaterial -> surface translucide ; transition move(edge: .top)+opacity -> AnimatedVisibility slideInVertically + fadeIn.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+Skeleton.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView+ErrorBanner.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/MeeshySkeleton.kt`

### La feuille « Plus… » d'un message regroupe traductions, vues, historique d'édition, partage et actions avancées

`chatthread-message-more-sheet` · Android : **partielle** · P1 · effort M

Quatre feuilles pilotées par un seul état de surcouche et un seul message visé : (1) MessageMoreSheet — sections issues de MessageActionResolver, onglet initial (par exemple Vues quand on touche les coches), traductions texte et transcription audio, audios traduits, révisions d'édition, répondre, transférer (arme la sélection multiple), ouvrir le fil de réponses, enregistrer ou supprimer le média, épingler (haptique moyenne), étoile, favori de sticker, supprimer, modifier, copier (haptique succès), partager, « Imager », réagir, choisir la traduction ou la langue audio, signaler (type + motif, haptique succès/erreur), demande de traduction texte/audio avec indicateurs par langue et échec publié, mode serveur sans fonctions (chiffrement) ; (2) détail d'appel (CallSummaryDetailSheet, rappeler) ; (3) sélecteur d'emoji complet catégorisé, sans recherche ni bouton Close, chrome verre ; (4) partage et fil de réponses (ThreadView).

Écarts :
- Onglet « Vues » : qui a reçu / qui a lu un message (GET /messages/:id/read-status), ouvrable aussi depuis un tap sur les coches de la bulle.
- Historique des révisions d'édition d'un message (editRevisions) et affichage de la transcription audio avec traductions audio sélectionnables.
- Feuille de détail d'appel (CallSummaryDetailSheet) avec « rappeler » pour les messages de résumé d'appel.
- Copier ce que la bulle AFFICHE (Prisme, drapeau basculé compris) avec haptique succès ; partager le message (feuille de partage), « Imager », enregistrer/supprimer le média via un coordinateur d'enregistrement unique.
- Sélecteur d'emoji catégorisé (6 catégories) sans recherche ; « Transférer » qui arme la sélection multiple.
- Indicateurs de traduction en cours par langue, échec de demande publié, fonctions serveur absentes en conversation chiffrée.
- Étoile avec nom et accent de la conversation (StarredMessages existe), favori de sticker, signalement avec type + motif (ReportMessageSheet existe).

Rendu : Sections groupées en listes à icônes colorées, chrome verre iOS 26 -> surface élevée Material3 ; picker emoji avec onglets de catégories.

Transposition Android : sheet(item:) -> ModalBottomSheet pilotée par un état unique ; HapticFeedback.success/error -> HapticFeedbackType.Confirm/Reject (API 30+).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageSheets.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageActionMenu.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReportMessageSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReactionBreakdown.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageDetailExplorer.kt`

### Rechercher dans la conversation : barre en verre, résultats filtrés avec terme surligné et bandeau du nombre de résultats

`chatthread-message-search` · Android : **partielle** · P1 · effort M

Le bouton loupe de l'en-tête (ou l'entrée « Rechercher » du menu de liste, consommée à l'ouverture et à chaud après 250 ms) fait glisser une barre de recherche en verre : champ avec loupe, effacer (xmark.circle.fill), indicateur de progression, bouton « Fermer ». La frappe est débouncée de 400 ms ; à partir de 2 caractères le serveur est interrogé (searchMessages) et le fil de derrière est FILTRÉ en place sur les seuls messages correspondants, terme surligné ; sous 2 caractères la recherche se termine et la conversation complète revient. Un bandeau fin non interactif annonce « Recherche… », « Aucun résultat » ou « N résultat(s) ». Fermer annule le debounce, remet la fenêtre complète et vide l'état. Les gestes sur les bulles filtrées restent actifs.

Écarts :
- Recherche serveur : l'endpoint GET conversations/{cid}/messages/search existe dans MessageApi mais n'est appelé nulle part ; Android ne cherche que dans la fenêtre déjà chargée.
- Debounce 400 ms, seuil 2 caractères, annulation du debounce à la fermeture, état « recherche en cours » avec indicateur.
- Mode filtré : n'afficher que les messages correspondants (fenêtre de recherche du store) avec terme surligné, au lieu de la navigation précédent/suivant sur la liste complète.
- Bandeau de résultats (conversation.view.search.searching / no_results / results_count) et bouton Fermer (conversation.view.search.close), bouton effacer.
- Consommer la demande de recherche venue du menu de liste (pendingOpenSearch) y compris quand la conversation est déjà à l'écran, et après déverrouillage PIN.

Rendu : Barre : glass rayon lg teinté accent (opacity light), ombre noire subtle 4 y2, champ fond surfaceFill rayon sm, glisse depuis le haut avec fondu ; bandeau capsule ultraThinMaterial, texte small medium, icône text.magnifyingglass (magnifyingglass si zéro résultat).

Transposition Android : FocusState -> FocusRequester ; adaptiveGlass -> surface translucide.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatSearch.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/MessageApi.kt`

### Une conversation verrouillée par PIN demande son code quel que soit le chemin d'ouverture

`chatthread-open-route-pin-lock` · Android : **partielle** · P1 · effort S

Le verrou par PIN d'une conversation n'est vérifié qu'À L'OUVERTURE depuis la liste : ni le fil ni le routeur ne le revérifient. Tout chemin qui ouvre une conversation depuis la liste (toucher d'une rangée, clavier, carte d'aperçu, sa loupe, entrée « Rechercher » du menu natif) lit donc ConversationOpenRoute.resolve : ouvrir (avec ou sans recherche armée) ou déverrouiller d'abord. La recherche demandée sur une conversation verrouillée attend le PIN : armée avant, elle survivrait à un PIN abandonné et s'ouvrirait dans la prochaine conversation venue. Une fenêtre détachée (iPad) ne s'offre qu'à une conversation que le PIN ne garde pas.

Écarts :
- Vérifier toutes les entrées : le verrou n'est consulté que dans ConversationListScreen ; une notification, un lien profond, un partage ou la barre de recherche globale ouvrent la route chat/{id} sans PIN (faille de confidentialité).
- Loi pure ConversationOpenRoute (open(searching) | unlockFirst(searching)) partagée par tous les chemins d'ouverture.
- Recherche demandée mais en attente du PIN (searchesAfterUnlock) : armée seulement après déverrouillage, abandonnée si le PIN l'est.
- Fenêtre secondaire (tablette/pliable multi-fenêtre) interdite pour une conversation verrouillée.

Rendu : Feuille PIN réutilisée de la liste ; aucun élément propre.

Transposition Android : Router.pendingOpenSearch -> argument de navigation ; fenêtre détachée iPad -> multi-fenêtres Android (freeform).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationOpenRoute.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationLockPinSheet.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/LockPinReducer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/lock/ConversationLockStore.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListScreen.kt`

### Vue unique, flou, éphémère et chiffré se disent partout par un même chrome : puce « (1) Touchez pour afficher », décompte, flamme-œil, combustion

`chatthread-protection-chrome` · Android : **partielle** · P1 · effort M

MessageProtectionChrome est UN point d'entrée pour les cinq modes de lecture (focal, script, summary, river, bubbles) : le décompte d'un éphémère n'existait qu'en Focal/Script et en Bulle, pas en Résumé ni en Rivière. Aucun minuteur dans le composant (Equatable, descripteur de badges), capsules de protection teintées. ViewOnceChip : le « 1 » cerclé REMPLACE le mot « Vue unique » (directive 2026-09-23), une ligne jamais tronquée — scellée « (1) · Touchez pour afficher » (protection.view_once.chip.sealed), puis « (1) · Déjà ouvert » fond MOINS prononcé (protection.view_once.chip.opened) ; une vue unique non ouverte ne montre QUE la puce (contenu absent du rendu, pour l'œil ET le lecteur d'écran), et VoiceOver dit si le toucher ouvre un plein écran ou lit sur place (#8009). FlameEyeGlyph : une flamme qui porte un œil (l'éphémère déclenché par la LECTURE), l'œil découpé (destinationOut) donc lisible sur tout fond ; AfterReadWatermark pose une grande flamme-œil discrète en filigrane dans la gouttière entre le bord de la rangée et le contenu (jamais sur le texte). EphemeralBurnEffect : quand un éphémère est détruit sous les yeux du lecteur, la bulle se consume (rétrécit, se dore, s'efface) pendant EphemeralBurn.fullDuration, le retrait de la ligne attend la même durée puis les voisins se resserrent — l'effet rend l'événement compréhensible au lieu d'un saut.

Écarts :
- Puce de vue unique « (1) · Touchez pour afficher » / « (1) · Déjà ouvert » (états sealed/opened) remplaçant l'actuel brouillard de flou ; contenu absent du rendu et de TalkBack tant qu'elle n'est pas ouverte, libellé d'action précis.
- Chrome de protection unique (flou, vue unique, éphémère, chiffré) avec descripteur de badges et capsules teintées, réutilisable par tous les modes de lecture.
- Glyphe flamme-œil et filigrane AfterReadWatermark dans la gouttière avant le contenu.
- Effet de combustion à la destruction d'un éphémère (rétrécir, dorer, effacer ; retrait de la ligne après la même durée constante) quand le lecteur est dans la conversation ; Android réduit simplement la bulle.
- Consommation serveur d'une vue unique (le TODO « later, the server view-count consume » de BubbleBlurRevealSpec) à l'ouverture.

Rendu : Capsule de puce sur une ligne, chiffre « 1 » cerclé, teinte de protection, fond moins prononcé une fois ouverte ; flamme-œil en filigrane grand format, opacité faible, jamais sous le texte ; combustion : échelle <1, teinte or, fondu en ~600 ms.

Transposition Android : destinationOut -> BlendMode.DstOut dans un graphicsLayer(CompositingStrategy.Offscreen) ; effet de combustion -> animateFloat + graphicsLayer.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Conversation/MessageProtectionChrome.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ViewOnceChip.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Conversation/FlameEyeGlyph.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Conversation/EphemeralBurnEffect.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/EphemeralCountdownBadge.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BubbleRenderKind.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BlurRevealLifecycle.kt`

### Une barre flottante d'emojis rapides et d'actions apparaît sous le message touché

`chatthread-quick-reaction-bar` · Android : **partielle** · P1 · effort S

Le bouton « + » de réaction d'une bulle (onAddReaction, avec haptique légère) ferme l'éventuel overlay d'appui long puis fait jaillir au ressort une barre ancrée sous la bulle (QuickReactionBarPlacement : toujours sous la bulle avec 16 pt d'écart, bornée pour rester entièrement à l'écran, jamais sous l'en-tête 96 pt) ; un fond transparent plein écran la ferme au tap et bloque le défilement. Elle contient le sélecteur partagé EmojiReactionPicker (15 emojis les plus utilisés via EmojiUsageTracker avec défauts 👍❤️😂😮😢🙏🔥🎉💯😍👀🤣💪✨🥺, largeur 280 pt, défilable, « + » qui ouvre le sélecteur catégorisé complet après 0,35 s) et, hors mode emoji seul, une rangée d'actions Répondre / Copier (si la loi de sortie l'offre, copie ce que la bulle AFFICHE, drapeau basculé compris) / Transférer (si transférable) / Supprimer, cadre 60x44 icône + micro-label 9 pt.

Écarts :
- Barre flottante ancrée sous la bulle (placement borné, bascule selon la place) accessible depuis un bouton « + » sur la bulle ; Android n'a l'EmojiQuickStrip que dans la feuille d'actions.
- Rangée d'actions rapides Répondre/Copier/Transférer/Supprimer conditionnée par la loi de sortie, avec libellés 9 pt.
- Sélecteur complet catégorisé (Reactions, Visages, Gestes, Cœurs, Animaux, Objets) sans fermeture du clavier standard, ouvert après 350 ms depuis le « + » ; enregistrement de l'usage (EmojiUsageTracker) à chaque choix.
- Fond transparent plein écran qui ferme au tap et bloque le défilement ; haptique légère à l'ouverture.

Rendu : Capsule ultraThinMaterial avec bord accent hairline et ombre noire subtle 8 y4, transition scale 0.8 + opacité, emojis défilables dans 280 dp.

Transposition Android : EmojiReactionPicker (SDK) -> EmojiQuickStrip existant à réutiliser ; ultraThinMaterial -> surface translucide.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/reaction/EmojiUsageStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EmojiUsageRanker.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/EmojiPicker.kt`

### Répondre à un message, à une pièce ou à un mood, avec une citation qui survit à l'abandon du brouillon

`chatthread-reply-composition` · Android : **partielle** · P1 · effort M

triggerReply arme une citation (ReplyReference) dans le composeur, y compris pour une PIÈCE précise d'un message (média cité), puis demande le focus du champ (ouverture de conversation comprise). Réponse à un mood affiché dans la barre directe : le contexte du routeur est appliqué à la conversation déjà à l'écran, refusé (et conservé pour son DM) si c'est une autre conversation. ReplyContextCleaner purge atomiquement la référence en mémoire ET le replyToId persisté avec le brouillon (sans toucher texte et pièces) à l'envoi comme à l'annulation, sinon la bannière réapparaissait à la réouverture. Toucher la vignette d'une vidéo ou d'un son cité par la réponse en cours ouvre un plein écran qui joue la pièce avec le lecteur COMMUN (pas un AVPlayer nu, ni la vignette) sans sortie (ni enregistrer ni partager) ; une image cité s'ouvre en plein écran avec porte de sortie. Aperçu média (PreviewMedia) et édition d'un audio en attente (PendingAudioEdit).

Écarts :
- Citer une pièce précise d'un message (média cité) et afficher sa vignette dans la bannière de réponse ; interdit pour un média protégé (vue unique, flou, chiffré).
- Plein écran de lecture d'une vidéo/son cité avec le lecteur commun, sans actions de sortie ; image citée en plein écran.
- Purge atomique de la citation en mémoire et du replyToId persisté (envoi et annulation) ; vérifier que persistDraft(replyToId = null) couvre tous les chemins.
- Réponse à un mood (contexte du routeur appliqué à la conversation déjà ouverte, conservé pour un autre DM) et demande de focus du champ.
- Édition d'un audio en attente (rognage/aperçu) depuis la pastille du plateau.

Rendu : Bannière de citation au-dessus du champ avec nom de l'auteur, extrait, vignette de pièce et bouton fermer ; l'accent de la conversation colore la barre latérale.

Transposition Android : ReplyReference -> état de ChatViewModel déjà présent (replyingToMessageId) à enrichir d'une pièce.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReplyContextCleaner.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationPresentedMedia.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/SwipeToReply.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/DraftAutosave.kt`

### Le fil de discussion d'un message s'ouvre en plein écran avec ses réponses et un composeur

`chatthread-reply-thread-screen` · Android : **partielle** · P1 · effort M

ThreadView : écran en-tête (retour accent + titre « Discussion » + « N réponses »), contenu défilant (message parent dans une carte surfaceGradient teintée accent avec avatar, nom, date relative et texte protégé de capture, séparateur « N réponses » avec filets accent, liste paresseuse de réponses avec avatar de commentaire, nom coloré, date relative, texte) et barre de composition basse avec erreur d'envoi (thread.send.error). Cache-first : les réponses sont semées depuis le cache de la conversation seulement s'il n'y a encore rien à montrer (jamais un remplacement qui perdrait une réponse optimiste venant d'être envoyée), puis rechargées par le réseau dont l'échec conserve l'existant. Les avatars portent humeur, présence et anneau de story ; texte protégé de capture (captureShield) selon la loi de sortie.

Écarts :
- Android ouvre une feuille en lecture seule (ReplyThreadSheet, titre chat_reply_thread_title) : ajouter un composeur pour répondre dans le fil, avec envoi optimiste et erreur d'envoi, et l'écran plein ouvert depuis la feuille Plus.
- Parent en carte teintée avec avatar, présence, humeur et anneau de story ; dates relatives vivantes ; séparateur « N réponses » à filets accent.
- Chargement cache-first sans écraser une réponse optimiste ; échec réseau qui garde l'existant.
- Protection capture d'écran pour les contenus protégés (FLAG_SECURE par message impossible : masquer le texte).

Rendu : Carte parent arrondie md avec contour accent 1 dp, réponses en lignes avec avatar 32 dp, séparateur centré « N réponses » en caption bold accent.

Transposition Android : écran poussé sur NavigationStack -> destination de navigation ou ModalBottomSheet plein écran.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ThreadView.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyThreadOverlay.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyThreads.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### La conversation ouvre le lecteur de stories depuis l'avatar d'en-tête, l'anneau ou la citation d'une bulle

`chatthread-story-viewer-from-thread` · Android : **partielle** · P1 · effort S

Une conversation ouvre le lecteur de stories de deux endroits : l'avatar de son en-tête (ou un membre de la pile) et l'anneau ou la citation d'une bulle (onViewSenderStory, onStoryReplyTap). Chacun garde son état ; les deux se projettent en UNE StoryViewerRequest (ConversationStoryReaderRequest) que monte le couvercle UNIQUE du lecteur (StoryReaderCover, #11197) — le même que les racines et les favoris. Transition zoom depuis l'avatar (namespace RootView, iOS 18+). Story indisponible : toast conversation.storyUnavailable.

Écarts :
- Le lecteur de stories existe mais le chat ne l'ouvre pas : relier l'avatar d'en-tête, les membres de la pile et l'anneau/citation d'une bulle à la route du lecteur via une requête unique.
- Afficher l'anneau de story sur les avatars de bulle et d'en-tête (état StoryRingState par utilisateur).
- Toast conversation.storyUnavailable si la story a expiré ; transition zoom depuis l'avatar (shared element).

Rendu : Anneau de story dégradé autour de l'avatar, ouverture avec zoom depuis le cercle de l'avatar.

Transposition Android : conversationCover -> navigation vers la destination du lecteur ; zoom transition -> SharedTransitionLayout.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+StoryCovers.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRingPresentation.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### « X écrit… » apparaît comme un vrai message en bas du fil, avec le visage de l'auteur et trois points pulsants

`chatthread-typing-indicator` · Android : **partielle** · P1 · effort S

Bulle de frappe rendue comme dernière cellule du fil (bas visuel), alignée côté expéditeur : capsule fond surfaceFill + bord accent (mode bulles) avec avatar 18 pt du premier frappeur (vraie photo si connue sinon initiales), libellé (typing.named « X écrit… », typing.double, typing.several) et trois points de 5 pt qui pulsent (0,5 s, décalage 0,18 s) ; rangée PLATE (modes Script/Focal) : avatar 22 pt + points sans capsule ni libellé visible. L'avatar porte présence, point primaire « ici » (#8892) et pulsation s'il est actif (#9061). Le roster est observé sur le store VIVANT (ConversationTypingRosterHost) : sinon la bulle de retour au bas restait muette. Libellé a11y combiné. Les points ne bougent pas sous « réduire les animations ».

Écarts :
- L'indicateur Android est une ligne de texte sous la liste (TypingIndicator) et un cluster dans l'en-tête ; en faire une cellule de liste (dernier item sous reverseLayout) qui monte avec les messages.
- Avatar du premier frappeur (18/22 dp) avec point de présence et état « est dans la conversation » (here) / actif ; points pulsants 5 dp (0,5 s, 0,18 s de décalage).
- Deux tenues : capsule (bulles) et rangée plate sans libellé visible ; libellés typing.named/double/several.
- Respect de « réduire les animations » ; libellé TalkBack combiné.

Rendu : Capsule rayon plein, remplissage surfaceFill, bord accent 0.25 (sombre) / 0.18 (clair) 1 dp, texte small medium accent 0.8-0.9, points accent 5 dp échelle 0.5-1 et opacité 0.4-1.

Transposition Android : @State animating + meeshyAnimation -> rememberInfiniteTransition avec Reduce Motion testé via Settings.Global.ANIMATOR_DURATION_SCALE.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/TypingIndicatorBubble.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationTypingRosterHost.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/Typing.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/TypingPresenceRelay.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TypingPresenceFold.kt`

### Voir le tableau de bord de la conversation : santé IA, anneaux de stats, activité, participants, sentiment et profils

`chat-conversation-dashboard` · Android : **partielle** · P2 · effort M

Onglet Stats de la fiche : carte héros d'analyse IA (jauge d'arc de santé, ton, conflit), sept anneaux animés (Messages, Mots, Photos, Audio, Vidéos, Liens, Documents), graphique d'activité avec sélecteur 7j / 30j / Tout, classement des participants (top 10), sentiment (emoji + barre segmentée), types de contenu et profils des participants en quatre familles de traits. Les chiffres serveur priment, avec repli sur un instantané calculé hors thread principal (mots, médias, activité par participant, sentiment). Entrée en cascade des sections puis anneaux en ressort.

Écarts :
- Deux feuilles séparées (Stats, Analyse) au lieu d'un seul défilement : fusionner dans l'onglet Stats de la fiche, carte héros de santé en tête.
- Carte héros IA : jauge d'arc (ArcGauge) avec score coloré par seuil, libellé « Santé », « Ton : %@ », pastilles métriques (conflit, niveau) — Android affiche un badge de santé sans jauge.
- Sept anneaux animés (StatRing valeur/max, ressort 0,8/0,7 après 300 ms) à la place des pastilles / barres ; max média partagé entre Photos, Audio, Vidéos, Liens, Documents.
- Entrée en cascade des sections (index 0→6, easeOut 0,6) et carte de section commune translucide à liseré dégradé accent.
- Chaque compteur doit lire d'abord le serveur puis l'instantané client (mots, images, audio, vidéo ; Liens = lieux, Documents = fichiers).
- Classement participants : médaille #1 à #3 et barres relatives ; types de contenu avec icône/couleur propres ; sentiment calculé hors thread principal sur chaque changement du nombre de messages.

Rendu : Cartes translucides à bordure dégradée teintée de l'accent de la conversation ; titres de section avec icône ; anneaux accent sur piste muted, valeur centrée en rounded black ; jauge d'arc 240° ; sélecteur de période en capsules (7j, 30j, Tout) avec libellés d'accessibilité longs.

Transposition Android : Swift Charts / Canvas → Canvas Compose ; NLTagger sentiment → SentimentAnalyzer (dictionnaire) déjà présent ; Task.detached → Dispatchers.Default.

<details><summary>Sources iOS (9)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView+Breakdown.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView+ContentTypes.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView+ParticipantProfiles.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView+Rules.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView+SectionChrome.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardView+Sentiment.swift`
- `apps/ios/Meeshy/Features/Main/Components/ConversationDashboardClientStats.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationAnalysisService.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationStatsSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationAnalysisSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ClientStatMessageMapping.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationStatsProjection.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationAnalysisProjection.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationAnalysisRepository.kt`

### Verrouiller une conversation par un code à 4 chiffres protégé par un master PIN à 6 chiffres

`chat-conversation-lock` · Android : **partielle** · P2 · effort S

Feuille de saisie à pavé numérique et points de progression, sept modes : créer / changer / retirer le master PIN, verrouiller une conversation (master puis code à 4 chiffres + confirmation), déverrouiller, ouvrir une conversation verrouillée, tout déverrouiller. Erreurs localisées (PIN différents, master incorrect, code incorrect) avec secousse horizontale et haptiques. Le gestionnaire stocke les hachés SHA-256 dans le Keychain, publie les ids verrouillés et se réinitialise à la déconnexion.

Écarts :
- Pas de secousse horizontale (`shakeOffset`) à l'erreur de saisie : le message d'erreur apparaît sans animation.
- Aucune haptique : légère à chaque chiffre / suppression, succès à la validation d'un mode, erreur sur échec (`LocalHapticFeedback` n'est pas utilisé dans la feuille).
- Vérifier l'icône d'en-tête par mode (`iconName`) et l'étiquette d'accessibilité de progression « Chiffres saisis : %1$d sur %2$d » + « Supprimer le dernier chiffre ».

Rendu : Titre + sous-titre par mode, rangée de 4 ou 6 points qui se remplissent, pavé 3×4 de touches rondes, secousse horizontale ~10 dp sur erreur puis remise à zéro de la saisie.

Transposition Android : Keychain → EncryptedConversationLockStore (Keystore, déjà fait) ; HapticFeedback → LocalHapticFeedback.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift`
- `apps/ios/Meeshy/Features/Main/Services/ConversationLockManager.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationLockPinSheet.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/LockPinReducer.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/lock/EncryptedConversationLockStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/lock/ConversationLockStore.kt`

### Retrouver son brouillon (texte, réponse, effets, pièces jointes) après une sortie ou un kill de l'app

`chat-draft-persistence` · Android : **partielle** · P2 · effort S

`ConversationDraftManager` (acteur) lit le cache GRDB et coalesce les écritures par un debounce de 500 ms ; une sauvegarde vide contourne le debounce et efface aussitôt. `MessageDraftMediaStore` copie durablement les pièces jointes du brouillon (les fichiers du composeur vivent dans le répertoire temporaire que l'OS peut purger) sous un dossier par compte et par conversation, restaure en ignorant silencieusement les fichiers disparus, et purge à l'envoi réussi comme à l'effacement.

Écarts :
- Le brouillon Android persiste texte, id de réponse, effets armés et langue choisie, mais PAS les pièces jointes : copier les médias préparés dans un dossier durable `filesDir/message_draft_media/<userId>/<conversationId>/`.
- Restauration tolérante (fichiers disparus ignorés) et purge à l'envoi réussi / à l'effacement du brouillon.
- Vérifier le debounce de 500 ms (≤ ~2 transactions / s par conversation) et l'effacement immédiat sur sauvegarde vide.

Rendu : Badge « Brouillon » de la liste déjà présent.

Transposition Android : Documents/ → context.filesDir ; acteur → Mutex + coroutine de debounce.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/MessageDraftMediaStore.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationDraftManager.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/DraftAutosave.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chat/ConversationDraftStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationDraft.kt`

### Les effets d'un message (secousse, zoom, explosion, confettis, feux d'artifice, waoo, lueur, pulsation, arc-en-ciel, étincelles) se jouent à chaque apparition

`chat-message-effects-playback` · Android : **partielle** · P2 · effort S

Les effets d'apparition ponctuels (shake, zoom, explode, waoo, confettis, feux d'artifice) rejouent à chaque venue à l'écran — aucune mémoire de lecture — et les effets persistants (lueur, pulsation, arc-en-ciel, étincelles) tournent en continu ; un plan d'exécution tient compte de « Réduire les animations » et un message sans effet ne paie aucun modifier.

Écarts :
- Android joue l'apparition UNE fois (`hasPlayedAppearance`) ; iOS rejoue à chaque affichage (rouvrir la conversation, faire défiler la bulle) en laissant une frame avant d'animer — retirer la mémoire de lecture.
- Pas de garde « Réduire les animations » : `playbackPlan(reduceMotion:)` doit couper les apparitions et figer les effets persistants (`animatesPersistent = false`) selon l'échelle d'animation système.
- Overlays de particules `ExplodeOverlay` et `WaooOverlay` superposés aux transformations Explode / Waoo : seuls confettis et feux d'artifice sont tracés.
- Vérifier que tous les paramètres sont consommés (intensité de lueur, couleurs arc-en-ciel, fréquence de pulsation, intensité des étincelles, échelle de zoom, style d'explosion).

Rendu : Secousse = vraie sinusoïde (≈ ±8 dp), zoom 0,3→1 en ressort, explosion avec dépassement puis retour, waoo avec halo jaune ; confettis 7 couleurs, feux d'artifice teintes indigo.

Transposition Android : ViewModifier SwiftUI → Modifier.graphicsLayer / drawBehind ; GeometryEffect → offset animé.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageEffectModifiers.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageEffectModifiers.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffectRenderPlanner.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AppearanceTransform.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AppearanceParticleField.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SparkleField.kt`

### Le fil ne montre ni doublon ni saut : fusion optimiste + serveur et projections dérivées mises en cache

`chat-message-merge-projections` · Android : **partielle** · P2 · effort S

`ConversationMessageMerge` fusionne le snapshot du store dans les messages en mémoire sans perdre une ligne qui n'a pas encore atteint GRDB (livraison socket avant REST), trie par `createdAt` et traite les lignes SUPERSEDED (id optimiste remplacé) pour ne pas doubler une bulle. `ConversationMessageProjector` / `+Projections` dérivent sans muter : index O(1), derniers messages reçu / envoyé, phase de pagination, roster de frappe, médias et vocaux de toute la conversation, légendes, mentions, membres les plus actifs ; `ConversationDerivedCache` mémoïse et s'invalide avec `messages`. Le déchiffrement E2EE se fait en mémoire dans l'observation du store.

Écarts :
- Room étant la source unique et ordonnée, la fusion manuelle n'est pas nécessaire ; vérifier tout de même qu'une ligne optimiste et son écho serveur n'apparaissent jamais deux fois lors de la réécriture d'id.
- Projections absentes ou partielles : liste des vocaux de la conversation (pour la file audio), plan de légendes médias, membres les plus actifs (avatars d'en-tête), dernier message reçu / envoyé, roster de frappe.
- Mémoïsation à invalidation par champ (équivalent de `derived.allVisualAttachments`, `derived.allAudioItems`) plutôt que recalcul à chaque émission.
- Déchiffrement E2EE en mémoire des messages chiffrés avant projection (dépend du socle crypto) ; ne jamais écrire le clair en base.

Rendu : Aucun saut ni doublon à l'accusé serveur.

Transposition Android : @Published messages (seul site d'écriture) → StateFlow unique alimenté par Room.

<details><summary>Sources iOS (5)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationMessageMerge.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationMessageProjector.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationDerivedCache.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+Projections.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+StoreObservation.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOrdering.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/BubbleMemoCache.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MentionRoster.kt`

### Lire un vocal ou une vidéo directement dans l'aperçu d'appui long, pièces à leur ratio d'origine

`chat-overlay-media-preview` · Android : **partielle** · P2 · effort M

L'aperçu d'un message média propose un lecteur audio (lecture / pause, barre, ±5 s, vitesse) et un lecteur vidéo interactif ; les pièces sont disposées à leur rapport d'aspect d'origine (deux au plus par rangée, trois = une puis deux, réduction uniforme) et un message protégé (vue unique, flouté, chiffré) montre sa forme protégée, jamais son contenu.

Écarts :
- Lecteur audio d'aperçu présent ; la piste doit suivre le Prisme audio du vocal (langue servie) et la protection (aucune lecture d'un vocal protégé).
- Lecteur vidéo interactif absent (le code indique que `BubbleContent` ne porte pas encore de vidéo lisible).
- Disposition des pièces à leur rapport d'aspect (`width` / `height`) : rangées de deux pièces partageant une hauteur, réduction uniforme au-delà de la hauteur offerte — fonction pure à porter et à tester.
- Forme protégée de l'aperçu (#8009) pour vue unique / flouté / chiffré : puce ou flou, sans consommer le message.

Rendu : Pièces non rognées ni étirées, coins arrondis, rangées centrées ; contrôles du lecteur en capsule translucide sous la pièce.

Transposition Android : AVPlayer → Media3 ExoPlayer (déjà utilisé dans sdk-ui) ; AVPlayerLayer → PlayerSurface / AndroidView.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayPreviewAudioPlayer.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayPreviewMedia.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayPreviewVideoPlayer.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaPreview.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaTransport.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOverlayPreviewHero.kt`

### Lire le fil complet des réponses sous un message parent, paginé depuis le serveur

`chat-reply-thread-reader` · Android : **partielle** · P2 · effort S

`ThreadRepliesLoader` charge les réponses sous un message parent (`replyToId=<parent>&limit=50`), filtrées côté serveur car le fil peut être arbitrairement grand, et les convertit en messages avec le prisme du lecteur hissé hors du `map` (calculé une fois, pas 50). Sert `ThreadView`, le lecteur plein écran du fil.

Écarts :
- La feuille de fil Android est dérivée des seuls messages chargés (`ReplyThreadOverlay.of`) ; si les réponses sont hors fenêtre, elles manquent.
- Charger les réponses via `GET …/messages?replyToId=<id>&limit=50` (paramètre `replyToId` absent de `MessageApi.list`) avec pagination et langues du lecteur.
- Convertir avec le prisme du lecteur calculé une fois ; états chargement / vide / erreur.

Rendu : Message parent épinglé en tête, réponses chronologiques, compteur de réponses.

Transposition Android : ThreadView plein écran → ModalBottomSheet plein hauteur ou destination dédiée.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ThreadRepliesLoader.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyThreadOverlay.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyThreads.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Voir la pastille de synchronisation enfler à l'arrivée d'une frappe et la barre du composeur onduler à chaque touche

`chat-typing-announcement-wave` · Android : **partielle** · P2 · effort S

Quand quelqu'un se met à écrire, la pastille de synchronisation (au-dessus de la barre de composition) grossit d'un facteur 1,1 puis revient — seul changement de taille permis — à la place de l'ancienne capsule de l'île dynamique. `TypingEntriesSource` republie les frappeurs de la liste vers la bannière seule (flux invité : aucune entrée). `TypingWave` étire la barre du composeur (x 1,015, y 0,97, tenue 150 ms, ressort) à chaque frappe ; rien ne bouge sous « Réduire les animations ».

Écarts :
- Pas d'accent d'annonce : `TypingPill` / `OfflinePill` sont statiques ; ajouter le zoom ×1,1 au début d'une frappe (fenêtre réarmable) sans jamais changer la largeur de la pastille pendant la frappe.
- `ConnectionBanner` Android ne porte aucune entrée de frappe (HIDDEN / SYNCING / RECONNECTING / OFFLINE seulement) : relayer les frappeurs de la liste vers la bannière sans faire réobserver la liste entière.
- Vague de frappe (`TypingWave`) absente de la barre du composeur : scale 1,015 × 0,97, ressort (0,2 ; 0,35), tenue 150 ms, désactivée sous « Réduire les animations ».
- L'émission et l'expiration de la frappe (re-émission 3 s, inactivité 3 s, expiration 5 s) sont déjà à parité.

Rendu : Zoom ressort léger, une seule respiration ; pas d'autre mouvement de mise en page pendant la frappe.

Transposition Android : Dynamic Island → notification / pastille in-app ; scaleEffect → graphicsLayer(scaleX, scaleY) avec spring.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Components/TypingAnnouncementLaw.swift`
- `apps/ios/Meeshy/Features/Main/Components/TypingEntriesSource.swift`
- `apps/ios/Meeshy/Features/Main/Components/TypingWave.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/Typing.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConnectionBanner.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationTypingRoster.kt`

### Un invité restreint ne voit que les portes de pièces jointes qu'il peut franchir, et une feuille lui explique le reste

`chatthread-guest-attachment-doors` · Android : **partielle** · P2 · effort S

Les termes du lien (#10001) disent ce qu'un invité peut joindre. Un compte, ou un invité dont le lien ne restreint rien, garde le composeur habituel ; un invité restreint (World Wide : texte .txt et audio) ne voit QUE les portes dont la famille est ouverte — une porte inerte est retirée, jamais grisée — et la porte « Fichier » ouvre une feuille qui dit ce qui passe et pourquoi le reste ne passe pas. Les portes visuelles (photothèque, bande des médias récents, stickers) produisent une image et sont nommées/typées. Le serveur reste juge du contenu réel ; son refus éventuel est expliqué à l'envoi. L'ingestion (collage, import) respecte la même allocation.

Écarts :
- Android masque déjà les tuiles selon les permissions de l'invité (ComposerAffordances) ; ajouter la feuille explicative de la porte « Fichier » (ce qui passe, pourquoi le reste ne passe pas).
- Appliquer la même allocation à l'ingestion par collage/import (ingestRespectingGuestAllowance) et expliquer le refus serveur à l'envoi.
- Types de familles : texte .txt et audio pour World Wide ; portes visuelles (photo, récents, stickers) alignées.

Rendu : Feuille courte listant les familles autorisées avec icônes, ton explicatif sans rouge d'erreur.

Transposition Android : ViewModifier ConversationComposerGuestSheet -> ModalBottomSheet.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationView+GuestAttachments.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/ComposerAttachmentPolicy.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentLadder.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatComposer.kt`

### L'aperçu d'appui long d'une conversation montre ses derniers messages dans le mode de lecture du fil

`chatthread-list-preview-card` · Android : **partielle** · P2 · effort M

ConversationPreviewRenderer (loi pure) : l'aperçu dessine des rangées plates en Script et Focal, des bulles en Bulles (suit le mode que le fil ouvrirait, #11213, décision #11204) ; Résumé et Rivière ne montrent pas le fil, l'aperçu s'y pose comme « Aller au message ». Quatre affichages : squelette (charge, jamais « vide »), vide (« Aucun message » après constat), indisponible (preview.messages_unavailable), messages. Regroupement du fil (un auteur, un jour, une identité : plate en tête de groupe, bulle en queue de groupe jamais pour moi ni en direct) ; marges lg, espacement md entre suites, fondu supérieur de 14 % ; un message chiffré non déchiffré arrive SCELLÉ et se dit « Message chiffré », jamais une bulle vide. Fond = celui du lecteur (photo avec voile/flou ou Signature) avec mémoire des photos en échec. Cibles d'en-tête interactives (44 pt, repliées à 28 pt dans un volet étroit).

Écarts :
- Android affiche des lignes de texte (previewLines) dans une carte ; rendre de vraies bulles/rangées plates avec groupement par auteur et jour et identité conditionnelle.
- Quatre états : squelette, vide, indisponible, messages ; message chiffré scellé (« Message chiffré »).
- Fond de la conversation (photo/signature) sous l'aperçu et fondu supérieur de 14 %.
- Suivre le mode de lecture du fil (plat vs bulles) une fois les modes portés.

Rendu : Carte arrondie avec fond de conversation, rangées espacées de md, fondu haut 14 %, identité conditionnelle, squelette de 3-4 rangées.

Transposition Android : contextMenu(preview:) -> Popup/Dialog d'aperçu accompagnant le menu.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ConversationRecentMessagesPreview.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationContextMenu.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationPreviewMessages.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`


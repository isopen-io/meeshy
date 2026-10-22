# Parité de l'app Android native avec l'app iOS — relevé et plan (2026-10-22)

> JOURNAL d'analyse daté, et plan d'exécution. **L'état de chaque lot vit dans son issue GitHub** (milestone « Android en beta fermée sur le Play Store », issues `android`, sous-issues des épopées de piste), jamais dans ces fichiers. Directive : #11570.

## Mesure de départ

| | fichiers | lignes |
|---|---|---|
| iOS app (`apps/ios`, production) | 2 090 Swift | 418 837 |
| SDK iOS (`packages/MeeshySDK/Sources`) | 1 689 Swift | 299 167 |
| Android natif (`apps/android`, src/main) | ~900 Kotlin | ~126 000 |

## Méthode

1. Les **3 778 fichiers Swift de production** (app, extensions, widgets, SDK) ont été répartis en 25 domaines, puis en 37 tranches de 20 000 à 47 000 lignes. Chaque fichier appartient à exactement une tranche.
2. Un agent par tranche a relevé les features visibles et les capacités SDK, avec leurs états, gestes et rendu. Il a cherché leur pendant dans `apps/android`, puis les a classées absente, partielle, complète ou divergente, en notant les écarts concrets. **Couverture vérifiée : 100 %** (chaque fichier est rattaché à une feature ou justifié).
3. Un agent par domaine a regroupé les écarts en **lots** livrables : une issue, une PR, environ 300 à 3 000 lignes, avec des fichiers attribués.
4. Une passe d'architecture a dédoublonné les lots (1 339 → 1 046), ordonné les domaines en six tiers, posé un socle de 36 lots, réparti le reste en cinq pistes parallèles et fixé les conventions (`CONVENTIONS.md`).

## Résultat : 1609 features iOS

**752 absentes, 728 partielles, 99 divergentes, 29 complètes** sur Android. Les estimations de lignes Kotlin des lots sont hautes (environ ×2).

| domaine | features | absentes | partielles | divergentes | complètes | lots |
|---|---|---|---|---|---|---|
| [`analytics-telemetry`](analytics-telemetry.md) | 25 | 20 | 4 | 1 | 0 | 29 |
| [`auth-onboarding-visitor`](auth-onboarding-visitor.md) | 51 | 26 | 21 | 2 | 2 | 45 |
| [`calls`](calls.md) | 84 | 42 | 41 | 1 | 0 | 64 |
| [`chat-bubbles-rendering`](chat-bubbles-rendering.md) | 57 | 20 | 31 | 5 | 1 | 40 |
| [`chat-composer-input`](chat-composer-input.md) | 43 | 17 | 19 | 6 | 1 | 36 |
| [`chat-screen-thread`](chat-screen-thread.md) | 95 | 33 | 56 | 6 | 0 | 34 |
| [`community-groups-global`](community-groups-global.md) | 30 | 19 | 11 | 0 | 0 | 23 |
| [`contacts-friends`](contacts-friends.md) | 24 | 11 | 9 | 4 | 0 | 31 |
| [`conversation-list`](conversation-list.md) | 96 | 43 | 45 | 5 | 3 | 56 |
| [`design-system-theme`](design-system-theme.md) | 100 | 33 | 55 | 8 | 4 | 60 |
| [`extensions-widgets-share`](extensions-widgets-share.md) | 50 | 28 | 21 | 1 | 0 | 44 |
| [`game`](game.md) | 95 | 91 | 3 | 1 | 0 | 69 |
| [`media-audio-video`](media-audio-video.md) | 92 | 55 | 36 | 1 | 0 | 63 |
| [`notifications-push`](notifications-push.md) | 32 | 12 | 15 | 4 | 1 | 25 |
| [`profile-user`](profile-user.md) | 33 | 16 | 16 | 1 | 0 | 26 |
| [`reels-feed-posts`](reels-feed-posts.md) | 100 | 38 | 58 | 3 | 1 | 51 |
| [`resources-i18n-assets`](resources-i18n-assets.md) | 41 | 12 | 20 | 8 | 0 | 22 |
| [`sdk-auth-crypto-e2ee`](sdk-auth-crypto-e2ee.md) | 16 | 10 | 5 | 1 | 0 | 13 |
| [`sdk-networking-sockets-sync`](sdk-networking-sockets-sync.md) | 58 | 18 | 37 | 3 | 0 | 43 |
| [`sdk-persistence-cache-offline`](sdk-persistence-cache-offline.md) | 50 | 14 | 33 | 3 | 0 | 41 |
| [`settings-privacy-security`](settings-privacy-security.md) | 32 | 7 | 19 | 6 | 0 | 28 |
| [`story-composer-canvas`](story-composer-canvas.md) | 61 | 31 | 21 | 9 | 0 | 52 |
| [`story-composer-tools-timeline`](story-composer-tools-timeline.md) | 149 | 81 | 56 | 9 | 3 | 60 |
| [`story-reader-player`](story-reader-player.md) | 82 | 31 | 44 | 4 | 3 | 44 |
| [`translation-prism-models`](translation-prism-models.md) | 113 | 44 | 52 | 7 | 10 | 47 |

## Ordre de valeur (tiers)

0. **Fondations : socle SDK, modèles et Prisme, design system, authentification, chaînes** — `sdk-networking-sockets-sync`, `sdk-persistence-cache-offline`, `sdk-auth-crypto-e2ee`, `translation-prism-models`, `design-system-theme`, `auth-onboarding-visitor`, `resources-i18n-assets`. Tout le reste lit ces couches : pipeline HTTP, renouvellement de session et sockets ordonnées, Room migrée sans perte d'outbox, cache-first, outbox à registre, ApiMessage/ApiConversation complets et tolérants, descente unique du Prisme (ReaderPrism), jetons de marque et accent de conversation, atomes partagés (toasts, haptiques, avatar, états vides), coffre par compte, et le générateur de chaînes depuis les catalogues iOS. Le socle (36 lots, foundation_lots) passe avant que les pistes divergent ; le reste de ces domaines suit en tête de leurs pistes.
1. **Messagerie quotidienne à l'iso iOS** — `conversation-list`, `chat-bubbles-rendering`, `chat-screen-thread`, `chat-composer-input`, `media-audio-video`, `notifications-push`. Ce qu'un utilisateur fait vingt fois par jour : liste instantanée, fil sans à-coup, bulles complètes (protections, citations, réactions), composeur et pièces jointes hors ligne, vocaux lus et traduits dans sa langue, vidéos et plein écran, push qui arrive, se regroupe et se répond. Les lots de découpage des fichiers hors budget (ChatScreen, ChatViewModel, MessageBubble, ChatComposer) ouvrent ce tier.
2. **Social** — `contacts-friends`, `profile-user`, `settings-privacy-security`, `reels-feed-posts`, `community-groups-global`. Amis et demandes hors ligne, fiche profil ouverte de partout, réglages iso, fil et réels cache-first avec commentaires durables, communautés et recherche locale. Dépend du tier 1 pour le moteur vidéo partagé, la galerie et l'outbox.
3. **Appels** — `calls`. L'appel existe déjà : on le rend fiable (service de premier plan exigé dès Android 14, sonnerie app fermée, négociation durcie, reconnexion), puis iso (pilule, scène duo, PiP, groupe en maillage, sous-titres) ; le créatif (cadres, montage, effets de visage) est P2.
4. **Stories : lecteur, puis scène et composer** — `story-reader-player`, `story-composer-canvas`, `story-composer-tools-timeline`. Lire fidèlement une story composée sur iOS (SceneCanvas unique dans :sdk-ui, plan de rendu dans :core:model) passe avant de composer ; le composer unifié et la timeline viennent ensuite, le composer actuel restant routé jusqu'au lot de retrait.
5. **Jeu, extensions et partage, mesure** — `game`, `extensions-widgets-share`, `analytics-telemetry`. Valeur réelle mais non bloquante pour une messagerie à l'iso : progression et Meesh, widgets, partage entrant et sortant, Imagine, raccourcis, puis télémétrie (consentement d'abord). Les priorités P0 locales du jeu et de la mesure sont ramenées en P2 ou P1 (priority_overrides).

## Pistes d'exécution

| piste | épopée | contenu | lots | P0 | P1 | P2 | plan |
|---|---|---|---|---|---|---|---|
| F0 | #11590 | Socle transverse (passe d'abord) | 36 | 36 | 0 | 0 | [`plan/F0.json`](plan/F0.json) |
| A | #11591 | Socle de données, temps réel, push et appels | 199 | 72 | 87 | 40 | [`plan/A.json`](plan/A.json) |
| B | #11592 | Design system, authentification, liste de conversations, réglages et langues | 198 | 58 | 112 | 28 | [`plan/B.json`](plan/B.json) |
| C | #11593 | Fil de discussion : modèles et Prisme, bulles, écran, composeur, puis partage et widgets | 196 | 52 | 100 | 44 | [`plan/C.json`](plan/C.json) |
| D | #11594 | Médias et social : audio, vidéo, contacts, profil, fil et réels, communautés | 193 | 70 | 89 | 34 | [`plan/D.json`](plan/D.json) |
| E | #11595 | Stories (lecteur, scène, composer) puis jeu | 224 | 29 | 106 | 89 | [`plan/E.json`](plan/E.json) |

Chaque lot de `plan/<piste>.json` porte : `deps` (résolues), `acceptance`, `tests`, `android_files_touched`, `ios_reference_files`, `absorbed` (les lots fusionnés en lui) et `rank` (ordre global de valeur).

## Risques

- PRÉREQUIS OPS FIREBASE (ext:ops-firebase…, sans lot) : tant que me.meeshy.android et me.meeshy.android.debug ne sont pas enregistrés dans le projet Firebase meeshy-me et que google-services.json n'est pas fourni en secret CI, aucun push FCM n'arrive ; configuration-firebase-native doit garder le plugin conditionnel pour que android.yml reste vert sans le fichier. Même dépendance pour Crashlytics.
- PASSERELLE (ext:gateway-android-push-data-only…, sans lot) : sans push data-only pour les jetons Android capables, une notification app fermée reste rendue par le système (pas de MessagingStyle, d'actions, de filtre DND local ni de préchargement) ; rendu-notification-systeme et actions-repondre-et-marquer-lu n'agissent qu'au premier plan d'ici là. Changement rétrocompatible à ouvrir côté services/gateway.
- E2EE BLOQUÉ (ext:passerelle-bundles-signal-par-appareil, ext:adr-e2ee-derivation-symetrique, sans lot) : la passerelle garde un bundle par utilisateur et la dérivation iOS est asymétrique ; cles-e2ee-de-l-appareil-et-bundle-publie, session-e2ee-par-contact, messages-chiffres-envoyes-et-lus, push-e2ee-body-decrypt et e2ee-safety-number-screen attendent une décision avec l'agent crypto-e2ee. Le garde-fou fail-closed (message-chiffre-jamais-brouille-ni-envoye-en-clair) part quand même en tier 0.
- CARTE (ext:maps-api-key-secret, sans lot ; ext:decision-sdk-carte) : MapLibre (Maven Central, sans clé) est recommandé ; si Google Maps Compose est choisi, il faut une clé en secret CI et un repli sans Play Services. Décision-produit à trancher avant map-surface-engine (lieux partagés, plein écran, À proximité).
- PERTE DE DONNÉES À LA MISE À JOUR : Room est en version 16 avec fallbackToDestructiveMigration ; une quinzaine de lots ajoutent des tables. Si un lot de schéma fusionne avant persist-room-migrations, l'outbox des utilisateurs est vidée. Le verrou de schéma global sérialise ces lots et peut devenir un goulot.
- GOULOT DE LA PISTE C : la chaîne de découpage ChatScreen -> hôtes -> ComposerController -> plaque de verre, plus le découpage XL de ChatViewModel, précède presque tous les lots du fil, y compris ceux des pistes A et D qui touchent feature/chat (lecteurs de bulle, envoi optimiste). Ces lots doivent être lancés dès la fin du socle.
- VÉRIFICATION CI UNIQUEMENT : Compose, Hilt, Room, WorkManager, Media3, Keystore et SQLCipher ne se prouvent que par android.yml (environ 12 min par run, conteneurs sans dl.google.com) ; SQLCipher, FLAG_SECURE, les services de premier plan, l'export MP4 et la reconnaissance vocale demandent en plus une vérification manuelle sur appareil (API 26 et API 34). Un lot ne se déclare jamais vert sans run vert.
- TAILLE DES LOTS : les estimations sont gonflées (environ 2x) mais plusieurs lots du composer de story sont XL (2 500 à 3 000 lignes estimées) et les fusions grossissent certaines cibles (socle-points-d-extension-de-l-app, chat-bulle-decoupage-composants, actions-message-et-conversation-loi, socle-pipeline-push-et-cycle-de-vie, canvas-scene-unique-en-lecture) : un agent qui dépasse un fichier de 1 200 lignes ou une PR ingérable découpe le lot en issues filles plutôt que de livrer partiel.
- DÉCISION MULTI-COMPTES CONTRADICTOIRE : le domaine auth retient purge + réhydratation à la bascule, le domaine persistance « chaque compte retrouve sa base » (persist-compte-cache-par-compte, qui absorbe trois lots). Décision-produit à trancher avant ce lot ; d'ici là la bascule purge tout et ne fuit rien entre comptes.
- SEPT LANGUES : le générateur crée values-de, values-it et values-ar avec les seules chaînes adoptées ; un appareil allemand verra un écran mêlé tant que les quelque 600 chaînes propres à Android n'ont pas leurs traductions (cliquet known-gaps). localeConfig ne doit lister une langue que lorsqu'elle est complète ; l'arabe exige une relecture native et une passe RTL.
- PLAY ET PLATEFORME : déclarations des types de service de premier plan (phoneCall, microphone, camera, mediaPlayback, mediaProjection, dataSync plafonné sur Android 15), POST_NOTIFICATIONS non redemandable après deux refus, trampolines de notification interdits dès Android 12, OEM qui tuent les processus ; READ_CONTACTS et la fiche Data Safety relèvent de l'agent conformite-juridique.
- MÉDIAS : Media3 1.4.1 n'a pas DefaultPreloadManager (pool par SimpleCache et CacheWriter, ou montée de version dans le lot de catalogue) ; l'export MP4 de story (Transformer + overlay Compose) et le flou réel avant l'API 31 sont à valider sur appareil ; polices des 18 styles à remplacer par des équivalents OFL, archives .lottie à vérifier avec lottie-compose, poids de l'APK à surveiller (stickers, polices, catalogue d'apparence).
- DÉPENDANCES INTER-PISTES : environ 360 arêtes traversent les pistes (D attend C pour les coutures de bulle et B pour les atomes ; A attend C pour l'envoi optimiste dans le fil). L'orchestrateur doit suivre l'état de fusion dans dev, sinon une piste tourne à vide.
- LOIS À MIROIRS : le dégel remet Android dans les lois « touche les TROIS » (Prisme, présence, aperçu, accent, actions, seq) ; un lot qui fait évoluer une règle partagée doit vérifier packages/shared et MeeshySDK, et ouvrir une issue s'il découvre un écart côté web ou iOS (par exemple les jetons de signalement en majuscules envoyés par iOS, que la passerelle rejette).
- PISTE E LA PLUS LOURDE : le composer de story et la timeline (environ 108 000 lignes estimées) font de la piste E le pôle le plus long ; c'est assumé (tiers 4 et 5), mais aucune ressource d'une autre piste ne doit y être déplacée avant que les tiers 0 à 3 soient livrés.
- ROUTES PASSERELLE À CONFIRMER avant leurs lots : GET /app/min-version, /me/engagement et les routes du jeu, /hashtags/trending, /sounds/*, PATCH /posts/:id, GET /conversations/:id/attachments, /links/:identifier/card, posts/nearby/density ; une route absente dégrade vers indisponible, jamais vers un écran bloquant.

## Synthèse de l'architecture

Plan de parité iso iOS pour l'Android natif (directive #11570). Les 1 339 lots de l'inventaire deviennent 1 046 lots à implémenter : 293 sont retirés, dont 173 fusions (merge-into), 119 doublons (drop-duplicate) et 1 non applicable (filtres de concentration iOS). Les doublons venaient surtout de trois sources : chaque domaine planifiait sa propre coupure des fichiers géants (MeeshyApp, ChatScreen, MessageBubble), ses propres points d'extension et son propre lot de catalogue ; le push, les lecteurs média, la galerie, la vue unique, les stickers et la scène étaient planifiés deux ou trois fois ; enfin, les lots génériques de routes doublaient les lots de service de chaque domaine. Le graphe obtenu (redirection des arêtes, héritages explicites, arêtes implicites des fichiers chauds, résolution des ext:) est acyclique, profond de 14 lots au plus.

Ordre de valeur, en six tiers : (0) fondations ; (1) messagerie quotidienne (liste, fil, bulles, composeur, médias, push) ; (2) social ; (3) appels ; (4) stories ; (5) jeu, extensions, mesure. Un socle de 36 lots (foundation_lots, 32 en P0) passe d'abord, en six vagues : chassis et points d'extension Hilt, catalogue de dépendances, générateur de chaînes iOS vers Android avec sa garde, Room migrée sans perte d'outbox, cache-first générique, outbox à registre avec propriétaire et classification, pipeline HTTP, session en un seul vol, sockets idempotentes et ordonnées, descente unique du Prisme, ApiMessage et ApiConversation complets, jetons de marque, atomes d'accessibilité, de toasts, d'avatar et d'états vides, vocabulaire média.

Ensuite cinq pistes en parallèle : A, socle de données, temps réel, push et appels ; B, design system, authentification, liste de conversations, réglages et langues ; C, fil de discussion (modèles et Prisme, bulles, écran, composeur, puis partage et widgets) ; D, médias et social ; E, stories puis jeu. Les pistes sont équilibrées entre 135 et 170 lots P0 ou P1. Elles ont été découpées pour que chaque fichier chaud vive dans une seule piste : tout feature/chat dans C, MeeshyFcmService et les sockets dans A, la racine et le thème dans B.

108 corrections de priorité ramènent le jeu en P2 (61 lots), la mesure en P2 et le composer de story en P1. À l'inverse, elles remontent en P0 ce que la messagerie exige : répondre depuis la notification, le rendu MessagingStyle, la transcription et la piste traduite des vocaux, et le bouclier de capture de la vue unique. La fermeture P0 (une dépendance d'un P0 devient P0) compte 317 lots.

Les conventions fixent les règles de cohérence : un seul résolveur de Prisme (ReaderPrism), une seule loi de présence, l'accent passé en paramètre, la logique dans :core:model prouvée par jvm-check, les composants partagés uniques dans :sdk-ui, les chaînes générées depuis Localizable.xcstrings en sept langues, et les fichiers d'enregistrement en ajout seul. Le verrou de schéma Room est global, et les fichiers chauds créent des arêtes implicites. Risques majeurs : la configuration Firebase (opération humaine) et le push data-only côté passerelle, l'E2EE bloqué par deux décisions externes, le choix du SDK de carte, le goulot des découpages du chat, et la vérification qui ne passe que par la CI.

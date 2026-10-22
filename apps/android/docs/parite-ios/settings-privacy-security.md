# Parité iOS → Android : `settings-privacy-security`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**32 features iOS** : 7 absentes, 19 partielles, 6 divergentes, 0 complètes sur Android. **28 lots** planifiés (≈18140 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**settings-privacy-security** (couverture Android estimée ≈ 48 %)

Cette partie regroupe l'écran Réglages iOS (carte profil, sections à cartes teintées, thème, langue d'interface, notifications rapides, données, outils, aide, à propos, changer de compte, déconnexion), l'écran Sécurité (mot de passe, 2FA, e-mail, téléphone, verrou PIN des conversations, sessions actives), la confidentialité, la suppression de compte, l'export RGPD, le stockage et la purge sélective du cache, les signalements, les pages légales/à propos/support/licences, la puce drapeau du Prisme et les sélecteurs de langue, plus huit services SDK (sessions, 2FA, rapport, consentements, permissions, appel actif, précision de découvrabilité, export).
Android a déjà une bonne partie des écrans fonctionnels dans apps/android/feature/settings (2FA, sessions, mot de passe, suppression, export, confidentialité, e-mail/téléphone, à propos, support, licences, légal, diagnostics) ainsi que les signalements (feature/profile, feature/chat) : la logique métier (ViewModels, modèles purs, API) est souvent en place et testée.
L'écart est surtout de fidélité iso : Réglages est une liste Material plate qui ne reprend ni la hiérarchie iOS (carte profil, sections Compte/Profil vocal/Transcription/Outils/Aide, 3 interrupteurs de notifications + « Plus d'options »), ni l'anatomie des cartes/rangées (tuile d'icône teintée, dégradé, bordure), ni l'en-tête repliable, ni les haptiques. Il n'existe pas d'écran Sécurité unifié.
Les écrans Android les plus pauvres face à iOS : sessions actives (modèle réduit, pas de cache-first, pas d'états hors-ligne/erreur/squelette, pas de confirmation ni de rollback, pas d'attribution DB-IP), purge sélective du cache (4 catégories au lieu de la matrice 7 types x 4 domaines avec orphelins), langue d'interface (4 ressources contre 7 langues iOS) et signalements (pas de description/icône par motif, pas de commentaires/conversations).
Totalement absents côté Android : multi-compte « Changer de compte » et retrait d'un compte supprimé, confirmation + overlay de déconnexion, vérification du numéro de sécurité E2EE (core:crypto est un stub), consentements RGPD (/me/consents), permissions admin, précision de découvrabilité géographique, détecteur de locuteur actif des appels de groupe, interrupteurs Lentille/modes de lecture/Rivière, reprise de l'appel actif propre au lancement.
Plusieurs entrées de Réglages iOS (profil vocal, statistiques, progression, affiliation, packs) renvoient à des fonctions d'autres parties : ici seul le point d'entrée est compté. Constat utile : iOS ReportUserView envoie des jetons MAJUSCULES que la passerelle rejette, Android envoie les bons jetons minuscules : ne pas copier iOS sur ce point.

## Notes transverses

LECTURE DES ESTIMATIONS : est_kotlin_lines compte production + tests. Échelle d'effort : S < 350 lignes, M 350-900, L 900-1800.

1. FICHIERS SATURÉS / POINTS CHAUDS (à lire avant d'ordonnancer les vagues).
- app/.../navigation/MeeshyApp.kt fait 1202 lignes, donc au plafond dur de 1200 : la règle du dépôt interdit d'y ajouter quoi que ce soit. Le lot settings-nav-graph-extraction est un PRÉREQUIS de tout lot qui ajoute une route Réglages (notification-screen, security-hub-screen, two-factor-iso-flow, cache-purge-storage-screens, hub). Les nouvelles routes de ce domaine vivent dans SettingsRoutes / SettingsNavGraph.kt, jamais dans l'objet Routes de MeeshyApp.kt.
- SettingsScreen.kt (929 lignes) et SettingsViewModel.kt sont touchés par cinq lots. Chaîne de propriété imposée par depends_on : settings-notification-screen (retire l'éditeur de notifications) puis settings-hub-iso-layout (éclate SettingsScreen.kt en un fichier par section) ; après le hub, chaque lot ne modifie que SON fichier de section (SettingsAppearanceSection, SettingsDataSection, SettingsSignOutSection...). SettingsScreen.kt n'est plus rouvert que par settings-voice-transcription-tools-entries (insertion de deux appels de section).
- SecurityScreen.kt (créé par security-hub-screen) est rouvert par security-conversation-lock-section : lots sérialisés par depends_on.
- PreferencesApi / OutboxModel / OutboxCoalescer / OutboxFlushWorker / PreferencesSyncCoordinator / SdkModule sont des points chauds partagés avec d'autres domaines (notifications, voix, profil). audio-and-application-preferences-sync les modifie en un seul lot pour éviter deux PR concurrentes ; si le domaine voix livre d'abord un AudioPreferencesStore, rebaser ce lot dessus plutôt que d'en créer un second.
- AuthApi.kt / AuthRepository.kt / Auth.kt / SessionRepository.kt sont aussi touchés par le domaine auth (change-password-iso, two-factor-iso-flow, active-sessions-*) : coordonner les hunks, tous sont localisés.
- Pas de montée de version Room (v16) dans ce domaine : le cache des sessions (DataStore) et le registre d'attribution du cache (DataStore) évitent volontairement une migration partagée avec les autres domaines.

2. COMPOSANTS PARTAGÉS À CRÉER UNE FOIS (propriétaire = le lot indiqué ; les autres domaines en dépendent via ext:).
- Atomes de réglages + MeeshyHaptics (light/medium/heavy/success/error) : settings-ui-atoms-and-haptics. MeeshyHaptics sert aussi à tous les domaines (aucun helper commun n'existe : seuls 4 fichiers touchent LocalHapticFeedback). Si un autre domaine l'a déjà créé, réutiliser et supprimer la duplication.
- BlockingProgressOverlay (sdk-ui chrome) : logout-confirmation-and-overlay.
- SensitiveClipboard (copie avec EXTRA_IS_SENSITIVE + effacement différé) : two-factor-iso-flow ; réutilisable pour clés E2EE et liens d'invitation.
- LockPinReducer (core:model) + LockPinSheet (sdk-ui) : lock-pin-sheet-shared-extraction. Indispensable car feature:settings ne peut PAS dépendre de feature:conversations (règle « jamais feature -> feature »).
- ReportReasonList / ReportDetailsField / CharacterCountLabel / ReportReasonSheet (sdk-ui) : lots report-*. Remplacent trois implémentations divergentes (profil, chat, feed ReportPostDialog, dialogue de story).
- LanguageFlagChip + TranslationsBadge (sdk-ui) : language-flag-chip-unified ; LanguagePicker unifié : language-picker-unified.
- Génération de QR : zxing n'est aujourd'hui que dans feature:profile ; e2ee-safety-number-screen l'ajoute à sdk-ui. À dédupliquer plus tard avec ProfileShareSheet (hors périmètre).

3. CAPACITÉS EXTERNES (ext:) ET LIGNES GARDÉES.
Les lignes de Réglages dont la destination n'existe pas encore (Profil vocal, Statistiques, Progression, Affiliation, Packs et téléchargements, Lentille/modes de lecture/Rivière) sont pilotées par SettingsHubCatalog avec un filtre de disponibilité des destinations : une ligne sans destination n'est JAMAIS rendue (aucune ligne morte). Elles apparaissent quand l'autre domaine livre sa route ; c'est une dépendance douce, d'où l'absence d'ext: bloquant dans depends_on du lot settings-voice-transcription-tools-entries. Capacités externes : ext:multi-account-session-vault (stockage Keystore par compte, SavedAccount étendu d'un indicateur « session gardée » — le SavedAccountsStore actuel ne garde QUE des métadonnées d'affichage, jamais de jeton) ; ext:socket-account-deleted-signal ; ext:signal-e2ee-core (core:crypto est un module vide) ; ext:lentille-conversation-list ; ext:reading-modes-riviere ; ext:group-call-mesh ; ext:calls-resume-entry ; avatar à anneau de décor du profil (MeeshyUser n'a aucun champ profileDecor : la carte profil s'affiche sans anneau tant que le domaine profil ne le livre pas) ; section Localisation de la confidentialité (le lot privacy expose un slot composable) ; AnalyticsManager (aucun équivalent Android : le lot privacy livre une interface AnalyticsCollectionGate no-op à brancher).

4. RÈGLES DE PRODUIT À NE PAS PERDRE.
- NE PAS copier iOS pour le signalement d'utilisateur : ReportUserView envoie des jetons MAJUSCULES (SPAM, INAPPROPRIATE_CONTENT) que la passerelle rejette (400) ; Android envoie les jetons minuscules corrects (ReportReason.wireValue). Un test de garde doit figer cet invariant. Recommander l'ouverture d'une issue de correction côté iOS (hors périmètre Android).
- Ce qu'Android a de PLUS qu'iOS se conserve (le dépôt demande d'agréger, pas de supprimer) : ligne « Langue régionale » (langue de contenu du Prisme) dans Apparence, nombre de codes de secours restants, résumé d'export (messages/contacts exportés), règle « le nouveau mot de passe doit différer de l'actuel », plage Ne pas déranger et éditeur de types de notifications (déplacés dans NotificationSettingsScreen), refus de supprimer le PIN maître tant que des verrous existent, langues de documents légaux es/pt en plus de fr/en.
- Prisme : la langue d'interface « Automatique » doit suivre la langue principale du compte (systemLanguage) comme iOS UILanguageOverride, ce qui CONTREDIT la phrase de ARCHITECTURE.md §14 (« UI language independent of the Prisme »). Le lot settings-theme-and-interface-language corrige cette phrase ; la directive 2026-10-22 (iso iOS) fait foi. Le choix de langue du document légal descend le Prisme (système, régionale, personnalisée, locale appareil, repli fr). La puce drapeau ne retombe JAMAIS sur translations.first.
- Accent de conversation : ReportMessageSheet colore sélection et spinner par ConversationAccent (jamais de hex en dur).
- Présence : aucun lot de ce domaine ne manipule la présence.
- Les 5 réglages de confidentialité « bientôt disponibles » (bloquer les captures, sauvegarder média, partage des données, demandes de contact, invitations de groupe) deviennent non modifiables (opacité 0,55) mais leur valeur persistée n'est pas touchée.

5. INTERNATIONALISATION.
Chaque lot ajoute ses chaînes dans les quatre langues existantes (values, -fr, -es, -pt) avec la même discipline qu'aujourd'hui. Le lot settings-strings-de-it-ar est la passe finale (dépend de tous les lots qui ajoutent des chaînes) : il livre de, it, ar pour feature:settings et pour les chaînes de réglages de sdk-ui, plus un test de parité de clés/placeholders. La traduction des 11 autres modules (auth 94, calls 45, chat 277, contacts 47, conversations 237, feed 146, notifications 23, profile 67, reels 19, stories 139, app 66, sdk-ui 80) relève d'un lot i18n transversal HORS de ce domaine : sans lui, choisir l'allemand/l'italien/l'arabe produira un écran mélangé (le piège que iOS évite en refusant toute langue non traduite à 100 %). Décision recommandée : AppLanguage.supportedCodes n'expose une langue que lorsque tous les modules sont traduits, via un garde-fou de parité global.
pt : Android sert values-pt pour pt-BR ; le code sélectionnable est pt-BR (alias pt, pt_PT, pt-BR -> pt-BR comme iOS).

6. RISQUES.
- CI uniquement : les conteneurs n'atteignent pas dl.google.com ; Play In-App Review (about-and-support), ZXing dans sdk-ui et Coil/Media3 dans feature:settings ajoutent des dépendances prouvables seulement par android.yml. Pousser la logique dans :core:model (jvm-check local en 2 minutes).
- cache-purge-attribution-service : iOS DÉRIVE l'attribution en relisant les payloads GRDB ; Android ne persiste ni posts ni réels en Room. La décision (dérivation Room pour conversations/stories + registre DataStore alimenté à la lecture pour publications/réels, repli « Médias orphelins ») est à trancher à l'ouverture du lot, après mesure sur appareil ; l'invariant testable est somme(cases) + résidu = total disque mesuré.
- account-switcher-sheet est bloqué par ext:multi-account-session-vault : si le domaine auth ne le livre pas, scinder le lot en « coffre de sessions par compte » (core:datastore + Keystore, XL) puis « feuille et orchestration ».
- active-sessions : le modèle réseau ActiveSessionInfo (14 champs) est REMPLACÉ par UserSession (≈26 champs) ; la passerelle sert déjà ces champs (iOS les lit). Garder le décodage tolérant (champs absents = nil) pour les passerelles anciennes (production rétrocompatible).
- reportedType « comment » et « conversation » : confirmés côté iOS ; relire le schéma Zod createReportSchema avant d'envoyer.
- Le détecteur de locuteur actif et la reprise d'appel au lancement dépendent du domaine appels (maillage de groupe, écran de reprise).

7. COUVERTURE VISÉE. L'inventaire estime 48 %. Les 36 lots couvrent les 32 features ; seuls restent hors lots l'interface de console d'administration pour les permissions (aucun écran iOS ne consomme PermissionsService) et le contrôle de précision de découvrabilité dans le composeur (domaine feed).

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `audio-and-application-preferences-sync` | B | P0 | M | 620 | socle-points-d-extension-de-l-app, persist-outbox-registre-senders | Mes réglages de transcription et de thème suivent mon compte sur tous mes appareils |
| `security-hub-screen` | B | P0 | L | 950 | socle-points-d-extension-de-l-app, settings-ui-atoms-and-haptics | Un écran Sécurité réunit mot de passe, deux facteurs, e-mail, téléphone et sessions |
| `settings-hub-iso-layout` | B | P0 | L | 1100 | settings-ui-atoms-and-haptics, settings-notification-screen, security-hub-screen, audio-and-application-preferences-sync | Réglages se lit comme sur iOS : carte profil, sections à cartes teintées et en-tête qui se replie |
| `settings-notification-screen` | B | P0 | M | 700 | socle-points-d-extension-de-l-app, settings-ui-atoms-and-haptics | Les réglages de notifications détaillés ont leur propre écran, ouvert par «Plus d'options» |
| `settings-ui-atoms-and-haptics` | B | P0 | M | 560 |  | Tous les écrans de réglages partagent les mêmes cartes, rangées, séparateurs et bulles d'aide, avec le même retour haptique |
| `account-sdk-consents-permissions-discoverability` | B | P1 | M | 780 | audio-and-application-preferences-sync, reseau-pipeline-reessai-erreurs | Mes consentements, mes droits et le grain de découvrabilité de mes publications sont lus et écrits à la source |
| `active-sessions-cache-first-repository` | B | P1 | M | 600 | active-sessions-model-and-presentation, socle-points-d-extension-de-l-app | Mes appareils connectés s'affichent depuis le cache puis se revalident en silence, et une révocation échouée se défait |
| `active-sessions-model-and-presentation` | B | P1 | M | 560 |  | Chaque session active dit tout ce que le serveur sait : appareil, logiciel, lieu approximatif, ouverture et activité |
| `active-sessions-screen-states` | B | P1 | M | 850 | active-sessions-cache-first-repository, settings-ui-atoms-and-haptics | Je vois mes appareils connectés, je les déconnecte avec confirmation, et tout reste lisible hors ligne |
| `cache-purge-attribution-service` | B | P1 | L | 1200 | cache-purge-matrix-law, socle-points-d-extension-de-l-app | Android sait à quel domaine appartient chaque octet de cache et peut purger exactement ce qu'on lui demande |
| `cache-purge-matrix-law` | B | P1 | M | 500 |  | Le stockage se mesure par type de donnée et par domaine, avec la raison de chaque case non purgeable |
| `cache-purge-storage-screens` | B | P1 | L | 1100 | cache-purge-attribution-service, cache-purge-matrix-law, settings-ui-atoms-and-haptics, socle-points-d-extension-de-l-app | Je vois ce qui occupe mon stockage et je vide précisément ce que je choisis, par type et par domaine |
| `change-password-iso-and-first-password` | B | P1 | M | 520 | settings-ui-atoms-and-haptics | Je change mon mot de passe, ou j'en définis un premier, avec indicateur de force et confirmation animée |
| `delete-account-and-data-export-iso` | B | P1 | M | 520 | settings-ui-atoms-and-haptics | Je supprime mon compte après confirmation finale, ou j'exporte mes données et le partage s'ouvre tout seul |
| `language-flag-chip-unified` | B | P1 | M | 700 | chat-bulle-decoupage-composants, story-viewer-decomposition-and-nav-graph, feed-screen-split | Le drapeau d'une langue se tape pour changer la langue lue, avec la même cible, le même état et le même nom partout |
| `logout-confirmation-and-overlay` | B | P1 | M | 480 | settings-hub-iso-layout | Je me déconnecte après confirmation, avec un écran de progression qui bloque tout double appui |
| `privacy-settings-iso` | B | P1 | M | 700 | settings-ui-atoms-and-haptics | Je règle ma visibilité, mes contacts, mes médias et mes données avec une explication pour chaque réglage |
| `report-message-sheet-and-content-entry-points` | B | P1 | M | 750 | report-service-all-targets, report-reason-shared-ui-and-user-report, composer-glass-shell, chat-viewmodel-state-split, story-viewer-decomposition-and-nav-graph, feed-screen-split, feed-room-cache-and-realtime | Je signale un message, un commentaire ou une conversation en choisissant parmi des motifs expliqués |
| `report-reason-shared-ui-and-user-report` | B | P1 | M | 520 | settings-ui-atoms-and-haptics | Je signale un utilisateur avec un motif illustré et des détails limités à 500 caractères |
| `report-service-all-targets` | B | P1 | S | 300 |  | On peut signaler un message, un utilisateur, une publication, une story, un commentaire ou une conversation |
| `security-conversation-lock-section` | B | P1 | M | 360 | chat-destination-and-lock-gate, security-hub-screen | Je gère mon code PIN principal et mes verrous de conversations depuis Sécurité |
| `settings-theme-and-interface-language` | B | P1 | M | 750 | settings-hub-iso-layout, settings-ui-atoms-and-haptics, audio-and-application-preferences-sync, socle-points-d-extension-de-l-app | Je choisis le thème en trois pastilles et la langue d'interface parmi les sept langues de Meeshy |
| `settings-voice-transcription-tools-entries` | B | P1 | M | 550 | settings-hub-iso-layout, audio-and-application-preferences-sync | Réglages propose Transcription, Profil vocal, Outils Meeshy, Packs et Centre d'aide comme sur iOS |
| `two-factor-iso-flow` | B | P1 | M | 700 | security-hub-screen, settings-ui-atoms-and-haptics | J'active la 2FA par QR code, je copie ma clé et mes codes de secours, ou je la désactive |
| `about-and-support-pages-iso` | B | P2 | M | 520 | settings-ui-atoms-and-haptics, dependances-gradle-scene-medias | Les pages À propos et Aide affichent toutes les infos et liens d'iOS, et je peux copier chaque valeur ou noter l'app |
| `e2ee-safety-number-screen` | B | P2 | S | 330 | settings-ui-atoms-and-haptics, cles-e2ee-de-l-appareil-et-bundle-publie, session-e2ee-par-contact | Je vérifie le chiffrement de bout en bout d'une conversation avec un numéro de sécurité et un QR code |
| `language-picker-unified` | B | P2 | M | 420 | language-flag-chip-unified | Je choisis une langue dans une liste cherchable avec drapeau, nom natif et option «Aucune» |
| `legal-and-licenses-pages-iso` | B | P2 | M | 500 | settings-ui-atoms-and-haptics | Je lis les conditions et la politique de confidentialité dans la langue de mon choix, et chaque bibliothèque a sa carte de licence |

### Lots fusionnés ou retirés par l'architecture

- `settings-nav-graph-extraction` → `socle-points-d-extension-de-l-app` (drop-duplicate) : SettingsNavGraph.kt est créé par le socle qui découpe MeeshyApp.kt.
- `account-switcher-sheet` → `selecteur-de-comptes-et-reglages` (drop-duplicate) : Même feuille « Changer de compte » depuis Réglages. Hérite : logout-confirmation-and-overlay.
- `deleted-account-retirement` → `compte-supprime-retire-de-l-appareil` (drop-duplicate) : Même retrait d'un compte supprimé ailleurs. Hérite : ext:socket-account-deleted-signal.
- `settings-strings-de-it-ar` → `libelles-reglages-et-textes-legaux` (drop-duplicate) : Les chaînes de réglages de/it/ar sont générées depuis le catalogue iOS.
- `settings-interface-flags` → `modes-lecture-preferences-et-drapeaux` (drop-duplicate) : Mêmes drapeaux Lentille / modes / Rivière.
- `lock-pin-sheet-shared-extraction` → `chat-destination-and-lock-gate` (merge-into) : Même clavier PIN partagé dans :sdk-ui, nécessaire à la porte de conversation verrouillée.
- `call-active-speaker-highlight` → `calls-group-stage-and-start` (merge-into) : Même orateur actif mis en évidence.
- `calls-own-active-resume` → `calls-resume-policy-and-launch-resume` (drop-duplicate) : Même reprise d'appel au lancement.

## Features

### Mes consentements (voix, profil vocal, données) sont enregistrés et confirmés par le serveur

`sps-sdk-consent` · Android : **absente** · P1 · effort S

ConsentService lit GET /me/consents et écrit PUT /me/consents/{purpose} avec {granted, policyVersion} ; le serveur horodate et pose les consentements ancêtres (lignée), le client ne déduit jamais un consentement d'un blob de préférences (#4180). UserPreferencesManager conserve l'ensemble des consentements accordés, relu à chaque synchronisation, et grantVoiceAutoTranslationConsent accorde d'un geste la traduction vocale (consentement voice-cloning puis PATCH des préférences audio : transcription, traduction audio, synthèse vocale, profil vocal) ; erreur notGranted si le serveur ne l'accorde pas.

Écarts :
- Modèles ConsentPurpose (profil vocal, clonage vocal, données vocales, traitement des données) avec lignée d'ancêtres, ConsentEntry, ConsentPolicy.defaultVersion, et API Retrofit GET /me/consents + PUT /me/consents/{purpose}.
- Dépôt qui relit les consentements à chaque synchronisation de préférences et persiste l'ensemble accordé localement (DataStore) ; seule la colonne serveur fait foi.
- Geste d'octroi de la traduction vocale : consentement voice-cloning puis activation des préférences audio, avec erreur explicite si le serveur ne l'accorde pas.
- Ne jamais envoyer de clés de consentement dans PATCH /me/preferences/application (refusé par la passerelle, rendait la catégorie inenregistrable).

Rendu : Pas de rendu direct : alimente l'écran de consentement du profil vocal et les interrupteurs audio.

Transposition Android : UserDefaults -> DataStore ; APIClient.put -> Retrofit @PUT.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ConsentService.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`

### Pendant un appel de groupe, le participant qui parle est mis en évidence sans clignoter

`sps-call-active-speaker` · Android : **absente** · P2 · effort S

ActiveSpeakerDetector est un détecteur pur à hystérésis alimenté par les niveaux audio par participant : un participant devient locuteur actif au-dessus du seuil d'entrée 0,06, le reste tant qu'il dépasse 0,03 (seuil de sortie), et son statut survit 0,8 s après le dernier son (maintien). recording(niveaux, instant) et forgetting(userId) renvoient de nouveaux états. Utilisé par GroupCallMeshCoordinator pour désigner le locuteur dans la grille.

Écarts :
- Porter le détecteur d'hystérésis dans core:model (pur, testable) avec les mêmes paramètres : entrée 0,06, sortie 0,03, maintien 0,8 s.
- Alimenter le détecteur par les niveaux audio des pairs WebRTC (getStats audioLevel) dans le coordinateur d'appel de groupe ; aucun appel de groupe en maillage n'est branché côté Android.
- Mettre en évidence le locuteur actif dans la grille de l'appel (anneau/contour animé).

Rendu : Pas de rendu propre : le contour du locuteur actif est dessiné par la grille d'appel.

Transposition Android : RTCStatsReport audioLevel -> PeerConnection.getStats ; état immuable Equatable -> data class.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ActiveSpeakerDetector.swift`

</details>

### Un compte supprimé depuis un autre appareil quitte celui-ci avec ses données locales

`sps-deleted-account-retirement` · Android : **absente** · P2 · effort M

Quand la passerelle signale qu'un compte de l'appareil est supprimé (AccountDeletedSignal, accepté seulement pour le propriétaire du jeton présenté ou de la connexion socket), DeletedAccountRetirement retire ce compte du sélecteur et du trousseau, puis efface son dossier local (carnet de photos du jeu). Le retrait est noté avant le geste et effacé après succès, donc rejoué au lancement suivant si l'app est tuée ; la note est datée (un compte reconnecté depuis n'est plus retiré) ; une tombe datée (32 maximum) fait réeffacer le dossier si une écriture en vol le recrée. Idempotent.

Écarts :
- Signal « compte supprimé » détecté côté transport (payload d'erreur socket et réponses HTTP de jeton) et validé comme appartenant au compte de la connexion, publié sur un SharedFlow de sdk-core.
- Gestionnaire qui retire le compte de la liste multi-compte et du Keystore, puis efface les données locales propres au compte (dossiers fichiers, base Room scopée, caches) ; aucun équivalent aujourd'hui.
- Journal persistant en trois clés (en attente, date de note, tombes) dans DataStore avec rejeu au démarrage une fois la session stockée relue, exclusion d'un compte qui a reçu une session neuve depuis la note, limite de 32 tombes, garde d'idempotence (inFlight).
- Dépend d'un modèle multi-compte Android inexistant (voir sps-logout-switch-account).

Rendu : Aucun rendu : mécanisme silencieux ; l'utilisateur voit seulement le compte disparaître du sélecteur.

Transposition Android : NotificationCenter .meeshyAccountDeleted -> SharedFlow ; Keychain + UserDefaults -> Keystore + DataStore ; Application Support/MeeshyGame/<id> -> filesDir/<accountId>.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/DeletedAccountRetirement.swift`

</details>

### Je vérifie le chiffrement de bout en bout d'une conversation avec un numéro de sécurité et un QR code

`sps-e2ee-safety-number` · Android : **absente** · P2 · effort S

SecurityVerificationView affiche un grand bouclier, « Chiffrement de bout en bout » et la description nommant l'interlocuteur. Avec des clés Signal réelles : QR code du numéro de sécurité (200 pt sur fond blanc, ombre), numéro formaté par groupes de 5 chiffres en monospace, explication « comparez ce nombre ou scannez le QR de l'autre appareil », lecture VoiceOver chiffre par chiffre. Sans clés : état « Vérification indisponible » (sablier) expliquant qu'elle sera disponible après l'échange des clés. Bouton « Terminé » en barre de navigation ; le QR est généré une fois, hors du rendu.

Écarts :
- Écran de vérification (feuille) avec les deux états : numéro disponible / en attente de clés ; aucune trace côté Android et core:crypto est un module vide (E2EE absent).
- Formatage du numéro en groupes de 5 chiffres (chiffres uniquement), police monospace semibold centrée ; libellé « NUMÉRO DE SÉCURITÉ » en capitales caption medium muted.
- Génération du QR hors thread UI (ZXing est déjà une dépendance de feature:profile) avec cache de l'image ; carte blanche rayon lg, padding lg, ombre douce.
- Accessibilité : QR décrit (« QR code du numéro de sécurité, à scanner sur l'autre appareil »), numéro épelé chiffre par chiffre (« 1 2 3 4 5 »), titres annoncés en en-têtes, glyphes décoratifs masqués.
- Brancher sur la dérivation du numéro de sécurité à partir des clés Signal de la conversation (dépend du socle E2EE, optionnel par conversation).

Rendu : Héros lock.shield.fill 64 pt indigo400, titre titleSize bold, description subhead secondaire centrée padding xxxl ; section vérifiée : QR 200 x 200, libellé, numéro monospace, explication caption muted ; état en attente : sablier 40 pt muted + titre headline bold + texte caption.

Transposition Android : CIFilter.qrCodeGenerator -> ZXing QRCodeWriter ; sheet NavigationStack -> ModalBottomSheet plein écran.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/SecurityVerificationView.swift`

</details>

Android existant : `apps/android/core/crypto/src/main/kotlin/me/meeshy/core/crypto/Module.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ProfileShareSheet.kt`

### Je peux activer ou couper la liste Lentille, le mode de lecture et le mode Rivière depuis Réglages

`sps-interface-feature-flags` · Android : **absente** · P2 · effort S

Trois interrupteurs d'interface propres à l'appareil (#6482), actifs par défaut : liste Lentille, mode de lecture, mode Rivière. La Rivière est un mode de lecture : si les modes de lecture sont coupés, sa rangée est grisée (opacité 0,45), désactivée et porte l'indice « Disponible quand le mode de lecture est activé ». Sous le mode de lecture, un sous-titre explique : « Désactivé, les conversations s'ouvrent en Script ».

Écarts :
- Stocker trois drapeaux locaux à l'appareil (DataStore, défaut vrai) : lentilleList, readingModes, riviereMode, lus par les écrans correspondants.
- Trois rangées Switch avec icônes (list.bullet.rectangle, text.book.closed, water.waves) dans la section Apparence, libellés « Activer la liste Lentille / le mode de lecture / le mode Rivière ».
- Rivière : rangée désactivée + opacité 0,45 + indice d'accessibilité quand les modes de lecture sont coupés ; sous-titre explicatif sous la rangée Modes de lecture.
- Ces interrupteurs n'ont de sens que si la liste Lentille, les modes de lecture et la Rivière existent sur Android (fonctions d'autres parties, aucune trace dans le code).

Rendu : Rangées standards avec Switch teinté brandPrimary ; sous-titre smallSize textSecondary aligné sur le texte de la rangée ; rangée Rivière à 45 % d'opacité quand indisponible.

Transposition Android : LentilleFeatureFlag (UserDefaults) -> DataStore Preferences exposé en Flow.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift`

</details>

### Je choisis à quel grain ma publication est découvrable sur la carte, sans mensonge de précision

`sps-sdk-discoverability-precision` · Android : **absente** · P2 · effort S

DiscoverabilityPrecision (EXACT, NEIGHBORHOOD, CITY, REGION, valeurs majuscules de l'énumération Zod du gateway) nomme le grain demandé au serveur, qui calcule seul l'arrondi de grille (0,01°, 0,1°, 1°). Le client expose gridDecimals (nil, 2, 1, 0), gridDegrees pour dessiner la cellule, haloRadiusMeters (demi-cellule x 111 320 m) pour le halo du pin, allowedTiers(sharing) qui n'offre que des paliers au moins aussi grossiers que le partage de position déjà dégradé, et clamped(sharing) pour pré-sélectionner sans mentir (l'écran doit dire qu'il a resserré). Aucune valeur par défaut non nulle : absent = non découvrable.

Écarts :
- Énumération avec valeurs brutes EXACT/NEIGHBORHOOD/CITY/REGION, gridDecimals, gridDegrees, haloRadiusMeters, allowedTiers(under:) et clamped(under:) dans core:model (purs, testés).
- Champ discoverabilityPrecision optionnel dans la requête de création de publication, jamais de défaut non nul ; le client ne quantifie aucune coordonnée.
- Contrôle de choix dans le composeur de post et la découverte de proximité, avec message visible quand le palier est resserré par la précision de partage.

Rendu : Halo = cercle de rayon demi-cellule autour du pin (un cercle approximatif, jamais un point exact) pour les paliers autres qu'EXACT.

Transposition Android : Enum Codable -> @Serializable enum avec SerialName ; cercle de halo -> Circle de Google Maps/MapLibre.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/DiscoverabilityPrecision.swift`

</details>

### Mon rôle et mes droits administrateur sont relus à la source

`sps-sdk-permissions` · Android : **absente** · P2 · effort S

PermissionsService appelle GET /admin/me/permissions (accessible à tout compte, route S2) et renvoie MyPermissions {role, permissions} avec neuf drapeaux (accès admin, gestion utilisateurs/groupes/conversations/notifications/traductions, analytique, modération, journaux d'audit). Utile pour rafraîchir un rôle qui change entre deux ouvertures (promotion, rétrogradation). Mesuré : aucun appelant dans l'app iOS aujourd'hui.

Écarts :
- Modèles MeeshyPermissions (9 drapeaux) et MyPermissions + appel GET /admin/me/permissions ; relecture au lancement et au retour au premier plan.
- N'implémenter l'interface (console d'administration) que si elle est prévue : aucun écran iOS ne consomme ce service aujourd'hui.

Rendu : Aucun rendu.

Transposition Android : Retrofit GET + kotlinx.serialization.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/PermissionsService.swift`

</details>

### Je règle ma visibilité, mes contacts, mes médias et mes données avec une explication pour chaque réglage

`sps-privacy-settings` · Android : **divergente** · P1 · effort M

PrivacySettingsView affiche, en cartes teintées avec une icône colorée par réglage : Visibilité (statut en ligne, « Prévenir mes contacts quand je reviens sur Meeshy », dernière connexion, accusés de lecture, indicateur de frappe, « Ne pas me proposer à ceux qui ont mon numéro ou mon e-mail »), Contacts et groupes (demandes de contact, invitations de groupe, appels hors contacts), Localisation (section dédiée), Média et Données (sauvegarder média, analytique, partage des données, bloquer les captures) et Chiffrement (« Bientôt disponible », désactivé). Cinq réglages sans effet (bloquer les captures, sauvegarder média, partage des données, demandes de contact, invitations de groupe) sont affichés grisés « Bientôt disponible ». Une icône i ouvre une explication modale pour les réglages délicats (statut en ligne, retour des contacts, accusés de lecture réciproques, recherche par contact, appels hors contacts, analytique). Le réglage Analytique applique aussitôt la collecte.

Écarts :
- Ajouter le réglage notifyContactsOnReturn (« Prévenir mes contacts quand je reviens sur Meeshy », #8285) à PrivacyToggle/PrivacyPreferences et à la synchronisation : absent des 12 réglages Android.
- Boutons info (i) et overlay modal pour statut en ligne, retour des contacts, accusés de lecture (réciprocité), recherche par contact, appels hors contacts, analytique, avec les textes iOS (settings.privacy.*.info).
- Réglages « bientôt disponibles » : afficher grisés (opacité 0,55, non interactifs, texte « Bientôt disponible », libellé d'accessibilité « actuellement sans effet ») pour bloquer les captures, sauvegarder média, partage des données, demandes de contact, invitations de groupe, au lieu de vrais Switch (Android les rend modifiables alors qu'iOS les marque sans effet).
- Section Localisation (LocationSharingSettingsSection) : à ajouter entre Contacts et Média (voir partie localisation).
- Section Chiffrement affichée atténuée « Bientôt disponible / Désactivé » (existe côté Android, vérifier le rendu 0,55 et le libellé combiné).
- Réglage Analytique : synchroniser immédiatement l'état de collecte (AnalyticsManager.syncCollectionState) quand l'interrupteur change.
- Couleurs et icônes propres à chaque réglage (tileAmethyst, tileTeal, info, tileBlue, tileSaffron, tileCoral, 4ADE80) et ordre iOS ; gouttière xl.
- Mettre à jour le gabarit via les atomes partagés (sps-settings-ui-atoms).

Rendu : Cartes teintées par section ; chaque réglage = rangée avec tuile d'icône colorée, titre label medium, bouton i, Switch teinté brandPrimary ; séparateurs teintés ; section Chiffrement à 55 % d'opacité avec icône sablier.

Transposition Android : keyPath WritableKeyPath -> PrivacyToggle enum + descripteurs ; blockScreenshots pourrait devenir réel avec FLAG_SECURE mais iOS le marque « bientôt » : suivre iOS tant que non décidé.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/PrivacySettingsScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/PrivacySettingsViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Privacy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PrivacyPreferenceSyncBody.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/privacy/PrivacyPreferencesStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/privacy/PrivacyPreferencesSyncRepository.kt`

### Un écran Sécurité réunit mot de passe, 2FA, e-mail, téléphone, conversations verrouillées et sessions

`sps-security-hub` · Android : **divergente** · P1 · effort M

SecurityView est une seule page repliable avec six sections dans l'ordre : Mot de passe, Authentification à deux facteurs, E-mail, Téléphone, Conversations verrouillées, Sessions. Il charge le statut 2FA à l'apparition, ouvre des feuilles modales (changer le mot de passe, configuration/désactivation/codes de secours 2FA, feuilles PIN, sessions) et réutilise un style de section commun (en-tête icône + titre teinté, fond dégradé + bordure, icône de champ 28 pt, badge Vérifié / Non vérifié).

Écarts :
- Créer un SecurityScreen unique, accessible depuis Réglages > Compte > Sécurité, qui compose les six sections dans l'ordre iOS ; Android n'a que des lignes isolées dans Réglages.
- Charger le statut 2FA à l'apparition de l'écran et rafraîchir après chaque feuille (setup, désactivation, codes de secours).
- Section « Mot de passe » : ligne « Changer le mot de passe » (icône verrou, chevron) ouvrant le formulaire ; section « Sessions » : ligne « Gérer les sessions actives ».
- Style de section partagé : en-tête (icône + titre teinté), fond dégradé + bordure teintée, icône de champ 28 dp (rayon xs, fond teinte 12 %), badge capsule Vérifié (vert) / Non vérifié (orange).
- Accessibilité : en-têtes de section, badge lu comme « Vérifié / Non vérifié », ordre de focus du haut vers le bas.

Rendu : Sections séparées par MeeshySpacing.xxl, gouttière lg, en-tête de page repliable titre « Sécurité » flèche indigo500. Couleurs : mot de passe brandPrimary, e-mail 6366F1, téléphone indigo400, verrou F87171, 2FA 6366F1, sessions indigo400.

Transposition Android : Feuilles SwiftUI -> destinations de navigation plein écran ou ModalBottomSheet.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SecurityView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/TwoFactorScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountContactScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/ActiveSessionsScreen.kt`

### L'écran Réglages se lit comme sur iOS : carte profil, sections à cartes teintées et en-tête qui se replie

`sps-settings-hub` · Android : **divergente** · P1 · effort M

SettingsView est un ScrollView sur fond dégradé avec un CollapsibleHeader (titre large qui se replie au scroll, retour en accent brandPrimary) puis, dans l'ordre : carte profil (avatar avec anneau de décor, nom affiché, @username, chevron), Compte (Confidentialité, Sécurité, Utilisateurs bloqués, Supprimer le compte), Apparence, Profil vocal, Transcription, Notifications, Données, Outils Meeshy, Aide, À propos, Changer de compte, Déconnexion. Chaque ligne a un haptique léger (lourd pour suppression/déconnexion), un libellé et un indice d'accessibilité localisés, une icône décorative masquée. Les préférences sont rafraîchies depuis le backend à l'ouverture.

Écarts :
- Remplacer la TopAppBar plate par un en-tête repliable (LargeTopAppBar exitUntilCollapsed ou équivalent) avec flèche de retour en accent brandPrimary ; l'offset de scroll ne doit recomposer que l'en-tête.
- Refaire l'ordre des sections sur celui d'iOS : carte profil, Compte, Apparence, Profil vocal, Transcription, Notifications, Données, Outils Meeshy, Aide, À propos, Changer de compte, Déconnexion (Android : Profil, Apparence, Langue, Notifications, Discussions, Confidentialité et sécurité, Données, À propos, Zone de danger).
- Carte profil : MeeshyAvatar contexte conversationList avec anneau profileDecor.avatarRing, displayName en headline semibold et @username en subhead (Android montre username + e-mail sans anneau) ; fond inputBackground rayon lg, chevron, ouverture du profil de l'utilisateur courant.
- Section Compte iOS : Confidentialité, Sécurité (hub), Utilisateurs bloqués, Supprimer le compte (chevron rouge 60 %) ; Android éclate ces entrées (Changer le mot de passe, 2FA, E-mail et téléphone, Sessions actives) dans une section « Confidentialité et sécurité » : n'afficher que l'entrée Sécurité qui ouvre le hub.
- Ajouter les retours haptiques (léger sur navigation, lourd sur Supprimer le compte et Déconnexion) : aucun n'existe côté Android.
- Accessibilité : un libellé et un indice par ligne (clés settings.*.a11y / settings.*.hint), icônes décoratives masquées, titres de section annoncés comme en-têtes.
- La ligne « Version » affiche une chaîne figée « Version 1.0.0 » (R.string.settings_version) : afficher la vraie version (versionName + build) comme iOS (settings.version).
- Chargement des préférences depuis le backend à l'ouverture de l'écran (fetchFromBackend) avec affichage immédiat du cache.

Rendu : Fond theme.backgroundGradient. Gouttière horizontale lg, espacement xl entre sections, 40 dp de marge basse. Titre de section : majuscules, police footnote bold arrondie, tracking 1,2, couleur de la section, petite icône xs devant. Cartes rayon lg, dégradé surfaceGradient(tint) + bordure 1 dp teintée. Couleurs de section : Compte trackingAccent, Apparence warning, Profil vocal trackingAccent, Transcription indigo300, Notifications error, Données warning, Outils success, Aide success, À propos info. Rangées : tuile d'icône 32 dp rayon sm fond teinte 12 %, titre label medium, trailing (chevron xs muted ou Switch teinté brandPrimary).

Transposition Android : CollapsibleHeader -> LargeTopAppBar + scrollBehavior ; HapticFeedback.light/heavy -> LocalHapticFeedback (LongPress/ TextHandleMove) ou VibrationEffect ; router.push -> NavController ; fond backgroundGradient -> MeeshyBackground existant.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsViewModel.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Tous les écrans de réglages partagent les mêmes cartes, rangées, séparateurs et bulles d'aide

`sps-settings-ui-atoms` · Android : **divergente** · P1 · effort M

SettingsComponents (MeeshyUI) fournit les briques réutilisées par Confidentialité et les autres réglages : SettingsRowMetrics (icône 34, espacement 14, padding 16/15, hauteur minimale = cible tactile, séparateur aligné sur le texte), SettingsSectionHeader (icône + titre, trait en-tête), SettingsCard (surface teintée), SettingsSeparator, SettingsRow (icône teintée, titre, bouton info optionnel, contenu trailing), SettingsInfoButton (petit i distinct pour l'accessibilité) et le modificateur settingsInfoOverlay (carte modale explicative, fond voilé, fermeture au tap avec haptique, respect de Reduce Motion, trait modal).

Écarts :
- Extraire dans sdk-ui des composables publics SettingsSectionHeader, SettingsCard, SettingsSeparator et SettingsRow : aujourd'hui SettingsSection/SettingsRow sont privés à SettingsScreen.kt et PrivacySettingsScreen.kt en réimplémente d'autres.
- SettingsRowMetrics : tuile d'icône 34 dp, espacement icône/texte 14, padding horizontal 16 et vertical 15, hauteur minimale 48 dp, séparateur inséré à l'alignement du texte.
- SettingsRow avec icône teintée (fond couleur 12 %), titre, bouton info optionnel et slot trailing ; libellé d'accessibilité combiné titre + valeur (SettingsRowMetrics.accessibilityLabel).
- SettingsInfoButton (icône i) comme élément d'accessibilité distinct de la rangée, et overlay modal SettingsInfo(id, title, message) : carte centrée sur voile, fermeture au tap avec haptique, animation désactivée si les animations système sont réduites, sémantique de dialogue modal.
- SettingsCard : dégradé de surface teinté + bordure 1 dp teinte (jetons surfaceGradient(tint) / border(tint) à porter dans les thèmes Android).

Rendu : Rangée : icône dans tuile carrée arrondie (rayon sm) fond teinte à 12 %, titre en police label medium, Spacer, trailing. Carte : rayon lg, bordure fine teintée, séparateurs fins teintés inset sur le texte. Le bouton i est petit mais garde une cible tactile suffisante. Modale d'info : carte arrondie, titre en en-tête, message secondaire, fond voilé.

Transposition Android : SwiftUI ViewModifier overlay -> Dialog/Popup compose avec Modifier.semantics{ dialog() } ; Reduce Motion -> Settings.Global.ANIMATOR_DURATION_SCALE == 0 ; SF Symbols -> Material Icons.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Settings/SettingsComponents.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/PrivacySettingsScreen.kt`

### Je choisis une langue dans une liste cherchable avec drapeau, nom natif et option « Aucune »

`sps-language-picker` · Android : **divergente** · P2 · effort S

ProfileLanguagePickerSheet : feuille en pile de navigation, titre paramétré, barre de recherche native (nom, nom natif ou code), ligne optionnelle « Aucune » (xmark.circle) pour effacer, puis une ligne par langue (drapeau 36 pt, nom natif body medium, nom caption muted, fond et coche teintés de la couleur de la langue quand sélectionnée), ferme au choix avec haptique, bouton Fermer indigo500, accessibilité « natif, nom » et indice « Définit cette langue ». LanguageSelector est la liste déroulante inline de l'inscription : carte 2D2D40 à 60 %, chevron qui pivote, liste de 250 pt max (langues courantes d'abord), coche brandPrimary, animation spring.

Écarts :
- Feuille plein écran avec barre de recherche (nom, nom natif, code) au lieu d'une AlertDialog radio ; Android utilise un dialogue pour la langue régionale et une feuille de cartes pour l'inscription (deux implémentations).
- Ligne « Aucune » (effacer la langue régionale ou de destination personnalisée) : absente, l'utilisateur ne peut pas retirer une langue secondaire.
- Ligne de langue : drapeau 36, nom natif body medium, nom caption muted, sélection = fond teinte (couleur de la langue, opacité subtle) + coche cerclée de cette couleur ; haptique léger ; libellé d'accessibilité « natif, nom » et indice.
- Sélecteur inline de l'inscription : liste déroulante (chevron animé 180°, carte sombre, max 250 dp, langues courantes d'abord) ; Android ouvre une feuille : aligner ou décider explicitement de la divergence.
- Une seule source pour les deux : LanguageData.allLanguagesCommonFirst.

Rendu : Lignes rayon smPlus, padding mdPlus x smPlus ; sélection teinte de la langue à opacité subtle ; fond de feuille backgroundGradient.

Transposition Android : searchable -> SearchBar/OutlinedTextField ; NavigationStack sheet -> ModalBottomSheet ; chevron animé -> animateFloatAsState.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/LanguagePickerSheet.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/LanguageSelector.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/LanguagePickerDialog.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/LanguagePickerSheet.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/RegionalLanguageSelection.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`

### Je vois ce qui occupe mon stockage et je vide précisément ce que je choisis, par type et par domaine

`sps-storage-cache-purge` · Android : **divergente** · P2 · effort L

DataStorageView affiche la taille du cache média (images + audio + vidéo + miniatures) puis SelectiveCachePurgeView : une matrice de cases à cocher type de donnée (Images, Vidéos, Sons, Documents, Messages, Réactions, Données) x domaine (Publications, Réels, Conversations, Stories) avec la taille de chaque case, cases grisées avec la raison quand rien n'est mesurable, résidu « Médias orphelins » non attribué, en-tête de type cliquable pour tout cocher, « Tout sélectionner », bouton « Vider — jusqu'à X » (majorant car un fichier partagé compte deux fois) avec alerte « Vider définitivement ? ». Mesure débouncée à 120 ms, sélection nettoyée des cases devenues vides, octets libérés mémorisés.

Écarts :
- Remplacer les 4 catégories de MediaCacheCategory (images, audio, vidéo, miniatures) par la matrice sept types x quatre domaines : nécessite d'attribuer les octets de cache (Coil, ExoPlayer SimpleCache, Room, fichiers) à un domaine propriétaire (publications, réels, conversations, stories).
- Cases à cocher par cellule (taille à droite, texte rouge/gris selon octets), case grisée « minus.square » avec explication de la limite (pas de stockage dédié, intégré au contenu, indissociable des publications, non applicable).
- En-têtes de type cliquables (icône + nom en capitales + taille totale) qui cochent/décochent toutes les cases purgeables du type ; bouton « Tout sélectionner » ; sélection nettoyée automatiquement après mesure.
- Section « Non attribué / Médias orphelins » avec case et description (fichiers dont la publication, la story ou la conversation d'origine n'existe plus).
- Bouton « Vider — jusqu'à X » (rouge si sélection, grisé sinon « Sélectionnez ce qu'il faut vider »), spinner pendant la purge, alerte « Vider définitivement ? Cette suppression est irréversible, les données seront retéléchargées à la demande », mémorisation des octets libérés.
- Mesure débouncée 120 ms et déclenchée à l'apparition et après purge ; carte « Cache média » en tête avec taille totale, sous-titre « Images, audio et vidéos mis en cache » et description.
- Haptiques légers sur chaque case, moyens sur Tout sélectionner et Vider ; indices d'accessibilité (type, bouton destructif définitif).

Rendu : Une carte par type avec en-tête uppercase footnote bold arrondi tracking 1,2 accent brandPrimary et taille à droite ; lignes : case carrée (coche pleine accent), nom du domaine label medium, taille subhead semibold ; cellule indisponible à opacité réduite avec explication footnote ; bouton final rayon md fond error 12 %.

Transposition Android : CacheCoordinator stores (images/audio/video/thumbnails) + base -> Coil DiskCache, ExoPlayer SimpleCache, Room, cacheDir ; AudioPlayerView.formatBytes -> Formatter.formatShortFileSize.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/DataStorageView.swift`
- `packages/MeeshySDK/Sources/MeeshyUI/Settings/SelectiveCachePurgeView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaCacheScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaCacheViewModel.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaCacheStore.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/MediaCacheScanner.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/mediacache/MediaCacheReport.kt`

### Je vois mes appareils connectés (cache d'abord), je les déconnecte avec confirmation et annulation si ça échoue

`sps-active-sessions` · Android : **partielle** · P1 · effort M

ActiveSessionsView affiche « Cet appareil » puis « Autres appareils », chaque ligne disant tout ce que le serveur sert (nom de l'appareil, logiciel et version Meeshy/navigateur/système, lieu approximatif + adresse IP, fuseau, date et moyen d'ouverture, dernière activité). Cache-first : les sessions en cache s'affichent immédiatement puis sont revalidées en silence ; squelette si cache vide, états hors-ligne et erreur dessinés avec bannière et « Réessayer », tirer pour actualiser. Révoquer une session ou toutes les autres passe par une confirmation, retire la ligne tout de suite et la remet à son index si l'appel échoue, avec haptique succès/erreur et alerte. Pied de page : « Les lieux sont approximatifs » et lien d'attribution DB-IP (CC-BY 4.0).

Écarts :
- Compléter le modèle (ActiveSessionInfo n'a que 14 champs) : deviceName, browserVersion, appVersion, appBuild, platform (ios/web/pwa/android-shell), loginMethod, timezone, location, isTrusted, dates typées ; lire aussi geolocation (attribution DB-IP) avec repli DB-IP si absent.
- Présentation pure (SessionRowPresentation) : titre (nom servi, sinon modèle lisible, sinon fabricant + modèle, sinon « navigateur sur système », sinon « Appareil inconnu »), icône par type (tablette, mobile, ordinateur, plateforme), ligne logiciel « Meeshy 1.2.0 (1874) · Android 15 », lieu « Lyon, France (approximatif) · IP », « Fuseau : X », « Ouverte le … · Connexion par lien magique/mot de passe/mot de passe et code/inscription/vérification e-mail/compte externe/invité », « Active maintenant » ou « Dernière activité il y a … ».
- Sections « Cet appareil » / « Autres appareils », tri : session courante d'abord puis dernière activité décroissante ; badge « Actuelle ».
- Cache-first stale-while-revalidate sur la liste (clé sessions:list) : affichage immédiat du cache, revalidation silencieuse, persistance après chaque révocation.
- États : squelette (cache vide), hors-ligne (« Vous êtes hors ligne », bannière « Hors ligne — dernières informations connues »), erreur (« Impossible de charger les sessions », « Vérifiez votre connexion », « Réessayer », bannière « Actualisation impossible — tirez pour réessayer »), vide (« Aucune session active »).
- Tirer pour actualiser (PullToRefreshBox).
- Révocation : confirmation « Déconnecter cet appareil ? » avec nom de l'appareil, et « Déconnecter les autres appareils ? » (seul cet appareil restera connecté) ; suppression optimiste avec rollback à l'index d'origine ; haptique succès/erreur ; alerte d'erreur (aujourd'hui l'échec est silencieux) ; libellé d'accessibilité « Déconnecter X ».
- Pied de page : mention « lieux approximatifs, déduits de l'adresse IP » et lien d'attribution DB-IP cliquable.

Rendu : Ligne : icône d'appareil 32 dp (rayon xs), titre headline, lignes secondaires (logiciel, lieu, fuseau, ouverture, activité) en caption muted ; session courante avec badge « Actuelle » ; bouton « Déconnecter » capsule destructive sur les autres ; bouton plein largeur « Déconnecter les autres appareils » en bas de la liste ; squelettes : pastille 32 + lignes 140/pleine/180 de large.

Transposition Android : confirmationDialog -> AlertDialog ; refreshable -> PullToRefreshBox ; NetworkMonitor -> ConnectivityManager callback ; RelativeDateTimeFormatter -> DateUtils.getRelativeTimeSpanString ou java.time ; DeviceModelName.readable -> Build.MODEL / table d'équivalence.

<details><summary>Sources iOS (4)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ActiveSessionsView.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ActiveSessionsViewModel.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ActiveSessionsPresentation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/SessionService.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/ActiveSessionsScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/ActiveSessionsViewModel.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/AuthApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/AuthRepository.kt`

### Je change mon mot de passe, ou j'en définis un premier, avec indicateur de force et confirmation animée

`sps-change-password` · Android : **partielle** · P1 · effort S

ChangePasswordView : sections « Mot de passe actuel » et « Nouveau mot de passe » avec champs sécurisés (œil, focus enchaîné), indicateur de force, règles « Minimum 8 caractères » et « Les mots de passe correspondent » cochées en direct, bouton « Changer le mot de passe » (haptique moyen, spinner, désactivé tant que le formulaire est invalide). Si le compte n'a pas de mot de passe (security.hasPassword = false, #9186) le formulaire devient « Définir le mot de passe » sans champ actuel. Succès : overlay « Mot de passe modifié/défini » (bouclier coché, scale + fade) puis fermeture après 1,5 s, haptique succès ; 400 = « Mot de passe actuel incorrect ».

Écarts :
- Mode « définir un premier mot de passe » : lire security.hasPassword (état inconnu = formulaire de changement), masquer le champ actuel, libellés « Définir le mot de passe » / « Mot de passe défini », erreur 400 n'est « mot de passe actuel incorrect » que si le champ actuel est demandé.
- Overlay de succès (icône bouclier coché hero, texte callout semibold, carte matériau, transition scale + opacité, spring 0,4/0,8) et fermeture automatique après 1,5 s ; Android ferme immédiatement.
- Disposition en sections avec en-têtes (« Mot de passe actuel » icône verrou, « Nouveau mot de passe » icône clé) au lieu d'une colonne de champs ; placeholders « Entrez votre mot de passe », « Minimum 8 caractères », « Retapez le mot de passe ».
- Enchaînement du focus (actuel > nouveau > confirmation) avec actions IME Next/Done ; focus retiré à la soumission.
- Haptiques (moyen à l'envoi, succès, erreur) ; afficher le message serveur pour les erreurs non-400 au lieu d'un message générique.
- Conserver la règle supplémentaire Android « le nouveau mot de passe doit différer de l'actuel » (hors iOS) et le même message d'erreur réseau.

Rendu : Sections avec en-tête teinté (indigo600 / accent), champs dans cartes 28 pt icône ; règles de validation avec pastille verte quand remplies ; bouton plein accent rayon md, spinner blanc ; overlay centré carte rayon xl bordure success 25 %.

Transposition Android : FocusState -> FocusRequester + ImeAction ; SecureField -> PasswordVisualTransformation ; overlay -> AnimatedVisibility sur Dialog.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/ChangePasswordScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/ChangePasswordViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ChangePasswordForm.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PasswordStrength.kt`

### Je gère mon code PIN principal et mes verrous de conversations depuis Sécurité

`sps-conversation-lock-section` · Android : **partielle** · P1 · effort S

La section « Conversations verrouillées » montre l'état du code PIN principal (Configuré en vert / Non configuré), une capsule « N verrou(s) » et les actions : Configurer (capsule rouge proéminente) si aucun PIN ; sinon Modifier, « Déverrouiller tout (N) » si des conversations sont verrouillées, Supprimer seulement quand il n'y a plus aucun verrou. Chaque action ouvre la feuille PIN adaptée (création, changement en trois étapes, suppression, tout déverrouiller) intitulée « toutes les conversations ».

Écarts :
- Ajouter la section dans Sécurité : ligne d'état « Code PIN principal » (Configuré / Non configuré), capsule « N verrou(s) » rouge et icône bouclier coché, alimentées par un Flow du store (masterPinConfigured, lockedConversationIds) ; aujourd'hui les modes CHANGE_MASTER_PIN, REMOVE_MASTER_PIN et UNLOCK_ALL de LockPinReducer ne sont déclenchés que depuis la liste de conversations.
- Boutons : Configurer (capsule proéminente rouge, haptique moyen), Modifier (capsule teintée), « Déverrouiller tout (N) » (capsule warning), Supprimer (capsule error subtle, visible seulement à 0 verrou) ; Android garde son store protégé (removeMasterPin refusé tant que des verrous existent), à conserver.
- Réutiliser ConversationLockPinSheet avec un nom de conversation générique « toutes les conversations » pour ces modes.
- Cohérence de position : mêmes libellés et mêmes couleurs de section (F87171) que iOS.

Rendu : Rangée d'état avec icône lock.shield F87171, libellé caption2 medium muted, valeur subheadline medium (vert si configuré) ; capsules d'action footnote semibold padding mdPlus x sm, en bas de la carte.

Transposition Android : ConversationLockManager.shared (ObservableObject) -> Flow du ConversationLockStore ; Keychain -> EncryptedConversationLockStore.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SecurityView.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/lock/ConversationLockStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/lock/EncryptedConversationLockStore.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/LockPinReducer.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationLockPinSheet.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationHeaderActions.kt`

### Je supprime mon compte après avoir tapé la phrase de confirmation, saisi mon mot de passe et confirmé une dernière fois

`sps-delete-account` · Android : **partielle** · P1 · effort S

DeleteAccountView : carte d'avertissement « Action irréversible » listant ce qui est perdu (conversations, messages, médias, contacts, préférences), section Confirmation où l'on tape la phrase littérale « SUPPRIMER MON COMPTE » (mise en gras monospace dans l'invite), section mot de passe actuel (exigé par la route, #4183), bouton « Supprimer définitivement mon compte » (haptique lourd) qui ouvre une alerte « Confirmation finale ». Succès : bascule animée (spring) vers « Un email de confirmation vous a été envoyé » avec bouton « Compris » ; la suppression suit un délai de grâce confirmé par e-mail.

Écarts :
- Alerte « Confirmation finale » (« Êtes-vous absolument certain ? Cette action est irréversible. », Annuler / Supprimer destructif) avant l'appel réseau : absente côté Android.
- Haptiques : lourd sur le bouton, succès à la réussite, erreur à l'échec ; message d'échec « Erreur lors de la suppression du compte. Veuillez réessayer. ».
- Accessibilité du champ de phrase : valeur « Phrase correcte / Phrase incomplète », indice du bouton « Appuyez pour confirmer » ou « Tapez la phrase de confirmation d'abord ».
- Transition de bascule vers l'écran de confirmation par e-mail (spring 0,5/0,8, opacité + échelle 0,95) et en-tête déplié sur cet écran ; en-tête repliable conservé dans les deux états.
- Mise en forme : sections « Confirmation » (amber500) et mot de passe en cartes teintées, invite avec la phrase en gras monospace, phrase inchangée dans toutes les langues (littéral serveur).

Rendu : Carte d'avertissement rouge avec puces ; section confirmation couleur amber500 ; champ de phrase monospace ; bouton plein rouge error pleine largeur désactivé tant que phrase + mot de passe manquent ; écran e-mail : grande icône enveloppe, titre, corps, bouton « Compris ».

Transposition Android : alert SwiftUI -> AlertDialog ; transition spring -> AnimatedContent.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/DeleteAccountView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountDeletionScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountDeletionViewModel.kt`

### Je change mon e-mail ou mon téléphone et je les vérifie depuis Sécurité

`sps-email-phone-change` · Android : **partielle** · P1 · effort S

Les sections E-mail et Téléphone de SecurityView affichent la valeur actuelle avec badge Vérifié/Non vérifié, « Modifier » et « Vérifier » (si non vérifiée). Changer l'e-mail envoie un lien (« Email de vérification envoyé »), avec « Renvoyer l'email » désactivé pendant 60 s (compte à rebours « Renvoyer (42s) ») ; au retour au premier plan avec un e-mail en attente, la session est relue pour passer le badge à Vérifié. Le téléphone suit un flux partagé (PhoneChangeFlowModel, réutilisé par la proposition faite avant la recherche de contacts #8843) : saisie du numéro, envoi du code SMS, saisie du code à 6 chiffres, vérification.

Écarts :
- Relire la session au retour au premier plan (Lifecycle ON_RESUME) quand un e-mail de vérification est en attente, pour que le badge passe à Vérifié sans action.
- Extraire le flux téléphone (étapes éditer / code envoyé / vérifier) en un modèle réutilisable par la proposition d'ajout de numéro avant la recherche de contacts (#8843), au lieu de le garder dans l'écran Compte.
- Haptiques (léger sur Modifier/Annuler/Renvoyer, moyen sur Envoyer et Vérifier) ; placeholder « +33 6 12 34 56 78 », champ code 6 chiffres, types de clavier et autofill (emailAddress, telephoneNumber).
- Intégrer ces deux sections au futur écran Sécurité unique (voir sps-security-hub) plutôt qu'un écran « E-mail et téléphone » isolé.

Rendu : Carte par section avec icône de champ 28 dp ; valeur en subheadline medium, libellé caption2 muted ; badge capsule vert Vérifié / orange Non vérifié ; boutons capsule teintés (Modifier, Vérifier vert) ; erreurs en rouge sous le champ.

Transposition Android : scenePhase.active -> LifecycleEventEffect(ON_RESUME) ; textContentType -> autofillHints / KeyboardOptions.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SecurityView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountContactScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AccountContactViewModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/user/UserRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/UserApi.kt`

### Le drapeau d'une langue se tape pour changer la langue lue, avec la même cible, le même état et le même nom partout

`sps-language-flag-chip` · Android : **partielle** · P1 · effort M

LanguageFlagChip est la puce unique du Prisme Linguistique (bulle, fil, détail de post, commentaires, stories, reels) : un vrai bouton avec drapeau, soulignement 10x1,5 de la couleur de la langue quand elle est lue, léger agrandissement 1,05, animation 0,2 s, haptique léger, trois tailles de cible (standard 44 pt, overlay vidéo 32 pt, compact 22 pt pour le pied de bulle). Accessibilité : libellé parlé « Afficher en <langue> », valeur « Affiché » et trait sélectionné (l'état ne tient plus à la seule couleur). Le drapeau vient de deux tables (LanguageDisplay 41 langues avec couleur, LanguageData 78 langues + alias fil vers tl) ; à défaut, le CODE en majuscules, jamais un point d'interrogation. TranslationsBadge est la pastille « traductions disponibles ». LanguageProviding donne les langues préférées du compte et PostDisplayLanguage.code la langue servie d'un post par le Prisme.

Écarts :
- Composable unique LanguageFlagChip(code, isActive, metrics, onClick) réutilisé par toutes les surfaces ; Android a des tuiles 36 dp séparées (LanguageQuickStrip, MessageLanguageStrip, PostLanguageStrip).
- Trois tailles de cible tactile : standard 48/44 dp, overlay vidéo 32 dp, compact 22 dp (pied de bulle), sans chevauchement des zones sensibles ; ne jamais agrandir par marge négative.
- Soulignement d'état 10x1,5 dp de la COULEUR de la langue (LanguageDisplay.colorHex) et agrandissement 1,05 animé 0,2 s ; Android utilise un soulignement indigo400 fixe de 14x2.
- Sémantique : contentDescription « Afficher en <langue> », stateDescription « Affiché », selected = vrai ; rôle Button (aujourd'hui seulement une description « sélectionner »).
- Vocabulaire : drapeau via deux tables (langues avec couleur puis catalogue complet avec alias fil -> tl), repli sur le CODE en majuscules (« JA »), « ? » seulement sans code ; noms parlés, résumé « traduit de X ».
- Pastille TranslationsBadge (« traductions disponibles », bouton) pour les posts avec traductions.
- PostDisplayLanguage : fournir côté Android une fonction qui dit la langue réellement servie d'un post/commentaire par le Prisme (resolvePrismTranslation) afin de souligner la bonne puce ; LanguageProviding = source des langues préférées du compte.

Rendu : Drapeau caption (actif) ou caption2 (inactif) ; en overlay vidéo police 12 pt actif / 10 pt inactif ; soulignement arrondi 1,5 dp de haut sous le drapeau ; espacement vertical 1 dp entre drapeau et trait.

Transposition Android : Button SwiftUI + accessibilityValue/isSelected -> Modifier.clickable(role=Role.Button) + semantics{selected, stateDescription} ; @MainActor LanguageDisplay -> objet pur core:model.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Components/LanguageFlagChip.swift`
- `apps/ios/Meeshy/Features/Main/Services/LanguageProviding.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/LanguageQuickStrip.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageLanguageStrip.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/PostLanguageStrip.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/LanguageFlagTapResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageResolver.kt`

### Je me déconnecte avec confirmation et overlay, ou je passe d'un compte à l'autre sans rien perdre

`sps-logout-switch-account` · Android : **partielle** · P1 · effort L

Le bouton « Déconnexion » (fond error 8 %, contour error 25 %, texte rouge, haptique lourd) ouvre une alerte de confirmation ; la confirmation lance logout(forgettingAccount: false) asynchrone (quiesce-then-purge : coupe les sockets, réinitialise les services, vide le trousseau) pendant lequel un overlay bloquant « Déconnexion en cours » (voile noir, carte matériau, spinner, transition 0,18 s) interdit tout tap et désactive les boutons. Le compte reste listé : y revenir redemande le mot de passe. « Changer de compte » (#8286) ouvre AccountSwitcherSheet qui liste les comptes de l'appareil : un compte gardé s'ouvre sans mot de passe.

Écarts :
- Alerte de confirmation avant la déconnexion (titre + message, Annuler / Se déconnecter destructif) : Android appelle onLogout directement depuis le bouton.
- Overlay bloquant pendant la déconnexion asynchrone (spinner + « Déconnexion en cours »), boutons Déconnexion et Changer de compte désactivés, pour éviter le double-tap et la navigation orpheline.
- Modèle multi-compte : stockage Keystore par compte (jeton, identité), liste des comptes de l'appareil, déconnexion qui garde le compte listé, ouverture d'un compte gardé sans mot de passe, bascule de session avec reconnexion socket et isolation des données locales ; rien de tel n'existe côté Android.
- Bouton « Changer de compte » (icône personnes + flèches, fond inputBackground + contour) et feuille AccountSwitcherSheet avec avatar, nom, ajout d'un compte.
- Style des deux boutons : Changer de compte neutre (rien n'est perdu), Déconnexion en rouge atténué, icône semibold md + texte body semibold centrés pleine largeur, rayon lg.

Rendu : Overlay : voile noir opacité strong, carte au matériau translucide (rayon lg, padding xxxl horizontal / xxl vertical) avec ProgressView large blanc et libellé label medium blanc. Boutons de 3 niveaux de hauteur identique (padding vertical md+2).

Transposition Android : Keychain -> Android Keystore + EncryptedSharedPreferences/DataStore chiffré par compte ; AccountSwitcherSheet -> ModalBottomSheet.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt`

### Je signale un message ou un commentaire en choisissant parmi sept motifs expliqués

`sps-report-content` · Android : **partielle** · P1 · effort S

ReportMessageSheet (feuille) pose la question « Pourquoi signalez-vous ce message ? » (titre paramétrable, par exemple « ce commentaire », #8709) et liste sept motifs (Spam, Contenu inapproprié, Harcèlement, Violence, Discours haineux, Usurpation d'identité, Autre) chacun avec icône, libellé et description d'une ligne (« Messages répétitifs ou promotionnels », etc.). Champ « Détails (facultatif) » multi-lignes (« Décrivez le problème… »), bouton Envoyer dans la barre de navigation (spinner, libellé d'accessibilité conservé), Annuler. L'accent suit la couleur de la conversation ; la palette lit le colorScheme réellement rendu pour garder le contraste.

Écarts :
- Description d'une ligne et icône pour chacun des sept motifs (Android n'affiche qu'un libellé avec coche radio).
- Titre paramétrable pour réutiliser la feuille sur les commentaires de posts, réels et stories (« ce commentaire »), avec l'appel reportComment correspondant.
- Couleur d'accent de la conversation pour la sélection et le spinner (règle accentColor des composants en contexte conversation).
- Champ détails multi-lignes avec placeholder « Décrivez le problème… » ; bouton Envoyer dans la barre avec spinner pendant l'envoi et libellé d'accessibilité inchangé.
- Animation spring (0,3/0,8) du changement de sélection et haptique léger ; palette de fond de saisie dérivée du mode sombre/clair réellement rendu.

Rendu : Ligne : icône 24 pt à gauche (accent si sélectionnée), libellé subheadline medium, description caption secondaire une ligne ; coche à droite ; fond de saisie surfaceDarkInput/surfaceLightInput.

Transposition Android : NavigationStack sheet -> ModalBottomSheet ; ToolbarItem confirmationAction -> TopAppBar action.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ReportMessageSheet.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReportMessageSheet.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReportMessageForm.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/report/ReportReason.kt`

### Je signale un utilisateur avec un motif et des détails limités à 500 caractères

`sps-report-user` · Android : **partielle** · P1 · effort S

ReportUserView : titre « Signaler @username » et bouton fermer, liste des motifs (Spam, Harcèlement, Contenu inapproprié, Usurpation d'identité, Autre) en lignes avec icône et état sélectionné, champ « Détails (facultatif) » limité à 500 caractères avec compteur qui passe en avertissement dès 450, bouton « Envoyer le signalement » (haptique lourd), toast de succès « Signalement envoyé » puis fermeture, message d'erreur en ligne. Appelle ReportService.reportUser.

Écarts :
- Icône par motif (enveloppe pour spam, main levée pour harcèlement, triangle pour contenu inapproprié, silhouette pour usurpation, ellipse pour autre) et ligne sélectionnée teintée avec valeur d'accessibilité « Sélectionné ».
- Compteur de caractères avec seuil d'avertissement à 450/500 (CharacterCountLabel) ; Android affiche un compteur simple.
- Retour de succès : toast « Signalement envoyé » (FeedbackToastManager) avant la fermeture ; haptique lourd à l'envoi, succès/erreur ensuite.
- Sections avec en-têtes teintés (« Motif du signalement » warning, « Détails » info) et fonds de section ; indice d'accessibilité « Envoyer le signalement pour <nom> ».
- Ne PAS reprendre les jetons MAJUSCULES d'iOS (SPAM, INAPPROPRIATE_CONTENT) : la passerelle les rejette ; garder les jetons minuscules d'Android.

Rendu : Lignes de motif avec icône warning, tuile sélectionnée fond teinte ; éditeur de texte multi-lignes rayon md avec compteur en bas à droite ; bouton d'envoi plein rouge/accent pleine largeur.

Transposition Android : FeedbackToastManager -> Snackbar/toast Material ; sheet -> écran plein ou ModalBottomSheet.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/ReportUserView.swift`

</details>

Android existant : `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ReportUserScreen.kt`, `apps/android/feature/profile/src/main/kotlin/me/meeshy/app/profile/ReportUserViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/report/ReportReason.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/report/CreateReportRequest.kt`

### Après un redémarrage, l'application retrouve l'appel que le serveur tient encore ouvert

`sps-sdk-active-call` · Android : **partielle** · P1 · effort S

ActiveCallService lit GET /conversations/:id/active-call (appel en cours d'une conversation, utilisé pour réconcilier l'état local après perte de la session d'appel) et ownActiveCall lit GET /calls/active, l'appel propre de l'utilisateur quelle que soit la conversation, au lancement pour reprendre un appel détenu par le serveur (#9111) ; 404 NO_ACTIVE_CALL = rien à reprendre.

Écarts :
- Ajouter ownActiveCall (GET /calls/active, 404 NO_ACTIVE_CALL = null) : seul activeCallFor(conversationId) existe.
- Lire cet appel au lancement et proposer la reprise (CallManager+Resume / CallLaunchResume) : équivalent Android via ConnectionService/Telecom et notification d'appel en cours.
- Bouton d'appel de l'en-tête de conversation : pastille « rejoindre » quand un appel actif existe (RejoinPillPolicy existe déjà côté chat).

Rendu : Aucun rendu direct ; réutilise la pastille de réintégration d'appel de l'en-tête.

Transposition Android : CallKit -> Telecom ConnectionService ; reprise après kill -> lecture au démarrage de l'application + foreground service d'appel.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ActiveCallService.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/ActiveCallRepository.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/ActiveCallSession.kt`

### On peut signaler un message, un utilisateur, une publication, une story, un commentaire ou une conversation

`sps-sdk-report-service` · Android : **partielle** · P1 · effort S

ReportService poste sur /reports (route ordinaire S2, plus sur /admin) avec reportedType (message, user, post, story, comment, conversation), reportedEntityId, reportType et détails facultatifs. Après un signalement abouti d'un contenu social (utilisateur, post, story, commentaire), il émet un signal négatif « report_submit » (code du motif seul, jamais le texte libre) vers le hub d'événements sociaux (#10503) ; message et conversation n'émettent rien.

Écarts :
- Ajouter reportComment (reportedType « comment », commentaires de post/réel/story) et reportConversation (reportedType « conversation ») : seuls user, message, post et story existent dans ReportRepository.
- Émettre le signal social négatif report_submit (code du motif uniquement) après succès pour utilisateur, post, story et commentaire, dès que le hub d'événements sociaux V2 existe sur Android.
- Brancher les signalements de commentaire et de conversation sur leurs écrans (feed, stories, en-tête de conversation) avec la feuille de motifs partagée.

Rendu : Pas de rendu : couche réseau.

Transposition Android : APIClientProviding.post -> Retrofit ReportApi ; SocialEventsV2Hub -> bus d'événements sdk-core.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ReportService.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/report/ReportRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ReportApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/report/CreateReportRequest.kt`

### Les entrées Profil vocal, Transcription, Outils, Packs et Aide sont présentes dans Réglages

`sps-settings-entry-points` · Android : **partielle** · P1 · effort M

Réglages iOS expose : Profil vocal (Gérer / Créer un profil vocal), Transcription (interrupteur de transcription automatique des vocaux reçus + ligne d'information sur le moteur), Notifications rapides (push, sons, vibrations) avec « Plus d'options », Données (Stockage, Téléchargement des médias, Packs et téléchargements, Export), Outils Meeshy (Messages favoris, Publications enregistrées, Statistiques, Progression, Affiliation) et Aide (Centre d'aide).

Écarts :
- Section Profil vocal : lignes « Gérer mon profil vocal » et « Créer un profil vocal » ouvrant l'assistant et l'écran de gestion (fonctions à porter dans la partie voix, aucune trace côté Android).
- Section Transcription : Switch prefs.audio.autoTranscribeIncoming (le champ existe dans Preferences.kt mais aucune UI) + ligne d'information « moteur de transcription » sans chevron.
- Section Outils : ajouter Statistiques, Progression (badges, niveau, série) et Affiliation ; Messages favoris et Publications enregistrées existent déjà.
- Ligne « Packs et téléchargements » (packs de stickers et cadres du jeu) ouvrant l'écran de packs avec domaine et pack ciblés (lancement depuis la boutique).
- Notifications : iOS ne garde que trois interrupteurs (push, sons, vibrations) puis « Plus d'options » vers l'écran Notifications ; Android affiche tout en ligne (dix interrupteurs, plage Ne pas déranger, éditeur de types) : déplacer ce contenu dans un NotificationSettingsScreen dédié et réduire le hub à trois interrupteurs + une ligne.
- Section Données : ordre Stockage, Téléchargement des médias, Packs, Export (Android a deux lignes « Vider le cache » et « Stockage utilisé » qui ouvrent le même écran) ; section Aide avec Centre d'aide (ouvre Support).

Rendu : Mêmes rangées teintées que le hub : Profil vocal trackingAccent (waveform.circle, plus.circle vert), Transcription indigo300, Outils (étoile warning, signet indigo400, graphique indigo300, trophée warning, lien success), Aide (bouée success). Les Switch sont teintés brandPrimary avec libellé d'accessibilité et valeur Activé/Désactivé.

Transposition Android : Navigation sheet SwiftUI -> destinations NavHost ; prefs.updateAudio -> UserPreferencesManager Android (Preferences.kt + DataStore + sync).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`

### Je choisis le thème en trois pastilles et la langue d'interface parmi les sept langues de Meeshy

`sps-theme-interface-language` · Android : **partielle** · P1 · effort M

Apparence : une rangée thème avec trois pastilles icône + libellé (Auto, Clair, Sombre), sélection teintée avec animation spring et trait « sélectionné », synchronisée vers application.theme du backend. Une rangée « Langue de l'interface » ouvre un menu à coche : « Automatique » (suit la langue principale du compte) puis les langues natives fr, en, es, de, pt-BR, it, ar affichées dans leur propre langue ; le choix est enregistré et une alerte « Langue enregistrée : l'interface passera dans cette langue au prochain démarrage » le confirme.

Écarts :
- Thème : trois pastilles icône + libellé (Auto/Clair/Sombre) avec animation spring (réponse 0,3, amortissement 0,8) et teinte de la pastille choisie, au lieu du SegmentedButtonRow textuel ; haptique léger.
- Langues d'interface : iOS propose fr, en, es, de, pt-BR, it, ar ; Android déclare fr/en/es/ar (AppLanguage) mais ne livre des ressources qu'en en/es/fr/pt (values-ar, values-de, values-it et pt-BR distinct manquent). Ajouter ces traductions (environ 330 chaînes par langue pour feature:settings, plus les autres modules) et RTL pour l'arabe.
- Sémantique « Automatique » : doit suivre la langue principale (systemLanguage) du compte, comme iOS ; Android « System default » suit la locale de l'appareil.
- Libellés des langues dans leur propre langue (nom natif capitalisé) dans un menu déroulant à coche plutôt qu'une boîte de dialogue radio.
- Message de confirmation après changement (équivalent Android : appliquer immédiatement via AppCompatDelegate.setApplicationLocales/LocaleManager et le dire, ou indiquer le redémarrage) ; l'ancien contrôle avait été retiré faute d'effet réel : l'effet doit être vérifié sur l'écran courant.
- Synchroniser le thème choisi vers les préférences backend (application.theme) comme iOS.

Rendu : Pastille : icône sm au-dessus d'un libellé micro medium, une seule ligne, largeur idéale ; sélectionnée = teinte de la préférence (tintColor) + fond teinte 15 % rayon sm ; non sélectionnée = textMuted. Rangée langue : globe indigo600, valeur courante en subhead medium muted suivie d'un chevron haut/bas xxs.

Transposition Android : AppleLanguages/UILanguageOverride -> AppCompatDelegate.setApplicationLocales (per-app language, API 33+ LocaleManager) ; Menu SwiftUI -> DropdownMenu ; spring -> animateFloatAsState(spring).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SettingsScreen.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/language/InterfaceLanguageStore.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AppLanguage.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`, `apps/android/feature/settings/src/main/res/values/strings.xml`

### J'active la 2FA par QR code, je copie ma clé et mes codes de secours, ou je la désactive

`sps-two-factor` · Android : **partielle** · P1 · effort S

TwoFactorSetupView mène en quatre étapes (chargement, QR + clé secrète, saisie du code à 6 chiffres avec retour au QR, codes de secours) avec état d'erreur et « Réessayer ». TwoFactorDisableView demande mot de passe + code ; TwoFactorBackupCodesView régénère des codes après saisie d'un code 2FA, avec l'avertissement « Ces codes remplacent les précédents ». Dans Sécurité, la ligne « Statut 2FA » affiche Actif/Désactivé avec badge et les boutons Codes de secours / Désactiver / Activer. Le ViewModel expose checkStatus, beginSetup, enable, disable, getBackupCodes, avec messages d'erreur dédiés ; le service appelle /auth/2fa/status, setup, enable, disable, verify, backup-codes.

Écarts :
- Séparer l'étape QR/clé de l'étape saisie du code (bouton « Suivant », puis « Retour au QR code ») ; Android fusionne QR, clé et saisie sur un seul écran SETUP.
- Bouton « Copier la clé » (icône doc.on.doc qui devient une coche verte 2 s, haptique léger, clé monospace sélectionnable) en écrivant dans un presse-papiers sensible et à expiration (ExpiringClipboard).
- Bouton « Copier tous les codes » sur l'écran des codes de secours et sur la régénération (haptique succès, coche), liste de codes en grille monospace ; Android n'a aucune copie.
- Écran de succès « 2FA activé avec succès ! » (bouclier coché) avec consigne « Conservez ces codes dans un endroit sûr, chaque code ne sert qu'une fois ».
- Étape d'erreur plein écran avec message dédié et bouton « Réessayer » (triangle d'alerte), état de chargement initial ; QR illisible = triangle d'avertissement 200 dp à la place du code.
- Haptiques : moyen sur Suivant/Vérifier/Désactiver/Générer, succès et erreur à la validation du code.
- Ajouter l'appel POST auth/2fa/verify (TwoFactorService.verify) côté AuthApi/AuthRepository (absent) pour l'étape de connexion 2FA.
- Accessibilité : libellés « Clé secrète », « Copier la clé secrète », « Copié » ; conserver l'affichage Android du nombre de codes restants (absent d'iOS).

Rendu : QR 200 x 200 dp sur fond blanc rayon md ; icône qrcode 80 dp couleur 2FA (6366F1) ; clé en monospace semibold sur une ligne (minimumScaleFactor 0,7) ; champ code monospace centré 6 chiffres ; boutons principaux pleine largeur couleur 2FA, secondaires en texte.

Transposition Android : UIPasteboard expirant -> ClipboardManager avec ClipDescription.EXTRA_IS_SENSITIVE puis effacement différé ; QR base64 data URL -> BitmapFactory (déjà en place) ; sheet -> écrans de navigation ou ModalBottomSheet.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Views/TwoFactorSetupView.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/TwoFactorViewModel.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/TwoFactorService.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/TwoFactorScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/TwoFactorViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TwoFactorCode.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TwoFactorQrDataUrl.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/AuthApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/auth/AuthRepository.kt`

### La page À propos affiche version, informations, fonctionnalités et liens, et je peux copier chaque valeur

`sps-about` · Android : **partielle** · P2 · effort S

AboutView : en-tête (nom, « Version X (build) » avec menu Copier), section Informations (Plateforme, Bundle ID, Version du SDK, Profil média : Basique/Intermédiaire/Élevé/Pro), Description, Fonctionnalités (chiffrement de bout en bout, traduction en temps réel, clonage vocal, thèmes, synchronisation cloud), Liens (Site web, À propos, Conditions, Confidentialité, Nous contacter, Partenaires, Twitter/X, GitHub) et copyright « 2024-2026 Meeshy ». Un appui long (menu contextuel) sur la version et sur chaque ligne copie la valeur avec haptique succès, et une action d'accessibilité nommée « Copier » l'expose.

Écarts :
- Copie au maintien (menu contextuel « Copier ») de la version et de chaque ligne d'information, avec haptique succès et action d'accessibilité nommée.
- Ajouter la ligne « Profil média » (niveau de l'appareil : Basique, Intermédiaire, Élevé, Pro) aux informations.
- Compléter la liste de liens : Android n'a que Site web, Twitter, GitHub ; iOS en a huit (ajouter À propos /about, Conditions /terms, Confidentialité /privacy, Nous contacter /contact, Partenaires /partners) avec indice d'accessibilité « Ouvre X dans le navigateur ».
- Utiliser la vraie version + build dans Réglages (la ligne « Version » du hub est figée « 1.0.0 »).

Rendu : Sections en cartes teintées avec en-tête icône + titre ; lignes d'info : icône de champ, libellé muted, valeur à droite ; lignes de lien avec icône colorée et chevron ; copyright centré en caption muted.

Transposition Android : Link(destination:) -> Intent.ACTION_VIEW ; menu contextuel + UIPasteboard -> combinedClickable(onLongClick) + ClipboardManager ; UIDevice.systemVersion -> Build.VERSION.RELEASE.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/AboutView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/AboutScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/about/AboutPresentationBuilder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/about/AboutModels.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/about/AboutLinkResolver.kt`

### J'exporte mes données (profil, messages, contacts) en JSON ou CSV et je les partage

`sps-data-export` · Android : **partielle** · P2 · effort S

DataExportView : carte d'information RGPD « Vos données, votre contrôle », choix du format JSON/CSV (boutons pleins en accent), contenu avec interrupteurs Messages et Contacts (le profil est toujours inclus), bannière d'erreur, gros bouton « Exporter mes données » (spinner pendant l'export, devient vert « Export terminé » avec coche). À la fin, la feuille de partage système s'ouvre automatiquement avec le JSON joli (clés triées, dates ISO 8601) ; haptiques succès/erreur. Le service appelle GET /me/export?format=&types=profile,messages,contacts.

Écarts :
- Ouvrir automatiquement la feuille de partage à la fin de l'export (Android affiche une carte « prêt » avec bouton Partager à presser).
- État terminé du bouton : fond vert success, icône coche et libellé « Export terminé » (le bouton iOS reflète l'état, pas seulement la carte).
- Haptiques moyen au lancement, succès et erreur ; libellé et indice d'accessibilité dynamiques (« Export en cours »).
- Vérifier la carte d'information RGPD (icône shield.checkered 24 pt, titre labelSize bold, corps smallSize muted) et l'ordre des sections FORMAT puis CONTENU.
- Conserver l'avantage Android : résumé avec nombre de messages et de contacts exportés.

Rendu : Segments de format rayon md, sélectionné = fond accent texte blanc, sinon texte accent ; toggles avec icône colorée (bulle rouge, personnes indigo500) ; bouton principal pleine largeur padding mdPlus rayon md.

Transposition Android : ShareSheet(UIActivityViewController) -> Intent.ACTION_SEND + FileProvider (déjà en place).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/DataExportView.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/DataExportService.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/DataExportScreen.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/DataExportViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/export/DataExportFileBuilder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/export/DataExportRequest.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/DataExportApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/export/DataExportRepository.kt`

### Je lis les Conditions d'utilisation et la Politique de confidentialité, avec choix de la langue du document

`sps-legal-documents` · Android : **partielle** · P2 · effort S

TermsOfServiceView et PrivacyPolicyView : un sélecteur segmenté Français / Anglais (langue initiale élue parmi les langues de contenu du compte puis la locale appareil, repli français), une mention « Dernière mise à jour : 24 février 2026 » dans la langue choisie, puis des cartes de sections numérotées (icône n.circle.fill + titre + texte) en en-tête repliable.

Écarts :
- Sélecteur de langue du document (segmenté) avec langue initiale résolue (langues de contenu du compte puis locale, repli fr) ; Android suit uniquement la langue de l'application sans choix, mais couvre en/es/fr/pt (garder ces langues en plus de fr/en).
- Mention « Dernière mise à jour » localisée suivant la langue du document sélectionnée.
- Uniformiser la numérotation et la carte (icône n.circle.fill accent, titre body bold, texte label secondaire interligne 4) et l'en-tête repliable.
- Aligner le contenu textuel des sections (neuf conditions, plusieurs sections de confidentialité) sur les textes iOS à jour.

Rendu : Cartes rayon lg dégradé surfaceGradient(accent) + bordure ; numéro à gauche en icône lg semibold accent ; date en smallSize medium muted alignée à gauche.

Transposition Android : Picker segmenté -> SegmentedButton ; dictionnaires Swift en dur -> ressources legal.xml par langue (choix de langue = Resources avec Configuration locale).

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Views/TermsOfServiceView.swift`
- `apps/ios/Meeshy/Features/Main/Views/PrivacyPolicyView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/LegalDocumentScreen.kt`, `apps/android/feature/settings/src/main/res/values/legal.xml`, `apps/android/feature/settings/src/main/res/values-fr/legal.xml`

### La page Licences liste les bibliothèques open source avec un badge MIT, Apache ou BSD coloré

`sps-licenses` · Android : **partielle** · P2 · effort S

LicensesView : introduction « Meeshy utilise les bibliothèques open source suivantes », puis une carte par bibliothèque (nom, auteur, badge capsule du type de licence : MIT vert 4ADE80, Apache 2.0 ambre F59E0B, BSD bleu 3B82F6) qui ouvre le dépôt dans le navigateur ; libellé d'accessibilité « X par Y, licence Z » et indice « Ouvre le dépôt ».

Écarts :
- Présenter chaque bibliothèque dans sa propre carte avec capsule de licence colorée (Android les regroupe par type dans un seul bloc sans capsule).
- Libellé et indice d'accessibilité sur chaque carte (« X par Y, licence Z », « Ouvre le dépôt »).
- Le catalogue Android (16 dépendances Android) est correct tel quel ; ne pas reprendre la liste iOS.

Rendu : Carte : nom headline, auteur caption muted, capsule colorée à droite ; couleurs 4ADE80 / F59E0B / 3B82F6.

Transposition Android : Link -> ACTION_VIEW ; liste statique -> OpenSourceLicenseCatalog (ou plugin de licences Gradle).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/LicensesView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/LicensesScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/licenses/OpenSourceLicenseCatalog.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/licenses/OpenSourceLicensePresentationBuilder.kt`

### La page Aide et support propose centre d'aide, FAQ, contact, signalement de bug et note de l'application

`sps-support` · Android : **partielle** · P2 · effort S

SupportView : Obtenir de l'aide (Centre d'aide, FAQ, « Noter l'app » qui déclenche l'avis intégré avec haptique), Nous contacter (e-mail du support, Twitter/X), Signaler un problème (bug et suggestion, e-mails pré-remplis), Informations (Version, Build, Plateforme). Liens avec indice « Ouvre X ».

Écarts :
- Ajouter l'action « Noter l'app » (Play In-App Review, repli lien fiche Play Store) avec haptique léger, absente de la section Aide.
- Vérifier les mêmes trois sections de liens et la section Informations (Version, Build, Plateforme « Android X ») ; indice d'accessibilité « Ouvre X ».

Rendu : Quatre cartes teintées (accent, info, warning, neutral500) avec lignes icône + titre + chevron ; informations en valeur à droite.

Transposition Android : SKStoreReviewController -> Google Play In-App Review API ; mailto -> ACTION_SENDTO.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/SupportView.swift`

</details>

Android existant : `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/SupportScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/support/SupportPresentationBuilder.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/support/SupportModels.kt`


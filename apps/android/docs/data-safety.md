# Déclaration « Sécurité des données » de Google Play

Équivalent Android de `apps/ios/Meeshy/PrivacyInfo.xcprivacy` (fiche de confidentialité Apple).
Source : les types de données collectées déclarés côté iOS, rapprochés des catégories de la
console Play. **Aucun dépôt tant que l'agent `conformite-juridique` n'a pas relu ce document** :
il outille le travail, il ne remplace pas un avis juridique signé.

## Principes communs

- **Pas de suivi** (`NSPrivacyTracking = false` ↔ aucune donnée « partagée » à des fins publicitaires) : aucun SDK publicitaire ni d'attribution.
- **Chiffré en transit : oui, pour tout.** HTTPS/WSS seulement en release (`network_security_config.xml`, trafic en clair interdit).
- **Suppression : oui.** La suppression du compte efface les données serveur (écran Compte > Supprimer, export RGPD disponible). Les données locales (Room, préférences) sont exclues de toute sauvegarde (`allowBackup=false`, `data_extraction_rules.xml`).
- **Carnet d'adresses** : le serveur ne garde en clair que les contacts **inscrits**. D'un non-inscrit, il ne garde qu'une empreinte HMAC à clé secrète, sans nom, qui ne sert qu'à annoncer « X a rejoint Meeshy ». Rien d'un non-inscrit n'est collecté en clair : la catégorie « Contacts » est donc déclarée **non liée** (comme iOS, `Linked = false`).
- **Messages E2EE** (optionnel, par conversation) : le serveur ne voit jamais le clair ; la traduction se fait sur l'appareil.
- Finalités : « Fonctionnalités de l'application » partout ; « Analyse » seulement là où iOS le déclare.

## SDK tiers

| SDK | Données qu'il traite | Déclaration |
|-----|----------------------|-------------|
| Firebase Cloud Messaging (`firebase-messaging`) | identifiant d'installation Firebase, jeton push, adresse IP à l'enregistrement | Identifiants d'appareil — collecté, fonctionnalités de l'app ; partagé avec Google comme prestataire (traitement pour notre compte) |
| WebRTC (appels) | flux audio/vidéo pair-à-pair, adresses IP via ICE/STUN | Audio, photos/vidéos — **transitent**, non conservés par Meeshy ; chiffré en transit (DTLS-SRTP) |

Aucun autre SDK de collecte n'est lié (vérifier `gradle/libs.versions.toml` à chaque ajout ; `crashlytics` n'est pas présent : la ligne « données de plantage » ne sera cochée qu'avec son arrivée).

## Rapprochement iOS → Play

La fiche iOS déclare 15 types (le programme parlait de 14 : le décompte du fichier fait foi).
`Lié` = rattaché à l'identité du compte.

| # | Type iOS (`NSPrivacyCollectedDataType…`) | Lié | Finalité iOS | Catégorie Play | Collecté | Partagé | Chiffré en transit | Supprimable |
|---|------------------------------------------|-----|--------------|----------------|----------|---------|--------------------|-------------|
| 1 | UserID | oui | Fonctionnalités | Infos personnelles > ID utilisateur | oui | non | oui | oui |
| 2 | EmailAddress | oui | Fonctionnalités | Infos personnelles > Adresse e-mail | oui | non | oui | oui |
| 3 | PhoneNumber | oui | Fonctionnalités | Infos personnelles > Numéro de téléphone | oui | non | oui | oui |
| 4 | OtherUserContactInfo | oui | Fonctionnalités | Infos personnelles > Autres infos (profil : nom affiché, langues) | oui | non | oui | oui |
| 5 | PhotosOrVideos | oui | Fonctionnalités | Photos et vidéos > Photos / Vidéos | oui | non | oui | oui |
| 6 | AudioData | oui | Fonctionnalités | Fichiers audio > Messages vocaux ou fichiers audio | oui | non | oui | oui |
| 7 | Contacts | non | Fonctionnalités | Contacts > Contacts (inscrits seulement ; empreinte HMAC pour les autres) | oui | non | oui | oui |
| 8 | CoarseLocation | oui | Fonctionnalités | Position > Position approximative | oui (sur action) | non | oui | oui |
| 9 | PreciseLocation | oui | Fonctionnalités | Position > Position précise | oui (sur action) | non | oui | oui |
| 10 | OtherUserContent | oui | Fonctionnalités | Messages > Autres messages dans l'application (+ traduction/transcription) | oui | non | oui | oui |
| 11 | CrashData | oui | Analyse | Activité de l'appli et performances > Journaux de plantage | non tant qu'aucun SDK de plantage n'est lié | — | — | — |
| 12 | PerformanceData | non | Analyse | Activité de l'appli et performances > Diagnostics | à confirmer avec l'analytique réellement livrée | non | oui | oui |
| 13 | DeviceID | oui | Fonctionnalités, Analyse | Identifiants d'appareil ou autres > ID de l'appareil (jeton FCM, identifiant d'installation) | oui | oui, à Google (FCM) comme prestataire | oui | oui |
| 14 | ProductInteraction | oui | Fonctionnalités, Analyse | Activité de l'appli > Interactions dans l'appli | oui | non | oui | oui |
| 15 | SearchHistory | oui | Analyse | Activité de l'appli > Historique des recherches dans l'appli | oui | non | oui | oui |

## Permissions ↔ déclarations

Chaque permission du manifeste est justifiée dans `app/src/test/resources/manifest/permissions-registry.json`
(garde `ManifestPermissionGuardTest`). `READ_CONTACTS`, `RECORD_AUDIO`, `CAMERA`, la position et
`POST_NOTIFICATIONS` s'ouvrent à l'usage, après une explication localisée en sept langues.
Les permissions de capacités futures (biométrie, appels système, services typés, Bluetooth) arrivent
avec leur fonctionnalité et sont listées comme « planned » dans le registre.

## Avant dépôt

1. Relecture par l'agent `conformite-juridique`, puis avis juridique signé.
2. Confirmer lignes 11 et 12 avec l'analytique réellement livrée côté Android.
3. Aligner l'URL de la politique de confidentialité avec celle de la fiche iOS.

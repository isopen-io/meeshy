# Parité iOS → Android : `sdk-auth-crypto-e2ee`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**16 features iOS** : 10 absentes, 5 partielles, 1 divergentes, 0 complètes sur Android. **13 lots** planifiés (≈6720 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**sdk-auth-crypto-e2ee** (couverture Android estimée ≈ 12 %)

Cette partie est le socle sécurité de l'iOS : (1) le trousseau (KeychainManager, protocole KeychainStoring, VoIPTokenStore, AuthProfileKeychainStore) qui range jetons, profil et garde de profil optimiste, isolés par compte ; (2) le chiffrement du cache local (DatabaseEncryption, AES-GCM, clé en trousseau, empreinte de clé) ; (3) la pile E2EE Signal MVP (E2EEService : clés X25519/Ed25519 et bundle, E2EAPI : /signal/keys + /conversations/:id/encryption, SessionManager : sessions ECDH+HKDF par pair avec cache négatif de 600 s, DecryptionActor + DecryptedMessageLedger + signposts) ; (4) le scellement de traduction partagée AES-GCM/HKDF, miroir du module TS, vérifié par vecteurs ; (5) la protection de contenu visible : voile « Vue unique · touchez pour afficher », règle de toucher (ProtectedContentTap), loi « un appui long ne dévoile rien », voile d'instantané du sélecteur d'applications, politique AirPlay/PiP sous bouclier.
Côté Android la couverture est d'environ 12 % : EncryptedTokenStore et EncryptedConversationLockStore (EncryptedSharedPreferences sur Keystore, un seul compte, sans abstraction ni async ni migrations), l'enregistrement du jeton FCM sans persistance ni cooldown, BubbleBlurReveal + BlurRevealLifecycle (flou/brouillard à toucher, minuterie de 5 s portée fidèlement), la pierre tombale « Vu et supprimé » et l'encart EncryptionDisclaimer. Le module :core:crypto n'est qu'un placeholder vide ; Room est en clair (le commentaire « SQLCipher per ADR-013 » n'est pas câblé) ; aucun appel /signal/* ni /encryption-status ; aucun FLAG_SECURE ; la vue unique n'est pas consommée côté serveur (le code dit « until that endpoint is wired ») et se re-floute après 5 s au lieu de se consumer. Ordre conseillé : coffre sécurisé → vue unique/voile (P0, comportement visible et fuite de contenu) → chiffrement du cache → pile E2EE (optionnelle par conversation selon la directive 2026-10-03 : ne PAS recopier le repli « DM en clair » du MVP iOS ; la passerelle fait foi, fail-closed) → scellement de traduction partagée.

## Notes transverses

VERIFIE DANS L'ARBRE (ecarts avec l'inventaire, tous consignes dans les lots) :
1. PUSH CASSE, pas seulement incomplet : NotificationApi appelle POST/DELETE notifications/device-token, route qui N'EXISTE PAS cote passerelle (seule /users/register-device-token existe, POST et DELETE) ; le @DELETE porte un @Body (Retrofit le refuse a l'appel) ; le jeton recu avant connexion est perdu (onNewToken seul, aucun rejeu apres login, aucune lecture du jeton au demarrage) ; le DTO garde platform=ios/type=apns par defaut (seul encodeDefaults=false l'empeche de fuir). Aucun google-services (plugin ni json) n'est applique : FirebaseMessaging ne s'initialise pas. Lot push-token = P0, prerequis Firebase hors domaine.
2. VUE UNIQUE : Android declenche l'etat brule sur viewOnceCount > 0 (compteur d'AUDIENCE) au lieu de consumedByMe (par lecteur, #7578) ; ApiMessage ne decode pas consumedByMe ni message:consumed ; le contenu reste MONTE sous le flou (texte lisible par TalkBack, images telechargees par Coil) alors que l'iOS le retire du rendu (sealedForDisplay) ; la vue unique se re-floute apres 5 s alors que l'iOS la laisse lisible jusqu'a la sortie ; l'iOS a remplace la tombe Vu et efface par la puce (1) Deja ouvert.
3. E2EE : Android ne decode AUCUN champ d'enveloppe E2EE du message (isEncrypted, encryptionMode, encryptedContent, encryptionMetadata) et la passerelle ACCEPTE aujourd'hui un clair dans une conversation e2ee (MessageProcessor journalise client should encrypt) : le garde-fou client est le seul rempart -> lot 2, P0, avant toute cle.
4. NE PAS RECOPIER LE MVP iOS : (a) contrat de fil : la passerelle attend encryptedContent + encryptionMode (casse normalisee, liste fermee e2ee/server/hybrid) + encryptionMetadata <= 8 Ko, et refuse isEncrypted=true sans encryptedContent ; l'iOS met le base64 dans content et retombe en clair en cas d'echec (interdit par la directive du 2026-10-03, fail-closed) ; (b) derivation asymetrique id_A x spk_B vs id_B x spk_A : deux premiers messages croises donnent deux cles differentes, et LiveSessionProvider ne passe jamais senderIdentity donc un destinataire sans session prealable ne dechiffre pas ; cle statique sans forward secrecy ; (c) la passerelle garde UN bundle par userId (upsert where userId, deviceId fige a 1) : un compte iOS+Android s'ecrase mutuellement. ADR-018 prevoit des sessions par appareil. Les lots 13-15 sont donc conditionnes par deux decisions externes (ext:passerelle-bundles-signal-par-appareil, ext:adr-e2ee-derivation-symetrique) a trancher avec l'agent crypto-e2ee ; le chiffre doit porter une version dans encryptionMetadata (additif) pour que le passage au ratchet ne soit pas une bascule seche (retrocompatibilite production). Tous les lots crypto/auth (1, 12-16) passent par l'agent auditeur-adversarial avant fusion (CLAUDE.md racine).
5. PROFIL : l'outbox Room porte deja UPDATE_PROFILE (durable) -> la garde du profil optimiste n'a pas besoin du second stockage iOS meeshy_pending_profile ; SessionRepository.refresh() ecrase aujourd'hui sans garde.
6. BASE : Room est en clair (commentaire SQLCipher non cable), MediaBlobEntity.bytes (medias en attente d'envoi, dont des vues uniques) et l'outbox y vivent ; fallbackToDestructiveMigration detruit l'outbox a chaque bump de schema -> la migration clair->chiffre doit PRESERVER l'outbox. ADR-013 tranche SQLCipher (pas de chiffrement par ligne comme l'iOS) ; aucun FTS n'existe encore, l'alternative par ligne reste a confirmer par ADR si le cout de demarrage ou d'APK l'impose.
7. Le jeton de session invite (AnonymousSessionContext) est dans un DataStore en clair ; PinHasher est un SHA-256 non sale (ADR-013 demande un KDF lent sale) -> a ouvrir en suivi (hors lots), de meme que la depreciation d'EncryptedSharedPreferences (Tink+DataStore).

ARCHITECTURE : interface SecureStore, faux en memoire et toutes les lois pures (namespace, politiques, reducteurs, cooldown 600 s, table du toucher) dans :core:model (Kotlin pur, testables en local par ./apps/android/meeshy.sh jvm-check) ; implementation Keystore dans :core:datastore ; primitives et cles dans :core:crypto (jvm-check etendu par le lot 12 a ce module, sans import android) ; :core:crypto ne depend PAS de :core:network (interfaces PeerBundleSource etc. implementees dans :sdk-core). Nouvelles aretes : app et core:network/sdk-core -> core:datastore (Hilt), sdk-core -> core:crypto (prevu par ARCHITECTURE), core:crypto et core:database -> core:model. Chaque lot ajoute ses bindings Hilt dans SON module (SdkModule.kt n'est edite que par le lot 1).

ORDRE ET FICHIERS CHAUDS (ChatScreen 2953 l., ChatViewModel 2248 l., MessageBubble 1202 l., Message.kt, SessionTeardown.kt, OutboxFlushWorker.kt) : les edits sont serialises par depends_on, chaque lot limite son diff a un point d'appel et loge sa logique dans un fichier neuf : 2 -> 3 -> 4/5 -> 6 (apres 11) -> 15 ; 14 -> 15 pour SessionTeardown. Vagues proposees : A = 1, 2, 12 ; B = 3, 7, 8, 9, 11, 13 ; C = 4, 5, 14, 16 ; D = 6, 10 ; E = 15.

VERIFICATION : les conteneurs n'atteignent pas dl.google.com -> seule la CI android.yml prouve Room/Compose/Hilt/Keystore ; tout ce qui est pur se prouve par jvm-check ; SQLCipher, AndroidKeyStore, FLAG_SECURE et l'instantane des recents ne sont pas testables en JVM et il n'existe pas d'androidTest : chaque lot concerne liste une verification manuelle appareil (Pixel API 34 + un appareil API 26).

I18N : sdk-ui/feature n'ont que en, es, fr, pt ; l'iOS en a 7 (ar, de, en, es, fr, it, pt-BR). Les nouvelles cles sont livrees dans les 4 langues existantes ; ar/de/it dependent du domaine localisation (ext) et le voile doit etre relu en RTL.

DEPENDANCES EXTERNES A PLANIFIER (autres domaines) : ext:bouclier-de-capture-android (SecureCaptureRegistry + FLAG_SECURE, miroir de CaptureShield) ; ext:configuration-firebase-fcm ; ext:passerelle-bundles-signal-par-appareil ; ext:adr-e2ee-derivation-symetrique ; ext:traduction-partagee-android et ext:traduction-sur-appareil (consommateurs du sceau et du mode e2ee) ; ext:suppression-de-compte-confirmee (appel de destroyKey) ; la surface flamme-oeil (consumeAfterRead) partage la porte de sortie du lot 6 ; le chrome de protection au-dessus de la bulle (MessageProtectionChrome) et un eventuel ViewOnceChip deja pris par le domaine bulles sont a deduper avec le lot 5 avant demarrage. Couverture reelle : l'inventaire annonce 12 % ; la parite de ce domaine est plus proche de 5 % une fois les ecarts 1-3 comptes.

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `chiffrement-de-conversation-active-depuis-les-reglages` | A | P0 | M | 520 | message-chiffre-jamais-brouille-ni-envoye-en-clair, composer-glass-shell | Je vois si une conversation est chiffrée, je peux activer le chiffrement (définitif) et je sais ce qui reste disponible |
| `coffre-securise-par-compte` | A | P0 | M | 650 | session-renouvellement-un-seul-vol, reseau-pipeline-reessai-erreurs | Mes jetons de connexion et mes codes de verrouillage sont rangés dans un coffre sécurisé, isolé par compte |
| `loi-de-la-vue-unique-et-du-toucher-protege` | A | P0 | M | 520 | message-chiffre-jamais-brouille-ni-envoye-en-clair, message-fil-decodage-complet-et-tolerant | Une vue unique ou un flou réagit au toucher selon une règle unique et testée, propre à chaque lecteur |
| `message-chiffre-jamais-brouille-ni-envoye-en-clair` | A | P0 | M | 480 | persist-outbox-registre-senders, persist-messages-repository-decoupage, message-fil-decodage-complet-et-tolerant, liste-conversations-fil-complet-et-contrat-apercu, composer-glass-shell, chat-viewmodel-state-split, chat-bulle-decoupage-composants | Un message chiffré s'affiche comme message chiffré illisible, et rien n'est envoyé en clair dans une conversation chiffrée |
| `ouverture-et-sortie-des-vues-uniques-dans-le-chat` | A | P0 | M | 420 | vue-unique-consommee-par-chaque-lecteur, voile-puce-et-flou-des-contenus-proteges, chiffrement-de-conversation-active-depuis-les-reglages, chat-bulle-decoupage-composants, composer-glass-shell, chat-viewmodel-state-split | Je lis une vue unique sur place ou en plein écran, et elle passe à déjà ouverte quand je quitte la conversation |
| `voile-puce-et-flou-des-contenus-proteges` | A | P0 | M | 700 | loi-de-la-vue-unique-et-du-toucher-protege, message-chiffre-jamais-brouille-ni-envoye-en-clair, chat-bulle-decoupage-composants, chat-viewmodel-state-split | Un contenu flouté ou à vue unique se voile, se dit et se dévoile comme sur iPhone |
| `vue-unique-consommee-par-chaque-lecteur` | A | P0 | M | 520 | loi-de-la-vue-unique-et-du-toucher-protege, message-fil-decodage-complet-et-tolerant, piece-jointe-fil-complet-et-protection, persist-outbox-registre-senders, persist-messages-repository-decoupage, socket-routage-evenements-ordre-arrivee, chat-viewmodel-state-split, chat-bulle-decoupage-composants | Une vue unique ne s'ouvre qu'une fois par lecteur, même hors ligne, et son contenu disparaît de l'appareil |
| `cles-e2ee-de-l-appareil-et-bundle-publie` | A | P1 | M | 650 | coffre-securise-par-compte, primitives-cryptographiques-verifiees, reseau-pipeline-reessai-erreurs | Mon appareil génère ses propres clés de chiffrement de bout en bout et publie son bundle public sans écraser celui d'un autre appareil |
| `contenus-proteges-hors-captures-et-recents` | A | P1 | M | 340 | voile-puce-et-flou-des-contenus-proteges, bouclier-capture-ecran-android, socle-points-d-extension-de-l-app | Un message ou une vidéo protégés ne fuient ni dans les applications récentes, ni en diffusion, ni en fenêtre flottante |
| `messages-chiffres-envoyes-et-lus` | A | P1 | M | 600 | session-e2ee-par-contact, message-chiffre-jamais-brouille-ni-envoye-en-clair, ouverture-et-sortie-des-vues-uniques-dans-le-chat, socle-points-d-extension-de-l-app, dependances-gradle-scene-medias, persist-outbox-registre-senders, persist-messages-repository-decoupage, message-fil-decodage-complet-et-tolerant, chat-viewmodel-state-split | J'envoie et je lis des messages chiffrés de bout en bout sans attente, et seul un message prouvé déchiffré peut être copié |
| `primitives-cryptographiques-verifiees` | A | P1 | M | 380 | dependances-gradle-scene-medias | Les calculs de chiffrement de l'appareil donnent exactement les mêmes octets que sur iPhone |
| `session-e2ee-par-contact` | A | P1 | M | 520 | cles-e2ee-de-l-appareil-et-bundle-publie, coffre-securise-par-compte, socle-points-d-extension-de-l-app | Une session chiffrée se crée avec chaque contact sans configuration, et s'efface à la déconnexion |
| `session-et-profil-rouverts-a-froid` | A | P1 | M | 420 | coffre-securise-par-compte | Mon profil s'affiche dès l'ouverture à froid et une modification non confirmée survit au redémarrage |

### Lots fusionnés ou retirés par l'architecture

- `cache-local-chiffre-au-repos` → `persist-sqlcipher-base-chiffree` (merge-into) : Même chiffrement SQLCipher de Room au repos (ADR-013) ; la destruction de clé à la suppression de compte rejoint ce lot. Hérite : coffre-securise-par-compte.
- `appareil-inscrit-aux-notifications-push` → `jeton-push-enregistre-des-la-connexion` (drop-duplicate) : Même enregistrement du jeton FCM sur /users/register-device-token. Hérite : coffre-securise-par-compte.
- `traduction-partagee-scellee-sur-l-appareil` → `traduction-partagee-enveloppe-scellee` (drop-duplicate) : Même enveloppe de traduction partagée scellée.

## Features

### Le cache local des conversations est chiffré au repos et devient illisible quand le compte est supprimé

`crypto-cache-db-encryption` · Android : **absente** · P1 · effort M

DatabaseEncryption (singleton + protocole DatabaseEncryptionProviding pour injecter des faux) chiffre les lignes du cache GRDB en AES-256-GCM (forme `combined` nonce‖chiffré‖tag). La clé de 32 octets est créée au premier lancement et rangée en trousseau (`meeshy_db_encryption_key`) ; si elle ne peut pas être persistée, un log `.fault` annonce que le cache de la session sera illisible au relancement. API : encrypt/decrypt Data, encryptString/decryptString, encryptCodable/decryptCodable (dates ISO-8601 ; un schéma périmé après déchiffrement réussi = cache miss, pas de crash). `keyFingerprint` (8 premiers octets du SHA-256 de la clé, hex) est mélangé aux contentHash du cache pour que tout changement de clé invalide les empreintes (sinon le skip « payload identique » laisserait des rangées indéchiffrables). `destroyKey()` supprime la clé à la suppression de compte pour rendre le cache irrécupérable.

Écarts :
- Room est en clair : `Room.databaseBuilder(...).fallbackToDestructiveMigration()` sans openHelperFactory ; le KDoc de MeeshyDatabase promet « SQLCipher whole-DB encryption per ADR-013 » mais rien n'est câblé. Choisir : SQLCipher (net.zetetic `SupportOpenHelperFactory`) avec passphrase de 32 octets tirée de SecureRandom et protégée par Keystore, OU chiffrement par ligne AES-GCM comme iOS (iso de comportement : champs sensibles chiffrés, index en clair).
- Provider de clé : générer 32 octets au premier lancement, persister via le coffre sécurisé, journaliser en erreur grave si la persistance échoue ; si la clé disparaît (restauration, effacement des données) la base doit être recréée proprement (pas de crash, retour à l'état « cache vide / cold start »).
- Interface `DatabaseEncryptionProviding` (encrypt/decrypt/keyFingerprint) pour injection de faux dans les tests de repositories, avec défaut `keyFingerprint = ""`.
- `keyFingerprint` : empreinte stable (8 octets du SHA-256 de la clé, hex) à mélanger aux hashes de contenu utilisés par les mises à jour conditionnelles du cache (si Android a un skip « payload identique »).
- Helpers encryptString/encryptCodable avec encodage des dates ISO-8601 et traitement d'un décodage échoué comme cache miss (schéma périmé) plutôt que comme erreur.
- `destroyKey()` appelé par SessionTeardown à la suppression de compte (et wipe de la base) pour rendre les restes illisibles ; aujourd'hui seul `database.clearAllTables()` est appelé.
- Surveiller le coût de démarrage : l'ouverture SQLCipher/Keystore est faite hors thread principal avant le premier écran (cible : aucun spinner sur cache non vide).

Rendu : Aucun rendu. Contrainte de fluidité : le chiffrement/déchiffrement ne s'exécute jamais sur le thread UI ni pendant un scroll ; les listes continuent de s'afficher depuis le cache en < 1 frame après ouverture.

Transposition Android : Clé en trousseau → clé de base en Keystore (EncryptedSharedPreferences ou clé AES enveloppante). GRDB chiffré par ligne → SQLCipher sur Room (openHelperFactory) ou convertisseurs Room chiffrants ; android:allowBackup=false est déjà posé et doit rester.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Security/DatabaseEncryption.swift`

</details>

Android existant : `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/DatabaseModule.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/MeeshyDatabase.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`

### Les messages chiffrés d'une conversation s'ouvrent instantanément, déchiffrés en parallèle et sans refaire le travail déjà fait

`crypto-e2ee-decryption-pipeline` · Android : **absente** · P1 · effort S

DecryptionActor déchiffre un lot de DecryptionPayload{messageId, senderId, ciphertext} en parallèle (TaskGroup) via un DecryptionSessionProviding injectable, et rend des DecryptionResult{messageId, plaintext?, error?}. Mémo `messageId → (ciphertext, plaintext)` plafonné à 1 000 entrées (éviction FIFO) : chaque `messagesDidChange` retraitait toute la fenêtre (200+ messages) en DM ; même clé de pair ⇒ même ciphertext = même clair, et un message édité (nouveau ciphertext) invalide l'entrée d'office. Les ÉCHECS ne sont jamais mémoïsés (une session transitoirement indisponible peut réessayer au refresh). CryptoSignposts émet des signposts `decrypt` begin/end (octets) dans la catégorie Points of Interest, avec un crochet de test.

Écarts :
- Aucun pipeline de déchiffrement : créer `DecryptionPipeline` (coroutines) prenant une liste de payloads et rendant une liste de résultats, déchiffrement parallèle via `async` sur Dispatchers.Default, fournisseur de session injectable (interface `DecryptionSessionProvider`).
- Mémo borné (1 000 entrées, éviction du plus ancien) clé messageId, valeur (ciphertext, plaintext) : le hit exige l'égalité des octets du ciphertext (comparer en contenu, pas en référence) ; jamais de mémo des échecs.
- Branchement dans le flux des messages de ChatViewModel (remplacer `content` par le clair uniquement si succès, laisser le chiffré sinon) et appel déclenché à chaque changement de la fenêtre sans bloquer le thread UI.
- Traçage : `CryptoSignposts.beginDecrypt/endDecrypt` → `androidx.tracing` (`Trace.beginAsyncSection("decrypt", cookie)`) + crochet de test remplaçable ; aucun identifiant de message dans les logs de production sans masquage.
- Tests de comportement : second déchiffrement d'une même fenêtre sans appel au fournisseur ; message édité redéchiffré ; échec puis réussite au refresh suivant.

Rendu : Aucun rendu propre. Contrainte de fluidité : le clair remplace le chiffré sans flash ni saut de hauteur de bulle ; pendant le déchiffrement la bulle garde sa place (squelette/placeholder discret, pas de spinner si mémo disponible).

Transposition Android : Actor + TaskGroup → classe à Mutex + coroutineScope/async ; os_signpost Points of Interest → androidx.tracing / Perfetto (Trace.beginAsyncSection) ; `LiveSessionProvider` (adaptateur dans E2ESessionManager.swift) → petite classe liant le gestionnaire de session à l'interface DecryptionSessionProvider.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Crypto/DecryptionActor.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Diagnostics/CryptoSignposts.swift`

</details>

### Chaque appareil génère et garde ses propres clés de chiffrement de bout en bout, publiées sous forme de bundle public

`crypto-e2ee-key-management` · Android : **absente** · P1 · effort M

E2EEService gère le matériel cryptographique de l'appareil, en trousseau et sous préfixe `me.meeshy.e2ee.` : clé d'identité Curve25519 KeyAgreement (X25519), Signed PreKey X25519, clé de SIGNATURE Ed25519 distincte (aucune réutilisation X25519/Ed25519), une one-time prekey (id fixe `otpk.1`), identifiants stables aléatoires 1…65535 (registrationId, preKeyId, signedPreKeyId, persistés en Int32 base64), `getOrGenerate*` idempotents. `generatePublicBundle()` produit le BackendPreKeyBundle (clé d'identité publique, signature Ed25519 de la Signed PreKey publique, otpk, deviceId 1, Kyber nil). Primitives : AES-GCM combined (encrypt/decrypt), `deriveSymmetricKey` = X25519 puis HKDF-SHA256 (sel vide, info `MeeshyE2EE`, 32 octets). `clearAllKeys()` à la déconnexion. Migration unique de l'ancien préfixe `com.meeshy.e2ee.*`. Erreurs typées (keyNotFound, encryptionFailed, invalidBase64Payload).

Écarts :
- Le module :core:crypto n'est qu'un `CryptoModulePlaceholder` (KDoc : libsignal en Phase 3) : implémenter la gestion de clés.
- Génération X25519 (identité + Signed PreKey + one-time prekey) et Ed25519 (signature) : API 33+ expose XDH/Ed25519 via Keystore pour les clés non exportables mais l'iso avec iOS exige des clés BRUTES de 32 octets échangeables ; utiliser Tink (`com.google.crypto.tink`) ou BouncyCastle/lazysodium, stockage base64 des octets bruts dans le coffre sécurisé.
- Bundle public octet-identique au format iOS : `identityKey` = 32 octets bruts base64, `signedPreKeyPublic` brut base64, `signedPreKeySignature` = Ed25519(signedPreKeyPublic) base64, `preKeyId`/`registrationId`/`signedPreKeyId` stables (aléatoires 1…65535 persistés).
- `deviceId` figé à 1 côté iOS : un utilisateur iOS + Android écraserait le bundle de l'autre sur `POST /signal/keys` ; décider avec la passerelle d'un deviceId distinct par plateforme (ou multi-appareils) AVANT de publier un bundle Android.
- Primitives de chiffrement compatibles : AES-256-GCM `combined` (nonce 12 ‖ chiffré ‖ tag 16) et dérivation X25519 + HKDF-SHA256 (sel vide, info UTF-8 `MeeshyE2EE`, 32 octets) pour déchiffrer/chiffrer avec iOS ; vecteurs de test croisés iOS↔Android.
- `clearAllKeys()` appelé par SessionTeardown à la déconnexion (le KDoc de SessionTeardown note déjà l'absence d'équivalent) ; rotation de la Signed PreKey et réapprovisionnement des one-time prekeys à prévoir (iOS ne le fait pas : MVP à une seule otpk).
- Erreurs typées (keyNotFound, encryptionFailed, base64 invalide) traduites en états d'interface plutôt qu'en crash.

Rendu : Aucun rendu. Les messages d'erreur utilisateur (clé introuvable, bundle invalide) passent par le même vocabulaire que l'iOS : « message chiffré illisible » dans la bulle, jamais d'erreur technique brute.

Transposition Android : CryptoKit Curve25519 → Tink/BouncyCastle (X25519, Ed25519, AES-GCM, HKDF) ; stockage Keychain → Keystore (enveloppe AES-GCM) ; E2EE est OPTIONNEL par conversation selon la directive porteur 2026-10-03 (#9224) : Android n'active ce chemin que pour une conversation chiffrée.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/E2EEService.swift`

</details>

Android existant : `apps/android/core/crypto/src/main/kotlin/me/meeshy/core/crypto/Module.kt`

### L'appareil publie son bundle de clés et récupère celui d'un contact pour ouvrir une conversation chiffrée

`crypto-e2ee-key-server-api` · Android : **absente** · P1 · effort S

E2EAPI est le client REST du protocole Signal côté passerelle : `POST /api/v1/signal/keys` (upload du BackendPreKeyBundle — identityKey, registrationId, deviceId, preKeyId/preKeyPublic, signedPreKeyId/Public/Signature, champs Kyber optionnels), `GET /api/v1/signal/keys/:userId` (bundle d'un contact), `POST /api/v1/signal/session/establish` (body recipientUserId + conversationId). Les réponses `data` sont des OBJETS (décodage en dictionnaire souple, un `String` faisait échouer l'upload à chaque démarrage à froid). La publication a lieu au démarrage à froid.

Écarts :
- Aucune interface Retrofit `SignalApi` (uploadBundle, fetchBundle, establishSession) ni DTO `PreKeyBundle` dans :core:network / :core:model ; aligner les noms de champs sur `signal-protocol.ts` (identityKey, registrationId, deviceId, preKeyId?, preKeyPublic?, signedPreKeyId, signedPreKeyPublic, signedPreKeySignature, kyberPreKeyId?, kyberPreKeyPublic?, kyberPreKeySignature?).
- Décoder `data` des endpoints upload/establish comme objet JSON libre (JsonObject), pas comme String ; erreurs 4xx/5xx mappées vers NetworkResult.
- Publication du bundle au démarrage à froid / après login, idempotente et non bloquante (jamais avant le premier écran), avec nouvelle tentative différée en cas d'échec réseau (offline graceful).
- Journalisation sans secret (ni clés ni signature) ; ne jamais envoyer de clé privée.

Rendu : Aucun rendu : service REST.

Transposition Android : APIClient.shared → Retrofit/NetworkResult existants (core/network) ; pas de mapping spécial.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/E2EAPI.swift`

</details>

### Un message direct est chiffré pour son destinataire et déchiffré à la réception, sans que l'utilisateur ne configure rien

`crypto-e2ee-session-manager` · Android : **absente** · P1 · effort M

SessionManager (acteur) établit et conserve une clé de session symétrique PAR PAIR : `getOrCreateSession` charge depuis le cache mémoire puis le coffre (namespacé par userId, clé `me.meeshy.e2ee.session.<peerId>`), sinon récupère le bundle du pair, notifie `session/establish`, dérive la clé (X25519 identité locale × SignedPreKey du pair → HKDF) et la persiste ; `deriveSessionFromIncoming` dérive côté récepteur (SignedPreKey locale × identité publique de l'expéditeur) ; `encryptMessage`/`decryptMessage` (AES-GCM). Cache NÉGATIF de 600 s des établissements en échec (SessionError.sessionUnavailable) — une tâche annulée ne l'alimente pas. `migrateKeychainIfNeeded` (non-namespacé → namespacé, drapeau par userId) et `clearSessions` (efface les clés du compte SORTANT grâce à `lastKnownUserId` mis en cache, car le userId courant est déjà nil au logout). Registre des pairs connus (`knownPeers`). Protocole d'injection `DirectMessageEncrypting` et adaptateur `LiveSessionProvider` vers `DecryptionSessionProviding`. NB : l'iOS retombe en clair pendant le cooldown (MVP) ; la directive 2026-10-03 impose le fail-closed dans une conversation chiffrée.

Écarts :
- Aucun gestionnaire de session E2EE : créer `E2eeSessionManager` (Mutex/acteur de coroutines) avec `getOrCreateSession`, `deriveSessionFromIncoming`, `encryptMessage`, `decryptMessage` et le protocole d'injection `DirectMessageEncrypting` consommé par ChatViewModel.
- Persistance des clés de session par pair dans le coffre namespacé par compte + registre `knownPeers` ; cache mémoire des sessions actives.
- Cache négatif 600 s des établissements échoués (fonction pure `isWithinFailureCooldown(failedAt, now, cooldown)` testable), non alimenté par une annulation de coroutine (CancellationException).
- Effacement à la déconnexion : `clearSessions()` utilisant le dernier userId connu (mémorisé pendant la session) puisque l'utilisateur courant est déjà effacé quand le teardown s'exécute ; brancher dans DefaultSessionTeardown (la KDoc y réserve déjà l'emplacement) et appeler `clearAllKeys()`.
- Migration de namespace des anciennes clés de session (`migrateToNamespaced`) une fois par userId, uniquement pour les pairs déjà connus.
- Politique d'échec : Android DOIT suivre la directive 2026-10-03 (fail-closed : un message en clair dans une conversation chiffrée est refusé, l'interface explique) plutôt que le repli « DM en clair » du MVP iOS ; coordonner avec la passerelle (#9224/#9229) et ne pas recopier le repli.
- Compatibilité croisée iOS↔Android : un pair iOS doit déchiffrer un message Android et inversement (mêmes octets : X25519 brut, HKDF `MeeshyE2EE`, AES-GCM combined) ; vecteurs de test communs.

Rendu : Aucun rendu direct. États visibles côté bulle : message chiffré illisible (clé de session indisponible) affiché sous forme de bulle « message chiffré, impossible à lire sur cet appareil » avec un style discret, jamais le base64 brut.

Transposition Android : Acteur Swift → classe avec Mutex (kotlinx.coroutines) ; UserDefaults pour knownPeers et drapeaux → DataStore/EncryptedSharedPreferences ; Keychain → coffre Keystore.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`

### Le sélecteur d'applications ne montre pas un contenu qui disparaît (vue unique, flou) quand l'app passe en arrière-plan

`crypto-protected-snapshot-veil` · Android : **absente** · P1 · effort S

ProtectedContentSnapshotVeil (#9574) : la couche sécurisée (CaptureShield) noircit captures, enregistrements et recopie d'écran, mais l'instantané que le système prend quand l'app quitte le premier plan est un autre chemin. Dès `willResignActive`, si au moins un contenu protégé est dans une fenêtre (SecureCaptureRegistry.visibleCount > 0), un voile opaque (UIVisualEffectView systemThickMaterial + fond systemBackground à 92 %) couvre CHAQUE fenêtre de l'app ; il se retire à `didBecomeActive`. Aucun contenu protégé à l'écran ⇒ rien ne se pose. Installé une fois au lancement ; branche aussi le reporter de diagnostic du bouclier sur CrashDiagnosticsManager. Règle pure testable `shouldVeil(visibleProtectedCount:)`. Éléments d'accessibilité masqués.

Écarts :
- Aucun usage de FLAG_SECURE, `Activity.setRecentsScreenshotEnabled(false)` ni de voile de récents dans apps/android.
- Registre `SecureCaptureRegistry` (nombre de contenus protégés visibles, incrément/décrément par composable protégé en composition) : à créer côté Android — dépend de la couche « bouclier de capture » d'une autre partie du domaine.
- Voile d'instantané : à `ON_PAUSE`/`ON_STOP` de l'Activity (ProcessLifecycleOwner / `DefaultLifecycleObserver`), si `visibleCount > 0`, ajouter au `decorView` une vue opaque (flou thick material simulé : `RenderEffect.createBlurEffect` API 31+, repli sur aplat `surface` à 92 %) ; retirer à `ON_RESUME`. Compléter par `setRecentsScreenshotEnabled(false)` (API 33+) et FLAG_SECURE dynamique tant que `visibleCount > 0`.
- Règle pure `shouldVeil(visibleProtectedCount) = count > 0` extraite pour test unitaire ; vues du voile exclues de l'accessibilité (`importantForAccessibility=no`).
- Gérer toutes les fenêtres visibles (multi-fenêtre, bulles de dialogue/feuilles Compose, picture-in-picture) et la rotation/pliage.
- Brancher le reporter de diagnostic du bouclier sur le gestionnaire de logs/crash existant de l'app (Timber/Crashlytics selon l'équivalent de CrashDiagnosticsManager).

Rendu : Voile pleine fenêtre : flou épais (`systemThickMaterial` ≈ blur élevé) + aplat de la couleur de fond du thème à 92 % d'opacité, qui suit le mode clair/sombre ; apparition immédiate (sans animation) car le système photographie dès le passage en arrière-plan ; aucun libellé, aucun élément d'accessibilité.

Transposition Android : willResignActive/didBecomeActive → ProcessLifecycleOwner ON_PAUSE/ON_RESUME (ou onPause/onResume de l'Activity) ; UIVisualEffectView + vue superposée → overlay dans le decorView avec RenderEffect blur ; instantané du sélecteur d'apps → écran Récents (setRecentsScreenshotEnabled(false) sur API 33+, FLAG_SECURE sinon).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/ProtectedContentSnapshotVeil.swift`

</details>

### Seul un message réellement déchiffré peut être recopié sur l'appareil, jamais un chiffré pris pour un clair

`crypto-e2ee-decrypted-ledger` · Android : **absente** · P2 · effort S

DecryptedMessageLedger (MainActor, borné à 2 000 identifiants, éviction du plus ancien) enregistre la PREUVE qu'un message chiffré a été déchiffré avec succès. `decryptMessagesIfNeeded` remplace `Message.content` par le clair en cas de succès mais LAISSE le base64 chiffré en cas d'échec sans autre signal : la copie sur l'appareil (D7) ne peut donc pas lire la réussite dans le message, elle la lit ici. Un message absent du registre n'est pas prouvé et n'est pas recopié (fail-closed). `record`, `contains`, `removeAll`.

Écarts :
- Créer `DecryptedMessageLedger` (ensemble + ordre d'insertion, capacité 2 000, thread-safe) posé par l'UNIQUE site de déchiffrement et lu par la fonction « enregistrer sur l'appareil / exporter » ; un identifiant absent = non copiable.
- Vidage à la déconnexion (`removeAll`) dans SessionTeardown ; réenregistrement des preuves au prochain déchiffrement de la conversation (l'éviction du plus ancien est assumée).
- Brancher la garde sur la fonctionnalité Android équivalente de « copie sur l'appareil » (enregistrement de média/texte déchiffré) quand elle existera ; test : un message dont le déchiffrement a échoué n'est jamais copié.

Rendu : Aucun rendu.

Transposition Android : @MainActor final class → classe thread-safe (Mutex ou confinement à un dispatcher) ; aucun mapping plateforme.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/DecryptedMessageLedger.swift`

</details>

### Une modification de profil non confirmée survit à un redémarrage sans être écrasée par la version périmée du serveur

`crypto-pending-profile-guard` · Android : **absente** · P2 · effort S

La garde `pendingOptimisticProfile` empêche une réponse de revalidation/refresh d'écraser une édition optimiste en vol. Elle n'existait qu'en mémoire : un kill+relance avant confirmation de la ligne d'outbox `updateProfile` perdait la garde et `/auth/me` écrasait le profil hydraté par l'ancienne valeur serveur. AuthProfileKeychainStore persiste donc la garde elle-même (ProfileSnapshot JSON sous `meeshy_pending_profile_<id>`) : savePendingProfile, loadPendingProfile (un snapshot d'une version antérieure du schéma compte comme « aucune garde »), clearPendingProfile. `checkExistingSession` la recharge avant que la tâche de revalidation puisse tourner.

Écarts :
- Aucun modèle `ProfileSnapshot` ni garde de profil optimiste côté Android (UserRepository ne fait pas d'update optimiste de profil rejouable ni d'outbox `updateProfile`) ; créer le modèle sérialisable et la garde.
- Persistance de la garde dans le coffre namespacé : save/load/clear, avec lecture tolérante (échec de décodage ⇒ aucune garde, journalisé).
- Rechargement de la garde au démarrage AVANT la revalidation `/auth/me` : la revalidation doit comparer à la garde et ne pas écraser le profil optimiste ; effacer la garde à la confirmation par l'outbox ou à l'échec définitif (rollback).
- Test de comportement : relance forcée pendant une modification de nom/bio non confirmée ⇒ le profil affiché reste le profil optimiste, puis converge avec le serveur.

Rendu : Aucun rendu propre ; l'effet visible est l'absence de « clignotement » du profil (ancienne valeur qui revient après une modification) au redémarrage.

Transposition Android : Keychain → coffre Keystore namespacé ; outbox iOS → OutboxEntity/Room déjà présente côté Android (sdk-core outbox) à enrichir d'une action updateProfile.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthProfileKeychainStore.swift`

</details>

### Une vidéo protégée ne peut être ni diffusée sur un autre écran ni sortie en fenêtre flottante

`crypto-protected-playback-policy` · Android : **absente** · P2 · effort S

ProtectedPlaybackPolicy (#9574) : la couche sécurisée rend l'image noire dans une capture, mais AirPlay, la recopie vers un écran externe et la fenêtre PiP emportent la vidéo HORS de cette couche. Sous un bouclier (`isCaptureShielded`), `allowsExternalPlayback` et `allowsPictureInPicture` valent false : `permitted(_:)` retire les contrôles `.pip` et `.airplay` du lecteur, et `apply(to:)` ferme `allowsExternalPlayback` et `usesExternalPlaybackWhileExternalScreenIsActive` de l'AVPlayer (une lecture AirPlay en cours revient sur l'appareil à la fermeture de la route).

Écarts :
- Aucune politique de lecture protégée ni ensemble de contrôles configurable : Android n'a ni PiP, ni Cast, ni `ControlSet` pour ses lecteurs Media3 ; créer `ProtectedPlaybackPolicy.of(isCaptureShielded)` (data class pure) et un `ControlSet` des lecteurs vidéo de messages (plein écran, PiP, route externe).
- PiP : tant qu'une vidéo protégée est lue, ne pas appeler `enterPictureInPictureMode`, ne pas déclarer `setAutoEnterEnabled(true)` et supprimer le bouton PiP du lecteur ; s'assurer que l'Activity n'entre pas en PiP automatiquement quand on la quitte.
- Routes externes : ne jamais proposer Google Cast / MediaRouter pour une vidéo protégée ; ajouter FLAG_SECURE / `SurfaceView.setSecure(true)` sur la surface vidéo (empêche aussi la recopie vers un écran externe non sécurisé et l'enregistrement d'écran) en s'appuyant sur le bouclier de capture.
- Fermeture dynamique : si une vidéo devient protégée en cours de lecture (ou un bouclier s'active), la route externe/le PiP en cours se ferme et la lecture revient sur l'appareil.
- Test de comportement : politique pure (`isCaptureShielded=true` ⇒ aucun contrôle PiP/route) et `permitted(controls)` retire exactement les deux contrôles.

Rendu : Sous protection, le lecteur n'affiche ni bouton PiP ni sélecteur d'écran (Cast) : la barre de contrôles se resserre sans espace vide ; aucun message d'erreur, les contrôles sont simplement absents.

Transposition Android : AirPlay / usesExternalPlaybackWhileExternalScreenIsActive → Google Cast / MediaRouter / affichage externe (SurfaceView sécurisé, FLAG_SECURE) ; PiP AVKit → Activity PiP (`setPictureInPictureParams`) ; MeeshyVideoPlayer.ControlSet → ensemble de contrôles du lecteur Media3.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Media/ProtectedPlaybackPolicy.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/video/ReelVideoSurface.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/OverlayMediaTransport.kt`

### Une traduction partagée est scellée sur l'appareil et ne s'ouvre que pour le bon message, la bonne langue et le bon texte

`crypto-shared-translation-seal` · Android : **absente** · P2 · effort M

SharedTranslationSeal est le miroir iOS de `packages/shared/utils/shared-translation-seal.ts` : clé HKDF-SHA256 (sel `meeshy-shared-translation/v1`, info `<kdf>\|<conversationId>\|<messageId>\|<targetLanguage>`, 32 octets) dont la matière est le texte original en NFC (`message-content`) ou le secret de 32 octets du message (`message-secret`) ; scellement AES-256-GCM, nonce aléatoire de 12 octets (jamais choisi par l'appelant), `payload` = base64 CANONIQUE de nonce‖chiffré‖tag ; données associées `meeshy-shared-translation/v1\|<kdf>\|conv\|msg\|langue\|<sha256 hex du texte NFC>` qui lient l'enveloppe à un message, une langue et un état du texte (un message modifié ne s'ouvre plus). Liaison valide seulement si conversation/message sont des ObjectId et la langue un code (aucun séparateur) ; `seal` lève une erreur typée (invalidBinding, emptySourceContent, invalidSecretLength, invalidInner, invalidNonce, payloadTooLong, sealFailed) ; `open` ne lève JAMAIS et rend nil pour toute enveloppe illisible/altérée/mal écrite. JSON interne canonique (clés triées, sans échappement des /) = `JSON.stringify({engine, sourceLanguage, text, v:1})`. Vérifié par `packages/shared/fixtures/shared-translation/seal.vectors.json` : sur divergence le TypeScript fait foi.

Écarts :
- Aucun équivalent Kotlin : porter le module (`SharedTranslationBinding`, `SharedTranslationKeySource{MessageContent | MessageSecret(bytes)}`, `SharedTranslationSealError`, `SharedTranslationSeal.seal/open`) dans :core:crypto, en réutilisant les types Inner/Envelope/Limits/Format (SharedTranslationModels.swift côté iOS ; à porter dans :core:model).
- HKDF-SHA256 (RFC 5869) à implémenter ou fournir par Tink/BouncyCastle (javax.crypto n'a pas de HKDF avant API 34) ; AES-256-GCM via javax.crypto (`AES/GCM/NoPadding`, tag 128 bits) en forme `combined` nonce‖chiffré‖tag.
- Normalisation NFC du texte (`java.text.Normalizer.Form.NFC`) pour la clé et l'empreinte SHA-256 hex minuscule des données associées ; vérifier le comportement sur chaînes mal formées (demi-paire de substitution) : Kotlin peut en porter, le module TS les rejette, d'où un contrôle explicite.
- Base64 CANONIQUE strict : décoder puis ré-encoder doit redonner exactement le texte reçu (remplissage présent, bits de remplissage nuls, aucun blanc) — utiliser `Base64.getDecoder()` + comparaison et NON `android.util.Base64.DEFAULT` qui tolère les blancs.
- JSON interne canonique : clés triées alphabétiquement, sans espaces, `/` non échappé, identique au `JSON.stringify` TS ; `open` décode le JSON et applique `inner.isSealable`.
- `open` sans exception : toute enveloppe invalide (version, algorithme, kdf, liaison, longueur < nonce+tag, tag GCM faux, JSON invalide) rend null et l'appareil garde sa traduction.
- Rejouer `seal.vectors.json` en test unitaire JVM (vecteurs positifs et négatifs, nonce fixé via une API interne réservée aux tests) pour garantir l'interopérabilité web/iOS/Android.
- Branchement produit (hors fichier) : partager/ouvrir les traductions scellées dans les messages d'une conversation, en E2EE comme en clair, quand la feature « traduction partagée » existe côté Android.

Rendu : Aucun rendu propre ; la traduction ouverte s'affiche comme du contenu natif dans la langue préférée (Prisme Linguistique), avec l'indicateur discret de traduction.

Transposition Android : CryptoKit (HKDF<SHA256>, AES.GCM) → javax.crypto + HKDF Tink/BouncyCastle ; precomposedStringWithCanonicalMapping → java.text.Normalizer NFC ; JSONEncoder.sortedKeys → sérialisation manuelle à clés triées (kotlinx.serialization n'garantit pas l'ordre).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Crypto/SharedTranslationSeal.swift`

</details>

### Un message à vue unique dit clairement « Vue unique · touchez pour afficher », et un appui long n'en dévoile jamais le contenu

`crypto-protected-veil-affordance` · Android : **divergente** · P0 · effort S

ProtectedVeilAffordance (#7452, #8017) est le voile d'un message protégé et ce qu'il DIT. Un flou nu se lit « contenu masqué » mais ne dit pas que regarder le DÉTRUIT : le voile d'une vue unique porte donc son libellé en clair « Vue unique · touchez pour afficher » (caption semibold, 2 lignes max, centré, blanc 92 % en sombre / noir 85 % en clair) dans une capsule ultraThinMaterial ; le pictogramme de vue unique vit dans le chrome (violet) juste au-dessus et n'est pas répété. Un voile de simple flou n'affiche aucun texte. Le toucher est le consentement (c'est lui qui appelle `/consume`). Implémenté en `Button` + contentShape (jamais un tap nu, qui serait avalé par l'appui long du conteneur). Loi ProtectedVeilPressLaw : le relâcher d'une pression ≥ 0,35 s (appui long qui ouvre le menu du message) ne dévoile RIEN ; ProtectedVeilPressClock mesure la durée (mesure orpheline > 0,5 s = ignorée, pression non mesurée = toucher). Accessibilité : libellé « Vue unique · touchez pour afficher » ou « Contenu masqué », indice « Le message ne s'affichera qu'une fois » ou « Toucher pour révéler le contenu », indice surchargeable par l'hôte (ex. « ouvrir en plein écran »). Composant de SDK pur (deux primitives + une fermeture), Equatable.

Écarts :
- Libellé divergent : Android affiche une pastille avec ICÔNE (flamme pour vue unique, œil pour flou) + « View once » / « Tap to reveal » dans les DEUX cas ; l'iOS n'affiche un texte que pour la vue unique (« Vue unique · touchez pour afficher ») et RIEN pour un simple flou, l'icône de vue unique vivant dans le chrome. Aligner chaînes et présence du libellé.
- Chaînes : créer `protection_veil_view_once` (« Vue unique · touchez pour afficher »), `protection_veil_view_once_hint` (« Le message ne s'affichera qu'une fois »), `protection_veil_hidden` (« Contenu masqué »), `protection_veil_hidden_hint` (« Toucher pour révéler le contenu ») ; traduire dans les 7 langues du catalogue iOS (Android ne fournit que en, es, fr, pt).
- Loi de l'appui long : aucune. `.clickable { revealToken += 1 }` déclenche aussi au relâcher d'un appui long qui ouvre le menu du message ⇒ dévoilement involontaire derrière le menu (défaut #8017). Implémenter `ProtectedVeilPressLaw` (seuil 0,35 s), une `ProtectedVeilPressClock` (début/fin de pression, mesure périmée > 0,5 s ignorée) et un toucher qui ne dévoile que si la pression < seuil ; conserver la cohérence avec le seuil d'appui long de la bulle.
- Accessibilité : un seul élément fusionné, libellé « Vue unique · touchez pour afficher » / « Contenu masqué », indice surchargeable par l'hôte (`hint` ⇒ « ouvrir en plein écran », « afficher en clair ») ; Android ne pose qu'un `contentDescription` « Reveal hidden message ».
- Composant pur et égalité : le voile ne doit connaître ni message ni réseau ; paramètres `isViewOnce`, `isDark`, `hint?` et un callback `onReveal`, avec recomposition évitée (stabilité) pour chaque cellule de liste.
- Rendu : le fond actuel est un aplat indigo 94 % (`FOG_COLOR`) ; l'iOS pose un matériau (flou) sur le contenu, capsule `ultraThinMaterial` et couleurs adaptées clair/sombre — revoir pour approcher le rendu (blur du contenu + capsule translucide, pas d'aplat opaque sur tout le contenu hors temps de condensation).
- Cible tactile ≥ 44 pt sur tout le voile (contentShape Rectangle) ; `buttonStyle` neutre sans atténuation de pression.

Rendu : Capsule centrée sur le voile : texte caption semibold (rôle typographique `caption`), 2 lignes max, centré ; padding horizontal ≈ smPlus (≈ 12 dp) et vertical ≈ xsPlus (≈ 6 dp) ; blanc 92 % en sombre, noir 85 % en clair ; fond translucide ultra fin ; pas de pictogramme dans le voile (la flamme/violet vit dans le chrome de la bulle, juste au-dessus). Simple flou : aucun texte, uniquement le flou sur le contenu. Pas d'effet d'atténuation à l'appui.

Transposition Android : Button + ButtonStyle rapportant isPressed → `Modifier.clickable`/`pointerInput` avec suivi de `PressInteraction` pour mesurer la durée ; `.ultraThinMaterial` → fond translucide blanc/noir ~16 % ou RenderEffect blur (API 31+) avec repli aplat ; VoiceOver → TalkBack.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshyUI/Conversation/ProtectedVeilAffordance.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`, `apps/android/sdk-ui/src/main/res/values/strings.xml`, `apps/android/sdk-ui/src/main/res/values-fr/strings.xml`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BlurRevealLifecycle.kt`

### Toucher un message flouté ou à vue unique fait exactement la bonne chose : afficher sur place, ouvrir en plein écran, ou ne plus rien rouvrir

`crypto-protected-tap-rules` · Android : **partielle** · P0 · effort M

ProtectedContentTap est la décision UNIQUE que les trois surfaces (Script, Focal, Bulles) consomment (#8009, #8389, #7579, #7499, #7618, #8567). Table : message flouté (texte ou médias) → révélé SUR PLACE, le flou revient après la durée de visibilité (5 s, BubbleBlurRevealLifecycle), la pièce révélée s'ouvre en plein écran au toucher SUIVANT ; pièce floutée d'un message clair → révélée sur sa case puis plein écran au toucher suivant ; vue unique scellée TEXTE → lue sur place, « déjà ouvert » au retoucher, à la sortie de l'écran/conversation ; vue unique scellée MÉDIA → plein écran DIRECT, « déjà ouvert » à la fermeture ; vue unique déjà ouverte → rien ne se rouvre. Mon message et le reçu suivent la même règle (l'auteur ouvre aussi sa vue unique une fois). Cas : .none, .revealInPlace, .openFullscreen(pièce), .openViewOnce(fullscreen:), .closeViewOnce, .alreadyOpened. `resolve(cell:)`, `afterReveal(media:)` (la Rivière ne rend aucun média), `opensFullscreen` (image/sticker/vidéo uniquement), `visualMedia`, `veilConsumesViewOnce`, `viewOnceRetouchIsActive`, `protectedTap(on:)`, libellés VoiceOver par cas (indice « Touchez pour ouvrir le média en plein écran / afficher le contenu / afficher le message, lisible une seule fois / refermer le message, qui passera à déjà ouvert »).

Écarts :
- Pas de résolveur de toucher : BubbleBlurReveal gère un seul cas (voile cliquable → minuterie reveal/re-conceal) ; créer l'énumération `ProtectedContentTap` pure dans :core:model (none, revealInPlace, openFullscreen(attachment), openViewOnce(fullscreen), closeViewOnce, alreadyOpened) + `protectedTap(on:)` testée sur la table complète.
- Vue unique non consommée : le KDoc de BubbleBlurReveal avoue « until that endpoint is wired the reveal proceeds locally » — un message à vue unique se re-floute après 5 s et peut être rouvert à l'infini au lieu d'être consommé ; appeler l'endpoint `/consume` au toucher (consentement), passer à l'état « déjà ouvert » (pierre tombale `Burned` existante) à la sortie de l'écran/conversation.
- Vue unique TEXTE : lire sur place, retoucher le referme et le consomme (`viewOnceRetouchIsActive`) ; si le texte est aussi flouté, le flou reste et son toucher révèle sur place (#8567).
- Vue unique MÉDIA : plein écran DIRECT (sans révélation intermédiaire) puis « déjà ouvert » à la fermeture du plein écran.
- Flou sur pièce : un toucher révèle sur place dans sa case, le toucher SUIVANT ouvre le plein écran (`afterReveal(media:)` pour les surfaces sans case, ex. Rivière) ; aujourd'hui le toucher d'un média flouté n'ouvre jamais le plein écran.
- Seuls image/sticker/vidéo ont un plein écran (`opensFullscreen`) ; audio et fichiers se révèlent sur place sans plein écran.
- Pas de distinction « mon message » / « message reçu » : l'auteur ouvre aussi sa vue unique une fois (#7618).
- Accessibilité : indices TalkBack par cas (« Touchez pour ouvrir le média en plein écran », « …afficher le contenu », « …afficher le message, lisible une seule fois », « …refermer le message, qui passera à déjà ouvert ») via `semantics { onClickLabel }`/stateDescription ; absents.
- Localisation : clés `protection.tap.a11y.*` à créer en 7 langues (Android sdk-ui n'a que en, es, fr, pt).

Rendu : Le flou se lève SUR PLACE avec la séquence existante (voile → flou retiré, 5 s, puis brouillard 0,4 s / flou 0,4 s / dissipation 0,5 s) ; le plein écran n'arrive qu'au toucher suivant ; la vue unique TEXTE se lit dans la bulle puis la bulle passe à l'état « Vu et supprimé » (pierre tombale alignée du côté de l'expéditeur) ; vue unique MÉDIA : transition plein écran directe, retour sur la pierre tombale. Haptique légère au dévoilement.

Transposition Android : Enum Swift à valeurs associées → sealed interface Kotlin ; `BubbleContent` (extension iOS) → `BubbleContent` Android (sdk-ui) enrichi d'un `protectedTap()` pur ; VoiceOver hint → TalkBack `onClickLabel`.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/Bubble/ProtectedContentTap.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleBlurReveal.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BlurRevealLifecycle.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContent.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleRenderKindPresenter.kt`

### Les secrets de l'appareil (jetons, clés, enregistrements) sont rangés dans un coffre sécurisé unique, isolé par compte

`crypto-secure-store` · Android : **partielle** · P0 · effort S

KeychainManager est le coffre unique de l'application : service `me.meeshy.app`, clé de compte optionnellement préfixée `<userId>.<clé>` pour que deux comptes d'un même appareil ne se lisent jamais (un appel sans compte ne rend JAMAIS une valeur namespacée), accessibilité AfterFirstUnlock-ThisDeviceOnly (lisible par la NSE appareil verrouillé, jamais sauvegardée), save = update ou add, load/delete/deleteAll, variantes async hors de l'acteur appelant (loadAsync/saveAsync sur file userInitiated), erreurs typées (saveFailed/loadFailed/deleteFailed). Trois migrations idempotentes : accessibilité WhenUnlocked→AfterFirstUnlock (une seule fois par installation, passe incomplète rejouée), UserDefaults→trousseau (la source n'est effacée qu'après écriture réussie), non-namespacé→namespacé par utilisateur (l'original est toujours supprimé pour éviter la fuite inter-comptes). KeychainStoring est le protocole d'injection que les tests substituent.

Écarts :
- Aucune abstraction générique `SecureStore` (équivalent KeychainStoring) : EncryptedTokenStore et EncryptedConversationLockStore dupliquent chacun leur MasterKey + EncryptedSharedPreferences avec des clés figées (jwt, session_token, user_id) ; extraire une interface `save/load/delete(key, account)` + implémentation Keystore + `InMemorySecureStore` pour les tests, dans :core:crypto ou :core:datastore.
- Pas de namespace par compte (`<userId>.<clé>`) : un seul jeu de valeurs globales, un compte qui se connecte hérite des entrées du précédent tant que logout n'a pas tout effacé ; reproduire `namespacedKey` et la règle « account nil ne lit pas le namespacé ».
- Pas de `deleteAll()` ciblé par service (EncryptedTokenStore.clear() ne vide que son fichier) ; ajouter un wipe de tous les fichiers de secrets pour la suppression de compte.
- Pas de variantes `loadAsync/saveAsync` sur Dispatchers.IO (MasterKey + EncryptedSharedPreferences bloquent à la première ouverture) : exposer des suspend fonctions pour ne jamais bloquer un acteur/coroutine de cryptographie.
- Pas d'erreurs typées (KeychainError.save/load/delete) : les échecs Keystore (KeyStoreException, AEADBadTagException après restauration) doivent être capturés, journalisés sans secret et traités comme « valeur absente » plutôt que de faire planter le démarrage.
- Migrations absentes : (a) SharedPreferences/DataStore en clair → coffre, en n'effaçant la source qu'après écriture réussie ; (b) non-namespacé → namespacé par userId, en supprimant toujours l'original ; (c) rejouer une passe incomplète au lancement suivant (flag « une seule fois par installation »). Android n'a pas d'équivalent WhenUnlocked/AfterFirstUnlock mais doit garantir que le coffre est lisible depuis le service FCM (data message) avant le premier déverrouillage utilisateur (pas de `setUnlockedDeviceRequired(true)`).
- Pas de test d'injection côté Android : les deux Encrypted*Store ne sont pas testables sous Robolectric (pas d'AndroidKeyStore) ; le contrat doit vivre dans l'interface + un fake en mémoire, comme KeychainStoring.

Rendu : Aucun rendu : infrastructure. Les valeurs de clés doivent garder les mêmes noms logiques que l'iOS (`meeshy_token_<id>`, `me.meeshy.e2ee.*`) pour que la documentation de support reste commune.

Transposition Android : Keychain → Android Keystore via MasterKey AES256_GCM + EncryptedSharedPreferences (ou Tink AEAD + DataStore). kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly → clé Keystore non liée au déverrouillage + android:allowBackup=false (déjà posé) + exclusion du fichier des règles de sauvegarde. Namespace `account.key` identique pour garder l'isomorphie des noms de clés.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainStoring.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/EncryptedTokenStore.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/TokenStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/lock/EncryptedConversationLockStore.kt`

### La session et le profil du compte se rouvrent à froid depuis le coffre, isolés par compte

`crypto-account-auth-storage` · Android : **partielle** · P1 · effort S

AuthStorageKeys fixe en UN endroit les clés namespacées par compte : `meeshy_token_<id>`, `meeshy_user_<id>`, `meeshy_session_token_<id>`, `meeshy_token_date_<id>`, `meeshy_pending_profile_<id>`. AuthProfileKeychainStore.saveUser sérialise l'utilisateur courant en JSON UTF-8 dans le coffre après avoir retiré les images en data URI (`droppingDataURIImages`, pour ne pas dépasser la taille du trousseau) ; ce profil sert au démarrage à froid (affichage immédiat avant `/auth/me`, cache-first). Les échecs de sérialisation/écriture sont journalisés (userId public, détails privés).

Écarts :
- Le TokenStore Android ne porte que jwt, sessionToken et userId globaux : ajouter `tokenDate` (âge du jeton, utilisé par iOS pour décider du refresh) et le profil utilisateur sérialisé (`user`) par compte.
- Pas de cache du profil courant dans le coffre : au démarrage à froid l'écran profil/entête doit s'afficher depuis ce profil sans attendre `/auth/me` ; stocker le JSON du MeeshyUser (sans data URI) sous `meeshy_user_<id>`.
- Pas d'AuthStorageKeys unique : centraliser les cinq noms de clés dans un objet partagé par AuthRepository, le widget Glance et le handler FCM pour qu'aucune clé ne soit écrite à deux endroits.
- Pas d'isolation multi-compte : SessionTeardown efface tout au logout (acceptable) mais un changement de compte rapide ou un second compte sur le même processus lit les mêmes clés ; lire/écrire via `account = userId`.
- Écriture non journalisée en cas d'échec : EncryptedTokenStore avale les erreurs ; reproduire les logs `Failed to save user to keychain for userId` (userId public, message privé) via Timber sans secret.

Rendu : Aucun rendu direct. Effet visible : à froid, l'entête (avatar, nom) est rendu depuis le cache sans spinner — cohérent avec les principes cache-first de l'iOS.

Transposition Android : Keychain profil → EncryptedSharedPreferences/Tink namespacé par userId ; `droppingDataURIImages` à implémenter sur le modèle User Android pour rester sous la limite d'une valeur de SharedPreferences.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthProfileKeychainStore.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/EncryptedTokenStore.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/TokenStore.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/SessionTeardown.kt`

### On voit si une conversation est chiffrée, on peut l'activer (définitif) et la traduction reste disponible selon le mode

`crypto-e2ee-conversation-mode` · Android : **partielle** · P1 · effort M

E2EAPI expose le réglage de chiffrement PAR CONVERSATION : `GET /conversations/:id/encryption-status` → ConversationEncryptionStatus{isEncrypted, mode (e2ee \| server \| hybrid), enabledAt, enabledBy, canTranslate} et `POST /conversations/:id/encryption` {mode} → EnableConversationEncryptionResult{conversationId, mode, enabledAt, enabledBy}. L'activation est IMMUABLE une fois posée. `canTranslate` dit si la traduction automatique reste possible (en e2ee pur elle se fait sur l'appareil, les features qui exigent le clair serveur sont absentes et l'interface le dit — directive 2026-10-03).

Écarts :
- Android ne connaît que `encryptionMode: String?` sur Conversation et le bandeau EncryptionDisclaimer en tête d'historique ; aucun appel à `encryption-status` ni à `encryption` : ajouter `fetchEncryptionStatus` / `enableEncryption` (Retrofit + DTO avec enum e2ee/server/hybrid, dates ISO-8601).
- Modéliser le mode comme enum typé (ConversationEncryptionMode) au lieu d'une String libre, avec `canTranslate` et `enabledAt/By`.
- Entrée d'interface pour activer le chiffrement d'une conversation (réglages de conversation) avec confirmation explicite de l'irréversibilité ; la section « Chiffrement » de PrivacySettingsScreen reste un encart « bientôt » grisé et doit refléter l'état réel.
- Indicateur dans l'en-tête / la liste (cadenas discret) et message clair quand une feature serveur est indisponible en mode e2ee (traduction faite sur l'appareil, pas d'aperçu serveur, etc.).
- Refus fail-closed d'un message en clair dans une conversation chiffrée (côté envoi) : aucun repli silencieux en clair.

Rendu : Cadenas et libellés dans la teinte d'accent de la conversation (`accentColor`, jamais de couleur codée en dur) ; états chargement/erreur/hors-ligne dessinés pour la demande de statut ; confirmation de l'activation en feuille modale avec avertissement d'irréversibilité.

Transposition Android : Aucun équivalent plateforme particulier ; les écrans iOS correspondants (réglages de conversation, bandeau) sont dans d'autres parties du domaine chat/settings.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/E2EAPI.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Conversation.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Core.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/EncryptionDisclaimer.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/settings/src/main/kotlin/me/meeshy/app/settings/PrivacySettingsScreen.kt`

### L'appareil s'inscrit une seule fois auprès du serveur pour recevoir les appels, sans rejeu abusif

`crypto-push-token-store` · Android : **partielle** · P1 · effort S

VoIPTokenStoring / KeychainVoIPTokenStore range le dernier jeton VoIP enregistré avec l'instant d'enregistrement (VoIPTokenRecord{token, at}) en UN blob JSON (ISO-8601) dans le trousseau, sous `voip.registeredDevice` : le couple ne se désynchronise jamais. VoIPPushManager lit `at` pour appliquer un cooldown afin que les rappels répétés de PushKit (`didUpdatePushCredentials`) ne spamment pas la passerelle. Un blob illisible force une ré-inscription propre. Migration unique depuis les anciennes clés UserDefaults (`com.meeshy.voip.lastRegisteredToken/At`) : renvoie l'enregistrement migré puis nil, et purge TOUJOURS les clés en clair, même si l'écriture trousseau échoue (mieux vaut ré-inscrire qu'un jeton lisible dans un .plist de sauvegarde). `clear()` à la déconnexion.

Écarts :
- PushTokenHandler.onTokenRefresh enregistre le jeton FCM à chaque callback sans mémoriser (token, instant) : ajouter un `PushTokenStore` (protocole + implémentation coffre sécurisé, blob JSON atomique) et un cooldown identique à iOS avant de rappeler `registerDeviceToken`.
- Ré-inscription forcée si l'enregistrement stocké est illisible ou si le jeton FCM a changé ; ne pas réinscrire si (même jeton, dans le cooldown).
- `unregisterDeviceToken` existe dans NotificationRepository mais n'est appelé nulle part : appeler unregister + `clear()` du store à la déconnexion/suppression de compte (sinon le jeton reste associé à l'ancien compte).
- Pas de distinction jeton « appel » vs jeton « notification » : iOS a deux jetons (APNs alerte et VoIP PushKit) ; Android n'en a qu'un (FCM) mais doit marquer la capacité « data message haute priorité pour appels » dans l'inscription (champ plateforme/type) pour que la passerelle envoie `voip_call` en data-only.
- Migration depuis d'éventuelles anciennes clés SharedPreferences en clair du jeton : purge systématique (peu probable en Android mais à vérifier dans l'historique de l'app).

Rendu : Aucun rendu. Effet visible : un appel entrant sonne dès le premier essai après login/réinstallation, et jamais sur un ancien compte après déconnexion.

Transposition Android : PushKit VoIP token → jeton FCM utilisé pour les data messages haute priorité qui déclenchent le Telecom ConnectionService ; Keychain → coffre Keystore ; UserDefaults legacy → SharedPreferences legacy.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Security/VoIPTokenStore.swift`

</details>

Android existant : `apps/android/app/src/main/kotlin/me/meeshy/app/push/PushTokenHandler.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationRepository.kt`


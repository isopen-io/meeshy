# E2EE réel sur iOS et macOS avec libsignal — spécification

**Date** : 2026-10-23 · **Statut** : PROPOSÉE (conception, aucune ligne de production écrite)
**Directive porteur 2026-10-23** : « un E2EE efficace, commutable et opérationnel sur iOS et macOS ; masquer le bouton sauf pour les admins de la plateforme ».

**Décision porteur 2026-10-25 (#12949)** : « commutable » ne vaut plus que dans un sens. Une conversation chiffrée de bout en bout ne repasse jamais en clair ; pour revenir au clair, on crée une autre conversation (§ 5).
**Milestone** : « Chiffrement de bout en bout vérifiable (libsignal) » (#28).
**Cadre** : #9224 (E2EE optionnel par conversation), #9229 (fail-closed), #9223 (rétrocompatibilité, staging d'abord), #12517 (activation réservée à un rôle de plateforme tant que la recette n'est pas verte), #12588 (rôle minimal ANALYST depuis le 2026-10-24).
**Décisions liées** : `packages/MeeshySDK/decisions/2026-10-23-l-e2ee-ios-et-macos-repose-sur-libsignal-par-appareil.md`, `services/gateway/decisions/2026-10-23-la-passerelle-est-un-annuaire-de-cles-par-appareil-et-un-relais-d-enveloppes.md`.

Ce document ne déclare aucune garantie acquise. Ce que libsignal garantit est l'objet de ses propres analyses publiées. L'intégration que décrit ce document (stockage des clés, routage des enveloppes, approbation des appareils, pièces jointes, extension de notification) n'a reçu **aucune revue externe**. Une revue cryptographique tierce est requise avant la production (#3710), et l'usage d'une bibliothèque sous AGPL-3.0 dans l'application publiée exige un **avis juridique signé** (#11548).

---

## 0. Constat de départ (origin/dev fcf0e8b074)

| Défaut | Où | Issue |
|---|---|---|
| Cryptographie maison : DH statique identité × pré-clé signée, dérivée en clé AES fixe par paire, sans Double Ratchet, sans secret persistant renouvelé | `apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift:157-179`, `E2EEService.swift` | #3707 |
| Clé Ed25519 jamais publiée, signature de la pré-clé signée jamais vérifiée | idem | #12508 |
| Pré-clé « unique » jamais consommée | `services/gateway/src/routes/signal-protocol.ts` | #12510 |
| Un seul bundle par compte (`SignalPreKeyBundle.userId @unique`), remplacé sans condition à chaque lancement | `schema.prisma:3211`, `MeeshyApp+Lifecycle.swift:148` | #12403, #12505 |
| `POST /signal/session/establish` répond toujours 503 (`signalService` jamais assigné) | `EncryptionService.ts:386,847-849` | #12519 |
| iOS chiffre TOUTE conversation directe, quel que soit le mode de la conversation, met le chiffré dans `content` + `isEncrypted` (forme que la passerelle refuse en 400) et repart EN CLAIR si aucune session n'existe | `ConversationViewModel+Send.swift:316-330` | #3707 |
| Numéro de sécurité factice | `ConversationEncryptionDetailSheet.swift` | #12520 |
| Activation non atomique, irréversible | `routes/conversation-encryption.ts:186-210` | #12521, #12522 |
| Vocaux en clair admis puis transcrits dans une conversation `e2ee` | pipeline audio | #12518 |
| Module DMA mort (P-256, clés privées sur le serveur) qui écrit une clé privée dans la même table | `services/gateway/src/dma-interoperability/`, `SignalKeyManager.ts:483` | #10787 |

Le web et la coque Android ne chiffrent pas. Ils ne doivent pas casser.

---

## 1. Modèle de menace

| Adversaire | Couvert | Comment | Limite |
|---|---|---|---|
| **Serveur compromis en lecture** (base MongoDB, Redis, journaux, file push lus par un tiers) | Oui, pour le contenu | Le serveur ne reçoit que des enveloppes libsignal opaques, des pièces chiffrées sous une clé qu'il n'a jamais vue, et des aperçus de notification génériques | Métadonnées visibles : qui parle à qui, quand, taille des enveloppes, nombre d'appareils |
| **Serveur compromis actif** (substitue une clé, ajoute un appareil, rejoue) | Partiellement | Signature XEdDSA des pré-clés vérifiée par libsignal ; alerte de changement de clé ; numéros de sécurité comparables par QR (#12520) ; mes enveloppes ne partent vers un de MES appareils qu'après approbation locale par QR (§ 3.5) | Un appareil de CONTACT ajouté par le serveur est accepté en confiance au premier usage (TOFU) jusqu'à vérification du numéro de sécurité. Aucune transparence des clés (Key Transparency) dans ce lot |
| **Attaquant réseau** | Oui | TLS en transport, et le contenu est chiffré de bout en bout de toute façon | Analyse de trafic |
| **Appareil volé, verrouillé** | Oui | Clés dans le trousseau en `AfterFirstUnlockThisDeviceOnly`, base locale scellée par une clé du trousseau | Un appareil volé déverrouillé, ou après le premier déverrouillage depuis le démarrage, est hors modèle |
| **Appareil volé, déverrouillé** | Non | — | Hors modèle |
| **Compromission future d'une clé** | Oui (confidentialité persistante et rétablissement) | Double Ratchet : confidentialité persistante et rétablissement après compromission (Double Ratchet rev. 1, § 1 et § 4) ; PQXDH : résistance de l'accord initial à un adversaire quantique qui enregistre aujourd'hui (PQXDH § 4) | La résistance post-quantique de la phase de ratchet dépend de la version de libsignal épinglée (§ 2.1) |

---

## 2. Bibliothèque : libsignal (`LibSignalClient`)

### 2.1 Choix et références

- **libsignal** (`github.com/signalapp/libsignal`) : implémentation Rust de référence de Signal, avec liaisons Swift (`LibSignalClient`), Java et TypeScript. C'est le principe « aucune primitive maison » du cadre.
- Protocoles utilisés, tous fournis par la bibliothèque :
  - **PQXDH** — E. Kret, R. Schmidt, *The PQXDH Key Agreement Protocol*, signal.org/docs/specifications/pqxdh/ (révision courante). Accord initial X25519 + ML-KEM-1024 (CRYSTALS-Kyber). Il remplace X3DH (M. Marlinspike, T. Perrin, *The X3DH Key Agreement Protocol*, rév. 1, 2016-11-04), dont il reprend la structure.
  - **Double Ratchet** — T. Perrin, M. Marlinspike, *The Double Ratchet Algorithm*, signal.org/docs/specifications/doubleratchet/. Si le tag épinglé embarque la composante post-quantique du ratchet publiée par Signal, elle est activée telle que la bibliothèque la fournit, sans réglage maison.
  - **XEdDSA** — T. Perrin, *The XEdDSA and VXEdDSA Signature Schemes*, rév. 1, 2016-10-20 : signature des pré-clés par la clé d'identité Curve25519.
  - **Sesame** — M. Marlinspike, T. Perrin, *The Sesame Algorithm: Session Management for Asynchronous Message Encryption*, rév. 2, 2017-04-14 : une session par couple (utilisateur, appareil), un appareil inconnu ou périmé déclenche une resynchronisation (§ 3.4).
  - **Numéros de sécurité** — `NumericFingerprintGenerator` et `ScannableFingerprint` de libsignal (version d'empreinte 2).
- Ce que la bibliothèque **ne** fournit **pas** et que Meeshy écrit : le stockage persistant des stores, le routage des enveloppes, l'approbation de ses propres appareils, le format de pièce jointe. Chacun est listé au § 9 comme surface de revue externe.

### 2.2 Intégration SPM

- Le `Package.swift` de libsignal lie la bibliothèque statique Rust `libsignal_ffi` par des drapeaux d'éditeur de liens non sûrs (`unsafeFlags`), que SwiftPM refuse dans une dépendance distante. Signal-iOS l'intègre par CocoaPods avec des binaires préconstruits téléchargés sur `build-artifacts.signal.org`.
- **Décision** : un paquet local `packages/LibSignalClient/` qui contient
  1. les sources Swift de `LibSignalClient` copiées du **tag épinglé exact** (chemin `swift/Sources/LibSignalClient`, licence et `NOTICE` compris, sans modification) ;
  2. un `binaryTarget` `SignalFFI.xcframework` (tranches `ios-arm64` et `ios-arm64_x86_64-simulator`), **construit par notre CI** depuis le même tag (`swift/build_ffi.sh`, cargo épinglé), publié en artefact de release du dépôt, et référencé par URL + **somme de contrôle SwiftPM**. Le binaire n'est jamais committé.
- `MeeshySDK` dépend de ce paquet ; `MeeshyNotificationExtension` le lie aussi (§ 6.2).
- Mise à jour : un changement de tag est un lot à part, avec le journal des changements de libsignal relu et la suite de vecteurs rejouée.
- **macOS** : l'application tourne sur Mac en mode **« Designed for iPad »** (application iOS sur Mac Apple Silicon : `apps/ios/meeshy.sh` `PLATFORM=mac`, gardes `ProcessInfo.isiOSAppOnMac` dans `VoIPPushManager.swift:126`, aucune cible Catalyst dans `apps/ios/project.yml`). La tranche `ios-arm64` sert donc l'iPhone ET le Mac ; aucune tranche macOS ni Catalyst n'est nécessaire. Si une cible Catalyst apparaît un jour, la tranche `ios-arm64-maccatalyst` s'ajoute au même xcframework.

### 2.3 Taille binaire et iOS 16

- **iOS 16** reste le minimum (`project.yml` et `Package.swift` du SDK). Le minimum déclaré par le `Package.swift` de libsignal est inférieur à la date de rédaction ; il se **revérifie sur le tag épinglé** au lot 2, et le critère de fin du lot est une compilation et un lancement sur iOS 16 (simulateur) en plus d'iOS 27.
- **Taille** : non mesurée ici. Le lot 2 mesure l'écart de taille de l'IPA (téléchargement et installé, rapport App Thinning) avant et après, et le note dans son commentaire de clôture. Aucun chiffre n'est avancé sans mesure.

### 2.4 Licence

libsignal est sous **AGPL-3.0**. L'intégrer dans une application publiée sur l'App Store pose une question de compatibilité de licence (obligations de mise à disposition du code source, conditions de l'App Store) que seul un **avis juridique signé** peut trancher (#11548, agent `conformite-juridique` pour la préparation, pas pour la décision). **Cela ne bloque pas le développement ni la recette sur staging** (builds TestFlight internes). **Cela bloque la promotion en production** d'un build qui lie libsignal : la règle de promotion de #9223 ajoute cette condition pour ce chantier.

---

## 3. Identité et appareils

### 3.1 Un appareil, une identité

- Chaque installation (iPhone, Mac) génère **sa propre** paire d'identité libsignal (`IdentityKeyPair.generate()`) et son `registrationId` (14 bits, aléatoire, par installation). La clé privée ne quitte jamais l'appareil.
- Le serveur attribue un **`deviceId`** entier dans `1…127` (plage acceptée par `ProtocolAddress` de libsignal), par utilisateur. **Un compte a au plus `E2EE_MAX_ACTIVE_DEVICES` (16) appareils actifs, sur les places `1…16`** : un nouvel appareil prend la plus petite place libre, et un appareil retiré (session finie, retrait explicite) rend la sienne — jamais à la même `registrationId`, qui est ce qui signale au 409 `stale` l'émetteur dont la session visait l'ancien occupant (#12543). La borne vient de Sesame : un envoi en tête-à-tête vise les appareils du destinataire et les autres appareils de l'émetteur, au plus 2 × 16 − 1 = 31 enveloppes, sous le plafond de 32. Un compteur jamais décrémenté (la première version) épuisait la plage en 127 réinstallations et laissait les appareils morts rendre le compte injoignable. Le `deviceId` libsignal est distinct du `PushToken.deviceId` (chaîne opaque du système) ; le lien entre les deux est un champ du nouvel annuaire.
- **Pourquoi une identité par appareil plutôt qu'une identité de compte partagée** (modèle Signal, où les appareils liés reçoivent la clé d'identité du compte par le protocole de provisionnement) : transférer une clé privée d'identité d'un appareil à l'autre exige un canal de provisionnement que libsignal Swift n'expose pas comme primitive publique ; le recomposer serait une construction maison. L'identité par appareil n'introduit aucune composition nouvelle. Son coût : un numéro de sécurité **par appareil** du contact (§ 7.3), et l'approbation de mes propres appareils (§ 3.5). Le passage à une identité de compte partagée est listé au § 10 et exige une revue externe.

### 3.2 Ce que publie un appareil

Conforme à PQXDH § 2.4 (« Publishing keys ») et au modèle de Signal-Server :

| Clé | Nombre | Signature | Consommation |
|---|---|---|---|
| Clé d'identité publique `IK` | 1 | — | — |
| Pré-clé signée EC `SPK` | 1 courante | XEdDSA par `IK` | réutilisée, rotation ≤ 7 jours, l'ancienne gardée localement 30 jours pour les messages en vol |
| Pré-clé Kyber de dernier recours `PQSPK` | 1 courante | XEdDSA par `IK` | réutilisée quand le stock unique est vide (PQXDH § 2.4), rotation ≤ 7 jours |
| Pré-clés uniques EC `OPK` | lot de 100, réapprovisionné sous 20 | — | **réservée une seule fois**, atomiquement |
| Pré-clés uniques Kyber `PQOPK` | lot de 100, réapprovisionné sous 20 | XEdDSA par `IK` | **réservée une seule fois**, atomiquement |

La passerelle **vérifie** les signatures XEdDSA à la publication (`@signalapp/libsignal-client`, `PublicKey.verify`) et refuse un lot mal signé : c'est une hygiène d'annuaire, pas la garantie, qui reste la vérification par l'appareil qui consomme le bundle (libsignal la fait dans `processPreKeyBundle`).

### 3.3 Annuaire par appareil côté passerelle (schéma Prisma additif)

Nouveaux modèles, à côté de `SignalPreKeyBundle` qui n'est **ni modifié ni retiré** :

```
model E2EEDevice {            // un appareil enrôlé
  id, userId, deviceId Int, registrationId Int,
  identityKey String,          // publique, base64
  signedPreKeyId Int, signedPreKey String, signedPreKeySignature String,
  kyberLastResortId Int, kyberLastResort String, kyberLastResortSignature String,
  pushTokenId String?,         // lien vers PushToken pour le routage du push
  platform String, label String?,
  createdAt, lastSeenAt, signedPreKeyRotatedAt, retiredAt DateTime?
  @@unique([userId, deviceId])
}
model E2EEOneTimePreKey {      // EC et Kyber, un document par clé
  id, userId, deviceId Int, kind String /* "ec" | "kyber" */,
  keyId Int, publicKey String, signature String?,
  createdAt, usedAt DateTime?, usedBy String?
  @@unique([userId, deviceId, kind, keyId])
  @@index([userId, deviceId, kind, usedAt])
}
```

- **Réservation atomique** : `findOneAndUpdate({ userId, deviceId, kind, usedAt: null }, { $set: { usedAt: now, usedBy } })` par appareil cible, une EC et une Kyber par bundle servi. Aucune lecture puis écriture. Pas de clé unique EC disponible : le bundle part sans (PQXDH le permet) ; pas de Kyber unique : la pré-clé Kyber de dernier recours.
- **Attribution du `deviceId`** : la plus petite place libre ; une place neuve se prend par `create` (l'index unique `(userId, deviceId)` départage deux enrôlements simultanés), une place retirée par un `updateMany` conditionné à `retiredAt` non nul. L'appareil d'une session finie est retiré (`services/gateway/src/services/e2ee/device-retirement.ts`).
- Aucun champ de clé privée n'existe dans ces modèles ; un test de schéma l'interdit (aucun nom en `*Private*`, aucun champ `privateKey` dans un JSON).
- **Routes** (préfixe `/api/v1/e2ee/`, sans toucher `/signal/*`) :
  - `POST /e2ee/devices` — enrôle l'appareil courant, rend `deviceId` (idempotent par `registrationId` + clé d'identité).
  - `PUT /e2ee/devices/:deviceId/keys` — remplace pré-clé signée / Kyber de dernier recours, ajoute des pré-clés uniques. Seul l'appareil propriétaire (jeton lié à ce `deviceId`) écrit ses clés.
  - `GET /e2ee/keys/:userId` — rend la liste des appareils ACTIFS de l'utilisateur et, pour chacun, un bundle (avec une `OPK` et une `PQOPK` réservées). Même garde d'autorisation qu'aujourd'hui (conversation partagée ou amitié), plus une limite de débit par demandeur et par cible (épuisement des pré-clés).
  - `GET /e2ee/keys/:userId/devices` — la liste seule (identifiants, `registrationId`), sans consommer de pré-clé.
  - `DELETE /e2ee/devices/:deviceId` — retrait (pose `retiredAt`, efface les pré-clés uniques restantes).
  - `GET /e2ee/devices/self/prekey-count` — pour le réapprovisionnement.
- **Rétrocompatibilité** : `POST /signal/keys` et `GET /signal/keys/:userId` restent servis tels quels pour les clients publiés (l'iPhone en production publie son bundle à chaque lancement). **Aucun nouveau client ne les lit.** Ils se retirent à zéro usage mesuré (#9223), avec la route `POST /signal/session/establish`, retirée dès maintenant au lieu d'être branchée (#12519, décision passerelle).

### 3.4 Sesame : appareils manquants et périmés

Conforme à Sesame § 3 et au comportement public de Signal-Server :
- L'envoi d'un message `e2ee` porte **une enveloppe par appareil actif de chaque participant, sauf l'appareil émetteur, mes autres appareils compris**.
- La passerelle compare l'ensemble `(userId, deviceId, registrationId)` reçu à l'annuaire. S'il manque un appareil, s'il y en a un de trop ou si un `registrationId` a changé : **409** `E2EE_DEVICES_MISMATCH` avec `{ missing, extra, stale }`. Le client supprime les sessions périmées, récupère les bundles manquants, rechiffre et renvoie. Aucun message n'est persisté sur une liste incomplète.

### 3.5 Approbation de mes propres appareils

Le serveur pourrait ajouter un « appareil » à mon compte pour recevoir une copie de mes messages. Parade, sans construction cryptographique nouvelle :
- Mes appareils n'envoient d'enveloppe à un autre de **mes** appareils que s'il figure dans leur **liste locale d'appareils approuvés** (clé d'identité épinglée).
- Approbation : le nouvel appareil (le Mac) affiche le QR de son `ScannableFingerprint` libsignal (calculé entre sa clé d'identité et celle de l'appareil qui approuve) ; l'iPhone le scanne et compare (`ScannableFingerprint.compareWith`). Réussite : l'iPhone épingle la clé du Mac, et inversement par le QR réciproque.
- Un appareil que le serveur annonce sans approbation locale apparaît dans les réglages comme « appareil non approuvé » et ne reçoit rien. Le 409 de la passerelle ne peut donc pas forcer l'envoi vers lui : le client répond par une enveloppe absente pour cet appareil et un drapeau `unapprovedOwnDevices`, que la passerelle accepte (seuls MES appareils peuvent être ainsi exclus, jamais ceux d'un contact).
- Les appareils d'un **contact** suivent le TOFU avec alerte (§ 7.3).

---

## 4. Session et messages

### 4.1 Session

- Session par adresse `ProtocolAddress(userId, deviceId)`. Premier envoi : `processPreKeyBundle` (PQXDH) puis `signalEncrypt` → `PreKeySignalMessage` (type 3) ; ensuite `SignalMessage` (type 2) tant que la session tient.
- Réception : `signalDecryptPreKey` ou `signalDecrypt` selon le type. Échec de déchiffrement d'un `PreKeySignalMessage` : la session est réinitialisée et une ligne locale « un message n'a pas pu être déchiffré » s'affiche ; jamais de repli en clair, jamais de demande de renvoi automatique au serveur en clair.
- Changement d'identité d'un contact : `IdentityKeyStore.saveIdentity` renvoie le changement ; l'envoi continue (politique Signal par défaut) et une **ligne système locale** « Le numéro de sécurité de X a changé » s'insère dans le fil (§ 7.3). Un mode strict (bloquer jusqu'à vérification) est hors de ce lot.

### 4.2 Contenu chiffré

Le clair chiffré par libsignal n'est pas le texte nu mais une structure **`E2EEContent`** sérialisée (JSON canonique, versionnée) :

```
{ v: 1, text?, language?, replyTo?, mentions?, attachments?: [AttachmentPointer], location?, sticker?, effects?, editOf?, sentAt }
```

Tout ce qui part à côté du corps (aperçu de citation, mentions, lieu, sticker, pointeur de pièce, langue détectée) voyage **dans** l'enveloppe, jamais en champ libre du message (#12526).

### 4.3 Format sur le fil

Nouveau protocole déclaré `encryptionProtocol: "libsignal-v1"`. Envoi REST `POST /conversations/:id/messages` et socket `message:send` (même déclaration `ENCRYPTION_ENVELOPE_SHAPE`, étendue) :

```
{
  content: "",                              // vide ; la passerelle persiste le littéral E2EE_CONTENT_PLACEHOLDER
  encryptionMode: "e2ee",
  encryptionProtocol: "libsignal-v1",
  encryptionMetadata: { protocol: "libsignal-v1", senderDeviceId, regimeEpoch },
  encryptedContent: "libsignal-v1",         // marqueur non vide : garde la forme lue par les gardes actuelles
  envelopes: [ { userId, deviceId, registrationId, type: 2|3, body: base64 } ],
  unapprovedOwnDevices?: [deviceId]
}
```

- Bornes : 32 enveloppes au plus, 64 Kio par `body`, 512 Kio au total ; `encryptionMetadata` garde sa borne de 8 Ko.
- La passerelle refuse : un `content` non vide (fail-closed existant), une pièce en clair (existant), un `regimeEpoch` différent du régime courant (§ 5.3), une liste d'appareils non conforme (409 § 3.4).
- **Persistance** : le `Message` garde ses métadonnées (`senderId`, `createdAt`, `encryptionMode: "e2ee"`, `encryptionProtocol` dans `encryptionMetadata`, `content = E2EE_CONTENT_PLACEHOLDER`). Les enveloppes vivent dans une collection séparée :

```
model MessageEnvelope {
  id, messageId, conversationId, recipientUserId, recipientDeviceId Int,
  senderUserId, senderDeviceId Int, type Int, body String, createdAt
  @@index([recipientUserId, recipientDeviceId, createdAt])
  @@unique([messageId, recipientUserId, recipientDeviceId])
}
```

  Une enveloppe est **effacée** quand l'appareil destinataire accuse réception (`POST /e2ee/envelopes/ack`), et au plus tard après 30 jours (balayage). Un appareil ne lit **que** ses enveloppes.
- **Distribution** : la socket authentifiée déclare son `e2eeDeviceId` (handshake `auth`) et rejoint la salle de sa génération `device:<userId>:<deviceId>:<registrationId>` (une place reprise par une autre installation n'en partage jamais la salle, et le retrait en fait sortir, #12592). `message:new` part comme aujourd'hui vers la salle de l'utilisateur, sans enveloppe ; `e2ee:envelope` part vers la salle de l'appareil avec la sienne. Au retour en ligne : `GET /e2ee/envelopes?after=` (pagination par curseur).
- **Rétrocompatibilité** : un ancien client lit `content = E2EE_CONTENT_PLACEHOLDER` et `isEncrypted: true`, et rend un message chiffré illisible ; la passerelle ajoute `e2eeUpgradeRequired: true` au message servi pour que les versions suivantes affichent « Mettez à jour Meeshy pour lire ce message ». Un ancien client qui ENVOIE dans une conversation `e2ee` reçoit déjà 400 ; le code devient `E2EE_CLIENT_OUTDATED`, avec un message lisible. Rien n'est perdu en silence.

### 4.4 Stockage local

- Stores libsignal (`IdentityKeyStore`, `PreKeyStore`, `SignedPreKeyStore`, `KyberPreKeyStore`, `SessionStore`, `SenderKeyStore`) implémentés sur **une base GRDB dédiée** `e2ee.sqlite` dans le conteneur du groupe d'apps (`group.me.meeshy.apps`), partagée avec la NSE.
- Chaque ligne (enregistrements sérialisés de libsignal) est scellée par AES-256-GCM (CryptoKit) sous une clé de 256 bits du **trousseau**, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, groupe d'accès partagé app ↔ NSE. La clé privée d'identité est elle-même dans le trousseau, même classe. **Secure Enclave** : il ne porte que P-256, pas Curve25519 ; il ne peut donc pas tenir la clé d'identité libsignal. Il n'est pas utilisé dans ce lot ; l'envelopper est listé au § 10.
- **Concurrence app ↔ NSE** : un ratchet qui bifurque perd des messages. Accès par `DatabasePool` GRDB en WAL et **verrou de fichier inter-processus** autour de chaque transaction de déchiffrement (`flock` sur un fichier du groupe d'apps), conformément à la documentation GRDB « Sharing a Database ». Le déchiffrement et l'écriture du nouvel état sont dans la **même** transaction.
- Le **clair déchiffré** est rangé dans le cache de messages local existant (déjà scellé par `DatabaseEncryption`), pas renvoyé au serveur. C'est lui qui rend l'historique lisible après l'effacement des enveloppes.

### 4.5 Restauration

- Classe `ThisDeviceOnly` : ni la clé d'identité ni la clé de scellement ne passent par une sauvegarde iCloud ou une migration d'appareil. Un appareil restauré est un **nouvel appareil** : nouvelle identité, nouveau `deviceId`, ses contacts voient « numéro de sécurité changé ». L'historique chiffré antérieur n'y est pas lisible. C'est le comportement de Signal sans sauvegarde chiffrée.
- Une sauvegarde chiffrée de l'historique (clé de récupération) est listée au § 10.

---

## 5. Activable, jamais désactivable (#12522, puis #12949)

**Décision porteur du 2026-10-25 (#12949), qui remplace le « commutable » de la directive du 2026-10-23** : une conversation chiffrée de bout en bout ne repasse **jamais** en clair. Pour revenir au clair, on crée une autre conversation. Une conversation en clair peut devenir chiffrée. Modes : `server` = chiffré au repos, le serveur lit, traduction serveur ; `hybrid` = chiffré en transit, lisible par le serveur, chiffré au repos, traduction serveur ; `e2ee` = serveur aveugle, aucune traduction serveur. Décision : `services/gateway/decisions/2026-10-25-une-conversation-e2ee-ne-repasse-jamais-en-clair-12949.md`.

### 5.1 Régime de conversation

- `Conversation.encryptionMode` passe du clair (`null`) à `"e2ee"` et n'en revient pas. Champ additif `encryptionEpoch Int?` (absent = 0 : aucune conversation existante n'est réécrite), incrémenté à chaque bascule. `encryptionEnabledAt` garde sa sémantique pour les anciens clients (non nul ⇔ régime actif).
- **Une seule écriture, qui ne quitte jamais `e2ee`** : `switchEncryptionRegime` fait `updateMany({ id, époque lue, mode ∈ {absent, null, server, hybrid} }, { … , encryptionEpoch: n + 1 })` (l'époque 0 se lit « absent, nul ou 0 ») ; `count === 0` ⇒ 409 `E2EE_REGIME_CHANGED`. La liste de ce qui se quitte est positive : `e2ee` en toute casse et tout mode inconnu en sont exclus. Une garde de source interdit tout autre écrivain du régime, routes, admin, outils et scripts de base compris. Test de concurrence à deux requêtes.
- **`DELETE /conversations/:id/encryption`** ne quitte que le chiffrement au repos (`server`, `hybrid`, que le serveur lit déjà) ; `serverEncryptionKeyId` n'est pas touché. Sur une conversation `e2ee`, il rend `409 E2EE_IRREVERSIBLE` (« To chat without it, start a new conversation »), sans rien écrire ni annoncer : un ancien client reçoit ce refus lisible (#9223). Un `POST` qui demanderait un autre mode sur une conversation `e2ee` aussi.
- Chaque bascule écrit ensuite une ligne système (`messageSource: "system"`, `metadata.kind` `encryption-enabled` / `encryption-disabled` pour le seul chiffrement au repos, auteur, époque) visible des deux côtés et des anciens clients (texte de repli servi), et émet `conversation:encryption-changed` vers la room personnelle de chaque membre actif. **Écart assumé** : la ligne n'est pas dans la même transaction que la bascule. Elle suit la doctrine des avis système (#11416 : l'avis est un accessoire du geste, jamais sa condition) ; seule l'écriture conditionnelle porte la garantie d'atomicité.

### 5.2 Ce que la bascule change

- **Activer** : les messages suivants partent en `libsignal-v1` ; la passerelle coupe traduction, transcription, aperçus et indexation pour eux (gardes existantes sur `isEncrypted`).
- **Désactiver le bout en bout n'existe pas.** Un client qui a vu une conversation `e2ee` (mode servi, `conversation:encryption-changed`, fil qui montre l'avis système d'activation — un message isolé marqué `e2ee` n'en est pas un : trois tête-à-tête sans régime en portent un sur staging) la garde fermée au clair pour toujours et **ignore toute rétrogradation servie** : mode absent ou nul, bascule à `null`, avis `encryption-disabled`. Il n'y a ni confirmation de l'utilisateur, ni époque à départager, ni ère de fin à la lecture. Web : `apps/web/src/lib/end-to-end-regime-ledger.ts` (registre par compte, persistant ; garde `canSendPlaintext` lue avant tout téléversement et tout envoi). iOS : #12950. Android natif : #12956.
- **Message composé avant une activation** : le client envoie son `regimeEpoch`. Différent du courant ⇒ 409 `E2EE_REGIME_CHANGED` ; le client rechiffre et renvoie.
- **Ce que #12522 a laissé** (mesuré en lecture seule le 2026-10-25) : staging, aucune conversation désactivée (une seule a basculé, quatre fois, et elle est `e2ee`) ; production (`9ca0dded61`, qui portait la route de désactivation), aucune conversation basculée ni chiffrée de bout en bout.

### 5.3 Qui peut basculer

- La politique « rôle de plateforme ANALYST au minimum » (pour ACTIVER, et pour quitter le chiffrement au repos) (#12517 pour ADMIN et BIGBOSS, élargie à MODERATOR, AUDIT et ANALYST par directives porteur du 2026-10-24, #12588 ; USER refusé, appartenance à la conversation toujours exigée) **reste** tant que la recette à deux appareils (§ 8) n'est pas verte.
- Elle se relâche en **un point** : la passerelle sert `canToggleEncryption` et `canDisableEncryption` dans `GET /conversations/:id/encryption-status` (tous deux faux pour une conversation `e2ee`, pour tout le monde, #12949), calculé par une seule fonction de politique (variable `E2EE_TOGGLE_POLICY = admins | members`, défaut `admins`). iOS rend le bouton si et seulement si `canToggleEncryption` ; `ConversationEncryptionActivationPolicy` devient la lecture de ce champ (repli : rôle ANALYST ou supérieur si le champ manque, pour les réponses d'une passerelle plus ancienne). La garde 403 de la passerelle fait foi.

---

## 6. Ce qui remplace le schéma maison

### 6.1 Retrait

- iOS : `E2EEService.swift`, `E2ESessionManager.swift`, `E2EAPI.swift`, le chemin AES fixe de `NSEDecryptor.swift`, la publication du bundle hérité dans `MeeshyApp+Lifecycle.swift`, et le chiffrement de `ConversationViewModel+Send.prepareUpload` sont **retirés**, remplacés par les services du § 4.
- La décision de chiffrer se lit sur **le régime de la conversation** (`encryptionMode == "e2ee"`), plus jamais sur « conversation directe ». Une conversation sans E2EE n'est jamais chiffrée.
- **Aucun repli en clair** : session impossible dans une conversation `e2ee` ⇒ le message reste dans la file d'envoi avec l'état « en attente de chiffrement » et une action « réessayer » ; il n'est jamais envoyé en clair.
- Les clés héritées du trousseau (`E2EEService`) sont effacées à la première exécution de la nouvelle version.

### 6.2 Données existantes

- Aucun message réel n'existe sous le schéma maison sur staging (constat fourni au lancement : 0 conversation chiffrée ; à **revérifier** au lot 4 par une requête en lecture seule avant tout retrait). La production se mesure par #12532 avant promotion. Un message hérité éventuel est servi comme illisible (`e2eeUpgradeRequired`), jamais supprimé en silence.
- `SignalPreKeyBundle` reste lu par les anciens clients ; ses champs `identityKeyPrivate`, `signedPreKeyPrivate` et les `privateKey` de `preKeyPool` cessent d'être écrits avec le retrait du module DMA (#10787), puis sont purgés (feu vert porteur pour la production, sauvegarde vérifiée).

---

## 7. Ce qui part à côté du corps

### 7.1 Pièces jointes (#10789, #10727)

- Format de pièce **à la manière de Signal** : clé aléatoire de 64 octets (32 AES-256 + 32 HMAC-SHA256), IV aléatoire de 16 octets, `IV ‖ AES-256-CBC-PKCS7(clair) ‖ HMAC-SHA256(IV ‖ chiffré)`, condensat SHA-256 du blob entier. Chiffrement en flux (gros fichiers sans tout charger). CommonCrypto pour AES-CBC, CryptoKit pour HMAC et SHA-256. Vérification du HMAC en temps constant **avant** tout déchiffrement, du condensat avant tout HMAC.
- Le blob part par le téléversement existant, avec un drapeau `e2ee` qui interdit tout traitement serveur (vignette, transcodage, transcription, empreinte perceptuelle). Le `AttachmentPointer` (identifiant, clé, condensat, taille, type MIME, nom de fichier, durée, dimensions, vignette chiffrée en pièce séparée) voyage **dans** `E2EEContent`. Le serveur ne voit ni le nom, ni la durée, ni le type exact (le type serveur est `application/octet-stream`).
- Cette composition est écrite par Meeshy à partir de primitives standard : elle est listée comme surface de revue externe (§ 9), et ses vecteurs sont recoupés avec l'implémentation publiée de Signal (Signal-Android `AttachmentCipherOutputStream`, Signal-Desktop) faute de vecteurs officiels.

### 7.2 Notifications (NSE)

- Le push d'un message `e2ee` est **générique** sur le fil (`mutable-content: 1`, titre et corps génériques, aucun extrait, aucune pièce, aucune transcription, aucune traduction — les gardes des cycles 123 à 125 s'appliquent déjà via `protected-placeholder`) et porte l'identifiant de l'enveloppe de l'appareil destinataire (push routé par `E2EEDevice.pushTokenId`). L'enveloppe elle-même voyage dans le push si elle tient sous 3 Ko, sinon la NSE la récupère par `GET /e2ee/envelopes/:id`.
- La NSE déchiffre sous le verrou du § 4.4, écrit le clair dans le cache scellé, compose la bannière localement (nom, extrait, traduction sur l'appareil si disponible) ; échec ⇒ bannière générique.
- **macOS** : les extensions de notification d'une application iOS sur Mac sont à **prouver en recette** sur le Mac. Si elles ne s'exécutent pas, le Mac affiche la bannière générique et déchiffre à l'ouverture ; ce n'est pas une fuite, c'est une dégradation à consigner en issue.

### 7.3 Numéros de sécurité (#12520)

- Calculés par `NumericFingerprintGenerator` (version 2) entre ma clé d'identité et celle de **chaque appareil** du contact ; affichés en liste par appareil, comparables par QR (`ScannableFingerprint`). Vérifié ⇒ marque locale ; changement ultérieur ⇒ marque retirée, ligne système locale « Le numéro de sécurité de X a changé ».
- Le faux numéro actuel est retiré ; rien n'affiche « vérifié » sans comparaison réelle.

### 7.4 Traduction et Prisme

Traduction sur l'appareil seulement (Apple Translation, #9272, #9979). Le partage scellé des traductions (#9899, #9959) est un chantier distinct qui se branchera sur `E2EEContent`. Aucune traduction n'est demandée au serveur pour un message `e2ee`.

### 7.5 Voix

Un vocal `e2ee` est une pièce chiffrée (§ 7.1). Le pipeline audio serveur refuse tout vocal en clair dans une conversation `e2ee` (#12518). La transcription se fait sur l'appareil ou n'existe pas.

---

## 8. Tests et recette

1. **Vecteurs** : la suite de libsignal (`swift/Tests/LibSignalClientTests`) est rejouée dans la CI du SDK au tag épinglé.
2. **Aller-retour unitaire** : deux magasins en mémoire (Alice, Bob), PQXDH puis 100 messages dans les deux sens avec désordre et pertes ; la session survit, les messages hors ordre se déchiffrent (Double Ratchet § 2.6 « Out-of-order messages »).
3. **Passerelle, aucun octet clair** : test d'intégration à deux appareils (clients de test `@signalapp/libsignal-client` côté Node) qui envoie un texte sentinelle aléatoire et vérifie son absence dans MongoDB (toutes collections), Redis (toutes clés), les journaux capturés et les charges push émises.
4. **Réservation** : 50 requêtes concurrentes de bundle sur 10 pré-clés uniques ⇒ 10 bundles avec clé unique distincte, 40 sans.
5. **Croisé** : un message chiffré par le client Node (`@signalapp/libsignal-client`) se déchiffre dans le SDK Swift, et l'inverse — c'est la base du croisé iOS ↔ web de #10788.
6. **Recette à deux appareils sur staging** (`gate.staging.meeshy.me`, comptes Demo et « Recette … ») : iPhone simulateur `Meeshy-iOS27` et Mac (« Designed for iPad »). Activer (admin), échanger texte et pièce, vérifier les numéros, approuver le Mac depuis l'iPhone, recevoir sur les deux appareils un message envoyé du troisième, tenter de désactiver (refus `E2EE_IRREVERSIBLE`, aucun geste dans l'interface), constater que rien ne part en clair. Un ancien build (production) dans la même conversation reçoit le message illisible annoncé, jamais un silence.
7. **Avant fusion** : agent `auditeur-adversarial` sur chaque lot.

---

## 9. Hors du modèle de menace et surfaces de revue externe

- Métadonnées (graphe social, horaires, tailles, nombre d'appareils) : visibles du serveur. Sealed Sender (libsignal) est listé au § 10.
- Appareil d'un contact ajouté par un serveur malveillant, avant vérification du numéro de sécurité (TOFU).
- Appareil déverrouillé compromis, logiciel malveillant sur l'appareil, captures d'écran.
- Absence de Key Transparency.
- **Surfaces écrites par Meeshy, sans revue externe à ce jour** : stockage et scellement des stores, verrou app ↔ NSE, routage par appareil et règles du 409, approbation des appareils par QR, format de pièce jointe, `E2EEContent`. Revue cryptographique tierce requise avant la production (#3710).
- Licence AGPL : avis juridique signé requis avant la production (#11548).

## 10. Après ces lots (issues existantes ou à ouvrir)

| Sujet | Issue |
|---|---|
| NSE qui déchiffre et compose la bannière localement, iPhone et Mac | #12537 |
| Retrait de `/signal/session/establish` (503) | #12519 |
| Le serveur ne génère plus aucune clé privée (module DMA) | #10787, #3705 |
| Galerie déchiffrée, fonds de conversation chiffrés | #10790, #10706 |
| Lieu, sticker, citation de pièce jamais en clair | #12526 |
| Notification de réaction sans extrait | #12527 |
| Pièce refusée effacée sans attendre 24 h | #12528 |
| Mesure des conversations de production chiffrées avant la restriction | #12532 |
| Web avec libsignal (WASM), appareil lié | #10788, #3709 |
| Android libsignal | #3708 |
| Groupes : Sender Keys, puis MLS (RFC 9420) | à ouvrir quand les conversations directes sont vertes |
| Identité de compte partagée (provisionnement) et numéro de sécurité unique par contact | à ouvrir, revue externe requise |
| Sauvegarde chiffrée de l'historique | à ouvrir |
| Sealed Sender, Key Transparency | à ouvrir |
| Clé de scellement enveloppée par le Secure Enclave | à ouvrir |
| Revue cryptographique externe | #3710 |
| Avis juridique AGPL | #11548 |

## 11. Lots, dans l'ordre de dépendance

1. **Passerelle : annuaire par appareil** (§ 3.2 à 3.4) — #3706.
2. **SDK : libsignal intégré, stores persistants partagés avec la NSE** (§ 2.2, 4.4) — #12536.
3. **iOS et macOS : session, envoi et réception par appareil, retrait du schéma maison** (§ 4, 6) — #3707.
4. **Bascule par conversation, atomique, lignes système, politique en un point** (§ 5) — #12522 (avec #12521).
5. **Pièces jointes chiffrées sur l'appareil** (§ 7.1) — #10789.
6. **Numéros de sécurité réels et approbation de mes appareils** (§ 3.5, 7.3) — #12520.

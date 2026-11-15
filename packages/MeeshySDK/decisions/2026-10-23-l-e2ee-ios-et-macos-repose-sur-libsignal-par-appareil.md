## L'E2EE iOS et macOS repose sur libsignal, une identité par appareil, des stores scellés partagés avec la NSE (#3707)

**Contexte** : le chiffrement iOS actuel est maison (DH statique identité × pré-clé signée dérivé en clé
AES fixe, `E2ESessionManager.swift:157-179`), sans Double Ratchet, sans vérification de signature, avec
repli en clair. L'application tourne sur Mac en mode « Designed for iPad » ; le Mac est le second appareil
de la recette. Spécification : `docs/superpowers/specs/2026-10-23-e2ee-libsignal-ios-macos.md`.

**Décision** :
- `LibSignalClient` (libsignal, tag épinglé exact) fournit PQXDH, Double Ratchet, XEdDSA, Sesame et les
  numéros de sécurité. Paquet local `packages/LibSignalClient/` : sources Swift du tag, sans modification,
  plus un `binaryTarget` `SignalFFI.xcframework` construit par notre CI depuis le même tag et référencé par
  somme de contrôle. La tranche `ios-arm64` sert l'iPhone et le Mac (« Designed for iPad »).
- Une identité libsignal et un `registrationId` par installation ; `deviceId` attribué par la passerelle.
  Mes enveloppes ne partent vers un de mes appareils qu'après approbation locale par QR
  (`ScannableFingerprint`).
- Stores libsignal sur une base GRDB `e2ee.sqlite` du groupe d'apps, lignes scellées AES-256-GCM sous une
  clé du trousseau `AfterFirstUnlockThisDeviceOnly` partagée avec la NSE ; déchiffrement et écriture du
  nouvel état dans une transaction sous verrou de fichier inter-processus.
- Le chiffrement se décide sur le régime de la conversation (`encryptionMode == "e2ee"`), jamais sur
  « conversation directe » ; aucun repli en clair.
- Le schéma maison (`E2EEService`, `E2ESessionManager`, `E2EAPI`, chemin AES de `NSEDecryptor`) est retiré.

**Alternatives rejetées** :
- *Corriger le schéma maison* : ce serait réécrire Double Ratchet et PQXDH, contraire au principe « aucune
  primitive maison ».
- *Dépendance SwiftPM distante sur libsignal* : son `Package.swift` lie `libsignal_ffi` par `unsafeFlags`,
  refusés dans une dépendance distante.
- *CocoaPods comme Signal-iOS* : le dépôt est entièrement en SwiftPM/xcodegen.
- *Identité de compte partagée entre appareils (modèle Signal)* : exige un protocole de provisionnement que
  libsignal Swift n'expose pas ; le recomposer serait une construction maison. Reporté, revue externe requise.
- *Clé d'identité dans le Secure Enclave* : il ne porte que P-256, pas Curve25519.

**Conséquences** : un numéro de sécurité par appareil du contact ; un appareil restauré est un nouvel
appareil. libsignal est sous AGPL-3.0 : avis juridique signé requis avant la production (#11548), sans
bloquer staging. Revue cryptographique externe requise sur les surfaces écrites par Meeshy (#3710).

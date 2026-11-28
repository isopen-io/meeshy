# Bibliothèques natives et jetons de design

## packages/MeeshySDK (Swift 6.2, iOS 16+)
Produits : MeeshyCore, MeeshySDK, MeeshyUI, MeeshyE2EE. Consommé par `apps/ios`. Dépend de `packages/LibSignalClient`, socket.io-client-swift, GRDB, WebRTC. Les 67 fichiers d'endpoints sont générés par `packages/shared`.
Vérification : ici NOT APPLICABLE (macOS) ; CI `sdk-tests.yml` **PASS** (46079384904 @ a6d6fc9d). Aucun changement.

## packages/LibSignalClient
Sources Swift de libsignal 0.106.2 ; `SignalFfi` est un binaire distant vérifié par somme de contrôle. CI `libsignal-ffi.yml` sur poussée seulement (pas sur PR). Statut : NOT VERIFIED dans cette session. Aucun changement.

## packages/libsignal-wasm (Rust)
Produit le wasm committé dans `apps/web/src/lib/e2ee/libsignal/` (manifeste de sommes sha256). **Aucun workflow ne le construit** (B9). Statut : NOT VERIFIED. Aucun changement.

## packages/design-tokens — `@meeshy/design-tokens`
Génère `ios.css` et la palette Kotlin depuis `MeeshyColors.swift`. Vérification : `check` **PASS**, tests **29 / 29**. Aucun changement.

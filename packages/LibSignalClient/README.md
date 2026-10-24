# LibSignalClient (libsignal, épinglé)

Paquet local qui porte libsignal de Signal Messenger au tag de `LIBSIGNAL_VERSION` (#12536,
spec `docs/superpowers/specs/2026-10-23-e2ee-libsignal-ios-macos.md` § 2.2).

- `Sources/LibSignalClient` et `Tests/LibSignalClientTests` : copies SANS modification de
  `swift/Sources/LibSignalClient` et `swift/Tests/LibSignalClientTests` au tag. `LICENSE`
  (AGPL-3.0-only) et `acknowledgments-ios.plist` (licences des dépendances Rust) viennent du même
  tag. libsignal ne publie pas de fichier NOTICE : `acknowledgments-ios.plist` en tient lieu.
- `SignalFfi` : `SignalFfi.xcframework` (tranches `ios-arm64` et `ios-arm64_x86_64-simulator`),
  construit depuis le même tag par `scripts/build-signal-ffi-xcframework.sh`, dans le workflow
  `.github/workflows/libsignal-ffi.yml`, avec le Xcode des builds de l'app. Il est publié en release
  `libsignal-ffi-<tag>` et référencé par URL et somme de contrôle. Le binaire n'est jamais committé.
- Changer de tag est un lot à part : relire le journal des changements de libsignal, recopier les
  sources et les tests du nouveau tag, laisser la CI construire la nouvelle release, reporter sa
  somme de contrôle dans `Package.swift`, puis rejouer les tests.

Licence : l'AGPL-3.0 dans une app de l'App Store exige un avis juridique signé avant la
production (#11548). Elle ne bloque pas les builds internes de recette.

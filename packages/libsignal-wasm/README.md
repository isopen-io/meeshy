# libsignal-wasm — libsignal (Rust, tag épinglé) compilé pour le navigateur

Pont `wasm-bindgen` minimal au-dessus du crate `libsignal-protocol` du tag
`packages/LibSignalClient/LIBSIGNAL_VERSION` (le même que l'iOS). Aucune
primitive maison : PQXDH, Double Ratchet et XEdDSA sont ceux de libsignal.
Ce pont n'ajoute que les stores (miroir de `MeeshySignalProtocolStore.swift`),
alimentés par une transaction d'enregistrements que le navigateur scelle.

Issue : #14592. Licence : AGPL-3.0-only (comme libsignal) — avis juridique #11548
et audit externe #3710 avant toute production.

package me.meeshy.sdk.pack

import me.meeshy.sdk.model.pack.PackAssetRef

/** Où lire les octets d'un pack officiel, vérifiés par leur empreinte — [ContentAddressedStore] en production, un double en test. */
interface PackAssetReading {
    suspend fun data(ref: PackAssetRef): ByteArray
}

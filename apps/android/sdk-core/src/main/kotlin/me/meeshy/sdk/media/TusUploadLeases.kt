package me.meeshy.sdk.media

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les envois TUS EN VOL dans ce processus, par clé de checkpoint (miroir d'iOS `TusUploadLeases`). Sans ce registre commun,
 * deux envois des mêmes octets reprenaient la même session et croisaient leurs PATCH.
 */
@Singleton
public class TusUploadLeases @Inject constructor() {
    private val held = HashSet<String>()

    /** Vrai si la clé était libre — l'appelant la tient jusqu'à [release]. */
    public fun claim(key: String): Boolean = synchronized(held) { held.add(key) }

    public fun release(key: String) {
        synchronized(held) { held.remove(key) }
    }
}

package me.meeshy.sdk.media

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * **Au démarrage, ce qu'un processus mort en plein envoi a laissé quitte le disque** (#13555) : un blob scellé que sa ligne
 * n'a jamais nommé (tué entre le fichier et la ligne), un `.part` à moitié écrit, et les copies nettoyées EN CLAIR de
 * `outgoing-clean` — qui n'attendaient plus que le prochain envoi ou la déconnexion. Seul ce qui a été écrit AVANT le
 * démarrage du processus est visé (à [CLOCK_MARGIN_MS] près, la granularité des horodatages de fichier) : un envoi du
 * processus courant n'est jamais touché, quel que soit l'ordre dans lequel il démarre.
 */
public class OutgoingMediaBootSweep @Inject constructor(
    private val blobs: MediaBlobStore,
    private val sanitizer: OutgoingMediaSanitizer,
) {
    public suspend fun sweep(processStartedAt: Long) {
        val before = processStartedAt - CLOCK_MARGIN_MS
        blobs.sweepOrphans(before)
        withContext(Dispatchers.IO) { sanitizer.clearScratchBefore(before) }
    }

    public companion object {
        public const val CLOCK_MARGIN_MS: Long = 2_000L
    }
}

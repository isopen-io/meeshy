package me.meeshy.ui.component.viewer

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Extrait la première image NETTE d'une vidéo par décodage matériel via
 * `MediaMetadataRetriever` — l'équivalent Android du canvas `<video>` + seek
 * web (`extractVideoFirstFrame`, `apps/web/lib/images/video-poster.ts`) et de
 * `StoryMediaDecoder.firstFrame` iOS (#3871 → #3878). Le résultat alimente
 * [VideoPosterSource.resolve] comme `extractedFrameUrl` ; la vignette
 * (`thumbnailUrl`) n'est jamais cette valeur — seulement le fond flou pendant
 * que l'extraction est en cours.
 *
 * Orchestration app/SDK-UI : cette classe reste un atome — elle ne connaît
 * ni cache, ni politique réseau. L'appelant (le composable plein écran)
 * décide QUAND l'appeler et persiste le résultat (cf. `VideoPosterSource`).
 */
public object VideoFirstFrameExtractor {

    private const val TAG = "VideoFirstFrameExtractor"

    /** Microseconde à laquelle chercher — évite l'image souvent noire à t=0. */
    public const val DEFAULT_SEEK_TIME_US: Long = 100_000L // 0.1s

    /**
     * Extrait depuis un chemin de fichier LOCAL (le cas nominal : le fichier
     * vidéo est déjà sur l'appareil, décodage sans réseau). `null` si
     * l'extraction échoue (format non supporté, fichier introuvable/corrompu).
     */
    public suspend fun extractFromFile(
        filePath: String,
        seekTimeUs: Long = DEFAULT_SEEK_TIME_US,
    ): Bitmap? = withContext(Dispatchers.IO) {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(filePath)
            retriever.getFrameAtTime(seekTimeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        } catch (e: Exception) {
            Log.w(TAG, "extractFromFile failed for $filePath", e)
            null
        } finally {
            releaseQuietly(retriever)
        }
    }

    /**
     * Extrait depuis une URL distante (`MediaMetadataRetriever.setDataSource`
     * accepte un `Map<String, String>` d'en-têtes HTTP) — dernier recours
     * quand aucun fichier local n'existe. Coûteux (peut lire le fichier
     * entier selon la source) : l'appelant ne l'invoque QUE sur un geste
     * utilisateur explicite (ouverture plein écran), jamais en préchauffage
     * ambiant — même règle que la cascade iOS `VideoPosterPlan.Intent`.
     */
    public suspend fun extractFromRemoteUrl(
        url: String,
        seekTimeUs: Long = DEFAULT_SEEK_TIME_US,
        headers: Map<String, String> = emptyMap(),
    ): Bitmap? = withContext(Dispatchers.IO) {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(url, headers)
            retriever.getFrameAtTime(seekTimeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        } catch (e: Exception) {
            Log.w(TAG, "extractFromRemoteUrl failed for $url", e)
            null
        } finally {
            releaseQuietly(retriever)
        }
    }

    private fun releaseQuietly(retriever: MediaMetadataRetriever) {
        try {
            retriever.release()
        } catch (e: Exception) {
            // Best-effort cleanup — a release() failure must never mask the
            // extraction result already produced (or its absence).
            Log.w(TAG, "MediaMetadataRetriever.release() failed", e)
        }
    }
}

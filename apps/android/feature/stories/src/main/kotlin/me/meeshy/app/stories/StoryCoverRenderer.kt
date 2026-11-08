package me.meeshy.app.stories

import android.graphics.Bitmap
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.story.StoryCoverStore
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/** Qui rend la scène du brouillon en bitmap : fourni par l'écran qui héberge le rendu hors écran (aucun hôte, aucune couverture). */
fun interface StoryDraftCoverSource {
    suspend fun render(snapshot: StoryComposerDraftSnapshot): Bitmap?
}

/** Ce que la sauvegarde du brouillon prévient une fois écrite : la couverture suit, sans jamais la bloquer. */
interface StoryDraftCoverSink {
    suspend fun onDraftSaved(snapshot: StoryComposerDraftSnapshot)
}

/**
 * Écrit les couvertures personnelles (iOS : grille « Mes stories », sauvegarde automatique du brouillon, couverture
 * optimiste de publication) dans le cache disque `story-cover:<id>` puis annonce leur arrivée. Le rendu lui-même est celui de
 * `SceneBitmapRenderer` (même arbre que le canevas vivant), fourni par [source] ; un rendu qui échoue, ou une scène sans sa
 * couche dominante (`null`), n'écrit rien et ne lève jamais : la sauvegarde du brouillon ne dépend pas de la couverture.
 */
@Singleton
class StoryCoverRenderer @Inject constructor(
    private val store: StoryCoverStore,
    private val signal: StoryCoverRenderSignal,
) : StoryDraftCoverSink {

    /** L'hôte du rendu, posé par l'écran qui le possède ; `null` : couture inerte. */
    @Volatile
    var source: StoryDraftCoverSource? = null

    override suspend fun onDraftSaved(snapshot: StoryComposerDraftSnapshot) {
        val host = source ?: return
        val id = snapshot.slides.firstOrNull()?.id ?: return
        write(id) { host.render(snapshot) }
    }

    /** Rend puis écrit la couverture de [id] ; vrai si elle est sur le disque. N'échoue jamais (hors annulation). */
    suspend fun write(id: String, render: suspend () -> Bitmap?): Boolean {
        val bytes: ByteArray? = try {
            render()?.let(::jpeg)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Throwable) {
            null
        }
        if (bytes == null) return false
        if (!store.store(id, bytes)) return false
        signal.bump()
        return true
    }

    private fun jpeg(bitmap: Bitmap): ByteArray? = ByteArrayOutputStream().use { out ->
        if (bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)) out.toByteArray() else null
    }

    private companion object {
        const val JPEG_QUALITY = 85
    }
}

package me.meeshy.app.stories

import android.content.Context
import android.graphics.Bitmap
import androidx.core.graphics.drawable.toBitmap
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerLookPerson
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.retouch.RetouchExif
import me.meeshy.ui.component.retouch.RetouchSourceDecoder
import me.meeshy.ui.component.retouch.StoryMediaLookPainter
import me.meeshy.ui.component.retouch.composerLookAuthor

/**
 * **LE FOUR DE LA PUBLICATION** (#13841) : chaque image réglée ([StoryPublicationLookBake.jobs]) est peinte en pleine
 * définition par le peintre de la scène, en COPIE DÉRIVÉE (l'original et le brouillon restent intacts), puis envoyée
 * comme un média ordinaire. Une copie qui ne se cuit pas refuse la publication ([BakeFailed]) : publier l'original en
 * silence trahirait ce que l'auteur a vu.
 */
class StoryLookOven internal constructor(
    private val bake: suspend (StoryLookBakeJob) -> MediaUploadItem?,
    private val queue: MediaUploadQueue,
    private val uploader: StoryMediaUploader,
) {
    @Inject
    constructor(
        @ApplicationContext context: Context,
        queue: MediaUploadQueue,
        uploader: StoryMediaUploader,
        session: SessionRepository,
        config: MeeshyConfig,
    ) : this({ job -> StoryLookKiln(context, session, config).bake(job) }, queue, uploader)

    class BakeFailed(mediaId: String) : IllegalStateException("Couldn't apply the look of media $mediaId")

    /** Une story NEUVE : les copies partent en file d'envoi, la publication en dépend. */
    internal suspend fun queued(state: StoryComposerUiState): StoryComposerUiState {
        val jobs = StoryPublicationLookBake.jobs(state)
        if (jobs.isEmpty()) return state
        val baked = jobs.associate { job -> job.mediaId to bakedItem(job) }
            .mapValues { (_, item) -> PendingMediaUpload(queue.enqueue(item, TusUploadContext.STORY), item) }
        return StoryPublicationLookBake.applied(state, baked)
    }

    /** Une story ÉDITÉE (en ligne seulement) : les copies partent tout de suite ; `null` si l'une ne part pas. */
    internal suspend fun uploaded(state: StoryComposerUiState): StoryComposerUiState? {
        val jobs = StoryPublicationLookBake.jobs(state)
        if (jobs.isEmpty()) return state
        val items = jobs.map { bakedItem(it) }
        val sent = (uploader.upload(items) as? NetworkResult.Success)?.data?.takeIf { it.size == jobs.size } ?: return null
        return StoryPublicationLookBake.appliedUploaded(state, jobs.map { it.mediaId }.zip(sent).toMap())
    }

    private suspend fun bakedItem(job: StoryLookBakeJob): MediaUploadItem = bake(job) ?: throw BakeFailed(job.mediaId)
}

/** La personne que les cadres d'un média écrivent : l'auteur de la story, sur la scène comme dans la copie cuite. */
internal fun SessionRepository.lookPerson(): ComposerLookPerson =
    currentUser.value.let { ComposerLookPerson.author(it?.id, it?.displayName, it?.username) }

/** Le peintre pleine définition : l'original de la prise (ou du serveur), le look, puis un JPEG qui garde la prise sans le lieu. */
private class StoryLookKiln(private val context: Context, private val session: SessionRepository, private val config: MeeshyConfig) {

    suspend fun bake(job: StoryLookBakeJob): MediaUploadItem? = withContext(Dispatchers.Default) {
        val original = job.pending?.let { runCatching { it.bytes }.getOrNull() }
        val source = original?.let(RetouchSourceDecoder::decode) ?: remote(job) ?: return@withContext null
        val author = composerLookAuthor(session.lookPerson())
        val painted = StoryMediaLookPainter.paint(source, job.look, author, ComposerLookCanvas.EXPORT_LONG_SIDE) ?: return@withContext null
        MediaUploadItem(RetouchExif.jpeg(painted, like = original), "story-look-${job.mediaId}.jpg", "image/jpeg")
    }

    private suspend fun remote(job: StoryLookBakeJob): Bitmap? {
        val url = job.uploaded?.url ?: return null
        val request = ImageRequest.Builder(context)
            .data(ComposerMediaAddress.of(url, config.apiBaseUrl))
            .size(ComposerLookCanvas.EXPORT_LONG_SIDE)
            .allowHardware(false)
            .build()
        return runCatching { (context.imageLoader.execute(request) as? SuccessResult)?.drawable?.toBitmap() }.getOrNull()
    }
}

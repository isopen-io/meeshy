package me.meeshy.sdk.media

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import java.io.ByteArrayInputStream
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.composer.AttachmentThumbnailing
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentProtection
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.media.LocalFileUrl
import me.meeshy.sdk.session.PerAccountCache

/** Ce qu'un média en attente montre de lui-même : sa vignette locale (`file://`), ses dimensions, sa durée. */
public data class PendingMediaPreview(
    val thumbnailUrl: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val durationMs: Long? = null,
)

/**
 * **La bulle d'un média en attente d'envoi montre déjà le média** (#15104, iOS : les vignettes du composer passent à la
 * bulle optimiste). Les octets attendent scellés dans [MediaBlobStore], que la bulle ne peut pas lire : son aperçu est
 * une vignette tenue à part, nommée par le `cmid` du téléversement, référencée en `file://` par `thumbnailUrl` — elle
 * survit donc à une relance hors ligne avec la ligne Room de la bulle.
 *
 * Une pièce à vue unique ou floutée n'écrit AUCUN aperçu en clair : la bulle de l'auteur la montre par sa protection.
 * L'aperçu part avec la bulle — à l'accusé du serveur, à l'annulation, au retrait — et au changement de compte.
 *
 * Un vocal en attente se LIT depuis l'appareil (#15428, iOS lit l'enregistrement local) : sa copie jouable, nommée par
 * le même `cmid`, devient le `fileUrl` `file://` de la pièce optimiste. À l'accusé, [MediaAdoption] la range sous
 * l'adresse canonique dans le cache AUDIO : la lecture suivante ne retélécharge pas ce qui vient de partir.
 *
 * Une photo en attente s'ouvre NETTE en plein écran (#15970, iOS montre l'original) : une copie ASSAINIE — ré-encodée,
 * bornée, sans aucune métadonnée de l'original ([SanitizedImageEncoder]) — s'écrit en arrière-plan après la bulle, et la
 * visionneuse la demande par l'id de la pièce ([sharpUrlFor]). L'original n'est jamais écrit en clair ; une pièce à vue
 * unique ou floutée n'a pas de copie ; la copie part avec l'aperçu.
 */
public interface PendingMediaPreviewing {
    /** Garde la vignette déjà préparée par le plateau ; `null` pour une pièce protégée ou sans vignette lisible. */
    public suspend fun keep(cmid: String, thumbnailPath: String?, effects: MessageEffects): String?

    /** Prépare l'aperçu depuis le fichier lui-même (partage reçu) ; `null` pour une pièce protégée ou tenue en mémoire. */
    public suspend fun render(cmid: String, item: MediaUploadItem, effects: MessageEffects): PendingMediaPreview?

    /** Garde une copie jouable d'un SON en attente ; `null` pour une pièce protégée ou qui n'est pas un son. */
    public suspend fun keepPlayable(cmid: String, item: MediaUploadItem, effects: MessageEffects): String? = null

    /**
     * Prépare, en arrière-plan, la copie nette et assainie d'une PHOTO en attente ; rien pour une pièce protégée, qui n'est
     * pas une image, ou trop lourde pour être tenue en mémoire le temps de la copie.
     */
    public suspend fun keepSharp(cmid: String, item: MediaUploadItem, effects: MessageEffects): Unit = Unit

    /** La copie nette de la pièce en attente [attachmentId], ou `null` tant qu'elle n'est pas prête (l'aperçu sert alors). */
    public fun sharpUrlFor(attachmentId: String): String? = null

    /** Supprime les aperçus et copies jouables que [attachments] référencent — seulement les siens. */
    public suspend fun release(attachments: List<ApiMessageAttachment>)

    public companion object {
        public val None: PendingMediaPreviewing = object : PendingMediaPreviewing {
            override suspend fun keep(cmid: String, thumbnailPath: String?, effects: MessageEffects): String? = null
            override suspend fun render(cmid: String, item: MediaUploadItem, effects: MessageEffects): PendingMediaPreview? = null
            override suspend fun release(attachments: List<ApiMessageAttachment>) = Unit
        }
    }
}

@Singleton
public class PendingMediaPreviews internal constructor(
    private val dir: File,
    private val thumbnailer: AttachmentThumbnailing,
    private val io: CoroutineDispatcher,
    private val sanitizer: SanitizedImageEncoding = SanitizedImageEncoder,
) : PendingMediaPreviewing, PerAccountCache {

    private val sharpening = CoroutineScope(SupervisorJob() + io)
    private val sharpJobs = ConcurrentHashMap<String, Job>()

    @Inject
    public constructor(@ApplicationContext context: Context, thumbnailer: AttachmentThumbnailing) :
        this(File(context.cacheDir, DIRECTORY), thumbnailer, Dispatchers.IO)

    override suspend fun keep(cmid: String, thumbnailPath: String?, effects: MessageEffects): String? {
        if (isMasked(effects) || thumbnailPath == null) return null
        return withContext(io) {
            runCatching {
                val source = File(thumbnailPath).takeIf { it.isFile && it.length() > 0L } ?: return@runCatching null
                val target = File(dir.apply { mkdirs() }, "$cmid$SUFFIX")
                source.copyTo(target, overwrite = true)
                fileUrlOf(target)
            }.getOrNull()
        }
    }

    override suspend fun render(cmid: String, item: MediaUploadItem, effects: MessageEffects): PendingMediaPreview? {
        if (isMasked(effects)) return null
        val file = (item.source as? MediaUploadSource.OnDisk)?.file ?: return null
        val learned = thumbnailer.thumbnail(file, PendingAttachmentType.forMime(item.mimeType), dir, cmid) ?: return null
        return PendingMediaPreview(
            thumbnailUrl = learned.thumbnailPath?.let { fileUrlOf(File(it)) },
            width = learned.width,
            height = learned.height,
            durationMs = learned.durationMs,
        )
    }

    override suspend fun keepPlayable(cmid: String, item: MediaUploadItem, effects: MessageEffects): String? {
        if (isMasked(effects) || PendingAttachmentType.forMime(item.mimeType) != PendingAttachmentType.AUDIO) return null
        return withContext(io) {
            runCatching {
                val target = File(dir.apply { mkdirs() }, "$cmid$PLAYABLE_SUFFIX.${extensionOf(item.fileName)}")
                item.source.open().use { input -> target.outputStream().use { output -> input.copyTo(output) } }
                fileUrlOf(target)
            }.getOrNull()
        }
    }

    override suspend fun keepSharp(cmid: String, item: MediaUploadItem, effects: MessageEffects) {
        if (isMasked(effects) || !isSafeName(cmid) || PendingAttachmentType.forMime(item.mimeType) != PendingAttachmentType.IMAGE) return
        if (item.sizeBytes !in 1L..MAX_SHARP_SOURCE_BYTES) return
        val octets = withContext(io) { runCatching { item.source.open().use { it.readBytes() } }.getOrNull() } ?: return
        val job = sharpening.launch(start = CoroutineStart.LAZY) {
            val target = sharpFile(cmid)
            val written = runCatching { sanitizer.encode({ ByteArrayInputStream(octets) }, target) }.getOrDefault(false)
            if (written && !isActive) target.delete()
        }
        sharpJobs.put(cmid, job)?.cancel()
        job.invokeOnCompletion { sharpJobs.remove(cmid, job) }
        job.start()
    }

    override fun sharpUrlFor(attachmentId: String): String? {
        if (!isSafeName(attachmentId)) return null
        return sharpFile(attachmentId).takeIf { it.isFile && it.length() > 0L }?.let(::fileUrlOf)
    }

    override suspend fun release(attachments: List<ApiMessageAttachment>) {
        val sharp = attachments.map { it.id }.filter(::isSafeName).onEach { sharpJobs.remove(it)?.cancel() }.map(::sharpFile)
        val owned = attachments.flatMap { listOfNotNull(it.thumbnailUrl, it.fileUrl) }.mapNotNull(::ownedFile) + sharp
        withContext(io) { owned.forEach { it.delete() } }
    }

    override suspend fun clear() {
        sharpening.coroutineContext.cancelChildren()
        sharpJobs.clear()
        withContext(io) { dir.deleteRecursively() }
    }

    private fun sharpFile(cmid: String): File = File(dir, "$cmid$SHARP_SUFFIX")

    private fun isSafeName(id: String): Boolean = id.matches(SAFE_NAME)

    private fun ownedFile(url: String): File? {
        val path = LocalFileUrl.pathOf(url) ?: return null
        val file = runCatching { File(path).canonicalFile }.getOrNull() ?: return null
        val root = runCatching { dir.canonicalFile }.getOrNull() ?: return null
        return file.takeIf { it.parentFile == root }
    }

    /** La forme `file://` que la bulle reconnaît pour un fichier de l'appareil — jamais `file:/` de `File.toURI`. */
    private fun fileUrlOf(file: File): String = "file://" + file.absolutePath

    private fun extensionOf(fileName: String): String =
        fileName.substringAfterLast('.', "").lowercase().takeIf { it.matches(EXTENSION) } ?: DEFAULT_AUDIO_EXTENSION

    private fun isMasked(effects: MessageEffects): Boolean = (effects.flags and AttachmentProtection.MASKING_FLAGS) != 0L

    internal companion object {
        const val DIRECTORY = "pending-previews"
        const val SUFFIX = ".preview.jpg"
        const val PLAYABLE_SUFFIX = ".voice"
        const val SHARP_SUFFIX = ".sharp.jpg"

        /** Au-delà, la photo n'est pas tenue en mémoire le temps de sa copie : l'aperçu sert la visionneuse. */
        const val MAX_SHARP_SOURCE_BYTES: Long = 40L * 1024 * 1024
        val SAFE_NAME = Regex("[A-Za-z0-9_-]{1,96}")
        const val DEFAULT_AUDIO_EXTENSION = "m4a"
        val EXTENSION = Regex("[a-z0-9]{1,5}")
    }
}

@Module
@InstallIn(SingletonComponent::class)
public interface PendingMediaPreviewsModule {
    @Binds
    public fun pendingMediaPreviewing(impl: PendingMediaPreviews): PendingMediaPreviewing

    @Binds
    @IntoSet
    public fun pendingMediaPreviewsTeardown(impl: PendingMediaPreviews): PerAccountCache
}

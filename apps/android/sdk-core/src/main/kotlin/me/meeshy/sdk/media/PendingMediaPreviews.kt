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
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
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
 */
public interface PendingMediaPreviewing {
    /** Garde la vignette déjà préparée par le plateau ; `null` pour une pièce protégée ou sans vignette lisible. */
    public suspend fun keep(cmid: String, thumbnailPath: String?, effects: MessageEffects): String?

    /** Prépare l'aperçu depuis le fichier lui-même (partage reçu) ; `null` pour une pièce protégée ou tenue en mémoire. */
    public suspend fun render(cmid: String, item: MediaUploadItem, effects: MessageEffects): PendingMediaPreview?

    /** Supprime les aperçus que [attachments] référencent — seulement les siens. */
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
) : PendingMediaPreviewing, PerAccountCache {

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

    override suspend fun release(attachments: List<ApiMessageAttachment>) {
        val owned = attachments.mapNotNull { it.thumbnailUrl?.let(::ownedFile) }
        if (owned.isEmpty()) return
        withContext(io) { owned.forEach { it.delete() } }
    }

    override suspend fun clear() {
        withContext(io) { dir.deleteRecursively() }
    }

    private fun ownedFile(url: String): File? {
        val path = LocalFileUrl.pathOf(url) ?: return null
        val file = runCatching { File(path).canonicalFile }.getOrNull() ?: return null
        val root = runCatching { dir.canonicalFile }.getOrNull() ?: return null
        return file.takeIf { it.parentFile == root }
    }

    /** La forme `file://` que la bulle reconnaît pour un fichier de l'appareil — jamais `file:/` de `File.toURI`. */
    private fun fileUrlOf(file: File): String = "file://" + file.absolutePath

    private fun isMasked(effects: MessageEffects): Boolean = (effects.flags and AttachmentProtection.MASKING_FLAGS) != 0L

    internal companion object {
        const val DIRECTORY = "pending-previews"
        const val SUFFIX = ".preview.jpg"
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

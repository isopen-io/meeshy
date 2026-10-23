package me.meeshy.app.chat

import android.content.Context
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.composer.AttachmentIngesting
import me.meeshy.sdk.composer.AttachmentSourceInfo
import me.meeshy.sdk.composer.IngestedFile
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.sdk.model.composer.ComposerAttachmentLimits
import me.meeshy.sdk.model.composer.PendingAttachment
import me.meeshy.sdk.model.composer.PendingAttachmentPhase
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.composer.PendingAttachmentsOutcome
import me.meeshy.sdk.model.composer.PendingAttachmentsReducer
import me.meeshy.sdk.model.composer.PendingAttachmentsReduction
import me.meeshy.sdk.model.composer.PendingAttachmentsState

/** Le plateau consommé par l'envoi : les pièces qui partent et leurs fichiers à supprimer ensuite. */
class StagedBatch(val items: List<PendingAttachment>, val filesToDelete: List<String>)

/**
 * Le plateau du composer : les pièces choisies (fichier, photo, caméra, vocal) y attendent,
 * préparées une à une, jusqu'au bouton Envoyer. Il tient son état dans son propre
 * `StateFlow` (donc par le ViewModel : il survit à la rotation et à la navigation) et ne
 * persiste rien au-delà. Port de `ConversationView+ComposerAttachments` côté iOS.
 */
class ComposerTrayController @Inject constructor(
    @ApplicationContext private val context: Context,
    private val ingestor: AttachmentIngesting,
) : ChatController {

    private val _state = MutableStateFlow(PendingAttachmentsState())

    /** Les pièces en attente, leur ordre et leur état de préparation. */
    val state: StateFlow<PendingAttachmentsState> = _state.asStateFlow()

    internal var idFactory: () -> String = { UUID.randomUUID().toString() }

    private val _notices = MutableSharedFlow<String>(extraBufferCapacity = NOTICE_BUFFER)

    /**
     * Ce que le plateau refuse ou ne peut importer, dit à l'écran au moment où ça arrive.
     * L'erreur d'écran ([ChatControllerHost.reportError]) ne se voit que sur un fil vide :
     * sans ce canal, une pièce refusée disparaîtrait sans un mot dans une conversation pleine.
     */
    val notices: SharedFlow<String> = _notices.asSharedFlow()

    private var host: ChatControllerHost? = null

    override fun attach(host: ChatControllerHost) {
        this.host = host
    }

    override fun detach() {
        host = null
    }

    /** Ajoute les URIs choisis : une pièce en préparation par fichier, dans l'ordre du choix. */
    fun stageUris(uris: List<Uri>) {
        val scope = host?.scope ?: return
        scope.launch { stageAll(uris) }
    }

    /**
     * Comme [stageUris], mais rend la main une fois les copies faites : la caméra supprime
     * son fichier de prise juste après. La copie vit dans la portée de l'écran, pas dans
     * celle de l'appelant : une rotation ne la laisse pas à moitié faite.
     */
    suspend fun stageUrisAndWait(uris: List<Uri>) {
        val scope = host?.scope ?: return
        scope.launch { stageAll(uris) }.join()
    }

    /**
     * Ajoute un fichier enregistré par l'app (un vocal) : copié en arrière-plan, sans passer
     * par la mémoire ni par le fil principal, puis sa source est supprimée.
     */
    fun stageFile(file: File, declaredMimeType: String?) {
        val scope = host?.scope ?: run {
            file.delete()
            return
        }
        val mime = MimeTypeResolver.resolve(declaredMimeType, file.name)
        val info = AttachmentSourceInfo(file.name, mime, 0L)
        scope.launch {
            try {
                admitSource(info)?.let { placeholder -> prepareFrom(Uri.fromFile(file), placeholder, info) }
            } finally {
                ingestor.delete(listOf(file.path))
            }
        }
    }

    private suspend fun stageAll(uris: List<Uri>) = coroutineScope {
        for (uri in uris) {
            val info = runCatching { ingestor.describe(uri) }.getOrNull() ?: UNKNOWN_SOURCE
            val placeholder = admitSource(info) ?: continue
            launch { prepareFrom(uri, placeholder, info) }
        }
    }

    /** Une source trop lourde est refusée avant sa copie, avec un message qui le dit. */
    private fun admitSource(info: AttachmentSourceInfo): PendingAttachment? {
        if (!ComposerAttachmentLimits.admitsUpload(info.sizeBytes)) {
            reportTooLarge(info.fileName)
            return null
        }
        return placeholderFor(info).takeIf(::admit)
    }

    private suspend fun prepareFrom(uri: Uri, placeholder: PendingAttachment, info: AttachmentSourceInfo) =
        prepare(placeholder, info.fileName) { ingestor.ingest(uri, placeholder.id, info) }

    /** Ajoute un contenu déjà en mémoire (vocal enregistré, photo de la caméra). */
    fun stageBytes(bytes: ByteArray, fileName: String?, declaredMimeType: String?) {
        val scope = host?.scope ?: return
        if (bytes.isEmpty()) return
        val mime = MimeTypeResolver.resolve(declaredMimeType, fileName.orEmpty())
        val placeholder = placeholderFor(AttachmentSourceInfo(fileName, mime, bytes.size.toLong()))
        scope.launch {
            if (!admit(placeholder)) return@launch
            prepare(placeholder, fileName) { ingestor.ingestBytes(bytes, placeholder.id, fileName, mime) }
        }
    }

    /** Retire une pièce : son fichier et sa vignette partent, et elle ne revient jamais. */
    fun remove(id: String) {
        reduce { PendingAttachmentsReducer.remove(it, id) }
    }

    /** Remplace la pièce [id] par une version retouchée, à la même position. */
    fun replace(id: String, bytes: ByteArray, fileName: String?, declaredMimeType: String?) {
        val scope = host?.scope ?: return
        if (_state.value.items.none { it.id == id }) return
        val mime = MimeTypeResolver.resolve(declaredMimeType, fileName.orEmpty())
        scope.launch {
            val file = runCatching { ingestor.ingestBytes(bytes, "$id-${idFactory()}", fileName, mime) }.getOrNull()
                ?: return@launch
            val replacement = readyFrom(
                placeholderFor(AttachmentSourceInfo(fileName, mime, file.sizeBytes)).copy(id = id),
                file,
            )
            val reduction = reduce { PendingAttachmentsReducer.replace(it, id, replacement) }
            if (!reduction.applied) deleteFiles(replacement.ownedPaths)
        }
    }

    /**
     * L'envoi consomme le plateau : `null` s'il est vide ou si une pièce se prépare encore
     * (le bouton Envoyer attend), sinon toutes les pièces prêtes, en un seul lot.
     */
    fun takeForSend(): StagedBatch? {
        while (true) {
            val current = _state.value
            if (current.isEmpty || current.hasPreparing) return null
            val consumed = PendingAttachmentsReducer.consume(current)
            val (cleared, purge) = PendingAttachmentsReducer.drainPurge(consumed)
            if (_state.compareAndSet(current, cleared)) return StagedBatch(current.items, purge)
        }
    }

    suspend fun readBytes(item: PendingAttachment): ByteArray? = item.localPath?.let { ingestor.readBytes(it) }

    /** Supprime les fichiers de travail d'un lot une fois ses octets remis à la file d'envoi. */
    fun release(batch: StagedBatch) {
        deleteFiles(batch.filesToDelete)
    }

    private suspend fun prepare(placeholder: PendingAttachment, name: String?, ingest: suspend () -> IngestedFile?) {
        val file = try {
            ingest()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        if (file == null) {
            reduce { PendingAttachmentsReducer.remove(it, placeholder.id) }
            announce(context.getString(R.string.chat_tray_import_failed, displayName(name)))
            return
        }
        if (!ComposerAttachmentLimits.admitsUpload(file.sizeBytes)) {
            reduce { PendingAttachmentsReducer.remove(it, placeholder.id) }
            deleteFiles(listOfNotNull(file.localPath, file.thumbnail?.thumbnailPath))
            return reportTooLarge(name)
        }
        val reduction = reduce { PendingAttachmentsReducer.update(it, placeholder.id) { item -> readyFrom(item, file) } }
        if (!reduction.applied) {
            deleteFiles(listOfNotNull(file.localPath, file.thumbnail?.thumbnailPath))
        }
    }

    private fun announce(message: String) {
        host?.reportError(message)
        _notices.tryEmit(message)
    }

    private fun reportTooLarge(name: String?) {
        announce(
            context.getString(R.string.chat_tray_too_large, displayName(name), ComposerAttachmentLimits.MAX_UPLOAD_MEGABYTES),
        )
    }

    private fun admit(placeholder: PendingAttachment): Boolean {
        val reduction = reduce { PendingAttachmentsReducer.add(it, placeholder) }
        if (reduction.outcome == PendingAttachmentsOutcome.CAP_REACHED) {
            announce(context.getString(R.string.chat_tray_cap_reached))
        }
        return reduction.applied
    }

    private fun placeholderFor(info: AttachmentSourceInfo) = PendingAttachment(
        id = idFactory(),
        type = PendingAttachmentType.forMime(info.mimeType),
        fileName = info.fileName,
        mimeType = info.mimeType,
        sizeBytes = info.sizeBytes,
        phase = PendingAttachmentPhase.Preparing,
    )

    private fun readyFrom(item: PendingAttachment, file: IngestedFile): PendingAttachment {
        val thumb = file.thumbnail
        return item.copy(
            localPath = file.localPath,
            sizeBytes = file.sizeBytes,
            thumbnailPath = thumb?.thumbnailPath,
            width = thumb?.width,
            height = thumb?.height,
            durationMs = thumb?.durationMs,
            thumbnailColorHex = thumb?.colorHex,
            phase = PendingAttachmentPhase.Ready,
        )
    }

    private fun displayName(name: String?): String =
        name?.takeIf { it.isNotBlank() } ?: context.getString(R.string.composer_drop_unnamedItem)

    private fun reduce(block: (PendingAttachmentsState) -> PendingAttachmentsReduction): PendingAttachmentsReduction {
        while (true) {
            val current = _state.value
            val reduction = block(current)
            val (drained, purge) = PendingAttachmentsReducer.drainPurge(reduction.state)
            if (_state.compareAndSet(current, drained)) {
                if (purge.isNotEmpty()) deleteFiles(purge)
                return reduction
            }
        }
    }

    private fun deleteFiles(paths: List<String>) {
        host?.scope?.launch { ingestor.delete(paths) }
    }

    private companion object {
        const val NOTICE_BUFFER = 8
        val UNKNOWN_SOURCE = AttachmentSourceInfo(fileName = null, mimeType = "application/octet-stream", sizeBytes = 0L)
    }
}

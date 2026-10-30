package me.meeshy.app.stories

import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.core.graphics.drawable.toBitmap
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.StickerDisplayRank
import me.meeshy.sdk.sticker.StickerLibraryItem
import me.meeshy.sdk.sticker.StickerLibraryStore
import me.meeshy.sdk.sticker.SubjectLifting
import me.meeshy.ui.sticker.MeeStickerStill

/** Ce que rend un détourage : le sticker gardé dans Mes stickers, ou la raison pour laquelle il n'y a rien. */
internal sealed interface StickerLiftOutcome {
    data class Saved(val item: StickerLibraryItem) : StickerLiftOutcome
    data object NoSubject : StickerLiftOutcome
    data object Unreadable : StickerLiftOutcome
}

/**
 * Les octets des stickers IMAGE (#13847) : l'image fixe de Mee, un sticker de pack servi, une vignette de Mes stickers,
 * le presse-papiers et le détourage d'une photo. Tout passe par un PNG ; rien ne tourne sur le fil principal. Les
 * décisions (quoi poser) sont dans [StickerChoiceRoute] ; ici, seulement des octets.
 */
internal class StoryStickerImages(
    private val context: Context,
    private val library: StickerLibraryStore,
    private val lifter: SubjectLifting,
) {
    suspend fun meePose(stickerId: String, emoji: String): StickerImagePose? = withContext(Dispatchers.IO) {
        val file = File(File(context.cacheDir, PREVIEW_DIRECTORY), "mee-$stickerId.png")
        val bytes = if (file.exists()) file.readBytes() else MeeStickerStill.png(context, stickerId)?.also { png ->
            runCatching { file.parentFile?.mkdirs(); file.writeBytes(png) }
        }
        bytes?.let { png -> StickerImagePose(PROVIDER_MEE, emoji, Uri.fromFile(file).toString()) { item(png) } }
    }

    fun packPose(url: String, emoji: String): StickerImagePose =
        StickerImagePose(PROVIDER_PACK, emoji, url) { bitmap(url)?.let(::png)?.let(::item) }

    fun libraryPose(itemId: String): StickerImagePose? = library.file(itemId)?.let { file ->
        StickerImagePose(PROVIDER_LIBRARY, StickerDisplayRank.IMAGE_FALLBACK_EMOJI, Uri.fromFile(file).toString()) {
            withContext(Dispatchers.IO) { runCatching { item(file.readBytes()) }.getOrNull() }
        }
    }

    /** Le presse-papiers porte-t-il une image ? Ne lit que sa description : Android ne prévient pas l'utilisateur. */
    fun clipboardHoldsImage(): Boolean = runCatching {
        clipboard()?.primaryClipDescription?.let { it.hasMimeType("image/*") || it.hasMimeType(ClipDescription.MIMETYPE_TEXT_URILIST) } == true
    }.getOrDefault(false)

    /** Suit le presse-papiers tant que la feuille est ouverte : « Coller » paraît dès qu'une image y entre. Rend l'arrêt. */
    fun watchClipboard(onChange: () -> Unit): () -> Unit {
        val manager = clipboard() ?: return {}
        val listener = ClipboardManager.OnPrimaryClipChangedListener(onChange)
        manager.addPrimaryClipChangedListener(listener)
        return { manager.removePrimaryClipChangedListener(listener) }
    }

    /** Colle l'image du presse-papiers dans Mes stickers ; `null` si elle n'est pas lisible. */
    suspend fun pasteIntoLibrary(): StickerLibraryItem? {
        val uri = runCatching { clipboard()?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri }.getOrNull() ?: return null
        val image = bitmap(uri) ?: return null
        return library.save(png(image))
    }

    suspend fun isLiftServed(): Boolean = lifter.isAvailable()

    /** Détoure le sujet de [model] (une adresse, un `Uri`) et le garde dans Mes stickers. */
    suspend fun liftIntoLibrary(model: Any): StickerLiftOutcome {
        val image = bitmap(model) ?: return StickerLiftOutcome.Unreadable
        val subject = lifter.lift(image) ?: return StickerLiftOutcome.NoSubject
        val saved = library.save(png(subject)) ?: return StickerLiftOutcome.Unreadable
        return StickerLiftOutcome.Saved(saved)
    }

    private fun clipboard(): ClipboardManager? = context.getSystemService(ClipboardManager::class.java)

    private suspend fun bitmap(model: Any): Bitmap? = withContext(Dispatchers.IO) {
        runCatching {
            val request = ImageRequest.Builder(context).data(model).allowHardware(false).size(MAX_SIDE).build()
            (context.imageLoader.execute(request) as? SuccessResult)?.drawable?.toBitmap()
        }.getOrNull() ?: (model as? File)?.let { BitmapFactory.decodeFile(it.path) }
    }

    private fun png(bitmap: Bitmap): ByteArray = ByteArrayOutputStream().use { out ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        out.toByteArray()
    }

    private fun item(bytes: ByteArray) = MediaUploadItem(bytes, "sticker.png", "image/png")

    companion object {
        const val PROVIDER_MEE = "mee"
        const val PROVIDER_PACK = "pack"
        const val PROVIDER_LIBRARY = "library"
        private const val PREVIEW_DIRECTORY = "sticker-previews"
        private const val MAX_SIDE = 1024
    }
}

package me.meeshy.app.stories

import android.content.Context
import android.graphics.Bitmap
import androidx.core.graphics.drawable.toBitmap
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryStickerLibrary
import me.meeshy.sdk.sticker.StickerLibraryStore

/** Ce que devient un geste « Enregistrer dans Mes stickers » : on le dit à l'utilisateur, jamais en silence. */
internal enum class StickerSaveOutcome { Saved, AlreadySaved, Failed }

/**
 * Copie un sticker REÇU dans « Mes stickers ». L'octet se lit sur l'URL du média du post ([StoryStickerLibrary.Savable]) :
 * aucune URL tierce n'entre. Un sticker déjà gardé (id stable) est reconnu sans retéléchargement.
 */
internal class StoryStickerSaver(
    private val context: Context,
    private val library: StickerLibraryStore,
) {
    suspend fun save(sticker: StoryStickerLibrary.Savable): StickerSaveOutcome {
        if (library.contains(sticker.id)) return StickerSaveOutcome.AlreadySaved
        val bytes = download(sticker.mediaUrl) ?: return StickerSaveOutcome.Failed
        return if (library.save(bytes, sticker.id) != null) StickerSaveOutcome.Saved else StickerSaveOutcome.Failed
    }

    private suspend fun download(url: String): ByteArray? = withContext(Dispatchers.IO) {
        runCatching {
            val request = ImageRequest.Builder(context).data(url).allowHardware(false).build()
            val bitmap = (context.imageLoader.execute(request) as? SuccessResult)?.drawable
                ?.toBitmap()
            bitmap?.let { b ->
                ByteArrayOutputStream().use { out ->
                    b.compress(Bitmap.CompressFormat.PNG, 100, out)
                    out.toByteArray()
                }
            }
        }.getOrNull()
    }
}

@Composable
internal fun storyStickerSaveMessage(outcome: StickerSaveOutcome): String = stringResource(
    when (outcome) {
        StickerSaveOutcome.Saved -> R.string.story_sticker_save_done
        StickerSaveOutcome.AlreadySaved -> R.string.story_sticker_save_already
        StickerSaveOutcome.Failed -> R.string.story_sticker_save_failed
    },
)

/**
 * L'entrée du menu contextuel d'un sticker reçu. Liste vide = AUCUNE entrée (le geste est absent, jamais grisé).
 */
@Composable
internal fun StoryStickerSaveMenu(
    item: StoryItem,
    expanded: Boolean,
    onDismiss: () -> Unit,
    onSave: (StoryStickerLibrary.Savable) -> Unit,
) {
    val savable = StoryStickerLibrary.savable(item)
    if (savable.isEmpty()) return
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        savable.forEach { sticker ->
            DropdownMenuItem(
                text = { Text(stringResource(R.string.story_sticker_save)) },
                onClick = {
                    onDismiss()
                    onSave(sticker)
                },
            )
        }
    }
}

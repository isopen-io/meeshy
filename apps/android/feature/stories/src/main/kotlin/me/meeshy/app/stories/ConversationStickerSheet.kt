package me.meeshy.app.stories

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.sticker.MeeInstantCatalog
import me.meeshy.sdk.model.sticker.MeeSlot
import me.meeshy.ui.component.composer.ComposerStickerPick
import me.meeshy.ui.sticker.MeeInstantStill
import me.meeshy.ui.sticker.StickerPlacementDestination
import me.meeshy.ui.sticker.StickerSheet
import me.meeshy.ui.sticker.StickerTemplateArtwork

/** Un choix de la feuille, routé, et la recette qu'il emporte : ce qui reste à peindre avant l'envoi. */
private class PendingConversationSticker(val route: StickerChoiceRoute, val sticker: MessageSticker?)

/**
 * La feuille de stickers que le composeur universel ouvre (#14320, #14334) : la MÊME que la scène des stories, avec
 * toutes ses capacités — Smileys, Mee, Meo, packs, Personnalisés (gabarits, Mes stickers, Instants de Mee) et Boutique. Un choix ferme
 * la feuille, puis son image se peint (emoji, gabarit, image fixe du film, sticker de pack, vignette) et le sticker
 * PRÊT remonte par [onPick] avec sa recette `MessageSticker` (iOS `ConversationView+Sticker`). Un choix qui ne peint
 * rien rend la main par [onDismiss].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationStickerSheet(onPick: (ComposerStickerPick) -> Unit, onDismiss: () -> Unit) {
    val kit = rememberStoryStickerKit()
    val baseUrl = remember(kit) { kit.entryPoint.meeshyConfig().apiBaseUrl }
    val imageModel: (String) -> Any? = { url -> url.takeIf { it.isNotBlank() }?.let { ComposerMediaAddress.of(it, baseUrl) } }
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    var pending by remember { mutableStateOf<PendingConversationSticker?>(null) }
    val chosen = pending
    if (chosen != null) {
        PaintConversationSticker(chosen, kit, imageModel) { pick -> if (pick != null) onPick(pick) else onDismiss() }
        return
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false),
        containerColor = Color.Transparent,
        dragHandle = { BottomSheetDefaults.DragHandle() },
    ) {
        val capabilities = rememberStoryStickerCapabilities(kit, imageModel, instants = true)
        val destination = remember(kit, locale) {
            StickerPlacementDestination { choice ->
                val packs = kit.entryPoint.stickerPackStore().packs.value
                val route = StickerChoiceRoute.of(choice, packs, Instant.now(), ZoneId.systemDefault(), locale)
                if (route != null) pending = PendingConversationSticker(route, ConversationStickerRecipe.of(choice, route))
            }
        }
        StickerSheet(
            capabilities = capabilities,
            usage = kit.entryPoint.stickerUsageStore(),
            destination = destination,
            onDismiss = { if (pending == null) onDismiss() },
            accountId = kit.entryPoint.sessionRepository().currentUserId,
        )
    }
}

/** Peint l'image du sticker choisi, hors du fil principal, puis la rend prête — `null` si rien ne se peint. */
@Composable
private fun PaintConversationSticker(
    chosen: PendingConversationSticker,
    kit: StoryStickerKit,
    imageModel: (String) -> Any?,
    onPainted: (ComposerStickerPick?) -> Unit,
) {
    val context = LocalContext.current
    val directory = remember(context) { context.cacheDir }
    when (val route = chosen.route) {
        is StickerChoiceRoute.Template -> TemplateStickerCapture(route) { bitmap ->
            onPainted(bitmap?.let { withContext(Dispatchers.IO) { ConversationStickerFiles.png(it, directory, chosen.sticker) } })
        }
        else -> LaunchedEffect(chosen) {
            onPainted(ConversationStickerFiles.paint(route, chosen.sticker, kit.images, imageModel, directory, context))
        }
    }
}

/**
 * Un gabarit se dessine en Compose ([StickerTemplateArtwork]) : il se peint ici dans un calque hors de l'écran, à la
 * taille d'un sticker de [ComposerEmojiSticker.SIDE] px, puis ce calque devient une image.
 */
@Composable
private fun TemplateStickerCapture(route: StickerChoiceRoute.Template, onCaptured: suspend (Bitmap?) -> Unit) {
    val layer = rememberGraphicsLayer()
    val recorded = remember { AtomicBoolean(false) }
    val body = with(LocalDensity.current) { (ComposerEmojiSticker.SIDE * StickerArtMetrics.TEMPLATE_BODY_FRACTION).toDp() }
    Box(Modifier.size(0.dp)) {
        Box(
            Modifier
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .drawWithContent {
                    layer.record { this@drawWithContent.drawContent() }
                    recorded.set(true)
                },
        ) {
            StickerTemplateArtwork(route.templateId, route.slots, body = body)
        }
    }
    LaunchedEffect(route) {
        repeat(TEMPLATE_CAPTURE_FRAMES) {
            withFrameNanos { }
            if (recorded.get()) {
                val image = runCatching { layer.toImageBitmap().asAndroidBitmap() }.getOrNull()
                return@LaunchedEffect onCaptured(image?.let { if (it.config == Bitmap.Config.HARDWARE) it.copy(Bitmap.Config.ARGB_8888, false) else it })
            }
        }
        onCaptured(null)
    }
}

private const val TEMPLATE_CAPTURE_FRAMES = 30

/** Les octets d'un sticker de conversation : un PNG sur le disque de l'appareil, prêt pour la file d'envoi. */
internal object ConversationStickerFiles {
    private const val MIME = "image/png"

    suspend fun paint(
        route: StickerChoiceRoute,
        sticker: MessageSticker?,
        images: StoryStickerImages,
        imageModel: (String) -> Any?,
        directory: File,
        context: Context,
    ): ComposerStickerPick? = withContext(Dispatchers.IO) {
        when (route) {
            is StickerChoiceRoute.Glyph -> runCatching { ComposerEmojiSticker.render(route.emoji, directory) }.getOrNull()?.let { file ->
                ComposerStickerPick(file, MIME, sticker, ComposerEmojiSticker.SIDE, ComposerEmojiSticker.SIDE)
            }
            is StickerChoiceRoute.MeeImage -> images.meePose(route.stickerId, route.emoji)?.produce()?.let { bytes(it.bytes, directory, sticker) }
            is StickerChoiceRoute.PackImage -> (imageModel(route.fileUrl) as? String)
                ?.let { images.packPose(it, route.emoji).produce() }?.let { bytes(it.bytes, directory, sticker) }
            is StickerChoiceRoute.LibraryImage -> images.libraryPose(route.itemId)?.produce()?.let { bytes(it.bytes, directory, sticker) }
            is StickerChoiceRoute.InstantImage -> instant(route, sticker, directory, context)
            is StickerChoiceRoute.Template -> null
        }
    }

    /** L'image fixe de l'Instant et ses mots (iOS `sendMeeInstant`) ; un film illisible part en emoji, comme iOS. */
    private suspend fun instant(route: StickerChoiceRoute.InstantImage, sticker: MessageSticker?, directory: File, context: Context): ComposerStickerPick? {
        val instant = MeeInstantCatalog.byId(route.instantId) ?: return null
        MeeInstantStill.png(context, instant, MeeSlot.slots(route.slots))?.let { png -> return bytes(png, directory, sticker) }
        return runCatching { ComposerEmojiSticker.render(instant.emoji, directory) }.getOrNull()?.let { file ->
            ComposerStickerPick(file, MIME, MessageSticker(emoji = instant.emoji), ComposerEmojiSticker.SIDE, ComposerEmojiSticker.SIDE)
        }
    }

    fun png(bitmap: Bitmap, directory: File, sticker: MessageSticker?): ComposerStickerPick? = runCatching {
        val file = File(directory, "sticker-${UUID.randomUUID()}.png")
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        ComposerStickerPick(file, MIME, sticker, bitmap.width, bitmap.height)
    }.getOrNull()

    private fun bytes(png: ByteArray, directory: File, sticker: MessageSticker?): ComposerStickerPick? = runCatching {
        val file = File(directory, "sticker-${UUID.randomUUID()}.png")
        file.writeBytes(png)
        val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeFile(file.path, bounds)
        ComposerStickerPick(file, MIME, sticker, bounds.outWidth.takeIf { it > 0 }, bounds.outHeight.takeIf { it > 0 })
    }.getOrNull()
}

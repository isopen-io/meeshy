package me.meeshy.ui.component.retouch

import android.content.Context
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.io.ByteArrayInputStream
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.ImageBudgetEncoder
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.readMediaUploadItem
import me.meeshy.sdk.model.EntityImageFormat
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.composer.look.ComposerLookPerson
import me.meeshy.sdk.model.media.ImageByteBudget

/**
 * **Avatar et bannière se retouchent avec l'outil de la capture caméra** (#17257, jumelle de l'iOS `EntityImageRetouch`,
 * #17251). « Montre-toi », le profil et les communautés passent tous par ce point d'entrée : il ouvre la retouche unique
 * ([ComposerRetouchScreen]) au format de l'image — rond 1:1, bandeau 3:1 —, et ce qui part est recadré à ce format.
 * Annuler ne rend RIEN : aucune image n'est posée, rien n'est envoyé.
 */
public data class PendingEntityImage(val target: ImageUploadTarget, val item: MediaUploadItem) {
    val format: EntityImageFormat get() = EntityImageFormat.of(target)
}

/** Le recadrage final au format : centré, l'image intacte si elle y est déjà. */
public object EntityImageCrop {
    public fun cropped(bitmap: Bitmap, format: EntityImageFormat): Bitmap {
        val window = format.pixelWindow(bitmap.width, bitmap.height) ?: return bitmap
        return Bitmap.createBitmap(bitmap, window.left, window.top, window.width, window.height)
    }
}

/** Le grand côté, en pixels, auquel la photo choisie est décodée pour la retouche. */
public const val ENTITY_IMAGE_LONG_SIDE: Int = 3072

@Stable
public class EntityImageRetouchFlow(
    private val context: Context,
    private val onReady: (ImageUploadTarget, MediaUploadItem) -> Unit,
) {
    public var pending: PendingEntityImage? by mutableStateOf(null)
        private set

    /** Vrai pendant que le rendu final est compressé (indicateur de progression). */
    public var compressing: Boolean by mutableStateOf(false)
        private set

    public fun offer(target: ImageUploadTarget, item: MediaUploadItem) {
        pending = PendingEntityImage(target, item)
    }

    /** La croix, le retour, « Abandonner » : la copie est libérée, rien ne part. */
    public fun cancel() {
        pending?.let { MediaIntake.release(it.item) }
        pending = null
    }

    /** La photo ne s'est pas décodée : elle part sans retouche, comme avant. */
    public fun passthrough() {
        val current = pending ?: return
        pending = null
        onReady(current.target, current.item)
    }

    /**
     * « Terminé » : l'image rendue est recadrée au format, puis compressée HORS du fil principal jusqu'au budget d'octets
     * de la cible (500 Ko avatar, 800 Ko bannière), et envoyée.
     */
    public suspend fun deliver(image: PendingEntityImage, picture: Bitmap) {
        if (compressing) return
        compressing = true
        try {
            val bytes = withContext(Dispatchers.Default) {
                val framed = EntityImageCrop.cropped(picture, image.format)
                ImageBudgetEncoder.encode(framed, ImageByteBudget.forTarget(image.target), checkActive = { ensureActive() })
            }
            val result = withContext(Dispatchers.IO) {
                MediaIntake.copy(ByteArrayInputStream(bytes), context.cacheDir, image.target.uploadFileName(), "image/jpeg")
            }
            MediaIntake.release(image.item)
            pending = null
            if (result != null) onReady(image.target, result)
        } finally {
            compressing = false
        }
    }
}

private fun ImageUploadTarget.uploadFileName(): String = if (this == ImageUploadTarget.AVATAR) "avatar.jpg" else "banner.jpg"

@Composable
public fun rememberEntityImageRetouch(onReady: (ImageUploadTarget, MediaUploadItem) -> Unit): EntityImageRetouchFlow {
    val context = LocalContext.current.applicationContext
    return remember(context) { EntityImageRetouchFlow(context, onReady) }
}

/** La retouche plein écran, ouverte tant qu'une photo attend ; une photo illisible repart telle quelle. */
@Composable
public fun EntityImageRetouchHost(flow: EntityImageRetouchFlow, person: ComposerLookPerson? = null) {
    val pending = flow.pending ?: return
    var image by remember(pending) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(pending) {
        val decoded = withContext(Dispatchers.IO) { runCatching { RetouchSourceDecoder.decode(pending.item.bytes, ENTITY_IMAGE_LONG_SIDE) }.getOrNull() }
        if (decoded == null) flow.passthrough() else image = decoded
    }
    val bitmap = image ?: return
    val author = remember(person) { (person ?: ComposerLookPerson.author(null, null, null)).lookAuthor(Date()) }
    Dialog(
        onDismissRequest = flow::cancel,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false, decorFitsSystemWindows = false),
    ) {
        Box(Modifier.fillMaxSize()) {
            ComposerRetouchScreen(
                source = bitmap,
                author = author,
                format = pending.format,
                onDone = { result ->
                    val picture = when (result) {
                        ComposerRetouchResult.Original -> bitmap
                        is ComposerRetouchResult.Rendered -> result.bitmap
                    }
                    flow.deliver(pending, picture)
                },
                onCancel = flow::cancel,
            )
            if (flow.compressing) CircularProgressIndicator(Modifier.align(Alignment.Center))
        }
    }
}

/** L'auteur et la séance que les cadres écrivent : la marque, la date et l'heure de la retouche. */
private fun ComposerLookPerson.lookAuthor(now: Date): ComposerLookAuthor {
    val date = DateFormat.getDateInstance(DateFormat.MEDIUM).format(now)
    val clock = DateFormat.getTimeInstance(DateFormat.SHORT).format(now)
    return ComposerLookAuthor(id, name, handle, CallMontageCaption(CallMontageCaption.BRAND_TITLE, date, clock), date)
}

/** Le sélecteur de photo système (Photo Picker), branché sur l'avatar ou la bannière : rend « ouvrir pour [ImageUploadTarget] ». */
@Composable
public fun rememberEntityImagePicker(onPicked: (ImageUploadTarget, MediaUploadItem) -> Unit): (ImageUploadTarget) -> Unit {
    val context = LocalContext.current
    var target by rememberSaveable { mutableStateOf(ImageUploadTarget.AVATAR) }
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch { withContext(Dispatchers.IO) { context.readMediaUploadItem(uri) }?.let { onPicked(target, it) } }
    }
    return { picked ->
        target = picked
        picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }
}

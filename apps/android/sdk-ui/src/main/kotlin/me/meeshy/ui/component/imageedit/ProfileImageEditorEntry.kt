package me.meeshy.ui.component.imageedit

import android.content.Context
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.ImageBudgetEncoder
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.readMediaUploadItem
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.imageedit.ImageEditorContext
import me.meeshy.sdk.model.media.ImageByteBudget
import me.meeshy.ui.component.retouch.RetouchSourceDecoder

/** La photo choisie pour l'avatar ou la bannière, en attente d'être retouchée avant son envoi. */
public data class PendingProfileImage(val target: ImageUploadTarget, val item: MediaUploadItem)

/** Le contexte de l'éditeur d'image : l'avatar se recadre en carré, la bannière en 16:9 (iOS `MediaPreviewContext`). */
public fun ImageUploadTarget.editorContext(): ImageEditorContext = when (this) {
    ImageUploadTarget.AVATAR -> ImageEditorContext.AVATAR
    ImageUploadTarget.BANNER -> ImageEditorContext.BANNER
}

/** Le grand côté, en pixels, auquel la photo est décodée pour l'édition (le rendu final repart de ces pixels). */
public const val PROFILE_EDITOR_LONG_SIDE: Int = 3072

/** Décode la photo choisie, orientation EXIF cuite, ou `null` si elle ne se décode pas. */
public fun MediaUploadItem.decodeForEditing(): Bitmap? =
    runCatching { RetouchSourceDecoder.decode(bytes, PROFILE_EDITOR_LONG_SIDE) }.getOrNull()

/** Encode le rendu final en JPEG dans le cache d'entrée (balayé, effacé à la déconnexion), prêt pour le téléversement. */
public fun Bitmap.toEditedUploadItem(cacheDir: File, target: ImageUploadTarget): MediaUploadItem? {
    val out = ByteArrayOutputStream()
    if (!compress(Bitmap.CompressFormat.JPEG, EDITED_JPEG_QUALITY, out)) return null
    val name = target.editedFileName()
    return MediaIntake.copy(ByteArrayInputStream(out.toByteArray()), cacheDir, name, "image/jpeg")
}

private const val EDITED_JPEG_QUALITY = 92

private fun ImageUploadTarget.editedFileName(): String =
    if (this == ImageUploadTarget.AVATAR) "avatar.jpg" else "banner.jpg"

/**
 * Le trajet « choisir une photo → l'éditer → l'envoyer » du profil — partagé par l'écran Profil et la carte
 * d'onboarding « Montre-toi » (#17238) : l'éditeur plein écran
 * s'ouvre sur la photo choisie, « Terminé » envoie le rendu final (un seul rendu, depuis la
 * photo intacte), « Annuler » libère la copie sans rien envoyer.
 */
@Stable
public class ProfileImageEditorFlow(
    private val context: Context,
    private val onReady: (ImageUploadTarget, MediaUploadItem) -> Unit,
) {
    public var pending: PendingProfileImage? by mutableStateOf(null)
        private set

    public fun offer(target: ImageUploadTarget, item: MediaUploadItem) {
        pending = PendingProfileImage(target, item)
    }

    public fun cancel() {
        pending?.let { MediaIntake.release(it.item) }
        pending = null
    }

    /** La photo ne s'est pas décodée : elle part sans retouche, comme avant l'éditeur. */
    public fun passthrough() {
        val current = pending ?: return
        pending = null
        onReady(current.target, current.item)
    }

    /** Vrai pendant que le rendu final est compressé (indicateur de progression). */
    public var compressing: Boolean by mutableStateOf(false)
        private set

    /**
     * « Terminé » : le rendu final est compressé HORS du fil principal jusqu'au budget d'octets de la cible
     * (500 Ko avatar, 800 Ko bannière), puis envoyé. L'écran ne gèle jamais : l'éditeur reste affiché avec son indicateur.
     */
    public suspend fun acceptCompressed(target: ImageUploadTarget, source: MediaUploadItem, edited: Bitmap) {
        if (compressing) return
        compressing = true
        try {
            val bytes = withContext(Dispatchers.Default) {
                ImageBudgetEncoder.encode(edited, ImageByteBudget.forTarget(target), checkActive = { ensureActive() })
            }
            val result = withContext(Dispatchers.IO) {
                MediaIntake.copy(ByteArrayInputStream(bytes), context.cacheDir, target.editedFileName(), "image/jpeg")
            }
            MediaIntake.release(source)
            pending = null
            if (result != null) onReady(target, result)
        } finally {
            compressing = false
        }
    }

    public fun accept(target: ImageUploadTarget, source: MediaUploadItem, edited: Bitmap) {
        val result = edited.toEditedUploadItem(context.cacheDir, target)
        MediaIntake.release(source)
        pending = null
        if (result != null) onReady(target, result)
    }
}

@Composable
public fun rememberProfileImageEditor(onReady: (ImageUploadTarget, MediaUploadItem) -> Unit): ProfileImageEditorFlow {
    val context = LocalContext.current.applicationContext
    return remember(context) { ProfileImageEditorFlow(context, onReady) }
}

/** L'éditeur plein écran, ouvert tant qu'une photo attend sa retouche ; une photo illisible repart telle quelle. */
@Composable
public fun ProfileImageEditorHost(flow: ProfileImageEditorFlow) {
    val pending = flow.pending ?: return
    var image by remember(pending) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(pending) {
        val decoded = withContext(Dispatchers.IO) { pending.item.decodeForEditing() }
        if (decoded == null) flow.passthrough() else image = decoded
    }
    val bitmap = image ?: return
    val scope = rememberCoroutineScope()
    Dialog(
        onDismissRequest = flow::cancel,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(Modifier.fillMaxSize()) {
            MeeshyImageEditorScreen(
                image = bitmap,
                context = pending.target.editorContext(),
                onAccept = { edited -> scope.launch { flow.acceptCompressed(pending.target, pending.item, edited) } },
                onCancel = flow::cancel,
            )
            if (flow.compressing) CircularProgressIndicator(Modifier.align(Alignment.Center))
        }
    }
}

/** Le sélecteur de photo système (Photo Picker), branché sur l'avatar ou la bannière : rend « ouvrir pour [ImageUploadTarget] ». */
@Composable
public fun rememberProfileImagePicker(onPicked: (ImageUploadTarget, MediaUploadItem) -> Unit): (ImageUploadTarget) -> Unit {
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

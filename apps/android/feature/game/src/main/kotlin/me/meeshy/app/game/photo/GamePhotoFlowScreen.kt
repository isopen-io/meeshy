package me.meeshy.app.game.photo

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.io.File
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.app.game.notebook.photoMomentKicker
import me.meeshy.app.game.notebook.photoMomentTitle
import me.meeshy.feature.game.R
import me.meeshy.sdk.media.MediaStoreCaptureGallery
import me.meeshy.sdk.model.composer.capture.CaptureZone
import me.meeshy.sdk.model.game.GameHapticPattern
import me.meeshy.sdk.model.game.photo.CameraFailure
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.PhotoCameraPhase
import me.meeshy.sdk.model.game.photo.PhotoFlowState
import me.meeshy.sdk.model.game.photo.PhotoFormat
import me.meeshy.sdk.model.game.photo.PhotoMode
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.component.game.rememberGameHaptics
import me.meeshy.ui.component.retouch.RetouchSourceDecoder
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

internal const val PHOTO_FLOW_TAG = "game.photo.flow"
internal const val PHOTO_SELFIE_TAG = "game.photo.selfie"
internal const val PHOTO_CARD_TAG = "game.photo.card"
internal const val PHOTO_LATER_TAG = "game.photo.later"
internal const val PHOTO_CLOSE_TAG = "game.photo.close"
internal const val PHOTO_FRAME_TRIGGER_TAG = "game.photo.frame_trigger"
internal const val PHOTO_SCENE_TAG = "game.photo.scene"
internal const val PHOTO_KEEP_TAG = "game.photo.keep"
internal const val PHOTO_SAVE_TAG = "game.photo.save"
internal const val PHOTO_SHARE_TAG = "game.photo.share"
internal const val PHOTO_NOTICE_TAG = "game.photo.notice"
internal const val PHOTO_CAMERA_FAILURE_TAG = "game.photo.camera.failure"

/** Les deux lignes du cadre et sa date, dans la langue de l'interface. */
@Composable
internal fun photoCanvasText(moment: GamePhotoMoment): PhotoCanvasText {
    val locale = LocalConfiguration.current.locales[0]
    val date = remember(locale) { DateFormat.getDateInstance(DateFormat.MEDIUM, locale).format(Date()) }
    return PhotoCanvasText(photoMomentKicker(moment.emblem), photoMomentTitle(moment.emblem), date)
}

/**
 * LE DÉROULÉ DE LA PHOTO, plein écran (iOS `GamePhotoFlowView` en `fullScreenCover`) : jamais une feuille qui se glisse,
 * on y fait un geste, pas une lecture. [onClose] reçoit la fin du déroulé — gardée, reportée ou fermée — et l'hôte relit
 * sa Chronique. Aucune image n'est envoyée au serveur.
 */
@Composable
fun GamePhotoFlowDialog(moment: GamePhotoMoment, notebook: GamePhotoNotebooking, onClose: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val haptics = rememberGameHaptics()
    val text = photoCanvasText(moment)
    val capture = remember(moment) { GamePhotoCanvasCapture() }
    val session = remember(moment) {
        GamePhotoSession(
            moment = moment,
            text = text,
            camera = CameraXGamePhotoCamera(context, lifecycleOwner),
            composer = capture,
            notebook = notebook,
            gallery = MediaStoreCaptureGallery(context),
            onStrike = { haptics.play(GameHapticPattern.strikeInPlace) },
        )
    }
    DisposableEffect(session) { onDispose { session.camera.stop() } }
    val scope = rememberCoroutineScope()
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        scope.launch { session.chooseSelfie() }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch { decodePicked(context, uri)?.let { session.useGalleryPhoto(it) } }
    }
    Dialog(
        onDismissRequest = session::close,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        GamePhotoCaptureHost(capture)
        GamePhotoFlow(
            session = session,
            onClose = onClose,
            onSelfie = {
                val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                if (granted) scope.launch { session.chooseSelfie() } else permission.launch(Manifest.permission.CAMERA)
            },
            onGallery = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            onShare = { bytes -> scope.launch { GamePhotoSharer.share(context, bytes, moment.id, context.getString(R.string.game_photo_share)) } },
        )
    }
}

private suspend fun decodePicked(context: Context, uri: Uri) = withContext(Dispatchers.IO) {
    runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
        ?.let { RetouchSourceDecoder.decode(it, SOURCE_LONG_SIDE) }
}

/** Le contenu du déroulé, piloté par sa session — les gestes système (permission, galerie, partage) lui sont remis. */
@Composable
internal fun GamePhotoFlow(
    session: GamePhotoSession,
    onClose: () -> Unit,
    onSelfie: () -> Unit,
    onGallery: () -> Unit,
    onShare: (ByteArray) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val state = session.state
    LaunchedEffect(state) { if (state is PhotoFlowState.Done) onClose() }
    val pane = stringResource(R.string.game_photo_a11y, session.text.title)
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .safeDrawingPadding()
            .testTag(PHOTO_FLOW_TAG)
            .semantics { paneTitle = pane },
    ) {
        when (state) {
            PhotoFlowState.Offer -> Offer(session, onSelfie, onCard = { scope.launch { session.chooseCard() } }, onLater = { scope.launch { session.later() } })
            is PhotoFlowState.Camera -> CameraStep(session, state.phase, onGallery)
            is PhotoFlowState.Striking -> Striking(session)
            is PhotoFlowState.Result -> ResultStep(session, state.kept, onShare)
            PhotoFlowState.Failed -> Message(stringResource(R.string.game_photo_failed))
            is PhotoFlowState.Done -> Unit
        }
        CloseButton(Modifier.align(Alignment.TopEnd)) { session.close() }
    }
}

@Composable
private fun CloseButton(modifier: Modifier, onClose: () -> Unit) {
    val label = stringResource(R.string.game_photo_close)
    Box(
        modifier
            .padding(MeeshySpacing.md)
            .size(44.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.18f))
            .clickable(onClick = onClose)
            .semantics { contentDescription = label; role = Role.Button }
            .testTag(PHOTO_CLOSE_TAG),
        contentAlignment = Alignment.Center,
    ) { Icon(MeeshyIcons.Close, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp)) }
}

// 1. La proposition

@Composable
private fun Offer(session: GamePhotoSession, onSelfie: () -> Unit, onCard: () -> Unit, onLater: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg, Alignment.CenterVertically),
    ) {
        MeeFigure(filmId = OFFER_FILM, side = 120.dp, modifier = Modifier.clearAndSetSemantics {})
        Text(stringResource(R.string.game_photo_offer_title), fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text(session.text.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, color = MeeshyPalette.Indigo200)
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            BigButton(stringResource(R.string.game_photo_selfie), MeeshyIcons.Camera, primary = true, tag = PHOTO_SELFIE_TAG, onClick = onSelfie)
            BigButton(stringResource(R.string.game_photo_card_only), MeeshyIcons.Photo, primary = false, tag = PHOTO_CARD_TAG, onClick = onCard)
            BigButton(stringResource(R.string.game_photo_later), MeeshyIcons.Schedule, primary = false, tag = PHOTO_LATER_TAG, onClick = onLater)
        }
    }
}

@Composable
private fun BigButton(title: String, icon: ImageVector, primary: Boolean, tag: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .clip(CircleShape)
            .background(if (primary) Color.White else Color.White.copy(alpha = 0.16f))
            .clickable(role = Role.Button, onClick = onClick)
            .testTag(tag),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val ink = if (primary) MeeshyPalette.Indigo950 else Color.White
        Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(18.dp))
        Text(title, fontWeight = FontWeight.SemiBold, color = ink)
    }
}

// 2. La caméra — LE CADRE EST LE DÉCLENCHEUR (#10284) : aucun cercle d'enregistrement à côté du cadre.

@Composable
private fun CameraStep(session: GamePhotoSession, phase: PhotoCameraPhase, onGallery: () -> Unit) {
    val scope = rememberCoroutineScope()
    val live = phase == PhotoCameraPhase.Live
    val sceneLabel = stringResource(R.string.game_photo_scene_a11y)
    Column(
        Modifier.fillMaxSize().padding(top = MeeshySpacing.xl * 2),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Framed(Modifier.weight(1f)) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.White.copy(alpha = 0.08f))
                    .pointerInput(live) { detectTapGestures(onDoubleTap = { if (live) scope.launch { session.take(CaptureZone.OUTSIDE) } }) }
                    .semantics {
                        contentDescription = sceneLabel
                        if (live) onClick { scope.launch { session.take(CaptureZone.OUTSIDE) }; true }
                    }
                    .testTag(PHOTO_SCENE_TAG),
            ) {
                when (phase) {
                    PhotoCameraPhase.Live -> session.camera.Preview(Modifier.fillMaxSize())
                    PhotoCameraPhase.Opening -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = Color.White)
                    is PhotoCameraPhase.Failed -> Unit
                }
                ScaledPhotoCanvas(session.moment, session.text, PhotoFormat.Story, PhotoBackground.Clear, Modifier.fillMaxSize())
            }
        }
        if (phase is PhotoCameraPhase.Failed) FailureNote(phase.reason)
        Row(
            Modifier.padding(bottom = MeeshySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            verticalAlignment = Alignment.Top,
        ) {
            SideButton(MeeshyIcons.PhotoLibrary, stringResource(R.string.game_photo_gallery), onGallery)
            FrameTrigger(session, live) { scope.launch { session.take(CaptureZone.FRAME) } }
            SideButton(MeeshyIcons.Photo, stringResource(R.string.game_photo_card_only)) { scope.launch { session.chooseCard() } }
        }
    }
}

@Composable
private fun SideButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(52.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.16f))
            .clickable(onClick = onClick)
            .semantics { contentDescription = label; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp)) }
}

/** La case du cadre du moment, au gabarit d'une miniature : le cadre en réduction, l'anneau blanc, son nom dessous. */
@Composable
private fun FrameTrigger(session: GamePhotoSession, live: Boolean, onTake: () -> Unit) {
    val label = stringResource(R.string.game_photo_frame_trigger_a11y, session.text.title)
    val hint = stringResource(R.string.game_photo_frame_trigger_hint)
    Column(
        Modifier
            .clickable(enabled = live, role = Role.Button, onClick = onTake)
            .clearAndSetSemantics { contentDescription = "$label. $hint"; role = Role.Button; if (live) onClick { onTake(); true } }
            .testTag(PHOTO_FRAME_TRIGGER_TAG),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        ScaledPhotoCanvas(
            session.moment, session.text, PhotoFormat.Story, PhotoBackground.Card,
            Modifier
                .width(TRIGGER_WIDTH)
                .aspectRatio(PhotoFormat.Story.width.toFloat() / PhotoFormat.Story.height)
                .clip(RoundedCornerShape(MeeshyRadius.sm))
                .border(3.dp, Color.White, RoundedCornerShape(MeeshyRadius.sm))
                .alpha(if (live) 1f else TRIGGER_IDLE_ALPHA),
        )
        Text(session.text.title, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

@Composable
private fun FailureNote(reason: CameraFailure) {
    val text = when (reason) {
        CameraFailure.Denied -> R.string.game_photo_camera_denied
        CameraFailure.Unsupported -> R.string.game_photo_camera_unsupported
        CameraFailure.Unavailable -> R.string.game_photo_camera_unavailable
    }
    Text(
        stringResource(text),
        Modifier.padding(horizontal = MeeshySpacing.xl).testTag(PHOTO_CAMERA_FAILURE_TAG),
        color = Color.White,
        fontWeight = FontWeight.Medium,
        textAlign = TextAlign.Center,
    )
}

// 3. La frappe en place

@Composable
private fun Striking(session: GamePhotoSession) {
    val strike by animateFloatAsState(session.strike, spring(dampingRatio = 0.55f, stiffness = 180f), label = "photo-strike")
    val label = stringResource(R.string.game_photo_striking)
    val background = session.frozen?.let { PhotoBackground.Photo(it, mirrored = session.state == PhotoFlowState.Striking(PhotoMode.Selfie)) }
        ?: PhotoBackground.Card
    Column(Modifier.fillMaxSize().padding(vertical = MeeshySpacing.xl * 2).clearAndSetSemantics { contentDescription = label }) {
        Framed(Modifier.weight(1f)) {
            Box(Modifier.fillMaxSize()) {
                ScaledPhotoCanvas(session.moment, session.text, PhotoFormat.Story, background, Modifier.fillMaxSize(), strike = strike)
                Text(
                    stringResource(R.string.game_mint_tchak),
                    Modifier.align(Alignment.Center).padding(top = 120.dp),
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Black,
                    color = MeeshyPalette.Warning.copy(alpha = strike.coerceIn(0f, 1f)),
                )
            }
        }
    }
}

// 4. Le résultat

@Composable
private fun ResultStep(session: GamePhotoSession, kept: Boolean?, onShare: (ByteArray) -> Unit) {
    val scope = rememberCoroutineScope()
    val composed = session.composed
    val preview = stringResource(R.string.game_photo_preview, session.text.title)
    Column(
        Modifier.fillMaxSize().padding(top = MeeshySpacing.xl * 2, bottom = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        if (composed != null) {
            Image(
                if (session.squareFormat) composed.square else composed.story,
                contentDescription = preview,
                contentScale = ContentScale.Fit,
                modifier = Modifier.weight(1f).padding(horizontal = MeeshySpacing.lg).clip(RoundedCornerShape(MeeshyRadius.lg)),
            )
            FormatPicker(session.squareFormat, session::chooseFormat)
        }
        session.notice?.let { notice ->
            Text(
                stringResource(notice.text),
                Modifier.padding(horizontal = MeeshySpacing.xl).testTag(PHOTO_NOTICE_TAG),
                color = if (notice.good) MeeshyPalette.Success else MeeshyPalette.ErrorSoft,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
            )
            if (notice == PhotoNotice.NoSpace && session.showsSave) {
                Text(
                    stringResource(R.string.game_photo_notice_no_space_save),
                    Modifier
                        .clip(CircleShape)
                        .background(MeeshyPalette.Indigo500)
                        .clickable(role = Role.Button) { scope.launch { session.save() } }
                        .heightIn(min = 44.dp)
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        Row(Modifier.padding(horizontal = MeeshySpacing.lg), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            if (session.showsSave) {
                ResultButton(stringResource(R.string.game_photo_save), MeeshyIcons.Download, PHOTO_SAVE_TAG, Modifier.weight(1f)) {
                    scope.launch { session.save() }
                }
            }
            ResultButton(stringResource(R.string.game_photo_share), MeeshyIcons.Share, PHOTO_SHARE_TAG, Modifier.weight(1f)) {
                session.shareBytes()?.let(onShare)
            }
            ResultButton(
                stringResource(if (kept == true) R.string.game_photo_kept else R.string.game_photo_keep),
                if (kept == true) MeeshyIcons.CheckCircle else MeeshyIcons.Dictionary,
                PHOTO_KEEP_TAG,
                Modifier.weight(1f),
            ) { scope.launch { session.keep() } }
        }
    }
}

@Composable
private fun FormatPicker(square: Boolean, onChoose: (Boolean) -> Unit) {
    Row(
        Modifier.padding(horizontal = MeeshySpacing.xl).clip(CircleShape).background(Color.White.copy(alpha = 0.12f)),
    ) {
        listOf(false to R.string.game_photo_format_story, true to R.string.game_photo_format_square).forEach { (value, title) ->
            val selected = value == square
            Text(
                stringResource(title),
                Modifier
                    .clip(CircleShape)
                    .background(if (selected) Color.White.copy(alpha = 0.3f) else Color.Transparent)
                    .clickable(role = Role.Tab) { onChoose(value) }
                    .semantics { this.selected = selected }
                    .heightIn(min = 44.dp)
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                color = Color.White,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun ResultButton(title: String, icon: ImageVector, tag: String, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(Color.White.copy(alpha = 0.16f))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = MeeshySpacing.sm)
            .testTag(tag),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
        Text(title, color = Color.White, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun Message(text: String) {
    Box(Modifier.fillMaxSize().padding(MeeshySpacing.xl), contentAlignment = Alignment.Center) {
        Text(text, color = Color.White, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
    }
}

/** Un cadre 9:16 qui tient dans la place offerte, l'aperçu comme la frappe. */
@Composable
private fun Framed(modifier: Modifier, content: @Composable () -> Unit) {
    BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val ratio = PhotoFormat.Story.width.toFloat() / PhotoFormat.Story.height
        val height = minOf(maxHeight, maxWidth / ratio)
        Box(Modifier.size(height * ratio, height).clip(RoundedCornerShape(MeeshyRadius.lg))) { content() }
    }
}

private val PhotoNotice.text: Int
    get() = when (this) {
        PhotoNotice.Kept -> R.string.game_photo_notice_kept
        PhotoNotice.NoSpace -> R.string.game_photo_notice_no_space
        PhotoNotice.KeepFailed -> R.string.game_photo_notice_keep_failed
        PhotoNotice.Saved -> R.string.game_photo_notice_saved
        PhotoNotice.SaveFailed -> R.string.game_photo_notice_save_failed
        PhotoNotice.Shared -> R.string.game_photo_notice_shared
    }

/**
 * « Partager » : l'image du format choisi, remise à la feuille de partage système hors de Meeshy — un JPEG dans le cache
 * `shared-media/` servi par le `FileProvider` de l'application ; le fichier précédent est remplacé, jamais accumulé.
 */
internal object GamePhotoSharer {
    suspend fun share(context: Context, bytes: ByteArray, momentId: String, chooserTitle: String) {
        val file = withContext(Dispatchers.IO) {
            val directory = File(context.cacheDir, "shared-media").apply { mkdirs() }
            directory.listFiles()?.forEach { it.delete() }
            File(directory, "meeshy-${momentId.replace(Regex("[^A-Za-z0-9-]"), "_")}.jpg").apply { writeBytes(bytes) }
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).setType("image/jpeg").putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        runCatching {
            context.startActivity(
                Intent.createChooser(send, chooserTitle).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION),
            )
        }
    }
}

private const val OFFER_FILM = "duo-mee-selfie"
private const val SOURCE_LONG_SIDE = 1920
private val TRIGGER_WIDTH = 64.dp
private const val TRIGGER_IDLE_ALPHA = 0.4f

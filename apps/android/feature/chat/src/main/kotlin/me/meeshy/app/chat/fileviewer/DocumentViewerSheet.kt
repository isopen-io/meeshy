package me.meeshy.app.chat.fileviewer

import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.app.chat.FileAttachmentIntentResolver
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.fileviewer.DocumentHandOff
import me.meeshy.sdk.model.fileviewer.SavedDocument
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** L'état de « Télécharger le document » : repos, copie en cours, copié, échec (les deux derniers retombent au repos). */
private enum class SaveState { IDLE, SAVING, SAVED, FAILED }

/**
 * La visionneuse de document (miroir de `DocumentFullSheet`, iOS). Un PDF montre ses pages, rendues à la demande par
 * le moteur du système ; tout autre document (Office…) dit « Aperçu non disponible » et propose de l'ouvrir avec une autre
 * app (aucun aperçu sûr n'existe dans le système : le fichier téléchargé, jamais un fichier chiffré en clair, est prêté).
 * Barre : croix à gauche, enregistrer (sélecteur de dossier du système) et partager à droite.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DocumentViewerSheet(request: FileViewerRequest, isPdf: Boolean, accent: Color, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    val scope = rememberCoroutineScope()
    var saveState by remember { mutableStateOf(SaveState.IDLE) }
    LaunchedEffect(saveState) {
        if (saveState == SaveState.SAVED || saveState == SaveState.FAILED) {
            delay(SETTLE_MS)
            saveState = SaveState.IDLE
        }
    }
    val savedMime = remember(request.mimeType) { SavedDocument.mimeType(request.mimeType) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(savedMime)) { target ->
        if (target == null) return@rememberLauncherForActivityResult
        saveState = SaveState.SAVING
        scope.launch {
            val ok = FileViewerIo.copy(context, request.localUri.toUri(), target)
            saveState = if (ok) SaveState.SAVED else SaveState.FAILED
            if (ok) haptics.success() else haptics.error()
        }
    }
    val title = request.fileName.ifBlank { stringResource(R.string.viewer_doc_default_name) }
    val saveLabel = stringResource(R.string.viewer_doc_save)
    val shareLabel = stringResource(R.string.viewer_share)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(Modifier.fillMaxSize().navigationBarsPadding()) {
            ViewerBar(
                onClose = onDismiss,
                accent = accent,
                title = { Text(title, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.label, fontWeight = FontWeight.SemiBold, maxLines = 1) },
                actions = {
                    when (saveState) {
                        SaveState.SAVING -> Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(Modifier.size(20.dp), color = accent, strokeWidth = 2.dp)
                        }
                        SaveState.SAVED -> BarButton(MeeshyIcons.Check, saveLabel, accent) {}
                        SaveState.FAILED -> BarButton(MeeshyIcons.Close, saveLabel, MeeshyTheme.tokens.error) {}
                        SaveState.IDLE -> BarButton(MeeshyIcons.Download, saveLabel, accent) {
                            val launched = runCatching { picker.launch(SavedDocument.fileName(request.fileName, fallback = title)) }.isSuccess
                            if (!launched) { saveState = SaveState.FAILED; haptics.error() }
                        }
                    }
                    BarButton(MeeshyIcons.Share, shareLabel, accent) { share(context, request) }
                },
            )
            if (isPdf) PdfBody(request, accent) else NoPreviewBody(request, title, accent)
        }
    }
}

private const val SETTLE_MS = 2_000L

private fun share(context: Context, request: FileViewerRequest) {
    val launched = runCatching {
        context.startActivity(FileAttachmentIntentResolver.shareIntent(request.localUri.toUri(), request.mimeType, request.fileName))
    }.isSuccess
    if (!launched) Toast.makeText(context, R.string.chat_file_open_failed, Toast.LENGTH_SHORT).show()
}

/**
 * Aucun aperçu sûr dans l'app (Office…) : l'utilisateur confie le fichier téléchargé à l'app de son choix, sous le type
 * que son EXTENSION implique ([DocumentHandOff]) — jamais sous celui que l'expéditeur a déclaré.
 */
private fun openWithAnotherApp(context: Context, request: FileViewerRequest, mimeType: String) {
    val launched = runCatching {
        context.startActivity(FileAttachmentIntentResolver.viewIntent(request.localUri.toUri(), mimeType, request.fileName))
    }.isSuccess
    if (!launched) Toast.makeText(context, R.string.chat_file_open_failed, Toast.LENGTH_SHORT).show()
}

@Composable
private fun NoPreviewBody(request: FileViewerRequest, title: String, accent: Color) {
    val context = LocalContext.current
    val uri = remember(request.localUri) { request.localUri.toUri() }
    val handOffMime = remember(request.fileName) { DocumentHandOff.mimeFor(request.fileName) }
        ?.takeIf { FileAttachmentIntentResolver.canHandOff(uri.scheme) }
    Column(
        Modifier.fillMaxSize().padding(MeeshySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(MeeshyIcons.Document, null, tint = accent, modifier = Modifier.size(64.dp))
        Text(title, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.callout, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Text(stringResource(R.string.viewer_doc_preview_unavailable), color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.label)
        if (handOffMime != null) {
            val openWith = stringResource(R.string.viewer_doc_open_with)
            Row(
                modifier = Modifier
                    .padding(top = MeeshySpacing.sm)
                    .heightIn(min = 48.dp)
                    .clip(CircleShape)
                    .background(accent.copy(alpha = 0.15f))
                    .clickable(role = Role.Button) { openWithAnotherApp(context, request, handOffMime) }
                    .padding(horizontal = MeeshySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                Icon(MeeshyIcons.Share, null, tint = accent, modifier = Modifier.size(18.dp))
                Text(openWith, color = accent, fontSize = MeeshyFontSize.label, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

private sealed interface PdfLoad {
    data object Loading : PdfLoad
    data object Failed : PdfLoad
    data class Ready(val pages: PdfPages) : PdfLoad
}

@Composable
private fun PdfBody(request: FileViewerRequest, accent: Color) {
    val context = LocalContext.current
    var load by remember(request.localUri) { mutableStateOf<PdfLoad>(PdfLoad.Loading) }
    LaunchedEffect(request.localUri) {
        // Ouvert hors annulation : un document ouvert pendant que la feuille se ferme est refermé, jamais perdu ouvert.
        val opened = withContext(NonCancellable) { PdfPages.open(context, request.localUri.toUri()) }
        if (!isActive) { opened?.close(); return@LaunchedEffect }
        load = opened?.let { PdfLoad.Ready(it) } ?: PdfLoad.Failed
    }
    DisposableEffect(request.localUri) {
        onDispose { (load as? PdfLoad.Ready)?.pages?.close() }
    }
    when (val state = load) {
        PdfLoad.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = accent, strokeWidth = 2.dp)
        }
        PdfLoad.Failed -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.viewer_load_error), color = MeeshyTheme.tokens.textSecondary)
        }
        is PdfLoad.Ready -> PdfPageList(state.pages, request.fileName)
    }
}

@Composable
private fun PdfPageList(pages: PdfPages, fileName: String) {
    val widthPx = with(LocalDensity.current) { LocalConfiguration.current.screenWidthDp.dp.roundToPx() }
    val count = pages.pageCount
    val summary = stringResource(R.string.viewer_doc_pages, count)
    LazyColumn(
        Modifier.fillMaxSize().semantics { contentDescription = "$fileName, $summary" },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items(count, key = { it }) { index ->
            val bitmap by produceState<android.graphics.Bitmap?>(initialValue = null, pages, index, widthPx) {
                value = pages.render(index, widthPx)
            }
            val image = bitmap
            if (image == null) {
                Box(Modifier.fillMaxWidth().aspectRatio(PLACEHOLDER_ASPECT).background(MeeshyTheme.tokens.backgroundSecondary), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                }
            } else {
                Image(
                    bitmap = image.asImageBitmap(),
                    contentDescription = "${index + 1}/$count",
                    contentScale = ContentScale.FillWidth,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

private const val PLACEHOLDER_ASPECT = 0.707f

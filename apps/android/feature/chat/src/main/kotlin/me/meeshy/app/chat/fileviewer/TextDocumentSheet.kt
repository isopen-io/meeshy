package me.meeshy.app.chat.fileviewer

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.fileviewer.MarkdownBlock
import me.meeshy.sdk.model.fileviewer.MarkdownBlocks
import me.meeshy.sdk.model.fileviewer.MarkdownSpan
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Une ligne affichée n'excède jamais cette longueur : un fichier d'une seule ligne de 500 Ko ne fige pas la liste. */
private const val MAX_LINE_CHARS = 4_000

private sealed interface TextLoad {
    data object Loading : TextLoad
    data object Failed : TextLoad
    data class Ready(val text: String, val lines: List<String>, val blocks: List<MarkdownBlock>, val truncated: Boolean) : TextLoad
}

/**
 * La lecture d'un texte brut ou d'un Markdown reçu, DANS l'app (parité de l'aperçu QuickLook d'iOS, #13496) : lecture
 * bornée (512 Kio) et en flux, encodage détecté, rien n'est exécuté (ni HTML, ni lien, ni script) ; le Markdown se lit
 * rendu ou en source. L'analyse se fait hors du fil principal, la liste est paresseuse.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TextDocumentSheet(request: FileViewerRequest, isMarkdown: Boolean, accent: Color, onDismiss: () -> Unit) {
    val context = LocalContext.current
    var load by remember(request.localUri) { mutableStateOf<TextLoad>(TextLoad.Loading) }
    var showSource by remember(request.localUri) { mutableStateOf(false) }
    LaunchedEffect(request.localUri) {
        load = runCatching {
            val read = FileViewerIo.readText(context, request.localUri.toUri())
            if (read.isBinary) {
                TextLoad.Failed
            } else {
                withContext(Dispatchers.Default) {
                    val blocks = if (isMarkdown) MarkdownBlocks.parse(read.text) else emptyList()
                    val lines = read.text.lines().map { if (it.length > MAX_LINE_CHARS) it.take(MAX_LINE_CHARS) + "…" else it }
                    TextLoad.Ready(read.text, lines, blocks, read.truncated)
                }
            }
        }.getOrElse { TextLoad.Failed }
    }
    val title = request.fileName.ifBlank { stringResource(R.string.viewer_doc_default_name) }
    val sourceLabel = stringResource(if (showSource) R.string.viewer_text_show_rendered else R.string.viewer_text_show_source)
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
                    val ready = load as? TextLoad.Ready
                    if (ready != null && isMarkdown) {
                        BarButton(if (showSource) MeeshyIcons.Document else MeeshyIcons.Code, sourceLabel, accent) { showSource = !showSource }
                    }
                    if (ready != null) CopyTextButton(ready.text, accent)
                },
            )
            Crossfade(targetState = load, label = "text-document") { state ->
                when (state) {
                    TextLoad.Loading -> Column(
                        Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterVertically),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        CircularProgressIndicator(color = accent, strokeWidth = 2.dp)
                        Text(stringResource(R.string.viewer_code_loading), color = MeeshyTheme.tokens.textSecondary)
                    }
                    TextLoad.Failed -> Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(stringResource(R.string.viewer_load_error), color = MeeshyTheme.tokens.textSecondary)
                    }
                    is TextLoad.Ready -> TextBody(state, renderMarkdown = isMarkdown && !showSource, accent = accent)
                }
            }
        }
    }
}

@Composable
private fun CopyTextButton(text: String, accent: Color) {
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    val label = stringResource(R.string.viewer_copy)
    val copied = stringResource(R.string.viewer_copied)
    BarButton(MeeshyIcons.Copy, label, accent) {
        val ok = runCatching {
            (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(label, text))
        }.isSuccess
        if (ok) haptics.success() else haptics.error()
        Toast.makeText(context, if (ok) copied else context.getString(R.string.viewer_load_error), Toast.LENGTH_SHORT).show()
    }
}

@Composable
private fun TextBody(state: TextLoad.Ready, renderMarkdown: Boolean, accent: Color) {
    Column(Modifier.fillMaxSize()) {
        if (state.truncated) {
            Text(
                stringResource(R.string.viewer_code_truncated),
                color = MeeshyTheme.tokens.textSecondary,
                fontSize = MeeshyFontSize.footnote,
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            )
        }
        if (renderMarkdown) MarkdownList(state.blocks, accent) else PlainLines(state.lines)
    }
}

@Composable
private fun PlainLines(lines: List<String>) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)) {
        itemsIndexed(lines, key = { index, _ -> index }) { _, line ->
            Text(
                line.ifEmpty { " " },
                color = MeeshyTheme.tokens.textPrimary,
                fontSize = MeeshyFontSize.body,
                fontFamily = FontFamily.Monospace,
            )
        }
    }
}

@Composable
private fun MarkdownList(blocks: List<MarkdownBlock>, accent: Color) {
    val codeBackground = MeeshyTheme.tokens.backgroundSecondary
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        itemsIndexed(blocks, key = { index, _ -> index }) { _, block ->
            MarkdownBlockView(block, accent, codeBackground)
        }
    }
}

@Composable
private fun MarkdownBlockView(block: MarkdownBlock, accent: Color, codeBackground: Color) {
    val primary = MeeshyTheme.tokens.textPrimary
    val secondary = MeeshyTheme.tokens.textSecondary
    when (block) {
        is MarkdownBlock.Heading -> Text(
            styled(block.spans, codeBackground),
            color = primary,
            fontSize = when (block.level) { 1 -> 26.sp; 2 -> 22.sp; 3 -> 19.sp; else -> 17.sp },
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = MeeshySpacing.sm),
        )
        is MarkdownBlock.Paragraph -> Text(styled(block.spans, codeBackground), color = primary, fontSize = MeeshyFontSize.body)
        is MarkdownBlock.ListItem -> Text(
            buildAnnotatedString {
                append(if (block.number != null) "${block.number}. " else "• ")
                append(styled(block.spans, codeBackground))
            },
            color = primary,
            fontSize = MeeshyFontSize.body,
            modifier = Modifier.padding(start = (block.depth * 16).dp),
        )
        is MarkdownBlock.Quote -> Text(
            styled(block.spans, codeBackground),
            color = secondary,
            fontSize = MeeshyFontSize.body,
            fontStyle = FontStyle.Italic,
            modifier = Modifier.padding(start = MeeshySpacing.md),
        )
        is MarkdownBlock.CodeBlock -> Text(
            block.text.lines().joinToString("\n") { if (it.length > MAX_LINE_CHARS) it.take(MAX_LINE_CHARS) + "…" else it },
            color = primary,
            fontFamily = FontFamily.Monospace,
            fontSize = MeeshyFontSize.subhead,
            modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xs),
        )
        MarkdownBlock.Rule -> Box(Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xs).height(1.dp).background(accent.copy(alpha = 0.3f)))
    }
}

private fun styled(spans: List<MarkdownSpan>, codeBackground: Color): AnnotatedString = buildAnnotatedString {
    spans.forEach { span ->
        val style = SpanStyle(
            fontWeight = if (span.bold) FontWeight.Bold else null,
            fontStyle = if (span.italic) FontStyle.Italic else null,
            fontFamily = if (span.code) FontFamily.Monospace else null,
            background = if (span.code) codeBackground else Color.Unspecified,
        )
        withStyle(style) { append(span.text) }
    }
}

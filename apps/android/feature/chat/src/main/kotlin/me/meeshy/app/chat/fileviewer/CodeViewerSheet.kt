package me.meeshy.app.chat.fileviewer

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.fileviewer.CodeLanguage
import me.meeshy.sdk.model.fileviewer.CodeToken
import me.meeshy.sdk.model.fileviewer.SyntaxTokenizer
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshySyntaxColors
import me.meeshy.ui.theme.MeeshyTheme

private sealed interface CodeLoad {
    data object Loading : CodeLoad
    data object Failed : CodeLoad
    data class Ready(val lines: List<List<CodeToken>>, val truncated: Boolean, val text: String) : CodeLoad
}

/**
 * La visionneuse de code (miroir de `CodeFullSheet`, iOS) : coloration, numéros de ligne, copie du source entier.
 * La lecture est bornée (512 Kio) et la coloration se calcule hors du fil principal ; un fichier plus gros est coupé
 * et le dit.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CodeViewerSheet(request: FileViewerRequest, language: CodeLanguage, accent: Color, onDismiss: () -> Unit) {
    val context = LocalContext.current
    var load by remember(request.localUri) { mutableStateOf<CodeLoad>(CodeLoad.Loading) }
    LaunchedEffect(request.localUri) {
        load = runCatching {
            val read = FileViewerIo.readText(context, request.localUri.toUri())
            if (read.isBinary) {
                CodeLoad.Failed
            } else {
                val lines = withContext(Dispatchers.Default) { SyntaxTokenizer.tokenize(read.text, language) }
                CodeLoad.Ready(lines, read.truncated, read.text)
            }
        }.getOrElse { CodeLoad.Failed }
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(Modifier.fillMaxSize().navigationBarsPadding()) {
            ViewerBar(
                onClose = onDismiss,
                accent = accent,
                title = { CodeTitle(request.fileName, language) },
                actions = {
                    val ready = load as? CodeLoad.Ready
                    if (ready != null) CopyCodeButton(ready.text, accent)
                },
            )
            when (val state = load) {
                CodeLoad.Loading -> CenteredStatus { CircularProgressIndicator(color = accent, strokeWidth = 2.dp) ; Text(stringResource(R.string.viewer_code_loading), color = MeeshyTheme.tokens.textSecondary) }
                CodeLoad.Failed -> CenteredStatus { Text(stringResource(R.string.viewer_load_error), color = MeeshyTheme.tokens.textSecondary) }
                is CodeLoad.Ready -> CodeLines(state)
            }
        }
    }
}

@Composable
private fun CodeTitle(fileName: String, language: CodeLanguage) {
    val langColor = remember(language) { Color(android.graphics.Color.parseColor("#" + language.colorHex)) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(
            fileName.ifBlank { language.displayName },
            color = MeeshyTheme.tokens.textPrimary,
            fontSize = MeeshyFontSize.label,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            modifier = Modifier.widthIn(max = 220.dp),
        )
        Text(
            language.displayName,
            color = langColor,
            fontSize = MeeshyFontSize.caption,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.clip(CircleShape).background(langColor.copy(alpha = 0.15f)).padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun CopyCodeButton(text: String, accent: Color) {
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
private fun CenteredStatus(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
        content()
    }
}

@Composable
private fun CodeLines(state: CodeLoad.Ready) {
    val colors = rememberSyntaxColors()
    val gutter = remember(state.lines.size) { (state.lines.size.toString().length * 9 + 16).coerceAtLeast(30).dp }
    val listState = rememberLazyListState()
    Column(Modifier.fillMaxSize()) {
        if (state.truncated) {
            Text(
                stringResource(R.string.viewer_code_truncated),
                color = MeeshyTheme.tokens.textSecondary,
                fontSize = MeeshyFontSize.footnote,
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            )
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().background(colors.background).horizontalScroll(rememberScrollState()),
        ) {
            itemsIndexed(state.lines, key = { index, _ -> index }) { index, tokens ->
                val styled = remember(tokens, colors) { styledLine(tokens, colors) }
                Row(Modifier.padding(horizontal = MeeshySpacing.sm)) {
                    Text(
                        (index + 1).toString(),
                        color = colors.lineNumber,
                        fontFamily = FontFamily.Monospace,
                        fontSize = MeeshyFontSize.small,
                        modifier = Modifier.widthIn(min = gutter).clearAndSetSemantics {},
                    )
                    Text(styled, fontFamily = FontFamily.Monospace, fontSize = MeeshyFontSize.subhead, softWrap = false, color = colors.plain)
                }
            }
        }
    }
}

private fun styledLine(tokens: List<CodeToken>, colors: MeeshySyntaxColors): AnnotatedString = buildAnnotatedString {
    tokens.forEach { token ->
        val color = colors.of(token.kind)
        if (color == colors.plain) append(token.text) else withStyle(SpanStyle(color = color)) { append(token.text) }
    }
}

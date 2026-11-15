package me.meeshy.ui.component.document

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.fileviewer.CodeLanguage
import me.meeshy.sdk.model.media.SyntaxHighlighter
import me.meeshy.sdk.model.media.SyntaxTheme
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.R

/** Où en est la lecture du fichier de code joint. */
@Immutable
public sealed interface CodeContent {
    public data object Loading : CodeContent
    public data object Failed : CodeContent
    public data class Ready(val text: String) : CodeContent
}

public const val CODE_CARD_PREVIEW_LINES: Int = 10

/** La pastille d'un langage : sa couleur de marque (`CodeLanguage.colorHex`). */
internal fun codeLanguageColor(language: CodeLanguage): Color = Color(0xFF000000L or language.colorHex.toLong(16))

/**
 * La carte d'un fichier de code dans une bulle (miroir de `codePreviewCard`, iOS) : nom ou langage, pastille du
 * langage, taille, les [CODE_CARD_PREVIEW_LINES] premières lignes numérotées et colorées, puis « N lignes de plus ».
 * Un toucher ouvre la fiche plein écran.
 */
@Composable
public fun CodeViewerCard(
    fileName: String,
    language: CodeLanguage,
    sizeLabel: String?,
    content: CodeContent,
    isDark: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    cornerRadius: androidx.compose.ui.unit.Dp = 12.dp,
) {
    val theme = remember(isDark) { SyntaxTheme.github(isDark) }
    val shape = RoundedCornerShape(cornerRadius)
    val hairline = if (isDark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.08f)
    Column(
        modifier
            .clip(shape)
            .background(syntaxColor(theme.background))
            .border(0.5.dp, hairline, shape)
            .clickable(onClick = onClick),
    ) {
        CodeCardHeader(fileName, language, sizeLabel, theme)
        Box(Modifier.fillMaxWidth().height(1.dp).background(syntaxColor(theme.lineNumberBorder)))
        when (content) {
            CodeContent.Loading -> CodeCardStatus(stringResource(R.string.code_viewer_loading), theme, loading = true)
            CodeContent.Failed -> CodeCardStatus(stringResource(R.string.code_viewer_load_error), theme, loading = false)
            is CodeContent.Ready -> CodeCardPreview(content.text, language, theme)
        }
    }
}

@Composable
private fun CodeCardHeader(fileName: String, language: CodeLanguage, sizeLabel: String?, theme: SyntaxTheme) {
    val langColor = codeLanguageColor(language)
    Row(
        Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = 8.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            MeeshyIcons.Code,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.clip(RoundedCornerShape(5.dp)).background(langColor).padding(4.dp).size(14.dp),
        )
        Text(
            fileName.ifBlank { language.displayName },
            color = syntaxColor(theme.plain),
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            language.displayName,
            color = langColor,
            fontSize = 9.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.clip(CircleShape).background(langColor.copy(alpha = 0.15f)).padding(horizontal = 6.dp, vertical = 2.dp),
        )
        if (sizeLabel != null) {
            Text(sizeLabel, color = syntaxColor(theme.comment), fontSize = 9.sp, fontWeight = FontWeight.Medium, maxLines = 1)
        }
    }
}

@Composable
private fun CodeCardStatus(label: String, theme: SyntaxTheme, loading: Boolean) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = if (loading) 60.dp else 40.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 1.5.dp, color = syntaxColor(theme.comment))
        Text(label, color = syntaxColor(theme.comment), fontSize = 10.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = if (loading) 6.dp else 0.dp))
    }
}

@Composable
private fun CodeCardPreview(text: String, language: CodeLanguage, theme: SyntaxTheme) {
    val head = remember(text, language, theme) {
        SyntaxHighlighter.tokenize(codeHead(text, CODE_CARD_PREVIEW_LINES), language).take(CODE_CARD_PREVIEW_LINES).map { highlightedLine(it, theme) }
    }
    val total = remember(text) { codeLineCount(text) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
        head.forEachIndexed { index, line ->
            Row(Modifier.testTag("code-card-line-$index"), verticalAlignment = Alignment.Top) {
                Text(
                    (index + 1).toString(),
                    color = syntaxColor(theme.lineNumber),
                    fontFamily = FontFamily.Monospace,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.End,
                    modifier = Modifier.width(24.dp).clearAndSetSemantics {},
                )
                Text(
                    line,
                    color = syntaxColor(theme.plain),
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.sp,
                    maxLines = 1,
                    softWrap = false,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
        if (total > CODE_CARD_PREVIEW_LINES) {
            Text(
                stringResource(R.string.code_viewer_more_lines, total - CODE_CARD_PREVIEW_LINES),
                color = syntaxColor(theme.comment),
                fontSize = 9.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(top = 4.dp).testTag("code-card-more"),
            )
        }
    }
}

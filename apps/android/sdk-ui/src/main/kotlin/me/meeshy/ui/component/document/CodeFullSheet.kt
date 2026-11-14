package me.meeshy.ui.component.document

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.selection.DisableSelection
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.fileviewer.CodeLanguage
import me.meeshy.sdk.model.media.SyntaxHighlighter
import me.meeshy.sdk.model.media.SyntaxTheme
import me.meeshy.ui.R
import me.meeshy.ui.component.viewer.FullScreenDialogWindow
import me.meeshy.ui.component.viewer.ViewerDialog
import me.meeshy.ui.component.viewer.viewerDialogProperties
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons

/**
 * La fiche plein écran d'un fichier de code (miroir de `CodeFullSheet`, iOS) : en-tête nom + langage, chargement ou
 * échec, puis le source coloré dans une gouttière de numéros de ligne, défilant dans les deux sens, texte
 * sélectionnable et copiable (haptique de succès).
 *
 * [exitAllowed] est le portillon de sortie de l'hôte : fermé (contenu protégé : vue unique, flou, éphémère), il retire
 * le bouton de copie ET la sélection de texte, et la fenêtre porte `FLAG_SECURE` ([protectedContent]).
 */
@Composable
public fun CodeFullSheet(
    fileName: String,
    language: CodeLanguage,
    content: CodeContent,
    accent: Color,
    isDark: Boolean,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    exitAllowed: Boolean = true,
    protectedContent: Boolean = !exitAllowed,
    onCopied: () -> Unit = {},
) {
    val theme = remember(isDark) { SyntaxTheme.github(isDark) }
    val clipboard = LocalClipboardManager.current
    ViewerDialog(onDismissRequest = onDismiss, properties = viewerDialogProperties(secure = protectedContent)) {
        FullScreenDialogWindow()
        Column(modifier.fillMaxSize().background(syntaxColor(theme.background)).statusBarsPadding().navigationBarsPadding()) {
            CodeSheetBar(fileName, language, content, accent, theme, exitAllowed, clipboard, onDismiss, onCopied)
            when (content) {
                CodeContent.Loading -> CodeSheetStatus(fileName, language, stringResource(R.string.code_viewer_loading_file), theme)
                CodeContent.Failed -> CodeSheetStatus(fileName, language, stringResource(R.string.code_viewer_load_error), theme)
                is CodeContent.Ready -> CodeSheetLines(content.text, language, theme, selectable = exitAllowed)
            }
        }
    }
}

@Composable
private fun CodeSheetBar(
    fileName: String,
    language: CodeLanguage,
    content: CodeContent,
    accent: Color,
    theme: SyntaxTheme,
    exitAllowed: Boolean,
    clipboard: ClipboardManager,
    onDismiss: () -> Unit,
    onCopied: () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    val langColor = codeLanguageColor(language)
    Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        BarIcon(MeeshyIcons.Close, stringResource(R.string.common_close), accent, onDismiss)
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
            Text(
                fileName.ifBlank { language.displayName },
                color = syntaxColor(theme.plain),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 220.dp),
            )
            Text(
                language.displayName,
                color = langColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.clip(CircleShape).background(langColor.copy(alpha = 0.15f)).padding(horizontal = 5.dp, vertical = 2.dp),
            )
        }
        if (content is CodeContent.Ready && exitAllowed) {
            BarIcon(MeeshyIcons.Copy, stringResource(R.string.code_viewer_copy), accent) {
                clipboard.setText(AnnotatedString(content.text))
                haptics.success()
                onCopied()
            }
        } else {
            Box(Modifier.size(48.dp))
        }
    }
}

@Composable
private fun BarIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, tint: Color, onClick: () -> Unit) {
    Box(Modifier.size(48.dp).clip(CircleShape).clickable(onClick = onClick).testTag(description), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = description, tint = tint)
    }
}

@Composable
private fun CodeSheetStatus(fileName: String, language: CodeLanguage, label: String, theme: SyntaxTheme) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(MeeshyIcons.Code, contentDescription = null, tint = codeLanguageColor(language), modifier = Modifier.size(48.dp))
        Text(fileName.ifBlank { language.displayName }, color = syntaxColor(theme.plain), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Text(label, color = syntaxColor(theme.comment), fontSize = 14.sp, modifier = Modifier.testTag("code-sheet-status"))
    }
}

@Composable
private fun CodeSheetLines(text: String, language: CodeLanguage, theme: SyntaxTheme, selectable: Boolean) {
    val lines = remember(text, language, theme) { SyntaxHighlighter.tokenize(text, language).map { highlightedLine(it, theme) } }
    val gutter = remember(lines.size) { maxOf(30, lines.size.toString().length * 9 + 16).dp }
    val body: @Composable () -> Unit = {
        Box(Modifier.fillMaxSize().horizontalScroll(rememberScrollState())) {
            LazyColumn(Modifier.fillMaxHeight().padding(vertical = 12.dp)) {
                itemsIndexed(lines, key = { index, _ -> index }) { index, line ->
                    Row(Modifier.height(IntrinsicSize.Min).padding(horizontal = 8.dp, vertical = 1.dp).testTag("code-sheet-line-$index")) {
                        DisableSelection {
                            Text(
                                (index + 1).toString(),
                                color = syntaxColor(theme.lineNumber),
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                textAlign = TextAlign.End,
                                modifier = Modifier.width(gutter).padding(end = 10.dp).clearAndSetSemantics {},
                            )
                            Box(Modifier.width(1.dp).fillMaxHeight().background(syntaxColor(theme.lineNumberBorder)))
                        }
                        Text(
                            line,
                            color = syntaxColor(theme.plain),
                            fontFamily = FontFamily.Monospace,
                            fontSize = 13.sp,
                            softWrap = false,
                            modifier = Modifier.padding(start = 12.dp),
                        )
                    }
                }
            }
        }
    }
    if (selectable) SelectionContainer { body() } else body()
}

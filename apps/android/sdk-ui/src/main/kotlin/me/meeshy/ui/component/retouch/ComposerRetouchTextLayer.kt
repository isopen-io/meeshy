package me.meeshy.ui.component.retouch

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import me.meeshy.sdk.model.StoryTextStyle
import me.meeshy.sdk.model.composer.look.ComposerRetouchTextBoard
import me.meeshy.sdk.model.imageedit.CropRect
import me.meeshy.ui.R
import me.meeshy.ui.theme.hexColor

/**
 * **LA PLANCHE DE TEXTE SUR LA SCÈNE** (#12651) — les textes peints à leur place sur l'image affichée
 * ([display]) par le peintre qui les cuit ([RetouchTextPainter]) ; [interactive], toucher un texte le
 * rouvre, le glisser le déplace, pincer ou tourner le règle, toucher la scène vide en pose un. Le texte en
 * saisie s'écrit dans un champ posé à sa place.
 */
@Composable
internal fun RetouchTextLayer(
    board: ComposerRetouchTextBoard,
    display: CropRect,
    interactive: Boolean,
    newId: () -> String,
    onBoard: (ComposerRetouchTextBoard) -> Unit,
) {
    val current = rememberUpdatedState(board)
    val visible = board.texts.filter { it.id != board.typingId }
    Box(Modifier.fillMaxSize()) {
        Canvas(Modifier.fillMaxSize()) {
            if (display.width < 1f || display.height < 1f) return@Canvas
            drawIntoCanvas { canvas ->
                canvas.nativeCanvas.save()
                canvas.nativeCanvas.translate(display.left, display.top)
                RetouchTextPainter.paint(canvas.nativeCanvas, visible, display.width, display.height)
                canvas.nativeCanvas.restore()
            }
        }
        if (interactive) {
            Box(
                Modifier
                    .fillMaxSize()
                    .pointerInput(display) {
                        detectTapGestures { tap ->
                            val hit = hitText(current.value, display, tap.x, tap.y)
                            onBoard(if (hit != null) current.value.tapping(hit) else current.value.tappingBackground(newId()))
                        }
                    }
                    .pointerInput(display) {
                        detectTransformGestures { centroid, pan, zoom, rotation ->
                            val hit = hitText(current.value, display, centroid.x, centroid.y) ?: return@detectTransformGestures
                            onBoard(
                                current.value
                                    .moving(hit, pan.x.toDouble() / display.width, pan.y.toDouble() / display.height)
                                    .transforming(hit, zoom.toDouble(), rotation.toDouble()),
                            )
                        }
                    },
            )
        }
        board.typing?.let { typing -> TypingField(typing.id, typing.text, typing.textColor, display, typing.x, typing.y, current, onBoard) }
    }
}

@Composable
private fun TypingField(
    id: String,
    text: String,
    color: String?,
    display: CropRect,
    x: Double,
    y: Double,
    board: androidx.compose.runtime.State<ComposerRetouchTextBoard>,
    onBoard: (ComposerRetouchTextBoard) -> Unit,
) {
    val focus = remember(id) { FocusRequester() }
    val density = LocalDensity.current
    val fieldWidth = with(density) { (display.width * 0.86f).toDp() }
    val offset = IntOffset((display.left + display.width * 0.07f).roundToInt(), (display.top + display.height * y.toFloat()).roundToInt() - with(density) { 24.dp.roundToPx() })
    LaunchedEffect(id) { runCatching { focus.requestFocus() } }
    BasicTextField(
        value = text,
        onValueChange = { onBoard(board.value.writing(id, it)) },
        textStyle = TextStyle(color = hexColor(color ?: "#FFFFFF", Color.White), fontSize = 28.sp, textAlign = TextAlign.Center),
        cursorBrush = SolidColor(Color.White),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onBoard(board.value.endingTyping()) }),
        modifier = Modifier.offset { offset }.width(fieldWidth).focusRequester(focus),
    )
}

private fun hitText(board: ComposerRetouchTextBoard, display: CropRect, x: Float, y: Float): String? =
    board.written.sortedByDescending { it.zIndex }.firstOrNull { text ->
        RetouchTextPainter.bounds(text, display.width, display.height).apply { inset(-24f, -24f) }.contains(x - display.left, y - display.top)
    }?.id

/** Les outils de texte du composer : le style, la couleur et l'alignement du texte en saisie, et « Ajouter un texte ». */
@Composable
internal fun RetouchTextToolbar(board: ComposerRetouchTextBoard, newId: () -> String, onBoard: (ComposerRetouchTextBoard) -> Unit) {
    val typing = board.typing
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        if (typing != null) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StoryTextStyle.entries.forEach { style ->
                    Chip(stringResource(styleName(style)), typing.textStyle == style.name.lowercase()) { onBoard(board.styling(typing.id, style)) }
                }
                ComposerRetouchTextBoard.ALIGNMENTS.forEach { align ->
                    Chip(stringResource(alignName(align)), (typing.textAlign ?: ComposerRetouchTextBoard.DEFAULT_ALIGN) == align) { onBoard(board.aligning(typing.id, align)) }
                }
            }
            val colorLabel = stringResource(R.string.retouch_text_color)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                ComposerRetouchTextBoard.PALETTE.forEach { hex ->
                    val chosen = (typing.textColor ?: ComposerRetouchTextBoard.DEFAULT_COLOR).equals(hex, ignoreCase = true)
                    Box(
                        Modifier
                            .size(48.dp)
                            .clickable(role = Role.Button) { onBoard(board.coloring(typing.id, hex)) }
                            .semantics {
                                contentDescription = "$colorLabel $hex"
                                selected = chosen
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(hexColor(hex, Color.White)).border(if (chosen) 3.dp else 1.dp, Color.White, CircleShape))
                    }
                }
            }
        } else if (board.texts.size < ComposerRetouchTextBoard.CAP) {
            Chip(stringResource(R.string.retouch_text_add), chosen = false, modifier = Modifier.padding(horizontal = 12.dp)) { onBoard(board.addingText(newId())) }
        }
    }
}

@Composable
private fun Chip(label: String, chosen: Boolean, modifier: Modifier = Modifier, onTap: () -> Unit) {
    Box(
        modifier
            .sizeIn(minWidth = 56.dp, minHeight = 48.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(if (chosen) Color.White else Color.White.copy(alpha = 0.14f))
            .clickable(role = Role.Button, onClick = onTap)
            .semantics {
                selected = chosen
                role = Role.Button
            }
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (chosen) Color.Black else Color.White, style = MaterialTheme.typography.labelLarge)
    }
}

private fun styleName(style: StoryTextStyle): Int = when (style) {
    StoryTextStyle.CLASSIC -> R.string.retouch_text_style_classic
    StoryTextStyle.BOLD -> R.string.retouch_text_style_bold
    StoryTextStyle.NEON -> R.string.retouch_text_style_neon
    StoryTextStyle.TYPEWRITER -> R.string.retouch_text_style_typewriter
    StoryTextStyle.HANDWRITING -> R.string.retouch_text_style_handwriting
}

private fun alignName(align: String): Int = when (align) {
    "left" -> R.string.retouch_text_align_left
    "right" -> R.string.retouch_text_align_right
    else -> R.string.retouch_text_align_center
}

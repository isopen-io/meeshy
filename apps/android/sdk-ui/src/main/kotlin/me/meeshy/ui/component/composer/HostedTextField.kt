package me.meeshy.ui.component.composer

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import me.meeshy.sdk.model.composer.ComposerTextSelection

/**
 * L'état d'édition du texte du document tel que l'hôte le porte : [initial] se lit UNE fois, au montage du champ
 * (le curseur laissé par la surface précédente), et [onChange] rapporte chaque déplacement. Le champ ne lit rien d'autre.
 */
@Immutable
public class HostedSelection(
    public val initial: () -> ComposerTextSelection,
    public val onChange: (ComposerTextSelection) -> Unit,
)

/** Hors de l'hôte (route autonome, feuille), aucune sélection n'est portée : le curseur s'ouvre en fin de texte. */
public val LocalHostedSelection: ProvidableCompositionLocal<HostedSelection?> = staticCompositionLocalOf { null }

/** Ce qu'un champ de texte du document reçoit : la valeur à montrer et le rapport des frappes. */
public class HostedTextField internal constructor(
    public val value: TextFieldValue,
    public val onValueChange: (TextFieldValue) -> Unit,
)

/**
 * Le champ d'un texte `String` qui garde son curseur : la valeur montrée est celle que l'auteur a tapée tant qu'elle
 * dit encore [text] (la composition de l'IME survit), sinon [text] avec la sélection VOULUE, rognée à sa longueur — un
 * texte posé après le montage (graine) ne perd donc pas le curseur laissé par l'autre surface. Seul le texte changé
 * remonte par [onText] ; la sélection remonte à l'hôte.
 */
@Composable
public fun rememberHostedTextField(text: String, onText: (String) -> Unit): HostedTextField {
    val hosted = LocalHostedSelection.current
    var wanted by remember { mutableStateOf(hosted?.initial?.invoke() ?: ComposerTextSelection.AT_END) }
    var typed by remember { mutableStateOf<TextFieldValue?>(null) }
    val shown = typed?.takeIf { it.text == text } ?: run {
        val range = wanted.shownIn(text.length)
        TextFieldValue(text, TextRange(range.start, range.end))
    }
    return HostedTextField(shown) { next ->
        typed = next
        val selection = ComposerTextSelection(next.selection.start, next.selection.end)
        if (selection != wanted) {
            wanted = selection
            hosted?.onChange(selection)
        }
        if (next.text != text) onText(next.text)
    }
}

package me.meeshy.app.chat

import androidx.compose.runtime.Stable
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import me.meeshy.sdk.model.composer.ComposerReturnKey

/**
 * La touche Retour du champ du composeur (iOS `ComposerReturnKey` + `HardwareReturnModifiers`).
 *
 * Clavier matériel : Entrée envoie, Maj+Entrée (ou Alt+Entrée) insère un saut de ligne — le saut de
 * ligne qui en résulte arrive ensuite par la frappe et ne doit pas être pris pour un Retour du clavier
 * logiciel ([pendingLiteralNewline]). Clavier logiciel : un texte de 7 mots ou moins qui grandit d'EXACTEMENT
 * un caractère finissant par un saut de ligne envoie (jamais un collage multi-lignes).
 */
@Stable
internal class ComposerReturnKeyHandler {

    private var pendingLiteralNewline = false

    /** À poser sur le champ : Entrée envoie via [onSend], Maj/Alt+Entrée laisse le saut de ligne se taper. */
    fun hardwareKeys(onSend: () -> Unit): Modifier = Modifier.onPreviewKeyEvent { event ->
        if (event.key != Key.Enter && event.key != Key.NumPadEnter) return@onPreviewKeyEvent false
        val literal = ComposerReturnKey.isLiteralNewline(shift = event.isShiftPressed, alt = event.isAltPressed)
        when {
            literal -> {
                if (event.type == KeyEventType.KeyDown) pendingLiteralNewline = true
                false
            }
            event.type == KeyEventType.KeyDown -> {
                onSend()
                true
            }
            else -> true
        }
    }

    /**
     * Le texte à garder pour [typed], et si Retour vient d'envoyer. [previous] est le champ AVANT la frappe.
     * Le saut de ligne final est retiré ici, au site unique de la règle.
     */
    fun resolve(previous: TextFieldValue, typed: TextFieldValue): Resolution {
        val literal = pendingLiteralNewline && typed.text != previous.text
        if (literal) pendingLiteralNewline = false
        val sends = !literal &&
            ComposerReturnKey.imeSends(previous.text) &&
            ComposerReturnKey.submits(previous.text, typed.text)
        if (!sends) return Resolution(typed, sends = false)
        val stripped = ComposerReturnKey.stripped(typed.text)
        return Resolution(TextFieldValue(stripped, TextRange(stripped.length)), sends = true)
    }

    internal data class Resolution(val value: TextFieldValue, val sends: Boolean)
}

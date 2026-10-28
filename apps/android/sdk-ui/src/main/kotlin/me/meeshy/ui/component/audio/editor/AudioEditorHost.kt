package me.meeshy.ui.component.audio.editor

import androidx.compose.runtime.staticCompositionLocalOf
import java.io.File
import me.meeshy.sdk.audioedit.AudioEditResult

/**
 * La porte d'entrée de l'éditeur audio plein écran pour tout écran qui a un enregistrement à couper (plateau du
 * fil, composeur des stories, enregistreur) — comme `LocalVoiceRecordingHost` pour le micro. L'application
 * dessine l'éditeur au-dessus de tout l'arbre ; l'appelant ne fait qu'ouvrir et recevoir.
 *
 * [onConfirm] reçoit le fichier cuit (le rognage vaut 0 → durée finale) ; [onCancel] est appelé à toute
 * sortie sans fichier. Un seul éditeur à la fois : une seconde ouverture reçoit tout de suite [onCancel].
 */
interface AudioEditorHost {
    fun open(source: File, onConfirm: (AudioEditResult) -> Unit, onCancel: () -> Unit)
}

/** Sans application hôte (aperçus, tests) : rien ne s'ouvre, l'appelant garde son fichier. */
object NoAudioEditorHost : AudioEditorHost {
    override fun open(source: File, onConfirm: (AudioEditResult) -> Unit, onCancel: () -> Unit) = onCancel()
}

val LocalAudioEditorHost = staticCompositionLocalOf<AudioEditorHost> { NoAudioEditorHost }

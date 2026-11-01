package me.meeshy.ui.component.composer

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import java.io.File
import me.meeshy.sdk.model.composer.ComposerConfiguration
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Ce qu'une surface remet au composeur universel (#14265) : le texte qu'elle garde, son réglage, et ce qu'elle sait
 * recevoir. [onAttachUris] et [onAttachFile] absents ⇒ les portes de pièces se ferment, quel que soit le réglage.
 * [topSlot] porte ce qui se pose au-dessus de la saisie (mentions, réponse, pièces en attente).
 */
@Immutable
public data class UniversalComposerSpec(
    val configuration: ComposerConfiguration,
    val draft: String,
    val placeholder: String,
    val canSend: Boolean,
    val onDraftChange: (String) -> Unit,
    val onSend: () -> Unit,
    val accentColor: Color = MeeshyPalette.Indigo500,
    val languageCode: String = "fr",
    val hasPendingAttachments: Boolean = false,
    val pendingAttachmentCount: Int = 0,
    val focusTrigger: Int = 0,
    val onAttachUris: ((List<Uri>) -> Unit)? = null,
    val onAttachFile: ((file: File, fileName: String, mimeType: String?) -> Unit)? = null,
    val topSlot: (@Composable () -> Unit)? = null,
) {
    /** Le réglage effectif : celui de la surface, sans les portes de pièces si elle ne sait pas les recevoir. */
    val effectiveConfiguration: ComposerConfiguration
        get() = if (onAttachUris == null || onAttachFile == null) configuration.withoutAttachments() else configuration
}

/** Le composeur universel, tel que l'application le fournit : celui des conversations. */
public typealias UniversalComposer = @Composable (spec: UniversalComposerSpec, modifier: Modifier) -> Unit

/**
 * **LE COMPOSEUR UNIVERSEL** (#14265) : celui des conversations, que l'application fournit (aucun module de feature ne
 * dépend d'un autre). Les commentaires le montent en réglage commentaire ; sans fournisseur, rien ne se monte.
 */
public val LocalUniversalComposer = staticCompositionLocalOf<UniversalComposer?> { null }

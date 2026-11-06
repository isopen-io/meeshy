package me.meeshy.ui.component.composer

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import java.io.File
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.composer.ComposerConfiguration
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Ce qu'une surface remet au composeur universel (#14265) : le texte qu'elle garde, son réglage, et ce qu'elle sait
 * recevoir. [onAttachUris] et [onAttachFile] absents ⇒ les portes de pièces se ferment, quel que soit le réglage ;
 * [onPickLanguage] absent ⇒ la pastille de langue, [onQuickEmoji] absent ⇒ les emojis rapides. [foldable] pose le ⌄ du
 * repli (iOS `foldableComment`). [topSlot] porte ce qui se pose au-dessus de la saisie (mentions, réponse, pièces).
 * [effects] + [onToggleEffect] : le flou et les effets que la surface garde et envoie ; [onToggleEffect] absent ⇒ les
 * portes du flou et des effets se ferment (#14385).
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
    val onPickLanguage: ((String) -> Unit)? = null,
    val onQuickEmoji: ((String) -> Unit)? = null,
    val foldable: Boolean = false,
    val effects: MessageEffects = MessageEffects(),
    val onToggleEffect: ((Long) -> Unit)? = null,
    val onClearEffects: () -> Unit = {},
    /** Le lieu choisi au sélecteur du composeur rejoint la surface (#14387) ; absent ⇒ la porte « Lieu » se ferme. */
    val onPickPlace: ((SharedPlace) -> Unit)? = null,
    /** Le lieu qui attend l'envoi, posé en pastille au-dessus de la saisie ; [onRemovePlace] la retire. */
    val pendingPlace: SharedPlace? = null,
    val onRemovePlace: () -> Unit = {},
    /** #14661 — un panneau du composeur (pièces, emojis, effets, caméra, stickers, lieu) ou un vocal est ouvert : l'hôte se retient. */
    val onPanelOpenChange: (Boolean) -> Unit = {},
) {
    /** Le réglage effectif : celui de la surface, sans les portes qu'elle ne sait pas servir. */
    val effectiveConfiguration: ComposerConfiguration
        get() = configuration.servedBy(
            receivesAttachments = onAttachUris != null && onAttachFile != null,
            picksLanguage = onPickLanguage != null,
            sendsQuickEmoji = onQuickEmoji != null,
            appliesEffects = onToggleEffect != null,
            picksPlace = onPickPlace != null,
        )
}

/** Le composeur universel, tel que l'application le fournit : celui des conversations. */
public typealias UniversalComposer = @Composable (spec: UniversalComposerSpec, modifier: Modifier) -> Unit

/**
 * **LE COMPOSEUR UNIVERSEL** (#14265) : celui des conversations, que l'application fournit (aucun module de feature ne
 * dépend d'un autre). Les commentaires le montent en réglage commentaire ; sans fournisseur, rien ne se monte.
 */
public val LocalUniversalComposer = staticCompositionLocalOf<UniversalComposer?> { null }

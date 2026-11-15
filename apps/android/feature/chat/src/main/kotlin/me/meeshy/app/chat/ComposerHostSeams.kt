package me.meeshy.app.chat

import android.net.Uri
import androidx.compose.runtime.Immutable

/**
 * Les couches que l'hôte de la barre peut brancher pour la réutiliser hors du chat (stories,
 * commentaires...). Chaque injection porte un [nonce] : la même valeur injectée deux fois de suite
 * est rejouée deux fois.
 */
@Immutable
internal data class ComposerEmojiInjection(val emoji: String, val nonce: Int)

@Immutable
internal data class ComposerExternalAttachments(val uris: List<Uri>, val nonce: Int)

/** Les rappels d'hôte de la barre : interaction (pause de stories) et présence de contenu. */
internal data class ComposerHostCallbacks(
    val onAnyInteraction: () -> Unit = {},
    val onHasContentChange: (Boolean) -> Unit = {},
)

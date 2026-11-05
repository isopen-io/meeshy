package me.meeshy.ui.component.audio

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.fullscreen.AudioFullscreenOffer

/**
 * **Ce que le plein écran audio demande à l'hôte pour agir sur UN vocal** (iOS `AudioFullscreenActions`) : réagir,
 * répondre sur place, transférer, créer avec ce son. L'écran ignore le message, la conversation et le réseau — l'hôte
 * (la conversation) résout le porteur, juge les gardes de protection et répond par une [AudioFullscreenOffer].
 *
 * Chaque membre a un corps par défaut INERTE : un hôte sans actions (post, réel) n'en pose aucune, et une doublure ne
 * réimplémente que ce qu'elle observe. Une action absente de l'offre n'a pas de bouton — jamais un bouton qui ne fait rien.
 */
@Stable
public interface AudioFullscreenActionPort {

    /** Ce que la pièce de [source] offre, résolu par l'hôte (porteur connu, loi de sortie, clair/chiffré). */
    public fun offer(source: AudioFullscreenSource): AudioFullscreenOffer = AudioFullscreenOffer.None

    /** La rangée rapide de la bande de réactions, classée par usage ; les 15 réactions du catalogue par défaut. */
    public fun quickReactions(): List<String> = EmojiCatalog.defaultQuickReactions

    /** Les émojis que le lecteur a déjà posés sur le message porteur de [source]. */
    public fun ownReactions(source: AudioFullscreenSource): Set<String> = emptySet()

    /** Réagir au MESSAGE qui porte le vocal : optimiste, défait par l'hôte sur un refus. */
    public fun react(source: AudioFullscreenSource, emoji: String) {}

    /** Ouvre la feuille de transfert de la pièce. La lecture continue. */
    public fun forward(source: AudioFullscreenSource) {}

    /** « Créer avec ce média » : ferme et ouvre le composeur avec ce son. */
    public fun compose(source: AudioFullscreenSource) {}

    /**
     * La barre de réponse sur place, ancrée au bas de l'écran : la citation de [source], son brouillon, l'envoi. L'hôte la
     * dessine (il tient le brouillon et l'envoi) ; [onClose] la referme — après l'envoi comme sur la croix.
     */
    @Composable
    public fun ReplyBar(source: AudioFullscreenSource, accent: Color, onClose: () -> Unit) {}
}

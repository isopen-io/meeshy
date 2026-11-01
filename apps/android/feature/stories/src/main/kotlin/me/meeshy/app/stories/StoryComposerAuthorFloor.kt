package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import me.meeshy.sdk.model.StoryBackgroundValue

/** La couleur d'auteur du compositeur, lue sur l'identité du compte ; `null` tant qu'elle n'est pas connue (#14264). */
internal val StoryComposerViewModel.authorAccentHex: String?
    get() = StorySceneFill.authorAccentHex(author.value)

/**
 * Le fond que la scène du compositeur montre quand l'auteur n'en choisit aucun — son dégradé ([StorySceneFill.AuthorGradient]) —
 * sous la forme que la publication écrit (#14244). La publication, l'aperçu et l'export le lisent ici : ce que l'auteur voit est
 * ce que la story et le post portent. Auteur inconnu : aucun fond n'est écrit, chaque lecteur garde le sien.
 */
internal val StoryComposerViewModel.authorFloor: StoryBackgroundValue?
    get() = authorAccentHex?.let(StoryBackgroundValue::authorGradient)

/** [authorAccentHex] observée : la scène et la rangée des diapos se repeignent dès que l'identité arrive. */
@Composable
internal fun StoryComposerViewModel.observedAuthorAccentHex(): String? {
    val user by author.collectAsState()
    return StorySceneFill.authorAccentHex(user)
}

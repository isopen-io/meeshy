package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryBackgroundValue

/**
 * Le fond que la scène du compositeur montre quand l'auteur n'en choisit aucun — son dégradé ([StorySceneFill.AuthorGradient]) —
 * sous la forme que la publication écrit (#14244). La publication, l'aperçu et l'export le lisent ici : ce que l'auteur voit est
 * ce que la story et le post portent.
 */
internal val StoryComposerViewModel.authorFloor: StoryBackgroundValue?
    get() = StoryBackgroundValue.authorGradient(authorAccentHex)

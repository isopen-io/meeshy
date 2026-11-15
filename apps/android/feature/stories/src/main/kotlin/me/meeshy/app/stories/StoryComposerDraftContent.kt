package me.meeshy.app.stories

/**
 * Le brouillon a-t-il quelque chose qu'on regretterait de perdre en fermant (#13838) — un mot, un média (même en cours
 * d'envoi), un objet posé, un trait, un son, un fond, une diapo de plus ? Un cadrage ou un filtre seuls sur une scène vide
 * ne sont pas un brouillon : la croix les ferme sans question.
 */
internal val StoryComposerUiState.hasDraftContent: Boolean
    get() = pendingUploads.isNotEmpty() || deck.size > 1 || deck.hasText || deck.hasMedia ||
        deck.slides.any {
            it.elements.isNotEmpty() || it.stickers.isNotEmpty() || it.strokes.isNotEmpty() || it.audio.isNotEmpty() ||
                it.background != null || it.backgroundMediaId != null
        }

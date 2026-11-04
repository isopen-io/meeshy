package me.meeshy.sdk.model.composer

/** Ce que la porte vise : la publication entière, une slide, un objet de la scène, ou la scène elle-même. */
enum class ComposerRailLevel {
    PUBLICATION, SLIDE, OBJECT, SCENE;

    /** Ce que la porte fait naître se VOIT-il sur la scène ? C'est cette question seule qui range la porte à gauche. */
    val appearsOnCanvas: Boolean get() = this == OBJECT || this == SCENE
}

/**
 * Les portes du plateau (iOS `ComposerRailDoor`). Le niveau décide du côté : à GAUCHE ce qu'on POSE sur
 * la scène, sur la LIGNE CANONIQUE du bas ce qui appartient à l'envoi ou à la slide — jamais sur la scène
 * (apps/ios/CLAUDE.md §§ 1-2).
 */
enum class ComposerRailDoor {
    DESCRIPTION, CONTENT, MEDIA, SOUND, STICKER, MENTION, PLACE, DRAWING, TEXT, HASHTAG, BACKGROUND;

    fun level(format: ComposerFormat): ComposerRailLevel = when (this) {
        DESCRIPTION -> ComposerRailLevel.SLIDE
        CONTENT -> ComposerRailLevel.PUBLICATION
        TEXT, MEDIA, SOUND, STICKER -> ComposerRailLevel.OBJECT
        MENTION, PLACE, HASHTAG -> if (format == ComposerFormat.STORY) ComposerRailLevel.OBJECT else ComposerRailLevel.PUBLICATION
        DRAWING, BACKGROUND -> ComposerRailLevel.SCENE
    }

    /** Les portes d'ÉCRITURE gardent le clavier levé : elles ouvrent un champ, pas un sélecteur (iOS `keepsKeyboard`). */
    val keepsKeyboard: Boolean get() = this in writingDoors

    companion object {
        val writingDoors: Set<ComposerRailDoor> = setOf(DESCRIPTION, CONTENT)

        val canonicalRail: List<ComposerRailDoor> =
            listOf(CONTENT, MEDIA, SOUND, TEXT, BACKGROUND, DRAWING, STICKER, MENTION, HASHTAG, PLACE)

        private val removedFromStatus = setOf(PLACE, TEXT)

        /**
         * Ce que le rail MONTRE (iOS `ComposerRailDoor.offered`) : une porte non servie est ABSENTE, jamais grisée ;
         * la story n'a pas de descriptif de slide, seuls le post et le réel ont un corps de texte, et un format sans
         * scène (l'humeur) n'a aucune porte de ce qui apparaît sur la toile ni de lieu ni de texte.
         * [allowsCapture] ne gouverne PAS la porte Média : il retire la CAMÉRA du sélecteur en aval, pas la porte
         * (la photothèque et les fichiers restent un droit de l'auteur).
         */
        @Suppress("UNUSED_PARAMETER")
        fun offered(served: Set<ComposerRailDoor>, format: ComposerFormat, allowsCapture: Boolean): List<ComposerRailDoor> {
            val sceneExists = format != ComposerFormat.STATUS
            return canonicalRail.filter { door ->
                door in served && door !in removedFrom(format) &&
                    (sceneExists || (!door.level(format).appearsOnCanvas && door !in removedFromStatus))
            }
        }

        private fun removedFrom(format: ComposerFormat): Set<ComposerRailDoor> = buildSet {
            if (format == ComposerFormat.STORY) add(DESCRIPTION)
            if (!ComposerFormatVariant.of(format).writesPostText) add(CONTENT)
        }
    }
}


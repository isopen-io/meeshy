package me.meeshy.sdk.model.composer

/**
 * Where a door stands on the plateau (iOS `ComposerSceneFloatingRail.sideRow` / `lowRow`): the LEADING column for what
 * appears on the canvas, the CANONICAL line at the bottom for what belongs to the publication or the slide. The
 * trailing column is not a door side: it carries the object controllers, the history and a new slide.
 */
enum class ComposerRailSide { LEADING, CANONICAL }

/** The publication settings that are not doors of matter. */
enum class PublicationControl { AUDIENCE, LANGUAGE }

/**
 * Where a publication setting is painted (iOS `MeeshyComposerHost+Socle`, `+Pickers`, `ComposerMoodSurface`): the
 * audience in the SOCLE beside Publish — except the mood, whose surface carries its own audience ribbon — and the
 * language at the FOOT of the text it qualifies, never on a rail.
 */
enum class PublicationControlPlace { SOCLE, CONTENT_FOOT, SURFACE }

/**
 * iOS `ComposerSceneFloatingRail`: [leading] is the side row (what appears on the canvas), [canonical] the low row (what
 * belongs to the publication or the slide) — a partition of the offered doors, minus the post body whose door the socle
 * carries ([servesPostText]).
 */
data class ComposerRailPlan(
    val leading: List<ComposerRailDoor>,
    val canonical: List<ComposerRailDoor>,
    val servesPostText: Boolean,
) {
    val all: List<ComposerRailDoor> get() = leading + canonical

    companion object {
        /** The door the socle carries instead of the low row (iOS `ComposerSceneFloatingRail.socleDoor`). */
        val socleDoor: ComposerRailDoor = ComposerRailDoor.CONTENT

        fun side(door: ComposerRailDoor, format: ComposerFormat): ComposerRailSide =
            if (door.level(format).appearsOnCanvas) ComposerRailSide.LEADING else ComposerRailSide.CANONICAL

        /**
         * Port de `ComposerRailDoor.offered` : une porte servie, non retirée du format, et — sans toile (mood) —
         * jamais une porte de ce qui apparaît sur la toile. Le descriptif de slide n'est pas dans le rail canonique :
         * le volet sous la scène est son unique chemin.
         */
        fun of(format: ComposerFormat, served: Set<ComposerRailDoor>): ComposerRailPlan {
            val offered = ComposerRailDoor.offered(served, format, allowsCapture = true)
            return ComposerRailPlan(
                leading = offered.filter { side(it, format) == ComposerRailSide.LEADING },
                canonical = offered.filter { side(it, format) == ComposerRailSide.CANONICAL && it != socleDoor },
                servesPostText = socleDoor in offered,
            )
        }

        fun publicationControls(format: ComposerFormat): Map<PublicationControl, PublicationControlPlace> = when (format) {
            ComposerFormat.STATUS -> mapOf(PublicationControl.AUDIENCE to PublicationControlPlace.SURFACE)
            else -> mapOf(
                PublicationControl.LANGUAGE to PublicationControlPlace.CONTENT_FOOT,
                PublicationControl.AUDIENCE to PublicationControlPlace.SOCLE,
            )
        }
    }
}

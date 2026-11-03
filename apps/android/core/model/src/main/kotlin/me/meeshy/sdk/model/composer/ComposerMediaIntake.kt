package me.meeshy.sdk.model.composer

/** Par quelle porte un média est entré (miroir de `ComposerMediaDoor`, iOS) : la porte porte l'intention, pas le fichier. */
sealed interface ComposerMediaDoor {
    /** La rangée d'outils du DOCUMENT (photothèque, caméra, fichiers) : une diapo EST un média. */
    data object DocumentRow : ComposerMediaDoor

    /** La porte du rail, ouverte SUR la scène : elle ajoute en additif, créer une page est le geste de « + ». */
    data object SceneRail : ComposerMediaDoor

    /** Une SÉRIE choisie d'un coup : chaque média fonde SA scène. */
    data object SceneSeries : ComposerMediaDoor
}

/** Le rôle déclaré à l'entrée doit être celui que le modèle écrira à la sortie (miroir de `ComposerMediaPlacement.role`). */
object ComposerMediaDoorRole {
    fun role(door: ComposerMediaDoor, currentSlideHasBackground: Boolean): ComposerMediaRole = when (door) {
        ComposerMediaDoor.DocumentRow, ComposerMediaDoor.SceneSeries -> ComposerMediaRole.BACKGROUND
        ComposerMediaDoor.SceneRail ->
            if (currentSlideHasBackground) ComposerMediaRole.FOREGROUND else ComposerMediaRole.BACKGROUND
    }
}

/** Quand un choix de la photothèque FONDE des scènes, et quand le composer s'ouvre dessus (miroir de `ComposerScenePicking`). */
object ComposerScenePicking {
    /** Le plafond d'une série : autant de scènes que de médias, au plus [ComposerMediaSeries.MAX]. */
    fun foundsScenes(count: Int, openingPick: Boolean): Boolean = if (openingPick) count >= 1 else count >= 2

    /** La photothèque s'ouvre tout de suite sur un post ou un réel vierge — jamais sur une reprise de contenu. */
    fun opensOnPicker(origin: ComposerOrigin, compositionIsEmpty: Boolean): Boolean =
        compositionIsEmpty && origin is ComposerOrigin.FeedComposer
}

/** Le plafond d'une série de médias et ce que l'auteur en voit. */
object ComposerMediaSeries {
    const val MAX: Int = 10

    /** Les médias retenus d'un choix de [picked], plafonnés à [freeSlides] et à [MAX] ; le reste est dit refusé. */
    fun <T> admit(picked: List<T>, freeSlides: Int): Admission<T> {
        val room = minOf(freeSlides, MAX).coerceAtLeast(0)
        return Admission(picked.take(room), picked.drop(room))
    }

    data class Admission<T>(val kept: List<T>, val refused: List<T>) {
        val hasOverflow: Boolean get() = refused.isNotEmpty()
    }
}

/** Ce qu'une écriture dans la liste média fait de l'intention du rail (miroir de `ComposerRailPosing`). */
enum class ComposerRailPosing {
    /** La liste vient du sélecteur que le rail a ouvert : elle prend l'intention et la fait retomber. */
    CONSUME,
    /** L'écriture vient d'ailleurs : une intention encore armée est périmée. */
    ABANDON,
    /** Le rôle est posé explicitement avant l'écriture : l'intention n'est ni prise ni jetée. */
    ROLE_ALREADY_SET;

    /** L'intention du rail après l'écriture, [armed] étant ce qu'elle valait avant. */
    fun intentAfter(armed: Boolean): Boolean = when (this) {
        CONSUME, ABANDON -> false
        ROLE_ALREADY_SET -> armed
    }
}

/** L'issue d'un chargement en parallèle : un échec ne fait jamais perdre le reste du lot. */
data class ComposerMediaLoadOutcome<T>(val loaded: List<T>, val failedCount: Int) {
    val hasFailure: Boolean get() = failedCount > 0

    companion object {
        fun <T> of(results: List<Result<T>>): ComposerMediaLoadOutcome<T> =
            ComposerMediaLoadOutcome(results.mapNotNull { it.getOrNull() }, results.count { it.isFailure })
    }
}

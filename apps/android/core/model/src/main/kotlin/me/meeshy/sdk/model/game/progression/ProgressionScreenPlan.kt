package me.meeshy.sdk.model.game.progression

/** Pourquoi la dernière lecture n'a pas abouti : la coupure n'est pas une erreur de la passerelle. */
public enum class ProgressionFailure { Offline, Server }

/** Les avis de l'écran : l'état vide, la coupure, l'échec — chacun DIT quoi faire, aucun ne bloque ce qui est peint. */
public sealed interface ProgressionNotice {
    public data object Empty : ProgressionNotice

    /** [hasSnapshot] : un instantané reste affiché ; sinon l'avis dit que la progression viendra à la reconnexion. */
    public data class Offline(val hasSnapshot: Boolean) : ProgressionNotice

    public data object Error : ProgressionNotice
}

/**
 * CE QUE L'ÉCRAN MONTRE, décidé avant de dessiner (iOS `ProgressionView.content`) :
 *  - le squelette seulement à froid — jamais un spinner sur un instantané, même périmé ;
 *  - hors ligne, l'instantané reste affiché avec son avis, jamais un voile ;
 *  - l'état vide quand la charge servie ne compte aucune activité.
 */
public data class ProgressionScreenPlan(val showsSkeleton: Boolean, val notices: List<ProgressionNotice>) {

    public companion object {
        public fun of(
            hasProgress: Boolean,
            progressIsEmpty: Boolean,
            failure: ProgressionFailure?,
            isLoading: Boolean,
        ): ProgressionScreenPlan {
            val failureNotice = when (failure) {
                ProgressionFailure.Offline -> ProgressionNotice.Offline(hasSnapshot = hasProgress)
                ProgressionFailure.Server -> ProgressionNotice.Error
                null -> null
            }
            val emptyNotice = if (hasProgress && progressIsEmpty) ProgressionNotice.Empty else null
            return ProgressionScreenPlan(
                showsSkeleton = !hasProgress && failure == null && isLoading,
                notices = listOfNotNull(failureNotice, emptyNotice),
            )
        }
    }
}

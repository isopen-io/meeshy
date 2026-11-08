package me.meeshy.sdk.model.recording

import me.meeshy.sdk.model.DurationFormat

/** Les sources d'audio alternatives de la feuille, rendues en puces. */
public enum class RecorderSource { FILES, LIBRARY }

/**
 * Les règles de la feuille d'enregistrement partagée par stories, posts et réels (iOS `AudioRecorderSheet`) :
 * puces et fente de contenu n'existent que hors prise, une puce n'existe que si son hôte fournit sa porte,
 * et l'enregistrement n'a aucune limite de durée sauf plafond demandé par l'hôte.
 */
public object AudioRecorderSheetLaw {
    /** Une prise plus courte n'est pas remise à l'hôte. */
    public const val MINIMUM_DELIVERED_SECONDS: Double = 0.5

    public fun sources(isRecording: Boolean, hasFiles: Boolean, hasLibrary: Boolean): List<RecorderSource> =
        if (isRecording) {
            emptyList()
        } else {
            listOfNotNull(
                RecorderSource.FILES.takeIf { hasFiles },
                RecorderSource.LIBRARY.takeIf { hasLibrary },
            )
        }

    public fun showsAccessory(isRecording: Boolean, hasAccessory: Boolean): Boolean = hasAccessory && !isRecording

    public fun delivers(durationSeconds: Double): Boolean = durationSeconds > MINIMUM_DELIVERED_SECONDS

    /** « 0:12 » sans plafond, « 0:12 / 1:00 » avec. */
    public fun elapsedLabel(elapsedSeconds: Double, capSeconds: Double?): String {
        val elapsed = DurationFormat.clock(elapsedSeconds)
        return if (capSeconds == null) elapsed else "$elapsed / ${DurationFormat.clock(capSeconds)}"
    }

    public fun capReached(elapsedSeconds: Double, capSeconds: Double?): Boolean =
        capSeconds != null && elapsedSeconds >= capSeconds
}

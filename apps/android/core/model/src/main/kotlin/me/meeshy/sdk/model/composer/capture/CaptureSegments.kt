package me.meeshy.sdk.model.composer.capture

/** Un segment de prise est un FICHIER déjà écrit : un chemin et une durée, jamais des octets (miroir de `ComposerCaptureSegment`). */
data class CaptureSegment(val id: String, val path: String, val durationSec: Double)

/** Ce que retirer le dernier segment rend : la suite, et le fichier que l'appelant doit supprimer. */
data class DroppedSegment(val kept: List<CaptureSegment>, val orphanPath: String?)

/** La loi des segments (miroir de `ComposerCaptureSegments`) : annuler supprime un fichier, valider concatène sans ré-encoder. */
object CaptureSegments {
    fun totalDuration(segments: List<CaptureSegment>): Double = segments.sumOf { maxOf(0.0, it.durationSec) }

    /** Le chrono compte la prise en cours seulement tant qu'elle tourne : sinon le segment clos serait compté deux fois. */
    fun elapsed(segments: List<CaptureSegment>, live: Double, recording: Boolean): Double =
        totalDuration(segments) + if (recording) maxOf(0.0, live) else 0.0

    fun canValidate(segments: List<CaptureSegment>): Boolean = segments.isNotEmpty()

    fun droppingLast(segments: List<CaptureSegment>): DroppedSegment {
        val last = segments.lastOrNull() ?: return DroppedSegment(segments, null)
        return DroppedSegment(segments.dropLast(1), last.path)
    }

    /** Parts proportionnelles du bandeau ; égales quand la durée totale est nulle plutôt qu'une division par zéro. */
    fun shares(segments: List<CaptureSegment>): List<Double> {
        if (segments.isEmpty()) return emptyList()
        val total = totalDuration(segments)
        if (total <= 0.0) return List(segments.size) { 1.0 / segments.size }
        return segments.map { maxOf(0.0, it.durationSec) / total }
    }

    /** Un segment unique est déjà le fichier final : le concaténer le ré-écrirait pour rien. */
    fun needsMerge(segments: List<CaptureSegment>): Boolean = segments.size > 1

    fun asksBeforeClosing(segments: List<CaptureSegment>): Boolean = segments.isNotEmpty()
}

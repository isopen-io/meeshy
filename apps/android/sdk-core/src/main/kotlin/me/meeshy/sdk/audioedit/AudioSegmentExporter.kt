package me.meeshy.sdk.audioedit

import java.io.File
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.audioedit.AudioEditError
import me.meeshy.sdk.model.audioedit.AudioEditOperation

/**
 * Matérialise un segment rogné — miroir d'`AudioSegmentExporter` (iOS). Un rognage qui ne
 * produit pas de fichier est un contrôle inerte : l'auteur déplace deux poignées et publie
 * la piste entière. Ce module donne un effet aux poignées.
 */
public class AudioSegmentExporter(
    private val engine: AudioEditEngine,
    private val workDirectory: File,
) {

    /**
     * Rend le fichier à publier : [source] telle quelle si aucune borne ne s'écarte de plus
     * que [EDGE_TOLERANCE], sinon un m4a neuf. `null` seulement quand la découpe était
     * nécessaire et a échoué : l'appelant renonce plutôt que de publier la piste entière.
     */
    public suspend fun export(source: File, range: ClosedFloatingPointRange<Double>, fullDuration: Double): File? {
        if (!needsExport(range, fullDuration)) return source
        return try {
            engine.apply(
                AudioEditOperation.Trim(range.start, range.endInclusive),
                source,
                fullDuration,
                workDirectory,
            )
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: AudioEditError) {
            null
        }
    }

    public companion object {
        /** Une poignée posée à la main ne tombe jamais sur la milliseconde. */
        public const val EDGE_TOLERANCE: Double = 0.05

        /** `false` ⇒ servir l'original : ré-encoder sans raison changerait conteneur, débit et durée. */
        public fun needsExport(range: ClosedFloatingPointRange<Double>, fullDuration: Double): Boolean {
            if (fullDuration <= 0.0) return false
            return range.start > EDGE_TOLERANCE || range.endInclusive < fullDuration - EDGE_TOLERANCE
        }
    }
}

package me.meeshy.app.chat

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import me.meeshy.sdk.model.reading.focal.FocalFocusDetailsMotionLaw
import me.meeshy.sdk.model.reading.focal.FocalMagnificationLaw
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective
import me.meeshy.sdk.model.reading.focal.ScrollSpeedMeter

/**
 * Une image du fil vue par la scène : les rangées visibles en repère VISUEL (dp, y vers le bas),
 * la ligne de focus, l'instant et la distance défilée cumulée (dp) dont la vitesse se déduit.
 */
@Immutable
internal data class FocalFrame(
    val nowMs: Double,
    val scrolledDp: Double,
    val cells: List<FocalScrollPerspective.CellGeometry>,
    val focusY: Double,
    /** Largeur de la rangée (dp) : borne la loupe de l'élu. */
    val rowWidth: Double,
    val reduceMotion: Boolean,
    /** Tête de groupe ? — l'identité de l'élu se pose alors sur son propre en-tête. */
    val isFirstInGroup: (String) -> Boolean,
)

/**
 * Le passage que les voisines de l'élu ouvrent autour de son cadre (iOS `poseElectionPassage`) :
 * celles AU-DESSUS remontent de [above], celles AU-DESSOUS descendent de [below] (dp).
 */
@Immutable
internal data class FocalPassage(val anchorId: String, val above: Double, val below: Double)

/**
 * La scène FOCAL du fil — port de `MessageListViewController+FocalScene.swift`. Au repos, Focal
 * est Script. Un défilement du doigt l'active ; elle ne s'ARME qu'au-delà de 1200 dp/s ou après
 * 4 s soutenues (`FocalMagnificationLaw`), sinon le fil défile comme Script. Armée, elle élit le
 * message le plus proche de la ligne de focus (hystérésis 95) ; l'élu ne révèle son cadre que
 * sous 700 dp/s (`FocalFocusDetailsMotionLaw`) et ses voisines s'écartent. À l'arrêt, 4,5 s plus
 * tard, tout s'aplatit (450 ms). La réduction des voisines (loi `poses`) reste écrite et testée
 * mais n'est PAS appliquée (directive iOS 2026-08-24) : seul l'élu se distingue.
 *
 * Les seuls états observés par la peau sont [detailedId], [passage], [contentScale] et
 * [isFlattening] — ils changent à l'élection, jamais à chaque image.
 */
@Stable
internal class FocalSceneState {
    /** Le message qui PORTE le cadre et ses chips. */
    var detailedId: String? by mutableStateOf(null)
        private set
    var passage: FocalPassage? by mutableStateOf(null)
        private set
    var contentScale: Float by mutableStateOf(1f)
        private set
    /** L'aplatissement en cours : les voisines rejoignent leur place en 450 ms ease-in-out. */
    var isFlattening: Boolean by mutableStateOf(false)
        private set

    var isActive: Boolean = false
        private set
    var isArmed: Boolean = false
        private set
    var focusedId: String? = null
        private set
    private var startedAtMs: Double? = null
    private var meter = ScrollSpeedMeter()
    val speed: Double get() = meter.speed

    /** Un tick de défilement du DOIGT (glissé ou son élan) — jamais un saut programmé. */
    fun tick(frame: FocalFrame) {
        meter = meter.note(frame.scrolledDp, frame.nowMs / 1000.0)
        isFlattening = false
        isActive = true
        if (startedAtMs == null) startedAtMs = frame.nowMs
        isArmed = FocalMagnificationLaw.isArmed(
            alreadyArmed = isArmed,
            scrollStartedAt = startedAtMs,
            now = frame.nowMs,
            velocity = meter.speed,
        )
        if (!isArmed) {
            clearElection()
            return
        }
        focusedId = FocalScrollPerspective.focusedId(frame.cells, frame.focusY, focusedId)
        if (detailedId != focusedId && FocalFocusDetailsMotionLaw.revealsDetails(meter.speed)) {
            detailedId = focusedId
        }
        posePassage(frame)
    }

    /** L'élan est tombé : les détails de l'élu se posent (vitesse nulle), l'aplatissement attend. */
    fun settle(frame: FocalFrame?) {
        meter = meter.reset()
        if (!isActive || !isArmed || frame == null) return
        focusedId = FocalScrollPerspective.focusedId(frame.cells, frame.focusY, focusedId)
        detailedId = focusedId
        posePassage(frame)
    }

    /** Retour à Script : la magnificence devra se mériter à nouveau. */
    fun flatten() {
        isFlattening = true
        isActive = false
        isArmed = false
        startedAtMs = null
        meter = meter.reset()
        clearElection()
    }

    private fun clearElection() {
        focusedId = null
        detailedId = null
        passage = null
    }

    private fun posePassage(frame: FocalFrame) {
        val anchorId = detailedId
        val anchor = anchorId?.let { id -> frame.cells.firstOrNull { it.id == id } }
        val scale = FocalScrollPerspective.electedScale(frame.reduceMotion, frame.rowWidth)
        contentScale = scale.toFloat()
        if (anchor == null) {
            // L'élu est sorti de l'écran : on garde le passage tel quel, il défile avec lui.
            if (anchorId == null) passage = null
            return
        }
        val clearance = FocalScrollPerspective.electionClearance(
            isFirstInGroup = frame.isFirstInGroup(anchor.id),
            cellHeight = anchor.height,
            scale = scale,
        )
        val next = FocalPassage(anchor.id, clearance.above, clearance.below)
        if (passage != next) passage = next
    }
}

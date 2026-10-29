package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.call.screenshare.ScreenShareEncodingLaw
import me.meeshy.sdk.model.call.screenshare.VideoDegradation
import kotlin.math.max

/**
 * Ce qu'un émetteur vidéo a le droit de dépenser — miroir de iOS `CallVideoBudget` (`CallDataProfile.swift`) : débit
 * maximal, cadence maximale, réduction de résolution (rapportée à la capture 720p) et ce que l'encodeur sacrifie
 * d'abord sous congestion. L'actionneur pose ces plafonds sur CHAQUE encodage, avec la priorité réseau haute d'iOS.
 */
data class CallVideoBudget(
    val maxBitrateBps: Int,
    val maxFramerate: Int,
    val scaleResolutionDownBy: Double,
    val degradation: VideoDegradation,
) {
    /**
     * Le plus sobre de ce plafond et de [target] sur chaque axe. Une cible qui garde déjà la résolution (le plancher
     * de survie, l'écran) la garde.
     */
    fun capping(target: CallVideoBudget): CallVideoBudget = CallVideoBudget(
        maxBitrateBps = minOf(maxBitrateBps, target.maxBitrateBps),
        maxFramerate = minOf(maxFramerate, target.maxFramerate),
        scaleResolutionDownBy = max(scaleResolutionDownBy, target.scaleResolutionDownBy),
        degradation = if (target.degradation == VideoDegradation.MaintainResolution) VideoDegradation.MaintainResolution else degradation,
    )

    companion object {
        /** Le plafond d'encodage vidéo d'iOS (`QualityThresholds.maxVideoBitrate`). */
        const val MAX_VIDEO_BITRATE_BPS: Int = 2_500_000

        /** La cadence de la capture 720p (iOS `VideoConfig.hd720p30`). */
        const val CAMERA_FRAMERATE: Int = 30

        /** La cadence d'un lien du maillage quand la caméra part vers plusieurs pairs (#11292). */
        const val MESH_FRAMERATE: Int = 20

        /** Le débit sous lequel un lien du maillage ne descend jamais, quel que soit le partage. */
        const val MESH_FLOOR_BITRATE_BPS: Int = 150_000

        /** La cadence du plancher de survie : une image fixe et lisible (iOS `QualityThresholds.survivalFrozenFPS`). */
        const val SURVIVAL_FROZEN_FPS: Int = 2

        /** La caméra au départ, avant tout palier : iOS `applyVideoEncoding()` par défaut, 720p30 à 2,5 Mb/s. */
        val CAMERA = CallVideoBudget(MAX_VIDEO_BITRATE_BPS, CAMERA_FRAMERATE, 1.0, VideoDegradation.MaintainFramerate)

        /**
         * Un écran se LIT (iOS `applyScreenShareEncoding`, #13735) : sous congestion il perd des images plutôt que de la
         * netteté — 15 i/s, la résolution gardée. Sur un lien du maillage, la part du lien le plafonne ([capping]).
         */
        val SCREEN = CallVideoBudget(MAX_VIDEO_BITRATE_BPS, ScreenShareEncodingLaw.MAX_FRAMERATE, 1.0, VideoDegradation.MaintainResolution)

        /**
         * Le budget de CHAQUE encodage quand la caméra part vers [encodes] pairs (N − 1 pour N participants), iOS
         * `CallVideoBudget.meshLink` : le débit montant se partage, la définition descend avec le nombre de liens —
         * 540p à deux, 360p jusqu'à quatre, 240p au-delà — et la cadence passe à 20 i/s. Un seul encodage garde tout.
         */
        fun meshLink(encodes: Int, uplinkBps: Int = MAX_VIDEO_BITRATE_BPS): CallVideoBudget {
            val links = max(1, encodes)
            if (links == 1) return CallVideoBudget(uplinkBps, CAMERA_FRAMERATE, 1.0, VideoDegradation.MaintainFramerate)
            val height = when {
                links == 2 -> 540.0
                links <= 4 -> 360.0
                else -> 240.0
            }
            return CallVideoBudget(
                maxBitrateBps = max(MESH_FLOOR_BITRATE_BPS, uplinkBps / links),
                maxFramerate = MESH_FRAMERATE,
                scaleResolutionDownBy = VideoSenderCapPlan.CAPTURE_HEIGHT_PX / height,
                degradation = VideoDegradation.MaintainFramerate,
            )
        }

        /** Le plancher de survie (iOS `VideoSurvivalController`) : 100 kb/s, 2 i/s, 360p, la résolution gardée. */
        val SURVIVAL_FLOOR = CallVideoBudget(
            maxBitrateBps = CallQualityThresholds.MIN_VIDEO_BITRATE_BPS,
            maxFramerate = SURVIVAL_FROZEN_FPS,
            scaleResolutionDownBy = max(1.0, VideoSenderCapPlan.CAPTURE_HEIGHT_PX.toDouble() / CallQualityThresholds.CRITICAL_VIDEO_FLOOR_HEIGHT),
            degradation = VideoDegradation.MaintainResolution,
        )
    }
}

/**
 * La part du débit montant de chaque connexion d'un appel de groupe — iOS `GroupCallMeshCoordinator.rebudgetVideo`
 * (#11292) : les encodages sont les liens du maillage plus le pair principal tant qu'il tient son siège ; chaque lien
 * reçoit sa part (le plancher de survie quand la vidéo est figée), et le principal reçoit la même part comme
 * plafond tant que le maillage a des liens — sans lien, aucun plafond ne lui est posé.
 */
data class GroupMeshVideoBudget(val link: CallVideoBudget, val primaryCeiling: CallVideoBudget?) {
    companion object {
        fun of(links: Int, hasPrimary: Boolean, survivalFrozen: Boolean): GroupMeshVideoBudget {
            val share = CallVideoBudget.meshLink(encodes = links + if (hasPrimary) 1 else 0)
            return GroupMeshVideoBudget(
                link = if (survivalFrozen) CallVideoBudget.SURVIVAL_FLOOR else share,
                primaryCeiling = share.takeIf { links > 0 },
            )
        }
    }
}

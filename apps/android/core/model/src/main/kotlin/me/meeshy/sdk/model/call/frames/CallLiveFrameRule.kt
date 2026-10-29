package me.meeshy.sdk.model.call.frames

import kotlin.math.max
import kotlin.math.roundToInt

/** Pourquoi un cadre choisi n'est pas montré : l'appareil se protège, ou le cadre bouge sous « Réduire les animations ». */
public enum class CallLiveFrameSuspension { DEVICE_CONSTRAINED, REDUCE_MOTION }

/** Ce que l'écran d'appel montre autour des deux vidéos (miroir de iOS `CallLiveFrameDisplay`). */
public sealed interface CallLiveFrameDisplay {
    public val design: CallFrameDesign? get() = null

    public data object None : CallLiveFrameDisplay

    public data class Frame(override val design: CallFrameDesign) : CallLiveFrameDisplay

    public data class Suspended(val frame: CallFrameDesign, val reason: CallLiveFrameSuspension) : CallLiveFrameDisplay
}

/** Les règles pures du cadre en direct d'un duo (miroir de iOS `CallLiveFrameRule`) : quels cadres se proposent, et qui s'y nomme. */
object CallLiveFrameRule {
    const val PEOPLE: Int = 2
    const val ID_MAX_LENGTH: Int = 96
    private val ID_ALPHABET: Set<Char> = (('a'..'z') + ('0'..'9') + '-').toSet()

    /** Un cadre se propose en direct s'il sert un duo ET déclare la surface `live` : un cadre de capture seule ne sert jamais l'appel. */
    fun isEligible(design: CallFrameDesign): Boolean = design.serves(PEOPLE) && design.isOffered(CallFrameSurface.LIVE)

    fun frames(mood: CallFrameMood? = null, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallFrameDesign> =
        among.filter { isEligible(it) && (mood == null || it.mood == mood) }

    /** Les ambiances qui ont au moins un cadre en direct, dans l'ordre canonique. */
    fun moods(among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallFrameMood> {
        val served = frames(among = among).map { it.mood }.toSet()
        return CallFrameMood.entries.filter { it in served }
    }

    /** Le cadre en direct n'existe qu'en vidéo, à deux. */
    fun mayOffer(participants: Int, showsVideo: Boolean): Boolean = showsVideo && participants == PEOPLE

    /** Le cadre choisi devient-il visible ? Duo seulement, et seulement un cadre du catalogue servi en direct. */
    fun displayed(frameId: String?, participants: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallFrameDesign? {
        if (participants != PEOPLE || frameId == null) return null
        return CallFrameCatalogue.frame(frameId, among)?.takeIf { isEligible(it) }
    }

    /** Le plus long côté des couches peintes, en pixels : au-delà, la carte graphique agrandit, le processeur ne peint pas plus. */
    const val PAINT_LONGEST_SIDE: Int = 1280

    /** Un cadre bouge s'il porte un ornement animé ou une couche de scène qui n'est pas une illustration fixe (#12683). */
    fun animates(design: CallFrameDesign): Boolean =
        design.look.ornaments.any { it.motion != CallFrameOrnamentMotion.STILL } ||
            design.look.scene.any { it.kind != CallFrameSceneLayerKind.IMAGE }

    /** Un cadre dont seuls les ornements bougent a un état FIXE complet ; une couche de scène animée n'en a pas encore. */
    fun hasStillState(design: CallFrameDesign): Boolean = design.look.scene.all { it.kind == CallFrameSceneLayerKind.IMAGE }

    /** Les ornements s'animent-ils à l'écran ? Jamais sous « Réduire les animations », ni quand l'appareil se protège. */
    fun playsMotion(design: CallFrameDesign, reduceMotion: Boolean, isDeviceConstrained: Boolean): Boolean =
        animates(design) && !reduceMotion && !isDeviceConstrained

    /**
     * Le cadre choisi devient-il visible ? Duo seulement ; en pause quand l'appareil se protège ; sous « Réduire les
     * animations », un cadre qui a un état fixe se montre immobile, un cadre dont la scène bouge reste masqué.
     */
    fun display(
        frameId: String?,
        participants: Int,
        isDeviceConstrained: Boolean,
        reduceMotion: Boolean,
        among: List<CallFrameDesign> = CallFrameCatalogue.all,
    ): CallLiveFrameDisplay {
        val design = displayed(frameId, participants, among) ?: return CallLiveFrameDisplay.None
        if (isDeviceConstrained) return CallLiveFrameDisplay.Suspended(design, CallLiveFrameSuspension.DEVICE_CONSTRAINED)
        if (reduceMotion && animates(design) && !hasStillState(design)) {
            return CallLiveFrameDisplay.Suspended(design, CallLiveFrameSuspension.REDUCE_MOTION)
        }
        return CallLiveFrameDisplay.Frame(design)
    }

    /** La taille (pixels) à laquelle les couches se peignent : celle de l'écran, bornée sur le plus long côté. */
    fun paintSize(viewWidth: Int, viewHeight: Int): Pair<Int, Int> {
        if (viewWidth < 1 || viewHeight < 1) return 0 to 0
        val longest = max(viewWidth, viewHeight)
        val factor = if (longest > PAINT_LONGEST_SIDE) PAINT_LONGEST_SIDE.toDouble() / longest else 1.0
        return (viewWidth * factor).roundToInt() to (viewHeight * factor).roundToInt()
    }

    /** La forme d'un identifiant du catalogue, celle que la passerelle exige. */
    fun isFrameId(value: String): Boolean {
        if (value.isEmpty() || value.length > ID_MAX_LENGTH) return false
        val parts = value.split('.')
        return parts.size in 2..4 && parts.all { part -> part.isNotEmpty() && part.all { it in ID_ALPHABET } }
    }

    /** Les personnes du cadre, dans l'ordre des cases : le nom que l'autre partage remplace celui qu'on connaissait de lui ; le mien ne change jamais. */
    fun people(subjects: List<CallFramePerson>, remoteSharedName: String?): List<CallFramePerson> {
        val shared = remoteSharedName?.trim()?.takeIf { it.isNotEmpty() } ?: return subjects
        return subjects.map { if (it.isSelf) it else it.copy(name = shared) }
    }
}

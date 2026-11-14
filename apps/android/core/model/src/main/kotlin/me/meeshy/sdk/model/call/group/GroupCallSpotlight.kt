package me.meeshy.sdk.model.call.group

import java.util.Locale
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy

/** Ce que la scène d'un appel de groupe montre : la grille, ou une vignette « à la une » — iOS `GroupCallStageFocus`. */
sealed interface GroupCallStageFocus {
    data object Grid : GroupCallStageFocus

    data class Spotlight(val tileId: String, val isScreenShare: Boolean) : GroupCallStageFocus
}

/** Le choix LOCAL de l'utilisateur, jamais partagé avec les autres membres — iOS `GroupCallSpotlightChoice`. */
sealed interface GroupCallSpotlightChoice {
    /** « Revenir à la grille », même pendant un partage d'écran. */
    data object Grid : GroupCallSpotlightChoice

    /** Une vignette touchée. */
    data class Tile(val id: String) : GroupCallSpotlightChoice
}

/** Où se range la pellicule des autres vignettes quand l'une est à la une. */
enum class GroupCallFilmstrip {
    /** Plein écran total (U2b) : l'écran partagé seul. */
    None,

    /** Portrait : une rangée horizontale sous la vignette à la une. */
    Bottom,

    /** Paysage : une colonne verticale à droite de la vignette à la une. */
    Trailing,
}

/**
 * Les niveaux du plein écran de la une (loi 15, #17961) : le plein écran (U2) range l'en-tête, la pilule et les
 * bannières et GARDE les caméras des autres ; le plein écran total (U2b) ne montre que l'écran partagé.
 */
enum class GroupCallFullScreenLevel {
    Off,
    FullScreen,
    Total;

    val isFullScreen: Boolean get() = this != Off

    val hidesStrip: Boolean get() = this == Total
}

/** Les boutons de la capsule de la une, dans leur ordre (loi 15, U1, U2, U2b). */
enum class GroupCallSpotlightButton { Grid, FullScreen, TotalFullScreen, ExitFullScreen, ExitTotalFullScreen }

/** Le déplacement de l'écran zoomé, en pixels, depuis son centre (#17961 point 2, web `ScreenPan`). */
data class GroupCallScreenPan(val x: Float, val y: Float) {
    companion object {
        val Zero = GroupCallScreenPan(0f, 0f)
    }
}

/**
 * La règle de mise à la une, pure — iOS `GroupCallSpotlight` : le choix manuel l'emporte ; sans choix (ou si la
 * vignette choisie a quitté l'appel), un partage d'écran d'un membre monte seul à la une ; sinon, la grille.
 */
object GroupCallSpotlight {
    const val MAX_ZOOM: Float = 4f
    private const val RECEIVED_SCREEN_RESET_MILLIS: Int = 200

    fun focus(tiles: List<GroupCallStageTile>, choice: GroupCallSpotlightChoice?): GroupCallStageFocus = when (choice) {
        GroupCallSpotlightChoice.Grid -> GroupCallStageFocus.Grid
        is GroupCallSpotlightChoice.Tile -> tiles.firstOrNull { it.id == choice.id }
            ?.let { GroupCallStageFocus.Spotlight(it.id, it.isScreenSharing) }
            ?: automaticFocus(tiles)
        null -> automaticFocus(tiles)
    }

    /**
     * Le membre dont l'écran monte seul à la une : le premier arrivé qui partage. Ma vignette n'y prétend jamais —
     * mon propre partage se voit par sa bannière, pas en me regardant moi-même.
     */
    fun sharerId(tiles: List<GroupCallStageTile>): String? = tiles.firstOrNull { !it.isLocal && it.isScreenSharing }?.id

    /**
     * Un partage qui COMMENCE prend la une, même après un choix manuel (#18180, loi 15) : tout choix tombe. Un « Grille »
     * posé pendant un partage ne vaut que pour CE partage : sa fin rend aussi la main à la règle automatique. Une
     * vignette épinglée, elle, reste épinglée quand le partage finit.
     */
    fun choiceAfterSharerChanged(
        choice: GroupCallSpotlightChoice?,
        oldSharer: String?,
        newSharer: String?,
    ): GroupCallSpotlightChoice? = when {
        oldSharer == newSharer -> choice
        newSharer != null -> null
        choice == GroupCallSpotlightChoice.Grid -> null
        else -> choice
    }

    /** #18180 — le lecteur d'écran annonce le partage qui commence, sauf si la bannière du pair (zone vive) le dit déjà. */
    fun announcesShare(oldSharer: String?, newSharer: String?, isAnnouncedByBanner: Boolean): Boolean =
        newSharer != null && newSharer != oldSharer && !isAnnouncedByBanner

    /** `true` quand MA vignette est à la une : mon image occupe la scène. */
    fun featuresLocal(focus: GroupCallStageFocus): Boolean =
        focus is GroupCallStageFocus.Spotlight && focus.tileId == GroupCallStageLaw.LOCAL_TILE_ID

    /** Le zoom d'un écran partagé : jamais sous 1, jamais au-delà de [MAX_ZOOM]. */
    fun clampedZoom(scale: Float): Float = scale.coerceIn(1f, MAX_ZOOM)

    /**
     * P15.11 — le zoom de l'écran reçu en duo : la même loi (1× à 4×) que la une du groupe, le pincement en cours
     * s'appliquant à la valeur acquise. Sans écran reçu, 1× : un zoom ne survit pas au partage qui l'a fait naître.
     */
    fun receivedScreenZoom(committed: Float, pinch: Float, isReceivingScreen: Boolean): Float =
        if (isReceivingScreen) clampedZoom(committed * pinch) else 1f

    /**
     * P15.11 — le retour à 1× de l'écran reçu : 0,2 s, et le fondu court du chrome sous « Réduire les animations »
     * (iOS `CallReceivedScreenZoom.resetTap`, `CallChromeStow.reducedFadeDuration`).
     */
    fun receivedScreenResetMillis(reduceMotion: Boolean): Int =
        if (reduceMotion) CallChromeStow.REDUCED_FADE_MILLIS else RECEIVED_SCREEN_RESET_MILLIS

    /**
     * U2.5 — le facteur que la puce de l'écran à la une annonce : arrondi au dixième, jamais au-delà du plafond ;
     * `null` à 1× (la puce ne porte alors que « Écran de X »).
     */
    fun displayedZoom(zoom: Float): Float? {
        val tenths = Math.round(clampedZoom(zoom) * 10f) / 10f
        return tenths.takeIf { it > 1f }
    }

    /**
     * « Écran de Karim · 2,5× » : le titre déjà localisé, puis le facteur de zoom quand il y en a un, écrit par l'unique
     * libellé de zoom de l'appel ([CameraZoomPolicy.label]) — iOS `CameraZoomPolicy.label(forDisplay:locale:)`.
     */
    fun featuredChipText(title: String, zoom: Float, locale: Locale): String {
        val factor = displayedZoom(zoom) ?: return title
        return "$title · ${CameraZoomPolicy.label(factor, locale)}"
    }

    /** La pellicule des autres : aucune quand elle est retirée, en colonne à droite en paysage, en rangée dessous sinon. */
    fun filmstrip(isStripHidden: Boolean, isLandscape: Boolean): GroupCallFilmstrip = when {
        isStripHidden -> GroupCallFilmstrip.None
        isLandscape -> GroupCallFilmstrip.Trailing
        else -> GroupCallFilmstrip.Bottom
    }

    /** #17961 — le bandeau reste au plein écran (U2) ; seul le plein écran total (U2b) le retire. */
    fun filmstrip(level: GroupCallFullScreenLevel, isLandscape: Boolean): GroupCallFilmstrip =
        filmstrip(isStripHidden = level.hidesStrip, isLandscape = isLandscape)

    /**
     * Le niveau, lu du plein écran du chrome (qui range en-tête, pilule et bannières aux deux niveaux) et du vœu d'aller
     * au total — réservé à un écran partagé : une caméra à la une n'a qu'UN niveau (#17961, 2026-11-14).
     */
    fun fullScreenLevel(isFullScreen: Boolean, wantsTotal: Boolean, isScreenShare: Boolean): GroupCallFullScreenLevel = when {
        !isFullScreen -> GroupCallFullScreenLevel.Off
        wantsTotal && isScreenShare -> GroupCallFullScreenLevel.Total
        else -> GroupCallFullScreenLevel.FullScreen
    }

    /** « Plein écran » monte d'un niveau à chaque appui (#17961, 2026-11-14). */
    fun raised(level: GroupCallFullScreenLevel, isScreenShare: Boolean): GroupCallFullScreenLevel = when (level) {
        GroupCallFullScreenLevel.Off -> GroupCallFullScreenLevel.FullScreen
        GroupCallFullScreenLevel.FullScreen -> if (isScreenShare) GroupCallFullScreenLevel.Total else GroupCallFullScreenLevel.FullScreen
        GroupCallFullScreenLevel.Total -> GroupCallFullScreenLevel.Total
    }

    /** « Quitter » (glyphe rentrer) redescend d'un niveau. */
    fun lowered(level: GroupCallFullScreenLevel): GroupCallFullScreenLevel = when (level) {
        GroupCallFullScreenLevel.Total -> GroupCallFullScreenLevel.FullScreen
        else -> GroupCallFullScreenLevel.Off
    }

    /** La capsule : « Revenir à la grille », puis le niveau suivant s'il y en a un, puis la descente d'un niveau. */
    fun capsuleButtons(level: GroupCallFullScreenLevel, isScreenShare: Boolean): List<GroupCallSpotlightButton> = when (level) {
        GroupCallFullScreenLevel.Off -> listOf(GroupCallSpotlightButton.Grid, GroupCallSpotlightButton.FullScreen)
        GroupCallFullScreenLevel.FullScreen -> listOfNotNull(
            GroupCallSpotlightButton.Grid,
            GroupCallSpotlightButton.TotalFullScreen.takeIf { isScreenShare },
            GroupCallSpotlightButton.ExitFullScreen,
        )
        GroupCallFullScreenLevel.Total -> listOf(GroupCallSpotlightButton.Grid, GroupCallSpotlightButton.ExitTotalFullScreen)
    }

    /** Le niveau où mène un bouton de la capsule ; « Revenir à la grille » sort de tout. */
    fun levelAfter(button: GroupCallSpotlightButton, level: GroupCallFullScreenLevel, isScreenShare: Boolean): GroupCallFullScreenLevel =
        when (button) {
            GroupCallSpotlightButton.Grid -> GroupCallFullScreenLevel.Off
            GroupCallSpotlightButton.FullScreen, GroupCallSpotlightButton.TotalFullScreen -> raised(level, isScreenShare)
            GroupCallSpotlightButton.ExitFullScreen, GroupCallSpotlightButton.ExitTotalFullScreen -> lowered(level)
        }

    /** En plein écran, l'en-tête et la pilule sont rangés : le chrome qui se voit, c'est la capsule. */
    fun isChromeShown(isFullScreen: Boolean, isControlsVisible: Boolean, isCapsuleVisible: Boolean): Boolean =
        if (isFullScreen) isCapsuleVisible else isControlsVisible

    /**
     * #17961 point 2 · #17753 — l'écran zoomé ne quitte jamais son cadre : son bord reste au bord, rien ne bouge à 1× et
     * la borne se resserre avec le zoom (miroir de `screenPanClamp`, `apps/web/src/lib/calls/screen-zoom.ts`).
     */
    fun screenPanClamp(pan: GroupCallScreenPan, zoom: Float, width: Float, height: Float): GroupCallScreenPan =
        GroupCallScreenPan(within(pan.x, panBound(zoom, width)), within(pan.y, panBound(zoom, height)))

    /** Un glissé ajoute son écart au déplacement acquis, borné (web `screenPanAfterDrag`). */
    fun screenPanAfterDrag(pan: GroupCallScreenPan, dx: Float, dy: Float, zoom: Float, width: Float, height: Float): GroupCallScreenPan =
        screenPanClamp(GroupCallScreenPan(pan.x + dx, pan.y + dy), zoom, width, height)

    private fun panBound(zoom: Float, extent: Float): Float =
        if (extent.isFinite() && zoom.isFinite()) (extent * (zoom - 1f) / 2f).coerceAtLeast(0f) else 0f

    private fun within(value: Float, bound: Float): Float = value.coerceIn(-bound, bound) + 0f

    private fun automaticFocus(tiles: List<GroupCallStageTile>): GroupCallStageFocus =
        sharerId(tiles)?.let { GroupCallStageFocus.Spotlight(it, isScreenShare = true) } ?: GroupCallStageFocus.Grid
}

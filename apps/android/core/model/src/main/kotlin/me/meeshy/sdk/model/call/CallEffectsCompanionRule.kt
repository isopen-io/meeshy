package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.call.group.GroupCallStageLaw
import me.meeshy.sdk.model.call.group.GroupCallStageTile

/** Le coin du haut où se range le bloc des autres participants en mode Effets (iOS `CallEffectsCompanionCorner`). */
public enum class CallEffectsCompanionCorner {
    TopStart,
    TopEnd,
    ;

    public val other: CallEffectsCompanionCorner get() = if (this == TopStart) TopEnd else TopStart
}

/** Une personne d'un appel à deux, telle que le bloc la dessine. */
public data class CallEffectsDuoPeer(
    val userId: String?,
    val name: String,
    val avatarUrl: String?,
    val isVideoOn: Boolean,
    val isMicMuted: Boolean,
)

/** Qui est sur la scène, qui l'accompagne en vignette, et combien le « +N » compte encore. */
public data class CallEffectsCompanionLayout(
    val stageTileId: String,
    val companions: List<GroupCallStageTile>,
    val overflow: Int,
)

/**
 * **LES COMPAGNONS DU MODE EFFETS** — miroir de iOS `CallEffectsCompanionRule` (#8737) : la scène montre MON image
 * filtrée, les autres restent en vignettes dans un bloc du haut. Jamais un coin du bas (le carrousel et la barre
 * d'actions y vivent). Le duo est le cas du groupe à un seul accompagnant.
 */
public object CallEffectsCompanionRule {
    public const val MAX_COMPANIONS: Int = 3
    public const val MINIMUM_TILE_HEIGHT_DP: Float = 44f
    public const val DUO_REMOTE_TILE_ID: String = "duo-remote"
    public val groupTileSize: CallTileSize = CallTileSize(84f, 112f)
    public val duoTileSize: CallTileSize = CallTileSize(CallSelfTileScale.Standard.widthDp, CallSelfTileScale.Standard.heightDp)
    public val compactTileSize: CallTileSize = CallTileSize(CallSelfTileScale.X1.widthDp, CallSelfTileScale.X1.heightDp)

    /**
     * La scène est à moi, sauf une vignette distante mise à la une qui est encore là (mon image devient alors le
     * premier accompagnant). Les autres suivent l'ordre d'arrivée ; seul un orateur hors cadre prend la DERNIÈRE
     * place quand aucun accompagnant visible ne parle.
     */
    public fun layout(tiles: List<GroupCallStageTile>, featuredId: String?, capacity: Int): CallEffectsCompanionLayout {
        val localId = tiles.firstOrNull { it.isLocal }?.id ?: GroupCallStageLaw.LOCAL_TILE_ID
        val stageId = featuredId?.let { id -> tiles.firstOrNull { it.id == id }?.id } ?: localId
        val me = if (stageId == localId) emptyList() else tiles.filter { it.isLocal }
        val candidates = me + tiles.filter { !it.isLocal && it.id != stageId }
        val slots = capacity.coerceIn(0, MAX_COMPANIONS)
        val visible = promotingHiddenSpeaker(candidates.take(slots), candidates)
        return CallEffectsCompanionLayout(stageId, visible, candidates.size - visible.size)
    }

    private fun promotingHiddenSpeaker(visible: List<GroupCallStageTile>, candidates: List<GroupCallStageTile>): List<GroupCallStageTile> {
        if (visible.isEmpty() || visible.any { it.isSpeaking }) return visible
        val speaker = candidates.drop(visible.size).firstOrNull { it.isSpeaking } ?: return visible
        return visible.dropLast(1) + speaker
    }

    /** Combien de vignettes tiennent sur la largeur, en réservant la place du « +N » dès que tout le monde ne tient pas. */
    public fun capacity(availableWidth: Float, tileWidth: Float, spacing: Float, chipWidth: Float, count: Int): Int {
        val bounded = count.coerceIn(0, MAX_COMPANIONS)
        fun rowWidth(n: Int): Float = if (n == 0) 0f else n * tileWidth + (n - 1) * spacing
        if (bounded == count && rowWidth(count) <= availableWidth) return count
        return (bounded downTo 0).firstOrNull { n ->
            rowWidth(n) + (if (n == 0) 0f else spacing) + chipWidth <= availableWidth
        } ?: 0
    }

    /** La taille d'une vignette : celle de la vignette perso pour un seul accompagnant, celle de la grille au-delà ; aucune sous une cible tactile. */
    public fun tileSize(companionCount: Int, freeHeight: Float): CallTileSize? {
        val preferred = if (companionCount <= 1) duoTileSize else groupTileSize
        if (preferred.heightDp <= freeHeight) return preferred
        if (compactTileSize.heightDp <= freeHeight) return compactTileSize
        if (freeHeight < MINIMUM_TILE_HEIGHT_DP) return null
        return CallTileSize(freeHeight / CallSelfTileScale.ASPECT_RATIO, freeHeight)
    }

    /** Le coin le plus proche du point de dépose, en coordonnées PHYSIQUES : en RTL le coin de tête est à droite. */
    public fun corner(dropX: Float, containerWidth: Float, isRightToLeft: Boolean = false): CallEffectsCompanionCorner {
        val dropsLeft = dropX < containerWidth / 2f
        return if (dropsLeft != isRightToLeft) CallEffectsCompanionCorner.TopStart else CallEffectsCompanionCorner.TopEnd
    }

    /** Le centre horizontal, en coordonnées physiques, du bloc au repos. */
    public fun restingCenterX(
        corner: CallEffectsCompanionCorner,
        blockWidth: Float,
        containerWidth: Float,
        margin: Float,
        isRightToLeft: Boolean,
    ): Float {
        val sitsLeft = (corner == CallEffectsCompanionCorner.TopStart) != isRightToLeft
        return if (sitsLeft) margin + blockWidth / 2f else containerWidth - margin - blockWidth / 2f
    }

    /** Un appel à deux dit en vignettes de grille : moi, puis l'autre. */
    public fun duoTiles(local: CallEffectsDuoPeer, remote: CallEffectsDuoPeer): List<GroupCallStageTile> =
        listOf(
            tile(local, GroupCallStageLaw.LOCAL_TILE_ID, isLocal = true),
            tile(remote, remote.userId ?: DUO_REMOTE_TILE_ID, isLocal = false),
        )

    /**
     * L'autre d'un appel à deux, seul accompagnant de mon image (la scène est à moi), tel que le bloc le montre (iOS
     * `effectsCompanionTiles`) : avec SON identifiant — sa
     * couleur d'auteur, celle de ses sous-titres et de son liseré ailleurs dans l'appel (loi 4) — et SA photo quand sa
     * caméra est coupée. Un identifiant vide vaut « inconnu », jamais une couleur.
     */
    public fun duoCompanions(
        peerUserId: String?,
        peerName: String,
        peerAvatarUrl: String?,
        isCameraOn: Boolean,
        isMuted: Boolean,
        isPeerCameraOff: Boolean,
        isPeerMuted: Boolean,
    ): List<GroupCallStageTile> = layout(
        duoTiles(
            CallEffectsDuoPeer(null, "", null, isVideoOn = isCameraOn, isMicMuted = isMuted),
            CallEffectsDuoPeer(peerUserId.takeUnless { it.isNullOrBlank() }, peerName, peerAvatarUrl, isVideoOn = !isPeerCameraOff, isMicMuted = isPeerMuted),
        ),
        featuredId = null,
        capacity = MAX_COMPANIONS,
    ).companions

    private fun tile(peer: CallEffectsDuoPeer, id: String, isLocal: Boolean): GroupCallStageTile =
        GroupCallStageTile(
            id = id,
            colorKey = peer.userId ?: id,
            displayName = peer.name,
            avatarUrl = peer.avatarUrl,
            isLocal = isLocal,
            isMicMuted = peer.isMicMuted,
            showsVideo = peer.isVideoOn,
            isScreenSharing = false,
            isReconnecting = false,
        )
}

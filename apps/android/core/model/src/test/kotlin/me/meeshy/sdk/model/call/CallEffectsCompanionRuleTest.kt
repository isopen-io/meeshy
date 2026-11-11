package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.group.GroupCallStageLaw
import me.meeshy.sdk.model.call.group.GroupCallStageTile
import org.junit.Test

class CallEffectsCompanionRuleTest {
    private fun tile(id: String, local: Boolean = false, speaking: Boolean = false) = GroupCallStageTile(
        id = id, colorKey = id, displayName = id, avatarUrl = null, isLocal = local,
        isMicMuted = false, showsVideo = true, isScreenSharing = false, isReconnecting = false, isSpeaking = speaking,
    )

    private val me = tile(GroupCallStageLaw.LOCAL_TILE_ID, local = true)

    @Test
    fun `the stage is mine and every other member accompanies it in arrival order`() {
        val layout = CallEffectsCompanionRule.layout(listOf(me, tile("a"), tile("b")), featuredId = null, capacity = 3)
        assertThat(layout.stageTileId).isEqualTo(GroupCallStageLaw.LOCAL_TILE_ID)
        assertThat(layout.companions.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(layout.overflow).isEqualTo(0)
    }

    @Test
    fun `a featured remote tile takes the stage and my image becomes the first companion`() {
        val layout = CallEffectsCompanionRule.layout(listOf(me, tile("a"), tile("b")), featuredId = "a", capacity = 3)
        assertThat(layout.stageTileId).isEqualTo("a")
        assertThat(layout.companions.map { it.id }).containsExactly(GroupCallStageLaw.LOCAL_TILE_ID, "b").inOrder()
    }

    @Test
    fun `a featured tile that left falls back on my image`() {
        val layout = CallEffectsCompanionRule.layout(listOf(me, tile("a")), featuredId = "gone", capacity = 3)
        assertThat(layout.stageTileId).isEqualTo(GroupCallStageLaw.LOCAL_TILE_ID)
    }

    @Test
    fun `capacity truncates and counts the overflow`() {
        val tiles = listOf(me) + (1..5).map { tile("p$it") }
        val layout = CallEffectsCompanionRule.layout(tiles, null, capacity = 2)
        assertThat(layout.companions).hasSize(2)
        assertThat(layout.overflow).isEqualTo(3)
        assertThat(CallEffectsCompanionRule.layout(tiles, null, capacity = 10).companions).hasSize(3)
    }

    @Test
    fun `a hidden speaker is promoted into the last slot when nobody visible speaks`() {
        val tiles = listOf(me, tile("a"), tile("b"), tile("c", speaking = true))
        val layout = CallEffectsCompanionRule.layout(tiles, null, capacity = 2)
        assertThat(layout.companions.map { it.id }).containsExactly("a", "c").inOrder()
        assertThat(layout.overflow).isEqualTo(1)
    }

    @Test
    fun `a visible speaker keeps the block still`() {
        val tiles = listOf(me, tile("a", speaking = true), tile("b"), tile("c", speaking = true))
        val layout = CallEffectsCompanionRule.layout(tiles, null, capacity = 2)
        assertThat(layout.companions.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `capacity reserves the room of the plus chip once not everyone fits`() {
        assertThat(CallEffectsCompanionRule.capacity(400f, 84f, 8f, 44f, count = 3)).isEqualTo(3)
        assertThat(CallEffectsCompanionRule.capacity(200f, 84f, 8f, 44f, count = 3)).isEqualTo(1)
        assertThat(CallEffectsCompanionRule.capacity(30f, 84f, 8f, 44f, count = 3)).isEqualTo(0)
        assertThat(CallEffectsCompanionRule.capacity(500f, 84f, 8f, 44f, count = 7)).isEqualTo(3)
    }

    @Test
    fun `tile size shrinks with the free height and disappears under a touch target`() {
        assertThat(CallEffectsCompanionRule.tileSize(1, 400f)).isEqualTo(CallEffectsCompanionRule.duoTileSize)
        assertThat(CallEffectsCompanionRule.tileSize(2, 400f)).isEqualTo(CallEffectsCompanionRule.groupTileSize)
        assertThat(CallEffectsCompanionRule.tileSize(2, 105f)).isEqualTo(CallEffectsCompanionRule.compactTileSize)
        assertThat(CallEffectsCompanionRule.tileSize(2, 60f)!!.heightDp).isEqualTo(60f)
        assertThat(CallEffectsCompanionRule.tileSize(2, 40f)).isNull()
    }

    @Test
    fun `the drop corner follows the physical side, mirrored in right-to-left`() {
        assertThat(CallEffectsCompanionRule.corner(50f, 400f)).isEqualTo(CallEffectsCompanionCorner.TopStart)
        assertThat(CallEffectsCompanionRule.corner(350f, 400f)).isEqualTo(CallEffectsCompanionCorner.TopEnd)
        assertThat(CallEffectsCompanionRule.corner(50f, 400f, isRightToLeft = true)).isEqualTo(CallEffectsCompanionCorner.TopEnd)
        assertThat(CallEffectsCompanionRule.corner(350f, 400f, isRightToLeft = true)).isEqualTo(CallEffectsCompanionCorner.TopStart)
        assertThat(CallEffectsCompanionCorner.TopStart.other).isEqualTo(CallEffectsCompanionCorner.TopEnd)
    }

    @Test
    fun `the resting centre sits a margin from the physical edge`() {
        assertThat(CallEffectsCompanionRule.restingCenterX(CallEffectsCompanionCorner.TopStart, 100f, 400f, 16f, false)).isEqualTo(66f)
        assertThat(CallEffectsCompanionRule.restingCenterX(CallEffectsCompanionCorner.TopEnd, 100f, 400f, 16f, false)).isEqualTo(334f)
        assertThat(CallEffectsCompanionRule.restingCenterX(CallEffectsCompanionCorner.TopStart, 100f, 400f, 16f, true)).isEqualTo(334f)
    }

    @Test
    fun `a duo is told in grid tiles, me then the other`() {
        val tiles = CallEffectsCompanionRule.duoTiles(
            CallEffectsDuoPeer("me", "Moi", null, isVideoOn = true, isMicMuted = false),
            CallEffectsDuoPeer(null, "Zoe", "u", isVideoOn = false, isMicMuted = true),
        )
        assertThat(tiles.map { it.id }).containsExactly(GroupCallStageLaw.LOCAL_TILE_ID, CallEffectsCompanionRule.DUO_REMOTE_TILE_ID).inOrder()
        assertThat(tiles[0].isLocal).isTrue()
        assertThat(tiles[1].showsVideo).isFalse()
        assertThat(tiles[1].isMicMuted).isTrue()
    }

    @Test
    fun `the other keeps his own colour key and his photo, and so do I`() {
        val tiles = CallEffectsCompanionRule.duoTiles(
            CallEffectsDuoPeer("u-me", "Moi", null, isVideoOn = true, isMicMuted = false),
            CallEffectsDuoPeer("u-zoe", "Zoe", "https://cdn/zoe.png", isVideoOn = false, isMicMuted = false),
        )
        assertThat(tiles.map { it.colorKey }).containsExactly("u-me", "u-zoe").inOrder()
        assertThat(tiles[1].avatarUrl).isEqualTo("https://cdn/zoe.png")
    }

    @Test
    fun `an other without identity falls on the duo key, which is no author colour`() {
        val tiles = CallEffectsCompanionRule.duoTiles(
            CallEffectsDuoPeer(null, "Moi", null, isVideoOn = true, isMicMuted = false),
            CallEffectsDuoPeer(null, "Zoe", null, isVideoOn = true, isMicMuted = false),
        )
        assertThat(tiles[1].colorKey).isEqualTo(CallEffectsCompanionRule.DUO_REMOTE_TILE_ID)
    }

    @Test
    fun `a duo in the Effects mode shows the other, alone beside my image, with his own colour key and his photo`() {
        val companions = CallEffectsCompanionRule.duoCompanions(
            peerUserId = "u-zoe", peerName = "Zoe", peerAvatarUrl = "https://cdn/zoe.png",
            isCameraOn = true, isMuted = false, isPeerCameraOff = true, isPeerMuted = false,
        )
        assertThat(companions).hasSize(1)
        assertThat(companions[0].isLocal).isFalse()
        assertThat(companions[0].colorKey).isEqualTo("u-zoe")
        assertThat(companions[0].avatarUrl).isEqualTo("https://cdn/zoe.png")
        assertThat(companions[0].showsVideo).isFalse()
        assertThat(companions[0].displayName).isEqualTo("Zoe")
    }

    @Test
    fun `an empty identifier is unknown, never a colour of its own`() {
        val companions = CallEffectsCompanionRule.duoCompanions(
            peerUserId = "  ", peerName = "Zoe", peerAvatarUrl = null,
            isCameraOn = true, isMuted = false, isPeerCameraOff = false, isPeerMuted = true,
        )
        assertThat(companions.single().colorKey).isEqualTo(CallEffectsCompanionRule.DUO_REMOTE_TILE_ID)
        assertThat(companions.single().isMicMuted).isTrue()
    }
}

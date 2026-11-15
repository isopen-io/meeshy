package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.group.GroupCallStageLaw
import me.meeshy.sdk.model.call.group.GroupCallStageTile
import org.junit.Test

/** Qui est qui dans une capture (miroir de `CallCaptureIdentityTests`, iOS) : moi marqué, l'ordre de l'écran, une caméra coupée garde sa case. */
class CallCaptureIdentityTest {

    private fun tile(id: String, name: String, isLocal: Boolean = false, showsVideo: Boolean = true) = GroupCallStageTile(
        id = id, colorKey = id, displayName = name, avatarUrl = null, isLocal = isLocal,
        isMicMuted = false, showsVideo = showsVideo, isScreenSharing = false, isReconnecting = false,
    )

    private fun me(showsVideo: Boolean = true) =
        CallCaptureIdentity.me(name = "Vous", username = "awa", isMirrored = true, showsVideo = showsVideo)

    @Test
    fun `groupe - moi est marque et seul a recevoir mon pseudo`() {
        val tiles = listOf(
            tile(GroupCallStageLaw.LOCAL_TILE_ID, "Vous", isLocal = true),
            tile("u-karim", "Karim"),
            tile("u-lina", "Lina"),
        )

        val subjects = CallCaptureIdentity.group(tiles, myName = "Awa Diallo", myUsername = "awa", isMyCaptureMirrored = true)

        assertThat(subjects.map { it.id }).containsExactly(GroupCallStageLaw.LOCAL_TILE_ID, "u-karim", "u-lina").inOrder()
        assertThat(subjects.map { it.name }).containsExactly("Awa Diallo", "Karim", "Lina").inOrder()
        assertThat(subjects.map { it.isSelf }).containsExactly(true, false, false).inOrder()
        assertThat(subjects.map { it.handle }).containsExactly("awa", null, null).inOrder()
        assertThat(subjects.map { it.isMirrored }).containsExactly(true, false, false).inOrder()
    }

    @Test
    fun `groupe - une camera coupee garde sa case`() {
        val tiles = listOf(tile(GroupCallStageLaw.LOCAL_TILE_ID, "Vous", isLocal = true), tile("u-karim", "Karim", showsVideo = false))

        val subjects = CallCaptureIdentity.group(tiles, myName = "Vous", myUsername = null, isMyCaptureMirrored = false)

        assertThat(subjects).hasSize(2)
        assertThat(subjects.map { it.showsVideo }).containsExactly(true, false).inOrder()
        assertThat(subjects[0].handle).isNull()
    }

    @Test
    fun `mon nom - le nom affiche, sinon le pseudo, sinon le libelle local`() {
        assertThat(CallCaptureIdentity.myName(" Awa Diallo ", "awa", "Vous")).isEqualTo("Awa Diallo")
        assertThat(CallCaptureIdentity.myName("  ", "awa", "Vous")).isEqualTo("awa")
        assertThat(CallCaptureIdentity.myName(null, null, "Vous")).isEqualTo("Vous")
    }

    @Test
    fun `moi - identifiant local, mon pseudo, miroir`() {
        val me = me()
        assertThat(me.id).isEqualTo(CallCaptureIdentity.LOCAL_DUO_ID)
        assertThat(me.isSelf).isTrue()
        assertThat(me.handle).isEqualTo("awa")
        assertThat(me.isMirrored).isTrue()
    }

    @Test
    fun `duo - l'autre d'abord sauf flux permutes, a l'endroit`() {
        val remoteFirst = CallCaptureIdentity.duo(me(), "Karim", "karim_k", remoteShowsVideo = true, meFirst = false)
        val meFirst = CallCaptureIdentity.duo(me(), "Karim", "karim_k", remoteShowsVideo = true, meFirst = true)

        assertThat(remoteFirst.map { it.id }).containsExactly(CallCaptureIdentity.REMOTE_DUO_ID, CallCaptureIdentity.LOCAL_DUO_ID).inOrder()
        assertThat(meFirst.map { it.id }).containsExactly(CallCaptureIdentity.LOCAL_DUO_ID, CallCaptureIdentity.REMOTE_DUO_ID).inOrder()
        assertThat(remoteFirst[0].handle).isEqualTo("karim_k")
        assertThat(remoteFirst[0].isSelf).isFalse()
        assertThat(remoteFirst[0].isMirrored).isFalse()
    }

    @Test
    fun `duo - les cameras coupees gardent leur case`() {
        val subjects = CallCaptureIdentity.duo(me(showsVideo = false), "Karim", null, remoteShowsVideo = false, meFirst = false)

        assertThat(subjects).hasSize(2)
        assertThat(subjects.map { it.showsVideo }).containsExactly(false, false).inOrder()
    }

    @Test
    fun `pseudo - vide ou absent n'en est pas un, sinon rogne`() {
        assertThat(CallCaptureIdentity.handle(null)).isNull()
        assertThat(CallCaptureIdentity.handle("   ")).isNull()
        assertThat(CallCaptureIdentity.handle(" awa ")).isEqualTo("awa")
    }
}

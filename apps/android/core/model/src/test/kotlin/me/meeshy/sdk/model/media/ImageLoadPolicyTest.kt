package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageLoadPolicyTest {
    private fun skip(autoLoad: Boolean = false, local: Boolean = false, hit: Boolean = false, allows: Boolean = false) =
        ImageLoadPolicy.shouldSkipNetworkFetch(autoLoad, local, hit, allows)

    @Test fun `table reseau x geste x local`() {
        for (autoLoad in listOf(false, true)) for (local in listOf(false, true))
            for (hit in listOf(false, true)) for (allows in listOf(false, true)) {
                val expected = !autoLoad && !local && !hit && !allows
                assertThat(skip(autoLoad, local, hit, allows)).isEqualTo(expected)
            }
    }

    @Test fun `un tap manuel outrepasse la politique`() {
        assertThat(skip(autoLoad = true)).isFalse()
    }

    @Test fun `un fichier local n est jamais soumis a la politique`() {
        assertThat(skip(local = true)).isFalse()
    }

    @Test fun `une image deja sur l appareil n attend pas la politique`() {
        assertThat(skip(hit = true)).isFalse()
    }

    @Test fun `les adresses locales sont reconnues`() {
        assertThat(ImageLoadPolicy.isLocalFile("file:///data/a.jpg")).isTrue()
        assertThat(ImageLoadPolicy.isLocalFile("content://media/1")).isTrue()
        assertThat(ImageLoadPolicy.isLocalFile("/data/user/0/a.jpg")).isTrue()
        assertThat(ImageLoadPolicy.isLocalFile("https://gate.meeshy.me/a.jpg")).isFalse()
    }

    @Test fun `la phase retenue montre le toucher pour telecharger seulement hors decoratif`() {
        assertThat(ImageChrome.of(ImagePhase.DEFERRED, showsStatusOverlays = true)).isEqualTo(ImageChrome.TAP_TO_DOWNLOAD)
        assertThat(ImageChrome.of(ImagePhase.DEFERRED, showsStatusOverlays = false)).isEqualTo(ImageChrome.NONE)
        assertThat(ImageChrome.of(ImagePhase.FAILED, showsStatusOverlays = true)).isEqualTo(ImageChrome.RETRY)
        assertThat(ImageChrome.of(ImagePhase.FAILED, showsStatusOverlays = false)).isEqualTo(ImageChrome.NONE)
        assertThat(ImageChrome.of(ImagePhase.LOADING, showsStatusOverlays = true)).isEqualTo(ImageChrome.NONE)
        assertThat(ImageChrome.of(ImagePhase.LOADED, showsStatusOverlays = true)).isEqualTo(ImageChrome.NONE)
    }

    @Test fun `une erreur sans reseau autorise est differee, sinon echouee`() {
        assertThat(ImagePhase.afterError(networkAllowed = false)).isEqualTo(ImagePhase.DEFERRED)
        assertThat(ImagePhase.afterError(networkAllowed = true)).isEqualTo(ImagePhase.FAILED)
    }

    @Test fun `l absence est memorisee puis la sonde disque n est plus refaite`() {
        val memo = AbsencePresenceMemo(cap = 4)
        var probes = 0
        val probe = { _: String -> probes++; false }
        assertThat(memo.isOnDevice("u", resident = { false }, probe = probe)).isFalse()
        assertThat(memo.isOnDevice("u", resident = { false }, probe = probe)).isFalse()
        assertThat(probes).isEqualTo(1)
    }

    @Test fun `une residence efface l absence memorisee`() {
        val memo = AbsencePresenceMemo(cap = 4)
        memo.isOnDevice("u", resident = { false }, probe = { false })
        assertThat(memo.isOnDevice("u", resident = { true }, probe = { false })).isTrue()
        assertThat(memo.missCount).isEqualTo(0)
    }

    @Test fun `le memo est borne et se vide au plafond`() {
        val memo = AbsencePresenceMemo(cap = 2)
        listOf("a", "b", "c").forEach { memo.isOnDevice(it, resident = { false }, probe = { false }) }
        assertThat(memo.missCount).isEqualTo(1)
    }

    @Test fun `une sonde positive n est pas memorisee comme absente`() {
        val memo = AbsencePresenceMemo(cap = 4)
        assertThat(memo.isOnDevice("u", resident = { false }, probe = { true })).isTrue()
        assertThat(memo.missCount).isEqualTo(0)
    }
}

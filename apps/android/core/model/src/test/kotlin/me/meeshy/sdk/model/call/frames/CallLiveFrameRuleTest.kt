package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.ThermalState
import org.junit.Test

class CallLiveFrameRuleTest {
    @Test
    fun `la forme d'un identifiant est celle de la passerelle`() {
        assertThat(CallLiveFrameRule.isFrameId("elegant.classic.duo")).isTrue()
        assertThat(CallLiveFrameRule.isFrameId("a-b.c1")).isTrue()
        listOf("", "seul", "A.B", "a..b", "a.b.c.d.e", "a.b c", "x".repeat(97)).forEach {
            assertThat(CallLiveFrameRule.isFrameId(it)).isFalse()
        }
    }

    @Test
    fun `seuls les cadres en direct servant un duo se proposent`() {
        val frames = CallLiveFrameRule.frames()
        assertThat(frames).isNotEmpty()
        assertThat(frames.all { it.serves(2) && it.isOffered(CallFrameSurface.LIVE) }).isTrue()
        assertThat(CallFrameCatalogue.all.any { !it.isOffered(CallFrameSurface.LIVE) }).isTrue()
        assertThat(CallLiveFrameRule.moods()).isNotEmpty()
    }

    @Test
    fun `le cadre n'existe qu'en video a deux`() {
        assertThat(CallLiveFrameRule.mayOffer(participants = 2, showsVideo = true)).isTrue()
        assertThat(CallLiveFrameRule.mayOffer(participants = 3, showsVideo = true)).isFalse()
        assertThat(CallLiveFrameRule.mayOffer(participants = 2, showsVideo = false)).isFalse()
    }

    @Test
    fun `le cadre affiche est un cadre en direct du catalogue, en duo`() {
        val id = CallLiveFrameRule.frames().first().id
        assertThat(CallLiveFrameRule.displayed(id, participants = 2)?.id).isEqualTo(id)
        assertThat(CallLiveFrameRule.displayed(id, participants = 3)).isNull()
        assertThat(CallLiveFrameRule.displayed("inconnu.id", participants = 2)).isNull()
        assertThat(CallLiveFrameRule.displayed(null, participants = 2)).isNull()
        val captureOnly = CallFrameCatalogue.all.first { !it.isOffered(CallFrameSurface.LIVE) }
        assertThat(CallLiveFrameRule.displayed(captureOnly.id, participants = 2)).isNull()
    }

    @Test
    fun `le nom partage remplace celui de l'autre, jamais le mien`() {
        val me = CallFramePerson("me", "Ana", null, isSelf = true)
        val peer = CallFramePerson("p", "Robert", null, isSelf = false)
        assertThat(CallLiveFrameRule.people(listOf(me, peer), " Bob ").map { it.name }).containsExactly("Ana", "Bob").inOrder()
        assertThat(CallLiveFrameRule.people(listOf(me, peer), "  ")).containsExactly(me, peer).inOrder()
        assertThat(CallLiveFrameRule.people(listOf(me, peer), null)).containsExactly(me, peer).inOrder()
    }
}

class CallLiveFrameDisplayTest {
    private val still = CallFrameOrnament(CallFrameOrnamentKind.SPARKLES, "#FFFFFF", CallFrameDensity.MID, CallFrameLayer.FRONT)
    private val looping = still.copy(motion = CallFrameOrnamentMotion.LOOP)
    private val light = CallFrameSceneLayer("halo", CallFrameSceneLayerKind.LIGHT, CallFrameSceneDepth.BACK, null, null, "#FFFFFF", 0.5, null)
    private val image = light.copy(id = "matiere", kind = CallFrameSceneLayerKind.IMAGE, src = "a.webp")

    private fun live(ornaments: List<CallFrameOrnament> = emptyList(), scene: List<CallFrameSceneLayer> = emptyList()): CallFrameDesign {
        val base = CallLiveFrameRule.frames().first()
        return base.copy(id = "jovial.essai.duo", look = base.look.copy(ornaments = ornaments, scene = scene))
    }

    @Test
    fun `un cadre bouge s il porte un ornement anime ou une couche de scene qui n est pas une image`() {
        assertThat(CallLiveFrameRule.animates(live(listOf(still)))).isFalse()
        assertThat(CallLiveFrameRule.animates(live(listOf(looping)))).isTrue()
        assertThat(CallLiveFrameRule.animates(live(scene = listOf(image)))).isFalse()
        assertThat(CallLiveFrameRule.animates(live(scene = listOf(light)))).isTrue()
    }

    @Test
    fun `les ornements ne jouent ni sous reduire les animations ni quand l appareil se protege`() {
        val design = live(listOf(looping))
        assertThat(CallLiveFrameRule.playsMotion(design, reduceMotion = false, isDeviceConstrained = false)).isTrue()
        assertThat(CallLiveFrameRule.playsMotion(design, reduceMotion = true, isDeviceConstrained = false)).isFalse()
        assertThat(CallLiveFrameRule.playsMotion(design, reduceMotion = false, isDeviceConstrained = true)).isFalse()
        assertThat(CallLiveFrameRule.playsMotion(live(listOf(still)), reduceMotion = false, isDeviceConstrained = false)).isFalse()
    }

    @Test
    fun `le cadre choisi se montre, se met en pause quand l appareil se protege, et reste fixe sous reduire les animations`() {
        val moving = live(listOf(looping))
        val scenic = live(scene = listOf(light))
        val among = listOf(moving, scenic.copy(id = "jovial.scene.duo"))
        assertThat(CallLiveFrameRule.display(moving.id, 2, isDeviceConstrained = false, reduceMotion = false, among = among))
            .isEqualTo(CallLiveFrameDisplay.Frame(moving))
        assertThat(CallLiveFrameRule.display(moving.id, 2, isDeviceConstrained = true, reduceMotion = false, among = among))
            .isEqualTo(CallLiveFrameDisplay.Suspended(moving, CallLiveFrameSuspension.DEVICE_CONSTRAINED))
        assertThat(CallLiveFrameRule.display(moving.id, 2, isDeviceConstrained = false, reduceMotion = true, among = among).design)
            .isEqualTo(moving)
        assertThat(CallLiveFrameRule.display("jovial.scene.duo", 2, isDeviceConstrained = false, reduceMotion = true, among = among))
            .isEqualTo(CallLiveFrameDisplay.Suspended(among[1], CallLiveFrameSuspension.REDUCE_MOTION))
        assertThat(CallLiveFrameRule.display(moving.id, 3, isDeviceConstrained = false, reduceMotion = false, among = among))
            .isEqualTo(CallLiveFrameDisplay.None)
        assertThat(CallLiveFrameRule.display(null, 2, isDeviceConstrained = false, reduceMotion = false, among = among).design).isNull()
    }

    @Test
    fun `les couches se peignent a la taille de l ecran, bornee sur le plus long cote`() {
        assertThat(CallLiveFrameRule.paintSize(540, 960)).isEqualTo(540 to 960)
        assertThat(CallLiveFrameRule.PAINT_LONGEST_SIDE).isEqualTo(2048)
        assertThat(CallLiveFrameRule.paintSize(1080, 2000)).isEqualTo(1080 to 2000)
        assertThat(CallLiveFrameRule.paintSize(1440, 3200)).isEqualTo(922 to 2048)
        assertThat(CallLiveFrameRule.paintSize(4096, 1024)).isEqualTo(2048 to 512)
        assertThat(CallLiveFrameRule.paintSize(0, 960)).isEqualTo(0 to 0)
    }

    @Test
    fun `le cadre garde ne se compose que hors mode, en video etablie, et revient a la sortie`() {
        assertThat(CallLiveFrameRule.showsHeldFrame(isVideoConnected = true, activeMode = null)).isTrue()
        assertThat(CallLiveFrameRule.showsHeldFrame(isVideoConnected = true, activeMode = me.meeshy.sdk.model.call.CallScreenMode.Montage)).isFalse()
        assertThat(CallLiveFrameRule.showsHeldFrame(isVideoConnected = true, activeMode = me.meeshy.sdk.model.call.CallScreenMode.Effects)).isFalse()
        assertThat(CallLiveFrameRule.showsHeldFrame(isVideoConnected = false, activeMode = null)).isFalse()
    }

    @Test
    fun `les bandes de controles couvrent l'en-tete de 52 et la pilule de 84 en plus des encarts`() {
        val reserve = CallLiveFrameRule.chromeReserve(viewHeight = 800.0, topInset = 28.0, bottomInset = 16.0)
        assertThat(reserve).isEqualTo(CallFrameChromeReserve.covering(80.0, 100.0, 800.0))
        assertThat(CallLiveFrameRule.chromeReserve(0.0, 10.0, 10.0)).isEqualTo(CallFrameChromeReserve.NONE)
    }

    @Test
    fun `on ne repeint que si le cadre, les personnes, les textes ou la taille changent`() {
        val people = listOf(CallFramePerson("me", "Moi", null, true), CallFramePerson("you", "Toi", null, false))
        val base = CallLiveFrameRule.LayerInputs("a.b", people, CallFrameTexts(null, false, "4 nov. 2026", null), 540, 960, CallFrameChromeReserve.NONE, false)
        assertThat(CallLiveFrameRule.needsRepaint(null, base)).isTrue()
        assertThat(CallLiveFrameRule.needsRepaint(base, base.copy())).isFalse()
        assertThat(CallLiveFrameRule.needsRepaint(base, base.copy(frameId = "c.d"))).isTrue()
        assertThat(CallLiveFrameRule.needsRepaint(base, base.copy(people = people.reversed()))).isTrue()
        assertThat(CallLiveFrameRule.needsRepaint(base, base.copy(texts = CallFrameTexts("Famille", true, "4 nov. 2026", null)))).isTrue()
        assertThat(CallLiveFrameRule.needsRepaint(base, base.copy(width = 541))).isTrue()
    }

    @Test
    fun `l'appareil se protege des la chaleur serieuse ou l'economie d'energie`() {
        assertThat(CallLiveFrameRule.isDeviceConstrained(ThermalState.NOMINAL, powerSave = false)).isFalse()
        assertThat(CallLiveFrameRule.isDeviceConstrained(ThermalState.FAIR, powerSave = false)).isFalse()
        assertThat(CallLiveFrameRule.isDeviceConstrained(ThermalState.SERIOUS, powerSave = false)).isTrue()
        assertThat(CallLiveFrameRule.isDeviceConstrained(ThermalState.CRITICAL, powerSave = false)).isTrue()
        assertThat(CallLiveFrameRule.isDeviceConstrained(ThermalState.NOMINAL, powerSave = true)).isTrue()
    }
}

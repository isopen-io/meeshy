package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import kotlin.time.Duration.Companion.seconds
import org.junit.Test

/**
 * Ce que le chrome plein écran PEINT, jouable sans vue (miroir de
 * `FullscreenChromeState.swift`, #8878) : l'IMMERSION (un tap sur le média) rend
 * l'image entière, une OUVERTURE (réagir, répondre, un panneau) voile le reste
 * du chrome pour qu'on parle au média en silence.
 */
class FullscreenChromeStateTest {

    private val immersive = FullscreenChromeState.of(isImmersive = true)
    private val withReactions = FullscreenChromeState.of(overlay = FullscreenOverlay.Reactions)
    private val withReply = FullscreenChromeState.of(overlay = FullscreenOverlay.Reply)
    private val withPanel = FullscreenChromeState.of(overlay = FullscreenOverlay.Panel("comments"))

    // --- l'état initial et ses invariants --------------------------------------------------

    @Test
    fun `le chrome est visible au depart, avec ses voiles, sans rien d'ouvert`() {
        val state = FullscreenChromeState.Initial

        assertThat(state.isImmersive).isFalse()
        assertThat(state.overlay).isNull()
        assertThat(state.showsChrome).isTrue()
        assertThat(state.showsScrims).isTrue()
    }

    @Test
    fun `une ouverture n'existe jamais en immersion - elle vient d'un chrome visible`() {
        val state = FullscreenChromeState.of(isImmersive = true, overlay = FullscreenOverlay.Reply)

        assertThat(state.isImmersive).isFalse()
        assertThat(state.overlay).isEqualTo(FullscreenOverlay.Reply)
    }

    @Test
    fun `l'immersion cache le chrome et ses voiles`() {
        assertThat(immersive.showsChrome).isFalse()
        assertThat(immersive.showsScrims).isFalse()
    }

    @Test
    fun `une ouverture voile le reste du chrome et les voiles de lisibilite avec lui`() {
        assertThat(withReactions.showsChrome).isFalse()
        assertThat(withReactions.showsScrims).isFalse()
    }

    @Test
    fun `deux etats de memes champs sont egaux`() {
        assertThat(FullscreenChromeState.of(isImmersive = true)).isEqualTo(immersive)
        assertThat(FullscreenChromeState.of(overlay = FullscreenOverlay.Panel("a")))
            .isEqualTo(FullscreenChromeState.of(overlay = FullscreenOverlay.Panel("a")))
        assertThat(FullscreenChromeState.of(overlay = FullscreenOverlay.Panel("a")))
            .isNotEqualTo(FullscreenChromeState.of(overlay = FullscreenOverlay.Panel("b")))
    }

    // --- un tap sur le média ---------------------------------------------------------------

    @Test
    fun `un tap sur le media bascule l'immersion`() {
        val hidden = FullscreenChromeState.Initial.tappingMedia()
        val shown = hidden.tappingMedia()

        assertThat(hidden.isImmersive).isTrue()
        assertThat(shown.isImmersive).isFalse()
    }

    @Test
    fun `un tap sur le media referme d'abord ce qui est ouvert, sans basculer l'immersion`() {
        val closed = withReactions.tappingMedia()

        assertThat(closed.overlay).isNull()
        assertThat(closed.isImmersive).isFalse()
        assertThat(closed.showsChrome).isTrue()
    }

    // --- ouvrir, basculer, refermer --------------------------------------------------------

    @Test
    fun `ouvrir reactions est une ouverture, pas une immersion`() {
        val state = FullscreenChromeState.Initial.opening(FullscreenOverlay.Reactions)

        assertThat(state.isOpen(FullscreenOverlay.Reactions)).isTrue()
        assertThat(state.isImmersive).isFalse()
    }

    @Test
    fun `ouvrir une surface congedie l'autre - la rangee d'emojis ne flotte jamais au-dessus du champ de saisie`() {
        assertThat(withReactions.opening(FullscreenOverlay.Reply).overlay).isEqualTo(FullscreenOverlay.Reply)
        assertThat(withReply.opening(FullscreenOverlay.Reactions).overlay).isEqualTo(FullscreenOverlay.Reactions)
        assertThat(withReactions.opening(FullscreenOverlay.Panel("translations")).isOpen(FullscreenOverlay.Reactions))
            .isFalse()
    }

    @Test
    fun `ouvrir depuis l'immersion rend le chrome en le voilant`() {
        val state = immersive.opening(FullscreenOverlay.Reactions)

        assertThat(state.isImmersive).isFalse()
        assertThat(state.isOpen(FullscreenOverlay.Reactions)).isTrue()
    }

    @Test
    fun `le meme bouton ouvre et referme sa surface`() {
        val opened = FullscreenChromeState.Initial.toggling(FullscreenOverlay.Reply)
        val closed = opened.toggling(FullscreenOverlay.Reply)

        assertThat(opened.isOpen(FullscreenOverlay.Reply)).isTrue()
        assertThat(closed.overlay).isNull()
    }

    @Test
    fun `basculer une autre surface remplace celle qui est ouverte`() {
        val swapped = withReactions.toggling(FullscreenOverlay.Panel("comments"))

        assertThat(swapped.isOpen(FullscreenOverlay.Panel("comments"))).isTrue()
        assertThat(swapped.isOpen(FullscreenOverlay.Reactions)).isFalse()
    }

    @Test
    fun `deux panneaux de noms differents sont deux surfaces differentes`() {
        assertThat(withPanel.isOpen(FullscreenOverlay.Panel("comments"))).isTrue()
        assertThat(withPanel.isOpen(FullscreenOverlay.Panel("views"))).isFalse()
    }

    @Test
    fun `fermer l'ouverture garde l'etat d'immersion - ici aucune`() {
        val closed = withPanel.closingOverlay()

        assertThat(closed).isEqualTo(FullscreenChromeState.Initial)
    }

    // --- ramener le chrome, changer de page ------------------------------------------------

    @Test
    fun `reveler ramene le chrome sans rien fermer`() {
        assertThat(immersive.revealing().showsChrome).isTrue()
        assertThat(withReply.revealing().overlay).isEqualTo(FullscreenOverlay.Reply)
    }

    @Test
    fun `changer de page retire l'ouverture mais garde l'immersion`() {
        assertThat(withReactions.turningPage().overlay).isNull()
        assertThat(immersive.turningPage().isImmersive).isTrue()
        assertThat(FullscreenChromeState.Initial.turningPage()).isEqualTo(FullscreenChromeState.Initial)
    }

    // --- l'effacement automatique ----------------------------------------------------------

    @Test
    fun `l'effacement automatique n'existe que pendant une lecture`() {
        assertThat(FullscreenChromeState.Initial.autoHideDelay(isPlaying = true)).isEqualTo(3.seconds)
        assertThat(FullscreenChromeState.Initial.autoHideDelay(isPlaying = false)).isNull()
    }

    @Test
    fun `une image ne s'efface jamais d'elle-meme`() {
        assertThat(FullscreenChromeState.Initial.autoHideDelay(isPlaying = false)).isNull()
    }

    @Test
    fun `rien n'est arme quand le chrome est deja efface ou qu'une surface est ouverte`() {
        assertThat(immersive.autoHideDelay(isPlaying = true)).isNull()
        assertThat(withReactions.autoHideDelay(isPlaying = true)).isNull()
        assertThat(withPanel.autoHideDelay(isPlaying = true)).isNull()
    }

    @Test
    fun `au terme du delai le chrome passe en immersion`() {
        assertThat(FullscreenChromeState.Initial.autoHiding()).isEqualTo(immersive)
    }

    @Test
    fun `une ouverture survenue entre-temps gagne sur l'effacement automatique`() {
        assertThat(withReply.autoHiding()).isEqualTo(withReply)
    }
}

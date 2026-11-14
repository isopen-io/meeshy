package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Vue P17 (`docs/product/appels-vue-finale.md`) et iOS `IncomingCallChoices` : ce que propose l'écran d'appel entrant. */
class IncomingCallChoicesTest {

    @Test
    fun `un appel video propose Refuser, Sans video puis Repondre, Repondre au bord droit sous le pouce`() {
        assertThat(IncomingCallChoices.actions(isVideoCall = true))
            .containsExactly(IncomingCallAction.Decline, IncomingCallAction.AnswerWithoutVideo, IncomingCallAction.Accept)
            .inOrder()
    }

    @Test
    fun `un appel audio n'a pas de Sans video`() {
        assertThat(IncomingCallChoices.actions(isVideoCall = false))
            .containsExactly(IncomingCallAction.Decline, IncomingCallAction.Accept)
            .inOrder()
    }

    @Test
    fun `trois boutons se resserrent pour tenir sur un ecran etroit, deux gardent leur respiration`() {
        assertThat(IncomingCallChoices.buttonSpacingDp(count = 3)).isEqualTo(36)
        assertThat(IncomingCallChoices.buttonSpacingDp(count = 2)).isEqualTo(60)
    }

    @Test
    fun `P17_1 - le disque de l'appelant ne se pose pas sur son visage`() {
        assertThat(IncomingCallChoices.showsCallerDisc(previewPlaysVideo = true)).isFalse()
        assertThat(IncomingCallChoices.showsCallerDisc(previewPlaysVideo = false)).isTrue()
    }

    @Test
    fun `P17_5 - ma vignette n'existe que pour un appel video, une piste vivante et la camera choisie`() {
        assertThat(IncomingCallChoices.showsSelfPreview(isVideoCall = true, hasLocalVideoTrack = true, cameraChosen = true)).isTrue()
        assertThat(IncomingCallChoices.showsSelfPreview(isVideoCall = false, hasLocalVideoTrack = true, cameraChosen = true)).isFalse()
        assertThat(IncomingCallChoices.showsSelfPreview(isVideoCall = true, hasLocalVideoTrack = false, cameraChosen = true)).isFalse()
        assertThat(IncomingCallChoices.showsSelfPreview(isVideoCall = true, hasLocalVideoTrack = true, cameraChosen = false)).isFalse()
    }

    @Test
    fun `P17_5 - ma vignette se fond, et sous Reduire les animations le fondu reste court mais jamais nul`() {
        assertThat(IncomingCallChoices.selfPreviewFadeMillis(reduceMotion = false)).isEqualTo(250)
        assertThat(IncomingCallChoices.selfPreviewFadeMillis(reduceMotion = true)).isEqualTo(CallChromeStow.REDUCED_FADE_MILLIS)
        assertThat(IncomingCallChoices.selfPreviewFadeMillis(reduceMotion = true)).isGreaterThan(0)
    }

    @Test
    fun `P17_6 - la barre d'avant le decroche n'existe que pour un appel video`() {
        assertThat(IncomingCallChoices.showsPreAnswerBar(isVideoCall = true)).isTrue()
        assertThat(IncomingCallChoices.showsPreAnswerBar(isVideoCall = false)).isFalse()
    }

    @Test
    fun `P17_4 - la graine de ma couleur est mon identifiant, sans identifiant aucune couleur n'est inventee`() {
        assertThat(IncomingCallChoices.selfColorKey("u-42")).isEqualTo("u-42")
        assertThat(IncomingCallChoices.selfColorKey("")).isNull()
        assertThat(IncomingCallChoices.selfColorKey("  ")).isNull()
        assertThat(IncomingCallChoices.selfColorKey(null)).isNull()
    }

    @Test
    fun `P17_11 - Repondre annonce un telephone des que la reponse part sans video`() {
        assertThat(IncomingCallChoices.acceptGlyph(isVideoCall = true, route = IncomingPreAnswer.Route.AsOffered)).isEqualTo(IncomingAcceptGlyph.Video)
        assertThat(IncomingCallChoices.acceptGlyph(isVideoCall = true, route = IncomingPreAnswer.Route.WithoutVideo)).isEqualTo(IncomingAcceptGlyph.Phone)
        assertThat(IncomingCallChoices.acceptGlyph(isVideoCall = false, route = IncomingPreAnswer.Route.AsOffered)).isEqualTo(IncomingAcceptGlyph.Phone)
    }

    @Test
    fun `P17_2 - la disposition video pose la puce du type au-dessus du nom, l'audio garde la sienne`() {
        assertThat(IncomingCallLayout.of(isVideoCall = true)).isEqualTo(IncomingCallLayout.VideoPreview)
        assertThat(IncomingCallLayout.of(isVideoCall = false)).isEqualTo(IncomingCallLayout.Audio)
        assertThat(IncomingCallLayout.VideoPreview.showsTypeChipAboveName).isTrue()
        assertThat(IncomingCallLayout.Audio.showsTypeChipAboveName).isFalse()
        assertThat(IncomingCallLayout.Audio.showsTypeLineAndBadge).isTrue()
        assertThat(IncomingCallLayout.VideoPreview.showsTypeLineAndBadge).isFalse()
    }
}

package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Portage de `CallModeGestureRule` (iOS `CallModeRules.swift`, #8625) : le choix affiché SE
 * déclenche — deux tapes prennent la photo, un appui long filme ; un autre choix se prend d'un
 * toucher ; pendant le film, seul le bouton stop l'arrête.
 */
class CallModeGestureRuleTest {

    @Test
    fun `sur le choix affiche, deux tapes photographient et un appui long filme`() {
        assertThat(CallModeGestureRule.outcome(CallModeGesture.DOUBLE_TAP, isSelected = true, isRecording = false))
            .isEqualTo(CallModeGestureOutcome.CAPTURE_PHOTO)
        assertThat(CallModeGestureRule.outcome(CallModeGesture.LONG_PRESS, isSelected = true, isRecording = false))
            .isEqualTo(CallModeGestureOutcome.START_RECORDING)
    }

    @Test
    fun `un simple toucher sur le choix affiche ne declenche rien`() {
        assertThat(CallModeGestureRule.outcome(CallModeGesture.TAP, isSelected = true, isRecording = false))
            .isEqualTo(CallModeGestureOutcome.NONE)
    }

    @Test
    fun `tout geste sur un autre choix le choisit, meme pendant le film`() {
        CallModeGesture.entries.forEach { gesture ->
            assertThat(CallModeGestureRule.outcome(gesture, isSelected = false, isRecording = false)).isEqualTo(CallModeGestureOutcome.SELECT)
            assertThat(CallModeGestureRule.outcome(gesture, isSelected = false, isRecording = true)).isEqualTo(CallModeGestureOutcome.SELECT)
        }
    }

    @Test
    fun `pendant le film, aucun geste ne declenche de prise`() {
        CallModeGesture.entries.forEach { gesture ->
            assertThat(CallModeGestureRule.outcome(gesture, isSelected = true, isRecording = true)).isEqualTo(CallModeGestureOutcome.NONE)
        }
    }

    @Test
    fun `les prises ne s'ecoutent que sur le choix affiche, hors film`() {
        assertThat(CallModeGestureRule.listensForShots(isSelected = true, isRecording = false)).isTrue()
        assertThat(CallModeGestureRule.listensForShots(isSelected = true, isRecording = true)).isFalse()
        assertThat(CallModeGestureRule.listensForShots(isSelected = false, isRecording = false)).isFalse()
    }

    @Test
    fun `l'astuce des gestes se montre tant qu'elle n'a pas servi, jamais pendant le film`() {
        assertThat(CallModeGestureRule.showsHint(hasSeenHint = false, isRecording = false)).isTrue()
        assertThat(CallModeGestureRule.showsHint(hasSeenHint = true, isRecording = false)).isFalse()
        assertThat(CallModeGestureRule.showsHint(hasSeenHint = false, isRecording = true)).isFalse()
    }

    @Test
    fun `l'appui long dure 450 ms, comme sur iOS`() {
        assertThat(CallModeGestureRule.LONG_PRESS_MILLIS).isEqualTo(450L)
    }

    @Test
    fun `le chrono du film se lit en minutes et secondes, puis en heures`() {
        assertThat(CallModeGestureRule.clock(0)).isEqualTo("0:00")
        assertThat(CallModeGestureRule.clock(7_400)).isEqualTo("0:07")
        assertThat(CallModeGestureRule.clock(65_000)).isEqualTo("1:05")
        assertThat(CallModeGestureRule.clock(3_725_000)).isEqualTo("1:02:05")
    }

    @Test
    fun `un chrono negatif se lit comme zero`() {
        assertThat(CallModeGestureRule.clock(-5_000)).isEqualTo("0:00")
    }

    @Test
    fun `sur la piste, seul l'element choisi ET centre se declenche, jamais pendant le film`() {
        assertThat(CallModeGestureRule.listensOnTrack(isSelected = true, isCentred = true, isRecording = false)).isTrue()
        assertThat(CallModeGestureRule.listensOnTrack(isSelected = true, isCentred = false, isRecording = false)).isFalse()
        assertThat(CallModeGestureRule.listensOnTrack(isSelected = false, isCentred = true, isRecording = false)).isFalse()
        assertThat(CallModeGestureRule.listensOnTrack(isSelected = true, isCentred = true, isRecording = true)).isFalse()
    }
}

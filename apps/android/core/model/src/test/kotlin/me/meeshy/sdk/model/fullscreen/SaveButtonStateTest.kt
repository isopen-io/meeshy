package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import kotlin.time.Duration.Companion.seconds
import org.junit.Test

class SaveButtonStateTest {

    @Test
    fun `idle puis saving puis saved`() {
        val saving = SaveButtonState.IDLE.started()
        assertThat(saving).isEqualTo(SaveButtonState.SAVING)
        assertThat(saving.finished(success = true)).isEqualTo(SaveButtonState.SAVED)
    }

    @Test
    fun `un echec donne failed`() {
        assertThat(SaveButtonState.SAVING.finished(success = false)).isEqualTo(SaveButtonState.FAILED)
    }

    @Test
    fun `saved et failed reviennent a idle apres deux secondes`() {
        assertThat(SaveButtonState.SAVED.settleDelay).isEqualTo(2.seconds)
        assertThat(SaveButtonState.FAILED.settleDelay).isEqualTo(2.seconds)
        assertThat(SaveButtonState.SAVED.settled()).isEqualTo(SaveButtonState.IDLE)
        assertThat(SaveButtonState.FAILED.settled()).isEqualTo(SaveButtonState.IDLE)
    }

    @Test
    fun `idle et saving n'ont rien a regler`() {
        assertThat(SaveButtonState.IDLE.settleDelay).isNull()
        assertThat(SaveButtonState.SAVING.settleDelay).isNull()
        assertThat(SaveButtonState.SAVING.settled()).isEqualTo(SaveButtonState.SAVING)
    }

    @Test
    fun `pas de double enregistrement`() {
        assertThat(SaveButtonState.SAVING.started()).isEqualTo(SaveButtonState.SAVING)
        assertThat(SaveButtonState.SAVED.started()).isEqualTo(SaveButtonState.SAVED)
        assertThat(SaveButtonState.FAILED.started()).isEqualTo(SaveButtonState.SAVING)
        assertThat(SaveButtonState.IDLE.finished(true)).isEqualTo(SaveButtonState.IDLE)
    }
}

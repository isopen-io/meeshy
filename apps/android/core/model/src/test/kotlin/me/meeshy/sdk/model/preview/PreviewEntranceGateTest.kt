package me.meeshy.sdk.model.preview

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PreviewEntranceGateTest {

    @Test
    fun `a new last message on a composed row plays`() {
        assertThat(shouldPlayEntrance(previousId = "m1", currentId = "m2", reduceMotion = false, powerSave = false)).isTrue()
    }

    @Test
    fun `the first message arriving in an empty conversation plays`() {
        assertThat(shouldPlayEntrance(previousId = null, currentId = "m1", reduceMotion = false, powerSave = false)).isTrue()
    }

    @Test
    fun `the same message never plays again`() {
        assertThat(shouldPlayEntrance(previousId = "m1", currentId = "m1", reduceMotion = false, powerSave = false)).isFalse()
    }

    @Test
    fun `a row losing its last message plays nothing`() {
        assertThat(shouldPlayEntrance(previousId = "m1", currentId = null, reduceMotion = false, powerSave = false)).isFalse()
        assertThat(shouldPlayEntrance(previousId = null, currentId = null, reduceMotion = false, powerSave = false)).isFalse()
    }

    @Test
    fun `reduce motion plays nothing`() {
        assertThat(shouldPlayEntrance(previousId = "m1", currentId = "m2", reduceMotion = true, powerSave = false)).isFalse()
    }

    @Test
    fun `power save plays nothing`() {
        assertThat(shouldPlayEntrance(previousId = "m1", currentId = "m2", reduceMotion = false, powerSave = true)).isFalse()
    }
}

package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DocumentSheetPolicyTest {

    @Test
    fun `un document ordinaire s'enregistre, se partage et se copie`() {
        val policy = DocumentSheetPolicy.of(isProtected = false)
        assertThat(policy.mayLeave).isTrue()
        assertThat(policy.secureWindow).isFalse()
    }

    @Test
    fun `un document protege ne sort pas et ferme la fenetre aux captures`() {
        val policy = DocumentSheetPolicy.of(isProtected = true)
        assertThat(policy.mayLeave).isFalse()
        assertThat(policy.secureWindow).isTrue()
    }
}

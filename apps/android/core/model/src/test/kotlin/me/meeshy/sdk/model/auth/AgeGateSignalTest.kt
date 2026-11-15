package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AgeGateSignalTest {
    @Test
    fun `un 403 AGE_BELOW_MINIMUM leve le signal`() {
        assertThat(AgeGateSignal.isAgeRefusal(403, """{"success":false,"code":"AGE_BELOW_MINIMUM"}""")).isTrue()
    }

    @Test
    fun `tout autre 403 reste local a son ecran`() {
        assertThat(AgeGateSignal.isAgeRefusal(403, """{"code":"FORBIDDEN"}""")).isFalse()
        assertThat(AgeGateSignal.isAgeRefusal(403, """{"error":"nope"}""")).isFalse()
        assertThat(AgeGateSignal.isAgeRefusal(403, "pas du json")).isFalse()
        assertThat(AgeGateSignal.isAgeRefusal(403, null)).isFalse()
    }

    @Test
    fun `le code sous un autre statut ne leve rien`() {
        assertThat(AgeGateSignal.isAgeRefusal(401, """{"code":"AGE_BELOW_MINIMUM"}""")).isFalse()
        assertThat(AgeGateSignal.isAgeRefusal(200, """{"code":"AGE_BELOW_MINIMUM"}""")).isFalse()
    }
}

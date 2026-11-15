package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameErrorTextsTest {

    @Test
    fun `chaque code a sa propre phrase`() {
        val keys = GameErrorCode.entries.map { GameErrorTexts.forCode(it).key }
        assertThat(keys).containsNoDuplicates()
        assertThat(keys).doesNotContain(GameTextKey.ErrorGeneric)
    }

    @Test
    fun `un code inconnu retombe sur la phrase generique`() {
        assertThat(GameErrorTexts.forCode(GameErrorCode.fromWire("FUTURE_CODE")).key).isEqualTo(GameTextKey.ErrorGeneric)
        assertThat(GameErrorTexts.forCode(null).key).isEqualTo(GameTextKey.ErrorGeneric)
    }
}

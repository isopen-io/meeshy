package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameWriteParser
import me.meeshy.sdk.model.game.MeeshEdition
import org.junit.Test

class MeeshMintResultTest {

    private fun mint(json: String): MeeshMintResult = GameWriteParser.mint(json)!!

    @Test
    fun `une frappe reussie porte solde numero edition et niveaux`() {
        val r = mint("""{"success":true,"data":{"status":"minted","balance":4,"mintedLifetime":9,"number":9,"edition":"gold","price":1221,"gloryGained":25,"levelBefore":3,"levelAfter":4,"gameRevision":1700000000000}}""")

        assertThat(r.outcome).isEqualTo(MeeshMintOutcome.MINTED)
        assertThat(r.number).isEqualTo(9)
        assertThat(r.edition).isEqualTo(MeeshEdition.Gold)
        assertThat(r.levelAfter).isEqualTo(4)
    }

    @Test
    fun `une frappe deja faite se lit comme telle`() {
        assertThat(mint("""{"status":"already-minted","number":3}""").outcome).isEqualTo(MeeshMintOutcome.ALREADY_MINTED)
    }

    @Test
    fun `un solde insuffisant est classe`() {
        assertThat(mint("""{"status":"insufficient"}""").outcome).isEqualTo(MeeshMintOutcome.INSUFFICIENT)
    }

    @Test
    fun `une matiere inconnue ne fait pas echouer une frappe deja faite`() {
        val r = mint("""{"status":"minted","number":5,"edition":"diamond"}""")

        assertThat(r.number).isEqualTo(5)
        assertThat(r.edition).isNull()
    }

    @Test
    fun `devant un serveur anterieur le marqueur d ordre est absent`() {
        val r = mint("""{"status":"minted"}""")

        assertThat(r.gameRevision).isNull()
        assertThat(r.balance).isNull()
        assertThat(r.price).isNull()
    }

    @Test
    fun `un statut inconnu reste inconnu`() {
        assertThat(mint("""{"status":"weird"}""").outcome).isEqualTo(MeeshMintOutcome.UNKNOWN)
    }
}

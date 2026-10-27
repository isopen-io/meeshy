package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameGestureLawsTest {

    private fun ids(): GameIntentIds {
        var next = 0
        return GameIntentIds { "id-${++next}" }
    }

    @Test
    fun `une intention garde son identifiant sur les reessais`() {
        val ids = ids()

        val first = ids.idFor("chest")

        assertThat(ids.idFor("chest")).isEqualTo(first)
        assertThat(ids.idFor("chest")).isEqualTo(first)
    }

    @Test
    fun `deux intentions n ont jamais le meme identifiant`() {
        val ids = ids()

        assertThat(ids.idFor("reroll:a")).isNotEqualTo(ids.idFor("reroll:b"))
    }

    @Test
    fun `l identifiant ne se renouvelle qu apres avoir ete depense`() {
        val ids = ids()
        val first = ids.idFor("seal")

        ids.spent("seal")

        assertThat(ids.idFor("seal")).isNotEqualTo(first)
    }

    @Test
    fun `depenser une intention laisse les autres intactes`() {
        val ids = ids()
        val chest = ids.idFor("chest")
        ids.idFor("seal")

        ids.spent("seal")

        assertThat(ids.idFor("chest")).isEqualTo(chest)
    }

    @Test
    fun `toute reponse de la passerelle relit l etat, seule une coupure ne relit rien`() {
        assertThat(GameRefusalLaw.refreshesAfter("CHEST_NOT_READY")).isTrue()
        assertThat(GameRefusalLaw.refreshesAfter("FUTURE_CODE")).isTrue()
        assertThat(GameRefusalLaw.refreshesAfter("PARSE")).isTrue()
        assertThat(GameRefusalLaw.refreshesAfter(null)).isTrue()
        assertThat(GameRefusalLaw.refreshesAfter("NETWORK")).isFalse()
        assertThat(GameRefusalLaw.isOffline("NETWORK")).isTrue()
    }

    @Test
    fun `seul REQUEST_ID_CONFLICT libere l identifiant`() {
        assertThat(GameRefusalLaw.releasesId("REQUEST_ID_CONFLICT")).isTrue()
        assertThat(GameRefusalLaw.releasesId("CHEST_NOT_READY")).isFalse()
        assertThat(GameRefusalLaw.releasesId(null)).isFalse()
    }

    @Test
    fun `un segment de chemin n ouvre ni point ni barre ni requete`() {
        assertThat(GamePathSegments.isSafe("65f0a1b2c3d4e5f6a7b8c9d0")).isTrue()
        assertThat(GamePathSegments.isSafe("m-17_x~")).isTrue()
        assertThat(GamePathSegments.isSafe("..")).isFalse()
        assertThat(GamePathSegments.isSafe("a/b")).isFalse()
        assertThat(GamePathSegments.isSafe("a?b")).isFalse()
        assertThat(GamePathSegments.isSafe("")).isFalse()
    }

    @Test
    fun `un refus du contrat est definitif, une coupure ou un code inconnu ne jugent rien`() {
        assertThat(GameRefusalLaw.isDefinitive("INSUFFICIENT_MEESHES")).isTrue()
        assertThat(GameRefusalLaw.isDefinitive(GameRefusalLaw.OFFLINE_CODE)).isFalse()
        assertThat(GameRefusalLaw.isDefinitive("INTERNAL_SERVER_ERROR")).isFalse()
        assertThat(GameRefusalLaw.isDefinitive(null)).isFalse()
    }
}

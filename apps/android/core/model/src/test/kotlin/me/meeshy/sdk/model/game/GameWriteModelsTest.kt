package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.game.GameBlockFixtures.json
import org.junit.Test

class GameWriteModelsTest {

    private val missionJson = """{"id":"m9","templateKey":"t","difficulty":"hard","signal":"axis:x","prism":true,
        "target":3,"progress":0,"reward":900,"glory":90,"completedAt":null}"""

    @Test
    fun `la requete d'ecriture porte le requestId et rien d'autre`() {
        assertThat(json.encodeToString(GameWriteRequest("req-12345678"))).isEqualTo("""{"requestId":"req-12345678"}""")
        assertThat(json.encodeToString(GuideSeenRequest("req-12345678", listOf("a", "b"))))
            .isEqualTo("""{"requestId":"req-12345678","keys":["a","b"]}""")
    }

    @Test
    fun `la garde de prix de la frappe n'est envoyee que lorsqu'elle est posee`() {
        assertThat(json.encodeToString(MeeshMintRequest("req-12345678"))).isEqualTo("""{"requestId":"req-12345678"}""")
        assertThat(json.encodeToString(MeeshMintRequest("req-12345678", payWith = "points", maxPrice = 1588)))
            .isEqualTo("""{"requestId":"req-12345678","payWith":"points","maxPrice":1588}""")
    }

    @Test
    fun `la reponse de reroll se lit sous son enveloppe ou nue`() {
        val bare = GameWriteParser.rerollMission("""{"mission":$missionJson,"balance":4}""")!!
        val wrapped = GameWriteParser.rerollMission("""{"success":true,"data":{"mission":$missionJson,"balance":4}}""")!!

        assertThat(bare).isEqualTo(wrapped)
        assertThat(bare.mission.id).isEqualTo("m9")
        assertThat(bare.balance).isEqualTo(4L)
    }

    @Test
    fun `un compte annexe absent ne fait pas echouer une ecriture deja faite`() {
        assertThat(GameWriteParser.rerollMission("""{"mission":$missionJson}""")!!.balance).isNull()
        assertThat(GameWriteParser.buyFlameFreeze("""{"status":"bought"}""")!!.freezes).isNull()
        assertThat(GameWriteParser.relightFlame("""{"status":"relit"}""")!!.streak).isNull()
        assertThat(GameWriteParser.markGuideSeen("""{}""")!!.guideSeen).isEmpty()
    }

    @Test
    fun `le coffre ouvert se lit avec ou sans les champs d'apres 10011`() {
        val modern = GameWriteParser.claimChest(
            """{"status":"claimed","reward":{"points":1721,"fragment":true,"freeze":false,"glory":172,
                "bonus":"whole","bonusPoints":1221},"score":9000,"starFragments":{"collected":5}}""",
        )!!
        val old = GameWriteParser.claimChest("""{"status":"already-claimed","reward":{"points":600,"fragment":false,"freeze":true}}""")!!

        assertThat(modern.reward.bonus).isEqualTo(ChestBonus.Whole)
        assertThat(modern.starFragments!!.collected).isEqualTo(5)
        assertThat(modern.alreadyDone).isFalse()
        assertThat(old.alreadyDone).isTrue()
        assertThat(old.reward.glory).isEqualTo(0)
        assertThat(old.reward.bonus).isNull()
        assertThat(old.score).isNull()
    }

    @Test
    fun `une prime de coffre inconnue se lit null sans perdre le coffre`() {
        val chest = GameWriteParser.claimChest(
            """{"status":"claimed","reward":{"points":10,"fragment":false,"freeze":false,"bonus":"triple"},"score":1}""",
        )!!

        assertThat(chest.reward.bonus).isNull()
        assertThat(chest.reward.points).isEqualTo(10)
    }

    @Test
    fun `un statut inconnu reste une chaine et alreadyDone lit le prefixe`() {
        val freeze = GameWriteParser.buyFlameFreeze("""{"status":"already-bought","freezes":2,"balance":9}""")!!
        val future = GameWriteParser.relightFlame("""{"status":"relit-with-bonus","streak":8,"balance":1}""")!!

        assertThat(freeze.alreadyDone).isTrue()
        assertThat(future.status).isEqualTo("relit-with-bonus")
        assertThat(future.alreadyDone).isFalse()
    }

    @Test
    fun `une edition inconnue sur une frappe deja faite se lit null sans echec`() {
        val mint = GameWriteParser.mint(
            """{"status":"minted","balance":3,"mintedLifetime":14,"number":14,"edition":"obsidian","price":1588,
                "ladder":{"levelBefore":100,"levelAfter":101},"gameRevision":42,"unknownFuture":{"a":1}}""",
        )!!

        assertThat(mint.edition).isNull()
        assertThat(mint.number).isEqualTo(14)
        assertThat(mint.ladder).isEqualTo(GameMintResultLadder(100, 101))
        assertThat(mint.gameRevision).isEqualTo(42)
    }

    @Test
    fun `une frappe d'un ancien serveur sans champs etendus se lit`() {
        val mint = GameWriteParser.mint("""{"status":"already-minted","balance":3,"mintedLifetime":14}""")!!

        assertThat(mint.alreadyDone).isTrue()
        assertThat(mint.price).isNull()
        assertThat(mint.edition).isNull()
    }

    @Test
    fun `un corps absent ou illisible rend null`() {
        assertThat(GameWriteParser.rerollMission(null)).isNull()
        assertThat(GameWriteParser.rerollMission("{")).isNull()
        assertThat(GameWriteParser.rerollMission("""{"balance":1}""")).isNull()
        assertThat(GameWriteParser.claimChest("""{"status":"claimed"}""")).isNull()
        assertThat(GameWriteParser.markGuideSeen("[]")).isNull()
    }

    @Test
    fun `les reponses s'aller-retournent en JSON avec toutes leurs cles optionnelles a null`() {
        val reroll = GameWriteParser.rerollMission("""{"mission":$missionJson}""")!!
        val chest = GameWriteParser.claimChest("""{"status":"claimed","reward":{"points":1,"fragment":false,"freeze":false}}""")!!
        val mint = GameWriteParser.mint("""{"status":"minted"}""")!!

        val rerollTree = json.parseToJsonElement(json.encodeToString(reroll)) as JsonObject
        val chestTree = json.parseToJsonElement(json.encodeToString(chest)) as JsonObject
        val mintTree = json.parseToJsonElement(json.encodeToString(mint)) as JsonObject

        assertThat(rerollTree["balance"]).isEqualTo(JsonNull)
        assertThat((rerollTree["mission"] as JsonObject)["completedAt"]).isEqualTo(JsonNull)
        assertThat(chestTree["starFragments"]).isEqualTo(JsonNull)
        assertThat(mintTree["edition"]).isEqualTo(JsonNull)
        assertThat(GameWriteParser.rerollMission(json.encodeToString(reroll))).isEqualTo(reroll)
        assertThat(GameWriteParser.claimChest(json.encodeToString(chest))).isEqualTo(chest)
        assertThat(GameWriteParser.mint(json.encodeToString(mint))).isEqualTo(mint)
    }
}

package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

/** Les interrupteurs de la fiche d'un lien (#16836) — iso `CirclePersonSwitch` (iOS) et `CircleReceptionBlockSwitch` (web). */
class RelationPersonSwitchTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    @Test
    fun `l'accord de l'ecoute est lu, et un serveur plus ancien qui ne le sert pas vaut non accorde`() {
        val granted = json.decodeFromString<RelationPersonSettings>("""{"userId":"u2","listeningCategoryShared":true}""")
        val older = json.decodeFromString<RelationPersonSettings>("""{"userId":"u2","bringBlocked":true}""")

        assertThat(granted.isGranted(RelationShareGrant.LISTENING_CATEGORY)).isTrue()
        assertThat(older.isGranted(RelationShareGrant.LISTENING_CATEGORY)).isFalse()
    }

    @Test
    fun `un interrupteur de reception est allume par un blocage, un interrupteur de partage par un accord`() {
        val settings = RelationPersonSettings("u2", bringBlocked = true, talkieBlocked = false, listeningCategoryShared = true)

        assertThat(RelationPersonSwitch.Reception(RelationReceptionSetting.BRING).isOn(settings)).isTrue()
        assertThat(RelationPersonSwitch.Reception(RelationReceptionSetting.TALKIE).isOn(settings)).isFalse()
        assertThat(RelationPersonSwitch.Share(RelationShareGrant.LISTENING_CATEGORY).isOn(settings)).isTrue()
    }

    @Test
    fun `le corps de l'accord n'ecrit que son propre champ`() {
        assertThat(json.encodeToString(ListeningCategoryShareBody(true))).isEqualTo("""{"listeningCategoryShared":true}""")
    }

    @Test
    fun `ce que j'ecoute est un interrupteur actif des Proche, la position reste a venir`() {
        assertThat(CirclePersonSetting.LISTENING.personSwitch)
            .isEqualTo(RelationPersonSwitch.Share(RelationShareGrant.LISTENING_CATEGORY))
        assertThat(CirclePersonSetting.BLOCK_BRING.personSwitch)
            .isEqualTo(RelationPersonSwitch.Reception(RelationReceptionSetting.BRING))
        assertThat(CirclePersonSetting.TALKIE.personSwitch)
            .isEqualTo(RelationPersonSwitch.Reception(RelationReceptionSetting.TALKIE))
        assertThat(CirclePersonSetting.LIVE_LOCATION.personSwitch).isNull()
        assertThat(CirclePersonSetting.offered(RelationLevel.FRIEND)).doesNotContain(CirclePersonSetting.LISTENING)
        assertThat(CirclePersonSetting.offered(RelationLevel.CLOSE)).contains(CirclePersonSetting.LISTENING)
    }

    @Test
    fun `les blocages d'un collegue sans lien restent des receptions, sans partage`() {
        assertThat(CirclePersonSetting.receptionAt(RelationLevel.BLOOD))
            .containsExactly(RelationReceptionSetting.BRING, RelationReceptionSetting.TALKIE, RelationReceptionSetting.TOGETHER)
            .inOrder()
    }

    @Test
    fun `la coupure des invitations ensemble est lue, et un serveur plus ancien qui ne la sert pas vaut ouverte`() {
        val cut = json.decodeFromString<RelationPersonSettings>("""{"userId":"u2","togetherBlocked":true}""")
        val older = json.decodeFromString<RelationPersonSettings>("""{"userId":"u2","talkieBlocked":true}""")

        assertThat(cut.isBlocked(RelationReceptionSetting.TOGETHER)).isTrue()
        assertThat(cut.isBlocked(RelationReceptionSetting.TALKIE)).isFalse()
        assertThat(older.isBlocked(RelationReceptionSetting.TOGETHER)).isFalse()
    }

    @Test
    fun `le corps de la coupure ensemble n'ecrit que son propre champ`() {
        assertThat(json.encodeToString(TogetherBlockBody(true))).isEqualTo("""{"togetherBlocked":true}""")
    }

    @Test
    fun `couper les invitations ensemble s'ouvre des Proche, juste apres le talkie`() {
        assertThat(CirclePersonSetting.TOGETHER.personSwitch)
            .isEqualTo(RelationPersonSwitch.Reception(RelationReceptionSetting.TOGETHER))
        assertThat(CirclePersonSetting.offered(RelationLevel.FRIEND)).doesNotContain(CirclePersonSetting.TOGETHER)
        val close = CirclePersonSetting.offered(RelationLevel.CLOSE)
        assertThat(close.indexOf(CirclePersonSetting.TOGETHER)).isEqualTo(close.indexOf(CirclePersonSetting.TALKIE) + 1)
    }
}

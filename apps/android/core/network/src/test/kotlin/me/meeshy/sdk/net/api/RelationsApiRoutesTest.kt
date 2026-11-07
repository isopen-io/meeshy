package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationRitualBody
import me.meeshy.sdk.model.relation.RelationRitualConsents
import me.meeshy.sdk.model.relation.RelationRitualPhase
import org.junit.Test

/** L'appel du niveau de lien, tel qu'il part — requête capturée derrière le vrai Retrofit. */
class RelationsApiRoutesTest {

    @Test
    fun `lire le niveau appelle relations userId et decode userId et effectiveLevel`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"userId":"64b7f0c2a1b2c3d4e5f60718","effectiveLevel":"CLOSE"}}""",
        )

        val served = http.serve(RelationsApi::class.java).byUserId("64b7f0c2a1b2c3d4e5f60718").data!!

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/relations/64b7f0c2a1b2c3d4e5f60718")
        assertThat(served.userId).isEqualTo("64b7f0c2a1b2c3d4e5f60718")
        assertThat(served.effectiveLevel).isEqualTo("CLOSE")
    }

    @Test
    fun `un champ ajoute par le serveur ne casse pas la lecture`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"userId":"u","effectiveLevel":"FRIEND","since":"2026-10-01"}}""",
        )

        assertThat(http.serve(RelationsApi::class.java).byUserId("u").data!!.effectiveLevel).isEqualTo("FRIEND")
    }

    @Test
    fun `mes cercles appellent relations et lisent chaque lien`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":[{"userId":"u","effectiveLevel":"FRIEND","grantedByMe":"FRIEND",
                "since":null,"progress":{"activeWeeks":2,"needed":4,"missing":[]},"eligibleFor":null}]}""",
        )

        val served = http.serve(RelationsApi::class.java).links().data!!.single().toLink()

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/relations")
        assertThat(served.effectiveLevel).isEqualTo(RelationLevel.FRIEND)
        assertThat(served.progress.needed).isEqualTo(4)
    }

    @Test
    fun `la table des cercles appelle relations config`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"levels":[{"level":"CLOSE","labelKey":"relation.level.close","icon":"🔥",
                "labels":{"fr":"Proche","en":"Close","pt-BR":"Próximo"}}],"thresholds":{"close.activeWeeks":4},"features":{}}}""",
        )

        val config = http.serve(RelationsApi::class.java).config().data!!

        assertThat(http.only.path).isEqualTo("/api/v1/relations/config")
        assertThat(config.label(RelationLevel.CLOSE, "fr")).isEqualTo("Proche")
        assertThat(config.icon(RelationLevel.CLOSE)).isEqualTo("🔥")
        assertThat(config.label(RelationLevel.CLOSE, "pt")).isEqualTo("Próximo")
        assertThat(config.label(RelationLevel.BLOOD, "fr")).isNull()
    }

    @Test
    fun `ouvrir le rituel n'envoie ni jeton ni consentement`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"token":"t","holdWindowMs":15000}}""")

        val step = http.serve(RelationsApi::class.java)
            .ritual("u", RelationRitualBody(phase = RelationRitualPhase.START.wire)).data!!

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/relations/u/ritual")
        assertThat(http.only.body).isEqualTo("""{"phase":"start"}""")
        assertThat(step.token).isEqualTo("t")
        assertThat(step.holdWindowMs).isEqualTo(15000L)
    }

    @Test
    fun `sceller envoie le jeton et les quatre consentements explicites`() = runTest {
        val http = RecordingHttp(responseBody = """{"success":true,"data":{"completed":true,"level":"BLOOD"}}""")
        val consents = RelationRitualConsents.ALL_REFUSED.copy(listeningTitle = true)

        http.serve(RelationsApi::class.java)
            .ritual("u", RelationRitualBody(phase = RelationRitualPhase.CONFIRM.wire, token = "t", consents = consents))

        assertThat(http.only.body).isEqualTo(
            """{"phase":"confirm","token":"t","consents":{"listeningTitle":true,"locationLive":false,"locationHistory":false,"locationProximity":false}}""",
        )
    }

    @Test
    fun `retrograder poste le niveau vise sur relations userId level et lit la vue du lien`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"userId":"u","effectiveLevel":"FRIEND","grantedByMe":"FRIEND",
                "since":null,"progress":{"activeWeeks":0,"needed":4,"missing":[]},"eligibleFor":null}}""",
        )

        val served = http.serve(RelationsApi::class.java).lower("u", RelationLowerBody(level = RelationLevel.FRIEND.wire)).data!!

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/relations/u/level")
        assertThat(http.only.body).isEqualTo("""{"level":"FRIEND"}""")
        assertThat(served.toLink().effectiveLevel).isEqualTo(RelationLevel.FRIEND)
    }

    @Test
    fun `le verrou de remontee servi par relations userId se lit, et son absence ne casse rien`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"userId":"u","effectiveLevel":"FRIEND","canRaise":false,
                "raiseBlockedUntil":"2026-12-01T00:00:00.000Z"}}""",
        )

        val served = http.serve(RelationsApi::class.java).byUserId("u").data!!

        assertThat(served.canRaise).isFalse()
        assertThat(served.raiseBlockedUntil).isEqualTo("2026-12-01T00:00:00.000Z")
        val legacy = RecordingHttp(responseBody = """{"success":true,"data":{"userId":"u","effectiveLevel":"FRIEND"}}""")
        assertThat(legacy.serve(RelationsApi::class.java).byUserId("u").data!!.raiseBlockedUntil).isNull()
    }

    @Test
    fun `l'ecoute de mes liens appelle relations now-playing et lit la charge tronquee`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"items":[""" +
                """{"userId":"u1","category":"music","updatedAt":"2026-11-07T12:00:00.000Z","expiresAt":"2026-11-07T12:15:00.000Z"},""" +
                """{"userId":"u2","category":"video","title":"Un film","source":"Meeshy","updatedAt":"2026-11-07T12:00:00.000Z","expiresAt":"2026-11-07T12:15:00.000Z"}]}}""",
        )

        val served = http.serve(RelationsApi::class.java).nowPlaying().data!!

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/relations/now-playing")
        assertThat(served.items.map { Triple(it.category, it.title, it.source) })
            .containsExactly(Triple("music", null, null), Triple("video", "Un film", "Meeshy")).inOrder()
    }
}

package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class NotificationMetadataDecodingTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun decode(raw: String) = json.decodeFromString<NotificationMetadata>(raw)

    @Test
    fun `les metadonnees de pieces jointes sont lues`() {
        val m = decode(
            """{"attachments":{"count":3,"firstType":"video","firstFilename":"clip.mp4",
            "firstDurationMs":12500,"firstFileSize":2048000,"firstWidth":1080,"firstHeight":1920}}""",
        )

        val a = m.attachments!!
        assertThat(a.count).isEqualTo(3)
        assertThat(a.firstType).isEqualTo("video")
        assertThat(a.firstFilename).isEqualTo("clip.mp4")
        assertThat(a.firstDurationMs).isEqualTo(12500)
        assertThat(a.firstFileSize).isEqualTo(2048000)
        assertThat(a.firstWidth).isEqualTo(1080)
        assertThat(a.firstHeight).isEqualTo(1920)
    }

    @Test
    fun `les champs de jalon sont lus`() {
        val m = decode(
            """{"achievementKey":"achievement.first_voice","axisKey":"content.message.text",
            "threshold":1000,"level":4,"tierRank":2,"value":1000}""",
        )

        assertThat(m.achievementKey).isEqualTo("achievement.first_voice")
        assertThat(m.axisKey).isEqualTo("content.message.text")
        assertThat(m.threshold).isEqualTo(1000)
        assertThat(m.level).isEqualTo(4)
        assertThat(m.tierRank).isEqualTo(2)
        assertThat(m.value).isEqualTo(1000)
    }

    @Test
    fun `les apercus de commentaire parent, de post et l'extrait sont lus`() {
        val m = decode(
            """{"postPreview":"Mon post","parentCommentPreview":"Le parent","commentPreview":"La reponse",
            "excerpt":"Un extrait","parentCommentId":"pc1"}""",
        )

        assertThat(m.postPreview).isEqualTo("Mon post")
        assertThat(m.parentCommentPreview).isEqualTo("Le parent")
        assertThat(m.commentPreview).isEqualTo("La reponse")
        assertThat(m.excerpt).isEqualTo("Un extrait")
        assertThat(m.parentCommentId).isEqualTo("pc1")
    }

    @Test
    fun `les champs du jeu et du retrait par la moderation sont lus`() {
        val m = decode(
            """{"route":"progression","gameSection":"league","duoId":"d1","weekKey":"2026-10-19",
            "league":"jade","outcome":"promoted","cup":"gold","season":3,"step":2,"completed":true,
            "contentId":"c9","reason":"spam"}""",
        )

        assertThat(m.route).isEqualTo("progression")
        assertThat(m.gameSection).isEqualTo("league")
        assertThat(m.duoId).isEqualTo("d1")
        assertThat(m.weekKey).isEqualTo("2026-10-19")
        assertThat(m.league).isEqualTo("jade")
        assertThat(m.outcome).isEqualTo("promoted")
        assertThat(m.cup).isEqualTo("gold")
        assertThat(m.season).isEqualTo(3)
        assertThat(m.step).isEqualTo(2)
        assertThat(m.completed).isTrue()
        assertThat(m.contentId).isEqualTo("c9")
        assertThat(m.reason).isEqualTo("spam")
    }

    @Test
    fun `une ancienne notification sans ces champs se relit`() {
        val m = decode("""{"messagePreview":"Salut","postType":"POST"}""")

        assertThat(m.messagePreview).isEqualTo("Salut")
        assertThat(m.attachments).isNull()
        assertThat(m.axisKey).isNull()
        assertThat(m.threshold).isNull()
        assertThat(m.level).isNull()
        assertThat(m.tierRank).isNull()
        assertThat(m.value).isNull()
        assertThat(m.completed).isNull()
    }

    @Test
    fun `le contexte lit la duree de la premiere piece et les dates du post`() {
        val c = json.decodeFromString<NotificationContext>(
            """{"firstAttachmentDurationMs":8400,"postCreatedAt":"2026-10-01T10:00:00.000Z",
            "postExpiresAt":"2026-10-02T10:00:00.000Z"}""",
        )

        assertThat(c.firstAttachmentDurationMs).isEqualTo(8400)
        assertThat(c.postCreatedAt).isEqualTo("2026-10-01T10:00:00.000Z")
        assertThat(c.postExpiresAt).isEqualTo("2026-10-02T10:00:00.000Z")
        assertThat(json.decodeFromString<NotificationContext>("{}").postExpiresAt).isNull()
    }
}

package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import org.junit.Assert.assertThrows
import org.junit.Test

class PostViewerPointsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `une annonce plus ancienne que la derniere appliquee est ignoree`() {
        val known = KnownViewerPoints(10, at = 500)
        assertThat(PostViewerPoints.kept(known, viewerPoints = 4, at = 499)).isEqualTo(known)
    }

    @Test
    fun `une annonce recente s'applique, a la hausse comme a la baisse`() {
        val known = KnownViewerPoints(10, at = 500)
        assertThat(PostViewerPoints.kept(known, 3, 500)).isEqualTo(KnownViewerPoints(3, 500))
        assertThat(PostViewerPoints.kept(known, 30, 900)).isEqualTo(KnownViewerPoints(30, 900))
    }

    @Test
    fun `une lecture s'applique et garde l'instant connu`() {
        assertThat(PostViewerPoints.kept(KnownViewerPoints(10, 500), 7, null)).isEqualTo(KnownViewerPoints(7, 500))
        assertThat(PostViewerPoints.kept(null, 7, null)).isEqualTo(KnownViewerPoints(7, null))
    }

    @Test
    fun `un champ absent ne change rien`() {
        val known = KnownViewerPoints(10, 500)
        assertThat(PostViewerPoints.kept(known, null, 900)).isEqualTo(known)
        assertThat(PostViewerPoints.kept(null, null, null)).isNull()
    }

    @Test
    fun `la marque se tait a zero et sans valeur`() {
        assertThat(PostViewerPoints.shown(null)).isNull()
        assertThat(PostViewerPoints.shown(0)).isNull()
        assertThat(PostViewerPoints.shown(12)).isEqualTo(12)
    }

    @Test
    fun `l'annonce se decode et refuse une charge malformee`() {
        val ok = json.decodeFromString(PostEngagementSnapshot.serializer(), """{"postId":"p1","viewerPoints":5,"at":1700,"x":1}""")
        assertThat(ok).isEqualTo(PostEngagementSnapshot("p1", 5, 1700))
        listOf(
            """{"postId":"","viewerPoints":5,"at":1}""",
            """{"postId":"p","viewerPoints":-1,"at":1}""",
            """{"postId":"p","viewerPoints":1,"at":-1}""",
        ).forEach { raw ->
            assertThrows(SerializationException::class.java) {
                json.decodeFromString(PostEngagementSnapshot.serializer(), raw)
            }
        }
    }
}

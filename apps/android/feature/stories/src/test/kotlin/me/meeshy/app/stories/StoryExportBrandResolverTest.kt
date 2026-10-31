package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.scene.export.StoryExportAuthorFacts
import me.meeshy.sdk.model.scene.export.StoryExportMood
import me.meeshy.sdk.relation.NoRelationLevelProvider
import me.meeshy.sdk.relation.RelationLevelProvider
import org.junit.Test

/** #13997 : l'intro d'un export lit le niveau de lien par un port injecté, et la résolution est bornée. */
class StoryExportBrandResolverTest {

    private val now = 1_000_000_000_000L

    private fun author(isOwn: Boolean = false, presence: UserPresence? = null) = StoryExportAuthorFacts(
        userId = "u1", displayName = "Aïcha", username = "aicha", avatarUrl = null, bannerUrl = null,
        accentHex = "6366F1", isOwn = isOwn, servedPresence = presence,
    )

    private class Level(private val level: String?, private val pause: Long = 0L) : RelationLevelProvider {
        val asked = mutableListOf<String>()
        override suspend fun servedLevel(userId: String): String? {
            asked += userId
            delay(pause)
            return level
        }
    }

    private fun resolver(level: RelationLevelProvider, mood: StoryExportMood? = null, pause: Long = 0L) = StoryExportBrandResolver(
        relationLevel = level,
        moodOf = { delay(pause); mood },
        nowMillis = { now },
        budgetMillis = 1_000L,
    )

    @Test fun `un lien Proche servi peint le feu dans le contenu d intro`() = runTest {
        val level = Level("CLOSE")
        assertThat(resolver(level).identity(author()).badge).isEqualTo("🔥")
        assertThat(level.asked).containsExactly("u1")
    }

    @Test fun `un lien Sang peint la goutte, Ami ne peint rien`() = runTest {
        assertThat(resolver(Level("BLOOD")).identity(author()).badge).isEqualTo("🩸")
        assertThat(resolver(Level("FRIEND")).identity(author()).badge).isNull()
    }

    @Test fun `le fournisseur par defaut ne sert aucun niveau donc aucun logo`() = runTest {
        assertThat(resolver(NoRelationLevelProvider).identity(author()).badge).isNull()
    }

    @Test fun `sa propre story n interroge pas le fournisseur et ne porte jamais de logo`() = runTest {
        val level = Level("CLOSE")
        val identity = resolver(level).identity(author(isOwn = true))
        assertThat(identity.badge).isNull()
        assertThat(identity.presence).isEqualTo(PresenceState.ONLINE)
        assertThat(level.asked).isEmpty()
    }

    @Test fun `un niveau qui n arrive pas dans le budget manque sans bloquer l export`() = runTest {
        assertThat(resolver(Level("CLOSE", pause = 5_000L)).identity(author()).badge).isNull()
    }

    @Test fun `un fournisseur qui echoue ne casse pas l export`() = runTest {
        val failing = object : RelationLevelProvider {
            override suspend fun servedLevel(userId: String): String? = error("réseau")
        }
        assertThat(resolver(failing).identity(author()).badge).isNull()
    }

    @Test fun `le mood de l auteur voyage avec son message`() = runTest {
        val identity = resolver(Level(null), mood = StoryExportMood("😴", "sieste")).identity(author())
        assertThat(identity.moodEmoji).isEqualTo("😴")
        assertThat(identity.moodMessage).isEqualTo("sieste")
    }

    @Test fun `un mood trop lent manque`() = runTest {
        assertThat(resolver(Level(null), mood = StoryExportMood("😴", null), pause = 9_000L).identity(author()).moodEmoji).isNull()
    }

    @Test fun `sans presence servie l intro ne montre aucun point, la presence servie se projette`() = runTest {
        assertThat(resolver(Level(null)).identity(author(presence = null)).presence).isNull()
        val live = UserPresence(isOnline = true, lastActiveAt = java.time.Instant.ofEpochMilli(now - 1_000).toString())
        assertThat(resolver(Level(null)).identity(author(presence = live)).presence).isEqualTo(PresenceState.ONLINE)
    }

    @Test fun `le mood se lit dans les statuts servis a l auteur seulement`() {
        val statuses = listOf(StatusEntry(id = "s1", userId = "u2", moodEmoji = "🎉"), StatusEntry(id = "s2", userId = "u1", moodEmoji = "😴", content = "sieste"))
        assertThat(StoryExportBrandResolver.moodIn(statuses, "u1")).isEqualTo(StoryExportMood("😴", "sieste"))
        assertThat(StoryExportBrandResolver.moodIn(statuses, "u3")).isNull()
        assertThat(StoryExportBrandResolver.moodIn(listOf(StatusEntry(id = "s3", userId = "u1", moodEmoji = " ")), "u1")).isNull()
    }
}

package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftPlacedMediaSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class LegacyDraftMigratorTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true }

    private fun store() = StoryDraftDiskStore(tmp.newFolder(), tmp.newFolder(), json)

    private class DeviceMedia(private val held: Map<String, String>, private val broken: Set<String> = emptySet()) :
        LegacyDraftMediaSource {
        override suspend fun copy(mediaId: String, directory: File): File? {
            if (mediaId in broken) throw IOException("sealed file unreadable")
            val body = held[mediaId] ?: return null
            return File(directory, "$mediaId.jpg").apply { writeText(body) }
        }
    }

    private fun migrator(
        legacy: StoryComposerDraftStore,
        store: StoryDraftStoring,
        media: LegacyDraftMediaSource = DeviceMedia(emptyMap()),
    ) = LegacyDraftMigrator(legacy, store, media, staging = tmp.newFolder())

    private val inProgress = StoryComposerDraftSnapshot(
        slides = listOf(
            StoryDraftSlideSnapshot(
                id = "s1",
                text = "mon brouillon",
                mediaIds = listOf("cmid_photo", "srv_remote"),
                backgroundMediaId = "cmid_fond",
                placedMedia = listOf(StoryDraftPlacedMediaSnapshot(id = "cmid_pose")),
            ),
        ),
        selectedId = "s1",
    )

    private val failedStory = inProgress.copy(awaitingPublication = listOf("cmid_story"))

    private val allMedia = mapOf("cmid_photo" to "PHOTO", "cmid_fond" to "FOND", "cmid_pose" to "POSE")

    @Test
    fun `a draft in progress survives the migration with its media and reopens from the new store`() = runTest {
        val legacy = InMemoryStoryComposerDraftStore(inProgress)
        val store = store()

        val id = migrator(legacy, store, DeviceMedia(allMedia)).migrate()

        assertThat(id).isEqualTo(LegacyDraftMigrator.LEGACY_DRAFT_ID)
        val reopened = store.load(id!!)!!
        assertThat(reopened.snapshot).isEqualTo(inProgress)
        assertThat(reopened.sessionFileByName.mapValues { it.value.readText() }).containsExactly(
            "cmid_photo.jpg", "PHOTO",
            "cmid_fond.jpg", "FOND",
            "cmid_pose.jpg", "POSE",
        )
        assertThat(store.listDrafts().single().coverFilePath).isNotNull()
        assertThat(legacy.load()).isNull()
    }

    @Test
    fun `a story whose publication failed survives the migration frozen, with its media, and reopens`() = runTest {
        val legacy = InMemoryStoryComposerDraftStore(failedStory)
        val store = store()

        val id = migrator(legacy, store, DeviceMedia(allMedia)).migrate()!!

        val reopened = store.load(id)!!
        assertThat(reopened.snapshot.awaitingPublication).containsExactly("cmid_story")
        assertThat(reopened.snapshot).isEqualTo(failedStory)
        assertThat(reopened.sessionFileByName.keys).containsExactly("cmid_photo.jpg", "cmid_fond.jpg", "cmid_pose.jpg")
        assertThat(store.listDrafts().single().isFrozen).isTrue()
    }

    @Test
    fun `a media the device cannot read keeps the legacy draft and writes nothing`() = runTest {
        val legacy = InMemoryStoryComposerDraftStore(inProgress)
        val store = store()

        val id = migrator(legacy, store, DeviceMedia(allMedia, broken = setOf("cmid_fond"))).migrate()

        assertThat(id).isNull()
        assertThat(legacy.load()).isEqualTo(inProgress)
        assertThat(store.isEmpty()).isTrue()
    }

    @Test
    fun `running the migration again after a crash before the old slot was emptied leaves a single draft`() = runTest {
        val legacy = InMemoryStoryComposerDraftStore(inProgress)
        val store = store()
        migrator(legacy, store, DeviceMedia(allMedia)).migrate()
        legacy.save(inProgress)

        migrator(legacy, store, DeviceMedia(allMedia)).migrate()

        assertThat(store.listDrafts().map { it.id }).containsExactly(LegacyDraftMigrator.LEGACY_DRAFT_ID)
        assertThat(legacy.load()).isNull()
    }

    @Test
    fun `a legacy draft not worth restoring is left where it is`() = runTest {
        val blank = StoryComposerDraftSnapshot(slides = listOf(StoryDraftSlideSnapshot(id = "s1")), selectedId = "s1")
        val legacy = InMemoryStoryComposerDraftStore(blank)
        val store = store()

        assertThat(migrator(legacy, store).migrate()).isNull()
        assertThat(legacy.load()).isEqualTo(blank)
        assertThat(store.isEmpty()).isTrue()
    }

    @Test
    fun `nothing to migrate leaves the store empty`() = runTest {
        val store = store()
        assertThat(migrator(InMemoryStoryComposerDraftStore(), store).migrate()).isNull()
        assertThat(store.isEmpty()).isTrue()
    }

    @Test
    fun `a failed write keeps the legacy draft`() = runTest {
        val legacy = InMemoryStoryComposerDraftStore(inProgress)
        val broken = StoryDraftDiskStore(tmp.newFile("blocker"), tmp.newFolder(), json)

        assertThat(migrator(legacy, broken, DeviceMedia(allMedia)).migrate()).isNull()
        assertThat(legacy.load()).isEqualTo(inProgress)
    }

    @Test
    fun `the staging copies leave once the migration is over`() = runTest {
        val staging = tmp.newFolder()
        LegacyDraftMigrator(InMemoryStoryComposerDraftStore(inProgress), store(), DeviceMedia(allMedia), staging).migrate()

        assertThat(staging.listFiles().orEmpty()).isEmpty()
    }
}

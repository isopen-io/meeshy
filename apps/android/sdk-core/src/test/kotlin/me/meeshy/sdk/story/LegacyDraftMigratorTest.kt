package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class LegacyDraftMigratorTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true }

    private fun store() = StoryDraftDiskStore(tmp.newFolder(), tmp.newFolder(), json)
    private val legacyDraft = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "mon brouillon")),
        selectedId = "s1",
    )

    @Test
    fun `the single legacy draft is migrated without loss and the old slot is emptied`() = runTest {
        val legacy = InMemoryStoryComposerDraftStore(legacyDraft)
        val store = store()

        val id = LegacyDraftMigrator(legacy, store) { "migrated" }.migrate()

        assertThat(id).isEqualTo("migrated")
        assertThat(store.load("migrated")!!.snapshot).isEqualTo(legacyDraft)
        assertThat(legacy.load()).isNull()
    }

    @Test
    fun `nothing to migrate leaves the store empty`() = runTest {
        val store = store()
        assertThat(LegacyDraftMigrator(InMemoryStoryComposerDraftStore(), store).migrate()).isNull()
        assertThat(store.isEmpty()).isTrue()
    }

    @Test
    fun `a failed write keeps the legacy draft`() = runTest {
        val legacy = InMemoryStoryComposerDraftStore(legacyDraft)
        val broken = StoryDraftDiskStore(tmp.newFile("blocker"), tmp.newFolder(), json)

        assertThat(LegacyDraftMigrator(legacy, broken).migrate()).isNull()
        assertThat(legacy.load()).isEqualTo(legacyDraft)
    }
}

package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerMediaIntakeTest {
    @Test
    fun `the rail lays on the foreground only when there is a background to lay on`() {
        assertThat(ComposerMediaDoorRole.role(ComposerMediaDoor.SceneRail, true)).isEqualTo(ComposerMediaRole.FOREGROUND)
        assertThat(ComposerMediaDoorRole.role(ComposerMediaDoor.SceneRail, false)).isEqualTo(ComposerMediaRole.BACKGROUND)
        assertThat(ComposerMediaDoorRole.role(ComposerMediaDoor.DocumentRow, true)).isEqualTo(ComposerMediaRole.BACKGROUND)
        assertThat(ComposerMediaDoorRole.role(ComposerMediaDoor.SceneSeries, true)).isEqualTo(ComposerMediaRole.BACKGROUND)
    }

    @Test
    fun `a pick founds scenes from two media, or from one when it opens the composer`() {
        assertThat(ComposerScenePicking.foundsScenes(1, openingPick = false)).isFalse()
        assertThat(ComposerScenePicking.foundsScenes(2, openingPick = false)).isTrue()
        assertThat(ComposerScenePicking.foundsScenes(1, openingPick = true)).isTrue()
        assertThat(ComposerScenePicking.foundsScenes(0, openingPick = true)).isFalse()
    }

    @Test
    fun `only an empty feed composer opens on the picker`() {
        assertThat(ComposerScenePicking.opensOnPicker(ComposerOrigin.FeedComposer, true)).isTrue()
        assertThat(ComposerScenePicking.opensOnPicker(ComposerOrigin.FeedComposer, false)).isFalse()
        listOf(ComposerOrigin.StoryTray, ComposerOrigin.MoodChip, ComposerOrigin.Share, ComposerOrigin.Draft("d"),
            ComposerOrigin.ConversationMedia("m"), ComposerOrigin.SocialMedia("p"))
            .forEach { assertThat(ComposerScenePicking.opensOnPicker(it, true)).isFalse() }
    }

    @Test
    fun `a series is capped at ten and at the free slides, and the overflow is refused`() {
        val picked = (1..14).toList()
        assertThat(ComposerMediaSeries.admit(picked, freeSlides = 20).kept).hasSize(10)
        assertThat(ComposerMediaSeries.admit(picked, freeSlides = 3).kept).containsExactly(1, 2, 3).inOrder()
        assertThat(ComposerMediaSeries.admit(picked, freeSlides = 3).hasOverflow).isTrue()
        assertThat(ComposerMediaSeries.admit(listOf(1), freeSlides = 0).kept).isEmpty()
    }

    @Test
    fun `the rail intent falls after its own picker or an abandoned write, and survives an explicit role`() {
        assertThat(ComposerRailPosing.CONSUME.intentAfter(true)).isFalse()
        assertThat(ComposerRailPosing.ABANDON.intentAfter(true)).isFalse()
        assertThat(ComposerRailPosing.ROLE_ALREADY_SET.intentAfter(true)).isTrue()
        assertThat(ComposerRailPosing.ROLE_ALREADY_SET.intentAfter(false)).isFalse()
    }

    @Test
    fun `one failed media never loses the rest of the batch`() {
        val outcome = ComposerMediaLoadOutcome.of(listOf(Result.success("a"), Result.failure(Exception()), Result.success("c")))
        assertThat(outcome.loaded).containsExactly("a", "c").inOrder()
        assertThat(outcome.failedCount).isEqualTo(1)
        assertThat(outcome.hasFailure).isTrue()
    }
}

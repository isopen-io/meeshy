package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerOpeningTest {
    @Test fun `only the door that promised writing raises the keyboard`() {
        assertThat(ComposerOpening.entries.filter { it.focusesContentOnAppear })
            .containsExactly(ComposerOpening.KEYBOARD_ON_CONTENT)
    }

    @Test fun `the feed door raises the keyboard, the tray and the mood grid do not`() {
        assertThat(ComposerProfile.of(ComposerOrigin.FeedComposer).opensWith.focusesContentOnAppear).isTrue()
        assertThat(ComposerProfile.of(ComposerOrigin.StoryTray).opensWith.focusesContentOnAppear).isFalse()
        assertThat(ComposerProfile.of(ComposerOrigin.MoodChip).opensWith.focusesContentOnAppear).isFalse()
    }

    @Test fun `a resumed draft and a seeded media never cover what they show with the keyboard`() {
        assertThat(ComposerProfile.of(ComposerOrigin.Draft("d")).opensWith.focusesContentOnAppear).isFalse()
        assertThat(ComposerProfile.of(ComposerOrigin.Share).opensWith.focusesContentOnAppear).isFalse()
        assertThat(ComposerProfile.of(ComposerOrigin.ConversationMedia("m")).opensWith.focusesContentOnAppear).isFalse()
    }

    @Test fun `every door that mounts the scene opens it at rest, the feed's post included (#16203)`() {
        val sceneDoors = listOf(
            ComposerOrigin.FeedComposer,
            ComposerOrigin.StoryTray,
            ComposerOrigin.Draft("d"),
            ComposerOrigin.Share,
            ComposerOrigin.ConversationMedia("m"),
            ComposerOrigin.SocialMedia("p"),
            ComposerOrigin.Repost("p", ComposerFormat.STORY),
        )

        assertThat(sceneDoors.filter { ComposerProfile.of(it).raisesKeyboardOnOpen }).isEmpty()
    }

    @Test fun `only a surface without a scene may raise the keyboard on opening (#16203)`() {
        assertThat(ComposerProfile.of(ComposerOrigin.Repost("p", ComposerFormat.STATUS)).raisesKeyboardOnOpen).isTrue()
    }
}

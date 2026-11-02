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
}

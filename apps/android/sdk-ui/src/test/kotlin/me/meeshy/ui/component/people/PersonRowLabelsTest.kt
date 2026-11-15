package me.meeshy.ui.component.people

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PersonRowLabelsTest {

    @Test
    fun `the label reads the name, the handle and the status in order`() {
        assertThat(PersonRowLabels.accessibility("Alice", "alice", "Online"))
            .isEqualTo("Alice, @alice, Online")
    }

    @Test
    fun `a handle that already starts with an at sign is not doubled`() {
        assertThat(PersonRowLabels.accessibility("Alice", "@alice", "Offline"))
            .isEqualTo("Alice, @alice, Offline")
    }

    @Test
    fun `a missing handle is skipped`() {
        assertThat(PersonRowLabels.accessibility("Alice", null, "Last seen 5min ago"))
            .isEqualTo("Alice, Last seen 5min ago")
        assertThat(PersonRowLabels.accessibility("Alice", "  ", null)).isEqualTo("Alice")
    }

    @Test
    fun `join drops blank parts`() {
        assertThat(PersonRowLabels.join("Alice", "", null, "on Meeshy")).isEqualTo("Alice, on Meeshy")
    }
}

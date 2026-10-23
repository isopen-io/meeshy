package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageDetailRouteTest {

    @Test
    fun opening_a_route_replaces_the_current_one() {
        val next = MessageDetailRoutes.open(MessageDetailRoute.Views("a"), MessageDetailRoute.History("b"))
        assertThat(next).isEqualTo(MessageDetailRoute.History("b"))
    }

    @Test
    fun closing_yields_no_route() {
        assertThat(MessageDetailRoutes.close(MessageDetailRoute.Views("a"))).isNull()
    }

    @Test
    fun a_stale_dismiss_does_not_close_a_newer_route() {
        val current = MessageDetailRoute.Sentiment("a")
        assertThat(MessageDetailRoutes.closeIf(current, MessageDetailRoute.Views("a"))).isEqualTo(current)
        assertThat(MessageDetailRoutes.closeIf(current, current)).isNull()
    }

    @Test
    fun every_route_survives_an_encode_decode_round_trip() {
        listOf(
            MessageDetailRoute.Views("m1"),
            MessageDetailRoute.Reactions("m1"),
            MessageDetailRoute.Languages("m1"),
            MessageDetailRoute.History("m1"),
            MessageDetailRoute.Sentiment("m1"),
            MessageDetailRoute.Report("m1"),
            MessageDetailRoute.CallDetails("m1"),
            MessageDetailRoute.Map("m1"),
        ).forEach { assertThat(MessageDetailRoute.decode(it.encode())).isEqualTo(it) }
    }

    @Test
    fun garbage_decodes_to_no_route() {
        assertThat(MessageDetailRoute.decode(null)).isNull()
        assertThat(MessageDetailRoute.decode("nope|x")).isNull()
        assertThat(MessageDetailRoute.decode("views|")).isNull()
        assertThat(MessageDetailRoute.decode("views")).isNull()
    }

    @Test
    fun chat_state_sheets_resolve_to_a_single_route_by_priority() {
        assertThat(MessageDetailRoutes.fromChatState(null, null, null)).isNull()
        assertThat(MessageDetailRoutes.fromChatState("r", "l", "x")).isEqualTo(MessageDetailRoute.Report("r"))
        assertThat(MessageDetailRoutes.fromChatState(null, "l", "x")).isEqualTo(MessageDetailRoute.Languages("l"))
        assertThat(MessageDetailRoutes.fromChatState(null, null, "x")).isEqualTo(MessageDetailRoute.Reactions("x"))
    }
}

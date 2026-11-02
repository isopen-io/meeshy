package me.meeshy.sdk.model.reading.summary

import com.google.common.truth.Truth.assertThat
import java.time.DayOfWeek
import java.time.LocalDate
import org.junit.Test

class EpisodeSegmenterTest {
    private fun m(id: String, sender: String, day: Int, hour: Int = 12, minute: Int = 0) =
        episodeMsg(id, sender, jan(day, hour, minute))

    private fun segment(messages: List<EpisodeInputMessage>) = EpisodeSegmenter.segment(messages, UTC)

    @Test fun `constantes identiques a iOS`() {
        assertThat(EpisodeSegmenter.GAP_THRESHOLD.toHours()).isEqualTo(6)
        assertThat(EpisodeSegmenter.MIN_EPISODE_MESSAGES).isEqualTo(4)
        assertThat(EpisodeSegmenter.MAX_EPISODES).isEqualTo(8)
    }

    @Test fun `entree vide donne aucun episode`() {
        assertThat(segment(emptyList())).isEmpty()
    }

    @Test fun `un message donne un episode`() {
        assertThat(segment(listOf(m("m1", "u1", 1))).single().messageIds).containsExactly("m1")
    }

    @Test fun `cent messages sur cinq jours donnent au plus huit episodes en partition exacte`() {
        val messages = (0 until 100).map { i -> m("m$i", "u${i % 4}", 1 + i / 20, 8 + i % 20 / 1 % 16) }
        val episodes = segment(messages)
        assertThat(episodes.size).isAtMost(EpisodeSegmenter.MAX_EPISODES)
        assertThat(episodes.all { it.messageIds.isNotEmpty() }).isTrue()
        val ids = episodes.flatMap { it.messageIds }
        assertThat(ids).hasSize(ids.toSet().size)
        assertThat(ids.toSet()).isEqualTo(messages.map { it.id }.toSet())
    }

    @Test fun `un trou de plus de six heures coupe`() {
        val messages = listOf(8, 9, 10, 11, 20, 21, 22, 23).mapIndexed { i, h -> m("m${i + 1}", "u1", 1, h) }
        val episodes = segment(messages)
        assertThat(episodes.map { it.messageIds }).containsExactly(
            listOf("m1", "m2", "m3", "m4"), listOf("m5", "m6", "m7", "m8"),
        ).inOrder()
    }

    @Test fun `un trou de moins de six heures ne coupe pas`() {
        val messages = listOf(8, 10, 12, 13).mapIndexed { i, h -> m("m$i", "u1", 1, h) }
        assertThat(segment(messages)).hasSize(1)
    }

    @Test fun `exactement six heures ne coupe pas`() {
        val messages = listOf(m("a", "u1", 1, 8), m("b", "u1", 1, 8, 1), m("c", "u1", 1, 8, 2), m("d", "u1", 1, 14, 2))
        assertThat(segment(messages)).hasSize(1)
    }

    @Test fun `le franchissement de minuit coupe meme sous six heures`() {
        val messages = listOf(
            m("m1", "u1", 1, 22), m("m2", "u1", 1, 23), m("m3", "u1", 1, 23, 30), m("m4", "u1", 1, 23, 45),
            m("m5", "u1", 2, 1), m("m6", "u1", 2, 1, 30), m("m7", "u1", 2, 2), m("m8", "u1", 2, 2, 30),
        )
        val episodes = segment(messages)
        assertThat(episodes).hasSize(2)
        assertThat(episodes[0].messageIds).containsExactly("m1", "m2", "m3", "m4").inOrder()
    }

    @Test fun `le fuseau injecte decide de la frontiere de jour`() {
        val messages = listOf(
            episodeMsg("a", "u", jan(1, 14)), episodeMsg("b", "u", jan(1, 14, 10)),
            episodeMsg("c", "u", jan(1, 14, 20)), episodeMsg("d", "u", jan(1, 14, 30)),
            episodeMsg("e", "u", jan(1, 15, 10)), episodeMsg("f", "u", jan(1, 15, 20)),
            episodeMsg("g", "u", jan(1, 15, 30)), episodeMsg("h", "u", jan(1, 15, 40)),
        )
        assertThat(EpisodeSegmenter.segment(messages, UTC)).hasSize(1)
        assertThat(EpisodeSegmenter.segment(messages, java.time.ZoneId.of("Asia/Tokyo"))).hasSize(2)
    }

    @Test fun `un changement complet de locuteurs coupe apres quatre messages`() {
        val first = (1..4).map { m("a$it", "u1", 1, 8, it) }
        val second = (1..4).map { m("b$it", "u2", 1, 9, it) }
        val episodes = segment(first + second)
        assertThat(episodes.map { it.participantIds }).containsExactly(listOf("u1"), listOf("u2")).inOrder()
    }

    @Test fun `un petit episode est fusionne dans le voisin`() {
        val messages = listOf(8, 9, 10, 11, 20, 21).mapIndexed { i, h -> m("m$i", "u1", 1, h) }
        val episodes = segment(messages)
        assertThat(episodes.all { it.messageIds.size >= EpisodeSegmenter.MIN_EPISODE_MESSAGES }).isTrue()
        assertThat(episodes.sumOf { it.messageIds.size }).isEqualTo(6)
    }

    @Test fun `un petit episode central rejoint le voisin le plus proche dans le temps`() {
        val a = (0..3).map { m("a$it", "u1", 1, 0, it) }
        val small = listOf(m("s0", "u1", 1, 7, 0), m("s1", "u1", 1, 7, 1))
        val c = (0..3).map { m("c$it", "u1", 1, 20, it) }
        val episodes = segment(a + small + c)
        assertThat(episodes).hasSize(2)
        assertThat(episodes[0].messageIds).contains("s0")
    }

    @Test fun `vingt groupes plafonnent a huit en gardant la partition`() {
        val messages = (0 until 20).flatMap { g ->
            (0 until 4).map { o -> m("g${g}_$o", "u1", 1 + g / 3, (g % 3) * 8, o) }
        }
        val episodes = segment(messages)
        assertThat(episodes.size).isAtMost(8)
        assertThat(episodes.flatMap { it.messageIds }.toSet()).hasSize(messages.size)
    }

    @Test fun `entree desordonnee est triee`() {
        val episodes = segment(listOf(m("b", "u1", 1, 9), m("a", "u1", 1, 8)))
        assertThat(episodes.single().messageIds).containsExactly("a", "b").inOrder()
    }

    @Test fun `titre d un seul jour aujourd hui avec le nombre de messages`() {
        val title = segment(listOf(m("m1", "u1", 1, 8), m("m2", "u1", 1, 9))).single().deterministicTitle
        assertThat(title).isEqualTo(EpisodeTitle(DayLabel.Relative(DayLabelKey.TODAY), null, 2))
        assertThat(title.messagesKey).isEqualTo("focal.summary.episode.messages_other")
        assertThat(DayLabelKey.TODAY.key).isEqualTo("focal.summary.day.today")
    }

    @Test fun `titre singulier pour un message`() {
        assertThat(segment(listOf(m("m1", "u1", 1))).single().deterministicTitle.messagesKey)
            .isEqualTo("focal.summary.episode.messages_one")
    }

    @Test fun `episode sur plusieurs jours borne par le premier et le dernier jour relatifs a la fin`() {
        val first = (0..3).map { m("a$it", "u1", 1, 8, it) }
        val last = (0..3).map { m("b$it", "u1", 2, 9, it) }
        val merged = EpisodeSegmenter.segment(first + last, UTC)
        assertThat(merged).hasSize(2)
        val title = EpisodeSegmenter.dayLabel(jan(1), jan(3), UTC)
        assertThat(title).isEqualTo(DayLabel.Relative(DayLabelKey.DAY_BEFORE_YESTERDAY))
    }

    @Test fun `libelles de jour paliers hier avant hier semaine date`() {
        val now = jan(20)
        assertThat(EpisodeSegmenter.dayLabel(jan(20, 23), now, UTC)).isEqualTo(DayLabel.Relative(DayLabelKey.TODAY))
        assertThat(EpisodeSegmenter.dayLabel(jan(21), now, UTC)).isEqualTo(DayLabel.Relative(DayLabelKey.TODAY))
        assertThat(EpisodeSegmenter.dayLabel(jan(19), now, UTC)).isEqualTo(DayLabel.Relative(DayLabelKey.YESTERDAY))
        assertThat(EpisodeSegmenter.dayLabel(jan(17), now, UTC)).isEqualTo(DayLabel.Weekday(DayOfWeek.SATURDAY))
        assertThat(EpisodeSegmenter.dayLabel(jan(13), now, UTC)).isEqualTo(DayLabel.FullDate(LocalDate.of(2026, 1, 13), false))
        val lastYear = java.time.ZonedDateTime.of(2025, 12, 1, 12, 0, 0, 0, UTC).toInstant()
        assertThat(EpisodeSegmenter.dayLabel(lastYear, now, UTC)).isEqualTo(DayLabel.FullDate(LocalDate.of(2025, 12, 1), true))
    }

    @Test fun `participants dedupliques et tries`() {
        val episodes = segment(listOf(m("m1", "uB", 1, 8), m("m2", "uA", 1, 9), m("m3", "uB", 1, 10)))
        assertThat(episodes.single().participantIds).containsExactly("uA", "uB").inOrder()
    }

    @Test fun `titre stable entre deux calculs`() {
        val messages = listOf(m("m1", "u1", 1, 8), m("m2", "u1", 1, 9), m("m3", "u1", 3, 9))
        assertThat(segment(messages).map { it.deterministicTitle }).isEqualTo(segment(messages).map { it.deterministicTitle })
    }
}

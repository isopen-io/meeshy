package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PathSegmentTest {

    @Test
    fun `seuls les caracteres non reserves hors le point passent`() {
        listOf("abc", "A-Z_0~9", "66f0c1a2b3c4d5e6f7a8b9c0", "2026-W44").forEach { assertThat(PathSegment.isStrict(it)).isTrue() }
    }

    @Test
    fun `un segment hors jeu est refuse`() {
        listOf("", "..", ".", "a/b", "a?b", "a#b", "a%2Fb", "a b", "é", "a.b").forEach { assertThat(PathSegment.isStrict(it)).isFalse() }
    }

    @Test
    fun `une route du jeu avec un segment hors jeu est interdite, avec ou sans prefixe d'API`() {
        assertThat(PathSegment.hasForbiddenGameSegment("/api/v1/me/game/duo/a%2Fb/accept")).isTrue()
        assertThat(PathSegment.hasForbiddenGameSegment("/api/v1/me/game/missions/../reroll")).isTrue()
        assertThat(PathSegment.hasForbiddenGameSegment("/api/v1/users/a.b/game")).isTrue()
        assertThat(PathSegment.hasForbiddenGameSegment("/users/u1/game/showcase")).isFalse()
        assertThat(PathSegment.hasForbiddenGameSegment("/api/v1/me/game/season/steps/3/claim")).isFalse()
    }

    @Test
    fun `une route hors du jeu n'est pas concernee`() {
        assertThat(PathSegment.hasForbiddenGameSegment("/api/v1/conversations/a.b/messages")).isFalse()
        assertThat(PathSegment.isGameRoute("/me/gamer")).isFalse()
    }
}

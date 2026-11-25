package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Miroir de `GameFlameWidgetFeed` et de `GameFlameLook` iOS (#20562) : le widget « Ma Flamme » LIT le bloc `game` servi
 * (jours, état de la Flamme, actes du jour par la loi de l'anneau), sans rien recalculer et sans rien d'autrui (#20566).
 */
class GameFlameWidgetFeedTest {

    private val doneAt = "2026-11-25T09:00:00.000Z"

    private fun game(days: Int = 23, status: FlameStatus = FlameStatus.Lit, done: List<Boolean> = listOf(true, true, false)): GameBlock {
        val base = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))
        val template = base.missions.items.first()
        return base.copy(
            flame = base.flame.copy(days = days, status = status),
            missions = base.missions.copy(
                items = done.mapIndexed { index, isDone -> template.copy(id = "m$index", completedAt = if (isDone) doneAt else null) },
            ),
        )
    }

    private fun shown(game: GameBlock?, hidden: Boolean = false, signedIn: Boolean = true): GameFlameWidgetFace {
        val state = GameFlameWidgetFeed.state(game, hidden = hidden, signedIn = signedIn)
        assertThat(state).isInstanceOf(GameFlameWidgetState.Shown::class.java)
        return (state as GameFlameWidgetState.Shown).face
    }

    @Test
    fun `la Flamme vive montre ses jours et les actes du jour servis`() {
        val face = shown(game())
        assertThat(face).isEqualTo(GameFlameWidgetFace(days = 23, look = GameFlameLook.Lit, actsDone = 2, actsTotal = 3))
        assertThat(face.showsDays).isTrue()
        assertThat(face.showsActs).isTrue()
    }

    @Test
    fun `chaque etat servi a sa forme`() {
        assertThat(shown(game(status = FlameStatus.Lit)).look).isEqualTo(GameFlameLook.Lit)
        assertThat(shown(game(status = FlameStatus.AtRisk)).look).isEqualTo(GameFlameLook.AtRisk)
        assertThat(shown(game(status = FlameStatus.Covered)).look).isEqualTo(GameFlameLook.Covered)
        assertThat(shown(game(status = FlameStatus.Out)).look).isEqualTo(GameFlameLook.Out)
        assertThat(shown(game(status = FlameStatus.None)).look).isEqualTo(GameFlameLook.Unlit)
    }

    @Test
    fun `seules les Flammes allumees ont un glyphe plein`() {
        assertThat(GameFlameLook.entries.filter { it.isKindled })
            .containsExactly(GameFlameLook.Lit, GameFlameLook.AtRisk, GameFlameLook.Covered)
    }

    @Test
    fun `une Flamme eteinte ou jamais allumee ne dit pas de jours`() {
        assertThat(shown(game(days = 12, status = FlameStatus.Out)).showsDays).isFalse()
        assertThat(shown(game(days = 3, status = FlameStatus.None)).showsDays).isFalse()
        assertThat(shown(game(days = 0, status = FlameStatus.Lit)).showsDays).isFalse()
        assertThat(shown(game(days = 4, status = FlameStatus.AtRisk)).showsDays).isTrue()
        assertThat(shown(game(days = 4, status = FlameStatus.Covered)).showsDays).isTrue()
    }

    @Test
    fun `aucun acte servi, aucune ligne d'actes`() {
        val face = shown(game(done = emptyList()))
        assertThat(face.actsTotal).isEqualTo(0)
        assertThat(face.showsActs).isFalse()
    }

    @Test
    fun `le compte affiche ne depasse jamais le total`() {
        assertThat(GameFlameWidgetFace(days = 2, look = GameFlameLook.Lit, actsDone = 5, actsTotal = 3).actsDoneShown).isEqualTo(3)
    }

    @Test
    fun `Jeu masque vide le widget`() {
        assertThat(GameFlameWidgetFeed.state(game(), hidden = true, signedIn = true)).isEqualTo(GameFlameWidgetState.Hidden)
    }

    @Test
    fun `cache vide, le widget invite au premier geste`() {
        assertThat(shown(null)).isEqualTo(GameFlameWidgetFace.INVITE)
        assertThat(GameFlameWidgetFace.INVITE.look).isEqualTo(GameFlameLook.Unlit)
        assertThat(GameFlameWidgetFace.INVITE.showsDays).isFalse()
        assertThat(GameFlameWidgetFace.INVITE.showsActs).isFalse()
    }

    @Test
    fun `sans session, rien du compte sortant - meme masque`() {
        assertThat(shown(game(), signedIn = false)).isEqualTo(GameFlameWidgetFace.INVITE)
        assertThat(shown(game(), hidden = true, signedIn = false)).isEqualTo(GameFlameWidgetFace.INVITE)
    }
}

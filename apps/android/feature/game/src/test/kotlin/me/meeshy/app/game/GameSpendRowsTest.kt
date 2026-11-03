package me.meeshy.app.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameSpend
import me.meeshy.sdk.model.game.progression.GameDetailFactKey
import org.junit.Test

class GameSpendRowsTest {

    private val labels = SpendLabels(held = "Tu as", cost = "Il faut", after = "Après")
    private val requirementLabels = RequirementLabels(current = "Niveau", required = "Requis")
    private fun format(value: Long) = "$value Meeshes"
    private fun missing(amount: String) = "Il manque $amount pour geler."

    private fun rows(held: Long, cost: Long, gesture: String? = "freeze", showsAfter: Boolean = true) =
        GameSpendRows.spend(GameSpend.preview(held, cost, gesture = gesture), labels, ::format, ::missing, showsAfter = showsAfter)

    @Test
    fun `abordable dit en poche, prix, puis ce qui restera`() {
        val items = rows(held = 10, cost = 4)

        assertThat(items.map { it.label }).containsExactly("Tu as", "Il faut", "Après").inOrder()
        assertThat(items.map { it.value }).containsExactly("10 Meeshes", "4 Meeshes", "6 Meeshes").inOrder()
        assertThat(items.map { it.detail }).containsExactly(
            GameDetailFactKey.SpendHeld, GameDetailFactKey.SpendCost, GameDetailFactKey.SpendAfter,
        ).inOrder()
        assertThat(items.none { it.short }).isTrue()
    }

    @Test
    fun `le reste se tait quand l hote ne veut aucun calcul`() {
        assertThat(rows(held = 10, cost = 4, showsAfter = false).map { it.detail })
            .containsExactly(GameDetailFactKey.SpendHeld, GameDetailFactKey.SpendCost).inOrder()
    }

    @Test
    fun `insuffisant remplace le reste par une phrase qui nomme la cible`() {
        val items = rows(held = 1, cost = 4)

        assertThat(items.map { it.detail }).containsExactly(
            GameDetailFactKey.SpendHeld, GameDetailFactKey.SpendCost, GameDetailFactKey.SpendMissing,
        ).inOrder()
        val last = items.last()
        assertThat(last.short).isTrue()
        assertThat(last.sentence).isEqualTo("Il manque 3 Meeshes pour geler.")
        assertThat(last.value).isEqualTo("3 Meeshes")
    }

    @Test
    fun `chaque pastille nomme le geste vise pour la lecture d ecran`() {
        val items = rows(held = 1, cost = 4)

        assertThat(items.map { it.gesture }.distinct()).containsExactly("freeze")
        assertThat(items.first().spoken).isEqualTo("Tu as, 1 Meeshes. freeze")
        assertThat(items.last().spoken).isEqualTo("Il manque 3 Meeshes pour geler.. freeze")
    }

    @Test
    fun `une donnee de plus se glisse entre le solde et le prix`() {
        val between = GameFactChipItem("Points", "50", GameDetailFactKey.Convertible)
        val items = GameSpendRows.spend(GameSpend.preview(10, 4), labels, ::format, ::missing, between = between)

        assertThat(items.map { it.label }).containsExactly("Tu as", "Points", "Il faut", "Après").inOrder()
    }

    @Test
    fun `exigence remplie ne dit aucun manque`() {
        val items = GameSpendRows.requirement(GameSpend.requirement(5, 3), requirementLabels, ::format, ::missing)

        assertThat(items.map { it.detail }).containsExactly(GameDetailFactKey.LevelNow, GameDetailFactKey.LevelRequired).inOrder()
    }

    @Test
    fun `exigence non remplie dit ce qui manque pour l ouvrir`() {
        val items = GameSpendRows.requirement(GameSpend.requirement(1, 3, gesture = "unlock"), requirementLabels, ::format, ::missing)

        assertThat(items).hasSize(3)
        assertThat(items.last().sentence).isEqualTo("Il manque 2 Meeshes pour geler.")
        assertThat(items.last().short).isTrue()
        assertThat(items.last().gesture).isEqualTo("unlock")
    }

    @Test
    fun `le record remplace le niveau courant`() {
        val items = GameSpendRows.requirement(GameSpend.requirement(5, 3), requirementLabels, ::format, ::missing, record = true)

        assertThat(items.first().detail).isEqualTo(GameDetailFactKey.LevelRecord)
    }
}

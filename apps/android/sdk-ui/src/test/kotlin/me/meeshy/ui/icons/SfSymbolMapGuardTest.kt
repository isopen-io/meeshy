package me.meeshy.ui.icons

import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SfSymbolMapGuardTest {
    private val table = IconsTestSupport.table()
    private val material = IconsTestSupport.properties(MeeshyIcons)
    private val vectors = IconsTestSupport.properties(MeeshyVectorIcons)

    @Test fun `chaque symbole extrait d'iOS est classe exactement une fois`() {
        val classified = table.symbols.map { it.symbol }
        assertThat(classified).containsNoDuplicates()
        assertThat(classified.toSet()).isEqualTo(IconsTestSupport.candidates().toSet())
    }

    @Test fun `chaque ligne a un statut connu, une raison, et un role si elle en porte un`() {
        table.symbols.forEach { row ->
            assertThat(row.status).isAnyOf("mapped", "custom", "not-applicable")
            assertThat(row.reason).isNotEmpty()
            if (row.status == "not-applicable") assertThat(row.role).isNull() else assertThat(row.role).isNotNull()
        }
    }

    @Test fun `aucune ligne ne cite un role inexistant`() {
        table.symbols.forEach { row ->
            row.cited.forEach { role ->
                assertThat(table.roles).containsKey(role)
                assertThat(material).containsKey(role)
            }
        }
    }

    @Test fun `un role mapped est materiel et un role custom a son vecteur maison`() {
        table.symbols.filter { it.status == "mapped" }.forEach { row ->
            assertThat(table.roles.getValue(row.role!!).origin).isEqualTo("material")
        }
        table.symbols.filter { it.status == "custom" }.forEach { row ->
            assertThat(table.roles.getValue(row.role!!).origin).isEqualTo("custom")
            assertThat(vectors).containsKey(row.role)
        }
    }

    @Test fun `la table des roles et les proprietes de MeeshyIcons sont identiques - aucun orphelin`() {
        assertThat(material.keys).isEqualTo(table.roles.keys)
        val cited = table.symbols.flatMap { it.cited }.toSet()
        assertThat(table.roles.keys - cited).isEmpty()
    }

    @Test fun `MeeshyIcons expose au moins 60 roles`() {
        assertThat(material.size).isAtLeast(60)
    }

    @Test fun `les vecteurs maison sont des tracés 24 dp non vides`() {
        assertThat(vectors).isNotEmpty()
        vectors.forEach { (_, vector) ->
            assertThat(vector.defaultWidth).isEqualTo(24.dp)
            assertThat(vector.defaultHeight).isEqualTo(24.dp)
            assertThat(vector.viewportWidth).isEqualTo(24f)
            assertThat(vector.viewportHeight).isEqualTo(24f)
            assertThat(vector.root.size).isGreaterThan(0)
        }
    }

    @Test fun `chaque vecteur maison est expose par MeeshyIcons`() {
        vectors.forEach { (name, vector) -> assertThat(material.getValue(name)).isSameInstanceAs(vector) }
    }
}

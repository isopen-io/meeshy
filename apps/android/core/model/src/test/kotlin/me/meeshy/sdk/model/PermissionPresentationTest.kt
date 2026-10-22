package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Chaque nature de permission parle pour elle-même : un titre, un corps et un libellé
 * d'action, sur la feuille d'explication comme sur la carte de refus. Aucune ne retombe
 * sur un texte générique qui n'apprendrait pas quelle ligne activer.
 */
class PermissionPresentationTest {

    private val everyPresentation: List<Triple<PermissionNature, PermissionSurface, PermissionPresentation>> =
        PermissionNature.values().flatMap { nature ->
            PermissionSurface.values().map { surface ->
                Triple(nature, surface, PermissionPresentation.of(nature, surface))
            }
        }

    @Test
    fun `every nature has a non blank title body and action on both surfaces`() {
        everyPresentation.forEach { (_, _, presentation) ->
            assertThat(presentation.titleKey).isNotEmpty()
            assertThat(presentation.bodyKey).isNotEmpty()
            assertThat(presentation.actionKey).isNotEmpty()
        }
    }

    @Test
    fun `no two natures share a title or a body`() {
        PermissionSurface.values().forEach { surface ->
            val presentations = PermissionNature.values().map { PermissionPresentation.of(it, surface) }

            assertThat(presentations.map { it.titleKey }.toSet()).hasSize(PermissionNature.values().size)
            assertThat(presentations.map { it.bodyKey }.toSet()).hasSize(PermissionNature.values().size)
        }
    }

    @Test
    fun `title and body keys carry their own nature so none falls back to a generic text`() {
        everyPresentation.forEach { (nature, _, presentation) ->
            assertThat(presentation.titleKey).contains(nature.slug)
            assertThat(presentation.bodyKey).contains(nature.slug)
        }
    }

    @Test
    fun `the denied card always offers to open the settings`() {
        PermissionNature.values().forEach { nature ->
            val presentation = PermissionPresentation.of(nature, PermissionSurface.DENIED)

            assertThat(presentation.actionKey).isEqualTo(PermissionPresentation.DENIED_ACTION_KEY)
        }
    }

    @Test
    fun `the explanation sheet always offers to continue`() {
        PermissionNature.values().forEach { nature ->
            val presentation = PermissionPresentation.of(nature, PermissionSurface.RATIONALE)

            assertThat(presentation.actionKey).isEqualTo(PermissionPresentation.RATIONALE_ACTION_KEY)
        }
    }

    @Test
    fun `every nature has its own one line denied message`() {
        val keys = PermissionNature.values().map { PermissionPresentation.deniedMessageKey(it) }

        assertThat(keys.toSet()).hasSize(PermissionNature.values().size)
        keys.forEach { assertThat(it).isNotEmpty() }
    }

    @Test
    fun `keys are valid Android resource names`() {
        val valid = Regex("[a-z][a-z0-9_]*")

        val keys = everyPresentation.flatMap { (_, _, p) -> listOf(p.titleKey, p.bodyKey, p.actionKey) } +
            PermissionNature.values().map { PermissionPresentation.deniedMessageKey(it) }

        keys.forEach { assertThat(valid.matches(it)).isTrue() }
    }
}

package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le rail gauche du grand écran (#13837, maquette du 2026-10-30) : Fermer, les outils de la colonne — Fond, Mention et
 * Lieu en entrées directes (#14049) —, rien d'autre ; le « ⋯ » reste derrière « Plus », comme sur le petit écran.
 */
class ComposerLabeledRailTest {

    @Test
    fun `the rail carries the five tools, then the background, the mention and the place, never the more button`() {
        assertThat(ComposerLabeledRail.tools).containsExactly(
            ComposerSceneTool.TEXT, ComposerSceneTool.MEDIA, ComposerSceneTool.STICKER,
            ComposerSceneTool.SOUND, ComposerSceneTool.DRAWING,
            ComposerSceneTool.BACKGROUND, ComposerSceneTool.MENTION, ComposerSceneTool.PLACE,
        ).inOrder()
    }

    @Test
    fun `the more menu never repeats a tool of the rail`() {
        val entries = ComposerMoreEntry.entries.map { it.name }

        assertThat(entries).containsNoneOf("BACKGROUND", "MENTION", "PLACE")
    }
}

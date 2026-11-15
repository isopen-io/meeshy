package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Un seul étage bas à la fois (miroir de `ComposerLowZone` iOS, #4579) : les propriétés, l'outil, la bande, ou rien. */
class ComposerLowZoneTest {

    @Test
    fun `an open tool takes the whole low zone even when a band is served`() {
        assertThat(ComposerLowZone.resolve(toolIsOpen = true, band = ComposerSceneBand.PALETTE))
            .isEqualTo(ComposerLowZone.ToolOptions)
    }

    @Test
    fun `without a tool the served band takes the low zone`() {
        assertThat(ComposerLowZone.resolve(toolIsOpen = false, band = ComposerSceneBand.FRAME))
            .isEqualTo(ComposerLowZone.Band(ComposerSceneBand.FRAME))
    }

    @Test
    fun `neither tool nor band leaves only the base`() {
        assertThat(ComposerLowZone.resolve(toolIsOpen = false, band = null)).isEqualTo(ComposerLowZone.Nothing)
    }

    @Test
    fun `the properties of the edited object come before everything`() {
        assertThat(ComposerLowZone.resolve(toolIsOpen = true, band = ComposerSceneBand.PALETTE, properties = true))
            .isEqualTo(ComposerLowZone.Properties)
    }

    @Test
    fun `a requested band that is not served is absent`() {
        assertThat(ComposerSceneBand.opened(ComposerSceneBand.FRAME, served = setOf(ComposerSceneBand.PALETTE))).isNull()
        assertThat(ComposerSceneBand.opened(ComposerSceneBand.PALETTE, served = setOf(ComposerSceneBand.PALETTE)))
            .isEqualTo(ComposerSceneBand.PALETTE)
        assertThat(ComposerSceneBand.opened(null, served = ComposerSceneBand.entries.toSet())).isNull()
    }

    @Test
    fun `the background door opens the frame once a background media exists`() {
        assertThat(ComposerSceneBand.forBackgroundDoor(hasBackgroundMedia = true)).isEqualTo(ComposerSceneBand.FRAME)
        assertThat(ComposerSceneBand.forBackgroundDoor(hasBackgroundMedia = false)).isEqualTo(ComposerSceneBand.PALETTE)
    }

    @Test
    fun `every canonical element yields to an open tool and shows otherwise`() {
        ComposerCanonicalZone.Element.entries.forEach { element ->
            assertThat(ComposerCanonicalZone.isServed(element, toolIsOpen = true)).isFalse()
            assertThat(ComposerCanonicalZone.isServed(element, toolIsOpen = false)).isTrue()
        }
    }

    @Test
    fun `the invite shows only on a bare scene with nothing open`() {
        assertThat(ComposerSceneInvite.shown(sceneIsEmpty = true, toolIsOpen = false, selecting = false, viewfinderArmed = false)).isTrue()
        assertThat(ComposerSceneInvite.shown(sceneIsEmpty = false, toolIsOpen = false, selecting = false, viewfinderArmed = false)).isFalse()
        assertThat(ComposerSceneInvite.shown(sceneIsEmpty = true, toolIsOpen = true, selecting = false, viewfinderArmed = false)).isFalse()
        assertThat(ComposerSceneInvite.shown(sceneIsEmpty = true, toolIsOpen = false, selecting = true, viewfinderArmed = false)).isFalse()
        assertThat(ComposerSceneInvite.shown(sceneIsEmpty = true, toolIsOpen = false, selecting = false, viewfinderArmed = true)).isFalse()
    }
}

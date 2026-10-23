package me.meeshy.ui.component.viewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageViewerExitsTest {

    @Test
    fun `a page with no declared gate may leave Meeshy`() {
        assertThat(ImageViewerExits.isExportable(exportable = emptyList(), page = 3)).isTrue()
    }

    @Test
    fun `a protected page may not leave Meeshy`() {
        assertThat(ImageViewerExits.isExportable(exportable = listOf(true, false), page = 1)).isFalse()
        assertThat(ImageViewerExits.isExportable(exportable = listOf(true, false), page = 0)).isTrue()
    }

    @Test
    fun `an exportable page offers save then share`() {
        assertThat(ImageViewerExits.offered(isExportable = true, canSave = true, canShare = true))
            .containsExactly(ImageViewerExit.Save, ImageViewerExit.Share).inOrder()
    }

    @Test
    fun `a protected page offers nothing so the menu is absent`() {
        assertThat(ImageViewerExits.offered(isExportable = false, canSave = true, canShare = true)).isEmpty()
    }

    @Test
    fun `save is absent where the device cannot save`() {
        assertThat(ImageViewerExits.offered(isExportable = true, canSave = false, canShare = true))
            .containsExactly(ImageViewerExit.Share)
    }
}

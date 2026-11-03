package me.meeshy.sdk.model.call.camera

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CameraCatalogTest {
    private fun camera(id: String, name: String, facing: CameraFacing) = CameraDescriptor(id, name, facing)

    @Test
    fun `front leads then back then external`() {
        val options = CameraCatalog.options(
            listOf(
                camera("3", "USB", CameraFacing.External),
                camera("1", "Back", CameraFacing.Back),
                camera("0", "Front", CameraFacing.Front),
            ),
        )
        assertThat(options.map { it.id }).containsExactly("0", "1", "3").inOrder()
    }

    @Test
    fun `cameras of one face are ordered by name regardless of case`() {
        val options = CameraCatalog.options(
            listOf(camera("a", "zoom", CameraFacing.External), camera("b", "Brio", CameraFacing.External)),
        )
        assertThat(options.map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `a duplicated id is listed once`() {
        val options = CameraCatalog.options(listOf(camera("1", "A", CameraFacing.Back), camera("1", "A", CameraFacing.Back)))
        assertThat(options).hasSize(1)
    }

    @Test
    fun `two cameras with the same name are told apart by a number in a fixed order`() {
        val options = CameraCatalog.options(
            listOf(camera("z", "Brio", CameraFacing.External), camera("y", "Brio", CameraFacing.External)),
        )
        assertThat(options.map { it.displayName }).containsExactly("Brio", "Brio (2)").inOrder()
        assertThat(options.map { it.id }).containsExactly("y", "z").inOrder()
    }
}

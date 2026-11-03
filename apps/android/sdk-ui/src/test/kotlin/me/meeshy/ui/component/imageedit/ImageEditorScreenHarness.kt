package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.model.imageedit.ImageEditorContext
import me.meeshy.sdk.model.imageedit.ImageEditorMode

internal class ImageEditorScreenHarness(
    private val compose: ComposeContentTestRule,
    mode: ImageEditorMode = ImageEditorMode.SIMPLE,
) {
    val renderer = FakeImageEditorRenderer()
    val store = FakeImageEditorModeStore(mode)
    val accepted = mutableListOf<Bitmap>()
    var cancels = 0
    private val image = Bitmap.createBitmap(40, 40, Bitmap.Config.ARGB_8888)
    val viewModel = ImageEditorViewModel(image, ImageEditorContext.POST, FakeImageEditorLabels, renderer, store, Dispatchers.Unconfined)

    fun show() {
        compose.setContent {
            MeeshyImageEditorScreen(
                image = image,
                context = ImageEditorContext.POST,
                onAccept = { accepted += it },
                onCancel = { cancels++ },
                viewModel = viewModel,
            )
        }
    }

    fun send(event: ImageEditorUiEvent) = compose.runOnIdle { viewModel.onEvent(event) }
}

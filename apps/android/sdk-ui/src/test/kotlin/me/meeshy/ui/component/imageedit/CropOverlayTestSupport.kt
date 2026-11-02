package me.meeshy.ui.component.imageedit

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.imageedit.CropRect

internal class CropHarness {
    var rect: CropRect = CropRect(100f, 100f, 200f, 150f)
    var interactions: Int = 0
    val display: CropRect = CropRect(0f, 0f, 400f, 300f)

    @Composable
    fun Content(aspectRatio: Double? = null) {
        var state by remember { mutableStateOf(rect) }
        Box(Modifier.size(400.dp, 300.dp).testTag("host")) {
            CropOverlayView(
                cropRect = state,
                onCropRectChange = { state = it; rect = it },
                imageDisplayRect = display,
                aspectRatio = aspectRatio,
                onInteraction = { interactions++ },
            )
        }
    }
}

package me.meeshy.ui.component.retouch

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.imageedit.CropFrame
import me.meeshy.sdk.model.imageedit.CropRect
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.ui.R
import me.meeshy.ui.component.imageedit.CropOverlayView

/**
 * Les équerres de Recadrer, posées sur la prise ENTIÈRE affichée dans [display] : tirées, elles rendent le
 * recadrage normalisé ([onCrop], `null` ⇒ la prise entière). [aspect] verrouille les proportions d'un preset.
 */
@Composable
internal fun RetouchCropBrackets(crop: NormalizedCrop?, aspect: Double?, display: CropRect, onCrop: (NormalizedCrop?) -> Unit) {
    var frame by remember(display, crop, aspect) { mutableStateOf(CropFrame.initial(crop, aspect, display)) }
    CropOverlayView(
        cropRect = frame,
        onCropRectChange = { next ->
            frame = next
            CropFrame.bake(touched = true, hasSavedCrop = crop != null, frame = next, display = display)?.let { onCrop(it.crop) }
        },
        imageDisplayRect = display,
        aspectRatio = aspect,
    )
}

/** Les proportions par presets, sur une bande sous la scène : « Original », puis les rapports écrits en chiffres. */
@Composable
internal fun RetouchCropPresets(chosen: ComposerCropPreset?, enabled: Boolean, onChoose: (ComposerCropPreset) -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ComposerCropPreset.entries.forEach { preset ->
            val label = preset.notation ?: stringResource(R.string.retouch_crop_original)
            val isChosen = preset == chosen
            Box(
                Modifier
                    .sizeIn(minWidth = 56.dp, minHeight = 48.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(if (isChosen) Color.White else Color.White.copy(alpha = 0.14f))
                    .clickable(enabled = enabled, role = Role.Button) { onChoose(preset) }
                    .semantics {
                        selected = isChosen
                        role = Role.Button
                    }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, color = if (isChosen) Color.Black else Color.White, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

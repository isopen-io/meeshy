package me.meeshy.ui.component.chrome

import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.layer.GraphicsLayer

/**
 * Le fond ENREGISTRE (degrade + halos) que le verre floute. Pose par [MeeshyBackground] ;
 * [origin] est la position du fond dans la fenetre, pour recaler le fond derriere chaque verre.
 */
@Stable
public class GlassBackdrop internal constructor(internal val layer: GraphicsLayer) {
    internal var origin: Offset by mutableStateOf(Offset.Zero)
}

public val LocalGlassBackdrop = compositionLocalOf<GlassBackdrop?> { null }

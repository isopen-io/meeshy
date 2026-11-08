package me.meeshy.app.stories

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import me.meeshy.sdk.model.StoryTextEffect
import me.meeshy.ui.story.canvas.toComposeShadow

/** Délègue à l'UNIQUE projection de `:sdk-ui` ([toComposeShadow]) : le composeur et la scène s'accordent sur ce qui brille (#4870). */
fun StoryTextEffect.composeShadow(fontSizePx: Float, textColor: Color): Shadow? = toComposeShadow(fontSizePx, textColor)

package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.ui.story.canvas.SceneTextFrameBox

/** La boîte du texte vit désormais dans `:sdk-ui` ([SceneTextFrameBox]) : la scène unique et le composeur la partagent. */
@Composable
internal fun FramedTextBox(
    background: StoryTextBackground,
    frame: StoryTextFrame,
    pxPerDesign: Float,
    glyphStyle: TextStyle,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) = SceneTextFrameBox(background, frame, pxPerDesign, glyphStyle, modifier, content = content)

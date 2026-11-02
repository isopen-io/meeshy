package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import me.meeshy.ui.component.fullscreen.FullscreenChromeDimens
import me.meeshy.ui.component.fullscreen.FullscreenChromeTone
import me.meeshy.ui.component.fullscreen.FullscreenCloseButton
import me.meeshy.ui.component.fullscreen.FullscreenExitStyle

/** Les marges de [FullscreenTopBar] : le DISQUE visible tombe sur la gouttière, sa cible déborde. */
public object FullscreenTopBarLayout {
    public val horizontalPadding: Dp = FullscreenChromeDimens.topBarHorizontalPadding
    public val topPadding: Dp = FullscreenChromeDimens.topInset
}

/**
 * La barre haute du plein écran, la même géographie pour tous : `[sortie] [identité] ··· [actions]`.
 * La sortie (croix ou retour) est au bord de DÉBUT de lecture (miroir en RTL), l'identité juste
 * après, les actions de fin à l'autre bord. La barre respecte la zone sûre ; le voile et le média,
 * eux, l'ignorent.
 */
@Composable
public fun FullscreenTopBar(
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    tone: FullscreenChromeTone = FullscreenChromeTone.OnMedia,
    exit: FullscreenExitStyle = FullscreenExitStyle.Close,
    leading: @Composable RowScope.() -> Unit = {},
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
            .padding(horizontal = FullscreenTopBarLayout.horizontalPadding)
            .padding(top = FullscreenTopBarLayout.topPadding),
        horizontalArrangement = Arrangement.spacedBy(FullscreenChromeDimens.barSpacing),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FullscreenCloseButton(onClick = onClose, tone = tone, exit = exit)
        leading()
        Spacer(Modifier.weight(1f))
        trailing()
    }
}

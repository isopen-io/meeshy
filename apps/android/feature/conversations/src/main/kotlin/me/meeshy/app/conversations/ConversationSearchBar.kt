package me.meeshy.app.conversations

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.ManageSearch
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val ActiveGradient = listOf(MeeshyPalette.Error, MeeshyPalette.Indigo300)
private const val ACTIVE_ICON_SCALE = 1.15f
private const val FOCUS_BOUNCE_SCALE = 1.02f

private fun searchSpring(response: Float, dampingRatio: Float) =
    spring<Float>(dampingRatio = dampingRatio, stiffness = MeeshyMotion.stiffnessForResponse(response))

/**
 * Pilule de verre flottante (iOS `themedSearchBar`). Le focus est hissé : l'hôte
 * possède [focusRequester] et [isFocused] pour pouvoir le rendre au masquage.
 * La loupe bascule le focus et prend le dégradé erreur -> indigo300 à l'échelle
 * 1,15 ; la bordure passe à 2 dp en dégradé avec un halo indigo300 ; la croix
 * d'effacement (erreur) apparaît dès que le texte est non vide.
 */
@Composable
internal fun ConversationSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    isFocused: Boolean = false,
    focusRequester: FocusRequester = FocusRequester(),
    onFocusChanged: (Boolean) -> Unit = {},
    onToggleFocus: () -> Unit = {},
    onDashboard: () -> Unit = {},
    onGlobalSearch: () -> Unit = {},
) {
    val haptics = rememberMeeshyHaptics()
    val shape = RoundedCornerShape(MeeshyRadius.xlPlus)
    val bounce by animateFloatAsState(
        targetValue = if (isFocused) FOCUS_BOUNCE_SCALE else 1f,
        animationSpec = searchSpring(response = 0.35f, dampingRatio = 0.55f),
        label = "searchBarBounce",
    )
    val iconScale by animateFloatAsState(
        targetValue = if (isFocused) ACTIVE_ICON_SCALE else 1f,
        animationSpec = searchSpring(response = 0.3f, dampingRatio = 0.6f),
        label = "searchIconScale",
    )
    val idleBorder = MeeshyTheme.tokens.inputBorder
    val borderModifier = if (isFocused) {
        Modifier
            .shadow(12.dp, shape, ambientColor = MeeshyPalette.Indigo300.copy(alpha = 0.25f), spotColor = MeeshyPalette.Indigo300.copy(alpha = 0.25f))
            .border(2.dp, Brush.horizontalGradient(ActiveGradient), shape)
    } else {
        Modifier.border(1.dp, idleBorder, shape)
    }
    MeeshyGlassSurface(
        shape = shape,
        // Edge-to-edge : la pilule se pose au-dessus de la barre de navigation
        // Android et du clavier, jamais dessous.
        modifier = modifier
            .windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime))
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
            .scale(bounce)
            .then(borderModifier),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val searchLabel = stringResource(R.string.conversations_search_bar_toggle)
            val searchHint = stringResource(R.string.accessibility_search_list_hint)
            IconButton(
                onClick = {
                    haptics.light()
                    onToggleFocus()
                },
                modifier = Modifier
                    .size(32.dp)
                    .semantics {
                        contentDescription = "$searchLabel. $searchHint"
                        selected = isFocused
                    },
            ) {
                GradientIcon(
                    imageVector = Icons.Filled.Search,
                    brush = if (isFocused) Brush.horizontalGradient(ActiveGradient) else null,
                    mutedTint = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier
                        .size(20.dp)
                        .graphicsLayer { scaleX = iconScale; scaleY = iconScale },
                )
            }
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = MeeshyTheme.tokens.textPrimary),
                cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                modifier = Modifier
                    .weight(1f)
                    .padding(start = MeeshySpacing.sm)
                    .focusRequester(focusRequester)
                    .onFocusChanged { onFocusChanged(it.isFocused) },
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (query.isEmpty()) {
                            Text(
                                text = stringResource(R.string.conversations_search_hint),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MeeshyTheme.tokens.textMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        inner()
                    }
                },
            )
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }, modifier = Modifier.size(32.dp)) {
                    Icon(
                        imageVector = Icons.Filled.Cancel,
                        contentDescription = stringResource(R.string.conversations_search_bar_clear),
                        tint = MeeshyPalette.Error,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
            IconButton(
                onClick = {
                    haptics.medium()
                    onDashboard()
                },
                modifier = Modifier.size(32.dp),
            ) {
                GradientIcon(
                    imageVector = Icons.Filled.GridView,
                    contentDescription = stringResource(R.string.conversations_open_dashboard),
                    brush = Brush.linearGradient(listOf(MeeshyPalette.Warning, MeeshyPalette.Indigo500)),
                    mutedTint = MeeshyPalette.Warning,
                    modifier = Modifier.size(20.dp),
                )
            }
            IconButton(
                onClick = {
                    haptics.medium()
                    onGlobalSearch()
                },
                modifier = Modifier.size(32.dp),
            ) {
                GradientIcon(
                    imageVector = Icons.Filled.ManageSearch,
                    contentDescription = stringResource(R.string.conversations_open_global_search),
                    brush = Brush.linearGradient(listOf(MeeshyPalette.Indigo600, MeeshyPalette.Indigo300)),
                    mutedTint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
    }
}

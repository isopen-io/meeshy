package me.meeshy.app.stories

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.MyStoryCardKind
import me.meeshy.sdk.model.MyStoryGlyph
import me.meeshy.sdk.model.MyStorySelectionIndicator
import me.meeshy.sdk.model.MyStoryThumbnailSource
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import java.io.File

/** Les actions d'une carte, données stables pour que la grille ne recompose que la carte qui change. */
@Immutable
internal class MyStoryCardActions(
    val onOpen: (String) -> Unit,
    val onSelectStart: (String) -> Unit,
    val onToggle: (String) -> Unit,
    val onViewers: (String) -> Unit,
    val onComments: (String) -> Unit,
    val onEdit: (String) -> Unit,
    val onRepublish: (String) -> Unit,
    val onDelete: (String) -> Unit,
)

/**
 * Carte de « Mes stories » (iOS `MyStoryCard`) : un cadre neutre 9:16 qui IMPOSE la taille de la cellule, l'image
 * en overlay rognée, la bande de glyphes dessous, la date en pied. Une story expirée garde sa vignette sous un
 * voile ; la bande reste nette pour consulter l'engagement.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun MyStoryCard(
    presentation: MyStoryCardPresentation,
    accentHex: String,
    actions: MyStoryCardActions,
    modifier: Modifier = Modifier,
) {
    val accent = hexColor(accentHex, MaterialTheme.colorScheme.primary)
    val id = presentation.id
    val selected = presentation.selection == MyStorySelectionIndicator.SELECTED
    val shape = RoundedCornerShape(16.dp)
    val scale by animateFloatAsState(if (selected) 0.96f else 1f, label = "myStoryScale")
    var menuOpen by remember { mutableStateOf(false) }
    val isDraft = presentation.kind == MyStoryCardKind.DRAFT
    val thumbnailLabel = if (presentation.isVeiled) {
        stringResource(R.string.my_stories_card_expired, presentation.dateText)
    } else {
        presentation.dateText
    }
    val deleteLabel = stringResource(R.string.my_stories_delete)
    val secondaryLabel = stringResource(if (presentation.isVeiled) R.string.my_stories_repost else R.string.my_stories_edit)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(shape)
            .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.08f))
            .border(if (selected) 2.5.dp else 0.dp, if (selected) accent else Color.Transparent, shape)
            .semantics {
                customActions = listOf(
                    CustomAccessibilityAction(deleteLabel) { actions.onDelete(id); true },
                    CustomAccessibilityAction(secondaryLabel) {
                        if (presentation.isVeiled) actions.onRepublish(id) else actions.onEdit(id)
                        true
                    },
                )
            },
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(9f / 16f)
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                .combinedClickable(onClick = { actions.onOpen(id) }, onLongClick = { actions.onSelectStart(id) })
                .semantics {
                    role = Role.Button
                    contentDescription = thumbnailLabel
                    this.selected = selected
                },
        ) {
            ThumbnailLayers(presentation, accent)
            SelectionBadge(presentation.selection, accent, Modifier.align(Alignment.TopEnd))
        }
        Box {
            MyStoryActionBar(
                glyphs = presentation.glyphs,
                onGlyph = { glyph ->
                    when (glyph) {
                        MyStoryGlyph.MORE -> menuOpen = true
                        MyStoryGlyph.VIEWS_AND_REACTIONS -> actions.onViewers(id)
                        MyStoryGlyph.COMMENTS -> actions.onComments(id)
                        MyStoryGlyph.PUBLISH -> actions.onEdit(id)
                        MyStoryGlyph.REACTIONS -> Unit
                    }
                },
            )
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                if (isDraft) {
                    MenuItem(R.string.my_stories_edit, MeeshyIcons.Edit) { menuOpen = false; actions.onEdit(id) }
                } else if (presentation.isVeiled) {
                    MenuItem(R.string.my_stories_repost, MeeshyIcons.Repeat) { menuOpen = false; actions.onRepublish(id) }
                } else {
                    MenuItem(R.string.my_stories_viewers, MeeshyIcons.Eye) { menuOpen = false; actions.onViewers(id) }
                    MenuItem(R.string.my_stories_edit, MeeshyIcons.Edit) { menuOpen = false; actions.onEdit(id) }
                }
                MenuItem(R.string.my_stories_delete, MeeshyIcons.Delete) { menuOpen = false; actions.onDelete(id) }
            }
        }
        Text(
            text = presentation.dateText,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = MeeshySpacing.sm, end = MeeshySpacing.sm, bottom = MeeshySpacing.sm),
        )
    }
}

@Composable
private fun MenuItem(label: Int, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    DropdownMenuItem(
        text = { Text(stringResource(label)) },
        leadingIcon = { Icon(icon, contentDescription = null) },
        onClick = onClick,
    )
}

@Composable
private fun ThumbnailLayers(presentation: MyStoryCardPresentation, accent: Color) {
    Box(Modifier.fillMaxSize()) {
        when (val source = presentation.thumbnail) {
            is MyStoryThumbnailSource.Background -> Box(Modifier.fillMaxSize().background(hexColor(source.hex, accent.copy(alpha = 0.2f))))
            is MyStoryThumbnailSource.RemoteUrl -> {
                Placeholder(accent)
                AsyncImage(model = source.url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            }
            is MyStoryThumbnailSource.LocalCover -> {
                Placeholder(accent)
                AsyncImage(model = File(source.path), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            }
            MyStoryThumbnailSource.Placeholder -> Placeholder(accent)
        }
        if (presentation.isVeiled) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)))
        presentation.title?.let { title ->
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.align(Alignment.BottomStart).padding(MeeshySpacing.sm),
            )
        }
    }
}

@Composable
private fun Placeholder(accent: Color) {
    Box(Modifier.fillMaxSize().background(accent.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
        Icon(MeeshyIcons.AddPhoto, contentDescription = null, tint = accent)
    }
}

/** Cercle vide (à sélectionner) ou plein avec coche (dans le lot) ; rien hors mode sélection. */
@Composable
private fun SelectionBadge(selection: MyStorySelectionIndicator, accent: Color, modifier: Modifier = Modifier) {
    when (selection) {
        MyStorySelectionIndicator.HIDDEN -> Unit
        MyStorySelectionIndicator.UNSELECTED -> Box(
            modifier.padding(MeeshySpacing.xsPlus).size(22.dp).clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.25f)).border(2.dp, Color.White, CircleShape),
        )
        MyStorySelectionIndicator.SELECTED -> Box(
            modifier.padding(MeeshySpacing.xsPlus).size(22.dp).clip(CircleShape).background(accent),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
        }
    }
}

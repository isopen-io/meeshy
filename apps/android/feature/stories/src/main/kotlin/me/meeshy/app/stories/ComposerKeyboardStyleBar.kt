package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions.Options
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions.Surface as TypingSurface
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.TextEditTool
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val BAR_TARGET = 48.dp
private val BAR_INK = MeeshyPalette.Indigo950

/**
 * La barre fine collée au clavier (#13835, maquette du 2026-10-30, état 2) : Aa (police), ● (couleur), ≡ (alignement),
 * ▣ (fond du texte) et OK. Une icône ouvre ses choix à la place du clavier, l'icône ouverte est marquée ; OK termine
 * l'écriture sans rien retirer. Rien d'autre : ni puce d'état, ni « Terminé » dans une rangée qui défile.
 */
@Composable
internal fun ComposerKeyboardStyleBar(surface: TypingSurface, onOption: (Options) -> Unit, onDone: () -> Unit) {
    TypingBarFrame(onDone, Arrangement.SpaceAround) {
        Options.entries.forEach { option ->
            BarIcon(
                icon = option.glyph(),
                label = stringResource(option.labelRes()),
                open = surface == TypingSurface.Showing(option),
                onClick = { onOption(option) },
            )
        }
    }
}

/**
 * Le cadre commun des barres de frappe : le fond sombre, le contenu, puis OK, nommé pour TalkBack. La barre de style
 * répartit ses cinq cibles sur toute la largeur, comme la maquette ; la légende laisse son champ prendre la place.
 */
@Composable
internal fun TypingBarFrame(
    onDone: () -> Unit,
    arrangement: Arrangement.Horizontal = Arrangement.spacedBy(MeeshySpacing.xxs),
    content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit,
) {
    val doneLabel = stringResource(R.string.composer_typing_done)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = ComposerKeyboardOrOptions.BAR_HEIGHT.dp)
            .background(BAR_INK)
            .padding(horizontal = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = arrangement,
    ) {
        content()
        Box(
            modifier = Modifier
                .height(BAR_TARGET)
                .widthIn(min = BAR_TARGET)
                .clickable(role = Role.Button, onClick = onDone)
                .semantics { contentDescription = doneLabel }
                .padding(horizontal = MeeshySpacing.xxs),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.composer_scene_done),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier
                    .background(MeeshyPalette.Indigo500, RoundedCornerShape(MeeshyRadius.pill))
                    .padding(horizontal = MeeshySpacing.md, vertical = 6.dp),
            )
        }
    }
}

@Composable
private fun BarIcon(icon: ImageVector, label: String, open: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(BAR_TARGET)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = label
                selected = open
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(if (open) ComposerPlateauInk.accent.copy(alpha = 0.55f) else Color.Transparent, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = Color.White)
        }
    }
}

/**
 * Les seuls choix d'une icône, dans le panneau qui prend la place du clavier : les sections de la loi
 * [ComposerKeyboardOrOptions.tools], empilées dans leur ordre, chacune sur ses gestes d'avant (aucune n'est retirée). La
 * première section se lit par l'icône ; les suivantes (effet, contour, cadre, langue du texte) portent leur titre.
 */
@Composable
internal fun ComposerTypingOptions(option: Options, editedText: StoryTextElement, viewModel: StoryComposerViewModel) {
    Surface(color = MeeshyTheme.tokens.backgroundPrimary, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(MeeshySpacing.smPlus),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            ComposerKeyboardOrOptions.tools(option).forEach { tool ->
                tool.optionsTitleRes()?.let { title ->
                    Text(
                        text = stringResource(title),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextSectionToolbar(editedText, ComposerObjectEditorSection.Tool(tool), viewModel, onPlateau = true)
            }
        }
    }
}

private fun TextEditTool.optionsTitleRes(): Int? = when (this) {
    TextEditTool.EFFECT -> R.string.composer_column_text_effect
    TextEditTool.BORDER -> R.string.stories_composer_outline
    TextEditTool.FRAME -> R.string.composer_column_text_frame
    TextEditTool.LANGUAGE -> R.string.composer_typing_language
    else -> null
}

private fun Options.glyph(): ImageVector = when (this) {
    Options.FONT -> MeeshyIcons.TextFields
    Options.COLOR -> MeeshyIcons.Palette
    Options.ALIGN -> MeeshyIcons.AlignLeft
    Options.BACKING -> MeeshyIcons.CheckBoxBlank
}

private fun Options.labelRes(): Int = when (this) {
    Options.FONT -> R.string.composer_typing_font
    Options.COLOR -> R.string.composer_typing_color
    Options.ALIGN -> R.string.composer_typing_align
    Options.BACKING -> R.string.composer_typing_backing
}

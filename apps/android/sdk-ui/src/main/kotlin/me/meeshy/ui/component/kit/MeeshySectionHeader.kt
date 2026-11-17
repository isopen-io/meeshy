package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val CHEVRON_MILLIS = 200

/**
 * **L'en-tête de section** (K44) : le titre d'un bloc, avec ou sans compteur, accessoire, repli. Cinq formes : titre, sur-titre,
 * séparateur (un libellé entre deux filets), étape numérotée, bandeau de colonne.
 *
 * Agnostique : des mots déjà écrits et des emplacements. Un compteur absent ou nul ne rend ni nombre ni écart. [isCollapsible]
 * avec [onToggle] pose un chevron et rend TOUTE la ligne tactile, annoncée « repliée » ou « dépliée » par [expandedLabel] et
 * [collapsedLabel] ; [onToggle] reçoit l'état DEMANDÉ. Sans [onToggle], rien ne se dit repliable : ni chevron, ni état, ni geste.
 * Le témoin « en direct » est un point vert après le titre, jamais seul : l'hôte donne son mot par [liveLabel]. Aux grandes tailles
 * de texte, l'accessoire passe sous le titre. Jumeau iOS : `MeeshySectionHeader`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod", "CyclomaticComplexMethod")
public fun MeeshySectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    form: MeeshySectionHeaderForm = MeeshySectionHeaderForm.Title,
    size: MeeshySectionHeaderSize = MeeshySectionHeaderSize.Page,
    count: Int? = null,
    stepNumber: Int? = null,
    stepState: MeeshySectionHeaderStepState = MeeshySectionHeaderStepState.Todo,
    isCollapsible: Boolean = false,
    isExpanded: Boolean = true,
    onToggle: ((Boolean) -> Unit)? = null,
    expandedLabel: String? = null,
    collapsedLabel: String? = null,
    isLive: Boolean = false,
    liveLabel: String? = null,
    tint: Color = MeeshyPalette.Indigo500,
    leading: (@Composable () -> Unit)? = null,
    accessory: (@Composable () -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val reduceMotion = LocalReduceMotion.current
    val source = remember { MutableInteractionSource() }
    val isPressed by source.collectIsPressedAsState()
    val textScale = LocalDensity.current.fontScale.toDouble()
    val collapsible = isCollapsible && onToggle != null
    val values = MeeshySectionHeaderRecipe.resolve(form, size, count, collapsible, isExpanded, isPressed, isLive, textScale)
    val chevron by animateFloatAsState(values.chevronDegrees.toFloat(), snapAnimation(reduceMotion), label = "section-chevron")
    val press = if (values.isWholeRowTappable && onToggle != null) {
        Modifier.clickable(interactionSource = source, indication = null, role = Role.Button, onClick = { onToggle(!isExpanded) })
    } else {
        Modifier
    }
    val isLabelForm = values.isUppercase || values.showsRules
    val titleColor = if (isLabelForm) tokens.textMuted else tokens.textPrimary
    val titleText = if (isLabelForm) title.uppercase() else title
    val said = listOfNotNull(title, count?.takeIf { it > 0 }?.toString(), liveLabel?.takeIf { isLive }).joinToString(", ")
    val stateWord = if (collapsible) (if (isExpanded) expandedLabel else collapsedLabel) else null
    val titleRow: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = titleText,
                color = titleColor,
                fontSize = values.titleFontSize.sp,
                fontWeight = if (isLabelForm) FontWeight.SemiBold else FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (values.showsCount) {
                Box(Modifier.width(values.countGap.dp))
                Text("$count", color = tokens.textMuted, fontSize = values.countFontSize.sp)
            }
            if (values.liveDotSize > 0.0) {
                Box(Modifier.width(values.liveDotGap.dp))
                Box(Modifier.size(values.liveDotSize.dp).background(tokens.success, CircleShape))
            }
        }
    }
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = values.minHeight.dp)
            .graphicsLayer {
                scaleX = values.pressScale.toFloat()
                scaleY = values.pressScale.toFloat()
            }
            .background(tokens.textPrimary.copy(alpha = values.pressVeil.toFloat()))
            .then(press)
            .semantics(mergeDescendants = true) {
                heading()
                contentDescription = said
                if (stateWord != null) stateDescription = stateWord
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySectionHeaderRecipe.LEAD_GAP.dp),
    ) {
        if (form == MeeshySectionHeaderForm.Step) {
            StepMark(stepNumber, stepState, tint, values.leadingSize, tokens.success, tokens.textMuted, tokens.textSecondary)
        } else if (leading != null) {
            Box(Modifier.size(values.leadingSize.dp), contentAlignment = Alignment.Center) { leading() }
        }
        if (values.showsRules) {
            Box(Modifier.weight(1f).height(1.dp).background(tokens.hairline))
            titleRow()
            Box(Modifier.weight(1f).height(1.dp).background(tokens.hairline))
        } else if (values.accessoryBelowTitle && accessory != null) {
            Column(Modifier.weight(1f)) {
                titleRow()
                accessory()
            }
        } else {
            Box(Modifier.weight(1f)) { titleRow() }
            if (accessory != null) accessory()
        }
        if (values.showsChevron) {
            Icon(MeeshyIcons.ChevronUp, contentDescription = null, tint = tokens.textSecondary, modifier = Modifier.graphicsLayer { rotationZ = chevron })
        }
    }
}

private fun snapAnimation(reduceMotion: Boolean) =
    androidx.compose.animation.core.tween<Float>(if (reduceMotion) 0 else CHEVRON_MILLIS)

@Composable
@Suppress("LongParameterList")
private fun StepMark(number: Int?, state: MeeshySectionHeaderStepState, tint: Color, sizeDp: Double, done: Color, outline: Color, quietInk: Color) {
    val appearance = MeeshySectionHeaderRecipe.stepAppearance(state)
    val base = Modifier.size(sizeDp.dp)
    val body = when (appearance) {
        MeeshySectionHeaderStepAppearance.Check -> base.background(done, CircleShape)
        MeeshySectionHeaderStepAppearance.Filled -> base.background(tint, CircleShape)
        MeeshySectionHeaderStepAppearance.Outlined -> base.border(1.5.dp, outline, CircleShape)
    }
    Box(body, contentAlignment = Alignment.Center) {
        when (appearance) {
            MeeshySectionHeaderStepAppearance.Check ->
                Icon(MeeshyIcons.Check, contentDescription = null, tint = MeeshyKitColor.inkOn(done, MeeshyTicketRecipe.DARK_INK), modifier = Modifier.size(14.dp))
            MeeshySectionHeaderStepAppearance.Filled ->
                Text("${number ?: ""}", color = MeeshyKitColor.inkOn(tint, MeeshyTicketRecipe.DARK_INK), fontSize = 13.sp, fontWeight = FontWeight.Bold)
            MeeshySectionHeaderStepAppearance.Outlined ->
                Text("${number ?: ""}", color = quietInk, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
    }
}

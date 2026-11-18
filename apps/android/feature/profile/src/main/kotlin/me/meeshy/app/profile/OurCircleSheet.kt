package me.meeshy.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.relation.OurCircleMissing
import me.meeshy.sdk.model.relation.OurCircleView
import me.meeshy.sdk.model.relation.ProfileCircle
import me.meeshy.sdk.model.relation.RelationFeature
import me.meeshy.sdk.model.relation.RelationGrants
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.ui.component.circles.levelTitle
import me.meeshy.ui.component.circles.tint
import me.meeshy.ui.component.kit.MeeshyCircleScale
import me.meeshy.ui.component.kit.MeeshyCircleScaleForm
import me.meeshy.ui.component.kit.MeeshyCircleScaleSize
import me.meeshy.ui.component.kit.MeeshyLockedRow
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Le titre d'une capacité de la loi d'accès : celui de la Vitrine (« Voir comme »), jamais un second vocabulaire. */
internal fun RelationFeature.titleRes(): Int? = VitrineCapability.entries.firstOrNull { it.feature == this }?.title

/**
 * « Notre cercle » : le niveau accordé de chaque côté, ce que le niveau commun vous ouvre, ce que le cran suivant ajouterait
 * (verrouillé, sans chiffre ni détail) et ce qui manque pour y monter — puis les gestes existants de montée et de descente
 * ([ProfileCircleRow], dialogue de confirmation compris). Tout vient de [OurCircleView], donc de la loi d'accès.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun OurCircleSheet(
    circle: ProfileCircle,
    displayName: String,
    actions: ProfileActionCallbacks,
    allowPromote: Boolean,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        OurCircleContent(circle = circle, displayName = displayName, actions = actions, allowPromote = allowPromote)
    }
}

@Composable
internal fun OurCircleContent(
    circle: ProfileCircle,
    displayName: String,
    actions: ProfileActionCallbacks,
    allowPromote: Boolean,
) {
    val view = remember(circle.link) { OurCircleView.of(circle.link) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 640.dp)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.xl)
            .padding(bottom = MeeshySpacing.xxl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.fiche_circle_title, displayName),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        MeeshyCircleScale(
            levels = relationScaleLevels(),
            current = view.level.ordinal,
            form = MeeshyCircleScaleForm.Dots,
            size = MeeshyCircleScaleSize.Regular,
            tint = view.level.tint(),
            showsTitles = false,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = stringResource(R.string.fiche_circle_common),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        GrantLines(view.grants, displayName)
        OpenSection(view)
        LockedSection(view)
        MissingLine(view.missing, displayName)
        ProfileCircleRow(
            circle = circle,
            displayName = displayName,
            onRaise = actions.onRaise,
            onLower = actions.onLower,
            allowPromote = allowPromote,
        )
    }
}

@Composable
private fun GrantLines(grants: RelationGrants, displayName: String) {
    val theirs = levelTitle(grants.theirs, null)
    val theirsText = if (grants.theirsAtLeast) stringResource(R.string.fiche_circle_at_least, theirs) else theirs
    GrantLine(stringResource(R.string.fiche_circle_they_grant, displayName), theirsText, grants.theirs)
    GrantLine(stringResource(R.string.fiche_circle_you_grant, displayName), levelTitle(grants.mine, null), grants.mine)
}

@Composable
private fun GrantLine(label: String, value: String, level: RelationLevel) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 40.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
        Text(text = value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = level.tint())
    }
}

@Composable
private fun OpenSection(view: OurCircleView) {
    val titles = view.open.mapNotNull { it.titleRes() }
    if (titles.isEmpty()) return
    SectionHeading(stringResource(R.string.fiche_circle_opens, levelTitle(view.level, null)))
    titles.forEach { title ->
        Text(
            text = stringResource(title),
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(vertical = MeeshySpacing.xs),
        )
    }
}

@Composable
private fun LockedSection(view: OurCircleView) {
    val next = view.next ?: return
    val rows = view.locked.mapNotNull { it.titleRes() }
    if (rows.isEmpty()) return
    SectionHeading(stringResource(R.string.fiche_circle_opens_more, levelTitle(next, null)))
    rows.forEach { title ->
        MeeshyLockedRow(
            title = stringResource(title),
            requirement = stringResource(R.string.vitrine_as_opens_from, levelTitle(next, null)),
            tint = next.tint(),
        )
    }
}

@Composable
private fun MissingLine(missing: OurCircleMissing, displayName: String) {
    val text = when (missing) {
        is OurCircleMissing.TheyMustGrant -> stringResource(R.string.fiche_circle_missing_they, displayName, levelTitle(missing.level, null))
        is OurCircleMissing.YouMustGrant -> stringResource(R.string.fiche_circle_missing_you, displayName, levelTitle(missing.level, null))
        OurCircleMissing.None -> return
    }
    Text(text = text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
}

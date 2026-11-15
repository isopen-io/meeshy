package me.meeshy.app.auth.invite

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.InviteRightRow
import me.meeshy.sdk.model.InviteValidity
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.ShareLinkInvitationTerms
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * « En anonyme, tu pourras » : les droits d'un invité, les champs demandés, les langues acceptées,
 * la validité et les places. Chaque droit est annoncé « Autorisé : … » / « Non autorisé : … » — la
 * couleur seule ne porte pas l'état. Miroir de `InviteGuestTermsCard` (iOS).
 */
@Composable
internal fun InviteGuestRightsCard(terms: ShareLinkInvitationTerms, isDark: Boolean, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().inviteCardSurface(isDark).padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        InviteSectionTitle(stringResource(R.string.invite_landing_terms_title), isDark)
        terms.rights.forEach { RightRow(it, isDark) }
        Row(Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xxs).height(1.dp).background(InviteInk.hairline(isDark))) {}
        Fact(stringResource(R.string.invite_landing_terms_asked_label), joined(terms.requestedFields.map { stringResource(InviteLandingCopy.field(it)) }), isDark)
        Fact(
            stringResource(R.string.invite_landing_terms_languages_label),
            if (terms.acceptedLanguages.isEmpty()) {
                stringResource(R.string.invite_landing_terms_all_languages)
            } else {
                joined(terms.acceptedLanguages.map { LanguageData.autonym(it) })
            },
            isDark,
        )
        Fact(stringResource(R.string.invite_landing_terms_validity_label), "${validity(terms.validity)} · ${places(terms)}", isDark)
    }
}

@Composable
private fun validity(validity: InviteValidity): String = when (validity) {
    InviteValidity.NoExpiry -> stringResource(R.string.invite_landing_terms_no_expiry)
    InviteValidity.Expired -> stringResource(R.string.invite_landing_terms_expired)
    is InviteValidity.DaysLeft ->
        if (validity.days == 1) stringResource(R.string.invite_landing_terms_one_day_left)
        else stringResource(R.string.invite_landing_terms_days_left, validity.days)
}

@Composable
private fun places(terms: ShareLinkInvitationTerms): String {
    val remaining = terms.remainingPlaces
    val max = terms.maxUses
    return if (remaining == null || max == null) stringResource(R.string.invite_landing_terms_unlimited_places)
    else stringResource(R.string.invite_landing_terms_places, remaining, max)
}

private fun joined(items: List<String>): String =
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
        android.icu.text.ListFormatter.getInstance().format(items)
    } else {
        items.joinToString(", ")
    }

@Composable
private fun RightRow(row: InviteRightRow, isDark: Boolean) {
    val label = stringResource(InviteLandingCopy.right(row.right))
    val spoken = stringResource(
        if (row.allowed) R.string.invite_landing_terms_allowed else R.string.invite_landing_terms_denied,
        label,
    )
    Row(
        modifier = Modifier.clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (row.allowed) MeeshyIcons.Check else MeeshyIcons.Close,
            contentDescription = null,
            tint = if (row.allowed) MeeshyPalette.SuccessDeep else MeeshyPalette.ErrorStrong,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            textDecoration = if (row.allowed) null else TextDecoration.LineThrough,
            color = if (row.allowed) InviteInk.title(isDark) else InviteInk.muted(isDark),
        )
    }
}

@Composable
private fun Fact(label: String, value: String, isDark: Boolean) {
    val title = InviteInk.title(isDark)
    Text(
        text = buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = title)) { append(label) }
            append(" ")
            append(value)
        },
        style = MaterialTheme.typography.labelLarge,
        color = if (isDark) MeeshyPalette.Indigo200 else MeeshyPalette.Neutral600,
    )
}

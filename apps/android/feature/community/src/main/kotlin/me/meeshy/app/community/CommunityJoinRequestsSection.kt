package me.meeshy.app.community

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.FormatStyle
import java.util.Locale
import me.meeshy.feature.community.R
import me.meeshy.sdk.model.ApiCommunityJoinRequest
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * L'en-tête des demandes en attente, en tête de l'écran Membres (#19878, iso iOS `CommunityJoinRequestsSection`,
 * #19877) — pour l'intendant seul. Le compte dit « + » quand d'autres pages attendent.
 */
@Composable
internal fun JoinRequestsHeader(count: Int, hasMore: Boolean) {
    val tokens = MeeshyTheme.tokens
    Row(
        Modifier.fillMaxWidth().background(tokens.backgroundSecondary).padding(horizontal = 16.dp, vertical = 8.dp).semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(MeeshyIcons.Schedule, null, tint = tokens.textSecondary, modifier = Modifier.size(12.dp))
        Text(stringResource(R.string.community_members_requests_section).uppercase(), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = tokens.textSecondary)
        Text("$count${if (hasMore) "+" else ""}", fontSize = 11.sp, color = tokens.textMuted)
    }
}

/**
 * Une demande : QUI (avatar, nom), D'OÙ (le pays, jamais la ville) et QUAND ; deux vrais boutons de 48 dp,
 * nommés pour TalkBack. Aucun point de présence : la passerelle ne sert pas celle d'un demandeur.
 */
@Composable
internal fun JoinRequestRow(request: ApiCommunityJoinRequest, busy: Boolean, onAccept: () -> Unit, onReject: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    Column(modifier) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MeeshyAvatar(name = request.name, size = 44.dp, containerColor = hexColor(DynamicColorGenerator.colorForName(request.name)), imageUrl = request.avatar)
            Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
                Text(request.name, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(requestMeta(request), fontSize = 13.sp, color = tokens.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            DecisionButton(MeeshyIcons.Close, tokens.textMuted, stringResource(R.string.community_members_requests_reject_label, request.name), busy, onReject)
            DecisionButton(MeeshyIcons.Check, tokens.success, stringResource(R.string.community_members_requests_accept_label, request.name), busy, onAccept)
        }
        HorizontalDivider(Modifier.padding(start = 72.dp), color = tokens.hairline)
    }
}

@Composable
internal fun JoinRequestsMore(onMore: () -> Unit) {
    TextButton(onClick = onMore, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
        Text(stringResource(R.string.community_members_requests_more), color = MeeshyPalette.Indigo500, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
    }
}

/** Ce que l'écran dit après une décision ; annoncé à TalkBack sans voler le focus. */
@Composable
internal fun JoinRequestNoticeText(notice: CommunityJoinRequestNotice) {
    val tokens = MeeshyTheme.tokens
    val text = when (notice) {
        is CommunityJoinRequestNotice.Accepted -> stringResource(R.string.community_members_requests_accepted, notice.name)
        CommunityJoinRequestNotice.Gone -> stringResource(R.string.community_members_requests_gone)
        CommunityJoinRequestNotice.Failed -> stringResource(R.string.community_members_requests_failed)
    }
    Text(
        text,
        fontSize = 13.sp,
        fontWeight = FontWeight.Medium,
        color = if (notice == CommunityJoinRequestNotice.Failed) tokens.error else tokens.textSecondary,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
private fun DecisionButton(icon: ImageVector, tint: Color, label: String, busy: Boolean, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        enabled = !busy,
        modifier = Modifier.size(48.dp).alpha(if (busy) 0.4f else 1f),
    ) {
        Icon(icon, label, tint = tint, modifier = Modifier.background(tint.copy(alpha = 0.12f), CircleShape).padding(8.dp).size(18.dp))
    }
}

@Composable
private fun requestMeta(request: ApiCommunityJoinRequest): String {
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val country = request.countryCode?.let { Locale("", it).getDisplayCountry(locale).ifBlank { it } }
    val asked = askedOn(request.createdAt, locale)?.let { stringResource(R.string.community_members_requests_asked, it) }
    return listOfNotNull(country, asked).joinToString(" · ")
}

private fun askedOn(raw: String, locale: Locale): String? =
    try {
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(Instant.parse(raw).atZone(ZoneId.systemDefault()))
    } catch (_: DateTimeParseException) {
        null
    }

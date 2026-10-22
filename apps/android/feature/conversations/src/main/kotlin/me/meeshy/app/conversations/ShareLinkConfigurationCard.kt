package me.meeshy.app.conversations

import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.util.Locale
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.MyShareLink
import me.meeshy.sdk.model.ShareLinkAskedField
import me.meeshy.sdk.model.ShareLinkDateFormat
import me.meeshy.sdk.model.ShareLinkEditDraft
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.chrome.MeeshyCard
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La configuration du lien, EN LECTURE (#7797) : droits des invités sans compte, conditions
 * d'entrée, limites, langues autorisées. « Modifier » descend au formulaire, qui édite
 * exactement ces champs. Miroir de `ShareLinkConfigurationCard` (iOS).
 */
@Composable
internal fun ShareLinkConfigurationCard(link: MyShareLink, onEdit: () -> Unit) {
    val settings = remember(link) { ShareLinkEditDraft.from(link) }
    MeeshyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SectionTitle(stringResource(R.string.shareLink_detail_configuration))
                TextButton(onClick = onEdit, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(
                        stringResource(R.string.shareLink_detail_edit),
                        fontWeight = FontWeight.Bold,
                        color = MeeshyPalette.Indigo400,
                    )
                }
            }

            Subtitle(stringResource(R.string.shareLink_detail_guestRights))
            RightRow(stringResource(R.string.share_link_permission_messages), settings.allowMessages)
            RightRow(stringResource(R.string.shareLink_detail_historyRight), settings.allowHistory)
            RightRow(stringResource(R.string.share_link_permission_images), settings.allowImages)
            RightRow(stringResource(R.string.share_link_permission_files), settings.allowFiles)

            Subtitle(stringResource(R.string.shareLink_detail_entryConditions))
            ValueRow(
                stringResource(R.string.shareLink_detail_meeshyAccount),
                stringResource(
                    if (settings.requireAccount) R.string.shareLink_detail_required else R.string.shareLink_detail_optional,
                ),
            )
            ValueRow(stringResource(R.string.shareLink_detail_askedOnArrival), askedFieldsSentence(settings))

            Subtitle(stringResource(R.string.shareLink_detail_limits))
            ValueRow(
                stringResource(R.string.shareLink_detail_uses),
                settings.maxUses?.let { "${link.currentUses.formatted()} / ${it.formatted()}" }
                    ?: stringResource(R.string.shareLink_detail_usesUnlimited, link.currentUses),
            )
            ValueRow(
                stringResource(R.string.shareLink_detail_concurrent),
                settings.maxConcurrentUsers?.let { stringResource(R.string.shareLink_detail_concurrentMax, it) }
                    ?: stringResource(R.string.shareLink_detail_unlimited),
            )
            ValueRow(
                stringResource(R.string.shareLink_detail_expires),
                isoToEpochMillisOrNull(settings.expiresAt)?.let { ShareLinkDateFormat.dayAndTime(it) }
                    ?: stringResource(R.string.shareLink_detail_never),
            )

            Subtitle(stringResource(R.string.shareLink_detail_allowedLanguages))
            Text(
                text = if (settings.allowsAllLanguages) {
                    stringResource(R.string.shareLink_detail_allLanguages)
                } else {
                    joinForLocale(settings.allowedLanguages.map { LanguageData.autonym(it) })
                },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
    }
}

private fun Int.formatted(): String = String.format(Locale.getDefault(), "%,d", this)

@Composable
internal fun SectionTitle(text: String) {
    Text(
        text = text.uppercase(Locale.getDefault()),
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.ExtraBold,
        color = MeeshyPalette.Indigo400,
    )
}

@Composable
private fun Subtitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.Bold,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.padding(top = MeeshySpacing.xs),
    )
}

@Composable
private fun ValueRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f),
        )
    }
}

/** Un droit accordé ou refusé : l'état n'est jamais porté par la seule couleur (icône + libellé). */
@Composable
private fun RightRow(label: String, allowed: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (allowed) Icons.Filled.Check else Icons.Filled.Close,
            contentDescription = null,
            tint = if (allowed) MeeshyTheme.tokens.success else MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (allowed) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textMuted,
        )
    }
}

/** « Prénom, nom et pseudo » : une seule phrase liée à la façon de la locale, majuscule au premier mot. */
@Composable
private fun askedFieldsSentence(settings: ShareLinkEditDraft): String {
    val names = settings.askedFields.map {
        stringResource(
            when (it) {
                ShareLinkAskedField.FirstName -> R.string.shareLink_detail_fieldFirstName
                ShareLinkAskedField.LastName -> R.string.shareLink_detail_fieldLastName
                ShareLinkAskedField.Nickname -> R.string.shareLink_detail_fieldNickname
                ShareLinkAskedField.Email -> R.string.shareLink_detail_fieldEmail
                ShareLinkAskedField.Birthday -> R.string.shareLink_detail_fieldBirthday
            },
        )
    }
    val sentence = joinForLocale(names)
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    return sentence.replaceFirstChar { it.uppercase(locale) }
}

internal fun joinForLocale(items: List<String>): String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        android.icu.text.ListFormatter.getInstance().format(items)
    } else {
        items.joinToString(", ")
    }

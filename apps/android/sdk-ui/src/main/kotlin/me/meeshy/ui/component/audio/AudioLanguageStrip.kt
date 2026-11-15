package me.meeshy.ui.component.audio

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.playback.AudioLanguageStripLaw
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing

/** Une pastille du bandeau : le drapeau, le nom, et si elle est la langue jouée. [code] vaut [AudioLanguageStripLaw.ORIGINAL] pour l'original. */
@Immutable
public data class AudioLanguagePill(
    val code: String,
    val flag: String,
    val label: String,
    val isSelected: Boolean,
)

/**
 * Le bandeau de langues d'un lecteur vocal et ce qu'un toucher fait ([onSelect] reçoit [AudioLanguageStripLaw.ORIGINAL] ou le
 * code de la langue) : l'hôte reste maître de l'état de langue, le bandeau ne décide rien.
 */
@Immutable
public class AudioLanguageStripSpec(
    public val pills: List<AudioLanguagePill>,
    public val onSelect: (String) -> Unit,
)

/** L'étiquette de test du bandeau, et celle d'une pastille par son code. */
public const val AUDIO_LANGUAGE_STRIP_TAG: String = "audioLanguageStrip"

public fun audioLanguagePillTag(code: String): String = "audioLanguagePill-$code"

/**
 * **Le bandeau de langues sous un lecteur vocal** (iOS `AudioLanguageStrip`) : la pastille « Original » avec son haut-parleur,
 * puis une pastille par piste traduite avec son drapeau ; la langue jouée est en gras sur l'accent de la conversation (passé
 * en paramètre). Un toucher porte une haptique légère, sans popup ni bannière.
 */
@Composable
public fun AudioLanguageStrip(
    pills: List<AudioLanguagePill>,
    accent: Color,
    isDark: Boolean,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.sm)
            .semantics { testTag = AUDIO_LANGUAGE_STRIP_TAG },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        pills.forEach { pill ->
            val ink = if (isDark) Color.White else Color.Black
            Row(
                modifier = Modifier
                    .semantics {
                        role = Role.Button
                        selected = pill.isSelected
                        contentDescription = pill.label
                        testTag = audioLanguagePillTag(pill.code)
                    }
                    .clickable {
                        haptics.light()
                        onSelect(pill.code)
                    }
                    .meeshyTapTarget()
                    .clip(CircleShape)
                    .background(if (pill.isSelected) accent else ink.copy(alpha = if (isDark) 0.07f else 0.04f))
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = pill.flag, fontSize = MeeshyFontSize.small)
                Text(
                    text = pill.label,
                    fontSize = MeeshyFontSize.caption,
                    fontWeight = if (pill.isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (pill.isSelected) Color.White else ink.copy(alpha = if (isDark) 0.55f else 0.45f),
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * Les pastilles d'un lecteur : [AudioLanguageStripLaw.pills] habillées de leurs drapeaux et noms. [translated] est la liste
 * des langues de piste dans l'ordre servi ; [selected] la langue jouée (`null` ⇒ l'original).
 */
@Composable
public fun rememberAudioLanguagePills(translated: List<String>, selected: String?): List<AudioLanguagePill> {
    val originalLabel = stringResource(R.string.media_audio_original)
    return remember(translated, selected, originalLabel) {
        AudioLanguageStripLaw.pills(translated, selected).map { pill ->
            if (pill.isOriginal) {
                AudioLanguagePill(pill.code, ORIGINAL_FLAG, originalLabel, pill.isSelected)
            } else {
                val info = LanguageData.info(pill.code)
                AudioLanguagePill(pill.code, info?.flag ?: UNKNOWN_FLAG, info?.nativeName ?: pill.code, pill.isSelected)
            }
        }
    }
}

private const val ORIGINAL_FLAG = "🔊"
private const val UNKNOWN_FLAG = "🌐"

package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.LanguageData
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La pastille de langue de la barre d'outils (iOS `languageSelectorPill`) : « 🇫🇷 FR » sur une
 * ligne, drapeau 12 et code 11 semibold, dans une capsule teintée de la couleur des icônes à
 * 18 %. Elle suit la détection sur l'appareil et ouvre un menu « drapeau nom » coché sur la
 * langue courante. Colle Compose mince au-dessus de [me.meeshy.sdk.model.ComposerLanguageState].
 */
@Composable
internal fun ComposerLanguagePill(
    languageCode: String,
    tint: Color,
    accentColor: Color,
    onPick: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val description = stringResource(R.string.chat_composer_language)
    val languageName = LanguageData.info(languageCode)?.nativeName ?: languageCode
    Box {
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.18f), CircleShape)
                .clickable(role = Role.Button) { expanded = true }
                .semantics {
                    contentDescription = description
                    stateDescription = languageName
                }
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        ) {
            Text(text = ComposerLanguage.flag(languageCode), fontSize = 12.sp)
            Text(
                text = languageCode.substringBefore('-').uppercase(),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = tint,
                maxLines = 1,
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            LanguageData.commonLanguageCodes.forEach { code ->
                val info = LanguageData.info(code) ?: return@forEach
                DropdownMenuItem(
                    text = { Text("${info.flag}  ${info.nativeName}") },
                    onClick = {
                        expanded = false
                        onPick(code)
                    },
                    trailingIcon = if (code == languageCode) {
                        {
                            Icon(
                                imageVector = MeeshyIcons.Check,
                                contentDescription = null,
                                tint = accentColor,
                            )
                        }
                    } else {
                        null
                    },
                )
            }
        }
    }
}

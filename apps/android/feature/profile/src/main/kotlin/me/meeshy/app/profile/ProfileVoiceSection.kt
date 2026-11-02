package me.meeshy.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.ui.component.audio.MeeshyVoiceSamplePlayer
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val PROFILE_VOICE_CARD_TAG = "profile-voice-card"

/** L'échantillon public d'une voix : l'adresse servie et sa durée connue (ms), si le profil la donne. */
@Immutable
data class ProfileVoiceSample(val url: String, val durationMs: Long?)

/**
 * Quand la carte « Voix » existe (miroir de `voiceSection` iOS) : seulement si la personne a rendu sa
 * voix publique (`voicePublic == true`, jamais sur `null`) ET qu'une adresse non vide est servie.
 */
object ProfileVoiceVisibility {
    fun sample(voicePublic: Boolean?, voiceSampleUrl: String?, voiceSampleDurationMs: Int?): ProfileVoiceSample? {
        if (voicePublic != true) return null
        val url = voiceSampleUrl?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return ProfileVoiceSample(url = url, durationMs = voiceSampleDurationMs?.toLong()?.takeIf { it > 0 })
    }
}

/**
 * La carte verre « Voix » (miroir de `voiceCard` iOS) : icône waveform et titre teintés d'accent,
 * puis le lecteur de l'échantillon ; annoncée « Voix » par TalkBack, ses commandes restant
 * atteignables une à une.
 */
@Composable
internal fun ProfileVoiceCard(sample: ProfileVoiceSample, accent: Color) {
    val title = stringResource(R.string.profile_voice_title)
    MeeshyGlassSurface(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = title }
            .testTag(PROFILE_VOICE_CARD_TAG),
        shape = RoundedCornerShape(MeeshyRadius.xxl),
        tint = accent,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(imageVector = MeeshyIcons.Waveform, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
            }
            MeeshyVoiceSamplePlayer(url = sample.url, durationMs = sample.durationMs, accent = accent)
        }
    }
}

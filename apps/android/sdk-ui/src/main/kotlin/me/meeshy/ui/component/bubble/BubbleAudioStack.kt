package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import java.time.Instant
import me.meeshy.sdk.model.AudioPlayerChrome
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.playback.VoiceStackPlan
import me.meeshy.sdk.model.playback.VoiceTrackLanguages
import me.meeshy.sdk.model.voice.shouldShowConsentNotice
import me.meeshy.ui.R
import me.meeshy.sdk.model.settings.SettingsInvite
import me.meeshy.ui.component.audio.AudioConsentNotice
import me.meeshy.ui.settings.rememberSettingsInvite
import me.meeshy.ui.theme.MeeshySpacing

/** L'étiquette de test d'une rangée de la pile ; la rangée `i` (base 1) de l'attachement `id`. */
public const val BUBBLE_AUDIO_STACK_ROW_TAG: String = "bubble-audio-stack-row"

/**
 * **La pile des vocaux d'un message** (iOS `AudioStackView`, directive porteur #10654) : chaque piste sur sa rangée, de
 * haut en bas, chacune avec son lecteur COMPLET ; plusieurs pistes se disent « Vocal 2 sur 3 » à TalkBack. Le toucher
 * d'une rangée démarre la file du moteur partagé depuis elle, qui enchaîne les suivantes. Le pied du message (heure,
 * coche, drapeaux) reste UN, posé par la bulle — ses drapeaux sont l'union des langues des pistes
 * ([BubbleVoiceStackFooter]). L'avis de consentement vocal, cliquable, ferme la pile.
 */
@Composable
public fun BubbleAudioStack(
    content: BubbleContent,
    playback: BubbleAudioPlayback?,
    onColor: Color,
    accent: Color,
    callbacks: BubbleCallbacks,
    modifier: Modifier = Modifier,
    chrome: AudioPlayerChrome = LocalBubbleAudioChrome.current,
    autoRevealTranscription: Boolean = true,
) {
    if (content.audios.isEmpty()) return
    val rows = remember(content.audios) { VoiceStackPlan.rows(content.audios.map { it.attachmentId }) }
    val receivedAtEpochMs = remember(content.createdAtIso) {
        content.createdAtIso?.let { iso -> runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull() }
    }
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        content.audios.forEachIndexed { index, audio ->
            key(audio.attachmentId) {
                val row = rows[index]
                val label = if (row.count > 1) stringResource(R.string.bubble_audio_stack_position, row.position, row.count) else null
                Box(
                    modifier = Modifier
                        .testTag("$BUBBLE_AUDIO_STACK_ROW_TAG-${row.position}")
                        .let { base -> if (label == null) base else base.semantics { contentDescription = label } },
                ) {
                    BubbleVoicePlayer(
                        audio = audio,
                        playback = playback?.takeIf { it.attachmentId == audio.attachmentId },
                        onColor = onColor,
                        accent = accent,
                        callbacks = callbacks,
                        chrome = chrome,
                        autoRevealTranscription = autoRevealTranscription,
                        receivedAtEpochMs = receivedAtEpochMs,
                    )
                }
            }
        }
        if (content.showsVoiceConsentNotice()) {
            val openConsent = callbacks.onTapConsentNotice ?: rememberSettingsInvite(SettingsInvite.VOICE_CONSENT)
            AudioConsentNotice(
                message = stringResource(R.string.audio_consent_notice_message),
                actionTitle = stringResource(R.string.audio_consent_notice_action),
                accentHex = "#%06X".format(accent.toArgb() and 0xFFFFFF),
                onTap = openConsent ?: {},
                modifier = Modifier.padding(top = MeeshySpacing.xs),
            )
        }
    }
}

/** Le consentement vocal manquant ne se propose que sous MON message qui porte un audio ([shouldShowConsentNotice]). */
internal fun BubbleContent.showsVoiceConsentNotice(): Boolean =
    audios.isNotEmpty() && shouldShowConsentNotice(isOwn = isOutgoing, voiceConsentMissing = voiceConsentMissing)

/**
 * Les drapeaux du pied UNIQUE d'une pile (iOS `AudioStackView.sharedFooterModel`) : l'union ordonnée des langues de
 * toutes les pistes ([VoiceStackPlan.footerLanguages]), le drapeau actif suivant la piste servie. Un vocal SEUL porte
 * les drapeaux de ses pistes (iOS `audioFooter` : l'origine d'abord, puis chaque piste traduite) ; sans langue de piste, ou
 * protégé (rien ne part à côté d'un vocal scellé), le pied garde les drapeaux du texte.
 */
public object BubbleVoiceStackFooter {

    public fun chips(content: BubbleContent): List<LanguageChip> {
        if (content.audios.isEmpty() || content.audios.any { it.isProtected }) return content.languageStrip
        val codes = VoiceStackPlan.footerLanguages(
            content.audios.map { VoiceTrackLanguages(it.attachmentId, it.originalLanguage, it.translatedLanguages) },
        )
        if (codes.isEmpty()) return content.languageStrip
        val originals = content.audios.mapNotNullTo(HashSet()) { it.originalLanguage?.trim()?.lowercase() }
        val active = content.audios.firstNotNullOfOrNull { it.audioLanguage?.trim()?.lowercase() }
        return codes.map { code ->
            content.languageStrip.firstOrNull { it.code.equals(code, ignoreCase = true) }
                ?: LanguageChip(
                    code = code,
                    info = LanguageData.info(code),
                    isOriginal = code in originals,
                    isActive = code == active,
                )
        }
    }
}

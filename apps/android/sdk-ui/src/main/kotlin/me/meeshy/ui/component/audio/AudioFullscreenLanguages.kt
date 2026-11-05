package me.meeshy.ui.component.audio

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import me.meeshy.ui.R
import me.meeshy.ui.component.fullscreen.FullscreenChromeButton
import me.meeshy.ui.component.fullscreen.FullscreenChromeTone
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** L'étiquette de test du disque « Traduire l'audio ». */
public const val AUDIO_FULLSCREEN_TRANSLATE_TAG: String = "audioFullscreenTranslate"

/** La ligne des langues existe-t-elle pour [source] ? Des pistes déjà prêtes, ou la possibilité d'en demander — sinon rien (pas de pied vide). */
internal fun audioFullscreenShowsLanguages(source: AudioFullscreenSource, transcripts: AudioFullscreenTranscriptPort?): Boolean =
    transcripts != null && (source.translatedLanguages.isNotEmpty() || transcripts.offersLanguages(source))

/**
 * **Les langues du vocal, au pied du plein écran** (iOS `inlineLanguageFlags`) : le bandeau « Original » + une pastille par piste
 * traduite — la langue jouée remplie de l'accent de la conversation — qui défile à gauche, et à droite, HORS du défilement, le
 * disque « Traduire l'audio » qui ouvre la feuille des langues. Choisir une pastille change la piste jouée ([AudioFullscreenTranscriptPort.selectLanguage])
 * sans quitter la page ni perdre la file ; le bandeau ne décide rien, l'hôte reste maître de la langue. Sans [transcripts], ou
 * s'il n'offre ni pistes ni traduction, la ligne n'existe pas.
 */
@Composable
internal fun AudioFullscreenLanguages(
    source: AudioFullscreenSource,
    transcripts: AudioFullscreenTranscriptPort?,
    accent: Color,
    onInteraction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (transcripts == null || !audioFullscreenShowsLanguages(source, transcripts)) return
    val canTranslate = transcripts.offersLanguages(source)
    val selected = if (source.isTranslatedTrack) source.trackLanguage else null
    val pills = rememberAudioLanguagePills(source.translatedLanguages, selected)
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AudioLanguageStrip(
            pills = pills,
            accent = accent,
            isDark = MeeshyTheme.isDark,
            onSelect = { code ->
                onInteraction()
                transcripts.selectLanguage(source, code)
            },
            modifier = Modifier.weight(1f),
        )
        if (canTranslate) {
            FullscreenChromeButton(
                icon = MeeshyIcons.Translate,
                label = stringResource(R.string.audio_fullscreen_language_choose),
                onClick = {
                    onInteraction()
                    transcripts.openLanguages(source)
                },
                tone = FullscreenChromeTone.Adaptive,
                modifier = Modifier.semantics { testTag = AUDIO_FULLSCREEN_TRANSLATE_TAG },
            )
        }
    }
}

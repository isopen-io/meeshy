package me.meeshy.ui.component.audio

import android.text.format.DateUtils
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.fullscreen.AudioFullscreenArrangement
import me.meeshy.sdk.model.fullscreen.AudioFullscreenLayout
import me.meeshy.sdk.model.fullscreen.AudioFullscreenPageProgress
import me.meeshy.sdk.model.fullscreen.AudioFullscreenPlaybackScope
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.R
import me.meeshy.ui.component.chrome.FullscreenTopBar
import me.meeshy.ui.component.fullscreen.FullscreenChromeButton
import me.meeshy.ui.component.fullscreen.FullscreenChromeDimens
import me.meeshy.ui.component.fullscreen.FullscreenChromeTone
import me.meeshy.ui.component.fullscreen.LocalFullscreenChromeInteractive
import me.meeshy.ui.component.fullscreen.icon
import me.meeshy.ui.profile.LocalProfileSheetOpener
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Une page du plein écran audio** (iOS `AudioFullscreenPage`) : en haut la croix, le compteur « i / n » et le
 * téléchargement ; au centre le portrait de l'auteur — sa décoration de profil et sa présence SERVIE (hors ligne : aucun
 * point) — au cœur du cadran qui porte le spectre et la progression ; dessous, le nom et la date, la transcription, puis
 * le transport. Toucher le portrait ou le nom ouvre la fiche de l'auteur ; toucher le fond efface ou rend le chrome.
 */
@Composable
internal fun AudioFullscreenPage(
    source: AudioFullscreenSource,
    pageIndex: Int,
    pageCount: Int,
    player: AudioFullscreenPlayer,
    heardPositionMs: Long?,
    upcoming: () -> List<QueuedAudio>,
    accent: Color,
    chromeVisible: Boolean,
    onClose: () -> Unit,
    onToggleChrome: () -> Unit,
    onRevealChrome: () -> Unit,
    onChromeInteraction: () -> Unit,
    onDownload: ((AudioFullscreenSource) -> Unit)?,
    onNext: (() -> Unit)?,
    onPrevious: (() -> Unit)?,
    rail: (@Composable () -> Unit)? = null,
    transcripts: AudioFullscreenTranscriptPort? = null,
) {
    val playback by remember(player, source.id) {
        player.playback.map { AudioFullscreenPlaybackScope.of(it, source.id) }.distinctUntilChanged()
    }.collectAsState(initial = AudioFullscreenPlaybackScope.of(player.playback.value, source.id))
    val isLoaded = playback.attachmentId == source.id
    val stored = remember(source.id) { player.restingPositionMs(source.id) }
    val resting = heardPositionMs ?: stored
    val progress = AudioFullscreenPageProgress.fraction(source.id, playback, resting, source.servedConsumption, source.durationMs)
    val totalMs = if (isLoaded && playback.durationMs > 0L) playback.durationMs else source.durationMs
    val samples by remember(source.id) { player.samples(source) }.collectAsState()

    var languageChosen by remember(source.id) { mutableStateOf(false) }
    LaunchedEffect(source.url) {
        val now = player.playback.value
        if (languageChosen || (now.isPlaying && now.attachmentId == source.id)) player.switchTrack(source)
        languageChosen = false
    }
    val seekToSeconds: (Double) -> Unit = { seconds ->
        onChromeInteraction()
        val totalSeconds = totalMs / MS_PER_SECOND
        if (isLoaded && totalSeconds > 0.0) player.seek((seconds / totalSeconds).coerceIn(0.0, 1.0))
    }

    Box(
        Modifier
            .fillMaxSize()
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onToggleChrome),
    ) {
        BoxWithConstraints(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing),
        ) {
            val layout = AudioFullscreenLayout.resolve(maxWidth.value, maxHeight.value)
            val railReserve = if (rail != null) FullscreenChromeDimens.tapTarget + MeeshySpacing.sm else 0.dp
            val hero: @Composable () -> Unit = {
                AudioFullscreenHero(
                    source = source,
                    diameter = layout.heroDiameter,
                    progress = progress,
                    isPlaying = isLoaded && playback.isPlaying,
                    totalMs = totalMs,
                    samples = samples,
                    accent = accent,
                    onSeek = { fraction ->
                        onChromeInteraction()
                        if (isLoaded) player.seek(fraction)
                    },
                    onNext = onNext,
                    onPrevious = onPrevious,
                )
            }
            val transport: @Composable () -> Unit = {
                AudioChromeFade(visible = chromeVisible, onReveal = onRevealChrome) {
                    AudioFullscreenTransport(
                        speed = playback.speed,
                        isPlaying = isLoaded && playback.isPlaying,
                        isLoading = isLoaded && playback.isLoading,
                        accent = accent,
                        onSpeedChange = player::setSpeed,
                        onSkip = { seconds -> if (isLoaded) player.skip(seconds) },
                        onPlayPause = {
                            when {
                                !isLoaded -> player.start(source, upcoming())
                                !playback.isPlaying && player.switchTrack(source) -> Unit
                                else -> player.togglePlayPause()
                            }
                        },
                        onInteraction = onChromeInteraction,
                    )
                }
            }
            val topBar: @Composable () -> Unit = {
                AudioFullscreenTopBar(source, pageIndex, pageCount, chromeVisible, onClose, onRevealChrome, onChromeInteraction, onDownload)
            }
            val lyrics: @Composable (Modifier, LyricsPlacement) -> Unit = { lyricsModifier, placement ->
                AudioFullscreenLyrics(source, playback, transcripts, accent, placement, lyricsModifier, seekToSeconds)
            }
            val languages: @Composable (Modifier) -> Unit = { languagesModifier ->
                AudioFullscreenLanguages(source, transcripts, accent, onChromeInteraction, languagesModifier, onLanguageChosen = { languageChosen = true })
            }
            val identity: @Composable () -> Unit = { AudioFullscreenIdentity(source) }
            if (layout.arrangement == AudioFullscreenArrangement.SIDE_BY_SIDE) {
                AudioFullscreenSideBySide(layout, railReserve, topBar, hero, identity, transport, lyrics, languages, rail)
            } else {
                val showsLanguages = audioFullscreenShowsLanguages(source, transcripts)
                AudioFullscreenStacked(layout, maxHeight.value, railReserve, showsLanguages, topBar, hero, identity, transport, lyrics, languages, rail)
            }
        }
    }
}

/** La barre haute : la croix, le compteur « i / n » et le téléchargement ; elle s'efface avec le chrome. */
@Composable
internal fun AudioFullscreenTopBar(
    source: AudioFullscreenSource,
    pageIndex: Int,
    pageCount: Int,
    chromeVisible: Boolean,
    onClose: () -> Unit,
    onRevealChrome: () -> Unit,
    onChromeInteraction: () -> Unit,
    onDownload: ((AudioFullscreenSource) -> Unit)?,
) {
    AudioChromeFade(visible = chromeVisible, onReveal = onRevealChrome) {
        FullscreenTopBar(
            onClose = onClose,
            tone = FullscreenChromeTone.Adaptive,
            leading = {
                if (pageCount > 1) {
                    Text(
                        text = "${pageIndex + 1} / $pageCount",
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
            },
            trailing = {
                if (onDownload != null) {
                    FullscreenChromeButton(
                        icon = FullscreenChromeSymbol.Save.icon,
                        label = stringResource(R.string.media_download),
                        onClick = {
                            onChromeInteraction()
                            onDownload(source)
                        },
                        tone = FullscreenChromeTone.Adaptive,
                    )
                }
            },
        )
    }
}

/** Le nom et la date ; toucher l'un ou l'autre ouvre la fiche de l'auteur. */
@Composable
private fun AudioFullscreenIdentity(source: AudioFullscreenSource) {
    val tokens = MeeshyTheme.tokens
    val opener = LocalProfileSheetOpener.current
    val context = LocalContext.current
    val date = remember(source.createdAtEpochMs) {
        source.createdAtEpochMs.takeIf { it > 0L }?.let {
            DateUtils.formatDateTime(
                context,
                it,
                DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_TIME or DateUtils.FORMAT_ABBREV_MONTH or DateUtils.FORMAT_NO_YEAR,
            )
        }
    }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        modifier = Modifier
            .clickable(role = Role.Button) { opener.open(source.author) }
            .semantics(mergeDescendants = true) {},
    ) {
        Text(
            text = source.authorName,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (date != null) {
            Text(text = date, style = MaterialTheme.typography.bodySmall, color = tokens.textMuted)
        }
    }
}

/**
 * Le chrome qui s'efface pendant l'écoute (la barre haute, le transport) : il s'estompe, sort de l'arbre d'accessibilité,
 * et un toucher sur sa place le rend au lieu de déclencher un bouton invisible.
 */
@Composable
private fun AudioChromeFade(visible: Boolean, onReveal: () -> Unit, content: @Composable () -> Unit) {
    val alpha by animateFloatAsState(targetValue = if (visible) 1f else 0f, label = "audioFullscreenChrome")
    Box {
        Box(
            Modifier
                .graphicsLayer { this.alpha = alpha }
                .then(if (visible) Modifier else Modifier.clearAndSetSemantics { }),
        ) {
            CompositionLocalProvider(LocalFullscreenChromeInteractive provides visible) { content() }
        }
        if (!visible) {
            Box(
                Modifier
                    .matchParentSize()
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onReveal),
            )
        }
    }
}

private const val MS_PER_SECOND = 1000.0

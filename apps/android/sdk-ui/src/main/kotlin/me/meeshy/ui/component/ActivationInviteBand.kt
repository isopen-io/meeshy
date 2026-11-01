package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.testTag
import me.meeshy.sdk.model.ActivationInvite
import me.meeshy.ui.component.chrome.StatusBarIconsOver
import me.meeshy.ui.component.chrome.StatusBarLayer
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le bandeau « Validez votre compte » RESERVE sa place en haut de l'ecran (#13854, directive porteur du 2026-10-31 :
 * « il faut rendre la bannière opaque par-dessus tout »). Compression de cadre, comme la barre d'appel d'iOS
 * (`CallPresentationLayer`) et la pastille d'appel reduit d'ici : la bande pleine prend la barre d'etat et sa propre
 * hauteur, et [content] commence DESSOUS — l'encart de la barre d'etat consomme, pour qu'un ecran qui la reserve deja
 * (le ✕ du compositeur) ne la reserve pas deux fois. Aucun controle n'est recouvert. Sans [invite], ou apres
 * « Plus tard », la bande disparait et [content] reprend toute la hauteur. Tant qu'elle prend la barre d'etat, les icones
 * se lisent sur ELLE, meme au-dessus d'un ecran sombre qui les veut claires (#14170) ; a son depart, l'ecran les reprend.
 */
@Composable
public fun ActivationInviteBand(
    invite: ActivationInvite?,
    title: String,
    message: String,
    dismissLabel: String,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(modifier = modifier) {
        if (invite != null) {
            val bandColor = MeeshyTheme.tokens.backgroundPrimary
            StatusBarIconsOver(darkBehind = bandColor.luminance() < DARK_LUMINANCE, layer = StatusBarLayer.BAND)
            Box(
                modifier = Modifier
                    .testTag(ActivationInviteBannerDefaults.BAND_TAG)
                    .fillMaxWidth()
                    .background(bandColor)
                    .statusBarsPadding()
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            ) {
                ActivationInviteBanner(
                    invite = invite,
                    title = title,
                    message = message,
                    dismissLabel = dismissLabel,
                    onOpen = onOpen,
                    onDismiss = onDismiss,
                )
            }
        }
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .then(if (invite != null) Modifier.consumeWindowInsets(WindowInsets.statusBars) else Modifier),
        ) {
            content()
        }
    }
}

private const val DARK_LUMINANCE = 0.5f

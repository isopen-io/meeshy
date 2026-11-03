package me.meeshy.app.notifications

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.NotificationBannerSwipe
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyMotion
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.game.GameTarget
import me.meeshy.ui.component.MeeshyNotificationToast

/**
 * L'hôte de la bannière in-app — la notification qui descend du haut de l'écran puis s'efface.
 *
 * Il se monte UNE fois, à la racine de l'app, par-dessus la navigation : une bannière suit le
 * lecteur d'un écran à l'autre, et la monter par écran en ferait autant d'instances rivales.
 *
 * Les deux morceaux du cadrage qui n'ont pas de traduction toute faite — `BannerHeadline
 * .InConversation` et le résumé média — deviennent du texte via [headlineText] /
 * [presentationBodyText] (`NotificationPresentationText.kt`), partagés avec la ligne de la liste
 * ([NotificationsScreen]) : `core/model` n'a pas de ressources, une chaîne composée là-bas serait
 * intraduisible aux trois autres langues.
 */
@Composable
fun NotificationBannerHost(
    modifier: Modifier = Modifier,
    activeConversationId: String? = null,
    activePostId: String? = null,
    onOpenConversation: (String) -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onOpenGame: (GameTarget) -> Unit = {},
    /** Appui long ou tirage vers le bas : l'aperçu de la conversation (hébergé par :app). */
    onPreviewConversation: (String) -> Unit = {},
    /** Heure de la dernière présentation modale : le tap qui la suit de peu lui appartient (iOS `suppressToastTap`). */
    lastModalPresentedAtMillis: () -> Long? = { null },
    viewModel: NotificationBannerViewModel = hiltViewModel(),
    revealTap: EngagementRevealTapViewModel = hiltViewModel(),
) {
    val banner by viewModel.banner.collectAsStateWithLifecycle()
    val reduceMotion = LocalReduceMotion.current
    var lift by remember { mutableFloatStateOf(0f) }
    var previewedAt by remember { mutableStateOf<Long?>(null) }

    // Une notification qui parle de l'écran OUVERT se consomme en silence : le lecteur la voit
    // déjà arriver dans le fil, et la doubler d'une bannière serait dire deux fois la même
    // chose. C'est la route courante qui porte cette vérité, jamais le ViewModel — lui ne sait
    // pas ce qui est affiché.
    LaunchedEffect(banner?.notificationId) { lift = 0f }
    LaunchedEffect(activeConversationId, activePostId) {
        viewModel.setActiveContext(activeConversationId, activePostId)
    }

    // `statusBarsPadding()` — la bannière descend SOUS la barre système (#4600).
    //
    // L'hôte est monté à la racine, dans un `Box` plein écran : `enableEdgeToEdge()`
    // plus `contentWindowInsets = WindowInsets(0,0,0,0)` sur le Scaffold racine
    // signifient que `y = 0` est le HAUT DE L'ÉCRAN, pas le haut du contenu. Sans
    // cet inset la bannière recouvrait l'horloge et les icônes système — vu sur
    // l'enregistrement d'écran de la vérification de #4457.
    //
    // Le commentaire du Scaffold racine énonce déjà le contrat : « chaque
    // destination porte désormais ses propres insets ». La bannière n'est pas une
    // destination, mais elle est du CONTENU, et la règle vaut pour elle.
    Box(
        modifier = modifier.fillMaxWidth().statusBarsPadding(),
        contentAlignment = Alignment.TopCenter,
    ) {
        AnimatedVisibility(
            visible = banner != null,
            enter = if (reduceMotion) {
                fadeIn(tween(FADE_MILLIS))
            } else {
                slideInVertically(MeeshyMotion.springBouncy()) { -it } + fadeIn()
            },
            exit = if (reduceMotion) {
                fadeOut(tween(FADE_MILLIS))
            } else {
                slideOutVertically { -it } + fadeOut()
            },
        ) {
            banner?.let { shown ->
                MeeshyNotificationToast(
                    senderName = headlineText(shown.presentation.headline),
                    title = if (shown.previewHidden) {
                        stringResource(R.string.notification_banner_preview_hidden)
                    } else {
                        presentationBodyText(shown.presentation) ?: ""
                    },
                    modifier = Modifier
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .graphicsLayer { translationY = lift }
                        .bannerGestures(
                            onLift = { lift = it },
                            onDismiss = viewModel::dismiss,
                            onPreview = {
                                shown.conversationId?.let { id ->
                                    previewedAt = System.currentTimeMillis()
                                    viewModel.dismiss()
                                    onPreviewConversation(id)
                                }
                            },
                        ),
                    avatarName = shown.avatarName,
                    avatarUrl = shown.avatarUrl,
                    onTap = {
                        val now = System.currentTimeMillis()
                        val suppressed = NotificationBannerSwipe.isTapSuppressed(now, previewedAt) ||
                            NotificationBannerSwipe.isTapSuppressed(now, lastModalPresentedAtMillis())
                        if (!suppressed) {
                            // Consommée AVANT la navigation, comme une ligne de la cloche (iOS #6999).
                            viewModel.onTapped()
                            shown.game?.let { game ->
                                // Toucher le palier annoncé : il se célèbre PAR-DESSUS l'écran du jeu que le toucher ouvre.
                                revealTap.onOpened(game)
                                (NotificationDestinationResolver.resolve(game) as? NotificationDestination.Game)?.let { onOpenGame(it.target) }
                            } ?: shown.conversationId?.let(onOpenConversation)
                                ?: shown.postId?.let(onOpenPost)
                        }
                    },
                )
            }
        }
    }
}

private const val FADE_MILLIS = 200

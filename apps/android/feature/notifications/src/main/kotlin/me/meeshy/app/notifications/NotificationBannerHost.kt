package me.meeshy.app.notifications

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.notifications.R
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
    viewModel: NotificationBannerViewModel = hiltViewModel(),
) {
    val banner by viewModel.banner.collectAsStateWithLifecycle()

    // Une notification qui parle de l'écran OUVERT se consomme en silence : le lecteur la voit
    // déjà arriver dans le fil, et la doubler d'une bannière serait dire deux fois la même
    // chose. C'est la route courante qui porte cette vérité, jamais le ViewModel — lui ne sait
    // pas ce qui est affiché.
    LaunchedEffect(activeConversationId, activePostId) {
        viewModel.setActiveContext(activeConversationId, activePostId)
    }

    Box(modifier = modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        AnimatedVisibility(
            visible = banner != null,
            enter = slideInVertically { -it } + fadeIn(),
            exit = slideOutVertically { -it } + fadeOut(),
        ) {
            banner?.let { shown ->
                MeeshyNotificationToast(
                    senderName = headlineText(shown.presentation.headline),
                    title = if (shown.previewHidden) {
                        stringResource(R.string.notification_banner_preview_hidden)
                    } else {
                        presentationBodyText(shown.presentation) ?: ""
                    },
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    avatarName = shown.avatarName,
                    onTap = {
                        viewModel.dismiss()
                        shown.conversationId?.let(onOpenConversation)
                            ?: shown.postId?.let(onOpenPost)
                    },
                )
            }
        }
    }
}

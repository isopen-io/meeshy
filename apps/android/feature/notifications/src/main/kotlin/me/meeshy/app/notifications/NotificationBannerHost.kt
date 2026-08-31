package me.meeshy.app.notifications

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.BannerHeadline
import me.meeshy.sdk.model.MediaSummary
import me.meeshy.ui.component.MeeshyNotificationToast

/**
 * L'hôte de la bannière in-app — la notification qui descend du haut de l'écran puis s'efface.
 *
 * Il se monte UNE fois, à la racine de l'app, par-dessus la navigation : une bannière suit le
 * lecteur d'un écran à l'autre, et la monter par écran en ferait autant d'instances rivales.
 *
 * C'est ici, et seulement ici, que les deux morceaux du cadrage deviennent du texte :
 * `BannerHeadline.InConversation` et [MediaSummary] traversent le modèle en pièces détachées
 * précisément parce que `core/model` n'a pas de ressources — une chaîne composée là-bas serait
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
            enter = slideInVertically { -it } + fadeIn(),
            exit = slideOutVertically { -it } + fadeOut(),
        ) {
            banner?.let { shown ->
                MeeshyNotificationToast(
                    senderName = headlineText(shown.presentation.headline),
                    title = bodyText(shown) ?: "",
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

@Composable
private fun headlineText(headline: BannerHeadline): String = when (headline) {
    is BannerHeadline.Plain -> headline.text
    is BannerHeadline.InConversation -> stringResource(
        R.string.notification_banner_in_conversation,
        headline.actor,
        headline.groupName,
    )
}

/**
 * Le corps, ou à défaut le résumé du média — l'ordre compte : un contenu qui a du texte le
 * montre, un contenu qui n'en a pas dit au moins de quelle nature il est.
 */
@Composable
private fun bodyText(banner: InAppBanner): String? {
    val presentation = banner.presentation
    presentation.body?.let { body ->
        val badge = presentation.reactionBadge
        return if (badge != null) "$badge $body" else body
    }
    presentation.reactionBadge?.let { return it }
    return presentation.mediaSummary?.let { summary ->
        stringResource(
            when (summary) {
                MediaSummary.IMAGE -> R.string.notification_banner_media_photo
                MediaSummary.VIDEO -> R.string.notification_banner_media_video
                MediaSummary.AUDIO -> R.string.notification_banner_media_audio
            }
        )
    }
}

package me.meeshy.ui.component.contentcard

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.link.LinkPreviewParser
import me.meeshy.sdk.model.YouTubeLinkDetector
import me.meeshy.sdk.model.contentcard.ContentCard
import me.meeshy.sdk.model.contentcard.ContentLinkCardState
import me.meeshy.sdk.model.contentcard.PostTextContentLink
import me.meeshy.sdk.model.deeplink.ContentLinkTarget

/**
 * Ce que savent faire les cartes de contenu (#19331) — la couture que la bulle et le texte d'un post consomment,
 * fournie une fois par l'application, remplaçable par un double en test. Absente, rien ne change : la bulle garde son
 * aperçu de lien, le texte d'un post n'attache rien.
 */
@Stable
public interface ContentLinkCards {
    /** Ce que l'appareil sait déjà de ce lien, sans réseau ni attente : l'état de la première image. */
    public fun initial(target: ContentLinkTarget): ContentLinkCardState

    /** L'état servi du cache d'abord, revalidé en silence ; froid, lancé par son collecteur. */
    public fun states(target: ContentLinkTarget): Flow<ContentLinkCardState>

    /** Ouvre le contenu DANS l'app, à sa place, par le routeur de liens de l'application. */
    public fun open(card: ContentCard, target: ContentLinkTarget)
}

public val LocalContentLinkCards: ProvidableCompositionLocal<ContentLinkCards?> = staticCompositionLocalOf { null }

/**
 * La carte d'un lien de contenu, à sa place (iOS `ContentLinkCard`) : squelette sur cache vide, la carte, la ligne
 * « plus disponible », ou [fallback] — l'aperçu d'avant — quand rien de plus riche n'est servi. [excludedPostId] : le
 * post qui porte ce lien ne montre jamais sa propre carte. [onLongPress] : l'appui long de l'hôte (le menu du message
 * dans une bulle), que la carte garde au lieu de l'avaler.
 */
@Composable
public fun ContentLinkCard(
    target: ContentLinkTarget,
    cards: ContentLinkCards,
    modifier: Modifier = Modifier,
    excludedPostId: String? = null,
    onLongPress: (() -> Unit)? = null,
    fallback: @Composable () -> Unit = {},
) {
    key(target) {
        val initial = remember(cards) { cards.initial(target) }
        val updates = remember(cards) { cards.states(target) }
        val state by updates.collectAsStateWithLifecycle(initialValue = initial)
        ContentLinkCardPhase(state, onOpen = { card -> cards.open(card, target) }, onLongPress, modifier, excludedPostId, fallback)
    }
}

@Composable
private fun ContentLinkCardPhase(
    state: ContentLinkCardState,
    onOpen: (ContentCard) -> Unit,
    onLongPress: (() -> Unit)?,
    modifier: Modifier,
    excludedPostId: String?,
    fallback: @Composable () -> Unit,
) {
    when (state) {
        ContentLinkCardState.Loading -> ContentLinkCardSkeleton(modifier)
        is ContentLinkCardState.Card -> if (!state.card.postId.equals(excludedPostId, ignoreCase = true)) {
            ContentLinkCardView(card = state.card, onOpen = { onOpen(state.card) }, modifier = modifier, onLongPress = onLongPress)
        }
        is ContentLinkCardState.Unavailable -> ContentLinkCardUnavailable(type = state.type, modifier = modifier)
        ContentLinkCardState.Failed, ContentLinkCardState.NotContent -> fallback()
    }
}

/**
 * Le premier lien de contenu du TEXTE d'un post, déplié en carte sous ce texte (contrat § 5.2) : jamais le post
 * lui-même, et pas quand une vidéo intégrée tient déjà la place. Sans hôte des cartes, ou sans tel lien : rien.
 */
@Composable
public fun PostTextContentCard(text: String, postId: String, modifier: Modifier = Modifier) {
    val cards = LocalContentLinkCards.current ?: return
    val target = remember(text, postId) {
        PostTextContentLink.target(LinkPreviewParser.urls(text), embedsVideo = YouTubeLinkDetector.detect(text) != null, postId = postId)
    } ?: return
    ContentLinkCard(target = target, cards = cards, modifier = modifier, excludedPostId = postId)
}

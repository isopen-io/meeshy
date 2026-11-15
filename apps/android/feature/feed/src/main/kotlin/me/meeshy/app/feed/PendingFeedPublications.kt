package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import java.time.Instant
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.publication.UnsentPublication
import me.meeshy.sdk.publication.UnsentPublicationKind

/**
 * Une publication encore sur l'appareil, telle que le fil la montre (#14902, iOS #14879) : la carte d'un post ordinaire,
 * sous l'id local de sa ligne de file, et les gestes que son ⋯ peut offrir sans serveur.
 */
@Immutable
data class PendingFeedCard(
    val post: FeedPostPresentation,
    val publication: UnsentPublication,
    val canRetry: Boolean,
    val canReopen: Boolean,
)

/**
 * Ce que le ⋯ d'une publication en attente offre à la place des actions d'une publication en ligne : réessayer et rouvrir
 * quand elle a abandonné, annuler l'envoi toujours. Le détail n'offre que l'annulation ([me.meeshy.sdk.model.PostMenuPolicy]).
 */
internal class PendingSendActions(
    val canRetry: Boolean,
    val canReopen: Boolean,
    val onRetry: () -> Unit,
    val onReopen: () -> Unit,
    val onCancel: () -> Unit,
)

/** Une carte porte l'id local d'une ligne de file tant que le serveur ne lui en a pas donné un : rien n'est publié. */
val FeedPostPresentation.isPendingSend: Boolean get() = OutboxIds.isCmid(id)

/**
 * Projette la file de publications sur les cartes du fil. Un post et un réel y prennent la place d'une publication de
 * l'auteur ; une story reste dans son rail. Réessayer n'est offert qu'à une publication qui a abandonné sans perdre de
 * média, rouvrir qu'à celle que le composeur peut reprendre ([UnsentRuptureRule], [UnsentPublication.canReopen]).
 */
object PendingFeedPublications {

    fun cards(
        items: List<UnsentPublication>,
        author: MeeshyUser?,
        mediaBaseUrl: String?,
        offline: Boolean,
    ): List<PendingFeedCard> = items
        .filter { it.kind != UnsentPublicationKind.STORY }
        .map { item ->
            PendingFeedCard(
                post = FeedPostBuilder.build(
                    post = item.asPost(author),
                    preferences = author ?: EmptyContentPreferences,
                    mediaBaseUrl = mediaBaseUrl,
                    currentUserId = author?.id,
                ),
                publication = item,
                canRetry = UnsentRuptureRule.showsRetry(item, UnsentRuptureRule.rupture(item, offline)),
                canReopen = item.canReopen,
            )
        }

    private fun UnsentPublication.asPost(author: MeeshyUser?) = ApiPost(
        id = cmid,
        type = if (kind == UnsentPublicationKind.REEL) REEL else POST,
        content = text,
        createdAt = Instant.ofEpochMilli(createdAtMillis).toString(),
        author = author?.let { ApiAuthor(id = it.id, username = it.username, displayName = it.displayName, avatar = it.avatar) },
    )

    private const val POST = "POST"
    private const val REEL = "REEL"
}

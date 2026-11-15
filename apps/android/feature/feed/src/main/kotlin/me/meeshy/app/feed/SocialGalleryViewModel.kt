package me.meeshy.app.feed

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.post.CommentQuotationStore
import me.meeshy.sdk.post.PostGalleryCommentSource
import me.meeshy.sdk.session.SessionRepository

/** Ce que la galerie sociale lit hors de l'écran qui l'ouvre : les commentaires du post (cache d'abord, lecture seule) et le prisme du lecteur. */
@HiltViewModel
class SocialGalleryViewModel @Inject constructor(
    private val source: PostGalleryCommentSource,
    private val session: SessionRepository,
    private val quotations: CommentQuotationStore,
) : ViewModel() {

    val preferences: LanguageResolver.ContentLanguagePreferences
        get() = session.currentUser.value ?: EmptyContentPreferences

    fun comments(postId: String, commentCount: Int): Flow<List<ApiPostComment>> =
        source.comments(postId = postId, embedded = emptyList(), commentCount = commentCount)

    /** « Commenter ce média » : désigne le média de [gallery] dont le prochain commentaire de [postId] parlera. */
    fun quoteMedia(gallery: FeedGallery, postId: String, postMediaId: String) {
        GalleryMediaQuotation.of(gallery, postMediaId)?.let { quotations.designate(it, postId) }
    }
}

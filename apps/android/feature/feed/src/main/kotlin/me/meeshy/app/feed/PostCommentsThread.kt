package me.meeshy.app.feed

import android.widget.Toast
import androidx.compose.foundation.layout.RowScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.os.bundleOf
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.HasDefaultViewModelProviderFactory
import androidx.lifecycle.SAVED_STATE_REGISTRY_OWNER_KEY
import androidx.lifecycle.VIEW_MODEL_STORE_OWNER_KEY
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.MutableCreationExtras
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.savedstate.SavedStateRegistryOwner
import androidx.compose.ui.res.stringResource
import me.meeshy.ui.component.comments.CommentsSheet

/**
 * **LE fil des commentaires d'un contenu monté hors du détail de son post** (#14313) — un réel, une story. Le même
 * [PostCommentsViewModel] que le détail (une story et un réel SONT des posts : même `posts/{id}/comments`), donc les
 * mêmes réponses, cœurs, traductions, pièces jointes et le même composeur universel. Le magasin est propre au contenu :
 * passer au contenu suivant, ou quitter l'écran, libère le fil (salle temps réel quittée, pièces relâchées).
 */
@Composable
fun rememberPostCommentsViewModel(postId: String): PostCommentsViewModel {
    val parent = checkNotNull(LocalViewModelStoreOwner.current) { "Le fil des commentaires se monte sous un ViewModelStoreOwner" }
    val owner = remember(parent, postId) { CommentThreadOwner(parent, postId) }
    DisposableEffect(owner) { onDispose { owner.viewModelStore.clear() } }
    return hiltViewModel(viewModelStoreOwner = owner, key = "post-comments:$postId")
}

/**
 * La feuille des commentaires (iOS `FeedCommentsSheet`) : l'en-tête que l'hôte compose ([title], [headerAction]), le
 * fil qui défile, et le composeur universel épinglé dessous, au-dessus du clavier. Les encarts système sont laissés au
 * composeur (`ComposerShellLayout`) : la feuille n'en ajoute aucun, sinon la barre de navigation serait comptée deux fois.
 */
@Composable
fun PostCommentsThreadSheet(
    viewModel: PostCommentsViewModel,
    title: String,
    onDismiss: () -> Unit,
    headerAction: (@Composable RowScope.() -> Unit)? = null,
    onCommentSent: ((postId: String) -> Unit)? = null,
    commentsClosed: Boolean? = null,
) {
    val context = LocalContext.current
    CommentsClosedEffect(viewModel, commentsClosed)
    DisposableEffect(viewModel, onCommentSent) {
        viewModel.onCommentSent = onCommentSent
        onDispose { viewModel.onCommentSent = null }
    }
    CommentsSheet(
        title = title,
        closeLabel = stringResource(me.meeshy.ui.R.string.common_close),
        onDismiss = onDismiss,
        headerAction = headerAction,
        composer = { PostCommentsComposerBar(viewModel = viewModel) },
    ) {
        PostCommentsSection(
            viewModel = viewModel,
            showsTitle = false,
            onNotice = { notice -> Toast.makeText(context, context.getString(notice.messageRes), Toast.LENGTH_SHORT).show() },
        )
    }
}

/**
 * #16541 — l'hôte dit au fil ce que le post SERT : fermé, le composeur cède la place au bandeau « Les commentaires sont
 * désactivés » ; rouvert (une diffusion `post:updated`), il revient. `null` : l'hôte ne sait pas, le fil garde ce qu'il a
 * appris (un refus `COMMENTS_DISABLED`).
 */
@Composable
fun CommentsClosedEffect(viewModel: PostCommentsViewModel, commentsClosed: Boolean?) {
    LaunchedEffect(viewModel, commentsClosed) { commentsClosed?.let(viewModel::setCommentsClosed) }
}

/**
 * Le magasin d'UN fil : ses ViewModels vivent et meurent avec lui. Les extras de création sont ceux de l'hôte, avec
 * l'identifiant du contenu pour argument et ce magasin pour propriétaire des `SavedStateHandle` — rien ne s'accumule
 * chez l'hôte d'un contenu à l'autre.
 */
private class CommentThreadOwner(
    private val parent: ViewModelStoreOwner,
    private val postId: String,
) : ViewModelStoreOwner, HasDefaultViewModelProviderFactory {
    override val viewModelStore: ViewModelStore = ViewModelStore()

    override val defaultViewModelProviderFactory: ViewModelProvider.Factory
        get() = (parent as HasDefaultViewModelProviderFactory).defaultViewModelProviderFactory

    override val defaultViewModelCreationExtras: CreationExtras
        get() = MutableCreationExtras(
            (parent as? HasDefaultViewModelProviderFactory)?.defaultViewModelCreationExtras ?: CreationExtras.Empty,
        ).apply {
            set(androidx.lifecycle.DEFAULT_ARGS_KEY, bundleOf(PostCommentsViewModel.POST_ID_ARG to postId))
            set(VIEW_MODEL_STORE_OWNER_KEY, this@CommentThreadOwner)
            if (get(SAVED_STATE_REGISTRY_OWNER_KEY) == null) (parent as? SavedStateRegistryOwner)?.let { set(SAVED_STATE_REGISTRY_OWNER_KEY, it) }
        }
}

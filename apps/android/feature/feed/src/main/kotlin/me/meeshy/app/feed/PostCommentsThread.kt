package me.meeshy.app.feed

import android.widget.Toast
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
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
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

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
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PostCommentsThreadSheet(
    viewModel: PostCommentsViewModel,
    title: String,
    onDismiss: () -> Unit,
    headerAction: (@Composable RowScope.() -> Unit)? = null,
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
    ) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(SHEET_HEIGHT_FRACTION)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                headerAction?.invoke(this)
            }
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            ) {
                PostCommentsSection(
                    viewModel = viewModel,
                    showsTitle = false,
                    onNotice = { notice -> Toast.makeText(context, context.getString(notice.messageRes), Toast.LENGTH_SHORT).show() },
                )
            }
            PostCommentsComposerBar(viewModel = viewModel)
        }
    }
}

private const val SHEET_HEIGHT_FRACTION = 0.85f

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

package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'auteur porteur d'un lot de médias du détail (iOS `DetailMediaAuthor`) : le post EXTÉRIEUR affiché OU le repost CITÉ qu'il embarque.
 * Les deux n'ont pas le même auteur : sans ce porteur, l'audio d'un post cité attribuait ses métadonnées (nom, avatar, date, id) au
 * post extérieur. [originalLanguage] est le repli du Prisme audio quand le média n'a pas encore de transcription.
 */
internal data class DetailMediaAuthor(
    val id: String,
    val name: String?,
    val avatarUrl: String?,
    val createdAtIso: String?,
    val originalLanguage: String?,
    val userId: String?,
) {
    companion object {
        fun of(post: FeedPostPresentation) = DetailMediaAuthor(
            id = post.id,
            name = post.authorName,
            avatarUrl = post.authorAvatarUrl,
            createdAtIso = post.createdAtIso,
            originalLanguage = post.originalLanguage,
            userId = post.authorId,
        )

        fun of(embed: RepostEmbedPresentation) = DetailMediaAuthor(
            id = embed.id,
            name = embed.authorName,
            avatarUrl = embed.authorAvatarUrl,
            createdAtIso = embed.createdAtIso,
            originalLanguage = embed.originalLanguage,
            userId = embed.authorId,
        )
    }
}

/**
 * **La section médias du détail d'un post** (iOS `detailMediaSection`) : un média seul garde son rendu selon son type (image,
 * vidéo à poster, audio à lecteur et transcription, document), plusieurs montent la grille visuelle (jusqu'à 4 cellules, « +N » sur la
 * quatrième) suivie des audios puis des documents. Toucher une image ou une vidéo ouvre la galerie partagée sur CE média, avec une
 * haptique légère ; [onOpenVisual] reçoit son rang parmi les visuels du lot.
 */
@Composable
internal fun PostDetailMedia(
    media: List<FeedMediaItem>,
    owner: DetailMediaAuthor,
    accentHex: String?,
    onOpenVisual: (galleryIndex: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (media.isEmpty()) return
    val accent = remember(accentHex) { feedAccentColor(accentHex) }
    val haptics = rememberMeeshyHaptics()
    val open: (Int) -> Unit = { index ->
        haptics.light()
        onOpenVisual(index)
    }
    when (val layout = remember(media) { PostDetailMediaGrid.layout(media) }) {
        PostDetailMediaLayout.Empty -> Unit
        is PostDetailMediaLayout.Single -> Box(modifier.fillMaxWidth()) {
            FeedCardMedia(
                media = listOf(layout.item),
                accentHex = accentHex,
                carrierLanguage = owner.originalLanguage,
                onMediaTap = open,
            )
        }
        is PostDetailMediaLayout.Multi -> Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            layout.grid?.let { grid ->
                PostDetailMediaGridView(grid, accent, owner.originalLanguage, open)
            }
            layout.audios.forEach { item ->
                FeedMediaCell(item, accent, owner.originalLanguage, item.accessibilityDescription.orEmpty(), null, Modifier.fillMaxWidth())
            }
            layout.documents.forEach { item ->
                FeedDocumentCell(item, Modifier.fillMaxWidth())
            }
        }
    }
}

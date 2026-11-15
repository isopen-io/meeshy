package me.meeshy.sdk.model.comments

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.comments.CommentComposerFoldState.Presentation
import org.junit.Test

class CommentComposerFoldStateTest {
    @Test fun `déplié par défaut le chevron est offert`() {
        val p = CommentComposerFoldState.presentation(userFolded = false, isReplying = false)
        assertThat(p).isEqualTo(Presentation.EXPANDED)
        assertThat(CommentComposerFoldState.offersFoldButton(p, isComposing = false)).isTrue()
    }

    @Test fun `replié il ne reste que l'icône et plus de chevron`() {
        val p = CommentComposerFoldState.presentation(userFolded = true, isReplying = false)
        assertThat(p).isEqualTo(Presentation.FOLDED)
        assertThat(CommentComposerFoldState.offersFoldButton(p, isComposing = false)).isFalse()
    }

    @Test fun `une réponse en cours rouvre la barre repliée`() {
        assertThat(CommentComposerFoldState.presentation(userFolded = true, isReplying = true)).isEqualTo(Presentation.EXPANDED)
    }

    @Test fun `le chevron s'efface pendant la saisie ou l'enregistrement`() {
        assertThat(CommentComposerFoldState.offersFoldButton(Presentation.EXPANDED, isComposing = true)).isFalse()
    }

    @Test fun `une saisie qui commence rouvre une barre repliée seulement`() {
        assertThat(CommentComposerFoldState.reopens(userFolded = true, isComposing = true)).isTrue()
        assertThat(CommentComposerFoldState.reopens(userFolded = false, isComposing = true)).isFalse()
        assertThat(CommentComposerFoldState.reopens(userFolded = true, isComposing = false)).isFalse()
    }

    @Test fun `le ressort est celui d'iOS 0,32 et 0,82`() {
        assertThat(CommentComposerFoldState.SPRING_RESPONSE_SECONDS).isEqualTo(0.32f)
        assertThat(CommentComposerFoldState.SPRING_DAMPING).isEqualTo(0.82f)
    }
}

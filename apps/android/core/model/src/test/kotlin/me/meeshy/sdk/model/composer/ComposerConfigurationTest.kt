package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ComposerMode
import org.junit.Test

class ComposerConfigurationTest {

    @Test fun `la conversation garde toutes ses portes`() {
        val c = ComposerConfiguration.CONVERSATION
        assertThat(c.capabilities).containsExactlyElementsIn(ComposerCapability.entries)
        assertThat(c.maxLength).isNull()
    }

    @Test fun `le commentaire offre les portes d'iOS que le fil sait envoyer et afficher`() {
        assertThat(ComposerConfiguration.COMMENT.capabilities).containsExactly(
            ComposerCapability.LANGUAGE,
            ComposerCapability.QUICK_EMOJIS,
            ComposerCapability.EMOJI,
            ComposerCapability.VOICE,
            ComposerCapability.PHOTO_LIBRARY,
            ComposerCapability.CAMERA,
            ComposerCapability.STICKER,
            ComposerCapability.FOLD,
        )
    }

    @Test fun `le commentaire n'a ni éphémère, ni vue unique, ni feuille d'effets, ni contact`() {
        val c = ComposerConfiguration.COMMENT
        listOf(
            ComposerCapability.EPHEMERAL,
            ComposerCapability.VIEW_ONCE,
            ComposerCapability.EFFECTS,
            ComposerCapability.CONTACT,
        ).forEach { assertThat(c.offers(it)).isFalse() }
    }

    @Test fun `le flou, le fichier et le lieu d'un commentaire restent fermés tant que le fil ne sait ni les envoyer ni les afficher`() {
        val c = ComposerConfiguration.COMMENT
        listOf(ComposerCapability.BLUR, ComposerCapability.FILE, ComposerCapability.LOCATION)
            .forEach { assertThat(c.offers(it)).isFalse() }
    }

    @Test fun `une surface ne montre que les portes qu'elle sait servir`() {
        val served = ComposerConfiguration.COMMENT.servedBy(receivesAttachments = true, picksLanguage = false, sendsQuickEmoji = false)
        assertThat(served.offers(ComposerCapability.LANGUAGE)).isFalse()
        assertThat(served.offers(ComposerCapability.QUICK_EMOJIS)).isFalse()
        assertThat(served.offers(ComposerCapability.PHOTO_LIBRARY)).isTrue()
        val full = ComposerConfiguration.COMMENT.servedBy(receivesAttachments = true, picksLanguage = true, sendsQuickEmoji = true)
        assertThat(full).isEqualTo(ComposerConfiguration.COMMENT)
        val textOnly = ComposerConfiguration.COMMENT.servedBy(receivesAttachments = false, picksLanguage = true, sendsQuickEmoji = true)
        ComposerCapability.ATTACHMENTS.forEach { assertThat(textOnly.offers(it)).isFalse() }
    }

    @Test fun `le chevron d'un commentaire reste visible pendant qu'on écrit, celui d'une conversation s'efface`() {
        assertThat(ComposerConfiguration.COMMENT.offersFold(folded = false, isComposing = true)).isTrue()
        assertThat(ComposerConfiguration.COMMENT.offersFold(folded = false, isComposing = false)).isTrue()
        assertThat(ComposerConfiguration.CONVERSATION.offersFold(folded = false, isComposing = true)).isFalse()
        assertThat(ComposerConfiguration.CONVERSATION.offersFold(folded = false, isComposing = false)).isTrue()
    }

    @Test fun `une barre repliée ou sans la porte du repli n'offre pas de chevron`() {
        assertThat(ComposerConfiguration.COMMENT.offersFold(folded = true, isComposing = false)).isFalse()
        assertThat(ComposerConfiguration.COMMENT.without(ComposerCapability.FOLD).offersFold(folded = false, isComposing = false)).isFalse()
    }

    @Test fun `le commentaire borne le texte au budget d'iOS`() {
        assertThat(ComposerConfiguration.COMMENT.maxLength).isEqualTo(ComposerMode.COMMENT.maxLength)
        assertThat(ComposerConfiguration.COMMENT.bounded("a".repeat(2_500))).hasLength(2_000)
        assertThat(ComposerConfiguration.CONVERSATION.bounded("a".repeat(2_500))).hasLength(2_500)
    }

    @Test fun `un hôte qui ne sait pas joindre ferme les portes de pièces, garde le texte et l'emoji`() {
        val c = ComposerConfiguration.COMMENT.withoutAttachments()
        assertThat(c.capabilities).containsExactly(
            ComposerCapability.LANGUAGE,
            ComposerCapability.QUICK_EMOJIS,
            ComposerCapability.EMOJI,
            ComposerCapability.FOLD,
        )
        assertThat(c.maxLength).isEqualTo(2_000)
    }

    @Test fun `sans pièce, la conversation garde ses bascules et sa langue`() {
        val c = ComposerConfiguration.CONVERSATION.withoutAttachments()
        assertThat(c.offers(ComposerCapability.EPHEMERAL)).isTrue()
        assertThat(c.offers(ComposerCapability.LANGUAGE)).isTrue()
        ComposerCapability.ATTACHMENTS.forEach { assertThat(c.offers(it)).isFalse() }
    }

    @Test fun `une capacité retirée ne s'offre plus`() {
        val c = ComposerConfiguration.CONVERSATION.without(ComposerCapability.STICKER)
        assertThat(c.offers(ComposerCapability.STICKER)).isFalse()
        assertThat(c.offers(ComposerCapability.VOICE)).isTrue()
    }
}

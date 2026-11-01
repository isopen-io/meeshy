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

    @Test fun `le commentaire offre le texte, l'emoji, le vocal, la photothèque, la caméra et le sticker`() {
        assertThat(ComposerConfiguration.COMMENT.capabilities).containsExactly(
            ComposerCapability.EMOJI,
            ComposerCapability.VOICE,
            ComposerCapability.PHOTO_LIBRARY,
            ComposerCapability.CAMERA,
            ComposerCapability.STICKER,
        )
    }

    @Test fun `le commentaire n'a ni éphémère, ni vue unique, ni effets, ni emojis rapides`() {
        val c = ComposerConfiguration.COMMENT
        listOf(
            ComposerCapability.EPHEMERAL,
            ComposerCapability.VIEW_ONCE,
            ComposerCapability.EFFECTS,
            ComposerCapability.QUICK_EMOJIS,
            ComposerCapability.CONTACT,
        ).forEach { assertThat(c.offers(it)).isFalse() }
    }

    @Test fun `le commentaire borne le texte au budget d'iOS`() {
        assertThat(ComposerConfiguration.COMMENT.maxLength).isEqualTo(ComposerMode.COMMENT.maxLength)
        assertThat(ComposerConfiguration.COMMENT.bounded("a".repeat(2_500))).hasLength(2_000)
        assertThat(ComposerConfiguration.CONVERSATION.bounded("a".repeat(2_500))).hasLength(2_500)
    }

    @Test fun `un hôte qui ne sait pas joindre ferme les portes de pièces, garde le texte et l'emoji`() {
        val c = ComposerConfiguration.COMMENT.withoutAttachments()
        assertThat(c.capabilities).containsExactly(ComposerCapability.EMOJI)
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

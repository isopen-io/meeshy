package me.meeshy.ui.component.focal

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageSourceKind
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import org.junit.Test

private fun content(
    text: String = "Salut",
    isOutgoing: Boolean = false,
    sourceKind: MessageSourceKind = MessageSourceKind.User,
    isPending: Boolean = false,
    senderRing: ServedProfileDecorItem? = null,
) = BubbleContent(
    messageId = "m1",
    text = text,
    isOutgoing = isOutgoing,
    isTranslated = false,
    originalText = null,
    senderName = "Mégane",
    showSenderName = true,
    isEdited = false,
    isDeleted = false,
    createdAtIso = "2026-10-01T07:48:00Z",
    sourceKind = sourceKind,
    isPending = isPending,
    senderRing = senderRing,
)

class FocalRowInputTest {

    @Test
    fun `deux projections du meme message sont structurellement egales`() {
        assertThat(FocalRowInput.of(content())).isEqualTo(FocalRowInput.of(content()))
        assertThat(FocalRowInput.of(content()).hashCode()).isEqualTo(FocalRowInput.of(content()).hashCode())
    }

    @Test
    fun `un texte different du message ne change pas l'entree de la colonne et de l'identite`() {
        assertThat(FocalRowInput.of(content(text = "a"))).isEqualTo(FocalRowInput.of(content(text = "b")))
    }

    @Test
    fun `un changement de livraison ou d'optimisme rend l'entree differente`() {
        val sent = FocalRowInput.of(content(isOutgoing = true))
        assertThat(sent.deliveryStatus).isEqualTo(DeliveryStatus.Sent)
        assertThat(FocalRowInput.of(content(isOutgoing = true, isPending = true))).isNotEqualTo(sent)
        assertThat(FocalRowInput.of(content(isPending = true)).isOptimistic).isTrue()
    }

    @Test
    fun `un message d'agent est marque agent, un autre non`() {
        assertThat(FocalRowInput.of(content(sourceKind = MessageSourceKind.Agent)).isAgentAuthored).isTrue()
        assertThat(FocalRowInput.of(content()).isAgentAuthored).isFalse()
    }

    @Test
    fun `l'entree porte le contour equipe de l'expediteur tel que servi`() {
        val ring = ServedProfileDecorItem(pack = "contours-essentiels", item = "filet")

        assertThat(FocalRowInput.of(content(senderRing = ring)).senderRing).isEqualTo(ring)
        assertThat(FocalRowInput.of(content()).senderRing).isNull()
        assertThat(FocalRowInput.of(content(senderRing = ring))).isNotEqualTo(FocalRowInput.of(content()))
    }

    @Test
    fun `l'entree ne porte aucun rappel ni flux`() {
        val offenders = FocalRowInput::class.java.declaredFields
            .filter { !it.isSynthetic && !java.lang.reflect.Modifier.isStatic(it.modifiers) }
            .map { it.type }
            .filter { Function::class.java.isAssignableFrom(it) || it.name.contains("Flow") }
        assertThat(offenders).isEmpty()
    }
}

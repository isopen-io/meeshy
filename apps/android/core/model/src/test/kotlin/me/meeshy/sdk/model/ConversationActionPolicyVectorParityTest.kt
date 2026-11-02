package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.testutil.SharedFixtures
import org.junit.Test

/**
 * Rejoue `packages/shared/fixtures/action-policy/conversation-actions.vectors.json` — la grille
 * type × profil que `conversationActionsFor` (TypeScript, qui fait foi) a produite — contre
 * [ConversationActionPolicy]. Même rejeu que `ConversationActionPolicyVectorTests.swift`.
 */
class ConversationActionPolicyVectorParityTest {

    private val vectors = SharedFixtures.vectors(ActionPolicyVectorFixtures.CONVERSATION_VECTORS)

    @Test
    fun `the shared conversation vectors are loaded`() {
        assertThat(vectors.size).isAtLeast(70)
    }

    @Test
    fun `every conversation vector yields the same actions as the TypeScript law`() {
        vectors.forEach { vector ->
            val actual = ActionPolicyVectorFixtures.render(
                ConversationActionPolicy.actionsFor(ActionPolicyVectorFixtures.conversationInput(vector.input)),
            )
            assertWithMessage(vector.label ?: "vecteur sans étiquette").that(actual).isEqualTo(vector.expected)
        }
    }
}

package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * `participant:role-updated` — décodé depuis la charge utile RÉELLE de la
 * passerelle, pas depuis celle qu'on imagine.
 *
 * Ce témoin existe parce que le contrat côté Android n'a jamais été honoré :
 * `ParticipantRoleUpdatedEvent` exigeait un `role` de premier niveau, quand la
 * passerelle émet `newRole` depuis toujours
 * (`services/gateway/src/routes/conversations/participants.ts`). Le champ étant
 * NON-optionnel et sans défaut, `decodeFromString` levait `MissingFieldException`
 * — avalée par le `runCatching` du listener — et **aucun changement de rang n'a
 * jamais atteint le trombinoscope Android**.
 *
 * Rien ne l'avait vu parce que le seul témoin du chemin
 * (`ConversationMembersViewModelTest`) construit l'événement en Kotlin et
 * l'ÉMET directement dans le flow : il saute le décodeur, donc la seule couche
 * où vivait le défaut. C'est la leçon du cycle 91 bis dans un autre langage — un
 * témoin qui n'exerce pas la sérialisation atteste un contrat que personne ne
 * respecte.
 *
 * La charge utile ci-dessous est copiée de l'émetteur, clé par clé.
 */
class ParticipantRoleUpdatedDecodeTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    /** La charge EXACTE que `manager.getIO().to(...).emit(...)` envoie. */
    private val gatewayPayload = """
        {
          "conversationId": "507f1f77bcf86cd799439011",
          "userId": "507f1f77bcf86cd799439033",
          "newRole": "admin",
          "updatedBy": "507f1f77bcf86cd799439022",
          "participant": {
            "id": "507f1f77bcf86cd799439055",
            "participantId": "507f1f77bcf86cd799439055",
            "userId": "507f1f77bcf86cd799439033",
            "displayName": "Bob",
            "role": "USER",
            "conversationRole": "admin",
            "isOnline": false,
            "lastActiveAt": null
          }
        }
    """.trimIndent()

    @Test
    fun `decodes the gateway payload instead of throwing on a missing field`() {
        val event = json.decodeFromString<ParticipantRoleUpdatedEvent>(gatewayPayload)

        assertThat(event.conversationId).isEqualTo("507f1f77bcf86cd799439011")
        assertThat(event.userId).isEqualTo("507f1f77bcf86cd799439033")
    }

    @Test
    fun `carries the new rank the roster must apply`() {
        val event = json.decodeFromString<ParticipantRoleUpdatedEvent>(gatewayPayload)

        assertThat(event.role).isEqualTo("admin")
    }

    /**
     * Le rang de CONVERSATION voyage au premier niveau, sous `newRole`. Le
     * `participant.role` imbriqué porte le rôle GLOBAL (`USER`) depuis le
     * cycle 92 bis : le confondre rétrograderait tout le monde en « membre ».
     */
    @Test
    fun `ignores the nested participant role, which is the GLOBAL rank`() {
        val event = json.decodeFromString<ParticipantRoleUpdatedEvent>(gatewayPayload)

        assertThat(event.role).isNotEqualTo("USER")
    }

    /** `updatedParticipant` peut être nul quand la relecture ne rend rien. */
    @Test
    fun `survives a null participant`() {
        val event = json.decodeFromString<ParticipantRoleUpdatedEvent>(
            """
            {
              "conversationId": "c1",
              "userId": "u1",
              "newRole": "moderator",
              "updatedBy": "u2",
              "participant": null
            }
            """.trimIndent()
        )

        assertThat(event.role).isEqualTo("moderator")
    }
}

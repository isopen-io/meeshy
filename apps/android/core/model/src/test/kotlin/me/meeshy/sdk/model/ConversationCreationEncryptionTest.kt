package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Miroir de `packages/shared/utils/conversation-creation-encryption.test.ts` : le mode se choisit à la création. */
class ConversationCreationEncryptionTest {

    private fun offer(
        platformRole: String? = "USER",
        conversationType: String = "direct",
        endToEndSupported: Boolean = true,
    ) = ConversationCreationEncryption.offer(platformRole, conversationType, endToEndSupported)

    private fun modesOf(platformRole: String?) = offer(platformRole).choices.map { it.mode }

    @Test
    fun `un utilisateur ordinaire choisit entre Serveur et Hybride, Serveur par défaut`() {
        val shown = offer(platformRole = "USER")

        assertThat(shown.choices).containsExactly(
            CreationEncryptionChoice(CreationEncryptionMode.SERVER, available = true, unavailability = null),
            CreationEncryptionChoice(CreationEncryptionMode.HYBRID, available = true, unavailability = null),
        ).inOrder()
        assertThat(shown.defaultMode).isEqualTo(CreationEncryptionMode.SERVER)
    }

    @Test
    fun `aucun choix sans chiffrement n'existe, pour personne`() {
        listOf("USER", "ANALYST", "ADMIN", "BIGBOSS", null).forEach { role ->
            assertThat(modesOf(role)).containsAtLeast(CreationEncryptionMode.SERVER, CreationEncryptionMode.HYBRID)
            assertThat(modesOf(role).all { it in CreationEncryptionMode.entries }).isTrue()
        }
        assertThat(CreationEncryptionMode.entries.map { it.wire }).containsExactly("server", "hybrid", "e2ee").inOrder()
    }

    @Test
    fun `ANALYST et plus se voient proposer le bout en bout, présélectionné dans un tête-à-tête`() {
        listOf("ANALYST", "AUDIT", "MODERATOR", "ADMIN", "BIGBOSS", "analyst").forEach { role ->
            val shown = offer(platformRole = role)

            assertThat(shown.choices.last())
                .isEqualTo(CreationEncryptionChoice(CreationEncryptionMode.E2EE, available = true, unavailability = null))
            assertThat(shown.defaultMode).isEqualTo(CreationEncryptionMode.E2EE)
        }
    }

    @Test
    fun `un rôle inférieur ou illisible ne voit pas le bout en bout (fermé par défaut)`() {
        listOf("USER", "AGENT", "", null, "nonsense").forEach { role ->
            assertThat(modesOf(role)).doesNotContain(CreationEncryptionMode.E2EE)
            assertThat(ConversationCreationEncryption.mayChooseEndToEnd(role)).isFalse()
        }
    }

    @Test
    fun `dans un groupe, le bout en bout paraît bientôt et le défaut reste Serveur`() {
        val shown = offer(platformRole = "ADMIN", conversationType = "group")

        assertThat(shown.choices.last()).isEqualTo(
            CreationEncryptionChoice(CreationEncryptionMode.E2EE, available = false, unavailability = CreationEncryptionUnavailability.GROUPS_NOT_YET),
        )
        assertThat(shown.defaultMode).isEqualTo(CreationEncryptionMode.SERVER)
    }

    @Test
    fun `un groupe sur un client qui ne sait pas chiffrer se dit d'abord groupe`() {
        val shown = offer(platformRole = "ADMIN", conversationType = "group", endToEndSupported = false)

        assertThat(shown.choices.last().unavailability).isEqualTo(CreationEncryptionUnavailability.GROUPS_NOT_YET)
    }

    @Test
    fun `sur un client qui ne lit pas encore le bout en bout, il paraît bientôt et le défaut reste Serveur`() {
        val shown = offer(platformRole = "ADMIN", endToEndSupported = false)

        assertThat(shown.choices.last()).isEqualTo(
            CreationEncryptionChoice(CreationEncryptionMode.E2EE, available = false, unavailability = CreationEncryptionUnavailability.CLIENT_NOT_YET),
        )
        assertThat(shown.defaultMode).isEqualTo(CreationEncryptionMode.SERVER)
    }

    @Test
    fun `le défaut est toujours un choix DISPONIBLE de l'offre`() {
        for (role in listOf("USER", "ANALYST", "ADMIN")) {
            for (type in listOf("direct", "group", "public")) {
                for (supported in listOf(true, false)) {
                    val shown = offer(role, type, supported)
                    assertThat(shown.choices.first { it.mode == shown.defaultMode }.available).isTrue()
                }
            }
        }
    }

    @Test
    fun `une création hors de l'écran de création reçoit Serveur`() {
        assertThat(ConversationCreationEncryption.IMPLICIT_MODE).isEqualTo(CreationEncryptionMode.SERVER)
    }

    @Test
    fun `seuls les trois modes se lisent sur le fil`() {
        assertThat(listOf("server", "hybrid", "e2ee").map(CreationEncryptionMode::fromWire))
            .containsExactly(CreationEncryptionMode.SERVER, CreationEncryptionMode.HYBRID, CreationEncryptionMode.E2EE).inOrder()
        listOf(null, "", "none", "E2EE").forEach { assertThat(CreationEncryptionMode.fromWire(it)).isNull() }
    }
}

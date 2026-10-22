package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Règle produit du badge « Transféré » (porteur, 2026-08-23) : « le forward d'un
 * message, document ne doit pas dire de qui il vient mais de quel groupe si cela
 * vient d'un groupe AU MOINS PUBLIC ». Miroir de `ForwardBadgePolicyTests.swift`.
 *
 * Liste BLANCHE : seuls `public`, `global`, `broadcast`, `channel` et `community`
 * nomment le groupe ; `direct` et `bot` nomment la personne ; tout le reste —
 * `group` compris, type absent ou inconnu — reste anonyme (échec FERMÉ).
 */
class ForwardBadgePolicyTest {

    private fun ref(
        name: String? = "Équipe Design",
        sender: String = "Belva Tano",
        type: String? = "group",
    ) = ForwardReference(
        senderName = sender,
        conversationName = name,
        conversationType = type,
    )

    private val publiclyReachable = listOf("public", "global", "broadcast", "channel", "community")
    private val peers = listOf("direct", "bot")
    private val allTypes = publiclyReachable + peers + "group"

    // --- table exhaustive : 8 types x nom présent / absent -------------------

    @Test
    fun `the table covers exactly the eight conversation types`() {
        assertThat(allTypes).containsExactly(
            "direct", "group", "public", "global", "community", "channel", "bot", "broadcast",
        )
    }

    @Test
    fun `a publicly reachable conversation names the group when its name is present`() {
        publiclyReachable.forEach { type ->
            assertThat(ForwardBadgePolicy.attribution(ref(name = "Équipe Design", type = type)))
                .isEqualTo(ForwardAttribution.Group("Équipe Design"))
        }
    }

    @Test
    fun `a publicly reachable conversation never names the person`() {
        publiclyReachable.forEach { type ->
            val attribution = ForwardBadgePolicy.attribution(ref(sender = "Belva Tano", type = type))
            assertThat(attribution).isNotInstanceOf(ForwardAttribution.Person::class.java)
        }
    }

    @Test
    fun `a publicly reachable conversation without a name falls back to anonymous and never to the person`() {
        publiclyReachable.forEach { type ->
            listOf(null, "", "   ").forEach { name ->
                assertThat(ForwardBadgePolicy.attribution(ref(name = name, sender = "Belva Tano", type = type)))
                    .isEqualTo(ForwardAttribution.Anonymous)
            }
        }
    }

    @Test
    fun `a private group names nobody whether its name is present or not`() {
        listOf("Équipe Design", null, "", "   ").forEach { name ->
            assertThat(ForwardBadgePolicy.attribution(ref(name = name, type = "group")))
                .isEqualTo(ForwardAttribution.Anonymous)
        }
    }

    @Test
    fun `a private group stays anonymous even when its name is filled in`() {
        val attribution = ForwardBadgePolicy.attribution(ref(name = "Équipe Design", sender = "Belva Tano", type = "group"))

        assertThat(attribution).isEqualTo(ForwardAttribution.Anonymous)
    }

    @Test
    fun `a one-to-one names the person and never the conversation`() {
        peers.forEach { type ->
            listOf("Alice Conv", null).forEach { name ->
                assertThat(ForwardBadgePolicy.attribution(ref(name = name, sender = "Belva Tano", type = type)))
                    .isEqualTo(ForwardAttribution.Person("Belva Tano"))
            }
        }
    }

    // --- tête-à-tête : le nom de l'expéditeur n'est pas toujours un nom -------

    @Test
    fun `an empty sender name in a one-to-one stays anonymous`() {
        peers.forEach { type ->
            assertThat(ForwardBadgePolicy.attribution(ref(sender = "", type = type)))
                .isEqualTo(ForwardAttribution.Anonymous)
        }
    }

    @Test
    fun `a whitespace-only sender name in a one-to-one stays anonymous`() {
        peers.forEach { type ->
            assertThat(ForwardBadgePolicy.attribution(ref(sender = "   \t ", type = type)))
                .isEqualTo(ForwardAttribution.Anonymous)
        }
    }

    @Test
    fun `the unknown-sender marker question mark is not a name`() {
        peers.forEach { type ->
            assertThat(ForwardBadgePolicy.attribution(ref(sender = "?", type = type)))
                .isEqualTo(ForwardAttribution.Anonymous)
            assertThat(ForwardBadgePolicy.attribution(ref(sender = " ? ", type = type)))
                .isEqualTo(ForwardAttribution.Anonymous)
        }
    }

    @Test
    fun `names are trimmed before they are served`() {
        assertThat(ForwardBadgePolicy.attribution(ref(name = "  Lobby  ", type = "public")))
            .isEqualTo(ForwardAttribution.Group("Lobby"))
        assertThat(ForwardBadgePolicy.attribution(ref(sender = "  Belva Tano ", type = "direct")))
            .isEqualTo(ForwardAttribution.Person("Belva Tano"))
    }

    // --- échec FERMÉ : un type qu'on ne sait pas classer ne se nomme pas ------

    @Test
    fun `a null conversation type fails closed`() {
        assertThat(ForwardBadgePolicy.attribution(ref(name = "Legacy", type = null)))
            .isEqualTo(ForwardAttribution.Anonymous)
    }

    @Test
    fun `an empty conversation type fails closed`() {
        assertThat(ForwardBadgePolicy.attribution(ref(name = "Legacy", type = "")))
            .isEqualTo(ForwardAttribution.Anonymous)
    }

    @Test
    fun `an unknown conversation type fails closed`() {
        assertThat(ForwardBadgePolicy.attribution(ref(name = "Legacy", type = "quantum-lounge")))
            .isEqualTo(ForwardAttribution.Anonymous)
    }

    @Test
    fun `a type spelled with another case is not on the whitelist`() {
        assertThat(ForwardBadgePolicy.attribution(ref(name = "Lobby", type = "PUBLIC")))
            .isEqualTo(ForwardAttribution.Anonymous)
    }

    @Test
    fun `a null reference is anonymous`() {
        assertThat(ForwardBadgePolicy.attribution(null)).isEqualTo(ForwardAttribution.Anonymous)
    }

    // --- conversationName : projection « nom seulement pour Group » ----------

    @Test
    fun `conversationName serves the name for a group attribution only`() {
        publiclyReachable.forEach { type ->
            assertThat(ForwardBadgePolicy.conversationName(ref(name = "Équipe Design", type = type)))
                .isEqualTo("Équipe Design")
        }
    }

    @Test
    fun `conversationName never serves a private group name`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "Team Meeshy", type = "group"))).isNull()
    }

    @Test
    fun `conversationName never serves the person of a one-to-one`() {
        peers.forEach { type ->
            assertThat(ForwardBadgePolicy.conversationName(ref(name = "Alice", sender = "Belva Tano", type = type)))
                .isNull()
        }
    }

    @Test
    fun `conversationName is null for a null reference, a blank name and an unclassified type`() {
        assertThat(ForwardBadgePolicy.conversationName(null)).isNull()
        assertThat(ForwardBadgePolicy.conversationName(ref(name = null, type = "public"))).isNull()
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "", type = "public"))).isNull()
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "Legacy", type = null))).isNull()
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "Legacy", type = "mystery"))).isNull()
    }
}

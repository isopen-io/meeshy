package me.meeshy.sdk.model.reading.river

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Les règles PURES du pont conversation → loi. Miroir de `RiverConversationMappingTests.swift` et de `RiverBubbleLayoutTests.swift`. */
class RiverConversationMappingTest {

    private val t0 = 1_786_957_200_000.0

    private fun message(
        id: String,
        sender: String,
        minutes: Double,
        name: String? = null,
        system: Boolean = false,
        replyTo: String? = null,
        deleted: Boolean = false,
    ) = RiverConversationMessage(id, sender, name, null, t0 + minutes * 60_000, replyTo, system, deleted)

    private fun geometry(messages: List<RiverConversationMessage>) =
        RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages, "me"))

    private fun bubble(id: String, head: Boolean, system: Boolean = false) =
        RiverBubble(id, "u", 0, 0, 0.0, false, null, head, system)

    @Test
    fun `les avis entrent dans la loi marques, gardent leur rang, mais ne sont la voix de personne`() {
        val messages = listOf(
            message("m1", "alice", 0.0, "Alice"),
            message("sys", "newcomer", 1.0, "Nouveau", system = true),
            message("m2", "bob", 2.0, "Bob"),
        )
        val input = RiverConversationMapping.lanesInput(messages, "me")
        assertThat(input.messages.map { it.id }).containsExactly("m1", "sys", "m2").inOrder()
        assertThat(input.messages.first { it.id == "sys" }.isSystem).isTrue()
        assertThat(input.participants.map { it.id }).containsExactly("alice", "bob").inOrder()
        assertThat(input.viewerId).isEqualTo("me")

        val law = RiverLaneResolver.resolveRiverLanes(input)
        assertThat(law.bubbles.any { it.messageId == "sys" && it.isSystem }).isTrue()
        assertThat(law.lanes.any { it.laneId == "newcomer" }).isFalse()
    }

    @Test
    fun `un message supprime reste dehors de la loi`() {
        val messages = listOf(message("m1", "alice", 0.0), message("gone", "alice", 1.0, deleted = true))
        assertThat(RiverConversationMapping.lanesInput(messages, "me").messages.map { it.id }).containsExactly("m1")
    }

    @Test
    fun `les participants sont les expediteurs, dernier nom connu, dans l ordre de premiere apparition`() {
        val input = RiverConversationMapping.lanesInput(
            listOf(message("m1", "bob", 0.0, "Bob"), message("m2", "alice", 1.0, "Alice"), message("m3", "bob", 2.0, "Bob R.")),
            "me",
        )
        assertThat(input.participants.map { it.id }).containsExactly("bob", "alice").inOrder()
        assertThat(input.participants.first().displayName).isEqualTo("Bob R.")
    }

    @Test
    fun `le nom d affichage retombe sur le pseudo puis sur l identifiant`() {
        assertThat(RiverConversationMapping.displayName(RiverConversationMessage("a", "s1", "Nom", "pseudo", 0.0))).isEqualTo("Nom")
        assertThat(RiverConversationMapping.displayName(RiverConversationMessage("a", "s1", null, "pseudo", 0.0))).isEqualTo("pseudo")
        assertThat(RiverConversationMapping.displayName(RiverConversationMessage("a", "s1", null, null, 0.0))).isEqualTo("s1")
    }

    @Test
    fun `la cible d une reponse est portee a la loi pour les connecteurs`() {
        val input = RiverConversationMapping.lanesInput(
            listOf(message("m1", "alice", 0.0), message("m2", "bob", 1.0, replyTo = "m1")), "me",
        )
        assertThat(input.messages.last().replyToMessageId).isEqualTo("m1")
    }

    @Test
    fun `le curseur d ouverture est la bulle la plus recente, ou la rive du lecteur quand c est vide`() {
        val g = geometry(listOf(message("m1", "alice", 0.0), message("m2", "bob", 1.0), message("m3", "alice", 2.0)))
        assertThat(RiverConversationMapping.initialCursor(g).rank).isEqualTo(g.bubbles.maxOf { it.rank })
        assertThat(RiverConversationMapping.initialCursor(geometry(emptyList()))).isEqualTo(RiverCursor(0, 0))
    }

    @Test
    fun `au present seulement quand le curseur porte le rang de la bulle la plus recente`() {
        val g = geometry(listOf(message("m1", "alice", 0.0), message("m2", "bob", 1.0), message("m3", "alice", 2.0)))
        val present = RiverConversationMapping.initialCursor(g)
        assertThat(RiverConversationMapping.isAtPresent(present, g)).isTrue()
        assertThat(RiverConversationMapping.isAtPresent(RiverCursor(present.laneIndex, 0), g)).isFalse()
        assertThat(RiverConversationMapping.isAtPresent(RiverCursor(0, 0), geometry(emptyList()))).isFalse()
    }

    @Test
    fun `l empreinte change quand un avis arrive et quand une voix parle`() {
        val base = listOf(message("m1", "alice", 0.0))
        val fingerprint = RiverConversationMapping.fingerprint(base)
        assertThat(RiverConversationMapping.fingerprint(base + message("sys", "x", 1.0, system = true))).isNotEqualTo(fingerprint)
        assertThat(RiverConversationMapping.fingerprint(base + message("m2", "bob", 2.0))).isNotEqualTo(fingerprint)
    }

    @Test
    fun `l empreinte porte le compte, distingue l ordre et reste stable`() {
        val a = message("m1", "alice", 0.0)
        val b = message("m2", "bob", 1.0)
        assertThat(RiverConversationMapping.fingerprint(listOf(a, b)).count).isEqualTo(2)
        assertThat(RiverConversationMapping.fingerprint(listOf(a, b))).isNotEqualTo(RiverConversationMapping.fingerprint(listOf(b, a)))
        assertThat(RiverConversationMapping.fingerprint(listOf(a, b))).isEqualTo(RiverConversationMapping.fingerprint(listOf(a, b)))
        assertThat(RiverConversationMapping.fingerprint(listOf(a, message("gone", "x", 2.0, deleted = true))).count).isEqualTo(1)
    }

    @Test
    fun `la position de groupe suit le regroupement de la loi - tete, milieu, queue, seule`() {
        val messages = listOf(
            message("a1", "alice", 0.0), message("a2", "alice", 1.0), message("a3", "alice", 2.0),
            message("b1", "bob", 3.0), message("a4", "alice", 4.0),
        )
        val positions = RiverConversationMapping.groupPositions(geometry(messages).bubbles)
        assertThat(positions["a1"]).isEqualTo(RiverGroupPosition.HEAD)
        assertThat(positions["a2"]).isEqualTo(RiverGroupPosition.MIDDLE)
        assertThat(positions["a3"]).isEqualTo(RiverGroupPosition.TAIL)
        assertThat(positions["b1"]).isEqualTo(RiverGroupPosition.SOLO)
        assertThat(positions["a4"]).isEqualTo(RiverGroupPosition.SOLO)
    }

    @Test
    fun `un avis coupe le groupe des deux cotes`() {
        val messages = listOf(
            message("a1", "alice", 0.0), message("sys", "newcomer", 1.0, system = true),
            message("a2", "alice", 2.0), message("a3", "alice", 3.0),
        )
        val positions = RiverConversationMapping.groupPositions(geometry(messages).bubbles)
        assertThat(positions["a1"]).isEqualTo(RiverGroupPosition.SOLO)
        assertThat(positions["sys"]).isEqualTo(RiverGroupPosition.SOLO)
        assertThat(positions["a2"]).isEqualTo(RiverGroupPosition.HEAD)
        assertThat(positions["a3"]).isEqualTo(RiverGroupPosition.TAIL)
    }

    @Test
    fun `un identifiant en double ne fait pas echouer et la premiere position fait foi`() {
        val positions = RiverConversationMapping.groupPositions(
            listOf(bubble("m1", head = true), bubble("m2", head = false), bubble("m1", head = true)),
        )
        assertThat(positions["m1"]).isEqualTo(RiverGroupPosition.HEAD)
        assertThat(positions["m2"]).isEqualTo(RiverGroupPosition.TAIL)
    }

    @Test
    fun `la jointure est en haut des continuations et en bas des tetes et des milieux`() {
        assertThat(listOf(RiverGroupPosition.SOLO.joinsAbove, RiverGroupPosition.SOLO.joinsBelow)).containsExactly(false, false)
        assertThat(listOf(RiverGroupPosition.HEAD.joinsAbove, RiverGroupPosition.HEAD.joinsBelow)).containsExactly(false, true)
        assertThat(listOf(RiverGroupPosition.MIDDLE.joinsAbove, RiverGroupPosition.MIDDLE.joinsBelow)).containsExactly(true, true)
        assertThat(listOf(RiverGroupPosition.TAIL.joinsAbove, RiverGroupPosition.TAIL.joinsBelow)).containsExactly(true, false)
    }

    @Test
    fun `la citation mene a la bulle citee, jamais a un inconnu ni a un avis`() {
        val messages = listOf(
            message("a1", "alice", 0.0), message("b1", "bob", 1.0),
            message("sys", "newcomer", 2.0, system = true), message("c1", "carol", 3.0, replyTo = "a1"),
        )
        val g = geometry(messages)
        val target = g.bubbles.first { it.messageId == "a1" }
        assertThat(RiverConversationMapping.cursorForMessage("a1", g)).isEqualTo(RiverCursor(target.laneIndex, target.rank))
        assertThat(RiverConversationMapping.cursorForMessage("hors-fenêtre", g)).isNull()
        assertThat(RiverConversationMapping.cursorForMessage("sys", g)).isNull()
    }

    @Test
    fun `une citation tient sur une ligne`() {
        assertThat(RiverConversationMapping.singleLine("Bonjour\n\n  à   tous\n")).isEqualTo("Bonjour à tous")
        assertThat(RiverConversationMapping.singleLine("   ")).isEqualTo("")
        assertThat(RiverConversationMapping.singleLine("déjà une ligne")).isEqualTo("déjà une ligne")
    }

    @Test
    fun `les initiales - deux mots, un mot, trois mots, casse, blancs, vide`() {
        assertThat(RiverConversationMapping.initials("Marie Curie")).isEqualTo("MC")
        assertThat(RiverConversationMapping.initials("Bob")).isEqualTo("B")
        assertThat(RiverConversationMapping.initials("Jean de La Fontaine")).isEqualTo("JD")
        assertThat(RiverConversationMapping.initials("marie curie")).isEqualTo("MC")
        assertThat(RiverConversationMapping.initials("  Marie   Curie  ")).isEqualTo("MC")
        assertThat(RiverConversationMapping.initials("")).isEqualTo("?")
        assertThat(RiverConversationMapping.initials("   ")).isEqualTo("?")
        assertThat(RiverConversationMapping.initials("Toi")).isEqualTo("T")
    }

    @Test
    fun `le placement d un rang sans cadre - connu, au-dessus, au-dessous, inconnu`() {
        val known = mapOf(10 to "dix", 12 to "douze")
        assertThat(RiverRankPlacement.resolve(10, known)).isEqualTo(RiverRankPlacement.Known("dix"))
        assertThat(RiverRankPlacement.resolve(3, known)).isEqualTo(RiverRankPlacement.Above)
        assertThat(RiverRankPlacement.resolve(40, known)).isEqualTo(RiverRankPlacement.Below)
        assertThat(RiverRankPlacement.resolve(11, known)).isEqualTo(RiverRankPlacement.Unknown)
        assertThat(RiverRankPlacement.resolve(5, emptyMap<Int, String>())).isEqualTo(RiverRankPlacement.Unknown)
    }

    // — la recherche de la fenêtre de silence

    private fun burst(sender: String, startMinutes: Double, count: Int, stepMinutes: Double) =
        (0 until count).map { message("$sender-${startMinutes.toInt()}-$it", sender, startMinutes + it * stepMinutes) }

    @Test
    fun `l echelle de fenetres va du plus large au plus serre et contient le defaut de la loi`() {
        val ladder = RiverConversationMapping.silenceWindowLadderMs
        assertThat(ladder).isInOrder(compareByDescending<Double> { it })
        assertThat(ladder).contains(RiverLawConstants.LANE_SILENCE_WINDOW_MS)
    }

    @Test
    fun `une conversation qui aligne ses voix garde un plan a couloirs`() {
        val messages = listOf("alice", "bob", "carol", "alice", "bob", "carol").mapIndexed { i, s -> message("m$i", s, i * 2.0) }
        val g = RiverConversationMapping.resolveGeometry(messages, "me")
        assertThat(g.layout).isEqualTo(RiverLayout.LANES)
        assertThat(g.laneCount).isEqualTo(3)
    }

    @Test
    fun `quand aucune fenetre ne donne de couloirs la loi prononce elle-meme sa serialisation`() {
        val messages = listOf(message("m1", "alice", 0.0), message("m2", "bob", 1.0))
        val g = RiverConversationMapping.resolveGeometry(messages, "me")
        assertThat(g.layout).isEqualTo(RiverLayout.SERIALIZED)
        assertThat(g.serializationReason).isEqualTo(RiverSerializationReason.BELOW_MINIMUM)
        assertThat(g.silenceWindowMs).isEqualTo(RiverLawConstants.LANE_SILENCE_WINDOW_MS)
    }

    @Test
    fun `la recherche garde la fenetre qui aligne le plus de voix sans deborder`() {
        // Huit voix qui parlent à dix minutes d'écart : la fenêtre par défaut (30 min) en aligne
        // plus de sept (débordement), une fenêtre plus serrée les range sans les sérialiser.
        val messages = (0 until 8).map { message("m$it", "p$it", it * 10.0) } +
            (0 until 8).map { message("n$it", "p$it", 80.0 + it * 10.0) }
        val default = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages, "me"))
        val searched = RiverConversationMapping.resolveGeometry(messages, "me")
        assertThat(searched.layout).isEqualTo(RiverLayout.LANES)
        assertThat(searched.laneCount).isAtLeast(if (default.layout == RiverLayout.LANES) default.laneCount else 1)
        assertThat(searched.laneCount).isAtMost(RiverLawConstants.MAX_LANES)
    }
}

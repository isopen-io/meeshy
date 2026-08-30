import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Chantier Rivière iOS — le pont PUR fil → loi (`RiverConversationMapping`),
/// lot 1 (branchement) puis lot 2 (les avis système entrent MARQUÉS).
@MainActor
final class RiverConversationMappingTests: XCTestCase {

    private static let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    private func message(
        _ id: String, sender: String, name: String? = nil, minutes: Double,
        source: MeeshyMessage.MessageSource = .user, replyTo: String? = nil, deleted: Bool = false
    ) -> MeeshyMessage {
        var m = MeeshyMessage(
            id: id, conversationId: "c", senderId: sender, content: "texte \(id)",
            createdAt: Self.t0.addingTimeInterval(minutes * 60), updatedAt: Self.t0
        )
        m.senderName = name
        m.messageSource = source
        m.replyToId = replyTo
        if deleted { m.deletedAt = Self.t0 }
        return m
    }

    // MARK: - Les messages système ne sont la voix de personne

    /// **Lot 2 — recalibrage EN CONSCIENCE du témoin du lot 1.** Celui-ci
    /// affirmait « l'avis d'arrivée n'entre pas dans la loi » : c'était la
    /// façon la plus courte d'éviter la lane fantôme, mais elle faisait
    /// DISPARAÎTRE l'avis de la Rivière — un lecteur n'y voyait jamais « X a
    /// rejoint la conversation ». La loi partagée sait faire mieux : l'avis y
    /// entre MARQUÉ (`isSystem`), garde son rang dans le temps, et reste
    /// exclu des voix, des couloirs, des connecteurs et des groupes. Le fait
    /// que le lot 1 protégeait (« pas de lane fantôme ») est TOUJOURS
    /// vérifié ici — il est simplement obtenu par la marque, pas par
    /// l'amputation.
    func test_systemMessages_enterTheLawMarked_keepTheirRank_butAreNeverAVoice() {
        let messages = [
            message("m1", sender: "alice", name: "Alice", minutes: 0),
            message("sys", sender: "newcomer", name: "Nouveau", minutes: 1, source: .system),
            message("m2", sender: "bob", name: "Bob", minutes: 2)
        ]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")

        XCTAssertEqual(input.messages.map(\.id), ["m1", "sys", "m2"], "l'avis garde son rang dans le temps")
        XCTAssertEqual(
            input.messages.first(where: { $0.id == "sys" })?.isSystem, true,
            "sans cette marque, `senderId` ferait de l'arrivant une voix : l'avis est écrit avec l'ARRIVANT pour auteur"
        )
        XCTAssertEqual(input.participants.map(\.id), ["alice", "bob"], "l'arrivant n'est pas une voix : pas de lane fantôme")
        XCTAssertEqual(input.viewerId, "me")

        // La preuve va jusqu'au bout : la LOI, pas seulement son entrée.
        let geometry = RiverLaneResolver.resolveRiverLanes(input)
        XCTAssertTrue(geometry.bubbles.contains { $0.messageId == "sys" && $0.isSystem })
        XCTAssertFalse(geometry.lanes.contains { $0.laneId == "newcomer" })
    }

    /// Un message supprimé, lui, reste dehors — dans les deux lots : une
    /// bulle vide ferait un rang vide.
    func test_deletedMessages_stayOutOfTheLaw_entirely() {
        let messages = [message("m1", sender: "alice", minutes: 0), message("gone", sender: "alice", minutes: 1, deleted: true)]
        XCTAssertEqual(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me").messages.map(\.id), ["m1"])
    }

    func test_participants_areTheSenders_withTheirLatestKnownName_inOrderOfFirstAppearance() {
        let messages = [
            message("m1", sender: "bob", name: "Bob", minutes: 0),
            message("m2", sender: "alice", name: "Alice", minutes: 1),
            message("m3", sender: "bob", name: "Bob R.", minutes: 2)
        ]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        XCTAssertEqual(input.participants.map(\.id), ["bob", "alice"])
        XCTAssertEqual(input.participants.first?.displayName, "Bob R.", "dernier nom connu")
    }

    func test_replyTarget_isCarriedToTheLaw_forConnectors() {
        let messages = [message("m1", sender: "alice", minutes: 0), message("m2", sender: "bob", minutes: 1, replyTo: "m1")]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        XCTAssertEqual(input.messages.last?.replyToMessageId, "m1")
    }

    // MARK: - Contenus : Prisme injecté, heure, réponse

    func test_contents_carryThePrismeText_theTime_andTheReplyPreview() {
        var m2 = message("m2", sender: "bob", name: "Bob", minutes: 1, replyTo: "m1")
        m2.replyTo = ReplyReference(messageId: "m1", authorName: "Alice", previewText: "Salut")
        let messages = [message("m1", sender: "alice", name: "Alice", minutes: 0), m2]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { "PRISME:\($0.id)" },
            time: { _ in "12:45" }
        )
        XCTAssertEqual(contents.count, geometry.bubbles.count, "une bulle, un contenu")
        let bob = try? XCTUnwrap(contents.first { $0.bubble.messageId == "m2" })
        XCTAssertEqual(bob?.text, "PRISME:m2", "le texte vient du Prisme injecté, jamais de `content` nu")
        XCTAssertEqual(bob?.timeString, "12:45")
        XCTAssertEqual(bob?.senderDisplayName, "Bob")
        XCTAssertEqual(bob?.replyPreview, RiverReplyPreview(authorDisplayName: "Alice", text: "Salut"))
        XCTAssertEqual(bob?.layout, geometry.layout)
    }

    func test_initialCursor_isTheMostRecentBubble_orTheReadersShoreWhenEmpty() {
        let messages = [message("m1", sender: "alice", minutes: 0), message("m2", sender: "bob", minutes: 1), message("m3", sender: "alice", minutes: 2)]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let cursor = RiverConversationMapping.initialCursor(geometry: geometry)
        XCTAssertEqual(cursor.rank, geometry.bubbles.map(\.rank).max())
        let empty = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: [], viewerId: "me"))
        XCTAssertEqual(RiverConversationMapping.initialCursor(geometry: empty), RiverLaneResolver.RiverCursor(laneIndex: 0, rank: 0))
    }

    /// #3901 — la preuve de consultation qui autorise le rattrapage du badge
    /// en Rivière : le curseur porte le rang de la bulle la plus RÉCENTE,
    /// exactement le calcul que `initialCursor` fait à l'ouverture.
    func test_isAtPresent_isTrueOnlyWhenCursorRankIsTheMostRecentBubble() {
        let messages = [message("m1", sender: "alice", minutes: 0), message("m2", sender: "bob", minutes: 1), message("m3", sender: "alice", minutes: 2)]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let present = RiverConversationMapping.initialCursor(geometry: geometry)

        XCTAssertTrue(RiverConversationMapping.isAtPresent(cursor: present, geometry: geometry))

        let past = RiverLaneResolver.RiverCursor(laneIndex: present.laneIndex, rank: 0)
        XCTAssertFalse(
            RiverConversationMapping.isAtPresent(cursor: past, geometry: geometry),
            "remonté dans l'histoire, le lecteur n'a pas rejoint le présent"
        )
    }

    /// Un fil sans bulle n'a rien à rattraper — jamais « au présent » par défaut.
    func test_isAtPresent_isFalse_whenGeometryHasNoBubbles() {
        let empty = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: [], viewerId: "me"))
        XCTAssertFalse(
            RiverConversationMapping.isAtPresent(cursor: RiverLaneResolver.RiverCursor(laneIndex: 0, rank: 0), geometry: empty)
        )
    }

    /// **Lot 2 — recalibrage EN CONSCIENCE.** Tant que les avis étaient
    /// écartés de la loi, les ignorer dans l'empreinte était juste. Maintenant
    /// qu'ils occupent un rang, une arrivée qui ne changerait pas l'empreinte
    /// ne serait JAMAIS redessinée : le lecteur verrait la conversation
    /// continuer sans jamais voir qui vient d'entrer.
    func test_fingerprint_changesWhenASystemNoticeArrives_andWhenAVoiceSpeaks() {
        let base = [message("m1", sender: "alice", minutes: 0)]

        XCTAssertNotEqual(
            RiverConversationMapping.fingerprint(messages: base),
            RiverConversationMapping.fingerprint(messages: base + [message("sys", sender: "x", minutes: 1, source: .system)]),
            "une arrivée change la Rivière : elle prend un rang"
        )
        XCTAssertNotEqual(
            RiverConversationMapping.fingerprint(messages: base),
            RiverConversationMapping.fingerprint(messages: base + [message("m2", sender: "bob", minutes: 2)])
        )
    }

    // MARK: - Lot 2 : l'avis arrive à la peau prêt à être GRAVÉ

    /// La peau ne doit pas avoir à ré-inspecter le message : le contenu porte
    /// déjà de quoi peindre l'avis, et `nil` pour toute prise de parole.
    func test_contents_systemBubbleCarriesItsNotice_speechCarriesNone() {
        let messages = [
            message("m1", sender: "alice", name: "Alice", minutes: 0),
            message("sys", sender: "newcomer", name: "Nouveau", minutes: 1, source: .system)
        ]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { "PRISME:\($0.id)" },
            time: { _ in "12:45" }
        )

        XCTAssertNil(contents.first { $0.bubble.messageId == "m1" }?.systemNotice)
        XCTAssertEqual(
            contents.first { $0.bubble.messageId == "sys" }?.systemNotice,
            .plain("PRISME:sys"),
            "un avis sans métadonnée dédiée garde son libellé, déjà résolu par l'appelant"
        )
    }

    /// Un avis d'ARRIVÉE ne se réécrit pas : il est rendu par la vue du Fil
    /// (`BubbleJoinNoticeView`), avec ses clés i18n et son glyphe fantôme —
    /// le libellé français figé du gateway (`content`) ne sert que de repli.
    func test_contents_joinNotice_isHandedToTheThreadsOwnView_notRewritten() {
        var arrival = message("sys", sender: "newcomer", name: "Nouveau", minutes: 1, source: .system)
        arrival.joinNotice = JoinNoticeMetadata(
            participantId: "newcomer",
            displayName: "Zoé",
            isAnonymous: true,
            viaShareLink: true,
            username: "ano_zoe",
            givenName: "Zoé"
        )
        let messages = [message("m1", sender: "alice", name: "Alice", minutes: 0), arrival]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { "PRISME:\($0.id)" },
            time: { _ in "12:45" }
        )

        guard case .join(let notice)? = contents.first(where: { $0.bubble.messageId == "sys" })?.systemNotice else {
            return XCTFail("l'arrivée doit être servie comme telle, jamais comme un texte nu")
        }
        XCTAssertEqual(notice.displayName, "Zoé")
        XCTAssertTrue(notice.isAnonymous, "le glyphe fantôme dit que l'arrivant n'a pas de compte")
    }

    /// La graine de couleur de la bulle est EXACTEMENT celle que la loi a
    /// donnée à la branche de son auteur. Le lot 1 lisait `senderName ??
    /// senderId` ici et `senderName ?? senderUsername ?? senderId` pour les
    /// participants : un auteur sans `senderName` peignait donc sa bulle
    /// d'une couleur et son trait d'une autre.
    func test_contents_colourSeed_isTheSameOneTheLawGaveToTheLane() {
        var anonymous = message("m1", sender: "u1", minutes: 0)
        anonymous.senderName = nil
        anonymous.senderUsername = "ano_zoe"
        let messages = [anonymous, message("m2", sender: "bob", name: "Bob", minutes: 1)]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        let geometry = RiverLaneResolver.resolveRiverLanes(input)
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { $0.content }, time: { _ in "12:45" }
        )

        let laneSeed = geometry.lanes.first { $0.laneId == "u1" }?.colorSeed
        XCTAssertEqual(laneSeed, "ano_zoe")
        XCTAssertEqual(contents.first { $0.bubble.messageId == "m1" }?.colorSeed, laneSeed)
    }

    // MARK: - Lot G (22/08) : deux bulles d'un même groupe partagent une bordure JOINTE

    /// La loi ne dit que `isFirstInGroup` ; la position COMPLÈTE (tête, milieu,
    /// queue, seule) se déduit du rang SUIVANT — purement, ici, jamais dans la
    /// vue. C'est elle qui décide quels bords sont fermés et lequel est partagé
    /// en pointillé (directive produit 2026-08-22 : « bordure jointe en
    /// pointillé et partagée, non pas des bordures fermées puis des pointillés
    /// en plus »).
    func test_contents_groupPosition_isHeadMiddleTailOrSolo_followingTheLawsGrouping() {
        let messages = [
            message("a1", sender: "alice", name: "Alice", minutes: 0),
            message("a2", sender: "alice", name: "Alice", minutes: 1),
            message("a3", sender: "alice", name: "Alice", minutes: 2),
            message("b1", sender: "bob", name: "Bob", minutes: 3),
            message("a4", sender: "alice", name: "Alice", minutes: 4),
        ]
        let geometry = RiverLaneResolver.resolveRiverLanes(
            RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        )
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { $0.content }, time: { _ in "10:00" }
        )
        let positions = Dictionary(uniqueKeysWithValues: contents.map { ($0.bubble.messageId, $0.groupPosition) })

        XCTAssertEqual(positions["a1"], .head)
        XCTAssertEqual(positions["a2"], .middle)
        XCTAssertEqual(positions["a3"], .tail)
        XCTAssertEqual(positions["b1"], .solo, "une voix seule entre deux autres n'a ni tête ni queue à joindre")
        XCTAssertEqual(positions["a4"], .solo, "Alice reparle APRÈS Bob : nouveau groupe, d'une seule bulle")
    }

    /// Un avis système coupe le groupe des DEUX côtés (la loi ne le rattache à
    /// personne) : la bulle d'avant redevient une queue/seule, celle d'après
    /// une tête/seule — jamais une bordure jointe à travers un avis.
    func test_contents_groupPosition_aSystemNoticeBreaksTheGroup_onBothSides() {
        let messages = [
            message("a1", sender: "alice", name: "Alice", minutes: 0),
            message("sys", sender: "newcomer", name: "Nouveau", minutes: 1, source: .system),
            message("a2", sender: "alice", name: "Alice", minutes: 2),
            message("a3", sender: "alice", name: "Alice", minutes: 3),
        ]
        let geometry = RiverLaneResolver.resolveRiverLanes(
            RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        )
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { $0.content }, time: { _ in "10:00" }
        )
        let positions = Dictionary(uniqueKeysWithValues: contents.map { ($0.bubble.messageId, $0.groupPosition) })

        XCTAssertEqual(positions["a1"], .solo)
        XCTAssertEqual(positions["sys"], .solo, "un avis n'est jamais joint à quoi que ce soit")
        XCTAssertEqual(positions["a2"], .head)
        XCTAssertEqual(positions["a3"], .tail)
    }

    // MARK: - R-6 : la citation mène à sa cible

    /// Un tap sur la citation d'une réponse doit poser le curseur SUR le
    /// message cité — couloir ET rang — tels que la loi les a servis. Un
    /// identifiant inconnu (message hors fenêtre) ne fabrique aucun curseur,
    /// et un avis système n'est la cible de personne (la loi ne lui donne pas
    /// de couloir).
    func test_cursorForMessageId_isTheCitedBubblesLaneAndRank_orNilWhenUnknownOrSystem() {
        let messages = [
            message("a1", sender: "alice", name: "Alice", minutes: 0),
            message("b1", sender: "bob", name: "Bob", minutes: 1),
            message("sys", sender: "newcomer", name: "Nouveau", minutes: 2, source: .system),
            message("c1", sender: "carol", name: "Carol", minutes: 3, replyTo: "a1"),
        ]
        let geometry = RiverLaneResolver.resolveRiverLanes(
            RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        )
        let target = try? XCTUnwrap(geometry.bubbles.first { $0.messageId == "a1" })
        let cursor = RiverConversationMapping.cursor(forMessageId: "a1", geometry: geometry)

        XCTAssertEqual(cursor?.laneIndex, target?.laneIndex)
        XCTAssertEqual(cursor?.rank, target?.rank)
        XCTAssertNil(RiverConversationMapping.cursor(forMessageId: "hors-fenêtre", geometry: geometry))
        XCTAssertNil(RiverConversationMapping.cursor(forMessageId: "sys", geometry: geometry), "un avis n'est la cible de personne")
    }

    // MARK: - La citation tient sur UNE ligne, quoi qu'en dise le message cité

    /// `previewText` est une chaîne brute : des retours à la ligne y font
    /// gonfler le bloc de citation (mesuré au simulateur : un rail de 245 pt
    /// pour une ligne de texte). La citation est une RÉFÉRENCE (§7ter A4) —
    /// une seule ligne, espaces repliés.
    func test_singleLine_collapsesNewlinesAndRepeatedWhitespace() {
        XCTAssertEqual(RiverConversationMapping.singleLine("Bonjour\n\n  à   tous\n"), "Bonjour à tous")
        XCTAssertEqual(RiverConversationMapping.singleLine("   "), "")
        XCTAssertEqual(RiverConversationMapping.singleLine("déjà une ligne"), "déjà une ligne")
    }

    // MARK: - R-5 : identité vivante — présence, story et fiche, INJECTÉES

    /// La bulle porte de quoi rendre une identité VIVANTE (présence, cercle
    /// de story, fiche à ouvrir) — résolue par l'appelant et injectée, jamais
    /// lue ici (aucun singleton dans le mapping). Un avis système n'a pas
    /// d'identité : il n'est la voix de personne.
    func test_contents_identity_isInjected_andAbsentForSystemNotices() {
        var spoken = message("a1", sender: "alice", name: "Alice", minutes: 0)
        spoken.senderUsername = "alice_w"
        spoken.senderAvatarURL = "https://cdn/alice.png"
        let messages = [spoken, message("sys", sender: "newcomer", name: "Nouveau", minutes: 1, source: .system)]
        let geometry = RiverLaneResolver.resolveRiverLanes(
            RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        )
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { $0.content }, time: { _ in "10:00" },
            presence: { $0.senderId == "alice" ? .online : nil },
            storyRing: { $0.senderId == "alice" ? .unread : .none }
        )
        let alice = try? XCTUnwrap(contents.first { $0.bubble.messageId == "a1" }?.identity)
        XCTAssertEqual(alice?.presence, .online)
        XCTAssertEqual(alice?.storyRing, .unread)
        XCTAssertEqual(alice?.avatarURL, "https://cdn/alice.png")
        XCTAssertEqual(alice?.profileUser.participantId, "alice")
        XCTAssertEqual(alice?.profileUser.username, "alice_w")
        XCTAssertNil(contents.first { $0.bubble.messageId == "sys" }?.identity, "un avis n'est la voix de personne")
    }

    /// Sans résolveurs injectés, la bulle garde une identité MUETTE (fiche
    /// ouvrable, ni présence ni story) — les sites antérieurs à R-5 ne
    /// changent pas de comportement.
    func test_contents_identity_defaultsToSilentPresenceAndNoStory() {
        let messages = [message("a1", sender: "alice", name: "Alice", minutes: 0)]
        let geometry = RiverLaneResolver.resolveRiverLanes(
            RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        )
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me", text: { $0.content }, time: { _ in "10:00" }
        )
        XCTAssertNil(contents.first?.identity?.presence)
        XCTAssertEqual(contents.first?.identity?.storyRing, StoryRingState.none)
        XCTAssertEqual(contents.first?.identity?.profileUser.participantId, "alice")
    }

    // MARK: - #3946 — l'empreinte est évaluée à CHAQUE passe de body

    /// Sa docstring promettait « jamais à chaque passe de body » ; son site
    /// d'appel la contredisait — passée en argument d'`adaptiveOnChange(of:)`,
    /// elle est réévaluée à chaque évaluation du body. La promesse ne pouvant
    /// pas être tenue là où elle était écrite, c'est le COÛT qui a été rendu
    /// négligeable : plus aucune allocation.
    func test_fingerprint_buildsNoStringPerBodyPass() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Riviere
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Riviere/Core/RiverConversationMapping.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))

        let start = try XCTUnwrap(source.range(of: "static func fingerprint(messages:"),
                                  "`fingerprint` a disparu ou changé de signature — la garde ne vise plus rien.")
        let body = String(source[start.lowerBound...].prefix(400))

        XCTAssertFalse(body.contains("joined("),
                       "L'empreinte reconstruit une chaîne de N identifiants à chaque passe de body : "
                       + "sur un fil de mille messages, ~25 ko alloués par frame.")
        XCTAssertTrue(body.contains("Hasher()"),
                      "L'empreinte doit se calculer sans rien allouer — un `Hasher` parcourt les mêmes "
                      + "identifiants et rend un entier.")
    }

    /// Le compte accompagne le hachage : deux fils distincts ne se fient pas
    /// au seul digest.
    func test_fingerprint_carriesTheCount_notOnlyADigest() {
        let two = [message("m1", sender: "alice", minutes: 0), message("m2", sender: "bob", minutes: 1)]
        XCTAssertEqual(RiverConversationMapping.fingerprint(messages: two).count, 2)
    }

    /// L'ORDRE compte : la loi donne des RANGS, et deux fils aux mêmes
    /// identifiants dans un autre ordre ne se dessinent pas pareil.
    func test_fingerprint_distinguishesOrder() {
        let a = message("m1", sender: "alice", minutes: 0)
        let b = message("m2", sender: "bob", minutes: 1)
        XCTAssertNotEqual(
            RiverConversationMapping.fingerprint(messages: [a, b]),
            RiverConversationMapping.fingerprint(messages: [b, a]),
            "un hachage insensible à l'ordre laisserait une réorganisation passer inaperçue"
        )
    }

    /// Même fil, même empreinte — sinon la géométrie serait recalculée à
    /// chaque passe, ce que l'empreinte existe précisément pour empêcher.
    func test_fingerprint_isStableForTheSameThread() {
        let thread = [message("m1", sender: "alice", minutes: 0), message("m2", sender: "bob", minutes: 1)]
        XCTAssertEqual(
            RiverConversationMapping.fingerprint(messages: thread),
            RiverConversationMapping.fingerprint(messages: thread)
        )
    }

}

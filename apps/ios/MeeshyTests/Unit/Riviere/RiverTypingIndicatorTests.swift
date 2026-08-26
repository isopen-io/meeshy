import XCTest
@testable import Meeshy

/// L2b/2b-7 — la frappe n'a AUCUN rendu en Rivière : `grep -rni "typing"` sur
/// les quatorze fichiers du dossier ne rend rien. En Script/Focal/Bulles elle
/// est une CELLULE du flux (`MessageListViewController` →
/// `TypingIndicatorBubble`), rendue mais COUVERTE par le pane opaque de la
/// Rivière ; et le repli de la pastille de connexion l'exclut explicitement
/// pour la conversation ouverte (`ConnectionBanner.typingEntries(…excluding:)`
/// — témoin JUSTE, qui doit rester vert : le repli n'est pas la réponse).
///
/// **Le rendu est livré (2026-08-25).** `TypingIndicatorBubble` est passée
/// `internal` — elle était `private`, donc à portée de FICHIER, donc invisible
/// depuis `Riviere/View/` : il n'existait aucun moyen de monter la MÊME vue
/// sans en déclarer une seconde. `RiverStreamHost` reçoit désormais le roster
/// de son hôte (`typingParticipants`, dit par `ConversationView` depuis
/// `ConversationViewModel.typingUsernames`) et le rend en OVERLAY BAS du pane,
/// au-dessus du composeur.
///
/// Ce que cette suite verrouille, c'est le risque que le brief nomme et qui
/// SURVIT au correctif : l'indicateur doit rester une DÉCORATION DE PEAU. Une
/// voix qui n'a encore rien dit ne doit jamais faire naître un couloir — donc
/// la frappe n'entre ni dans la LOI (`Riviere/Core/`), ni dans les entrées qui
/// la nourrissent (`RiverConversationMapping`), et la peau ne déclare pas son
/// propre indicateur.
///
/// Les quatre premières gardes étaient vraies AVANT le rendu et le restent
/// après : c'est tout leur intérêt — elles ont été écrites avant lui.
final class RiverTypingIndicatorTests: XCTestCase {

    private static var riviereRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Riviere
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Riviere")
    }

    private struct RiverSource {
        let name: String
        /// Code SANS commentaires : une garde qui lirait les commentaires
        /// rougirait sur la documentation d'un futur correctif au lieu de son
        /// code.
        let code: String
    }

    private func sources(in folder: String) throws -> [RiverSource] {
        let directory = Self.riviereRoot.appendingPathComponent(folder)
        let contents = try FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        )
        return try contents
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { url in
                let raw = try String(contentsOf: url, encoding: .utf8)
                return RiverSource(name: url.lastPathComponent, code: AppSourceGuard.stripComments(raw))
            }
    }

    // MARK: - La garde ne peut pas passer au vert en ne lisant rien

    func test_guardDiscoversBothRiverFolders_neverSilentlyEmpty() throws {
        let law = try sources(in: "Core")
        let skin = try sources(in: "View")
        XCTAssertFalse(
            law.isEmpty,
            "Aucun fichier chargé depuis `Riviere/Core/` — une garde qui lit zéro fichier passe " +
            "TOUJOURS au vert sans rien vérifier."
        )
        XCTAssertFalse(
            skin.isEmpty,
            "Aucun fichier chargé depuis `Riviere/View/` — même remarque."
        )
    }

    // MARK: - La LOI ignore la frappe

    func test_theRiverLaw_neverLearnsAboutTyping() throws {
        for source in try sources(in: "Core") {
            XCTAssertFalse(
                source.code.lowercased().contains("typing"),
                "`Riviere/Core/\(source.name)` mentionne la frappe. La loi (`RiverLaneResolver` et " +
                "ses entrées) ne connaît que des messages DITS : y injecter la frappe ferait naître " +
                "un couloir pour une voix qui n'a encore rien dit, et ce couloir survivrait au " +
                "`typing:stop`. L'indicateur est une décoration de la PEAU, jamais une entrée de la loi."
            )
        }
    }

    func test_noRiverMappingCall_isEverFedATypingRoster() throws {
        for source in try sources(in: "View") {
            for arguments in Self.argumentLists(after: "RiverConversationMapping.", in: source.code) {
                XCTAssertFalse(
                    arguments.lowercased().contains("typing"),
                    "`Riviere/View/\(source.name)` passe une frappe à `RiverConversationMapping` — " +
                    "c'est la porte d'entrée de la géométrie (`resolveGeometry`, `contents`, " +
                    "`fingerprint`). Le roster de frappe doit rester HORS de `lanesInput` : il " +
                    "décore le pane, il ne compose pas de couloir. Liste d'arguments incriminée : " +
                    "\(arguments)"
                )
            }
        }
    }

    /// Listes d'arguments (parenthèses ÉQUILIBRÉES) de chaque appel qui suit
    /// `anchor`. Une fenêtre de N caractères ferait rougir la garde sur du code
    /// voisin — ici la garde ne lit QUE ce qui est réellement passé à l'appel.
    private static func argumentLists(after anchor: String, in code: String) -> [String] {
        var lists: [String] = []
        var searchStart = code.startIndex
        while let call = code.range(of: anchor, options: [], range: searchStart ..< code.endIndex) {
            searchStart = call.upperBound
            guard let open = code[call.upperBound...].firstIndex(of: "(") else { continue }
            var depth = 0
            var index = open
            while index < code.endIndex {
                if code[index] == "(" { depth += 1 }
                if code[index] == ")" {
                    depth -= 1
                    if depth == 0 { break }
                }
                index = code.index(after: index)
            }
            guard index < code.endIndex else { continue }
            lists.append(String(code[code.index(after: open) ..< index]))
            searchStart = code.index(after: index)
        }
        return lists
    }

    // MARK: - La peau ne déclare pas un SECOND indicateur

    func test_theRiverSkin_declaresNoSecondTypingIndicatorView() throws {
        for source in try sources(in: "View") {
            for line in source.code.components(separatedBy: "\n") {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                guard trimmed.hasPrefix("struct ") || trimmed.hasPrefix("private struct ") else { continue }
                XCTAssertFalse(
                    trimmed.lowercased().contains("typing"),
                    "`Riviere/View/\(source.name)` déclare son propre indicateur de frappe " +
                    "(« \(trimmed) »). La Rivière doit monter la MÊME vue que le fil " +
                    "(`TypingIndicatorBubble(isFlat: true)`), jamais une seconde : deux vues " +
                    "divergeraient sur les timings, le libellé et l'accessibilité, et la frappe " +
                    "n'aurait pas le même visage selon le mode de lecture."
                )
            }
        }
    }

    // MARK: - Le rendu (2026-08-25) — overlay du pane, jamais un couloir

    /// Le roster entre dans la peau, il est RENDU par la MÊME vue que le Fil,
    /// et il ne compose AUCUN couloir : ni la grille ni la bande basse ne le
    /// connaissent.
    func test_typingParticipants_areRendered_withoutCreatingALane() throws {
        let host = try normalizedSkin("RiverStreamHost.swift")

        XCTAssertTrue(
            host.contains("var typingParticipants: [TypingParticipant] = []"),
            "`RiverStreamHost` doit RECEVOIR le roster de son appelant — la peau ne lit aucun " +
            "singleton de frappe, elle est dite."
        )
        let overlay = try Self.block(after: ".overlay(alignment: .bottom) {", in: host)
        XCTAssertTrue(
            Self.bannerIsGatedOnAnEmptyRoster(overlay),
            "le bandeau doit être monté en overlay BAS et gardé sur un roster non vide. Corps lu : \(overlay)"
        )
        XCTAssertTrue(
            overlay.contains("isFlat: true"),
            "tenue PLATE — la capsule reste le rendu du mode bulles (matrice §5)."
        )
        XCTAssertTrue(
            overlay.contains(".background(.ultraThinMaterial, in: Capsule())"),
            "le bandeau doit porter sa PROPRE surface (F3, revue adversariale 2026-08-25) : sans " +
            "elle, la tenue plate (pastille d'avatar + trois points) se peint à nu sur la dernière " +
            "bulle — le curseur ancré en bas (`landingAnchor`) la fait reposer exactement là. Corps " +
            "lu : \(overlay)"
        )
        XCTAssertTrue(
            overlay.contains(".padding(.bottom, bottomInset)"),
            "le bandeau remonte au-dessus du composeur (R-7) : `bottomInset` est la bande que " +
            "l'appelant réserve déjà pour lui."
        )
        XCTAssertTrue(
            Self.bottomSafeAreaInsetStaysEmpty(host),
            "la bande basse du `safeAreaInset` doit rester VIDE : un enfant d'inset impose sa " +
            "largeur au `ScrollView` entier (mesuré au simulateur le 2026-08-22 sur la bande des " +
            "couloirs) ; un overlay reçoit la taille de son hôte et ne la fait jamais grandir."
        )

        let grid = try Self.block(after: "private var grid: some View {", in: host)
        XCTAssertFalse(
            grid.lowercased().contains("typing"),
            "la GRILLE ne connaît pas la frappe : un rang ou un couloir né d'une voix qui n'a " +
            "encore rien dit survivrait au `typing:stop`. Corps lu : \(grid)"
        )

        let conversationHost = try normalizedSkin("RiverConversationHost.swift")
        XCTAssertTrue(
            conversationHost.contains("var typingParticipants: [TypingParticipant] = []"),
            "l'hôte de conversation porte le roster…"
        )
        XCTAssertTrue(
            conversationHost.contains("typingParticipants: [TypingParticipant] = [],"),
            "…et son init EXPLICITE le déclare — sans quoi l'appelant ne peut pas le dire " +
            "(cet hôte n'a pas d'init mémberwise : il en écrit un)."
        )
        XCTAssertTrue(
            conversationHost.contains("self.typingParticipants = typingParticipants"),
            "…qu'il assigne…"
        )
        XCTAssertTrue(
            conversationHost.contains("typingParticipants: typingParticipants,"),
            "…et RELAIE au lecteur. Un champ reçu mais jamais transmis serait un correctif que " +
            "personne n'affiche."
        )
    }

    /// Roster vide ⇒ RIEN n'est monté. Sans cette garde, un bandeau
    /// inconditionnel poserait une pastille d'avatar sans nom et trois points
    /// immobiles au bas d'un pane où personne n'écrit.
    func test_emptyTypingRoster_mountsNothing() throws {
        let host = try normalizedSkin("RiverStreamHost.swift")
        let overlay = try Self.block(after: ".overlay(alignment: .bottom) {", in: host)
        XCTAssertTrue(
            overlay.hasPrefix(" if !typingParticipants.isEmpty {"),
            "le montage est GARDÉ sur un roster non vide, et cette garde est la PREMIÈRE chose " +
            "que fait l'overlay. Corps lu : \(overlay)"
        )
    }

    /// **Contre-épreuve des deux gardes ci-dessus** — elles rougissent si le
    /// bandeau devient inconditionnel, ou s'il redescend en enfant du
    /// `safeAreaInset`. Une garde négative qui ne sait pas dire NON meurt en
    /// silence.
    func test_theGuardsAbove_wouldCatchAnUngatedBanner_orAnInsetChild() {
        XCTAssertFalse(
            Self.bannerIsGatedOnAnEmptyRoster(
                " TypingIndicatorBubble( participants: typingParticipants, isFlat: true ) .padding(.bottom, bottomInset) "
            ),
            "un bandeau monté SANS `if !typingParticipants.isEmpty` doit faire rougir la garde"
        )
        XCTAssertTrue(
            Self.bannerIsGatedOnAnEmptyRoster(
                " if !typingParticipants.isEmpty { TypingIndicatorBubble( participants: typingParticipants ) } "
            ),
            "…et le montage gardé, lui, doit passer"
        )
        XCTAssertFalse(
            Self.bottomSafeAreaInsetStaysEmpty(
                ".safeAreaInset(edge: .bottom, spacing: 0) { TypingIndicatorBubble(participants: typingParticipants) }"
            ),
            "un bandeau devenu enfant du `safeAreaInset` doit faire rougir la garde"
        )
        XCTAssertTrue(
            Self.bottomSafeAreaInsetStaysEmpty(
                ".safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: bottomInset) }"
            ),
            "…et la bande vide, elle, doit passer"
        )
    }

    // MARK: - Prédicats partagés par les gardes et leur contre-épreuve

    private static func bannerIsGatedOnAnEmptyRoster(_ overlayBody: String) -> Bool {
        overlayBody.hasPrefix(" if !typingParticipants.isEmpty {")
            && overlayBody.contains("TypingIndicatorBubble(")
    }

    private static func bottomSafeAreaInsetStaysEmpty(_ code: String) -> Bool {
        code.contains(".safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: bottomInset) }")
    }

    /// Un fichier de la peau, SANS commentaires et à espaces normalisés.
    private func normalizedSkin(_ fileName: String) throws -> String {
        let url = Self.riviereRoot.appendingPathComponent("View").appendingPathComponent(fileName)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// Corps d'une déclaration, par PARENTHÉSAGE d'accolades — une garde de
    /// forme vise le BLOC, jamais le fichier (leçon
    /// `reference_source_guard_targets_the_block_not_the_file`).
    private static func block(after signature: String, in code: String) throws -> String {
        let start = try XCTUnwrap(
            code.range(of: signature),
            "signature « \(signature) » introuvable — la garde ne peut pas lire un bloc absent"
        )
        var depth = 1
        var index = start.upperBound
        while index < code.endIndex {
            if code[index] == "{" { depth += 1 }
            if code[index] == "}" {
                depth -= 1
                if depth == 0 { break }
            }
            index = code.index(after: index)
        }
        return String(code[start.upperBound ..< index])
    }
}

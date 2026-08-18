import XCTest
@testable import Meeshy

/// F-083 (WS-4) — gardes de source sur `Focal/Row/FocalRow.swift` (+
/// `FocalIdentityHeader.swift`) : les critères §7 qui ne se prouvent pas en
/// exécutant une assertion sur une valeur, mais en inspectant le CODE
/// (contrat §7 « R15 — aucun snapshot, aucun test de rendu » : la vraie
/// vérification visuelle reste au harnais UIHostingController de WS-11,
/// hors périmètre F-083 — ces gardes couvrent ce qui EST vérifiable sans
/// rendu réel).
final class FocalRowSourceGuardTests: XCTestCase {

    private func source(_ fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - « Aucune bulle nulle part »

    func test_focalRow_doesNotReferenceBubbleBackground() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalRow.swift"))
        XCTAssertFalse(stripped.contains("BubbleBackground"), "FocalRow.swift ne doit référencer aucun fond de bulle")
    }

    func test_focalRow_doesNotReferenceBubbleStandardLayout() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalRow.swift"))
        XCTAssertFalse(stripped.contains("BubbleStandardLayout"), "FocalRow.swift ne doit pas composer BubbleStandardLayout")
    }

    // MARK: - Aucun `@State` de langue (contrainte dure §WS-4)

    /// `FocalRow` lui-même ne porte AUCUN `@State` — la sélection de langue
    /// vient de `input`/`actions` (régression `b9a39c2c`).
    func test_focalRow_hasNoState() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalRow.swift"))
        XCTAssertFalse(stripped.contains("@State"), "FocalRow.swift ne doit porter aucun @State — la langue vient de FocalRowInput/FocalRowActions")
    }

    // MARK: - Button(.plain), jamais .onTapGesture sur un CONTRÔLE

    /// `FocalIdentityHeader` porte le seul CONTRÔLE interactif de la rangée
    /// (ouverture de profil) — doit être un `Button` avec `.buttonStyle(.plain)`,
    /// jamais un `.onTapGesture` nu (avalé par le long-press du conteneur
    /// parent, `BubbleSwipeContainer`).
    func test_focalIdentityHeader_usesPlainButton_notBareTapGesture() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalIdentityHeader.swift"))
        XCTAssertTrue(stripped.contains("Button"), "FocalIdentityHeader.swift doit exposer un Button pour l'ouverture de profil")
        XCTAssertTrue(stripped.contains(".buttonStyle(.plain)"), "FocalIdentityHeader.swift doit utiliser Button(.plain)")
        XCTAssertFalse(stripped.contains(".onTapGesture"), "FocalIdentityHeader.swift ne doit pas utiliser .onTapGesture sur son contrôle")
    }

    // MARK: - « 1 rangée = 1 élément VoiceOver »

    func test_focalRow_combinesAccessibilityChildren() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalRow.swift"))
        XCTAssertTrue(stripped.contains(".accessibilityElement(children: .combine)"))
    }

    func test_focalRow_usesSharedAccessibilityLabelComposer() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalRow.swift"))
        XCTAssertTrue(
            stripped.contains("MessageAccessibilityLabelComposer.compose("),
            "FocalRow.swift doit réutiliser le composeur partagé (WS-1, F-080) — aucune seconde résolution du libellé VoiceOver"
        )
    }

    // MARK: - Le gate `.equatable()` ne se pose jamais sur `FocalRow` lui-même

    /// « Régression documentée du 2026-05-25 » (contrat §WS-4) : `FocalRow`
    /// ne doit PAS déclarer sa propre conformance `Equatable` — seule
    /// `EquatableFocalRow` (l'enveloppe) l'est.
    func test_focalRow_isNotItselfEquatable() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalRow.swift"))
        XCTAssertFalse(
            stripped.contains("struct FocalRow: View, Equatable") || stripped.contains("struct FocalRow: Equatable"),
            "FocalRow ne doit pas porter sa propre conformance Equatable — le gate vit sur EquatableFocalRow"
        )
        XCTAssertTrue(stripped.contains("struct EquatableFocalRow"), "EquatableFocalRow doit exister (même topologie que EquatableMessageBubble)")
        XCTAssertTrue(
            stripped.contains("lhs.row.input == rhs.row.input"),
            "EquatableFocalRow.== doit comparer row.input (FocalRowActions exclu, comme FocalRowInput l'exige)"
        )
    }

    // MARK: - Aucune police fixe (règle #9 du contrat, §8)

    func test_focalRow_neverUsesSystemFontDirectly() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalRow.swift"))
        XCTAssertFalse(stripped.contains(".font(.system(size:"))
    }

    // MARK: - Script = même rangée, zéro perspective conditionnelle

    /// « Densité uniforme » : `FocalRow` ne doit JAMAIS lire `input.density`
    /// pour brancher un effet visuel. RETRAIT FOCAL iOS (2026-08-18) : le
    /// pass de perspective est supprimé — une lecture de `input.density`
    /// dans `FocalRow.swift` serait un début de perspective conditionnelle
    /// réintroduite au mauvais endroit.
    func test_focalRow_neverReadsDensity_uniformRowRegardlessOfMode() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalRow.swift"))
        XCTAssertFalse(
            stripped.contains("input.density") || stripped.contains(".density"),
            "FocalRow.swift ne doit jamais brancher sur la densité — même rangée en Focal et en Script (contrat §3.1 usesFlatRow)"
        )
    }

    func test_focalRow_neverAppliesVisualEffectOrScaleConditionally() throws {
        let stripped = AppSourceGuard.stripComments(try source("FocalRow.swift"))
        XCTAssertFalse(stripped.contains(".visualEffect"), "aucune perspective — le pass est retiré (2026-08-18), rien ne doit en repousser dans la rangée")
        XCTAssertFalse(stripped.contains(".scaleEffect"), "aucune échelle conditionnelle dans FocalRow — la rangée Script est plate par construction")
    }
}

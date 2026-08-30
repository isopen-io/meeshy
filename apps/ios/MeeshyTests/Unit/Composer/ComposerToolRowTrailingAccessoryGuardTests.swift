import XCTest
@testable import Meeshy

/// **Revue Opus 2026-08-27 — la capsule de langue chevauchait la bande de
/// mentions (#3904), rejouant #3903 au coin opposé.**
///
/// Cause : `documentLanguageCapsule` était posée en `.overlay(alignment:
/// .bottomTrailing)` sur TOUTE `ComposerDocumentSurface`, sur la promesse que
/// `toolRow` restait « la seule ligne peinte au bas de la surface ». #3904 a
/// rendu cette promesse fausse — `ComposerMentionStrip` peut désormais
/// s'afficher SOUS `toolRow` dans le même `VStack` — et l'overlay recouvrait
/// alors la moitié de la bande, la rendant intappable sur cette zone.
///
/// Même correctif que #3903, à l'autre bout du `HStack` : la capsule voyage
/// désormais par `toolRowTrailingAccessory`, un slot rendu DANS la
/// disposition de `toolRow` — un enfant du flux ne chevauche jamais ce qui se
/// peint plus bas dans le `VStack` parent, quel que soit son contenu. Même
/// patron de garde par la SOURCE que `ComposerToolRowLeadingAccessoryGuardTests`
/// (R5/R15, pas de UIKit réel).
final class ComposerToolRowTrailingAccessoryGuardTests: XCTestCase {

    private func surfaceSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerSurfaceSource())
    }

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func surfaceURL() -> URL {
        composerRoot().appendingPathComponent("ComposerDocumentSurface.swift")
    }


    private func composerRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer")
    }

    private func body(of anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }

    func test_composerDocumentSurface_declaresATypedTrailingAccessoryProperty() throws {
        let source = try surfaceSource()
        XCTAssertTrue(
            source.contains("var toolRowTrailingAccessory: AnyView? = nil"),
            "`ComposerDocumentSurface` doit déclarer `toolRowTrailingAccessory` comme propriété stockée."
        )
    }

    func test_toolRow_rendersTrailingAccessoryInsideTheSameHStackAsTheIcons() throws {
        let source = try surfaceSource()
        guard let toolRow = body(of: "private var toolRow: some View {", in: source) else {
            return XCTFail("`toolRow` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            toolRow.contains("toolRowTrailingAccessory"),
            "`toolRow` ne rend plus `toolRowTrailingAccessory` : la capsule de langue redeviendrait un "
                + "overlay séparé — la source même du chevauchement corrigé par la revue Opus 2026-08-27."
        )
        // **Ancre corrigée au #4032 : elle épinglait un MÉCANISME, pas
        // l'invariant.** Elle cherchait le littéral `Spacer()` — devenu
        // `Spacer(minLength: 8)`, puis supprimé quand la rangée est passée en
        // `ScrollView` (le contenu défilant prend la largeur, l'accessoire est
        // poussé en queue sans qu'aucun ressort ne soit nécessaire). La garde
        // rougissait donc sur une refonte qui ne violait rien de ce qu'elle
        // protège.
        //
        // Ce qu'elle protège VRAIMENT — et qui n'a pas bougé — c'est que
        // l'accessoire de queue est un ENFANT de la rangée, jamais un overlay
        // posé par-dessus : deux enfants d'un `HStack` ne se superposent jamais,
        // par construction, et c'est ce qui a corrigé le chevauchement mesuré.
        guard let toolsRange = toolRow.range(of: "ForEach(tools"),
              let accessoryRange = toolRow.range(
                of: "toolRowTrailingAccessory", range: toolsRange.upperBound..<toolRow.endIndex
              ) else {
            return XCTFail("Structure de `toolRow` inattendue — les outils ou l'accessoire sont introuvables.")
        }
        XCTAssertTrue(
            toolsRange.lowerBound < accessoryRange.lowerBound,
            "`toolRowTrailingAccessory` doit venir APRÈS les outils : c'est le slot de QUEUE de la rangée."
        )
    }

    // MARK: - #4032 — la rangée DÉFILE, et son occultation est celle du plateau

    /// **Le besoin est MESURÉ, pas supposé.** À `accessibility-XXXL`, la rangée
    /// statique occupait 630 pt sur un écran de 402, calée à x = −114 : coupée
    /// des DEUX côtés, avec des outils qu'aucun geste n'atteignait. Après ce
    /// lot : x = 16, largeur 370.
    func test_toolRow_defileHorizontalement() throws {
        let source = try surfaceSource()
        guard let toolRow = body(of: "private var toolRow: some View {", in: source) else {
            return XCTFail("`toolRow` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            toolRow.contains("ScrollView(.horizontal, showsIndicators: false)"),
            "Les outils doivent DÉFILER : statiques, ils sortent de l'écran aux grandes tailles de texte, "
                + "et rien ne permet alors de les atteindre."
        )
        guard let scrollRange = toolRow.range(of: "ScrollView(.horizontal"),
              let accessoryRange = toolRow.range(of: "toolRowTrailingAccessory",
                                                 range: scrollRange.upperBound..<toolRow.endIndex) else {
            return XCTFail("Le défilement ou l'accessoire sont introuvables.")
        }
        XCTAssertTrue(
            scrollRange.lowerBound < accessoryRange.lowerBound,
            "Le drapeau reste FIXE : il vit HORS du `ScrollView`, sinon il défilerait avec les outils."
        )
    }

    /// **Le retour porteur du 2026-08-27, rendu MÉCANIQUE.**
    ///
    /// La rangée fut déjà scrollable, et fut annulée : le fond noir sous le
    /// drapeau ne matchait pas le plateau navy. Le retour ne condamnait pas le
    /// défilement — il condamnait un fond CODÉ EN DUR, et posait la condition de
    /// retour en toutes lettres : « un fond d'occultation ALIGNÉ sur la teinte
    /// du plateau ». Cette garde interdit que la condition se reperde.
    func test_lOccultationDuDrapeau_estPeinteDeLaTeinteDuPlateau_jamaisEnDur() throws {
        let source = try surfaceSource()
        guard let toolRow = body(of: "private var toolRow: some View {", in: source) else {
            return XCTFail("`toolRow` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            toolRow.contains("plateauTint.opacity(0), plateauTint"),
            "L'occultation doit aller de la teinte TRANSPARENTE à la teinte PLEINE du plateau — elle est "
                + "alors invisible tant que rien ne passe dessous, et se fond quand un outil y glisse."
        )
        for interdit in ["Color.black", ".black", "Color(hex:", "MeeshyColors.plateauNoir",
                        "MeeshyColors.indigo950", "MeeshyColors.violet950"] {
            XCTAssertFalse(
                toolRow.contains(interdit),
                "`toolRow` peint « \(interdit) » : c'est un fond CODÉ EN DUR, exactement ce que le retour "
                    + "porteur du 2026-08-27 a rejeté. La teinte vient du meuble, qui peint déjà l'écran."
            )
        }
    }

    /// Le fusible : la surface DOIT recevoir la teinte, sinon l'occultation se
    /// peint en `.clear` — invisible, donc inoffensive, mais la garde ci-dessus
    /// passerait au vert sur un dégradé qui n'occulte rien.
    func test_leMeuble_passeSaTeinteALaSurface() throws {
        let source = try hostSource()
        guard let block = body(of: "var documentSurface: some View {", in: source) else {
            return XCTFail("`documentSurface` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            block.contains("plateauTint: tint.color"),
            "Le meuble doit passer SA teinte : c'est lui qui peint l'écran, et la re-choisir dans la "
                + "surface est ce que le retour porteur a rejeté."
        )
    }

    func test_toolRow_showsWhenOnlyAnAccessoryIsPresent_evenWithNoTools() throws {
        let source = try surfaceSource()
        guard let toolRow = body(of: "private var toolRow: some View {", in: source) else {
            return XCTFail("`toolRow` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            toolRow.contains("toolRowLeadingAccessory != nil || toolRowTrailingAccessory != nil"),
            "La condition qui montre `toolRow` doit couvrir les DEUX accessoires en plus de `!tools.isEmpty` — "
                + "sinon une rangée d'outils vide ferait aussi disparaître silencieusement le chip de lieu ET "
                + "la capsule de langue, qui ne dépendent d'aucun des deux de `tools`."
        )
    }

    func test_host_documentSurface_noLongerOverlaysTheLanguageCapsuleOnTheWholeSurface() throws {
        let source = try hostSource()
        guard let block = body(of: "var documentSurface: some View {", in: source) else {
            return XCTFail("`documentSurface` introuvable dans le meuble — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(
            block.contains(".overlay(alignment: .bottomTrailing)"),
            "`documentSurface` pose encore un `.overlay(alignment: .bottomTrailing)` — c'est exactement la "
                + "cause du chevauchement avec la bande de mentions. La capsule de langue doit désormais "
                + "voyager par l'argument `toolRowTrailingAccessory:` de `ComposerDocumentSurface(`."
        )
        XCTAssertTrue(
            block.contains("toolRowTrailingAccessory:"),
            "`documentSurface` doit passer `toolRowTrailingAccessory:` à `ComposerDocumentSurface(` — sans "
                + "cela la capsule de langue n'est plus affichée du tout."
        )
        XCTAssertTrue(
            block.contains("documentLanguageCapsule"),
            "`documentLanguageCapsule` doit toujours être construite quelque part dans `documentSurface` — "
                + "seul son point d'attache dans la disposition change."
        )
    }
}

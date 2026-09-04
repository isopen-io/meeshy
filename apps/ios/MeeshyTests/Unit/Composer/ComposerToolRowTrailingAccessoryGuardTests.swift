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
        //
        // **L'ancre `ForEach(tools` est tombée en DEUX temps, et la garde était
        // ROUGE entre les deux.**
        //
        // 1. #5082 (2026-09-04) a sorti les sept outils de cette rangée pour les
        //    ranger en COLONNE sous l'avatar — « ainsi ce restera toujours à
        //    gauche comme pour le cas des Story et Reel ». `ForEach(tools`
        //    n'était plus dans `toolRow`, et ce `guard` échouait : mesuré rouge
        //    à HEAD, avant ce lot.
        // 2. #5137 (le même jour) en a sorti la capsule de langue.
        //
        // > Une ancre qui nomme un VOISIN meurt quand le voisin déménage — même
        // > si l'invariant, lui, tient toujours. La garde ne rougissait pas sur
        // > une violation : elle rougissait sur son propre point de repère.
        //
        // L'invariant survit aux deux déménagements et se dit sans voisin : ce
        // que la rangée rend, elle le rend DANS son `HStack`. Le sens de
        // l'ordre (« slot de QUEUE ») est porté par la structure elle-même —
        // `toolRowTrailingAccessory` est le dernier enfant du `HStack`, après le
        // `ScrollView` qui prend toute la largeur.
        guard let hstack = toolRow.range(of: "HStack(spacing: 16) {"),
              let scroll = toolRow.range(of: "ScrollView(.horizontal",
                                         range: hstack.upperBound..<toolRow.endIndex),
              let accessoire = toolRow.range(of: "toolRowTrailingAccessory",
                                             range: scroll.upperBound..<toolRow.endIndex)
        else {
            return XCTFail("Structure de `toolRow` inattendue — le `HStack`, son `ScrollView` ou "
                            + "l'accessoire de queue sont introuvables.")
        }
        XCTAssertLessThan(
            scroll.lowerBound, accessoire.lowerBound,
            "`toolRowTrailingAccessory` doit venir APRÈS le contenu défilant : c'est le slot de QUEUE."
        )
        XCTAssertFalse(
            toolRow.contains(".overlay("),
            "La rangée ne pose AUCUN overlay : c'est un overlay qui avait produit le chevauchement "
                + "de #3904, et le remède fut d'en faire un enfant du flux."
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

    /// **RETOURNÉE au #5137** (directive porteur 2026-09-04 : « Du coup enlever
    /// cela de la ligne canonique ! »).
    ///
    /// Ce que cette garde protégeait — « la capsule ne se pose plus en
    /// `.overlay` sur toute la surface » — reste vrai et reste gardé. Ce qu'elle
    /// affirmait EN PLUS est révoqué : elle exigeait que la capsule voyage par
    /// `toolRowTrailingAccessory:`, c'est-à-dire en queue de la RANGÉE
    /// canonique. Cette place n'a jamais été choisie pour son sens — elle a été
    /// choisie au #3904 pour fuir un chevauchement.
    ///
    /// > Une place choisie pour éviter un défaut n'est pas la place JUSTE, et
    /// > rien ne rougit quand on la garde. La garde qui l'épingle SCELLE le
    /// > provisoire.
    ///
    /// La troisième assertion aurait survécu au déménagement **sans rien
    /// mesurer** : `documentLanguageCapsule` est bien encore construite dans
    /// `documentSurface`, à un autre argument. Elle est donc remplacée par une
    /// garde qui nomme la destination.
    func test_host_documentSurface_noLongerOverlaysTheLanguageCapsuleOnTheWholeSurface() throws {
        let source = try hostSource()
        guard let block = body(of: "var documentSurface: some View {", in: source) else {
            return XCTFail("`documentSurface` introuvable dans le meuble — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(
            block.contains(".overlay(alignment: .bottomTrailing)"),
            "`documentSurface` pose encore un `.overlay(alignment: .bottomTrailing)` — c'est exactement la "
                + "cause du chevauchement avec la bande de mentions (#3904). La capsule doit rester un "
                + "ENFANT DU FLUX, quel que soit l'argument qui la porte."
        )
        XCTAssertTrue(
            block.contains("contentLanguageAccessory: AnyView(documentLanguageCapsule)"),
            "La capsule de langue doit voyager par `contentLanguageAccessory:` — au PIED du champ de "
                + "contenu qu'elle qualifie (#5137), la place qu'elle occupe déjà sur la scène "
                + "au-dessus de la coche du calque de description."
        )
        XCTAssertFalse(
            block.contains("toolRowTrailingAccessory: AnyView(documentLanguageCapsule)"),
            "La capsule a QUITTÉ la rangée canonique (#5137) : cette rangée porte ce qu'on ATTACHE à un "
                + "texte, la langue le QUALIFIE."
        )
        XCTAssertTrue(
            block.contains("toolRowTrailingAccessory:"),
            "Le slot RESTE — vide — avec son jumeau de tête : c'est lui qui tient l'invariant "
                + "anti-chevauchement de #3903/#3904 pour tout futur accessoire de rangée."
        )
    }
}

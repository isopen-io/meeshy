import XCTest
import CoreGraphics
@testable import Meeshy

/// **La barre de réactions d'une story possède son glissé horizontal** (#6083,
/// directive porteur 2026-09-11 : « permettre de swiper gauche-droite dans la
/// liste des emojis sans swiper de story — le composant doit capturer le
/// geste »).
///
/// Deux moitiés, gardées ici ensemble parce qu'elles ne valent rien séparément :
///  1. la LOI — qui possède un glissé, selon sa seule direction. Pure, jouable
///     en XCTest, contrairement au `some Gesture` qu'elle pilote ;
///  2. le SITE — que la loi soit effectivement consultée par la barre de la
///     story, et que le lecteur lui cède quand elle revendique. Une loi juste
///     qu'aucun geste n'appelle ne change rien à l'écran.
///
/// La garde du site épingle au passage l'habillage de la barre (échelle 2, sans
/// capsule) : c'est le même arbitrage porteur, et le rendre au site est la seule
/// preuve que la barre commandée est celle qui se monte.
final class StoryReactionStripGestureTests: XCTestCase {

    // MARK: - 1 · La loi

    func test_unGlisseHorizontal_appartientALaBarre() {
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: 40, height: 0)), .strip)
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: -40, height: 0)), .strip,
                       "Le sens ne change rien : parcourir les émojis vers la gauche est le geste NOMINAL.")
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: 120, height: 6)), .strip)
    }

    func test_unGlisseVertical_resteAuLecteur() {
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: 0, height: 60)), .story,
                       "Le glissé bas doit continuer de refermer — c'est le seul moyen de sortir.")
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: 0, height: -60)), .story)
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: 5, height: 60)), .story)
    }

    func test_uneDiagonale_vaAuPlusLongDesDeuxAxes() {
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: 50, height: 30)), .strip,
                       "Diagonale penchée horizontale ⇒ la barre.")
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: 30, height: 50)), .story,
                       "Diagonale penchée verticale ⇒ le lecteur.")
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: -50, height: 30)), .strip)
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: -30, height: -50)), .story)
    }

    /// L'ex æquo parfait revient au LECTEUR : le glissé vertical est le seul
    /// chemin de sortie, il ne se perd pas sur une égalité.
    func test_lExAequo_revientAuLecteur() {
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: 40, height: 40)), .story)
        XCTAssertEqual(StoryReactionStripGesture.owner(translation: CGSize(width: -40, height: 40)), .story)
    }

    /// Sous le seuil, personne ne revendique : un tap sur une tuile d'émoji
    /// dérive de deux ou trois points et doit rester un TAP.
    func test_sousLeSeuil_riennEstRevendique() {
        for course in stride(from: CGFloat(0), to: StoryReactionStripGesture.horizontalClaimDistance, by: 1) {
            XCTAssertEqual(
                StoryReactionStripGesture.owner(translation: CGSize(width: course, height: 0)), .story,
                "\(course) pt de course horizontale ne doit rien revendiquer (seuil = \(StoryReactionStripGesture.horizontalClaimDistance) pt)."
            )
        }
        XCTAssertEqual(
            StoryReactionStripGesture.owner(translation: CGSize(width: StoryReactionStripGesture.horizontalClaimDistance, height: 0)),
            .strip,
            "AU seuil exact, la barre revendique — la borne est inclusive."
        )
    }

    /// **Le seuil doit tomber AVANT que le lecteur ne s'éveille.** C'est la
    /// raison d'être du chiffre : le parent exige 15 pt (`minimumDistance: 15`)
    /// pour son premier `onChanged`. Un seuil au-dessus laisserait la story
    /// commencer à translater avant que la barre ne dise quoi que ce soit.
    func test_leSeuil_tombeAvantLeReveilDuLecteur() throws {
        XCTAssertLessThan(StoryReactionStripGesture.horizontalClaimDistance, 15,
                          "Revendiquer APRÈS 15 pt laisserait le cube démarrer sous le doigt.")
        XCTAssertGreaterThan(StoryReactionStripGesture.horizontalClaimDistance, 4,
                             "Revendiquer trop tôt volerait le tap d'une tuile d'émoji.")

        let code = try contentSource()
        XCTAssertTrue(
            code.contains("DragGesture(minimumDistance: 15, coordinateSpace: .global)"),
            "La prémisse du seuil est le `minimumDistance: 15` du drag parent — si elle change, "
                + "ce seuil doit être rejugé, pas hérité en silence."
        )
    }

    // MARK: - 2 · Le site — la barre de la story

    /// Non-vacuité : le site existe là où les gardes regardent.
    func test_leSite_estBienLaOuLesGardesRegardent() throws {
        let code = try sidebarSource()
        XCTAssertNotNil(pickerCallSite(in: code),
                        "Le montage `EmojiReactionPicker(` sous le cœur est introuvable — "
                            + "les gardes suivantes ne mesureraient plus rien.")
    }

    /// L'ÉCHELLE A ÉTÉ RAMENÉE À 1,5 le 2026-09-11 au soir — « ×0,75, elles sont
    /// trop grosses » (directive porteur, sur capture). Le 2 de l'après-midi
    /// répondait à « agrandir la taille des emojis » ; le porteur a mesuré le
    /// résultat à l'écran et a corrigé son propre ordre.
    ///
    /// Cette garde épingle donc une DIRECTIVE, pas une implémentation : elle doit
    /// suivre la directive quand celle-ci change, et rougir quand c'est le CODE
    /// qui dérive. Le nom de la fonction porte l'échelle pour que le prochain
    /// lecteur ne cherche pas laquelle fait foi.
    func test_laBarreDeLaStory_estAlEchelleUnEtDemiEtSansHabillage() throws {
        let code = try sidebarSource()
        guard let site = pickerCallSite(in: code) else { return XCTFail("site introuvable") }
        let plat = compact(site)

        XCTAssertTrue(plat.contains("scale:1.5"),
                      "Échelle 1,5 — « ×0,75 » sur le 2 de la directive du 2026-09-11 après-midi.")
        XCTAssertFalse(plat.contains("scale:2,"),
                       "L'échelle 2 a été explicitement RETIRÉE : la barre était trop grosse à l'écran.")
        XCTAssertTrue(plat.contains("chrome:.none"),
                      "Sans capsule ni fond — « pas de contour ».")
        XCTAssertTrue(plat.contains("scrollable:true"),
                      "Même à 1,5 la rangée dépasse la largeur du viewer : elle DÉFILE, elle ne déborde pas.")
        XCTAssertTrue(plat.contains("onExpandFullPicker:"),
                      "Le « + » reste — il ouvre le sélecteur complet.")
        XCTAssertFalse(plat.contains(".fixedSize()"),
                       "`.fixedSize()` force la rangée à sa largeur NATURELLE : le ScrollView ne défilerait "
                           + "jamais et la barre sortirait de l'écran. Sa largeur doit être bornée.")
    }

    func test_laBarreDeLaStory_porteBienUnGesteSimultane() throws {
        let code = try sidebarSource()
        guard let site = pickerCallSite(in: code) else { return XCTFail("site introuvable") }
        let plat = compact(site)

        XCTAssertTrue(plat.contains(".simultaneousGesture(reactionStripDragGesture)"),
                      "Le geste de la barre est SIMULTANÉ : un `highPriorityGesture` préempterait le pan "
                          + "du ScrollView interne ET le tap des tuiles — la rangée ne défilerait plus, "
                          + "et réagir deviendrait impossible.")
        XCTAssertFalse(plat.contains(".highPriorityGesture("),
                       "Même raison : la priorité haute tue le défilement qu'on vient d'activer.")
    }

    func test_leGesteDeLaBarre_consulteLaLoiEtEcritSonVerdict() throws {
        let code = try sidebarSource()
        guard let geste = corps("private var reactionStripDragGesture: some Gesture {", dans: code) else {
            return XCTFail("`reactionStripDragGesture` introuvable — la barre ne revendique rien.")
        }
        let plat = compact(geste)

        XCTAssertTrue(plat.contains("StoryReactionStripGesture.owner("),
                      "La barre doit consulter la LOI — pas réécrire une comparaison d'axes sur place.")
        XCTAssertTrue(plat.contains("minimumDistance:StoryReactionStripGesture.horizontalClaimDistance"),
                      "Le seuil du geste EST celui de la loi : deux nombres écrits séparément divergeraient.")
        XCTAssertTrue(plat.contains("reactionStripOwnsDrag="),
                      "Le verdict doit être ÉCRIT quelque part que le drag parent puisse lire.")
        XCTAssertTrue(plat.contains(".onEnded{_inreactionStripOwnsDrag=false}"),
                      "La revendication ne vaut que pour LE geste en cours — elle se relâche à sa fin.")
    }

    // MARK: - 3 · Le site — la cession du lecteur

    func test_leLecteur_cedeQuandLaBarreRevendique() throws {
        let code = try contentSource()
        guard let corps = corps("var unifiedDragGesture: some Gesture {", dans: code) else {
            return XCTFail("`unifiedDragGesture` introuvable — la garde ne mesurerait rien.")
        }
        let plat = compact(corps)
        XCTAssertTrue(
            plat.contains("guard!reactionStripOwnsDragelse{return}"),
            "Sans cette sortie anticipée, le drag parent — monté en `.simultaneousGesture`, "
                + "donc impossible à subordonner par priorité — continue de paginer sous le doigt."
        )
    }

    /// **Le drapeau doit pouvoir se DÉCOLLER.** SwiftUI ne délivre pas
    /// `onEnded` quand un recognizer concurrent emporte la séquence — et un
    /// `UIScrollView` le fait. Un drapeau posé sans filet gèlerait la
    /// navigation pour le reste de la session.
    func test_leDrapeau_estPurgeParLeFiletAntiEtatCollant() throws {
        let code = try contentSource()
        guard let corps = corps("func resetGestureTracking() {", dans: code) else {
            return XCTFail("`resetGestureTracking` introuvable")
        }
        XCTAssertTrue(
            compact(corps).contains("reactionStripOwnsDrag=false"),
            "Le filet anti-état-collant doit purger ce drapeau comme il purge les autres "
                + "photographies de geste."
        )
    }

    // MARK: - Helpers

    private func iosRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Stories
            .deletingLastPathComponent()  // Features
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
    }

    private func sidebarSource() throws -> String {
        try strippedSource(at: "Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
    }

    private func contentSource() throws -> String {
        try strippedSource(at: "Meeshy/Features/Main/Views/StoryViewerView+Content.swift")
    }

    /// COMMENTAIRES RETIRÉS : une garde qui compte des occurrences dans un
    /// fichier commenté valide la documentation, pas le code — et ces deux
    /// fichiers-ci sont parmi les plus commentés du dépôt.
    private func strippedSource(at relativePath: String) throws -> String {
        let url = iosRoot().appendingPathComponent(relativePath)
        return Self.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Le montage de la barre sous le cœur : du `icon: "heart.fill"` jusqu'à la
    /// fin de son `.overlay(alignment: .trailing)`. Ancré sur le cœur pour ne
    /// jamais confondre avec un autre `EmojiReactionPicker` du dépôt.
    private func pickerCallSite(in code: String) -> String? {
        guard let coeur = code.range(of: "icon: \"heart.fill\""),
              let overlay = code.range(of: ".overlay(alignment: .trailing) {",
                                       range: coeur.upperBound..<code.endIndex),
              code.range(of: "EmojiReactionPicker(", range: overlay.upperBound..<code.endIndex) != nil,
              let corps = corps(".overlay(alignment: .trailing) {",
                                dans: String(code[coeur.upperBound...])) else { return nil }
        return corps
    }

    private func corps(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre),
              let ouvrante = code[debut.lowerBound...].firstIndex(of: "{") else { return nil }
        var profondeur = 0
        var resultat = ""
        var index = ouvrante
        while index < code.endIndex {
            let caractere = code[index]
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
            index = code.index(after: index)
        }
        return nil
    }

    private func compact(_ code: String) -> String {
        code.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\n", with: "")
            .replacingOccurrences(of: "\t", with: "")
    }

    private static func stripComments(_ source: String) -> String {
        enum Mode { case code, string, lineComment, blockComment }
        var mode: Mode = .code
        var result = ""
        var escaped = false
        var pending: Character?

        for character in source {
            switch mode {
            case .code:
                if let slash = pending {
                    pending = nil
                    if character == "/" { mode = .lineComment; continue }
                    if character == "*" { mode = .blockComment; continue }
                    result.append(slash)
                }
                if character == "/" { pending = "/"; continue }
                if character == "\"" { mode = .string }
                result.append(character)
            case .string:
                result.append(character)
                if escaped { escaped = false; continue }
                if character == "\\" { escaped = true; continue }
                if character == "\"" { mode = .code }
            case .lineComment:
                if character == "\n" { mode = .code; result.append(character) }
            case .blockComment:
                if let star = pending, star == "*", character == "/" {
                    pending = nil
                    mode = .code
                    continue
                }
                pending = character == "*" ? "*" : nil
                if character == "\n" { result.append(character) }
            }
        }
        if let slash = pending, mode == .code { result.append(slash) }
        return result
    }
}

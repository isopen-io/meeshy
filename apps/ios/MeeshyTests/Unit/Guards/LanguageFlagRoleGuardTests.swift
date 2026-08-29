import XCTest
import MeeshyUI
@testable import Meeshy

/// **Une garde bâtie sur les instances qu'on a trouvées généralise à ces
/// instances, pas au concept.**
///
/// #4248 a soldé huit copies du drapeau-contrôle et posé une garde qui interdit
/// leur FORME : le dessin du soulignement, les deux clés réservées, la cible
/// posée après son geste. Deux copies vivaient déjà ailleurs — les deux bandes
/// de `FocalRow` — et lui échappaient parce qu'elles **résolvaient le même
/// problème autrement** : l'état actif dit par l'opacité ou par un fond de
/// puce, l'étiquette tirée de `LanguageData` au lieu des clés réservées.
///
/// Celle-ci interroge donc le RÔLE, pas la forme. Deux rôles, deux règles :
///
/// 1. **Décider quel drapeau porte un code** — et quoi montrer quand la langue
///    est inconnue. La question avait CINQ réponses dans l'app (capitales, 🌐,
///    🎵, chaîne vide, `uppercased()`) ; elle en a une.
/// 2. **Nommer un drapeau à VoiceOver.** Un nom de langue nu — « Français » —
///    ressemble à une étiquette, pas à une action : c'est ce que le banc de
///    #4248 condamne mot pour mot, et c'est ce que les copies 9 et 10
///    servaient.
final class LanguageFlagRoleGuardTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy")
    }

    private static let sourceOfTruth = "LanguageFlagChip.swift"

    /// **Une exemption NOMMÉE, datée et motivée — jamais une regex discrètement
    /// étroite.** `ComposerLanguageFlag` garde sa table parce que les deux
    /// référentiels divergent sur UN code (`pt` : 🇵🇹 pour `LanguageDisplay`,
    /// 🇧🇷 pour `LanguageData`, ce dernier épinglé par le banc du composer).
    /// Trancher est une décision PRODUIT, qui a son issue. Le jour où elle
    /// tombe, cette ligne disparaît — et la garde le rappellera, puisqu'elle
    /// est ici, visible, plutôt que dissoute dans le motif recherché.
    private static let pendingProductDecision = ["ComposerModels.swift"]

    /// Un repli de drapeau posé à côté d'une lecture de table : le site REDÉCIDE
    /// ce que la source unique décide déjà.
    private static let secondAnswer = "?.flag ??"

    /// Nommer un contrôle par le NOM de la langue plutôt que par son action.
    private static let bareNameLabels = [
        "accessibilityLabel(LanguageData.info(",
        "accessibilityLabel(LanguageDisplay.from("
    ]

    // MARK: - Rôle 1 — une seule réponse à « quel drapeau, et sinon quoi ? »

    func test_aucunSiteNeRedecideDuDrapeauDUneLangue() throws {
        let violations = scan { line in
            line.contains(Self.secondAnswer) ? Self.secondAnswer : nil
        }
        XCTAssertTrue(
            violations.isEmpty,
            "Un repli de drapeau écrit à la main est une SECONDE réponse à une question qui "
            + "n'en a qu'une. La source unique lit les deux tables (41 + 78 langues) puis "
            + "replie sur le code en capitales — un site qui replie sur 🌐 rend un glyphe qui "
            + "ne distingue AUCUNE langue d'une autre. Passer par "
            + "`LanguageFlagChip.flag(for:)` :\n" + violations.joined(separator: "\n")
        )
    }

    // MARK: - Rôle 2 — un drapeau cliquable s'annonce comme une ACTION

    func test_aucunDrapeauNeSAnnoncePar_leNomNuDeSaLangue() throws {
        let violations = scan { line in
            Self.bareNameLabels.first(where: { line.contains($0) })
        }
        XCTAssertTrue(
            violations.isEmpty,
            "« Français » nomme une ÉTIQUETTE, pas une action : un lecteur VoiceOver ne sait "
            + "pas que l'appui va changer la langue lue. La source unique dit « Afficher en "
            + "Français » et porte l'état — `LanguageFlagChip`, ou "
            + "`.languageFlagAccessibility(code:isActive:)` pour un site qui garde son propre "
            + "dessin :\n" + violations.joined(separator: "\n")
        )
    }

    // MARK: - Bornes — le scanner voit ce qu'il interdit

    /// Sans elles, un vert ne distingue pas « rien à trouver » de « incapable de
    /// voir » (leçon 248i).
    func test_leScannerReconnaitLesDeuxRolesQuIlInterdit() {
        let redecide = #"        LanguageDisplay.from(code: x)?.flag ?? "🌐""#
        XCTAssertTrue(redecide.contains(Self.secondAnswer),
                      "la seconde réponse doit être vue")

        let nomNu = "            .accessibilityLabel(LanguageData.info(for: code)?.name ?? code)"
        XCTAssertTrue(Self.bareNameLabels.contains { nomNu.contains($0) },
                      "l'étiquette au nom nu doit être vue")

        let correctif = "            .languageFlagAccessibility(code: code, isActive: isActive)"
        XCTAssertFalse(correctif.contains(Self.secondAnswer),
                       "le correctif ne doit pas être pris pour la faute")
        XCTAssertFalse(Self.bareNameLabels.contains { correctif.contains($0) },
                       "le correctif ne doit pas être pris pour la faute")
    }

    private func scan(_ probe: (String) -> String?) -> [String] {
        guard let walker = FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        else { return [] }
        var found: [String] = []
        for case let file as URL in walker
        where file.pathExtension == "swift"
            && file.lastPathComponent != Self.sourceOfTruth
            && !Self.pendingProductDecision.contains(file.lastPathComponent) {
            let text = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            for (index, line) in text.components(separatedBy: .newlines).enumerated() {
                guard !line.trimmingCharacters(in: .whitespaces).hasPrefix("//") else { continue }
                if let hit = probe(line) {
                    found.append("\(file.lastPathComponent):\(index + 1)  \(hit)")
                }
            }
        }
        return found.sorted()
    }
}

/// Le COMPORTEMENT de la source unique enrichie — la moitié que la garde de
/// forme ne peut pas voir.
@MainActor
final class LanguageFlagVocabularyTests: XCTestCase {

    /// Le cœur du 252i. `FocalRow` lisait `LanguageData` (78 langues) ; router
    /// vers une source unique qui n'aurait lu que `LanguageDisplay` (41) aurait
    /// rendu « WO » là où la rangée montrait 🇸🇳 — silencieusement, pour
    /// 39 langues, et seulement chez les locuteurs concernés.
    ///
    /// **Une source unique doit être plus riche que la plus riche des copies
    /// qu'elle remplace, jamais leur intersection.**
    func test_flag_couvreLesLanguesQueSeuleLaSecondeTablePorte() {
        for code in ["wo", "yo", "ig", "fa", "ur", "ta", "sr", "rw", "zu"] {
            let rendered = LanguageFlagChip.flag(for: code)
            XCTAssertNotEqual(rendered, code.uppercased(),
                              "« \(code) » doit rendre un drapeau, pas son code — obtenu « \(rendered) »")
            XCTAssertNotEqual(rendered, "?", "« \(code) » ne doit pas replier sur « ? »")
        }
    }

    /// Le repli reste celui que #4248 a CHOISI — un code se lit, un globe non.
    func test_flag_replieSurLeCodeEnCapitales_jamaisSurUnGlobe() {
        let rendered = LanguageFlagChip.flag(for: "zz")
        XCTAssertEqual(rendered, "ZZ", "obtenu « \(rendered) »")
        XCTAssertFalse(rendered.contains("\u{1F310}"), "le globe ne dit rien d'une langue")
    }

    /// Les codes RÉGIONAUX sont servis sous leur base : c'est la normalisation
    /// que `ComposerLanguageFlag` faisait seul dans son coin et qui vit
    /// désormais dans la source unique, au bénéfice de ses dix appelants.
    func test_flag_sertUnCodeRegionalSousSaBase() {
        XCTAssertEqual(LanguageFlagChip.flag(for: "pt-BR"), LanguageFlagChip.flag(for: "pt"))
        XCTAssertEqual(LanguageFlagChip.flag(for: "en_US"), LanguageFlagChip.flag(for: "en"))
    }

    /// Ce que VoiceOver PRONONCE doit couvrir les 78 langues, pas les 41 :
    /// sans la seconde table, un lecteur wolof entendait « Afficher en WO ».
    func test_spokenName_couvreLesMemesLanguesQueLeDrapeau() {
        let spoken = LanguageFlagChip.spokenName(for: "wo")
        XCTAssertNotEqual(spoken, "WO", "obtenu « \(spoken) »")
    }
}

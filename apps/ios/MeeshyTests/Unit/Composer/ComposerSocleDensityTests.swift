import XCTest
import SwiftUI
@testable import Meeshy

/// **#4057 — le socle est une RANGÉE, et il cessait d'en être une.**
///
/// Ses deux zones nommées portent un pictogramme ET un mot. Aux paliers
/// d'accessibilité, le mot ne tient plus : mesuré au simulateur le 2026-08-28,
/// en allemand à `accessibility-XXXL`, « Veröffentlichen » se cassait en
/// syllabes EMPILÉES — « Ver- / öf- / fent- / li- » — et « Öffentlich » se
/// tronquait en « Öffe… ». Les deux zones se retrouvaient à 104 pt d'écart
/// VERTICAL : l'action terminale du composer était devenue une colonne de
/// fragments.
///
/// > La loi 5 dit « le socle ne bouge jamais ». Elle ne dit RIEN de ce qui
/// > arrive quand il ne TIENT plus — c'est une loi de position, pas de
/// > dimension. Ce lot lui ajoute la seconde moitié.
final class ComposerSocleDensityTests: XCTestCase {

    // MARK: - La règle

    /// Aux tailles ordinaires, le mot reste : c'est lui qui nomme l'action, et
    /// une icône seule se devine moins bien.
    func test_auxTaillesOrdinaires_leSocleMontreSesLibelles() {
        for taille: DynamicTypeSize in [.xSmall, .small, .medium, .large,
                                        .xLarge, .xxLarge, .xxxLarge] {
            XCTAssertTrue(
                ComposerSocleDensity.showsLabels(taille),
                "Le libellé doit rester à la taille \(taille) — il tient, et il nomme l'action."
            )
        }
    }

    /// **Le défaut mesuré.** Au-delà, le mot se casse en syllabes : on le retire
    /// plutôt que de le laisser se briser.
    func test_auxPaliersDAccessibilite_leSocleSeReduitAuxIcones() {
        for taille: DynamicTypeSize in [.accessibility1, .accessibility2, .accessibility3,
                                        .accessibility4, .accessibility5] {
            XCTAssertFalse(
                ComposerSocleDensity.showsLabels(taille),
                "À la taille \(taille) le libellé ne tient plus : il doit céder la place à son icône."
            )
        }
    }

    /// **Le seuil est celui du SYSTÈME, pas un palier choisi à la main.** Le
    /// recopier en dur le ferait diverger le jour où Apple en ajoute un.
    func test_leSeuil_estCeluiDuSysteme_jamaisUnPalierRecopie() {
        for taille in DynamicTypeSize.allCases {
            XCTAssertEqual(
                ComposerSocleDensity.showsLabels(taille), !taille.isAccessibilitySize,
                "La règle doit suivre `isAccessibilitySize` sur les \(DynamicTypeSize.allCases.count) "
                    + "paliers, sans exception écrite à la main."
            )
        }
    }

    // MARK: - Ce que la réduction ne touche PAS

    /// **Un contrôle qui perd son NOM en devenant compact** est le défaut que
    /// `StatusComposerView` a dû corriger, et que la flèche de publication évite
    /// déjà en refusant d'échanger son libellé contre un `ProgressView`. Retirer
    /// le `Text` prive le `Label` de sa source de nom : il doit donc être posé
    /// explicitement.
    func test_laFlecheDePublication_gardeSonNomAccessible_memeReduite() throws {
        let code = try hostSource()
        guard let bloc = corps(de: "var publishButton: some View {", dans: code) else {
            return XCTFail("`publishButton` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            bloc.contains("if socleShowsLabels"),
            "La flèche doit lire la règle de densité — sinon son mot se casse en syllabes."
        )
        XCTAssertTrue(
            bloc.contains(".accessibilityLabel(Text(\"composer.socle.publish\""),
            "Sans le `Text` visible, le nom accessible DOIT être posé à la main : un contrôle qui perd "
                + "son nom en devenant compact est inatteignable à Voice Control."
        )
    }

    /// La cible tactile ne rétrécit pas avec le mot : 44 pt est un plancher, pas
    /// une conséquence du contenu.
    ///
    /// **`moodHeaderPublishButton` (2026-08-28) rejoint la liste** : c'est la
    /// TROISIÈME zone qui lit la règle de densité, depuis que la flèche du
    /// mood a quitté le socle pour l'en-tête de sa propre surface.
    func test_lesDeuxZones_gardentUneCibleDeQuaranteQuatrePoints() throws {
        let code = try hostSource()
        for ancre in ["var publishButton: some View {",
                      "var moodHeaderPublishButton: some View {",
                      "var audienceChip: some View {",
                      "var soundChip: AnyView {"] {
            guard let bloc = corps(de: ancre, dans: code) else {
                return XCTFail("`\(ancre)` introuvable — la garde ne mesurerait rien.")
            }
            XCTAssertTrue(
                bloc.contains("minWidth: 44, minHeight: 44"),
                "\(ancre) doit garder un plancher de 44 pt : réduit à son icône, un contrôle sans plancher "
                    + "devient une cible de 20 pt."
            )
        }
    }

    /// Le fusible : les deux sites lisent la MÊME règle, jamais deux seuils.
    func test_lesDeuxZones_lisentLaMemeRegle() throws {
        let code = try hostSource()
        XCTAssertEqual(
            code.components(separatedBy: "ComposerSocleDensity.showsLabels").count - 1, 1,
            "La règle doit avoir UNE lecture (`socleShowsLabels`) : deux appels seraient deux seuils à "
                + "faire diverger, et l'un des deux se casserait en syllabes sans que rien ne le dise."
        )
        // QUATRE depuis le 2026-08-31 : la pastille bande-son a rejoint le
        // socle (#4071) et lit la même règle. Toujours UNE règle, un
        // consommateur de plus ne change pas le fusible — deux lectures
        // DIVERGENTES le feraient tomber ci-dessus, et c'est ce que ce test
        // mesure en premier.
        //
        // **Ce compte a failli être perdu en le SUPPRIMANT.** Ajouter la
        // pastille l'a fait rougir ; la première réaction a été d'effacer le
        // fichier plutôt que d'incrémenter le nombre — ce qui aurait laissé une
        // règle VIVANTE, à quatre sites, sans aucun témoin, et retiré du même
        // coup la garde des 44 pt qui a justement trouvé que la pastille n'en
        // avait pas. **Un cliquet qui rougit demande à être MIS À JOUR ; le
        // supprimer est la seule réponse qui coûte la protection.**
        XCTAssertEqual(
            code.components(separatedBy: "if socleShowsLabels").count - 1, 4,
            "…et exactement QUATRE consommateurs : l'audience, la pastille son, la flèche du socle "
                + "et celle de l'en-tête mood."
        )
    }

    // MARK: - Lecture de source

    private func hostSource() throws -> String {
        let brut = try AppSourceGuard.composerHostSource()
        XCTAssertGreaterThan(brut.count, 1000, "Source vide — la garde serait verte par omission.")
        return AppSourceGuard.stripComments(brut)
    }

    private func corps(de ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var resultat = ""
        for caractere in code[debut.lowerBound...] {
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
        }
        return nil
    }
}

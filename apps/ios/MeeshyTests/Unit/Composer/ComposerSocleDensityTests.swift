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
    /// **Re-ancrée le 2026-09-03 (#4995) sur le libellé PARTAGÉ.**
    ///
    /// Les deux flèches — socle et en-tête du mood — composaient chacune leur
    /// libellé, et cette garde ne mesurait que la première. Elles partagent
    /// désormais `publishCapsuleLabel` : la protection couvre les DEUX sites
    /// d'un seul coup, et le troisième test ci-dessous exige qu'aucune flèche
    /// ne compose le sien.
    func test_laFlecheDePublication_gardeSonNomAccessible_memeReduite() throws {
        let code = try hostSource()
        guard let libelle = corps(de: "var publishCapsuleLabel: some View {", dans: code) else {
            return XCTFail("`publishCapsuleLabel` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            libelle.contains("if socleShowsLabels"),
            "La flèche doit lire la règle de densité — sinon son mot se casse en syllabes."
        )
        guard let habillage = corps(de: "func publishCapsule<Contenu: View>(", dans: code) else {
            return XCTFail("`publishCapsule` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            habillage.contains(".accessibilityLabel(Text(\"composer.socle.publish\""),
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
        // **`soundChip` a quitté la liste avec la pastille** (#4669, directive
        // porteur 2026-09-01 : « on n'a plus besoin du bouton ajouter un son en
        // bas »). Le plancher de 44 pt qu'elle gardait n'a PAS disparu : il a
        // suivi le son jusqu'à la pastille de l'avatar, que
        // `ComposerAvatarSoundBadge` fait passer de 28 à 44 pt en devenant
        // bouton. Retirer l'ancre sans vérifier cela aurait rendu la protection
        // à un contrôle sans la lui redonner ailleurs.
        // **`publishCapsuleLabel` a remplacé les deux flèches le 2026-09-03**
        // (#4995) : elles ne composent plus leur libellé, elles le partagent.
        // Vérifier le plancher sur le site PARTAGÉ le tient pour les deux —
        // et l'assertion suivante interdit qu'une flèche s'en écarte, sans
        // quoi cette garde perdrait la moitié de sa portée en silence.
        for ancre in ["var publishCapsuleLabel: some View {",
                      "var audienceChip: some View {"] {
            guard let bloc = corps(de: ancre, dans: code) else {
                return XCTFail("`\(ancre)` introuvable — la garde ne mesurerait rien.")
            }
            XCTAssertTrue(
                bloc.contains("minWidth: 44, minHeight: 44"),
                "\(ancre) doit garder un plancher de 44 pt : réduit à son icône, un contrôle sans plancher "
                    + "devient une cible de 20 pt."
            )
        }
        for ancre in ["var publishButton: some View {",
                      "var moodHeaderPublishButton: some View {"] {
            guard let bloc = corps(de: ancre, dans: code) else {
                return XCTFail("`\(ancre)` introuvable — la garde ne mesurerait rien.")
            }
            XCTAssertTrue(
                bloc.contains("publishCapsuleLabel"),
                "\(ancre) doit MONTER le libellé partagé : en composer un second lui rendrait la "
                    + "possibilité de perdre son plancher de 44 pt sans qu'aucune garde le voie."
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
        // TROIS depuis le 2026-09-01 : la pastille bande-son a QUITTÉ le socle
        // (#4669) et emporté sa lecture. Elle avait été la quatrième le
        // 2026-08-31 (#4071). Toujours UNE règle — un consommateur de plus ou
        // de moins ne change pas le fusible, seules deux lectures DIVERGENTES
        // le feraient tomber ci-dessus, et c'est ce que ce test mesure en
        // premier.
        //
        // **Ce compte a failli être perdu en le SUPPRIMANT.** Ajouter la
        // pastille l'a fait rougir ; la première réaction a été d'effacer le
        // fichier plutôt que d'incrémenter le nombre — ce qui aurait laissé une
        // règle VIVANTE, à quatre sites, sans aucun témoin, et retiré du même
        // coup la garde des 44 pt qui a justement trouvé que la pastille n'en
        // avait pas. **Un cliquet qui rougit demande à être MIS À JOUR ; le
        // supprimer est la seule réponse qui coûte la protection.**
        // **DEUX depuis le 2026-09-03** (#4995) : les deux flèches partagent
        // `publishCapsuleLabel`, qui porte la lecture pour elles deux. Le
        // compte BAISSE et c'est un progrès, pas une perte — le test
        // ci-dessus exige que les deux flèches montent ce libellé, donc la
        // règle couvre toujours trois contrôles avec une lecture de moins.
        //
        // **Ce compte a failli être perdu en le SUPPRIMANT** lors d'un lot
        // précédent : un cliquet qui rougit demande à être MIS À JOUR ; le
        // supprimer est la seule réponse qui coûte la protection.
        XCTAssertEqual(
            code.components(separatedBy: "if socleShowsLabels").count - 1, 2,
            "…et exactement DEUX lectures : l'audience, et le libellé partagé des deux flèches."
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

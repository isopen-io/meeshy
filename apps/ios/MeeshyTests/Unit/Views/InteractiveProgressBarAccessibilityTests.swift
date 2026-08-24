import XCTest
import MeeshyUI
@testable import Meeshy

/// **Huit boutons dont le label est une FORME n'ont aucun nom accessible.**
///
/// La barre de progression de l'inscription rendait chaque étape par un
/// `Button` dont le contenu est un `RoundedRectangle`. VoiceOver annonçait
/// « bouton », huit fois de suite, sans rien d'autre — ce n'est pas un libellé
/// imparfait, c'est **l'absence de libellé** (forme aiguë de la famille 227i).
///
/// Et l'état de chaque étape — faite, en cours, à venir — ne tenait qu'à la
/// **couleur** (`accentColor` / `.opacity(0.6)` / `systemGray4`) et à **3 points
/// de hauteur** : jamais énoncer une information par la seule couleur
/// (WCAG 1.4.1).
@MainActor
final class InteractiveProgressBarAccessibilityTests: XCTestCase {

    // MARK: - Banc d'essai

    /// **`bundle` et `locale` vont par PAIRE**, et la 1ʳᵉ écriture de cette suite
    /// l'a appris à ses dépens : elle ne passait que le `locale` et laissait
    /// `bundle: .main`. Or le **bundle** choisit la TABLE de traduction ; le
    /// `locale` ne fait qu'appliquer ses règles à cette table. En CI (simulateur
    /// anglais), `positionLabel(…, locale: ar)` rendait donc
    /// « **Step ١ of ٨** » — chiffres arabes corrects, gabarit resté ANGLAIS.
    ///
    /// Le doc-comment de `PostStatAccessibility` énonce précisément ce piège, et
    /// celui d'`InteractiveProgressBar` le CITE. **Le connaître ne suffit pas :
    /// il faut l'appliquer au banc de test, pas seulement au code testé.**
    private func inLocale(_ code: String,
                          _ make: (Bundle, Locale) -> String) throws -> String {
        let path = try XCTUnwrap(
            Bundle.main.path(forResource: code, ofType: "lproj"),
            "localisation « \(code) » absente du bundle — régression de packaging"
        )
        return make(try XCTUnwrap(Bundle(path: path)), Locale(identifier: code))
    }

    private func position(_ step: RegistrationStep, in code: String) throws -> String {
        try inLocale(code) {
            InteractiveProgressBar.positionLabel(for: step, bundle: $0, locale: $1)
        }
    }

    private func state(_ step: RegistrationStep,
                       current: RegistrationStep,
                       in code: String) throws -> String {
        try inLocale(code) {
            InteractiveProgressBar.stateLabel(for: step, currentStep: current, bundle: $0, locale: $1)
        }
    }

    private func hint(in code: String) throws -> String {
        try inLocale(code) { InteractiveProgressBar.revisitHint(bundle: $0, locale: $1) }
    }

    /// `LocalizedNumber.exact` ne consulte **aucun catalogue** — c'est du
    /// formatage Foundation pur. Il ne prend donc qu'un `locale`, et c'est
    /// exactement pourquoi il n'est PAS concerné par le piège ci-dessus.
    private func number(_ value: Int, in code: String) -> String {
        LocalizedNumber.exact(value, locale: Locale(identifier: code))
    }

    // MARK: - Le nom : positionnel, jamais vide

    /// Le cœur du correctif : chaque étape a un nom.
    func test_everyStep_hasANonEmptyPositionLabel() throws {
        for step in RegistrationStep.allCases {
            let label = try position(step, in: "fr")
            XCTAssertFalse(
                label.trimmingCharacters(in: .whitespaces).isEmpty,
                "L'étape \(step) n'a aucun nom accessible."
            )
        }
    }

    /// Deux étapes ne doivent pas se dire pareil — un libellé qui ne distingue
    /// rien vaut l'absence de libellé.
    func test_distinctSteps_haveDistinctLabels() throws {
        let labels = try RegistrationStep.allCases.map { try position($0, in: "fr") }
        XCTAssertEqual(
            Set(labels).count, RegistrationStep.allCases.count,
            "Deux étapes partagent le même libellé : \(labels)"
        )
    }

    /// La position est 1-indexée pour un lecteur humain — `.pseudo`
    /// (rawValue 0) est « l'étape 1 ».
    ///
    /// L'assertion porte sur le RANG, pas sur l'absence d'un caractère : écrire
    /// `XCTAssertFalse(label.contains("0"))` pour dire « pas 0-indexé » casserait
    /// le jour où une 10ᵉ étape ferait apparaître un « 0 » dans le TOTAL — un
    /// faux rouge sur du code juste (leçon 272 : épingler une intention, jamais
    /// une graphie).
    func test_positionLabel_isOneIndexedAndCarriesTheTotal() throws {
        let steps = RegistrationStep.allCases
        let total = number(steps.count, in: "en")

        for (offset, step) in steps.enumerated() {
            let label = try position(step, in: "en")
            let rank = number(offset + 1, in: "en")
            XCTAssertTrue(
                label.contains(rank),
                "L'étape de rang \(offset + 1) doit s'annoncer « \(rank) » — obtenu « \(label) »."
            )
            XCTAssertTrue(
                label.contains(total),
                "Le libellé doit porter le TOTAL (\(total)) — obtenu « \(label) »."
            )
        }
    }

    /// Le piège d'`InterpolatedLocalizationSubstitutionTests` : si le type du
    /// placeholder au catalogue ne correspond pas à l'argument interpolé,
    /// l'utilisateur entend « Étape %1$@ sur %2$@ ».
    func test_positionLabel_substitutesBothNumbers() throws {
        let label = try position(.email, in: "fr")
        for specifier in ["%@", "%lld", "%1$", "%2$"] {
            XCTAssertFalse(
                label.contains(specifier),
                "« \(specifier) » survit brut dans « \(label) » : le placeholder du "
                + "catalogue ne correspond pas à l'argument interpolé."
            )
        }
    }

    // MARK: - L'état : en toutes lettres, jamais par la seule couleur

    func test_stateLabel_distinguishesCompletedCurrentAndUpcoming() throws {
        let current = RegistrationStep.email
        let completed = try state(.pseudo, current: current, in: "fr")
        let ongoing = try state(current, current: current, in: "fr")
        let upcoming = try state(.recap, current: current, in: "fr")

        XCTAssertEqual(
            Set([completed, ongoing, upcoming]).count, 3,
            "Les trois états doivent s'énoncer différemment — obtenus : "
            + "« \(completed) », « \(ongoing) », « \(upcoming) »."
        )
        for value in [completed, ongoing, upcoming] {
            XCTAssertFalse(
                value.trimmingCharacters(in: .whitespaces).isEmpty,
                "Un état ne peut pas être annoncé par une chaîne vide."
            )
        }
    }

    /// La frontière exacte : l'étape juste avant la courante est TERMINÉE, la
    /// courante est EN COURS. Un `<=` au lieu d'un `<` fondrait les deux et
    /// annoncerait « terminée » sur l'étape qu'on est en train de remplir.
    func test_stateLabel_boundaryBetweenCompletedAndCurrent() throws {
        let current = RegistrationStep.password
        XCTAssertNotEqual(
            try state(.identity, current: current, in: "fr"),
            try state(current, current: current, in: "fr"),
            "L'étape précédente et l'étape courante ne peuvent pas partager le même état."
        )
    }

    /// Toutes les étapes après la courante partagent le MÊME état — c'est ce qui
    /// distingue « à venir » d'un rang.
    func test_stateLabel_everyUpcomingStepSharesTheSameState() throws {
        let current = RegistrationStep.phone
        let upcoming = try RegistrationStep.allCases
            .filter { $0.rawValue > current.rawValue }
            .map { try state($0, current: current, in: "fr") }
        XCTAssertEqual(Set(upcoming).count, 1, "Les étapes à venir doivent toutes s'annoncer pareil.")
    }

    // MARK: - Localisation

    /// Les libellés viennent du catalogue, pas d'une chaîne gravée : deux tables
    /// doivent rendre deux textes différents. Aucune chaîne n'est nommée — c'est
    /// la VARIANCE qui prouve que le catalogue est consulté.
    func test_labels_followTheReadersLocale() throws {
        XCTAssertNotEqual(try position(.pseudo, in: "fr"), try position(.pseudo, in: "en"))
        XCTAssertNotEqual(
            try state(.pseudo, current: .email, in: "fr"),
            try state(.pseudo, current: .email, in: "en")
        )
    }

    /// L'arabe s'écrit en chiffres arabo-indiens (règle de 241i) : la position
    /// d'une étape n'y fait pas exception. Le gabarit ARABE est exigé en même
    /// temps — c'est précisément ce que la 1ʳᵉ version de ce test ratait.
    func test_positionLabel_arabicUsesItsOwnDigits() throws {
        let label = try position(.pseudo, in: "ar")
        XCTAssertFalse(
            label.contains("1"),
            "En arabe, la position ne doit pas s'écrire en chiffres latins — obtenu « \(label) »."
        )
        XCTAssertNotEqual(
            label, try position(.pseudo, in: "en"),
            "Le gabarit arabe doit différer de l'anglais — obtenu « \(label) »."
        )
    }

    func test_revisitHint_isLocalizedAndNonEmpty() throws {
        XCTAssertFalse(try hint(in: "fr").isEmpty)
        XCTAssertNotEqual(try hint(in: "fr"), try hint(in: "en"))
    }
}

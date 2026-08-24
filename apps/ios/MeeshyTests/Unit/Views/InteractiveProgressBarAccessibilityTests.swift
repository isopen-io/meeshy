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
///
/// Les libellés sont testés à travers des fonctions statiques paramétrées, et
/// non en rendant la vue : `bundle` et `locale` vont par PAIRE (idiome
/// `PostStatAccessibility`), sans quoi la suite jugerait la locale du
/// SIMULATEUR — verte en local, rouge en CI.
@MainActor
final class InteractiveProgressBarAccessibilityTests: XCTestCase {

    private let french = Locale(identifier: "fr_FR")
    private let english = Locale(identifier: "en_US")
    private let arabic = Locale(identifier: "ar_SA")

    // MARK: - Le nom : positionnel, jamais vide

    /// Le cœur du correctif : chaque étape a un nom, et ce nom porte sa position.
    func test_everyStep_hasANonEmptyPositionLabel() {
        for step in RegistrationStep.allCases {
            let label = InteractiveProgressBar.positionLabel(for: step, locale: french)
            XCTAssertFalse(
                label.trimmingCharacters(in: .whitespaces).isEmpty,
                "L'étape \(step) n'a aucun nom accessible."
            )
        }
    }

    /// Deux étapes différentes ne doivent pas se dire pareil — sans quoi le
    /// libellé ne distinguerait rien, ce qui vaut l'absence de libellé.
    func test_distinctSteps_haveDistinctLabels() {
        let labels = RegistrationStep.allCases.map {
            InteractiveProgressBar.positionLabel(for: $0, locale: french)
        }
        XCTAssertEqual(
            Set(labels).count, RegistrationStep.allCases.count,
            "Deux étapes partagent le même libellé : \(labels)"
        )
    }

    /// La position est 1-indexée pour un lecteur humain — l'étape `.pseudo`
    /// (rawValue 0) est « l'étape 1 », pas « l'étape 0 ».
    /// L'assertion porte sur le RANG, pas sur l'absence d'un caractère : écrire
    /// `XCTAssertFalse(label.contains("0"))` pour dire « pas 0-indexé » casserait
    /// le jour où une 10ᵉ étape ferait apparaître un « 0 » dans le TOTAL — un
    /// faux rouge sur du code juste (leçon 272 : épingler une intention, jamais
    /// une graphie).
    func test_positionLabel_isOneIndexedAndCarriesTheTotal() {
        let steps = RegistrationStep.allCases
        let total = LocalizedNumber.exact(steps.count, locale: english)

        for (offset, step) in steps.enumerated() {
            let label = InteractiveProgressBar.positionLabel(for: step, locale: english)
            let rank = LocalizedNumber.exact(offset + 1, locale: english)
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

    /// Le piège documenté par `InterpolatedLocalizationSubstitutionTests` : si le
    /// type du placeholder au catalogue ne correspond pas à l'argument interpolé,
    /// l'utilisateur entend « Étape %1$lld sur %2$lld ».
    func test_positionLabel_substitutesBothNumbers() {
        let label = InteractiveProgressBar.positionLabel(for: .email, locale: french)
        for specifier in ["%@", "%lld", "%1$", "%2$"] {
            XCTAssertFalse(
                label.contains(specifier),
                "« \(specifier) » survit brut dans « \(label) » : le placeholder du "
                + "catalogue ne correspond pas à l'argument interpolé."
            )
        }
    }

    // MARK: - L'état : en toutes lettres, jamais par la seule couleur

    func test_stateLabel_distinguishesCompletedCurrentAndUpcoming() {
        let current = RegistrationStep.email
        let completed = InteractiveProgressBar.stateLabel(for: .pseudo, currentStep: current, locale: french)
        let ongoing = InteractiveProgressBar.stateLabel(for: current, currentStep: current, locale: french)
        let upcoming = InteractiveProgressBar.stateLabel(for: .recap, currentStep: current, locale: french)

        XCTAssertEqual(Set([completed, ongoing, upcoming]).count, 3,
                       "Les trois états doivent s'énoncer différemment — obtenus : "
                       + "« \(completed) », « \(ongoing) », « \(upcoming) ».")
        for value in [completed, ongoing, upcoming] {
            XCTAssertFalse(value.trimmingCharacters(in: .whitespaces).isEmpty,
                           "Un état ne peut pas être annoncé par une chaîne vide.")
        }
    }

    /// La frontière exacte : l'étape juste avant la courante est TERMINÉE, la
    /// courante est EN COURS. Une comparaison `<=` au lieu de `<` fondrait les
    /// deux et ferait annoncer « terminée » sur l'étape qu'on est en train de
    /// remplir.
    func test_stateLabel_boundaryBetweenCompletedAndCurrent() {
        let current = RegistrationStep.password
        let justBefore = RegistrationStep.identity

        XCTAssertNotEqual(
            InteractiveProgressBar.stateLabel(for: justBefore, currentStep: current, locale: french),
            InteractiveProgressBar.stateLabel(for: current, currentStep: current, locale: french),
            "L'étape précédente et l'étape courante ne peuvent pas partager le même état."
        )
    }

    /// Toutes les étapes après la courante partagent le MÊME état — c'est ce qui
    /// distingue « à venir » d'un rang.
    func test_stateLabel_everyUpcomingStepSharesTheSameState() {
        let current = RegistrationStep.phone
        let upcoming = RegistrationStep.allCases
            .filter { $0.rawValue > current.rawValue }
            .map { InteractiveProgressBar.stateLabel(for: $0, currentStep: current, locale: french) }
        XCTAssertEqual(Set(upcoming).count, 1, "Les étapes à venir doivent toutes s'annoncer pareil.")
    }

    // MARK: - Localisation

    /// Les libellés viennent du catalogue, pas d'une chaîne gravée : deux locales
    /// doivent donc rendre deux textes différents. Aucune chaîne n'est nommée —
    /// c'est la VARIANCE qui prouve que le catalogue est consulté.
    func test_labels_followTheReadersLocale() {
        XCTAssertNotEqual(
            InteractiveProgressBar.positionLabel(for: .pseudo, locale: french),
            InteractiveProgressBar.positionLabel(for: .pseudo, locale: english)
        )
        XCTAssertNotEqual(
            InteractiveProgressBar.stateLabel(for: .pseudo, currentStep: .email, locale: french),
            InteractiveProgressBar.stateLabel(for: .pseudo, currentStep: .email, locale: english)
        )
    }

    /// L'arabe s'écrit en chiffres arabo-indiens (règle de 241i) : la position
    /// d'une étape ne fait pas exception.
    func test_positionLabel_arabicUsesItsOwnDigits() {
        let label = InteractiveProgressBar.positionLabel(for: .pseudo, locale: arabic)
        XCTAssertFalse(
            label.contains("1"),
            "En arabe, la position ne doit pas s'écrire en chiffres latins — obtenu « \(label) »."
        )
    }

    func test_revisitHint_isLocalizedAndNonEmpty() {
        XCTAssertFalse(InteractiveProgressBar.revisitHint(locale: french).isEmpty)
        XCTAssertNotEqual(
            InteractiveProgressBar.revisitHint(locale: french),
            InteractiveProgressBar.revisitHint(locale: english)
        )
    }
}

import XCTest
@testable import MeeshyUI

/// L'inscription iOS échouait en « Données invalides » côté gateway parce que
/// des étapes validées localement laissaient passer des valeurs que
/// `AuthSchemas.register` (packages/shared/utils/validation.ts) refuse.
/// Contrat produit : l'utilisateur qui atteint le récapitulatif est DÉJÀ
/// conforme au backend — chaque règle locale est le miroir exact de la règle
/// serveur.
@MainActor
final class RegistrationLocalValidationTests: XCTestCase {

    private func makeViewModel() -> RegistrationViewModel {
        RegistrationViewModel()
    }

    // MARK: - Names (miroir de personNamePatternSource)

    func test_isNameValidLocally_plainName_isValid() {
        XCTAssertTrue(makeViewModel().isNameValidLocally("Alice"))
    }

    func test_isNameValidLocally_typographicApostrophe_isValid() {
        // Le clavier iOS insère U+2019 par défaut (smart punctuation).
        XCTAssertTrue(makeViewModel().isNameValidLocally("N\u{2019}Diaye"))
    }

    func test_isNameValidLocally_straightApostrophe_isValid() {
        XCTAssertTrue(makeViewModel().isNameValidLocally("N'Diaye"))
    }

    func test_isNameValidLocally_modifierApostrophe_isValid() {
        XCTAssertTrue(makeViewModel().isNameValidLocally("Ma\u{02BC}lik"))
    }

    func test_isNameValidLocally_accentsAndCompoundNames_areValid() {
        let vm = makeViewModel()
        XCTAssertTrue(vm.isNameValidLocally("Jean-Claude"))
        XCTAssertTrue(vm.isNameValidLocally("de la Fontaine"))
        XCTAssertTrue(vm.isNameValidLocally("Émilie"))
        XCTAssertTrue(vm.isNameValidLocally("St. John"))
    }

    func test_isNameValidLocally_decomposedDiacritics_areValid() {
        // NFD : e + U+0301 (combining acute) — couvert par \p{M} côté serveur.
        XCTAssertTrue(makeViewModel().isNameValidLocally("Jose\u{0301}"))
    }

    func test_isNameValidLocally_digitsOnly_isInvalid() {
        XCTAssertFalse(makeViewModel().isNameValidLocally("123"))
    }

    func test_isNameValidLocally_forbiddenCharacters_areInvalid() {
        let vm = makeViewModel()
        XCTAssertFalse(vm.isNameValidLocally("Alice!"))
        XCTAssertFalse(vm.isNameValidLocally("Alice@meeshy"))
        XCTAssertFalse(vm.isNameValidLocally("Alice3"))
    }

    func test_isNameValidLocally_emptyOrTooLong_isInvalid() {
        let vm = makeViewModel()
        XCTAssertFalse(vm.isNameValidLocally(""))
        XCTAssertFalse(vm.isNameValidLocally("   "))
        XCTAssertFalse(vm.isNameValidLocally(String(repeating: "a", count: 51)))
    }

    // MARK: - Identity step gating

    func test_canProceed_identity_invalidName_blocksStep() {
        let vm = makeViewModel()
        vm.currentStep = .identity
        vm.firstName = "Alice3"
        vm.lastName = "Smith"
        XCTAssertFalse(vm.canProceed)
    }

    func test_canProceed_identity_typographicApostrophe_allowsStep() {
        let vm = makeViewModel()
        vm.currentStep = .identity
        vm.firstName = "Awa"
        vm.lastName = "N\u{2019}Diaye"
        XCTAssertTrue(vm.canProceed)
    }

    // MARK: - Field errors (affichage sous les champs)

    func test_nameFieldError_emptyField_hasNoError() {
        XCTAssertNil(makeViewModel().nameFieldError(""))
    }

    func test_nameFieldError_validName_hasNoError() {
        XCTAssertNil(makeViewModel().nameFieldError("Alice"))
    }

    func test_nameFieldError_invalidName_hasError() {
        XCTAssertNotNil(makeViewModel().nameFieldError("Alice3"))
    }

    // MARK: - Email (rapprochement du z.email serveur)

    func test_isEmailValidLocally_viaEmailStepGating() {
        let vm = makeViewModel()
        vm.currentStep = .email
        vm.emailAvailable = true

        vm.email = "alice@example.com"
        XCTAssertTrue(vm.canProceed)

        // « a@b » et « alice@com. » passaient l'ancien check (« contient @ et . »)
        // mais sont refusés par z.email côté serveur.
        vm.email = "a@b"
        XCTAssertFalse(vm.canProceed)
        vm.email = "alice@com."
        XCTAssertFalse(vm.canProceed)
        vm.email = "alice @example.com"
        XCTAssertFalse(vm.canProceed)
    }
}

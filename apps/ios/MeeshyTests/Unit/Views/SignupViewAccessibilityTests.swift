import XCTest
@testable import Meeshy

/// **Ce que l'écran d'inscription DOIT tenir, mesuré sur sa source.**
///
/// Six suites gardaient le wizard en huit étapes qu'il remplace (#5218) : les
/// haptiques du design system, la pastille de langue sélectionnée, les cibles
/// tactiles, la localisation des étapes, la case des CGU, la barre de
/// progression. Cinq de leurs sujets n'existent plus. Ce qui RESTE vrai — et qui
/// vaut pour n'importe quel écran de formulaire — est repris ici sur le nouvel
/// écran, plus deux règles qui lui sont propres et qui sont la RAISON du lot :
/// aucune attente artificielle, et aucune vérification réseau avant l'envoi.
///
/// Une garde de SOURCE et non de rendu : `SignupView` est un `View` SwiftUI que
/// l'on ne peut pas interroger sans hôte, et les propriétés visées (l'absence
/// d'un `asyncAfter`, le nombre d'haptiques) sont structurelles.
@MainActor
final class SignupViewAccessibilityTests: XCTestCase {

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Views
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private static let signupView = "Meeshy/Features/Auth/Signup/SignupView.swift"
    private static let signupViewModel = "Meeshy/Features/Auth/Signup/SignupViewModel.swift"
    private static let welcomeView = "Meeshy/Features/Main/Views/WelcomeView.swift"

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.appRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    /// Source privée de ses lignes de commentaire : l'ABSENCE d'une API ne doit
    /// pas être démentie par le commentaire qui explique pourquoi elle est
    /// absente — le mode de panne exact que ce lot a rencontré, ses doc-comments
    /// nommant `asyncAfter` et `debounce` pour dire qu'il n'y en a pas.
    private func code(_ relativePath: String) throws -> String {
        try source(relativePath)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        guard !needle.isEmpty else { return 0 }
        var count = 0
        var index = haystack.startIndex
        while let found = haystack.range(of: needle, range: index..<haystack.endIndex) {
            count += 1
            index = found.upperBound
        }
        return count
    }

    // MARK: - Aucune attente artificielle (la raison du lot)

    /// Le wizard s'accordait une seconde de félicitations entre le succès et
    /// l'entrée dans l'app (`DispatchQueue.main.asyncAfter(deadline: .now() + 1.0)`).
    /// Une pause posée sur un succès est une LENTEUR, donc un bug — pas un
    /// arbitrage de goût (`CLAUDE.md` § roadmap).
    func test_signup_neverDelaysTheUser() throws {
        for path in [Self.signupView, Self.signupViewModel, Self.welcomeView] {
            let body = try code(path)
            XCTAssertFalse(body.contains("asyncAfter"),
                           "\(path) : aucune pause ne se pose entre l'utilisateur et son compte")
            XCTAssertFalse(body.contains("Task.sleep"),
                           "\(path) : idem — une attente déguisée reste une attente")
            XCTAssertFalse(body.contains("debounce"),
                           "\(path) : le formulaire ne temporise rien, il n'interroge personne en frappant")
        }
    }

    /// **Aucun appel réseau ne précède l'envoi.** Le wizard en tenait trois, et
    /// depuis #4158 la passerelle ne répond plus « déjà pris » à un appelant
    /// anonyme : ils coûtaient trois attentes pour zéro information.
    func test_signup_neverProbesAvailabilityBeforeSubmitting() throws {
        let body = try code(Self.signupViewModel) + code(Self.signupView)
        XCTAssertFalse(body.contains("checkAvailability"),
                       "l'écran ne sonde plus la disponibilité : c'est la soumission qui tranche")
        XCTAssertFalse(body.contains("checkPhoneOwnership"),
                       "idem pour le numéro — le conflit se découvre à l'envoi, en 200 typé")
    }

    // MARK: - Haptiques du design system

    /// Un `UIImpactFeedbackGenerator` alloué et détruit dans une seule
    /// expression n'est jamais chaud : chaque tap est un premier tap, et la
    /// taptic arrive tard ou pas du tout. `HapticFeedback` (MeeshyUI) garde ses
    /// générateurs en singletons `@MainActor` et appelle `prepare()` avant
    /// chaque événement — c'est la seule voie autorisée.
    func test_signupAndWelcome_routeEveryHapticThroughTheDesignSystem() throws {
        for path in [Self.signupView, Self.welcomeView] {
            let body = try code(path)
            XCTAssertFalse(body.contains("UIImpactFeedbackGenerator("),
                           "\(path) : générateur monté à la main — il ne sera jamais chaud")
            XCTAssertFalse(body.contains("UINotificationFeedbackGenerator("),
                           "\(path) : même raison")
        }
    }

    /// Le COMPTE, pas la seule présence : c'est ce qui rend « j'ai supprimé
    /// l'haptique au lieu de la faire converger » rouge.
    ///
    /// `SignupView` en porte sept — fermer, « Se connecter » sous l'e-mail,
    /// ouvrir le sélecteur de pays, ouvrir la feuille de langue, le pied
    /// « Déjà un compte ? », puis le succès et l'échec de l'envoi. Les deux
    /// derniers sont d'INTENSITÉS distinctes : un compte créé et un refus ne se
    /// sentent pas pareil, et c'est la seule information tactile de l'écran.
    func test_signupView_keepsItsSevenHaptics() throws {
        let body = try code(Self.signupView)
        XCTAssertEqual(occurrences(of: "HapticFeedback.", in: body), 7)
        XCTAssertTrue(body.contains("HapticFeedback.success()"),
                      "la création du compte se SENT — c'est le seul retour immédiat avant la bascule")
        XCTAssertTrue(body.contains("HapticFeedback.error()"),
                      "un refus aussi, et d'une autre intensité : les confondre annulerait l'information")
    }

    /// Deux boutons, deux haptiques, deux intensités : `medium` pour l'action
    /// principale (créer un compte), `light` pour la secondaire (se connecter).
    func test_welcomeView_distinguishesItsTwoButtonsByIntensity() throws {
        let body = try code(Self.welcomeView)
        XCTAssertEqual(occurrences(of: "HapticFeedback.", in: body), 2)
        XCTAssertTrue(body.contains("HapticFeedback.medium()"))
        XCTAssertTrue(body.contains("HapticFeedback.light()"))
    }

    // MARK: - La pastille de langue

    /// La pastille annonce un CHOIX en cours (« Vous lirez Meeshy en Français »)
    /// et l'ouvre au toucher. Sans `.isSelected`, VoiceOver la lit comme un
    /// bouton ordinaire : l'utilisateur entend l'action, jamais l'état — et
    /// c'est l'état qui porte le Prisme.
    func test_languageChip_announcesItsSelectedState() throws {
        let body = try code(Self.signupView)
        XCTAssertTrue(body.contains(".accessibilityAddTraits(.isSelected)"),
                      "la pastille de langue doit annoncer qu'elle porte une sélection")
        XCTAssertTrue(body.contains("accessibilityHint"),
                      "et dire ce que le toucher va faire — ouvrir le choix de langue")
    }

    /// Elle porte son propre libellé : sans `children: .ignore`, VoiceOver
    /// énumère le drapeau, la phrase et le mot « Changer » comme trois éléments.
    func test_languageChip_readsAsOneElement() throws {
        let body = try code(Self.signupView)
        XCTAssertTrue(body.contains(".accessibilityElement(children: .ignore)"))
    }

    // MARK: - Cibles tactiles

    /// Aucun contrôle de l'écran ne laisse son DESSIN faire sa cible. Les
    /// champs, le bouton pays et la pastille déclarent `minHeight: 48` ; les
    /// liens et les boutons de texte, `minHeight: 44` — le minimum de la HIG.
    /// La croix de fermeture passe par `meeshyTapTarget()`, qui pose 44×44
    /// autour d'un glyphe plus petit.
    func test_everyControl_declaresAHitRegionOfAtLeast44() throws {
        let body = try code(Self.signupView)
        XCTAssertTrue(body.contains("meeshyTapTarget()"),
                      "la croix de fermeture est un glyphe : sans cadre déclaré, sa cible EST son dessin")
        XCTAssertGreaterThanOrEqual(
            occurrences(of: "minHeight: 44", in: body), 4,
            "les boutons de texte (Se connecter ×2, conditions, confidentialité) portent chacun 44 pt"
        )
        XCTAssertFalse(body.contains("frame(height: 3"),
                       "aucun contrôle ne se laisse mesurer sous les 44 pt de la HIG")
    }

    /// La rangée du sélecteur de pays est une LISTE : chaque ligne doit être
    /// touchable sur 44 pt, et annoncer celle qui est retenue.
    func test_countrySheet_rowsAreTouchableAndAnnounceTheSelection() throws {
        let body = try code(Self.signupView)
        XCTAssertTrue(body.contains(".frame(minHeight: 44)"))
        XCTAssertTrue(body.contains("country.id == selection.id ? [.isSelected] : []"),
                      "le pays retenu doit s'entendre, pas seulement se voir")
    }

    // MARK: - Dynamic Type

    /// Aucune taille de police FIGÉE : l'écran neuf n'a pas de cadre fixe à
    /// protéger, donc pas d'exception à réclamer (doctrine 53i / 82i / 86i,
    /// mesurée par `FixedFontSizeGuardTests` sur tout le dépôt).
    func test_signupAndWelcome_haveNoFrozenFontSize() throws {
        for path in [Self.signupView, Self.welcomeView] {
            XCTAssertFalse(try code(path).contains(".font(.system(size:"),
                           "\(path) : une taille figée ignore Dynamic Type")
        }
    }

    // MARK: - Le refus se pose SOUS son champ

    /// Un message d'erreur muet ne corrige rien : VoiceOver doit le lire comme
    /// un texte à part entière, sous la saisie qu'il vise.
    func test_fieldErrors_areRenderedAsFootnotesWithTheirOwnLabel() throws {
        let body = try code(Self.signupView)
        XCTAssertTrue(body.contains(".font(.footnote)"),
                      "le refus se pose en `.footnote` sous son champ")
        XCTAssertTrue(body.contains(".accessibilityLabel(message)"),
                      "et il se LIT — un message d'erreur inaudible n'existe pas")
    }

    // MARK: - Le téléphone n'est pas annoncé facultatif

    /// Il n'est ni requis, ni présenté comme un choix : le NOMMER facultatif
    /// fait croire qu'il y a une décision à prendre. Vide, il est simplement
    /// absent de la charge.
    func test_phoneField_isNeverAnnouncedAsOptional() throws {
        let body = try code(Self.signupView)
        XCTAssertFalse(body.lowercased().contains("facultat"),
                       "aucun « facultatif » sur le champ téléphone")
        XCTAssertFalse(body.lowercased().contains("optionnel"),
                       "ni sa variante — le champ vide se suffit")

        // L'astérisque se cherche dans ce que l'utilisateur LIT, pas dans le
        // fichier : un `*` de code (multiplication, commentaire de bloc) n'a
        // jamais marqué un champ comme requis, et une règle qui le compterait
        // rougirait pour une raison qui n'est pas la sienne.
        let starred = Self.copyLiterals(in: body).filter { $0.contains("*") }
        XCTAssertTrue(
            starred.isEmpty,
            "un astérisque dans la copie marquerait implicitement les AUTRES champs comme "
            + "requis, alors qu'aucun ne l'annonce : \(starred)"
        )
    }

    /// Les `defaultValue:` du fichier — la copie que l'utilisateur lit.
    private static func copyLiterals(in code: String) -> [String] {
        var literals: [String] = []
        var rest = Substring(code)
        while let start = rest.range(of: "defaultValue: \"") {
            rest = rest[start.upperBound...]
            guard let end = rest.firstIndex(of: "\"") else { break }
            literals.append(String(rest[..<end]))
            rest = rest[end...]
        }
        return literals
    }
}

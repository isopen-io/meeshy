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
    /// Descendu dans MeeshyUI au #6644 : « Mot de passe oublié », qui vit dans le
    /// SDK, monte le même (i) — et le SDK ne peut pas importer l'app.
    private static let infoHint = "../../packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/AuthInfoHint.swift"

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
    /// `SignupView` en porte neuf — fermer, « Se connecter » sous l'e-mail,
    /// ouvrir le sélecteur de pays, ouvrir la feuille de langue, le pied
    /// « Déjà un compte ? », **ouvrir le bloc d'identité** et **retenir un
    /// pseudo de rechange** (#6479), puis le succès et l'échec de l'envoi. Les
    /// deux derniers sont d'INTENSITÉS distinctes : un compte créé et un refus
    /// ne se sentent pas pareil, et c'est la seule information tactile de l'écran.
    ///
    /// La dixième — **déplier un (i)** (#6441) — vit dans `AuthInfoHint` depuis
    /// que la connexion par e-mail monte le même (i) (#6626). Elle se compte
    /// là-bas : un (i) qui la perdrait la perdrait sur les DEUX écrans. Il en a
    /// une parce que ses deux voisins d'usage en ont une : ouvrir le sélecteur
    /// de pays et ouvrir la feuille de langue. Un contrôle qui RÉVÈLE quelque
    /// chose se sent, sur cet écran, depuis #5555.
    func test_signupView_keepsItsNineHaptics_andTheInfoHintCarriesTheTenth() throws {
        let body = try code(Self.signupView)
        XCTAssertEqual(occurrences(of: "HapticFeedback.", in: body), 9)
        XCTAssertEqual(occurrences(of: "HapticFeedback.", in: try code(Self.infoHint)), 1,
                       "déplier un (i) se sent — et UNE fois, dans le composant partagé")
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

    /// Le bloc source d'un champ — de sa déclaration au champ suivant.
    ///
    /// Le témoin ci-dessous lisait le FICHIER ENTIER. Il portait le nom du
    /// téléphone, sa documentation parlait du téléphone, et il assérait une
    /// propriété de tout l'écran : la première fois qu'un AUTRE champ a eu une
    /// bonne raison de se dire facultatif (#6424, le mot de passe), il a rougi
    /// pour un champ dont il ne parle pas. Une garde nommée pour une chose et
    /// mesurée sur une autre finit toujours par accuser la mauvaise.
    private func fieldBody(_ name: String, in code: String) throws -> String {
        let start = try XCTUnwrap(code.range(of: "private var \(name): some View {"),
                                  "champ `\(name)` introuvable dans SignupView")
        let rest = code[start.upperBound...]
        let end = rest.range(of: "\n    private var ") ?? rest.range(of: "\n    // MARK:")
        return String(end == nil ? rest : rest[..<end!.lowerBound])
    }

    /// Il n'est ni requis, ni présenté comme un choix : le NOMMER facultatif
    /// fait croire qu'il y a une décision à prendre. Vide, il est simplement
    /// absent de la charge.
    ///
    /// **La règle ne vaut PAS pour le mot de passe** (#6424), et la différence
    /// est de nature : un numéro absent ne change rien à ce qui suit, un mot de
    /// passe absent décide de la SEULE porte du compte. Il y a donc une
    /// décision à prendre, et la taire laisserait la personne l'ignorer — le
    /// témoin jumeau ci-dessous exige qu'elle soit dite.
    func test_phoneField_isNeverAnnouncedAsOptional() throws {
        let body = try code(Self.signupView)
        let phone = try fieldBody("phoneField", in: body)
        XCTAssertFalse(phone.lowercased().contains("facultat"),
                       "aucun « facultatif » sur le champ téléphone")
        XCTAssertFalse(phone.lowercased().contains("optionnel"),
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

    /// Le REVERS de la garde ci-dessus (#6441, retour porteur « récolter le
    /// téléphone serait bon »).
    ///
    /// Ne pas le dire facultatif empêche de le faire paraître sautable ; cela
    /// ne donne encore aucune RAISON de le remplir. Le seul levier honnête est
    /// de dire ce qu'il OUVRE — et les deux usages énoncés sont MESURÉS, pas
    /// promis : identifiant de connexion (`AuthService.ts:158`) et découverte
    /// par un contact qui l'a au carnet (`contacts-match.ts`).
    ///
    /// Sans ce témoin, la note disparaîtrait au premier remaniement d'écran
    /// sans que rien ne rougisse — un champ muet n'échoue jamais.
    func test_phoneField_statesWhatTheNumberUnlocks() throws {
        let body = try code(Self.signupView)
        XCTAssertTrue(body.contains("auth.signup.phone.benefit"),
                      "l'écran DOIT dire ce que le numéro ouvre")
        let phone = try fieldBody("phoneField", in: body)
        XCTAssertTrue(phone.contains("phoneHint"),
                      "et le champ téléphone DOIT le porter — un texte défini mais jamais monté n'informe personne")
    }

    // MARK: - Un détail REPLIÉ n'est pas un détail PERDU

    /// #6441, retour porteur « la page est trop surchargée ! mettez les (i)
    /// avec les détails ».
    ///
    /// Replier trois notes libère l'écran et fait courir UN risque précis :
    /// que le détail devienne inatteignable à qui ne voit pas le bouton. Ce
    /// témoin tient les trois pièces qui l'empêchent — sans elles, le
    /// dépliement serait la SEULE façon d'accéder au texte, et l'écran aurait
    /// troqué de la surcharge contre de l'inaccessibilité.
    ///
    /// La cible tactile compte double ici : le (i) vit DANS le cadre du champ,
    /// une rangée de 48 pt — `meeshyTapTarget()` y tient ses 44 pt sans ajouter
    /// la moindre hauteur, ce qui est exactement la raison de l'avoir mis là.
    func test_fieldHints_areReachableWithoutUnfolding() throws {
        let body = try code(Self.signupView)
        let hint = try code(Self.infoHint)

        // #8054 a porté libellé et détail dans `FieldBlockAccessibility`, pour
        // qu'un contenu à plusieurs éléments (mot de passe + œil) se libelle
        // lui-même. Le détail doit toujours y ARRIVER, et y être POSÉ.
        XCTAssertTrue(body.contains("FieldBlockAccessibility(label: label, hint: hint?.text ?? \"\", applies: labelsContent)"),
                      "le CHAMP porte le détail : VoiceOver l'énonce sans que le bouton soit trouvé")
        XCTAssertTrue(body.contains("content.accessibilityLabel(label).accessibilityHint(hint)"),
                      "le modificateur du bloc POSE le détail sur le champ")
        let callSites = body.components(separatedBy: "fieldBlock(").dropFirst()
            .map { $0.components(separatedBy: ") {").first ?? "" }
        XCTAssertTrue(callSites.contains { $0.contains("hint:") },
                      "au moins un champ du bloc porte un (i) — sinon ce témoin ne mesure rien")
        for call in callSites where call.contains("hint:") {
            XCTAssertFalse(call.contains("labelsContent: false"),
                           "un champ qui a un (i) ne peut pas se libeller seul : son détail ne serait plus énoncé")
        }
        XCTAssertTrue(hint.contains("accessibilityValue(hint.text)"),
                      "et le BOUTON le porte aussi — « en savoir plus » seul n'apprend rien")
        XCTAssertTrue(hint.contains("meeshyTapTarget()"),
                      "le (i) est un glyphe : sans cadre déclaré, sa cible EST son dessin")
        XCTAssertTrue(hint.contains("accessibilityLabel(hint.buttonLabel)"),
                      "trois (i) sur un écran ne se distinguent que par ce qu'ils ANNONCENT")
    }

    // MARK: - Le mot de passe dit sa conséquence, à la demande (#7897)

    /// Un compte peut naître sans mot de passe (#6424) : sa seule porte est
    /// alors le lien reçu par e-mail. Directive porteur 2026-09-25 : le dire
    /// « discrètement, moderne mais visible, à partir d'une ligne « Pourquoi
    /// mettre un mot de passe maintenant ? » qui se déplie ». Le libellé ne
    /// se dit plus « facultatif » (#6582, comme le web) : le bouton actif
    /// sans lui le prouve.
    func test_passwordField_explainsItsConsequence_throughAnUnfoldingLine() throws {
        let body = try code(Self.signupView)
        let password = try fieldBody("passwordField", in: body)

        XCTAssertFalse(password.lowercased().contains("facultatif"))
        XCTAssertTrue(body.contains("auth.signup.password.why.detail"),
                      "la conséquence de son absence DOIT être dite : la porte devient l'e-mail")
        XCTAssertTrue(password.contains("accessibilityHint(passwordWhyDetail)"),
                      "et VoiceOver l'énonce sans dépliement (#6441)")
        XCTAssertTrue(password.contains("isPasswordWhyExpanded"),
                      "et elle se DÉPLIE sur demande")
    }

    // MARK: - Le nom affiché aussi : facultatif, et sa conséquence dite

    /// TROISIÈME cas de la même règle, et il a manqué un cycle (#6441).
    ///
    /// #6424 a ouvert l'inscription par adresse seule et n'a relâché que le mot
    /// de passe : le nom affiché restait EXIGÉ par `canSubmit`, sans mention,
    /// en tête d'écran. L'écran promettait une chose et en refusait une autre —
    /// un défaut qu'aucune garde ne voyait, parce que la garde du mot de passe
    /// ne parle que du mot de passe.
    ///
    /// Comme lui, il est un CHOIX : vide, la passerelle dérive le nom de
    /// l'adresse. Donc les deux mêmes exigences, et la seconde compte plus —
    /// « facultatif » sans sa conséquence est une case qu'on saute.
    /// LE CHAMP A DISPARU, la règle non (#6479).
    ///
    /// #6441 exigeait que le nom affiché se dise « facultatif » et dise sa
    /// conséquence. La refonte va plus loin : il n'y a plus de champ « nom
    /// affiché » à annoncer — l'écran MONTRE le nom dérivé, et n'ouvre la
    /// saisie que si on la demande. Une promesse RENDUE vaut mieux qu'une
    /// promesse ANNONCÉE.
    ///
    /// #7897 va plus loin (retour porteur 2026-09-25 : « si on peut modifier
    /// le display name [et] le pseudo directement sans action supplémentaire
    /// c'est ok ») : deux SAISIES déjà remplies, sans bouton « Modifier ».
    func test_derivedIdentity_showsWhatWillBeCreated_asDirectInputs() throws {
        let body = try code(Self.signupView)
        let bloc = try fieldBody("derivedIdentityBlock", in: body)

        XCTAssertTrue(bloc.contains("effectiveUsername"), "le PSEUDO qui partira, déjà rempli")
        XCTAssertTrue(bloc.contains("effectiveDisplayName"), "le NOM AFFICHÉ qui partira, déjà rempli")
        XCTAssertTrue(bloc.contains("usernameSuggestions"),
                      "les pseudos libres d'un refus doivent atteindre un pixel, sinon le refus est un mur")
    }

    /// Aucun geste intermédiaire : ni état « en édition », ni bouton crayon,
    /// ni prénom / nom (ils se changent depuis l'espace de compte).
    func test_derivedIdentity_hasNoEditButton_andNoCivilNames() throws {
        let body = try code(Self.signupView)
        XCTAssertFalse(body.contains("isEditingIdentity"), "plus de bloc replié derrière « Modifier »")
        let bloc = try fieldBody("derivedIdentityBlock", in: body)
        XCTAssertFalse(bloc.contains("\"pencil\""), "plus de bouton crayon")
        XCTAssertFalse(bloc.contains("firstName"), "le prénom n'est pas saisi à l'inscription")
    }

    /// Le mot de passe paraît quand l'identité est DÉFINIE, avec sa ligne
    /// dépliable « Pourquoi mettre un mot de passe maintenant ? » (#7897).
    func test_passwordField_waitsForTheIdentity_andExplainsItselfOnDemand() throws {
        let body = try code(Self.signupView)
        XCTAssertTrue(body.contains("isIdentityDefined"))
        XCTAssertTrue(body.contains("auth.signup.password.why"))
    }

    /// L'AVERTISSEMENT DE VALIDATION passe derrière un (i) (#6626).
    ///
    /// #6479 le posait en clair — « une condition du compte, pas un détail
    /// qu'on consulte ». La directive porteur du 2026-09-15 tranche l'inverse :
    /// « moins de détails sur la page d'enregistrement, des (i) pour informer
    /// sur le mode de fonctionnement ». La condition n'est pas perdue pour
    /// autant : le champ la porte en `accessibilityHint`, et le (i) la déplie.
    ///
    /// Ce qui ne doit pas se perdre, c'est son TEXTE — d'où la seconde moitié :
    /// le (i) du champ e-mail déplie toujours la note de validation.
    func test_emailField_foldsTheVerificationNoticeBehindAnInfoHint() throws {
        let body = try code(Self.signupView)
        let email = try fieldBody("emailField", in: body)
        XCTAssertTrue(email.contains("hint: emailHint"),
                      "le champ e-mail monte son (i)")
        XCTAssertFalse(email.contains("auth.signup.email.verificationNotice"),
                       "la note ne se pose plus en clair sous le champ")

        let start = try XCTUnwrap(body.range(of: "private var emailHint: AuthInfoHint {"),
                                  "le (i) du champ e-mail est introuvable")
        let rest = body[start.upperBound...]
        let hint = rest[..<(rest.range(of: "\n    private var ")?.lowerBound ?? rest.endIndex)]
        XCTAssertTrue(hint.contains("auth.signup.email.verificationNotice"),
                      "le (i) déplie la note de validation — son texte ne change pas")
        XCTAssertTrue(hint.contains("auth.signup.email.hintLabel"),
                      "et VoiceOver l'annonce « Pourquoi un lien »")
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

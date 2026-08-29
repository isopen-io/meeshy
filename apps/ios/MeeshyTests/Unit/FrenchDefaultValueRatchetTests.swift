import XCTest
@testable import Meeshy

/// **Une clé au `defaultValue` français absente du catalogue s'affiche en
/// français, quelle que soit la langue de l'interface.**
///
/// C'est l'origine du mélange de langues signalé le 2026-07-29 : l'interface
/// tournait en anglais, `root.pending_stories` rendait bien « Pending stories »
/// — mais « Story enfin publiée » sortait du `defaultValue` d'une clé jamais
/// entrée au catalogue. Le catalogue a `sourceLanguage: fr`, donc écrire le
/// `defaultValue` en français est la bonne convention ; ce qui manque, c'est
/// l'entrée traduite.
///
/// `LocalizationConsistencyTests` ne voit pas ces clés : il exempte
/// explicitement les appels porteurs d'un `defaultValue`. C'est par ce trou que
/// les 488 sont passées.
///
/// **Cliquet, pas interdiction.** La dette est portée par
/// `FrenchDefaultValueDebt.json`. Ce test échoue si :
/// - une clé NEUVE apparaît avec un `defaultValue` français sans entrée au
///   catalogue (la dette ne peut pas grandir) ;
/// - une clé de la liste a été traduite sans être retirée de la liste (la dette
///   doit être tenue à jour quand elle diminue).
///
/// Traduire une clé = l'ajouter au catalogue dans les 7 langues, puis la
/// retirer de ce fichier. La liste ne peut que RÉTRÉCIR.
///
/// **La dette est à ZÉRO depuis le 2026-07-29** : les 488 clés d'origine ont
/// toutes été portées au catalogue en 7 langues. Le fichier reste — vide — car
/// c'est lui qui donne au cliquet son point de comparaison : liste vide =
/// aucune tolérance, toute nouvelle clé française hors catalogue échoue
/// immédiatement. Le remplir de nouveau serait une régression, pas un usage.
///
/// Un corollaire non couvert ici : une clé PRÉSENTE au catalogue peut quand
/// même mal s'afficher si le type de son placeholder (`%@` vs `%lld`) ne
/// correspond pas à l'argument interpolé au site d'appel. C'est l'objet de
/// `InterpolatedLocalizationSubstitutionTests`.
final class FrenchDefaultValueRatchetTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    /// Marqueurs de français : un accent, ou un mot-outil que l'anglais
    /// n'emploie pas. Volontairement conservateur — mieux vaut manquer une
    /// chaîne que bloquer une contribution sur un faux positif.
    private static let frenchMarkers = try! NSRegularExpression(
        pattern: "[éèêëàâçùûôîïœÉÈÀÇ]|\\b(le|la|les|des|une|aux|pour|avec|sans|dans|est|sont|vous|votre|vos|cette|aucun|aucune|nouveau|nouvelle|Envoyer|Annuler|Modifier|Supprimer|Ajouter|Fermer|Retour|Suivant|Terminer|Chargement|Erreur)\\b",
        options: [.caseInsensitive]
    )

    private func isFrench(_ value: String) -> Bool {
        let range = NSRange(value.startIndex..., in: value)
        return Self.frenchMarkers.firstMatch(in: value, range: range) != nil
    }

    /// Clés utilisées en code avec un `defaultValue`, mais absentes du catalogue.
    private func untranslatedFrenchKeys() throws -> Set<String> {
        let catalogURL = iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: catalogURL)
        let catalogued = Set(
            ((try JSONSerialization.jsonObject(with: data) as? [String: Any])?["strings"]
                as? [String: Any] ?? [:]).keys
        )

        // Le tiret DOIT figurer dans la classe de caractères de la clé.
        // Sans lui, `location.move-prompt`, `common.clear-search`,
        // `contacts.discover.no-results`… n'étaient tout simplement pas
        // reconnues comme des appels localisés : le cliquet ne les voyait pas,
        // quelle que soit leur langue. Constaté le 2026-08-09 — 194 clés à
        // tiret manquaient au catalogue, dont 74 en français, c'est-à-dire
        // 74 violations que ce test était censé rendre impossibles.
        let pattern = try NSRegularExpression(
            pattern: #"String\(\s*localized:\s*"([A-Za-z0-9_][A-Za-z0-9_.\-]*)"\s*,\s*defaultValue:\s*"((?:[^"\\]|\\.)*)""#
        )

        var offenders: Set<String> = []
        let sources = FileManager.default.enumerator(
            at: iosRoot.appendingPathComponent("Meeshy"), includingPropertiesForKeys: nil
        )
        while let url = sources?.nextObject() as? URL {
            guard url.pathExtension == "swift",
                  let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let range = NSRange(text.startIndex..., in: text)
            for match in pattern.matches(in: text, range: range) {
                guard let keyRange = Range(match.range(at: 1), in: text),
                      let valueRange = Range(match.range(at: 2), in: text) else { continue }
                let key = String(text[keyRange])
                guard !catalogued.contains(key), isFrench(String(text[valueRange])) else { continue }
                offenders.insert(key)
            }
        }
        return offenders
    }

    private var debtURL: URL {
        iosRoot.appendingPathComponent("MeeshyTests/Resources/FrenchDefaultValueDebt.json")
    }

    private func frozenDebt() throws -> Set<String> {
        let list = try JSONDecoder().decode([String].self, from: Data(contentsOf: debtURL))
        return Set(list)
    }

    /// Réenregistre la liste depuis l'état RÉEL du dépôt :
    ///
    ///     TEST_RUNNER_MEESHY_RECORD_FR_DEBT=1 xcodebuild test … \
    ///       -only-testing:MeeshyTests/FrenchDefaultValueRatchetTests
    ///
    /// Le préfixe `TEST_RUNNER_` est obligatoire : `xcodebuild` ne transmet au
    /// processus de test que les variables ainsi préfixées, et retire le
    /// préfixe au passage — d'où la lecture de `MEESHY_RECORD_FR_DEBT` ici.
    ///
    /// Ce mode existe parce que la liste doit être produite par la MÊME logique
    /// que celle qui la vérifie. Une liste générée par un script séparé diverge
    /// au premier détail — un accent absent d'un site d'appel, un mot-outil de
    /// plus dans l'heuristique — et le cliquet se met alors à signaler des
    /// écarts qui n'existent pas.
    ///
    /// Le mode n'assouplit rien : il ne s'active que sur demande explicite, et
    /// le test échoue quand même pour signaler que la liste a bougé.
    private func recordDebtIfRequested(_ offenders: Set<String>) throws -> Bool {
        guard ProcessInfo.processInfo.environment["MEESHY_RECORD_FR_DEBT"] == "1" else { return false }
        let data = try JSONSerialization.data(
            withJSONObject: offenders.sorted(),
            options: [.prettyPrinted, .withoutEscapingSlashes]
        )
        try data.write(to: debtURL)
        XCTFail("Liste réenregistrée (\(offenders.count) clés). Relancez sans MEESHY_RECORD_FR_DEBT.")
        return true
    }

    func test_noNewFrenchDefaultValueEscapesTheCatalogue() throws {
        let offenders = try untranslatedFrenchKeys()
        guard try !recordDebtIfRequested(offenders) else { return }
        let debt = try frozenDebt()

        let added = offenders.subtracting(debt).sorted()
        XCTAssertTrue(
            added.isEmpty,
            "Ces clés NEUVES portent un `defaultValue` français sans entrée au catalogue : " +
            "elles s'afficheront en français même quand l'interface est dans une autre " +
            "langue. Ajoutez-les à Localizable.xcstrings dans les 7 langues.\n" +
            added.joined(separator: "\n")
        )
    }

    func test_translatedKeysAreRemovedFromTheDebtList() throws {
        let offenders = try untranslatedFrenchKeys()
        let debt = try frozenDebt()

        let settled = debt.subtracting(offenders).sorted()
        XCTAssertTrue(
            settled.isEmpty,
            "Ces clés sont désormais traduites : retirez-les de " +
            "MeeshyTests/Resources/FrenchDefaultValueDebt.json. La liste ne doit que " +
            "rétrécir — la laisser grossir de clés réglées ferait perdre au cliquet " +
            "sa capacité à détecter une régression.\n" +
            settled.joined(separator: "\n")
        )
    }

    // MARK: - Présente au catalogue ≠ traduite en français

    /// **Le trou que ce cliquet laissait ouvert.**
    ///
    /// Il ne compare qu'une chose : « clé employée en code avec un
    /// `defaultValue` français » contre « clé PRÉSENTE au catalogue ». Une clé
    /// inscrite au catalogue avec six traductions et AUCUNE entrée `fr`
    /// passait donc au vert — alors qu'à l'écran, en français, iOS affiche
    /// l'identifiant brut.
    ///
    /// Constaté le 2026-08-24 sur signalement utilisateur : la fiche d'un
    /// participant s'ouvrait pleine de `participantProfile.language`,
    /// `participantProfile.country`… 67 clés symboliques étaient dans ce cas,
    /// dont 39 pour cette seule feuille. Le `defaultValue` du code ne sauve
    /// rien ici : il ne sert qu'à l'extraction et à la clé ABSENTE.
    ///
    /// La langue source du catalogue étant `fr`, une clé qui EST déjà une
    /// phrase française (« Cette action est irréversible ») se passe
    /// légitimement d'entrée `fr` — sa clé fait la valeur. Le test ne vise
    /// donc que les clés SYMBOLIQUES : un identifiant à segments, sans espace.
    func test_noSymbolicKey_isCataloguedWithoutItsFrench() throws {
        let catalogURL = iosRoot.appendingPathComponent("Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: catalogURL)
        let strings = (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["strings"]
            as? [String: [String: Any]] ?? [:]

        let offenders = strings.compactMap { key, entry -> String? in
            guard Self.isSymbolicKey(key) else { return nil }
            guard !Self.notAnInterfaceString.contains(key) else { return nil }
            guard let localizations = entry["localizations"] as? [String: Any],
                  !localizations.isEmpty else { return nil }
            return localizations["fr"] == nil ? key : nil
        }.sorted()

        XCTAssertTrue(
            offenders.isEmpty,
            "Ces clés sont au catalogue mais sans français : en français, l'app affiche "
            + "leur identifiant à l'écran.\n" + offenders.joined(separator: "\n")
        )
    }

    /// Contre-épreuve : la reconnaissance des clés symboliques doit bien
    /// séparer un identifiant d'une phrase française employée comme clé.
    func test_symbolicKeyRecognition_separatesIdentifiersFromFrenchSentences() {
        XCTAssertTrue(Self.isSymbolicKey("participantProfile.language"))
        XCTAssertTrue(Self.isSymbolicKey("a11y.delivery.sent"))
        XCTAssertTrue(Self.isSymbolicKey("common.clear-search"))
        XCTAssertFalse(Self.isSymbolicKey("Cette action est irréversible."))
        XCTAssertFalse(Self.isSymbolicKey("%@ caractères"))
        XCTAssertFalse(Self.isSymbolicKey("Annuler"))
    }

    /// Un identifiant : au moins deux segments alphanumériques séparés par
    /// `.`, `_` ou `-`, et jamais d'espace.
    private static func isSymbolicKey(_ key: String) -> Bool {
        guard !key.contains(" "), key.contains(".") || key.contains("_") || key.contains("-") else { return false }
        guard let first = key.first, first.isLetter else { return false }
        let segments = key.split(whereSeparator: { $0 == "." || $0 == "_" || $0 == "-" })
        guard segments.count >= 2 else { return false }
        return segments.allSatisfy { segment in
            segment.allSatisfy { $0.isLetter || $0.isNumber || "%@{}".contains($0) }
        }
    }

    /// Clés qui ressemblent à un identifiant sans en être un.
    ///
    /// **Vidée au 265i, en supprimant la CAUSE plutôt que l'exception.** Elle a
    /// contenu `"Jean-Pierre"` — un NOM devenu clé de catalogue parce que
    /// `Text("Jean-Pierre")` prend un `LocalizedStringKey` et qu'Xcode extrait
    /// tout littéral qu'on lui passe. L'exception décrivait exactement ce
    /// mécanisme (« la clé fait la valeur ») sans le remonter à sa source.
    ///
    /// Trois lignes plus bas dans le même fichier, le MÊME mécanisme avait fait
    /// traduire le message d'exemple de l'onboarding en de / es / pt-BR, cassant
    /// la démonstration du Prisme (#4313). Les sites passent désormais par
    /// `Text(verbatim:)`, qui ne consulte aucune table — donc plus aucune clé de
    /// ce genre n'entre au catalogue, et cette liste n'a plus rien à excuser.
    ///
    /// **La garder vide.** Une entrée ici dit « ce littéral n'aurait jamais dû
    /// devenir une clé » : c'est une demande de `Text(verbatim:)`, pas une
    /// dispense. Garde : `LocalizedStringKeyLiteralGuardTests`.
    private static let notAnInterfaceString: Set<String> = []
}

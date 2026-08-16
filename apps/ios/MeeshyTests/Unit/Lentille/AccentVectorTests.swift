import XCTest
import MeeshySDK
@testable import Meeshy

/// Le 7e fichier de vecteurs rejoué en XCTest — REV-3, blocker B4 (R14 :
/// « 6/7 fichiers »). `packages/shared/fixtures/reading-modes/accent.vectors.json`
/// n'était encore rejoué par AUCUNE suite iOS ; les six autres fichiers de
/// vecteurs de `reading-modes/` le sont déjà :
/// `ScrollActivityVectorTests` (scroll-activity), `SectionResolverVectorTests`
/// (sections/sort), `OrchestratorVectorTests`, `FocusCurveVectorTests`,
/// `AssistTierVectorTests`, `BridgeFormatterVectorTests`. Ce fichier ferme
/// R14 : 7/7.
///
/// **API réelle rejouée** — `packages/MeeshySDK/Sources/MeeshySDK/Theme/
/// ColorGeneration.swift` : `DynamicColorGenerator.colorFor(context:)`
/// (24 cas « (name, type, language, theme) → primary/secondary/accent »,
/// blend 0.30/0.30/0.40 puis rotation de teinte HSB ±30°) pour les 20
/// premiers vecteurs, `DynamicColorGenerator.colorForName(_:)` (hash DJB2 →
/// palette 39 couleurs) pour les 4 derniers. La normalisation
/// type-fil→type-contexte (`public`/`global`/`broadcast`/`community` →
/// `.community`) passe par `MeeshyConversation.computeColorPalette`
/// (`CoreModels.swift`) — l'adaptateur RÉEL et déjà en production, cité
/// comme source de vérité par le miroir TS lui-même
/// (`packages/shared/utils/conversation-colors.ts`,
/// `WIRE_TYPE_TO_CONTEXT_TYPE`) — jamais une réimplémentation locale de ce
/// switch dans ce fichier.
///
/// **Égalité ENTIÈRE, sans tolérance.** Chaque canal RGB du blend est un
/// `Int(Double)` Swift — une TRONCATURE vers zéro, jamais un arrondi
/// (contrat LWS-2/C-021, documenté dans `accent.vectors.json.$format` et
/// `conversation-colors.ts` L16-23). L'exemple `truncation-test` (index 11
/// du fichier de vecteurs) l'illustre : `#31B6BA`, jamais `#31B6BB` (un
/// arrondi donnerait `BB`, la valeur — à tort — affichée sur la maquette
/// `2026-08-15-conversation-list-lentille.html`). Les témoins ci-dessous
/// comparent des CHAÎNES hex entières, jamais une distance de couleur ni
/// une marge — la moindre divergence d'un seul chiffre hexadécimal fait
/// rougir le cas concerné.
///
/// **Exemption structurelle — UN seul vecteur sur 24 (leçon 257 : documentée
/// mécaniquement, jamais silencieuse).** Le vecteur `unknown-lang`
/// (`language: "klingon"`) exerce le repli TS `UNKNOWN_KEY_FALLBACK_HEX`
/// (`conversation-colors.ts` L133-140) — un branchement que le fichier TS
/// lui-même documente comme MORT côté Swift (« l'enum est fermé, la clé
/// existe toujours », L136-137) : `ConversationContext.ConversationLanguage`
/// est un `enum` Swift FERMÉ à 10 cas, chacun mappé à une couleur réelle
/// distincte de `"4ECDC4"` (aucune des dix ne porte cette valeur) — il
/// n'existe donc AUCUNE valeur RÉELLE de cet enum capable de reproduire ce
/// vecteur via `DynamicColorGenerator.colorFor(context:)`. Ce n'est pas un
/// choix de complaisance : `test_unknownLanguageVector_isStructurallyUnreachable_viaTheRealEnum`
/// le RE-PROUVE mécaniquement en balayant les dix cas réels et en
/// confirmant qu'AUCUN ne produit le hex attendu du vecteur exempté. Les 23
/// autres vecteurs (dont `unknown-type`/`unknown-theme`, dont les replis TS
/// coïncident — par construction du barème de couleurs — avec une valeur
/// RÉELLE de l'enum, `.direct`/`.general` respectivement) sont rejoués
/// normalement, sans aucune exemption.
///
/// **Nommage** — `AccentVectorTests` ne porte aucun jeton de
/// `FINAL_PHASE_CLASS_PATTERN` (`apps/ios/meeshy.sh:1591`, qui contient
/// notamment `Conversation`) : reste en phase 1 du gate local, comme les
/// six autres suites de vecteurs `reading-modes/`.
///
/// **Chemin de fixture** — même mécanique de folder reference que les six
/// suites existantes : `Bundle(for:).url(forResource:withExtension:
/// subdirectory:)` avec `subdirectory: "fixtures/reading-modes"` (constante
/// de chemin partagée, voir `SectionResolverVectorTests` L160-168) — câblée
/// par `project.yml` (`MeeshyTests.resources`,
/// `path: ../../packages/shared/fixtures`, `type: folder`), AUCUNE
/// modification de `project.yml` nécessaire ici (le dossier `reading-modes/`
/// y est déjà exposé).
final class AccentVectorTests: XCTestCase {

    // MARK: - Formes JSON tolérantes
    //
    // `accent.vectors.json` mélange DEUX formes d'entrée dans le même
    // tableau `vectors` (palette `{name,type,language?,theme?}` → `{primary,
    // secondary,accent}`, et repli `{colorForName}` → `{hex}`) : tous les
    // champs sont donc optionnels ici, et la discrimination se fait à
    // l'exécution sur la PRÉSENCE de `colorForName`.

    private struct VectorInputJSON: Decodable {
        let name: String?
        let type: String?
        let language: String?
        let theme: String?
        let colorForName: String?
    }

    private struct VectorExpectedJSON: Decodable {
        let primary: String?
        let secondary: String?
        let accent: String?
        let hex: String?
    }

    private struct VectorCase: Decodable {
        let input: VectorInputJSON
        let expected: VectorExpectedJSON
    }

    /// Le fichier est un OBJET (`{ "$format": …, "vectors": […] }`), pas un
    /// tableau à la racine — à la différence des autres fixtures
    /// `reading-modes/*.vectors.json` (leçon RE-PROUVER : vérifié en lisant
    /// le fichier avant d'écrire ce décodeur, jamais supposé par analogie
    /// avec les six autres suites). `$format` (métadonnées de provenance,
    /// documentation de la règle de troncature) est ignoré nativement par
    /// `Decodable` — aucune clé additionnelle ne fait échouer le décodage.
    private struct VectorFileJSON: Decodable {
        let vectors: [VectorCase]
    }

    // MARK: - Chargement du fichier de vecteurs (bundle de tests)

    /// Ressource de bundle : `packages/shared/fixtures/reading-modes/accent.vectors.json`,
    /// câblée via `project.yml` (`MeeshyTests.resources`,
    /// `../../packages/shared/fixtures`, `type: folder`) — même mécanique de
    /// folder reference que `SectionResolverVectorTests.loadCases`. Fichier
    /// introuvable, JSON invalide, ou tableau `vectors` vide (leçon 257)
    /// ⇒ `XCTFail` explicite + tableau vide retourné — jamais de vert
    /// silencieux à zéro cas exécuté.
    private static func loadCases() -> [VectorCase] {
        guard let url = Bundle(for: AccentVectorTests.self).url(
            forResource: "accent.vectors",
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                accent.vectors.json introuvable dans le bundle de tests sous \
                fixtures/reading-modes/. Vérifier la ressource \
                `../../packages/shared/fixtures` (type: folder) dans project.yml, \
                puis `xcodegen generate`.
                """)
            return []
        }

        do {
            let data = try Data(contentsOf: url)
            let file = try JSONDecoder().decode(VectorFileJSON.self, from: data)
            guard !file.vectors.isEmpty else {
                XCTFail("""
                    accent.vectors.json contient ZÉRO cas — une suite de vecteurs ne doit \
                    jamais charger zéro cas (leçon 257, jamais de vert silencieux)
                    """)
                return []
            }
            return file.vectors
        } catch {
            XCTFail("accent.vectors.json présent mais illisible/mal formé : \(error)")
            return []
        }
    }

    // MARK: - Garde de harnais (leçon 257) + RE-PREUVE du compte (24, pas un chiffre supposé)

    func test_vectors_fileLoadsAtLeastOneCase() {
        XCTAssertFalse(Self.loadCases().isEmpty, "accent.vectors.json a chargé ZÉRO cas — leçon 257, jamais de vert silencieux")
    }

    /// Re-preuve mécanique (règle RE-PROUVER, comme `behaviour-matrix.test.ts`
    /// en tête de fichier) : 24 cas au total dans `accent.vectors.json` au
    /// moment de l'écriture de cette suite — 20 vecteurs de palette
    /// (`name/type/language/theme` → `primary/secondary/accent`) + 4
    /// vecteurs de repli (`colorForName` → `hex`). Un changement de ce
    /// compte doit être investigué avant d'ajuster ce nombre.
    func test_vectors_totalCaseCount_isTwentyFour() {
        XCTAssertEqual(Self.loadCases().count, 24, "accent.vectors.json ne contient plus 24 cas — vérifier si des vecteurs ont été ajoutés/retirés avant d'ajuster ce nombre.")
    }

    // MARK: - Adaptateurs entrée JSON → types réels de l'API (jamais de loi réimplémentée ici)

    private static let isoToLanguage: [String: ConversationContext.ConversationLanguage] = [
        "fr": .french, "en": .english, "es": .spanish, "de": .german, "ja": .japanese,
        "ar": .arabic, "zh": .chinese, "pt": .portuguese, "it": .italian,
    ]

    /// Résout la chaîne `language` du vecteur vers le cas RÉEL de
    /// `ConversationContext.ConversationLanguage` — code ISO 639-1 (miroir
    /// de `ISO_TO_CONVERSATION_LANGUAGE`, `conversation-colors.ts` L68-78)
    /// ou nom complet (`rawValue` direct de l'enum, ex. `"french"`). `nil`
    /// en entrée (champ absent du vecteur) ⇒ `.french`, le défaut RÉEL de
    /// `ConversationContext.init` (`ColorGeneration.swift` L22-26) — jamais
    /// un défaut recopié ici en dur. Retourne `nil` UNIQUEMENT pour une
    /// chaîne hors des deux tables ET hors des dix cas de l'enum (ex.
    /// `"klingon"`) — voir la note d'exemption en tête de fichier.
    private static func resolveLanguage(_ raw: String?) -> ConversationContext.ConversationLanguage? {
        guard let raw else { return .french }
        if let iso = isoToLanguage[raw] { return iso }
        return ConversationContext.ConversationLanguage(rawValue: raw)
    }

    /// `nil`/chaîne inconnue ⇒ `.general` — le défaut RÉEL de
    /// `ConversationContext.init`, qui coïncide (par construction du barème
    /// de couleurs — `themeColors[.general] == "4ECDC4" ==
    /// UNKNOWN_KEY_FALLBACK_HEX`) avec le repli TS pour un thème inconnu :
    /// REPRÉSENTABLE, contrairement à la langue (voir `resolveLanguage`).
    private static func resolveTheme(_ raw: String?) -> ConversationContext.ConversationTheme {
        guard let raw, let known = ConversationContext.ConversationTheme(rawValue: raw) else {
            return .general
        }
        return known
    }

    /// Chaîne de type inconnue (ex. `"alien"`) ⇒ `.direct` — le repli RÉEL
    /// de `conversationAccentPalette`/`DEFAULT_CONTEXT_TYPE`
    /// (`conversation-colors.ts` L118-124), qui coïncide (par construction)
    /// avec `typeColors[.direct] == "FF6B6B" == UNKNOWN_TYPE_FALLBACK_HEX` :
    /// REPRÉSENTABLE lui aussi. Les huit types du fil connus
    /// (`direct/group/public/global/community/channel/bot/broadcast`)
    /// décodent directement via le `rawValue` de `MeeshyConversation.ConversationType`.
    private static func resolveWireType(_ raw: String) -> MeeshyConversation.ConversationType {
        MeeshyConversation.ConversationType(rawValue: raw) ?? .direct
    }

    /// Calcule `{primary, secondary, accent}` via l'API RÉELLE — la
    /// normalisation type-fil→type-contexte passe par
    /// `MeeshyConversation.computeColorPalette` (`CoreModels.swift`
    /// L537-551), PAS par une réimplémentation locale du switch
    /// `public/global/community/broadcast → .community` : c'est la SEULE
    /// source de vérité Swift pour ce mapping, citée comme telle par
    /// `conversation-colors.ts` (`WIRE_TYPE_TO_CONTEXT_TYPE`, commentaire
    /// L102-105). `memberCount`/`title`/`identifier` n'affectent JAMAIS
    /// primary/secondary/accent (seul `saturationBoost` en dépend, hors
    /// périmètre de ce fichier de vecteurs) — valeurs arbitraires stables.
    /// `nil` ⇒ vecteur EXEMPTÉ (langue non représentable, voir plus haut).
    private static func computePalette(
        type rawType: String, language rawLanguage: String?, theme rawTheme: String?
    ) -> (primary: String, secondary: String, accent: String)? {
        guard let language = resolveLanguage(rawLanguage) else { return nil }
        let theme = resolveTheme(rawTheme)
        let wireType = resolveWireType(rawType)
        let palette = MeeshyConversation.computeColorPalette(
            type: wireType, title: nil, identifier: "accent-vector-test",
            language: language, theme: theme, memberCount: 2
        )
        return (palette.primary, palette.secondary, palette.accent)
    }

    private static func stripHash(_ hex: String) -> String {
        hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    }

    // MARK: - Rejeu — 19 vecteurs de palette (20 déclarés − 1 exemption « unknown-lang »)

    /// Rejoue les vecteurs `{name,type,language?,theme?} → {primary,secondary,accent}`
    /// contre `DynamicColorGenerator.colorFor(context:)` (via
    /// `MeeshyConversation.computeColorPalette`, l'adaptateur RÉEL). Égalité
    /// hex ENTIÈRE (chaînes, jamais une tolérance numérique) — leçon 265,
    /// messages d'échec en français qui désignent le cas ET les valeurs.
    func test_paletteVectors_matchDynamicColorGenerator_exactly() throws {
        let cases = Self.loadCases().filter { $0.input.colorForName == nil }
        XCTAssertFalse(cases.isEmpty, "aucun vecteur de palette chargé — voir test_vectors_fileLoadsAtLeastOneCase")

        var exemptedCount = 0
        for testCase in cases {
            let input = testCase.input
            guard let rawType = input.type else {
                XCTFail("cas «\(input.name ?? "sans nom")» : champ `type` absent — vecteur de palette mal formé.")
                continue
            }
            let label = "cas «\(input.name ?? "sans nom")» (type=\(rawType), language=\(input.language ?? "∅ (défaut french)"), theme=\(input.theme ?? "∅ (défaut general)"))"

            guard let actual = Self.computePalette(type: rawType, language: input.language, theme: input.theme) else {
                exemptedCount += 1
                XCTAssertEqual(
                    input.language, "klingon",
                    "\(label) : exemption inattendue — seule la langue « klingon » (hors énumération " +
                    "fermée ConversationContext.ConversationLanguage) doit être exemptée du rejeu strict."
                )
                continue
            }

            guard
                let expectedPrimary = testCase.expected.primary.map(Self.stripHash),
                let expectedSecondary = testCase.expected.secondary.map(Self.stripHash),
                let expectedAccent = testCase.expected.accent.map(Self.stripHash)
            else {
                XCTFail("\(label) : champs primary/secondary/accent absents du vecteur `expected`.")
                continue
            }

            XCTAssertEqual(
                actual.primary, expectedPrimary,
                "\(label) : primary attendu #\(expectedPrimary), obtenu #\(actual.primary) — " +
                "égalité hex ENTIÈRE (troncature Math.trunc/Int(Double), jamais d'arrondi)."
            )
            XCTAssertEqual(
                actual.secondary, expectedSecondary,
                "\(label) : secondary attendu #\(expectedSecondary), obtenu #\(actual.secondary)."
            )
            XCTAssertEqual(
                actual.accent, expectedAccent,
                "\(label) : accent attendu #\(expectedAccent), obtenu #\(actual.accent)."
            )
        }

        XCTAssertEqual(
            exemptedCount, 1,
            "exactement UN vecteur de palette doit être exempté (« unknown-lang ») — " +
            "\(exemptedCount) trouvé(s) : une régression ici cacherait soit un vecteur non " +
            "rejoué à tort, soit une exemption devenue injustifiée."
        )
    }

    // MARK: - Exemption structurelle — preuve mécanique, pas une complaisance

    /// RE-PROUVE que le vecteur `unknown-lang` (`language: "klingon"`,
    /// primary attendu `#83AFA9`) est structurellement IRREPRODUCTIBLE via
    /// `DynamicColorGenerator.colorFor(context:)` : balaie les DIX cas
    /// réels de `ConversationContext.ConversationLanguage`
    /// (`CaseIterable`), chacun combiné à `type: .direct, theme: .general`
    /// (les mêmes que le vecteur exempté), et confirme qu'AUCUN ne produit
    /// le hex attendu. Si ce témoin devait un jour rougir (un cas produit
    /// `#83AFA9`), l'exemption ci-dessus deviendrait injustifiée et ce
    /// vecteur devrait être rejoué normalement dans
    /// `test_paletteVectors_matchDynamicColorGenerator_exactly`.
    func test_unknownLanguageVector_isStructurallyUnreachable_viaTheRealEnum() {
        let expectedPrimaryForUnknownLangVector = "83AFA9"

        XCTAssertEqual(
            ConversationContext.ConversationLanguage.allCases.count, 10,
            "ConversationContext.ConversationLanguage ne porte plus 10 cas — re-vérifier " +
            "l'exemption « unknown-lang » avant tout changement (elle dépend de ce compte fermé)."
        )

        for language in ConversationContext.ConversationLanguage.allCases {
            let palette = DynamicColorGenerator.colorFor(context: ConversationContext(
                name: "exemption-probe", type: .direct, language: language, theme: .general
            ))
            XCTAssertNotEqual(
                palette.primary, expectedPrimaryForUnknownLangVector,
                "langue «\(language.rawValue)» (type=direct, theme=general) produit #\(palette.primary) " +
                "— si ceci devait un jour égaler #\(expectedPrimaryForUnknownLangVector), le vecteur " +
                "« unknown-lang » deviendrait reproductible et son exemption devrait être retirée."
            )
        }
    }

    // MARK: - Rejeu — 4 vecteurs de repli `colorForName`

    /// Rejoue les vecteurs `{colorForName} → {hex}` contre
    /// `DynamicColorGenerator.colorForName(_:)` (hash DJB2 déterministe →
    /// palette 39 couleurs). Aucune exemption possible ici : `colorForName`
    /// prend une `String` brute, sans enum fermé entre le vecteur et l'API.
    func test_colorForNameVectors_matchDynamicColorGenerator_exactly() throws {
        let cases = Self.loadCases().filter { $0.input.colorForName != nil }
        XCTAssertFalse(cases.isEmpty, "aucun vecteur colorForName chargé — voir test_vectors_fileLoadsAtLeastOneCase")
        XCTAssertEqual(cases.count, 4, "4 vecteurs colorForName attendus (chaîne vide, nom simple, emoji/esperluette, id système) — le compte a changé.")

        for testCase in cases {
            guard let name = testCase.input.colorForName, let expectedHexRaw = testCase.expected.hex else {
                XCTFail("cas colorForName mal formé — champs `input.colorForName`/`expected.hex` manquants.")
                continue
            }
            let expectedHex = Self.stripHash(expectedHexRaw)
            let actualHex = DynamicColorGenerator.colorForName(name)
            XCTAssertEqual(
                actualHex, expectedHex,
                "cas colorForName=\"\(name)\" : attendu #\(expectedHex), obtenu #\(actualHex) — " +
                "égalité hex ENTIÈRE (hash DJB2 déterministe, aucune tolérance)."
            )
        }
    }
}

import XCTest

/// **Une charte qui se tient à la main se tient jusqu'à la prochaine vue.**
///
/// Le lot #8877 a ramené les vues de l'app et de `MeeshyUI` sur les jetons de la
/// charte (`docs/product/charte-visuelle-ios.md`) : couleurs `MeeshyColors`,
/// rayons `MeeshyRadius`, marges `MeeshySpacing`. Rien, ensuite, n'empêchait la
/// vue suivante d'écrire `Color(hex: "6366F1")`, `.cornerRadius(12)` ou
/// `.padding(.horizontal, 16)` — trois lignes qui compilent, passent la revue
/// parce que leurs voisines les portent encore, et rouvrent l'écart que le lot
/// venait de fermer. C'est l'angle mort de `FixedFontSizeGuardTests` (#4311) :
/// **un site dont les voisins sont littéraux RESSEMBLE à un site littéral
/// légitime.**
///
/// ### Ce que la garde mesure — et ce qu'elle refuse de juger
///
/// Elle ne dit PAS si un littéral est justifié : un rayon de 2 pt sur une barre
/// fine, un espacement 0 ou un glyphe borné par un cadre fixe sont légitimes
/// (charte § 2, littéraux intrinsèques). Elle borne la POPULATION, comme
/// `FixedFontSizeGuardTests` et `FileSizeBudgetGuardTests` : quatre compteurs
/// qui ne peuvent que DESCENDRE. Un écran neuf emploie les jetons, ou il dit
/// dans son commit pourquoi le plafond monte.
///
/// Quatre populations, toutes lues sur le texte MASQUÉ par
/// `DeclarationBodyScanner.mask` (commentaires et contenu des chaînes effacés,
/// guillemets conservés — c'est ce qui laisse voir `Color(hex: "…")` tout en
/// taisant un exemple écrit dans un doc-comment) :
///
/// | population | motif (ICU, identique à `grep -P`) |
/// |---|---|
/// | `hex` | `Color(hex:` suivi d'un littéral de chaîne |
/// | `rgb` | `Color(red:` suivi d'un nombre |
/// | `cornerRadius` | `cornerRadius:` / `.cornerRadius(` suivi d'un nombre |
/// | `padding` | `.padding(` suivi d'un nombre, éventuellement après des bords |
///
/// La mesure est LARGE à dessein : `cornerRadius: 14 * scale` compte, bien que
/// le codemod de #8877 le laisse (jamais de jeton dans une expression). Un plafond
/// ne demande pas que la population tombe à zéro, seulement qu'elle ne remonte pas.
/// Les couleurs issues d'une variable (`Color(hex: accentColor)`) ne comptent pas :
/// c'est la couleur CALCULÉE d'une entité, libre par la charte.
///
/// ### Ce qui reste libre : le cadre des tiers (charte § 2)
///
/// Les couleurs, polices et fonds que l'UTILISATEUR ou un tiers choisit ne se
/// ramènent jamais aux jetons. `exemptions` déclare ces fichiers avec leur raison ;
/// leurs littéraux ne comptent pas. Les extensions (`MeeshyWidgets`,
/// `MeeshyShareExtension`, `MeeshyNotificationExtension`, `MeeshyBroadcastExtension`)
/// et la cible cœur `MeeshySDK` ne figurent pas dans les racines balayées : elles
/// ne voient pas `MeeshyUI` (charte § 2, dernières lignes), donc aucun jeton
/// n'y compile.
///
/// ### Les plafonds sont des bornes SUPÉRIEURES sûres
///
/// Chaque plafond est épinglé sur le compte `grep` brut des mêmes fichiers. Un
/// `grep` compte aussi les lignes en commentaire et en chaîne, que la garde
/// masque : son compte est donc une borne SUPÉRIEURE de celui de la garde, et
/// l'épingler ne peut pas faire rougir le test le jour où il est posé. Commande
/// de référence (`EXEMPT` = l'alternation des globs de `exemptions`, `*` → `.*`,
/// ancrée `^(…)$`) :
///
/// ```
/// git ls-files 'apps/ios/Meeshy/*.swift' 'packages/MeeshySDK/Sources/MeeshyUI/*.swift' \
///   | grep -vE "$EXEMPT" | xargs grep -Po '<motif>' | wc -l
/// ```
///
/// Relevé au 2026-09-30, sur `claude/relaxed-bell-b8w4uc` après #8877 :
/// - `hex` 13 — `(?<![A-Za-z])Color\(hex:[ \t]*\x22`
/// - `rgb` 3 — `(?<![A-Za-z])Color\(red:[ \t]*[0-9.]`
/// - `cornerRadius` 120 — `cornerRadius(:|\()[ \t]*[0-9]`
/// - `padding` 190 — `\.padding\((\.[a-z]+,[ \t]*|\[[^\]\n]*\],[ \t]*)?[0-9]`
///
/// Quand une population descend, le plafond descend DANS LE MÊME COMMIT : un
/// plafond qui ne baisse pas quand la population baisse cesse d'être un cliquet
/// et devient un plancher de tolérance (#4292).
final class DesignLiteralRatchetGuardTests: XCTestCase {

    // MARK: - Populations

    enum Population: CaseIterable {
        case hex
        case rgb
        case cornerRadius
        case padding

        var label: String {
            switch self {
            case .hex: return "Color(hex: \"…\")"
            case .rgb: return "Color(red: …)"
            case .cornerRadius: return "cornerRadius numérique"
            case .padding: return "padding numérique"
            }
        }

        var remedy: String {
            switch self {
            case .hex, .rgb:
                return "un jeton `MeeshyColors.<nom>` (charte § 3) ; une couleur choisie par l'utilisateur ou un tiers reste libre, dans un fichier de `exemptions`"
            case .cornerRadius:
                return "un pas de `MeeshyRadius` (charte § 3 et § 4.2)"
            case .padding:
                return "un pas de `MeeshySpacing` (charte § 3 et § 4.2)"
            }
        }

        var pattern: String {
            switch self {
            case .hex:
                return #"(?<![A-Za-z])Color\(hex:[ \t]*\x22"#
            case .rgb:
                return #"(?<![A-Za-z])Color\(red:[ \t]*[0-9.]"#
            case .cornerRadius:
                return #"cornerRadius(:|\()[ \t]*[0-9]"#
            case .padding:
                return #"\.padding\((\.[a-z]+,[ \t]*|\[[^\]\n]*\],[ \t]*)?[0-9]"#
            }
        }
    }

    // MARK: - Cadre des tiers (charte § 2)

    struct Exemption {
        let reason: String
        let globs: [String]
    }

    private static let ui = "packages/MeeshySDK/Sources/MeeshyUI"
    private static let app = "apps/ios/Meeshy/Features/Main"

    /// Les fichiers dont les couleurs, polices et fonds appartiennent à
    /// l'UTILISATEUR ou à un tiers. Chaque glob est relatif à la racine du dépôt ;
    /// `*` couvre tout, séparateurs compris.
    ///
    /// Une règle comme `FixedFontSizeGuardTests.bearingFiles` : un glob qui ne
    /// désigne plus aucun fichier rougit (`test_chaqueExemptionDesigneDesFichiers`),
    /// sinon la liste garderait des noms sans site et cesserait de dire la vérité.
    private static let exemptions: [Exemption] = [
        Exemption(
            reason: "définitions : les jetons eux-mêmes, donc les seuls littéraux légitimes de la charte",
            globs: ["\(ui)/Theme/*"]
        ),
        Exemption(
            reason: "studio de story : palettes de texte et de fond, StoryFont, fonds de scène, rendu d'une slide",
            globs: [
                "\(ui)/Story/Canvas/*",
                "\(ui)/Story/StoryComposerSupportTypes.swift",
                "\(ui)/Story/StoryTextEditorView.swift",
                "\(ui)/Story/StoryTextEffectStyle.swift",
                "\(ui)/Story/StoryBackgroundStyle.swift",
                "\(ui)/Story/StoryFilterGridView.swift",
                "\(ui)/Story/StorySlideRenderer.swift",
                "\(ui)/Story/SlideMiniPreview.swift",
                "\(ui)/Story/TextEditToolOptions*.swift",
                "\(ui)/Story/TextStyleSpecimenBand.swift",
            ]
        ),
        Exemption(
            reason: "dessin : palette et épaisseurs de trait choisies par l'utilisateur",
            globs: [
                "\(ui)/Story/Drawing/*",
                "\(ui)/Story/DrawingEditToolOptions.swift",
                "\(ui)/Story/DrawingStrokeList.swift",
                "\(ui)/Story/StoryDrawingToolbar.swift",
            ]
        ),
        Exemption(
            reason: "stickers et cadres à mots : gabarits et couleurs de gabarit",
            globs: [
                "\(ui)/Story/Sticker*.swift",
                "\(app)/Components/ComposerTextStickerSheet.swift",
                "\(app)/Views/Bubble/MessageStickerArtwork.swift",
                "\(app)/Lentille/Chrome/LentilleSticker.swift",
            ]
        ),
        Exemption(
            reason: "palettes proposées à l'utilisateur : nuanciers de fond et de communauté",
            globs: [
                "\(app)/Components/BackgroundColorPalette.swift",
                "\(ui)/Community/CommunitySettingsView.swift",
            ]
        ),
        Exemption(
            reason: "cadres d'appel : dégradés et ornements choisis",
            globs: [
                "\(app)/Services/CallFrames/*",
                "\(app)/Models/CallFrames/*",
            ]
        ),
        Exemption(
            reason: "cartes de message exportées : thèmes de carte",
            globs: [
                "\(ui)/MessageCard/*",
                "\(app)/Export/MessageCardThumbnails.swift",
                "\(app)/Export/MessageCardExportGallery.swift",
            ]
        ),
        Exemption(
            reason: "filtres et effets : teintes d'effet, fond audio d'un réel",
            globs: [
                "\(app)/Views/VideoFiltersPanel.swift",
                "\(app)/Views/VideoFilterControlView.swift",
                "\(ui)/Media/VideoEditor/VideoFilterPreviewer.swift",
                "\(app)/Views/ReelAudioBackdrop.swift",
                "\(app)/Components/MessageEffectModifiers.swift",
            ]
        ),
        Exemption(
            reason: "couleur CALCULÉE d'une entité : la couleur hachée d'un tag",
            globs: ["\(ui)/Primitives/TagInputView.swift"]
        ),
        Exemption(
            reason: "drapeaux de langue : couleurs de drapeau",
            globs: ["\(app)/Components/LanguageFlagChip.swift"]
        ),
        Exemption(
            reason: "code : thèmes de coloration syntaxique",
            globs: [
                "\(ui)/Media/SyntaxHighlighter.swift",
                "\(ui)/Media/CodeViewerView.swift",
            ]
        ),
    ]

    static func matches(glob: String, path: String) -> Bool {
        let body = NSRegularExpression.escapedPattern(for: glob)
            .replacingOccurrences(of: "\\*", with: ".*")
        guard let regex = try? NSRegularExpression(pattern: "^" + body + "$") else { return false }
        return regex.firstMatch(in: path, range: NSRange(location: 0, length: (path as NSString).length)) != nil
    }

    static func isExempt(_ path: String) -> Bool {
        exemptions.contains { exemption in
            exemption.globs.contains { matches(glob: $0, path: path) }
        }
    }

    // MARK: - Comptage

    /// Nombre d'occurrences de la population dans une source, commentaires et
    /// contenu des chaînes masqués. Plusieurs occurrences sur une même ligne
    /// comptent chacune : le `grep -o` de référence fait de même.
    static func count(_ population: Population, in source: String) -> Int {
        guard let regex = try? NSRegularExpression(pattern: population.pattern) else { return 0 }
        let masked = DeclarationBodyScanner.mask(source)
        return regex.numberOfMatches(
            in: masked,
            range: NSRange(location: 0, length: (masked as NSString).length)
        )
    }

    struct Measure {
        let scanned: Int
        let exempted: Int
        let counted: [String: [Population: Int]]
        let exemptCounted: [Population: Int]

        func total(_ population: Population) -> Int {
            counted.values.reduce(0) { $0 + ($1[population] ?? 0) }
        }

        func worstFiles(_ population: Population, limit: Int) -> [String] {
            counted
                .compactMap { path, counts -> (String, Int)? in
                    guard let n = counts[population], n > 0 else { return nil }
                    return (path, n)
                }
                .sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0 < $1.0 }
                .prefix(limit)
                .map { "\($0.1)  \($0.0)" }
        }
    }

    // MARK: - Plafonds

    /// Littéraux `Color(hex: "…")` hors cadre libre. **Ne doit que DESCENDRE.**
    /// `git ls-files … | grep -vE "$EXEMPT" | xargs grep -Po '(?<![A-Za-z])Color\(hex:[ \t]*\x22' | wc -l` → 13.
    private static let hexCeiling = 13

    /// Littéraux `Color(red: 0.1, …)` hors cadre libre. **Ne doit que DESCENDRE.**
    /// `… | xargs grep -Po '(?<![A-Za-z])Color\(red:[ \t]*[0-9.]' | wc -l` → 3.
    private static let rgbCeiling = 3

    /// Rayons numériques hors cadre libre. **Ne doit que DESCENDRE.**
    /// `… | xargs grep -Po 'cornerRadius(:|\()[ \t]*[0-9]' | wc -l` → 120.
    private static let cornerRadiusCeiling = 120

    /// Marges numériques hors cadre libre. **Ne doit que DESCENDRE.**
    /// `… | xargs grep -Po '\.padding\((\.[a-z]+,[ \t]*|\[[^\]\n]*\],[ \t]*)?[0-9]' | wc -l` → 190.
    private static let paddingCeiling = 190

    private static func ceiling(_ population: Population) -> Int {
        switch population {
        case .hex: return hexCeiling
        case .rgb: return rgbCeiling
        case .cornerRadius: return cornerRadiusCeiling
        case .padding: return paddingCeiling
        }
    }

    // MARK: - Règles

    func test_lesCouleursHexLitteralesNeRemontentJamais() throws {
        try assertCeiling(.hex)
    }

    func test_lesCouleursRGBLitteralesNeRemontentJamais() throws {
        try assertCeiling(.rgb)
    }

    func test_lesRayonsLitterauxNeRemontentJamais() throws {
        try assertCeiling(.cornerRadius)
    }

    func test_lesMargesLitteralesNeRemontentJamais() throws {
        try assertCeiling(.padding)
    }

    private func assertCeiling(_ population: Population) throws {
        let measured = try takeMeasure()
        let total = measured.total(population)
        let ceiling = Self.ceiling(population)
        let worst = measured.worstFiles(population, limit: 10).joined(separator: "\n  ")
        let message = """
        la population « \(population.label) » a GROSSI (\(total) > \(ceiling)). Une vue neuve \
        emploie \(population.remedy) ; si le littéral est légitime (charte § 2), le fichier \
        rejoint `exemptions` avec sa raison, ou le plafond monte dans un commit qui dit pourquoi. \
        Fichiers les plus chargés :
          \(worst)
        """

        XCTAssertLessThanOrEqual(total, ceiling, message)
    }

    // MARK: - Bornes

    /// Sans elle, les quatre cliquets passeraient au vert en ne regardant rien —
    /// le mode de panne payé au 256i et rejoué au 257i.
    func test_leBalayageVoitBienLeDepot() throws {
        let measured = try takeMeasure()
        XCTAssertGreaterThan(measured.scanned, 1000, "racines attendues : \(Self.scannedRoots)")
        XCTAssertGreaterThan(measured.scanned - measured.exempted, 1000,
                             "le cadre libre ne doit pas avaler le dépôt")
    }

    /// **La borne qui compte le plus.** Un motif cassé rendrait `0` partout — et
    /// les quatre plafonds resteraient VERTS en ne protégeant plus rien. Le cadre
    /// libre, lui, est permanent et porte des centaines de littéraux : si la garde
    /// ne les voit pas, elle ne voit rien.
    func test_lesMotifsVoientBienLesLitterauxDuCadreLibre() throws {
        let exempt = try takeMeasure().exemptCounted
        XCTAssertGreaterThan(exempt[.hex] ?? 0, 50, "le cadre libre porte ~130 `Color(hex: \"…\")` au 2026-09-30")
        XCTAssertGreaterThan(exempt[.rgb] ?? 0, 0, "le cadre libre porte `Color(red:)` au 2026-09-30")
        XCTAssertGreaterThan(exempt[.cornerRadius] ?? 0, 10, "le cadre libre porte ~40 rayons au 2026-09-30")
        XCTAssertGreaterThan(exempt[.padding] ?? 0, 30, "le cadre libre porte ~120 marges au 2026-09-30")
    }

    func test_chaqueExemptionDesigneDesFichiers() throws {
        let paths = try sourceFiles().map { relativePath($0) }
        let dead = Self.exemptions
            .flatMap { $0.globs }
            .filter { glob in !paths.contains { Self.matches(glob: glob, path: $0) } }

        XCTAssertTrue(
            dead.isEmpty,
            "globs d'exemption sans fichier — les RETIRER de `exemptions` (un nom qui sort ne revient jamais) :\n  "
            + dead.joined(separator: "\n  ")
        )
    }

    func test_chaqueExemptionPorteSaRaison() {
        for exemption in Self.exemptions {
            XCTAssertFalse(exemption.reason.isEmpty)
            XCTAssertFalse(exemption.globs.isEmpty, exemption.reason)
        }
    }

    // MARK: - Témoins synthétiques

    /// La question dont la réponse est connue d'avance : ce que le compteur voit,
    /// et ce qu'il laisse.
    func test_leCompteurDesCouleursLitteralesLitBienLaSource() {
        let hex = """
        Circle().fill(Color(hex: "6366F1"))
        Color(hex: accentColor)
        UIColor(hex: "FFFFFF")
        """
        XCTAssertEqual(Self.count(.hex, in: hex), 1, "littéral compté ; variable et UIColor laissés")

        let rgb = """
        Color(red: 0.1, green: 0.2, blue: 0.3)
        Color(red: r, green: g, blue: b)
        """
        XCTAssertEqual(Self.count(.rgb, in: rgb), 1, "composantes littérales comptées ; variables laissées")
    }

    func test_leCompteurDesRayonsEtDesMargesLitBienLaSource() {
        let radius = """
        RoundedRectangle(cornerRadius: 12)
        .cornerRadius(8)
        .glassCard(cornerRadius: MeeshyRadius.md)
        .cornerRadius(radius)
        """
        XCTAssertEqual(Self.count(.cornerRadius, in: radius), 2)

        let padding = """
        .padding(12)
        .padding(.horizontal, 16)
        .padding([.top, .bottom], 8)
        .padding(MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
        .padding()
        """
        XCTAssertEqual(Self.count(.padding, in: padding), 3)
    }

    /// Un site en commentaire ou en chaîne n'existe pas : c'est ce que `mask`
    /// garantit, et c'est ce qui autorise la doctrine à être écrite JUSTE au-dessus
    /// du site, exemple compris.
    func test_leCompteurIgnoreCommentairesEtChaines() {
        let source = #"""
        // .padding(8) — ancien réglage
        /* .cornerRadius(12) */
        let doc = "voir Color(hex: \"FF0000\") et .padding(4)"
        Text(x).padding(6)
        """#
        XCTAssertEqual(Self.count(.padding, in: source), 1)
        XCTAssertEqual(Self.count(.cornerRadius, in: source), 0)
        XCTAssertEqual(Self.count(.hex, in: source), 0)
    }

    func test_leCompteurCompteChaqueOccurrenceDUneMemeLigne() {
        let source = "VStack { Text(a).padding(4); Text(b).padding(8) }"
        XCTAssertEqual(Self.count(.padding, in: source), 2)
    }

    func test_leCadreLibreSeLitParGlob() {
        let ui = Self.ui
        let app = Self.app
        XCTAssertTrue(Self.isExempt("\(ui)/Story/Canvas/Layers/BackgroundLayer.swift"))
        XCTAssertTrue(Self.isExempt("\(ui)/Story/StickerPickerView.swift"))
        XCTAssertTrue(Self.isExempt("\(ui)/Story/TextEditToolOptionsPanel.swift"))
        XCTAssertTrue(Self.isExempt("\(app)/Services/CallFrames/AnyFrame.swift"))
        XCTAssertTrue(Self.isExempt("\(ui)/Theme/MeeshyColors.swift"))
        XCTAssertFalse(Self.isExempt("\(app)/Views/ConversationView.swift"))
        XCTAssertFalse(Self.isExempt("\(ui)/Story/StoryViewerOverlay.swift"))
        XCTAssertFalse(Self.isExempt("\(app)/Views/StickerStore.swift"), "« Sticker* » ne s'applique qu'à MeeshyUI/Story")
    }

    // MARK: - Balayage

    private static let scannedRoots = [
        "apps/ios/Meeshy",
        "packages/MeeshySDK/Sources/MeeshyUI",
    ]

    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Guards
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
    }

    private func sourceFiles() throws -> [URL] {
        Self.scannedRoots.flatMap { root -> [URL] in
            let dir = repoRoot.appendingPathComponent(root)
            guard let walker = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil)
            else { return [] }
            return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        }
    }

    /// Chemin relatif à la racine du dépôt, calculé par COMPOSANTS plutôt que par
    /// remplacement de préfixe : l'énumérateur peut rendre `/private/var/…` là où
    /// `#filePath` dit `/var/…` (voir `FixedFontSizeGuardTests`).
    private func relativePath(_ url: URL) -> String {
        let root = repoRoot.standardizedFileURL.pathComponents
        let full = url.standardizedFileURL.pathComponents
        guard full.count > root.count else { return url.lastPathComponent }
        return full.dropFirst(root.count).joined(separator: "/")
    }

    private func takeMeasure() throws -> Measure {
        var counted: [String: [Population: Int]] = [:]
        var exemptCounted: [Population: Int] = [:]
        var scanned = 0
        var exempted = 0

        for url in try sourceFiles() {
            scanned += 1
            let path = relativePath(url)
            let source = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            let perPopulation = Dictionary(
                uniqueKeysWithValues: Population.allCases.map { ($0, Self.count($0, in: source)) }
            )

            if Self.isExempt(path) {
                exempted += 1
                for (population, n) in perPopulation { exemptCounted[population, default: 0] += n }
            } else if perPopulation.values.contains(where: { $0 > 0 }) {
                counted[path] = perPopulation
            }
        }
        return Measure(scanned: scanned, exempted: exempted, counted: counted, exemptCounted: exemptCounted)
    }
}

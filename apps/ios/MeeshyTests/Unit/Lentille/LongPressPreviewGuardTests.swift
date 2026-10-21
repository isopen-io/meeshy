import XCTest
@testable import Meeshy

/// Aperçu d'appui long d'une conversation — décision utilisateur 2026-08-21 :
/// « juste voir les derniers messages dans la preview avec le titre, la
/// bannière, l'image/logo de la conversation et les icônes d'en-tête » ; le
/// menu des modes (Auto · Focal · Script · …) « ne sert à rien » dans
/// l'aperçu — le choix de mode garde ses DEUX portes : l'encoche de la carte
/// de focus et le sous-menu « Mode de lecture » du menu contextuel.
///
/// Les DEUX chemins OS (natif iOS 26+ `.contextMenu(menuItems:preview:)`
/// dans `+Rows.swift`, overlay custom < iOS 26 dans `+Overlays.swift`)
/// montent donc `ConversationPreviewView` — la carte historique des derniers
/// messages — drapeau Lentille ON comme OFF, sans conditionnel. L'ancienne
/// `LentillePeekView` (en-tête + texte + menu des modes, contrat LWS-8/I-072)
/// est SUPPRIMÉE, pas mise sous drapeau : un aperçu qui change de nature
/// selon un drapeau est la dérive que ce témoin interdit.
///
/// Témoins de STRUCTURE (source lue à l'exécution, leçon « ce qui ne
/// s'exécute pas ne se signale pas ») + gardes des fichiers `Lentille/Mode/`
/// reprises de l'ancienne suite `PeekViewModelTests` (timings et cotes gelés).
///
/// behaviour-matrix:L12 — les deux chemins d'appui long (natif iOS 26+,
/// overlay < 26), le sous-menu « Mode de lecture », le ressort de pression gelé
/// et la zone d'exclusion de l'avatar sont gardés ici. L'aperçu, lui, n'est
/// plus `LentillePeekView` (décision du 2026-08-21 ci-dessus). Le témoin web
/// de cet id est parti avec le legacy `apps/web` (#7668) ; le web actuel doit
/// rejouer la matrice (#7717).
final class LongPressPreviewGuardTests: XCTestCase {

    // MARK: - Sources

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func source(_ relativePath: String) throws -> String {
        try String(
            contentsOf: Self.iosRoot.appendingPathComponent(relativePath),
            encoding: .utf8
        )
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    private static let nativePath = "Meeshy/Features/Main/Views/ConversationListView+Rows.swift"
    private static let overlayPath = "Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"

    // MARK: - 1. L'aperçu = la carte des derniers messages, sur les DEUX chemins

    func test_nativeContextMenuPreview_isTheRecentMessagesCard_unconditionally() throws {
        let raw = try source(Self.nativePath)
        XCTAssertEqual(
            occurrences(of: "ConversationPreviewView(", in: raw), 1,
            "Le chemin natif iOS 26+ monte la carte des derniers messages UNE fois, en `preview:`."
        )
        let normalized = normalizedCode(raw)
        XCTAssertTrue(
            normalized.contains("} preview: { ConversationPreviewView("),
            "La carte des derniers messages est l'aperçu LUI-MÊME — pas la branche d'un " +
            "conditionnel de drapeau : l'aperçu ne change pas de nature selon la Lentille."
        )
    }

    func test_customOverlayPreview_isTheRecentMessagesCard_unconditionally() throws {
        let raw = try source(Self.overlayPath)
        XCTAssertEqual(
            occurrences(of: "ConversationPreviewView(", in: raw), 1,
            "Le chemin < iOS 26 (`conversationContextMenuOverlay`) monte la carte des " +
            "derniers messages UNE fois."
        )
        let normalized = normalizedCode(raw)
        XCTAssertFalse(
            normalized.contains("isLentilleListEnabled { ConversationPreviewView(") ||
            normalized.contains("} else { ConversationPreviewView("),
            "La carte des derniers messages ne doit être ni la branche ON ni le repli OFF " +
            "d'un conditionnel de drapeau — elle est l'aperçu, point."
        )
    }

    // MARK: - 2. Le menu des modes a quitté l'aperçu — et la vue qui le portait n'existe plus

    func test_modeMenuPeekView_isGone_fromTheAppTree() throws {
        let enumerator = FileManager.default.enumerator(
            at: Self.iosRoot.appendingPathComponent("Meeshy"),
            includingPropertiesForKeys: nil
        )
        var offenders: [String] = []
        while let url = enumerator?.nextObject() as? URL {
            guard url.pathExtension == "swift" else { continue }
            let code = normalizedCode(try String(contentsOf: url, encoding: .utf8))
            if code.contains("LentillePeekView") {
                offenders.append(url.lastPathComponent)
            }
        }
        XCTAssertEqual(
            offenders, [],
            "`LentillePeekView` (aperçu portant le menu des modes) est SUPPRIMÉE : aucun " +
            "fichier de l'app ne doit plus la déclarer ni la monter — \(offenders)."
        )
    }

    func test_previewClosures_neverMountTheModeMenu() throws {
        for path in [Self.nativePath, Self.overlayPath] {
            let normalized = normalizedCode(try source(path))
            XCTAssertFalse(
                normalized.contains("LentilleModeMenu(") || normalized.contains("LentillePeekView("),
                "\(path) : l'aperçu d'appui long ne porte plus le menu des modes (le " +
                "sous-menu « Mode de lecture » et l'encoche restent ses deux portes)."
            )
        }
    }

    /// Le choix de mode reste joignable depuis le menu contextuel (sous-menu
    /// « Mode de lecture ») : retirer l'aperçu-menu ne retire pas la porte.
    func test_readingModeSubmenu_remainsInTheContextMenu() throws {
        let normalized = normalizedCode(try source(Self.overlayPath))
        XCTAssertTrue(
            normalized.contains("LentilleReadingModeSubmenu("),
            "Le sous-menu « Mode de lecture » doit rester monté dans le menu contextuel — " +
            "c'est désormais, avec l'encoche, l'une des DEUX portes du choix de mode."
        )
    }

    // MARK: - 2 bis. L'aperçu se dessine dans le mode de lecture du fil (#11213)

    private static let renderPath = "Meeshy/Features/Main/Views/ConversationRecentMessagesPreview.swift"
    private static let helpersPath = "Meeshy/Features/Main/Views/ConversationListHelpers.swift"

    /// Les DEUX chemins OS remettent à l'aperçu le mode que le fil ouvrirait —
    /// la même décision, lue au même site.
    func test_bothPaths_passTheThreadsOpeningMode() throws {
        for path in [Self.nativePath, Self.overlayPath] {
            let normalized = normalizedCode(try source(path))
            XCTAssertTrue(
                normalized.contains("readingMode: LentilleReadingModeContext.listPreviewMode(for: conversation)"),
                "\(path) : l'aperçu reçoit le mode d'ouverture du fil, jamais un mode recalculé sur place."
            )
        }
    }

    /// La bulle de l'aperçu porte la peau de la conversation et se mesure à la
    /// carte, pas à la fenêtre.
    func test_recentMessages_bubble_setsTheSkinAndTheCardWidth() throws {
        let normalized = normalizedCode(try source(Self.renderPath))
        XCTAssertTrue(normalized.contains(".environment(\\.bubbleSkin, skin)"), "la bulle porte la peau de la conversation")
        XCTAssertTrue(
            normalized.contains(".environment(\\.bubbleContainerWidth, ConversationPreviewRenderer.bubbleEnvironmentWidth(cardWidth: cardWidth))"),
            "la bulle se mesure à la largeur intérieure de la carte"
        )
    }

    /// Les rangées plates sont la `FocalRow` du fil, construite par la fabrique
    /// de l'aperçu de message — jamais une rangée refaite à la main.
    func test_recentMessages_flatRow_isTheThreadRow() throws {
        let normalized = normalizedCode(try source(Self.renderPath))
        XCTAssertTrue(normalized.contains("FocalRowInput.preview("))
        XCTAssertTrue(normalized.contains("FocalRow(input:"))
    }

    /// iOS 26 : l'aperçu natif n'est pas interactif. Ses boutons y seraient
    /// INERTES (la loupe et l'info ne recevaient aucune action) : ils n'y sont
    /// donc pas, seuls les indicateurs restent.
    func test_nativePreview_isNotInteractive() throws {
        let normalized = normalizedCode(try source(Self.nativePath))
        XCTAssertTrue(normalized.contains("isInteractive: false"))
        let helpers = normalizedCode(try source(Self.helpersPath))
        XCTAssertTrue(
            helpers.contains("if ConversationPreviewRenderer.showsHeaderActions(isInteractive: isInteractive) { foldingHeaderActions }")
                && helpers.contains("private var foldingHeaderActions: some View { ViewThatFits(in: .horizontal) { headerActions("),
            "`headerActions` n'est monté que si l'aperçu est interactif"
        )
    }

    /// Le fondu du haut n'efface que ce qui dépasse : le fil s'ancre en BAS de
    /// la carte, et une conversation courte reste nette jusqu'à sa première
    /// rangée.
    func test_recentMessages_topFade_onlyWhenTheThreadOverflows() throws {
        let normalized = normalizedCode(try source(Self.renderPath))
        XCTAssertTrue(normalized.contains(".frame(minHeight: viewportHeight, alignment: .bottom)"))
        XCTAssertTrue(normalized.contains(".mask { topFade(isActive: ConversationPreviewRenderer.fadesTop(contentHeight: contentHeight, viewportHeight: viewportHeight)) }"))
    }

    /// Les boutons d'en-tête se replient quand trois cibles de 44 pt ne tiennent
    /// plus (volet gauche étroit de l'iPad), au lieu de déborder de la carte.
    func test_headerActions_foldInANarrowColumn() throws {
        let helpers = normalizedCode(try source(Self.helpersPath))
        XCTAssertTrue(helpers.contains("ViewThatFits(in: .horizontal) { headerActions(targetSize: ConversationPreviewRenderer.headerTargetSize) headerActions(targetSize: ConversationPreviewRenderer.compactHeaderTargetSize) }"))
    }

    /// VoiceOver ne lit pas « 1 messages non lus » : le compte des non-lus se
    /// décline au pluriel dans les sept langues, l'arabe sur ses six formes.
    func test_unreadCountLabel_isPluralizedInEveryLanguage() throws {
        let data = try XCTUnwrap(try source("Meeshy/Localizable.xcstrings").data(using: .utf8))
        let catalog = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(catalog["strings"] as? [String: Any])
        let entry = try XCTUnwrap(strings["preview.unread.a11y"] as? [String: Any])
        let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])
        for locale in ["fr", "en", "es", "de", "it", "pt-BR", "ar"] {
            let unit = try XCTUnwrap(localizations[locale] as? [String: Any], locale)
            let plural = try XCTUnwrap((unit["variations"] as? [String: Any])?["plural"] as? [String: Any], locale)
            let expected: Set<String> = locale == "ar" ? ["zero", "one", "two", "few", "many", "other"] : ["one", "other"]
            XCTAssertEqual(Set(plural.keys), expected, locale)
        }
        let helpers = normalizedCode(try source(Self.helpersPath))
        XCTAssertTrue(helpers.contains("String(localized: \"preview.unread.a11y\", defaultValue: \"\\(conversation.userState.unreadCount) messages non lus\", bundle: .main)"))
    }

    /// Le repli < iOS 26 lit Réduire les animations : l'entrée devient un
    /// fondu, sans émergence, sans rebond ni flou.
    func test_fallback_readsReduceMotion() throws {
        let normalized = normalizedCode(try source(Self.overlayPath))
        XCTAssertTrue(normalized.contains("@Environment(\\.accessibilityReduceMotion)"))
        XCTAssertTrue(normalized.contains("@Environment(\\.meeshyForceReduceMotion)"))
        XCTAssertTrue(normalized.contains("runContextMenuEmergence(reduceMotion: reduceMotion)"))
    }

    /// Le repli < iOS 26 : toucher la carte ouvre la conversation, comme
    /// l'aperçu natif — par la PORTE du verrou (`openConversation`), comme le
    /// toucher d'une rangée. Un `onSelect` nu ouvrait une conversation
    /// verrouillée par PIN sans le demander : aucun autre site ne revérifie le
    /// verrou (revue adversariale #11213).
    func test_fallback_tapOnTheCard_opensTheConversationThroughTheLock() throws {
        let normalized = normalizedCode(try source(Self.overlayPath))
        XCTAssertTrue(normalized.contains(".contentShape(Rectangle()) .onTapGesture { dismissContextMenu() openConversation(conversation) }"))
    }

    /// La loupe de l'aperçu et l'entrée « Rechercher » du menu natif passent la
    /// même porte, en gardant la recherche pour après le PIN.
    func test_searchPaths_openThroughTheLock() throws {
        let normalized = normalizedCode(try source(Self.overlayPath))
        XCTAssertEqual(occurrences(of: "openConversation(conversation, searching: true)", in: normalized), 2)
        XCTAssertFalse(
            normalized.contains("router.pendingOpenSearch = true"),
            "la recherche ne s'arme qu'une fois le verrou franchi (`ConversationOpenRoute.armsSearchNow`)"
        )
    }

    /// Aucun chemin d'appui long n'ouvre une conversation par `onSelect` nu.
    func test_longPressPaths_neverOpenWithABareOnSelect() throws {
        for path in [Self.overlayPath, Self.nativePath] {
            let normalized = normalizedCode(try source(path))
            XCTAssertFalse(normalized.contains("onSelect("), "\(path) : une ouverture passe par `openConversation`, la porte du verrou")
        }
    }

    /// Une fenêtre détachée ne demande pas le PIN : les deux portes vers elle
    /// (l'entrée du menu natif, le glissé de rangée) lisent la loi du verrou.
    func test_detachedWindowPaths_readTheLock() throws {
        let overlay = normalizedCode(try source(Self.overlayPath))
        XCTAssertTrue(overlay.contains("DetachedWindowOpener.shared.isAvailable, ConversationOpenRoute.mayDetach(conversation.id)"))
        let rows = normalizedCode(try source(Self.nativePath))
        XCTAssertTrue(rows.contains("ConversationOpenRoute.mayDetach(conversation.id)"))
        for path in [Self.overlayPath, Self.nativePath] {
            let normalized = normalizedCode(try source(path))
            XCTAssertFalse(normalized.contains("router.navigateToConversation("), "\(path) : une ouverture passe par `openConversation`")
            XCTAssertFalse(normalized.contains("router.push(.conversation"), "\(path) : une ouverture passe par `openConversation`")
        }
    }

    /// La porte elle-même : le toucher d'une rangée, le clavier et l'appui long
    /// lisent la même loi, et la feuille de verrou garde la recherche demandée.
    func test_openConversation_isTheSingleLockGate() throws {
        let list = normalizedCode(try source("Meeshy/Features/Main/Views/ConversationListView.swift"))
        XCTAssertTrue(list.contains("func openConversation(_ conversation: Conversation, searching: Bool = false)"))
        XCTAssertTrue(list.contains("ConversationOpenRoute.resolve(conversation.id, searching: searching)"))
        XCTAssertFalse(list.contains("private func openConversation(_ conversation: Conversation"))
        let presentations = normalizedCode(try source("Meeshy/Features/Main/Views/ConversationListView+Presentations.swift"))
        XCTAssertTrue(presentations.contains("sheetTargets.searchAfterUnlock"))
    }

    /// Prisme (patron `ConversationPreviewPrismSourceGuardTests`) : l'aperçu
    /// rend la traduction que le chargeur a ÉLUE par `ReaderPrism` — jamais une
    /// seconde descente, jamais `translations.first`, jamais le prisme à repli
    /// « fr » de `preferredContentLanguages`.
    func test_recentMessages_servesTheElectedTranslationOnly() throws {
        let normalized = normalizedCode(try source(Self.renderPath))
        XCTAssertTrue(normalized.contains("preferredTranslation: served[message.id]"))
        XCTAssertTrue(normalized.contains("servedTranslation: served[message.id]"))
        for forbidden in ["translations.first", ".first?.translatedContent", "preferredContentLanguages", "ReaderPrism.resolve"] {
            XCTAssertFalse(normalized.contains(forbidden), "l'aperçu ne redescend pas le Prisme : « \(forbidden) »")
        }
    }

    // MARK: - 3. Gardes de source — timings et cotes gelés NON redéfinis dans Lentille/Mode/

    private static var modeDirectory: URL {
        Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Lentille/Mode")
    }

    /// Découverte dynamique (leçon 257) — jamais une liste de fichiers
    /// recopiée à la main : un fichier ajouté demain à `Lentille/Mode/`
    /// entre automatiquement sous cette garde.
    private func modeSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.modeDirectory, includingPropertiesForKeys: nil
        )
        return try entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    func test_guardDiscoversAtLeastOneModeSourceFile_neverSilentlyEmpty() throws {
        XCTAssertFalse(
            try modeSources().isEmpty,
            "La garde n'a chargé AUCUN fichier depuis `\(Self.modeDirectory.path)` — elle " +
            "passerait alors au vert sans rien vérifier (leçon 257)."
        )
    }

    /// Critère LWS-8 : « timings, spring 0.55/0.25 … gelés ». Le spring peu
    /// amorti du rebond de long-press (`RowPressBounceModifier
    /// .spring(response: 0.55, dampingFraction: 0.25)`) vit dans
    /// `ConversationListView+Rows.swift` et SEULEMENT là — `Lentille/Mode/`
    /// ne doit jamais recomposer sa propre paire `(0.55, 0.25)`.
    func test_modeFiles_neverRedefineTheFrozenPressBounceSpring() throws {
        for source in try modeSources() {
            for forbidden in ["0.55", "0.25"] {
                XCTAssertEqual(
                    source.code.components(separatedBy: forbidden).count - 1, 0,
                    "\(source.name) contient « \(forbidden) » (source BRUTE, commentaires " +
                    "compris) : les timings du geste d'appui long sont GELÉS dans " +
                    "`RowPressBounceModifier` (`ConversationListView+Rows.swift`) — " +
                    "critère LWS-8, « timings … gelés »."
                )
            }
        }
    }

    /// Critère LWS-8 : « zone d'exclusion avatar 70 pt … consommée pas
    /// recalculée » — `Lentille/Mode/` ne recompose jamais son propre
    /// littéral `70` (recherche par limite de mot : `I-070` en commentaire
    /// n'est pas une cote).
    func test_modeFiles_neverHardcodeTheAvatarExclusionZoneAsALiteral() throws {
        let pattern = "\\b70\\b"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            XCTFail("Regex de garde invalide pour la zone d'exclusion avatar — corriger le motif avant de faire confiance à ce témoin.")
            return
        }
        for source in try modeSources() {
            let range = NSRange(source.code.startIndex..<source.code.endIndex, in: source.code)
            XCTAssertEqual(
                regex.numberOfMatches(in: source.code, range: range), 0,
                "\(source.name) contient un `70` isolé : la zone d'exclusion avatar " +
                "(`ConversationRowMetrics.avatarInteractionExclusionWidth`) se CONSOMME, " +
                "elle ne se RECALCULE pas dans `Lentille/Mode/`."
            )
        }
    }
}

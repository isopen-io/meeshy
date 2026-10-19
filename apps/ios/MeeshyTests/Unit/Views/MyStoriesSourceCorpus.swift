import Foundation
import XCTest

/// Source des fichiers qui composent « Mes stories », vue comme UN corpus.
///
/// Cinq suites de gardes lisaient `MyStoriesView.swift` en dur. Tant que la
/// fonctionnalité tenait dans un fichier de 1085 lignes, l'ancrage était exact ;
/// dès qu'elle se décompose (carte, bande de glyphes, onglets, listes), chaque
/// extraction les fait virer au rouge sans qu'aucun COMPORTEMENT n'ait changé —
/// exactement le mode d'échec décrit dans
/// `reference_source_guard_fixed_char_windows_rot` et
/// `feedback_extract_refactor_breaks_source_guard_tests`.
///
/// Les gardes interrogent donc le corpus. Déplacer du code d'un de ces fichiers
/// vers un autre est invisible pour elles ; le SUPPRIMER reste rouge, ce qui est
/// précisément ce qu'elles doivent protéger.
enum MyStoriesSourceCorpus {

    /// Fichiers du corpus, relatifs à `apps/ios/`. Un fichier absent est ignoré
    /// en silence : la liste anticipe la décomposition à venir, et une garde ne
    /// doit pas échouer parce qu'un fichier n'existe pas ENCORE.
    static let relativePaths = [
        "Meeshy/Features/Main/Views/MyStoriesView.swift",
        "Meeshy/Features/Main/Views/MyStoriesPublishedTab.swift",
        "Meeshy/Features/Main/Views/MyStoriesDraftsTab.swift",
        "Meeshy/Features/Main/Views/MyStoryCard.swift",
        "Meeshy/Features/Main/Views/MyStoryActionBar.swift",
        "Meeshy/Features/Main/Views/MyStoryThumbnail.swift",
        "Meeshy/Features/Main/Views/MyStoryCardPresentation.swift",
        "Meeshy/Features/Main/Views/MyStoriesDeleteConfirmation.swift",
        "Meeshy/Features/Main/Views/MyStoriesDeleteAlerts.swift",
        "Meeshy/Features/Main/Views/MyStoriesQueueRows.swift",
        "Meeshy/Features/Main/Views/MyStoriesSheetTargets.swift",
        "Meeshy/Features/Main/Views/MyStoryActionMenu.swift",
        "Meeshy/Features/Main/Views/MyStoryCardModelRules.swift",
        "Meeshy/Features/Main/Views/StoryVisibilityMenuResolver.swift",
    ]

    /// Racine `apps/ios/`, dérivée du chemin du fichier APPELANT.
    ///
    /// **Elle REMONTE jusqu'à `MeeshyTests`, elle ne compte plus les crans.**
    /// La forme d'origine retirait quatre composants, ce qui suppose que tout
    /// appelant vit exactement à `MeeshyTests/Unit/Views/`. `file` valant
    /// `#filePath` par DÉFAUT, c'est le chemin de l'appelant qui décide — et
    /// la première garde rangée un cran plus profond
    /// (`Unit/Views/Bubble/`, #4098) a obtenu `apps/ios/MeeshyTests` pour
    /// racine, puis dix erreurs « no such file » sur des fichiers bien
    /// présents.
    ///
    /// Le mode de panne bruyant est le CAS HEUREUX : si la mauvaise racine
    /// avait contenu un fichier de même nom, la garde aurait lu le MAUVAIS
    /// fichier et serait passée au vert. Une racine se REMONTE jusqu'à un
    /// repère nommé ; elle ne se compte pas.
    static func appRoot(file: StaticString = #filePath) -> URL {
        var url = URL(fileURLWithPath: String(describing: file)).deletingLastPathComponent()
        while url.lastPathComponent != "MeeshyTests", url.pathComponents.count > 1 {
            url = url.deletingLastPathComponent()
        }
        return url.deletingLastPathComponent()   // ios
    }

    /// Le corpus concaténé, commentaires RETIRÉS.
    ///
    /// Sans ce filtrage, une garde passe au vert parce qu'un commentaire cite
    /// la ligne qu'elle cherche — le défaut relevé dans
    /// `feedback_source_guard_tests_must_strip_comments`.
    static func text(file: StaticString = #filePath) -> String {
        let root = appRoot(file: file)
        return relativePaths
            .compactMap { try? String(contentsOf: root.appendingPathComponent($0), encoding: .utf8) }
            .map(strippingComments)
            .joined(separator: "\n")
    }

    /// Source d'UN fichier du corpus, commentaires retirés. Pour les rares
    /// gardes qui doivent vraiment viser un fichier précis.
    static func text(of relativePath: String, file: StaticString = #filePath) throws -> String {
        let url = appRoot(file: file).appendingPathComponent(relativePath)
        return strippingComments(try AppSourceGuard.text(at: url))
    }

    // MARK: - Retrait des commentaires

    static func strippingComments(_ source: String) -> String {
        var output: [String] = []
        var insideBlock = false

        for rawLine in source.components(separatedBy: .newlines) {
            var line = rawLine

            if insideBlock {
                guard let end = line.range(of: "*/") else { continue }
                line = String(line[end.upperBound...])
                insideBlock = false
            }

            while let start = line.range(of: "/*") {
                if let end = line.range(of: "*/", range: start.upperBound..<line.endIndex) {
                    line = String(line[..<start.lowerBound]) + String(line[end.upperBound...])
                } else {
                    line = String(line[..<start.lowerBound])
                    insideBlock = true
                    break
                }
            }

            // `//` dans un littéral de chaîne n'ouvre pas un commentaire :
            // une URL "https://…" tronquerait la ligne et pourrait faire
            // disparaître le code que la garde cherche.
            if let slashes = indexOfLineComment(in: line) {
                line = String(line[..<slashes])
            }

            output.append(line)
        }
        return output.joined(separator: "\n")
    }

    private static func indexOfLineComment(in line: String) -> String.Index? {
        var insideString = false
        var previous: Character?
        var index = line.startIndex

        while index < line.endIndex {
            let character = line[index]
            if character == "\"" && previous != "\\" { insideString.toggle() }
            if !insideString, character == "/", previous == "/" {
                return line.index(before: index)
            }
            previous = character
            index = line.index(after: index)
        }
        return nil
    }
}

/// **L'unité de source du lecteur de story, après la découpe par cohésion.**
///
/// `StoryViewerView.swift`, `StoryViewerView+Canvas.swift` et `StoryViewerView+Content.swift`
/// ont cédé leurs responsabilités à de VRAIS types (le geste, ses décisions, la liste des
/// commentaires, l'interstitiel, les feuilles, les règles de contenu…) rangés sous leur propre
/// nom. Le glob `AppSourceGuard.unit` ne suit que les fichiers `StoryViewerView+…` : une garde
/// NÉGATIVE (« ce code n'apparaît nulle part ») qui lirait seulement l'unité verdirait donc
/// en silence sur la moitié qui a changé de nom. Cette liste est l'adresse de cette moitié.
enum StoryViewerSources {

    static let views = "Meeshy/Features/Main/Views/"

    /// Les types sortis des trois fichiers, par nom de fichier.
    static let companionFiles = [
        "PrefetcherHostView.swift",
        "RenderableSlideCache.swift",
        "RevealCircleShape.swift",
        "StoryCommentThread.swift",
        "StoryCommentsOverlayView.swift",
        "StoryDraft.swift",
        "StoryGestureDecisions.swift",
        "StoryGestureOverlayView.swift",
        "StoryGroupIntroOverlay.swift",
        "StoryGroupIntroPolicy.swift",
        "StoryOpeningEntrance.swift",
        "StoryPlaybackStallIndicator.swift",
        "StoryPostMediaResolver.swift",
        "StoryReactionRecovery.swift",
        "StoryReaderBackground.swift",
        "StoryReaderCanvasLayout.swift",
        "StoryReaderContentRules.swift",
        "StoryReaderSurfaceRules.swift",
        "StoryVerticalGestureDecisions.swift",
        "StoryVideoAudioProbe.swift",
        "StoryViewerCardTransform.swift",
        "StoryViewerEngagement.swift",
        "StoryViewerSheetItems.swift",
        "StoryViewerSheets.swift",
        "View+StoryOverlayLegible.swift",
    ]

    static let companions = companionFiles.map { views + $0 }

    /// Le lecteur tout entier : les trois fichiers, leurs extensions et leurs types.
    static func unit() throws -> String {
        try AppSourceGuard.unit(views + "StoryViewerView.swift", alsoIncluding: companions)
    }
}

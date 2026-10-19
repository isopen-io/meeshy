import XCTest

/// **Le lecteur de stories prépare ses voisines dès la première image de N**
/// (#10348) : la loi `StoryNeighborWindow` est appelée par le lecteur, et
/// appelée au premier affichage — pas à 5 s de la fin de la slide.
final class StoryNeighborWindowSourceGuardTests: XCTestCase {

    private static let viewsDirectory = "apps/ios/Meeshy/Features/Main/Views/"

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Tests/MeeshyUITests/Story
            .deletingLastPathComponent()   // .../Tests/MeeshyUITests
            .deletingLastPathComponent()   // .../Tests
            .deletingLastPathComponent()   // .../MeeshySDK
            .deletingLastPathComponent()   // .../packages
            .deletingLastPathComponent()   // racine du dépôt
    }

    private func source(_ file: String) throws -> String {
        try String(contentsOf: Self.repoRoot.appendingPathComponent(Self.viewsDirectory + file), encoding: .utf8)
    }

    func test_viewer_preparesNeighborsWhenTheVisibleCanvasReportsItsFirstImage() throws {
        // Le montage de l'horloge (`onProgressChange`) vit dans `+PrefetchPipeline`, avec la chaleur des voisins.
        let viewer = try source("StoryViewerView.swift") + source("StoryViewerView+PrefetchPipeline.swift")
        let compact = viewer.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\n", with: "")

        XCTAssertTrue(
            compact.contains("guardready,letid=currentStory?.idelse{return}slideTimer.markContentReady(slideId:id)prepareNeighborWindow()"),
            "le signal de première image du canvas visible (isContentReady) doit armer prepareNeighborWindow()"
        )
        XCTAssertTrue(
            compact.contains("ifp>0&&!hasFiredNextPrefetch{hasFiredNextPrefetch=trueprepareNeighborWindow()}"),
            "le premier tic de l'horloge (qui ne compte qu'une fois le contenu affiché) sert de filet"
        )
        XCTAssertFalse(
            viewer.contains("prefetchStory(at: currentStoryIndex + 1)"),
            "plus d'amorçage de N+1 à 5 s de la fin de la slide"
        )
        XCTAssertTrue(viewer.contains("authorSwipeWarmItems()"),
                      "le canvas voisin chauffé est celui où le balayage d'auteur atterrit")
    }

    func test_neighborWindow_isComputedByTheSharedLaw() throws {
        let prefetch = try source("StoryViewerView+Prefetch.swift")

        XCTAssertTrue(prefetch.contains("StoryNeighborWindow.preparations("))
        XCTAssertTrue(prefetch.contains("StoryNeighborWindow.authorSwipeLandings("))
    }

    func test_slideChange_interruptsTheWindowInsteadOfFiringNeighborsInParallel() throws {
        let content = try source("StoryViewerView+Content.swift")

        XCTAssertTrue(content.contains("interruptNeighborWindow()"))
        XCTAssertFalse(content.contains("prefetchStory(at: currentStoryIndex + 1)"))
        XCTAssertFalse(content.contains("prefetchStory(at: currentStoryIndex + 2)"))
    }
}

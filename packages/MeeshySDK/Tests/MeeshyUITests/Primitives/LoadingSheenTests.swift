import XCTest
@testable import MeeshyUI

/// #9869 — une image qui ne charge pas ne scintille plus : le reflet de
/// chargement ne balaie que pendant un VRAI chargement, et il n'en reste
/// qu'UN dans le SDK.
final class LoadingSheenLawTests: XCTestCase {

    func test_animates_onlyARealLoadSweeps() {
        XCTAssertTrue(LoadingSheenLaw.animates(phase: .loading, reduceMotion: false))
        XCTAssertFalse(LoadingSheenLaw.animates(phase: .failed, reduceMotion: false),
                       "un échec n'est pas un chargement : placeholder statique")
        XCTAssertFalse(LoadingSheenLaw.animates(phase: .deferred, reduceMotion: false),
                       "une image retenue par la politique attend un geste : placeholder statique")
    }

    func test_animates_reduceMotionStopsEvenARealLoad() {
        XCTAssertFalse(LoadingSheenLaw.animates(phase: .loading, reduceMotion: true))
        XCTAssertFalse(LoadingSheenLaw.animates(phase: .failed, reduceMotion: true))
        XCTAssertFalse(LoadingSheenLaw.animates(phase: .deferred, reduceMotion: true))
    }

    func test_phase_withoutURL_isFailed() {
        XCTAssertEqual(
            LoadingSheenLaw.phase(hasURL: false, fetchDeferredByPolicy: false, fetchFailed: false),
            .failed,
            "sans URL, rien ne chargera jamais"
        )
    }

    func test_phase_policyHoldsTheFetch_isDeferred() {
        XCTAssertEqual(
            LoadingSheenLaw.phase(hasURL: true, fetchDeferredByPolicy: true, fetchFailed: false),
            .deferred
        )
    }

    func test_phase_fetchFailed_isFailed_evenIfPreviouslyDeferred() {
        XCTAssertEqual(
            LoadingSheenLaw.phase(hasURL: true, fetchDeferredByPolicy: true, fetchFailed: true),
            .failed
        )
        XCTAssertEqual(
            LoadingSheenLaw.phase(hasURL: true, fetchDeferredByPolicy: false, fetchFailed: true),
            .failed
        )
    }

    func test_phase_nominal_isLoading() {
        XCTAssertEqual(
            LoadingSheenLaw.phase(hasURL: true, fetchDeferredByPolicy: false, fetchFailed: false),
            .loading
        )
    }
}

/// Garde de source : un seul reflet animé dans MeeshyUI, et les deux hôtes de
/// placeholder d'image déclarent leur état au reflet.
final class LoadingSheenSourceGuardTests: XCTestCase {

    private static let animationPrimitives = ["repeatForever(", "CABasicAnimation(", "TimelineView("]

    /// Toute déclaration de premier niveau de MeeshyUI qui nomme un reflet ET
    /// porte une primitive d'animation sans fin est un reflet jumeau. Un seul
    /// fichier en porte. Le découpage par déclaration évite de compter les
    /// effets voisins (`PulseEffect`, `BreathingGlow`) d'un fichier qui
    /// déclare aussi `.shimmer()`.
    /// Les reflets qui ORNENT un objet affiché, sans rien dire d'un chargement.
    /// `FrameMotionLayers` fait glisser le reflet d'un cadre de profil (#10935) :
    /// il joue pendant que l'image est là, jamais à sa place.
    private static let decorativeSheens: Set<String> = ["FrameMotionLayers.swift"]

    func test_meeshyUI_hasExactlyOneAnimatedSheen() throws {
        let found = try Self.allMeeshyUISources()
            .filter { Self.isAnimatedSheen($0.code) }
            .map { ($0.path as NSString).lastPathComponent }
            .filter { !Self.decorativeSheens.contains($0) }

        XCTAssertEqual(
            Set(found), ["LoadingSheen.swift"],
            "Un reflet de chargement jumeau est réapparu : `.shimmer()` et `.skeletonShimmer()` " +
            "délèguent à `LoadingSheen`, qui seul anime."
        )
    }

    func test_imageHosts_declareTheirPhaseToThePlaceholder() throws {
        let code = ComposerSourceGuard.stripComments(try String(
            contentsOf: ComposerSourceGuard.packageRoot
                .appendingPathComponent("Sources/MeeshyUI/Primitives/CachedAsyncImage.swift"),
            encoding: .utf8
        ))
        let declarations = code.components(separatedBy: ".loadingSheenPhase(").count - 1
        XCTAssertGreaterThanOrEqual(
            declarations, 2,
            "CachedAsyncImage et ProgressiveCachedImage doivent dire au placeholder s'il charge vraiment."
        )
        XCTAssertTrue(code.contains("LoadingSheenLaw.phase("),
                      "l'état du placeholder se dérive de la loi pure, jamais d'une boucle locale")
    }

    func test_publicShimmerAPIs_delegateToTheUniqueSheen() throws {
        let skeleton = try Self.source("Primitives/SkeletonView.swift")
        let modifiers = try Self.source("Theme/ViewModifiers.swift")
        XCTAssertTrue(skeleton.contains("LoadingSheen(style:"))
        XCTAssertTrue(modifiers.contains("LoadingSheen(style:"))
    }

    // MARK: - Méta-tests

    func test_guardDetectsATwinSheen() {
        let twin = """
        struct OtherShimmer: ViewModifier {
            func body(content: Content) -> some View {
                content.animation(.linear.repeatForever(autoreverses: false), value: x)
            }
        }
        """
        XCTAssertTrue(Self.isAnimatedSheen(twin))
    }

    func test_guardIgnoresANeighbourEffectOfTheSameFile() {
        let file = """
        public struct ShimmerEffect: ViewModifier {
            public func body(content: Content) -> some View {
                content.modifier(LoadingSheen(style: .veil))
            }
        }

        public struct PulseEffect: ViewModifier {
            public func body(content: Content) -> some View {
                content.animation(.easeInOut.repeatForever(autoreverses: true), value: x)
            }
        }
        """
        XCTAssertFalse(Self.isAnimatedSheen(file))
    }

    func test_guardIgnoresAStaticPlaceholderAndComments() {
        let sample = ComposerSourceGuard.stripComments("""
        // l'ancien shimmer utilisait repeatForever(autoreverses: false)
        Color.gray.shimmer()
        """)
        XCTAssertFalse(Self.isAnimatedSheen(sample))
    }

    // MARK: - Outils

    private static func isAnimatedSheen(_ code: String) -> Bool {
        code.components(separatedBy: "\n}\n").contains { declaration in
            guard declaration.range(of: "shimmer|sheen", options: [.regularExpression, .caseInsensitive]) != nil else {
                return false
            }
            return animationPrimitives.contains { declaration.contains($0) }
        }
    }

    private static func source(_ relative: String) throws -> String {
        ComposerSourceGuard.stripComments(try String(
            contentsOf: ComposerSourceGuard.packageRoot
                .appendingPathComponent("Sources/MeeshyUI")
                .appendingPathComponent(relative),
            encoding: .utf8
        ))
    }

    private static func allMeeshyUISources() throws -> [(path: String, code: String)] {
        let root = ComposerSourceGuard.packageRoot.appendingPathComponent("Sources/MeeshyUI")
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
        var out: [(path: String, code: String)] = []
        for case let url as URL in walker where url.pathExtension == "swift" {
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            let raw = try String(contentsOf: url, encoding: .utf8)
            out.append((relative, ComposerSourceGuard.stripComments(raw)))
        }
        return out.sorted { $0.path < $1.path }
    }
}

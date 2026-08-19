import XCTest
import SwiftUI
@testable import Meeshy

/// Garde anti-débordement de pile pour les `body` les plus lourds de l'app.
///
/// **Le crash mesuré ici** — 18 rapports `.ips` sur device entre le
/// 2026-07-24 et le 2026-08-19, tous `EXC_BAD_ACCESS` /
/// `KERN_PROTECTION_FAILURE` **dans la page de garde de la pile** :
///
///     Stack Guard  16ef7c000-16ef80000 [ 16K] ---/rwx
///     Stack        16ef80000-16f07c000 [1008K]
///     fault @ 0x16ef7fe90   sp = 0x16ef7fe50   ← sp SOUS le plancher
///
/// La trame fautive est toujours le décodeur de métadonnées RÉCURSIF du
/// runtime Swift (`swift_getTypeByMangledName` →
/// `TypeDecoder::decodeMangledType` ⇄ `decodeGenericArgs`), atteint depuis
/// ~90 trames d'AttributeGraph SwiftUI. Chaque niveau d'imbrication du type
/// concret coûte ~7,5 Ko de pile (tampons `SmallVector` en ligne) : au-delà
/// de ~130 niveaux, les 1008 Ko du main thread sont épuisés.
///
/// **Pourquoi `AnyView` n'y suffit pas** — et pourquoi cette garde ne teste
/// PAS la présence d'`AnyView`. `AnyView` plafonne le type vu par
/// l'APPELANT, mais le getter doit quand même matérialiser le type concret
/// du sous-arbre effacé, à la profondeur de pile où il est appelé. Six
/// `AnyView` successifs ont été posés sur la chaîne du header
/// (`floatingHeaderSection` → `expandedHeaderBand` →
/// `expandedHeaderMidContent` → `headerButtonsCluster` →
/// `readingModeAffordanceCluster` → `expandedHeaderSearchButton`) entre le
/// 2026-07-30 et le 2026-08-17 : le crash s'est déplacé de maillon en
/// maillon sans jamais disparaître.
///
/// **L'invariant qui tient** — seule une struct `View` NOMINALE crée un
/// nœud d'attribut AttributeGraph, donc un point de RÉ-ENTRÉE où SwiftUI
/// déroule la pile avant d'évaluer le `body` de l'enfant. Preuve dans les
/// données : sur les 34 `.ips`, les seuls `body` de structs nominales
/// présents dans une pile fautive sont les trois RACINES d'évaluation
/// (`ConversationView`, `BubbleStandardLayout`, `ConversationListView`).
/// Aucune struct nominale ENFANT (`ConversationHeaderAvatarView`,
/// `HeaderCallButtonsView`, `ReadingModeChip`…) n'apparaît jamais imbriquée
/// sous elles — alors que chaque propriété calculée de la chaîne y figure.
///
/// Donc : on borne la profondeur de CHAQUE `body`, ce qui force le découpage
/// en vues nominales / `ViewModifier` au lieu d'un effacement cosmétique.
@MainActor
final class ConversationViewBodyTypeDepthTests: XCTestCase {

    /// Profondeur d'imbrication générique maximale tolérée pour un `body`.
    ///
    /// 40 niveaux × ~7,5 Ko ≈ 300 Ko de récursion du démangleur : tient dans
    /// les 1008 Ko du main thread même atteint depuis le fond de
    /// l'AttributeGraph (~90 trames ≈ 400 Ko déjà consommés), et tient aussi
    /// dans les 512 Ko d'un thread secondaire — cas
    /// `com.apple.uikit.datasource.diffing` de `BubbleStandardLayout`
    /// (3 `.ips` du 2026-08-10).
    private static let maxSafeNestingDepth = 40

    func test_conversationViewBody_nestingStaysWithinStackBudget() throws {
        try assertNestingWithinBudget(of: ConversationView.Body.self, label: "ConversationView.body")
    }

    func test_bubbleStandardLayoutBody_nestingStaysWithinStackBudget() throws {
        try assertNestingWithinBudget(of: BubbleStandardLayout.Body.self, label: "BubbleStandardLayout.body")
    }

    func test_conversationListViewBody_nestingStaysWithinStackBudget() throws {
        try assertNestingWithinBudget(of: ConversationListView.Body.self, label: "ConversationListView.body")
    }

    // MARK: - Harnais

    private func assertNestingWithinBudget(of type: Any.Type, label: String) throws {
        let measured = try Self.measureOnDeepStack(type)
        XCTAssertLessThanOrEqual(
            measured.depth, Self.maxSafeNestingDepth,
            """
            \(label) imbrique son type concret sur \(measured.depth) niveaux \
            (budget \(Self.maxSafeNestingDepth)). Le décodeur de métadonnées Swift \
            récurse une fois par niveau à ~7,5 Ko de pile : \(measured.depth) niveaux \
            ≈ \(measured.depth * 7500 / 1024) Ko, à comparer aux 1008 Ko du main \
            thread dont ~400 sont déjà pris par l'AttributeGraph au moment de la \
            résolution. Découper en structs `View` NOMINALES (chacune crée un nœud \
            d'attribut où SwiftUI déroule la pile) ou en `ViewModifier` — un \
            `AnyView` de plus ne ferait que déplacer le crash au maillon suivant.
            Nom de type mesuré (\(measured.typeNameLength) caractères) tronqué :
            \(measured.excerpt)
            """
        )
    }

    private struct Measurement {
        let depth: Int
        let typeNameLength: Int
        let excerpt: String
    }

    /// Mesure sur un thread à pile de 64 Mo : matérialiser le type concret
    /// est précisément l'opération coûteuse qu'on cherche à borner, et elle
    /// ferait tomber le process de test sur la pile par défaut tant que la
    /// dette n'est pas remboursée. Le harnais ne doit pas crasher pour dire
    /// qu'il y a trop de profondeur — il doit le MESURER.
    private static func measureOnDeepStack(_ type: Any.Type) throws -> Measurement {
        var result: Measurement?
        let thread = Thread {
            let name = _typeName(type, qualified: false)
            result = Measurement(
                depth: maxAngleBracketDepth(of: name),
                typeNameLength: name.count,
                excerpt: String(name.prefix(600))
            )
        }
        thread.stackSize = 64 * 1024 * 1024
        thread.start()
        let deadline = Date().addingTimeInterval(60)
        while result == nil, Date() < deadline { usleep(2000) }
        guard let measured = result else {
            throw XCTSkip("Mesure de profondeur de type non terminée en 60 s")
        }
        return measured
    }

    /// Profondeur d'imbrication maximale des chevrons génériques. Les tuples
    /// `TupleView<(A, B, C)>` comptent pour un seul niveau de chevron mais
    /// chacun de leurs éléments porte sa propre imbrication — c'est bien le
    /// maximum atteint sur un chemin qui borne la récursion du démangleur.
    static func maxAngleBracketDepth(of typeName: String) -> Int {
        var depth = 0
        var maximum = 0
        for character in typeName {
            switch character {
            case "<", "(":
                depth += 1
                maximum = max(maximum, depth)
            case ">", ")":
                depth -= 1
            default:
                break
            }
        }
        return maximum
    }
}

/// Garde de SOURCE, complémentaire de la garde runtime ci-dessus.
///
/// Une fois un maillon érasé en `AnyView` à sa déclaration, son type ne
/// remonte plus dans le `body` de la racine — donc la garde runtime ne le
/// VOIT plus. C'est précisément l'effet recherché, mais cela crée un angle
/// mort : rien n'empêcherait un refactor de rendre `some View` à un maillon
/// et de ressusciter le débordement de pile, la garde runtime restant verte.
///
/// Cette garde fige donc l'invariant à la source : les maillons listés
/// ci-dessous sont ceux qu'un `.ips` device a effectivement tués, ou ceux qui
/// portaient le chemin le plus profond du type au moment du diagnostic
/// (2026-08-19). Chacun DOIT rester érasé à sa DÉCLARATION — pas seulement à
/// son site d'appel : l'appelant doit résoudre le type opaque COMPOSITE d'un
/// maillon `some View` avant de pouvoir le boxer, donc une érasure posée
/// uniquement au site d'appel ne coupe rien.
@MainActor
final class ConversationViewLayerErasureSourceGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Maillon → fichier. Chaque entrée doit se déclarer en `AnyView`.
    private static let erasedLayers: [(declaration: String, file: String)] = [
        ("private var bodyWithSheets: AnyView", "Meeshy/Features/Main/Views/ConversationView.swift"),
        ("private var bodyWithCovers: AnyView", "Meeshy/Features/Main/Views/ConversationView.swift"),
        ("private var bodyWithLifecycle: AnyView", "Meeshy/Features/Main/Views/ConversationView.swift"),
        ("private var bodyContent: AnyView", "Meeshy/Features/Main/Views/ConversationView.swift"),
        ("var themedComposer: AnyView", "Meeshy/Features/Main/Views/ConversationView+Composer.swift"),
        ("func quickReactionBarOverlay(for messageId: String) -> AnyView",
         "Meeshy/Features/Main/Views/ConversationView+MessageRow.swift"),
        ("private var mainContent: AnyView", "Meeshy/Features/Main/Views/ConversationListView.swift"),
        ("private var mainContentZStack: AnyView", "Meeshy/Features/Main/Views/ConversationListView.swift"),
        ("private func contentStack(shouldBlur: Bool) -> AnyView",
         "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift"),
        ("private var bubbleInnerContent: AnyView",
         "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift"),
        ("var visualMediaGrid: AnyView",
         "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift"),
        ("func mediaWithReplyContainer(reply: BubbleContent.Reply) -> AnyView",
         "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
    ]

    func test_heavyViewLayers_stayTypeErasedAtDeclaration() throws {
        for layer in Self.erasedLayers {
            let stripped = AppSourceGuard.stripComments(try source(layer.file))
            XCTAssertTrue(
                stripped.contains(layer.declaration),
                """
                \(layer.file) doit déclarer « \(layer.declaration) ».
                Ce maillon a été érasé le 2026-08-19 pour borner la récursion du \
                décodeur de métadonnées Swift, qui débordait la pile du main thread \
                (18 rapports .ips device, EXC_BAD_ACCESS dans la Stack Guard). \
                Le rendre `some View` fait remonter son type dans celui de son \
                appelant et rouvre le débordement.
                """
            )
        }
    }

    /// `adaptiveOnChange` / `adaptiveGlass` sont appelés 233 et 87 fois. Portés
    /// par un `@ViewBuilder` + `if #available`, ils produisaient un
    /// `_ConditionalContent` qui embarque les DEUX branches — le type de chaque
    /// appelant doublait, pour 2 niveaux d'imbrication au lieu de 1. Ils
    /// DOIVENT rester des `ViewModifier`.
    func test_compatibilityShims_useViewModifier_notViewBuilder() throws {
        let onChange = AppSourceGuard.stripComments(
            try source("../../packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveOnChange.swift"))
        XCTAssertTrue(
            onChange.contains("modifier(AdaptiveOnChangeModifier("),
            "adaptiveOnChange doit passer par un ViewModifier — un @ViewBuilder + if #available " +
            "duplique le type de base à chaque appel (233 sites)."
        )
        let glass = AppSourceGuard.stripComments(
            try source("../../packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveGlass.swift"))
        for shim in ["modifier(AdaptiveGlassModifier(",
                     "modifier(AdaptiveGlassProminentModifier(",
                     "modifier(AdaptiveSheetGlassBackgroundModifier("] {
            XCTAssertTrue(
                glass.contains(shim),
                "AdaptiveGlass doit passer par « \(shim) » — même raison (87 sites)."
            )
        }
    }
}

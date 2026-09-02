import XCTest
@testable import Meeshy

/// **Un effet déclaré doit être MONTÉ** (règle 8 des effets de message) — la
/// leçon de `ExplodeOverlay` et `WaooOverlay`, qui ont vécu déclarés et jamais
/// branchés pendant que tout compilait.
///
/// `BubbleSticker` (#4823) est une feuille neuve : rien ne rougirait si elle
/// existait sans être montée dans `ThemedMessageBubble`, ou si le builder
/// cessait de projeter `content.sticker`. Ces témoins lisent la SOURCE — hors
/// commentaires, pour qu'une doctrine qui cite la ligne cherchée ne passe pas
/// pour la ligne elle-même.
final class BubbleStickerMountingGuardTests: XCTestCase {

    private static let host = "Meeshy/Features/Main/Views/ThemedMessageBubble.swift"
    private static let leaf = "Meeshy/Features/Main/Views/Bubble/BubbleSticker.swift"
    /// L'ATOME de dessin — extrait de `leaf` pour que Focal, Script et
    /// Rivière montent le MÊME sticker que la bulle. C'est lui qui porte
    /// désormais la courbe, le temps et Reduce Motion.
    private static let artwork = "Meeshy/Features/Main/Views/Bubble/MessageStickerArtwork.swift"
    private static let builder = "Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift"

    private func source(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    /// L'hôte aiguille sur `content.sticker` ET monte la feuille : les deux,
    /// sinon le sticker est projeté pour personne.
    func test_themedMessageBubble_mountsBubbleSticker_onContentSticker() throws {
        let host = try source(Self.host)

        XCTAssertTrue(host.contains("content.sticker"),
                      "ThemedMessageBubble doit aiguiller sur `content.sticker`.")
        XCTAssertTrue(host.contains("BubbleSticker("),
                      "ThemedMessageBubble doit MONTER `BubbleSticker` — une feuille déclarée sans hôte ne rend rien.")
    }

    /// La règle absolue de l'architecture bulle : la feuille est montée par
    /// l'hôte, jamais réécrite dans `BubbleStandardLayout` (hors budget).
    func test_bubbleStandardLayout_doesNotRenderStickersItself() throws {
        let layout = try source("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift")

        XCTAssertFalse(layout.contains("BubbleSticker("),
                       "le sticker se monte dans ThemedMessageBubble, pas dans le layout hérité.")
    }

    /// Le builder passe par la règle partagée — un `if let` réécrit à côté
    /// oublierait l'exclusion du PNG ou le `ifRenderable`.
    func test_builder_projectsStickerThroughTheSharedRule() throws {
        let builder = try source(Self.builder)

        XCTAssertTrue(builder.contains("resolveSticker("),
                      "BubbleContentBuilder doit projeter le sticker via `resolveSticker`.")
        XCTAssertTrue(builder.contains("ifRenderable"),
                      "un sticker non rendable vaut absent — la règle vit dans MessageSticker.ifRenderable.")
    }

    /// Le mouvement est une fonction PURE du temps : `TimelineView` + Reduce
    /// Motion, jamais une boucle `repeatForever` ni un `withAnimation` posé
    /// depuis `onAppear` (règles 2, 5 et 6 des effets de message).
    /// **Cette garde a suivi le code, elle ne l'a pas retenu.** Elle
    /// interrogeait `BubbleSticker` ; le mouvement vit maintenant dans
    /// `MessageStickerArtwork`, l'atome que les QUATRE modes de lecture
    /// montent. Extraire fait franchir aux gardes une frontière qu'elles ne
    /// signalent pas : elles nomment un FICHIER, et le fichier s'est vidé sans
    /// cesser de compiler. La parade tient en une ligne, AVANT d'extraire —
    /// `grep` le nom du fichier dans les tests, la liste EST le lot à
    /// repointer. Je ne l'avais pas appliquée.
    func test_bubbleSticker_animatesFromTimeAndHonoursReduceMotion() throws {
        let leaf = try source(Self.artwork)

        XCTAssertTrue(leaf.contains("TimelineView("),
                      "la pose se lit sur une TimelineView, fonction du temps.")
        XCTAssertTrue(leaf.contains("accessibilityReduceMotion"),
                      "un sticker animé doit se figer sous Reduce Motion.")
        XCTAssertTrue(leaf.contains(".pose(at:"),
                      "la courbe est celle du SDK (`StickerAnimation.pose(at:)`), pas une réécriture.")
        XCTAssertFalse(leaf.contains("repeatForever"),
                       "aucune boucle perpétuelle : le temps est la seule horloge.")
        XCTAssertFalse(leaf.contains("withAnimation"),
                       "rien n'est interpolé par SwiftUI — une pose calculée n'a pas de frame de départ à animer.")
    }

    /// Feuille : aucun singleton observé (Zero Unnecessary Re-render).
    func test_bubbleSticker_observesNoSingleton() throws {
        let leaf = try source(Self.leaf)

        XCTAssertFalse(leaf.contains("@ObservedObject"),
                       "BubbleSticker est une feuille à entrées primitives.")
        XCTAssertFalse(leaf.contains(".shared"),
                       "aucun singleton lu dans la feuille — l'hôte résout et passe des primitifs.")
    }

    /// **La bulle MONTE l'atome, elle ne le réécrit pas.**
    ///
    /// Seconde moitié de l'extraction, et la raison pour laquelle deux gardes
    /// valent mieux qu'un repointage : l'atome porte la RÈGLE (courbe, temps,
    /// Reduce Motion), la bulle porte le MONTAGE. Sans ce témoin, un futur lot
    /// pourrait réintroduire une `TimelineView` locale dans `BubbleSticker` —
    /// la garde du mouvement resterait verte, puisqu'elle regarde l'atome, et
    /// les deux implémentations divergeraient en silence.
    func test_bubbleSticker_montsSharedArtwork_andRewritesNothing() throws {
        let leaf = try source(Self.leaf)

        XCTAssertTrue(leaf.contains("MessageStickerArtwork("),
                      "la bulle monte l'atome partagé — le même que Focal, Script et Rivière.")
        XCTAssertFalse(leaf.contains("TimelineView("),
                       "aucune horloge locale : le mouvement appartient à l'atome.")
        XCTAssertFalse(leaf.contains(".pose(at:"),
                       "aucune seconde lecture de la courbe.")
    }

    /// **Les trois autres modes le montent AUSSI.** C'est le défaut que ce lot
    /// corrige : le mot « sticker » n'apparaissait pas une fois dans tout
    /// `Focal/Row/`, alors que la rangée reçoit un `BubbleContent` qui le
    /// porte — trois modes de lecture sur quatre servaient l'emoji de repli à
    /// la place du gabarit disponible.
    func test_focalRow_montsTheSameArtwork() throws {
        let row = try source("Meeshy/Features/Main/Focal/Row/FocalRow.swift")

        XCTAssertTrue(row.contains("MessageStickerArtwork("),
                      "Focal, Script et Rivière dessinent le sticker, comme la bulle.")
        XCTAssertTrue(row.contains("content.sticker"),
                      "la rangée LIT le sticker que son contenu porte déjà.")
    }
}

import XCTest
import SwiftUI
@testable import MeeshyUI

/// Contrôles de RENDU du bouton de retour au bas — le pendant mesurable de
/// `isCompactShape`, qui ne décide que d'un `Bool`.
///
/// `ConversationScrollControlsViewTests` couvre la DÉCISION (cercle vs
/// capsule) ; ici on monte réellement les deux branches de `body` dans une
/// fenêtre clé et on mesure la géométrie produite. Deux régressions que la
/// fonction pure ne peut pas attraper :
///
///   1. **Cercle au repos** — `Circle()` s'inscrit dans les bornes de la vue :
///      il n'est un VRAI disque que si ces bornes sont CARRÉES. Sans la frame
///      44×44 explicite, `padding(12)` autour du chevron laisse ~37×32 et le
///      disque peint devient un ovale plus étroit que son glyphe.
///   2. **Débordement de la capsule sur iPhone SE** — 375 pt est la largeur
///      la plus étroite supportée ; `frame(maxWidth: 260)` est la seule chose
///      qui empêche l'aperçu (compteur + dernier message + vignette d'appel)
///      de pousser la pastille hors écran. Aucun test de fonction pure ne le
///      voit passer.
///
/// Harnais : montage dans une `UIWindow` clé + `layoutIfNeeded`, même patron
/// que `Timeline/Accessibility/DynamicTypeTests` — la vue traverse ainsi un
/// vrai cycle SwiftUI (les deux branches `pill(shape:)` sont exécutées, pas
/// seulement construites).
@MainActor
final class ConversationScrollControlsShapeTests: XCTestCase {

    /// Largeur d'écran de l'iPhone SE (3e gén.) — l'appareil supporté le plus
    /// étroit, celui où un aperçu non borné déborderait en premier.
    private let iPhoneSEWidth: CGFloat = 375

    /// Plafond de largeur du contenu riche (`unreadPreviewContent`).
    private let previewMaxWidth: CGFloat = 260

    // MARK: - Repos : bornes carrées ⇒ vrai cercle

    func test_restPill_measuresSquare_soTheInscribedCircleIsATrueCircle() {
        let size = measure(makeView(unreadCount: 0), availableWidth: iPhoneSEWidth)

        XCTAssertEqual(size.width, size.height, accuracy: 0.5,
                       "Bornes non carrées : `Circle()` s'y inscrit en ovale")
        XCTAssertEqual(size.width, 44, accuracy: 0.5,
                       "44×44 = cible tactile HIG + disque plus large que le chevron")
    }

    func test_restPill_mountsAndLaysOut_circleBranch() {
        let host = mount(makeView(unreadCount: 0), size: CGSize(width: iPhoneSEWidth, height: 120))

        XCTAssertGreaterThan(host.view.subviews.count, 0,
                             "La branche `pill(shape: Circle())` doit produire une hiérarchie rendue")
    }

    // MARK: - Contenu riche : capsule bornée à 260 pt

    func test_unreadPill_atIPhoneSEWidth_neverExceedsPreviewMaxWidth() {
        let size = measure(
            makeView(unreadCount: 48, lastUnreadMessageContent: String(repeating: "Bonjour tout le monde ", count: 6)),
            availableWidth: iPhoneSEWidth
        )

        XCTAssertLessThanOrEqual(size.width, previewMaxWidth,
                                 "L'aperçu non-lu doit rester borné par frame(maxWidth: 260)")
        XCTAssertLessThanOrEqual(size.width + 32, iPhoneSEWidth,
                                 "La capsule + ses marges latérales doivent tenir dans 375 pt (iPhone SE)")
    }

    func test_unreadCallPill_atIPhoneSEWidth_neverExceedsPreviewMaxWidth() {
        let size = measure(
            makeView(
                unreadCount: 12,
                lastUnreadMessageContent: String(repeating: "Appel manqué de Belva ", count: 6),
                unreadCallSymbol: "phone.fill",
                unreadCallTint: "F87171"
            ),
            availableWidth: iPhoneSEWidth
        )

        XCTAssertLessThanOrEqual(size.width, previewMaxWidth,
                                 "La vignette d'appel de 36 pt ne doit pas repousser la capsule au-delà du plafond")
        XCTAssertLessThanOrEqual(size.width + 32, iPhoneSEWidth,
                                 "La capsule d'appel + ses marges doivent tenir dans 375 pt (iPhone SE)")
    }

    func test_unreadPill_mountsAndLaysOut_capsuleBranch() {
        let host = mount(
            makeView(unreadCount: 48, lastUnreadMessageContent: "Bonjour tout le monde"),
            size: CGSize(width: iPhoneSEWidth, height: 120)
        )

        XCTAssertGreaterThan(host.view.subviews.count, 0,
                             "La branche `pill(shape: Capsule())` doit produire une hiérarchie rendue")
    }

    func test_unreadPill_isTallerAndWiderThanRestPill_soTheShapeReallyMorphs() {
        let rest = measure(makeView(unreadCount: 0), availableWidth: iPhoneSEWidth)
        let unread = measure(
            makeView(unreadCount: 48, lastUnreadMessageContent: "Bonjour tout le monde"),
            availableWidth: iPhoneSEWidth
        )

        XCTAssertGreaterThan(unread.width, rest.width,
                             "Le contenu riche doit élargir la pastille — sinon rien ne morphe")
        XCTAssertGreaterThan(unread.width, unread.height,
                             "Une capsule est OVALE : plus large que haute")
    }

    // MARK: - Helpers

    private func makeView(
        unreadCount: Int,
        lastUnreadMessageContent: String? = nil,
        unreadCallSymbol: String? = nil,
        unreadCallTint: String? = nil
    ) -> ConversationScrollControlsView {
        ConversationScrollControlsView(
            unreadCount: unreadCount,
            typingParticipants: [],
            lastUnreadMessageContent: lastUnreadMessageContent,
            unreadAttachmentTypeLabel: nil,
            unreadAttachmentThumbHash: nil,
            unreadAttachmentThumbnailUrl: nil,
            unreadAttachmentFullUrl: nil,
            unreadAttachmentIsAudio: false,
            isAudioPlaying: false,
            isOffline: false,
            accentColor: "3B82F6",
            secondaryColor: "8B5CF6",
            unreadCallSymbol: unreadCallSymbol,
            unreadCallTint: unreadCallTint,
            onScrollToBottom: {},
            onPlayAudio: {}
        )
    }

    private func measure<V: View>(_ view: V, availableWidth: CGFloat) -> CGSize {
        UIHostingController(rootView: view)
            .sizeThatFits(in: CGSize(width: availableWidth, height: 400))
    }

    /// Monte la vue dans une fenêtre clé et force une passe de layout, pour que
    /// SwiftUI exécute réellement la branche de `body` visée.
    private func mount<V: View>(_ view: V, size: CGSize) -> UIHostingController<V> {
        let controller = UIHostingController(rootView: view)
        controller.view.frame = CGRect(origin: .zero, size: size)
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        return controller
    }
}

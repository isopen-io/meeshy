import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// La disposition des faces de MA fiche, mesurée dans une vraie fenêtre (#20198) : posée dans les pages segmentées
/// (K03), chaque bloc garde la hauteur qu'il a seul dans le défilement. Le `ZStack` des pages place sa page avec une
/// proposition FINIE (sa propre taille) : sans hauteur idéale imposée, le billet de mon lien s'étirait et les rangées
/// de partage s'écrasaient l'une sur l'autre.
@MainActor
final class ProfileFacesLayoutTests: XCTestCase {

    private struct HeightsKey: PreferenceKey {
        static let defaultValue: [String: CGFloat] = [:]
        static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
            value.merge(nextValue(), uniquingKeysWith: { $1 })
        }
    }

    private final class Probe {
        var heights: [String: CGFloat] = [:]
    }

    private struct Measured<Content: View>: View {
        let name: String
        let content: Content

        var body: some View {
            content.background(GeometryReader { geometry in
                Color.clear.preference(key: HeightsKey.self, value: [name: geometry.size.height])
            })
        }
    }

    private struct ActionsPage: View {
        let me: MeeshyUser

        var body: some View {
            VStack(spacing: MeeshySpacing.xxl) {
                Measured(name: "links", content: ProfileLinksFace(user: me, accentColor: "6366F1",
                                                                   showsAddresses: false, onOpen: { _ in }))
                Measured(name: "actions", content: ProfileActionsFace(user: me, stats: nil, accentColor: "6366F1",
                                                                       onAction: { _ in },
                                                                       prefs: UserPreferencesManager.shared))
            }
        }
    }

    /// Une page dont la taille dépend de la proposition : 50 pt à sa hauteur idéale, 100 de plus sous toute hauteur
    /// FINIE. C'est la forme de la défaillance de « Mes cercles » (#20193 — l'échelle passée au défilement horizontal
    /// est souple en hauteur) et du billet de mon lien (#20198) : posée dans les pages, elle doit garder 50.
    private struct ProposalSensitive: Layout {
        func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
            CGSize(width: proposal.width ?? 100, height: proposal.height.map { $0 + 100 } ?? 50)
        }

        func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {}
    }

    private func user() -> MeeshyUser {
        MeeshyUser(id: "aaaaaaaaaaaaaaaaaaaaaaaa", username: "recmsgb")
    }

    private func heights<V: View>(of view: V) throws -> [String: CGFloat] {
        let probe = Probe()
        let host = UIHostingController(rootView: view.onPreferenceChange(HeightsKey.self) { probe.heights = $0 })
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.rootViewController = host
        window.isHidden = false
        RunLoop.main.run(until: Date().addingTimeInterval(2))
        window.isHidden = true
        return probe.heights
    }

    func test_actionsFace_inSegmentedPages_keepsEachBlockAtItsOwnHeight() throws {
        let me = user()
        let alone = try heights(of: ScrollView { ActionsPage(me: me).padding(.horizontal, 16) })
        let paged = try heights(of: ScrollView {
            MeeshySegmentedPages(selection: 1, order: [0, 1]) { _ in ActionsPage(me: me) }
                .padding(.horizontal, 16)
        })

        let aloneLinks = try XCTUnwrap(alone["links"])
        let aloneActions = try XCTUnwrap(alone["actions"])
        XCTAssertEqual(try XCTUnwrap(paged["links"]), aloneLinks, accuracy: 1)
        XCTAssertEqual(try XCTUnwrap(paged["actions"]), aloneActions, accuracy: 1)
    }

    func test_segmentedPage_isLaidOutAtItsIdealHeight_whateverTheZStackProposes() throws {
        let paged = try heights(of: ScrollView {
            MeeshySegmentedPages(selection: 0, order: [0, 1]) { _ in
                Measured(name: "page", content: ProposalSensitive { Color.clear })
            }
        })

        XCTAssertEqual(try XCTUnwrap(paged["page"]), 50, accuracy: 0.5)
    }
}

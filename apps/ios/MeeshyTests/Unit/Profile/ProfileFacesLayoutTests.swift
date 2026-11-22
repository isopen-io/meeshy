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
        var prefix = ""

        var body: some View {
            VStack(spacing: MeeshySpacing.xxl) {
                Measured(name: prefix + "links", content: ProfileLinksFace(user: me, accentColor: "6366F1",
                                                                   showsAddresses: false, onOpen: { _ in }))
                Measured(name: prefix + "actions", content: ProfileActionsFace(user: me, stats: nil, accentColor: "6366F1",
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
        defer { window.isHidden = true }
        // Les faces chargent leurs données (liens, réglages) : on attend que les hauteurs ne bougent plus, une
        // seconde durant, jamais un délai fixe — sur une CI lente, deux secondes figeaient une face à moitié chargée.
        let deadline = Date().addingTimeInterval(12)
        var last = probe.heights
        var stableSince = Date()
        while Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.25))
            if probe.heights != last {
                last = probe.heights
                stableSince = Date()
            } else if !last.isEmpty, Date().timeIntervalSince(stableSince) >= 1 {
                break
            }
        }
        return probe.heights
    }

    func test_actionsFace_inSegmentedPages_keepsEachBlockAtItsOwnHeight() throws {
        let me = user()
        // Les deux dispositions vivent dans la MÊME fenêtre, au même instant : elles voient les mêmes données chargées,
        // et seule la pose en pages les distingue.
        let measured = try heights(of: VStack(spacing: 0) {
            ScrollView { ActionsPage(me: me, prefix: "alone.").padding(.horizontal, 16) }
            ScrollView {
                MeeshySegmentedPages(selection: 1, order: [0, 1]) { _ in ActionsPage(me: me, prefix: "paged.") }
                    .padding(.horizontal, 16)
            }
        })

        // Le défaut visé est un bloc ÉCRASÉ (rangées superposées) ou ÉTIRÉ (le billet, des centaines de points) : la
        // pose en pages ne doit ni retirer de hauteur à un bloc, ni lui en ajouter plus que l'arrondi d'une ligne.
        // Sous iOS 26, la face Actions mesure 4 pt de plus à sa hauteur idéale qu'au fil du défilement (1807 contre
        // 1803, mesuré sur la CI) ; iOS 27 rend les deux égales.
        for block in ["links", "actions"] {
            let alone = try XCTUnwrap(measured["alone." + block], block)
            let paged = try XCTUnwrap(measured["paged." + block], block)
            XCTAssertGreaterThanOrEqual(paged, alone - 1, "\(block) écrasé : \(measured)")
            XCTAssertLessThanOrEqual(paged, alone + 8, "\(block) étiré : \(measured)")
        }
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

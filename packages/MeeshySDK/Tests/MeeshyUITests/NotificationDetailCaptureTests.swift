import XCTest
import SwiftUI
import UIKit
@testable import MeeshySDK
@testable import MeeshyUI

/// Banc de CAPTURE (#8858) — la bannière in-app de chaque DÉTAIL de message
/// (position, contact, sticker, invitation, lien, vidéo), sur des charges
/// fabriquées au contrat #8856, sans compte ni réseau ni envoi. Inerte par
/// défaut : ne s'exécute que si `MEESHY_CAPTURE_DIR` est posé
/// (`TEST_RUNNER_MEESHY_CAPTURE_DIR=… xcodebuild test …`).
@MainActor
final class NotificationDetailCaptureTests: XCTestCase {

    private var captureDir: String? { ProcessInfo.processInfo.environment["MEESHY_CAPTURE_DIR"] }

    private let fixtures: [(name: String, context: String, metadata: String, content: String)] = [
        ("position", #"{"conversationType":"direct","messageType":"text","locationLat":"48.8584","locationLon":"2.2945","locationName":"Tour Eiffel","locationAddress":"Champ de Mars, Paris"}"#,
         "null", ""),
        ("contact", #"{"conversationType":"direct","contactName":"Jean Dupont","contactPhone":"+33612345678"}"#,
         #"{"attachments":{"count":1,"firstType":"document","firstFilename":"jean.vcf"}}"#, ""),
        ("sticker", #"{"conversationType":"direct","messageType":"sticker"}"#, "null", "🐱 Sticker"),
        ("invitation", #"{"conversationType":"direct","inviteUrl":"https://meeshy.me/join/abc123","inviteConversationTitle":"Les voisins du 12"}"#,
         "null", "https://meeshy.me/join/abc123"),
        ("lien", #"{"conversationType":"direct","linkUrl":"https://www.lemonde.fr/article","linkDomain":"lemonde.fr","linkTitle":"La une du jour"}"#,
         "null", "https://www.lemonde.fr/article"),
        ("video", #"{"conversationType":"direct","firstAttachmentMimeType":"video/mp4","thumbnailUrl":"https://cdn.meeshy.me/t.jpg"}"#,
         #"{"attachments":{"count":1,"firstType":"video"}}"#, "🎥 Vidéo · 0:12"),
    ]

    func test_capture_detailBanners() throws {
        guard let dir = captureDir else { throw XCTSkip("capture désactivée") }
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)

        for dark in [true, false] {
            ThemeManager.shared.mode = dark ? .dark : .light
            let banners = try fixtures.map { try event($0) }
            let scene = ZStack(alignment: .top) {
                LinearGradient(colors: [Color(hex: "C9A27E"), Color(hex: "3B2F2F"), Color(hex: "0E0E12")],
                               startPoint: .top, endPoint: .bottom)
                VStack(spacing: 12) {
                    ForEach(Array(banners.enumerated()), id: \.offset) { _, event in
                        NotificationToastView(event: event, presentation: event.bannerPresentation(),
                                              onTap: {}, onDismiss: {})
                    }
                }
                .padding(.top, 60)
            }
            try snapshot(scene, size: CGSize(width: 402, height: 820), dark: dark,
                         to: "\(dir)/banniere-detail-\(dark ? "sombre" : "clair").png")
        }
    }

    private func event(_ fixture: (name: String, context: String, metadata: String, content: String)) throws -> SocketNotificationEvent {
        let json = """
        {"id":"\(fixture.name)","userId":"me","type":"new_message","title":"Awa Ndiaye",
         "content":"\(fixture.content)",
         "actor":{"id":"a1","displayName":"Awa Ndiaye"},
         "context":\(fixture.context),
         "metadata":\(fixture.metadata)}
        """
        return try JSONDecoder().decode(SocketNotificationEvent.self, from: Data(json.utf8))
    }

    private func snapshot<V: View>(_ view: V, size: CGSize, dark: Bool, to path: String) throws {
        let content = view
            .frame(width: size.width, height: size.height)
            .environment(\.colorScheme, dark ? .dark : .light)
        let renderer = ImageRenderer(content: content)
        renderer.scale = 3
        let image = try XCTUnwrap(renderer.uiImage)
        try XCTUnwrap(image.pngData()).write(to: URL(fileURLWithPath: path))
    }
}

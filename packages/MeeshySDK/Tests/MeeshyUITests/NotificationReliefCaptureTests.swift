import XCTest
import SwiftUI
import UIKit
@testable import MeeshySDK
@testable import MeeshyUI

/// Banc de CAPTURE (#8723, #8724) — photographie la bannière et les lignes de
/// la page Notifications sur des fixtures, sans compte ni réseau ni envoi.
/// Inerte par défaut : ne s'exécute que si `MEESHY_CAPTURE_DIR` est posé
/// (`TEST_RUNNER_MEESHY_CAPTURE_DIR=… xcodebuild test …`).
@MainActor
final class NotificationReliefCaptureTests: XCTestCase {

    private var captureDir: String? { ProcessInfo.processInfo.environment["MEESHY_CAPTURE_DIR"] }

    private let copy: NotificationCopyLookup = { key in
        [
            "progression.axis.social.invite_joined": "Invités venus",
            "progression.axis.content.text_message": "Messages texte",
            "notification.milestone.badge.reason": "Badge débloqué · palier %lld",
            "notification.milestone.inviteJoined.reason": "%@ a rejoint Meeshy grâce à vous",
        ][key]
    }

    func test_capture_bannerAndRows() throws {
        guard let dir = captureDir else { throw XCTSkip("capture désactivée") }
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)

        for dark in [true, false] {
            ThemeManager.shared.mode = dark ? .dark : .light
            let banner = try bannerScene(dark: dark)
            try snapshot(banner, size: CGSize(width: 402, height: 260), dark: dark,
                         to: "\(dir)/banniere-\(dark ? "sombre" : "clair").png")
            let rows = try rowsScene(dark: dark)
            try snapshot(rows, size: CGSize(width: 402, height: 820), dark: dark,
                         to: "\(dir)/page-\(dark ? "sombre" : "clair").png")
        }
    }

    // MARK: - Scènes

    private func bannerScene(dark: Bool) throws -> some View {
        let event = try JSONDecoder().decode(SocketNotificationEvent.self, from: Data(#"""
        {"id":"n1","userId":"me","type":"new_message","title":"Abed Dollar",
         "content":"🎵 Audio · 0:32 · 193 Ko",
         "actor":{"id":"a1","displayName":"Abed Dollar"},
         "context":{"conversationType":"direct"},
         "metadata":{"commentPreview":"🎵 Audio · 0:32 · 193 Ko","attachments":{"count":1,"firstType":"audio"}}}
        """#.utf8))
        return ZStack(alignment: .top) {
            LinearGradient(colors: [Color(hex: "C9A27E"), Color(hex: "3B2F2F"), Color(hex: "0E0E12")],
                           startPoint: .top, endPoint: .bottom)
            NotificationToastView(event: event, presentation: event.bannerPresentation(), onTap: {}, onDismiss: {})
                .padding(.top, 70)
        }
    }

    private func rowsScene(dark: Bool) throws -> some View {
        let state = #""state":{"isRead":false,"readAt":null,"createdAt":"2026-09-29T17:00:00.000Z"}"#
        let fixtures = [
            #"""
            {"id":"r1","userId":"me","type":"comment_reaction","priority":"low",
             "title":"Belva Tano a réagi ❤️ à votre commentaire",
             "subtitle":"« Superbe features qui vient avec tellement d’autres! »",
             "actor":{"id":"b1","username":"belva","displayName":"Belva Tano","avatar":null},
             "context":{"postId":"p1","commentId":"c1"},
             "metadata":{"reactionEmoji":"❤️","postType":"POST",
                         "commentPreview":"Superbe features qui vient avec tellement d’autres!",
                         "postPreview":"Meeshy 1.0.8 : les notifications ont du relief"},
            \#(state)}
            """#,
            #"""
            {"id":"r2","userId":"me","type":"message_reply","priority":"normal",
             "title":"Reponse de Temgouananagrace","subtitle":"Les amateurs","content":"Comme d’habitude 🤣🤣",
             "actor":{"id":"t1","username":"tg","displayName":"Temgouananagrace","avatar":null},
             "context":{"conversationId":"c1","conversationTitle":"Les amateurs","conversationType":"group"},
            \#(state)}
            """#,
            #"""
            {"id":"r3","userId":"me","type":"badge_earned","priority":"normal",
             "content":"🏅 Badge débloqué : Invités venus · palier 1",
             "actor":{"id":"i1","username":"awa","displayName":"Awa Ndiaye","avatar":null},
             "metadata":{"axisKey":"social.invite_joined","threshold":1},
            \#(state)}
            """#,
            #"""
            {"id":"r4","userId":"me","type":"badge_earned","priority":"normal",
             "content":"🏅 Badge débloqué : Messages texte · palier 10",
             "metadata":{"axisKey":"content.text_message","threshold":10},
            \#(state)}
            """#,
            #"""
            {"id":"r5","userId":"me","type":"friend_new_post","priority":"normal",
             "title":"elvira ndjiki a publié un nouveau post","subtitle":"Nouvelle publication",
             "actor":{"id":"e1","username":"elvira","displayName":"elvira ndjiki","avatar":null},
             "metadata":{"contentType":"POST","mediaType":"video"},
            \#(state)}
            """#,
        ]
        let notifications = try fixtures.map { try JSONDecoder().decode(APINotification.self, from: Data($0.utf8)) }
        return VStack(spacing: 0) {
            ForEach(notifications) { notification in
                NotificationRowView(notification: notification, onTap: {}, onQuickAction: { _ in },
                                    isFriend: false, copy: self.copy)
                Divider().opacity(0.3)
            }
            Spacer(minLength: 0)
        }
        .background(MeeshyColors.backgroundPrimary(isDark: dark))
    }

    // MARK: - Photo

    private func snapshot<V: View>(_ view: V, size: CGSize, dark: Bool, to path: String) throws {
        let content = view
            .frame(width: size.width, height: size.height)
            .environment(\.colorScheme, dark ? .dark : .light)
        let renderer = ImageRenderer(content: content)
        renderer.scale = 3
        let image = try XCTUnwrap(renderer.uiImage)
        let data = try XCTUnwrap(image.pngData())
        try data.write(to: URL(fileURLWithPath: path))
    }
}

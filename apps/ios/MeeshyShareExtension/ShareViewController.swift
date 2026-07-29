import UIKit
import UniformTypeIdentifiers
import SwiftUI

/// Feuille « Partager vers Meeshy ».
///
/// L'extension est AUTONOME : elle lit la session et les conversations dans
/// l'App Group, poste elle-même au gateway, et n'ouvre jamais l'app. En cas
/// d'échec, elle dépose un relais durable que `SharePendingSendConsumer`
/// reprendra (cf. `ShareSender.send`).
///
/// Portée du lot 1 : texte et URL. L'`Info.plist` n'annonce que ces deux types
/// — s'annoncer pour une image qu'on ne sait pas envoyer ferait apparaître
/// Meeshy dans la feuille de partage de Photos pour y échouer.
class ShareViewController: UIViewController {

    private var hostingController: UIHostingController<ShareContentView>?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        extractContent { [weak self] content in
            self?.installInterface(content: content)
        }
    }

    // MARK: - Composition de l'écran

    private func installInterface(content: String?) {
        let session = ShareSession.resolveLive()
        let state = ShareScreenState.resolve(
            session: session,
            targets: ShareConversationStore.liveTargets()
        )

        let root = ShareContentView(
            content: content,
            state: state,
            // Aucune capture : la session et le contenu arrivent par le
            // chemin d'envoi lui-même, qui ne peut être emprunté que depuis
            // l'état `.ready` — lequel porte déjà la session.
            onSend: { session, target, content in
                await ShareSender.send(content: content, to: target.id, session: session)
            },
            onFinish: { [weak self] in self?.complete() }
        )

        let controller = UIHostingController(rootView: root)
        addChild(controller)
        view.addSubview(controller.view)
        controller.view.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            controller.view.topAnchor.constraint(equalTo: view.topAnchor),
            controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        controller.didMove(toParent: self)
        hostingController = controller
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    // MARK: - Extraction

    /// Accumulateur protégé par verrou : `loadItem` rappelle sur une file
    /// arbitraire, et plusieurs pièces jointes peuvent répondre en parallèle.
    private final class ExtractionBox: @unchecked Sendable {
        private let lock = NSLock()
        private var text: String?
        private var url: URL?

        func offer(text value: String?) {
            guard let value, !value.isEmpty else { return }
            lock.lock(); defer { lock.unlock() }
            if text == nil { text = value }
        }

        func offer(url value: URL?) {
            guard let value else { return }
            lock.lock(); defer { lock.unlock() }
            if url == nil { url = value }
        }

        var snapshot: (text: String?, url: URL?) {
            lock.lock(); defer { lock.unlock() }
            return (text, url)
        }
    }

    private func extractContent(completion: @escaping (String?) -> Void) {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            completion(nil)
            return
        }

        let box = ExtractionBox()
        let group = DispatchGroup()

        for item in items {
            for attachment in item.attachments ?? [] {
                if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    group.enter()
                    attachment.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { data, _ in
                        box.offer(url: Self.asURL(data))
                        group.leave()
                    }
                } else if attachment.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                    group.enter()
                    attachment.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { data, _ in
                        box.offer(text: Self.asText(data))
                        group.leave()
                    }
                }
            }
        }

        group.notify(queue: .main) {
            let (text, url) = box.snapshot
            completion(ShareSender.composeContent(text: text, url: url))
        }
    }

    /// `nonisolated` : appelées depuis la complétion de `loadItem`, qui
    /// s'exécute sur une file arbitraire. Sans l'annotation, elles héritent du
    /// MainActor de `UIViewController` et le compilateur refuse de leur « faire
    /// traverser » une valeur non-Sendable.
    nonisolated private static func asURL(_ data: (any NSSecureCoding)?) -> URL? {
        if let url = data as? URL { return url }
        if let raw = data as? Data, let string = String(data: raw, encoding: .utf8) {
            return URL(string: string)
        }
        if let string = data as? String { return URL(string: string) }
        return nil
    }

    nonisolated private static func asText(_ data: (any NSSecureCoding)?) -> String? {
        if let string = data as? String { return string }
        if let raw = data as? Data { return String(data: raw, encoding: .utf8) }
        return nil
    }
}

// MARK: - Interface

struct ShareContentView: View {
    let content: String?
    let state: ShareScreenState
    let onSend: (ShareSession, ShareTarget, String) async -> ShareOutcome
    let onFinish: () -> Void

    @State private var selectedId: String?
    @State private var isSending = false
    @State private var resultMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let content {
                    contentPreview(content)
                    Divider()
                }

                switch state {
                case .signedOut:
                    message(
                        systemImage: "person.crop.circle.badge.exclamationmark",
                        text: String(
                            localized: "share.signedOut",
                            defaultValue: "Connectez-vous à Meeshy pour partager"
                        )
                    )
                case .noConversations:
                    message(
                        systemImage: "bubble.left.and.bubble.right",
                        text: String(
                            localized: "share.empty",
                            defaultValue: "Ouvrez Meeshy une fois pour retrouver vos conversations ici"
                        )
                    )
                case .ready(_, let targets):
                    conversationList(targets)
                }

                Spacer(minLength: 0)
                actionBar
            }
            .navigationTitle(String(localized: "share.title", defaultValue: "Share to Meeshy"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: Sous-vues

    private func contentPreview(_ content: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: isLink(content) ? "link" : "doc.text.fill")
                .font(.title2)
                .foregroundStyle(.tint)
            Text(content)
                .font(.callout)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isLink(content)
            ? String(localized: "share.type.url", defaultValue: "Link")
            : String(localized: "share.type.text", defaultValue: "Text"))
        .accessibilityValue(content)
    }

    private func isLink(_ content: String) -> Bool {
        content.hasPrefix("http://") || content.hasPrefix("https://")
    }

    private func message(systemImage: String, text: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(text)
                .font(.callout)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.top, 48)
    }

    private func conversationList(_ targets: [ShareTarget]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "share.sendTo", defaultValue: "Send to"))
                .font(.headline)
                .padding(.horizontal)
                .padding(.top)
                .accessibilityAddTraits(.isHeader)

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(targets) { target in
                        Button {
                            selectedId = target.id
                        } label: {
                            ShareTargetRow(target: target, isSelected: selectedId == target.id)
                        }
                        .buttonStyle(.plain)
                        .disabled(isSending)
                    }
                }
            }
        }
    }

    /// `.frame`/`.padding` sont À L'INTÉRIEUR du label : la zone tactile d'un
    /// `Button` épouse la forme de son contenu, les poser à l'extérieur
    /// dessinerait une pilule pleine largeur dont seul le texte réagirait.
    private var actionBar: some View {
        VStack(spacing: 12) {
            if let resultMessage {
                Text(resultMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .transition(.opacity)
            }

            HStack(spacing: 16) {
                Button {
                    onFinish()
                } label: {
                    Text(String(localized: "share.cancel", defaultValue: "Cancel"))
                        .frame(maxWidth: .infinity)
                        .padding()
                }
                .background(Color.secondary.opacity(0.2))
                .foregroundStyle(.primary)
                .cornerRadius(12)

                if case .ready = state {
                    Button {
                        send()
                    } label: {
                        Group {
                            if isSending {
                                ProgressView()
                            } else {
                                Text(String(localized: "share.send", defaultValue: "Send"))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                    }
                    .background(canSend ? Color.accentColor : Color.secondary.opacity(0.2))
                    // Suit l'état actif : un blanc figé sur le fond gris désactivé
                    // tombe à ~1,2:1 et le bouton paraît vide.
                    .foregroundStyle(canSend ? Color.white : Color.secondary)
                    .cornerRadius(12)
                    .disabled(!canSend)
                }
            }
        }
        .padding()
    }

    private var canSend: Bool {
        selectedId != nil && !isSending && content?.isEmpty == false
    }

    private func send() {
        guard case .ready(let session, let targets) = state,
              let target = targets.first(where: { $0.id == selectedId }),
              let content, !content.isEmpty else { return }

        isSending = true
        Task {
            let outcome = await onSend(session, target, content)
            isSending = false
            resultMessage = outcome == .sent
                ? String(localized: "share.status.sent", defaultValue: "Envoyé")
                : String(localized: "share.status.deferred", defaultValue: "Sera envoyé à la reconnexion")
            try? await Task.sleep(nanoseconds: 700_000_000)
            onFinish()
        }
    }
}

// MARK: - Ligne de conversation

struct ShareTargetRow: View {
    let target: ShareTarget
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color(hexString: target.accentColorHex) ?? .gray)
                    .frame(width: 44, height: 44)
                Text(target.initials)
                    .font(.headline)
                    .foregroundStyle(.white)
            }

            Text(target.displayName)
                .font(.body)
                .lineLimit(1)

            Spacer()

            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.tint)
                    .font(.title3)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(isSelected ? Color.accentColor.opacity(0.12) : Color.clear)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(target.displayName)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])
    }
}

// MARK: - Couleur

extension Color {
    /// L'extension ne lie pas MeeshyUI : ce décodeur hexadécimal minimal évite
    /// d'embarquer tout le target UI pour une pastille d'avatar.
    init?(hexString: String) {
        var hex = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

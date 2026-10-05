import SwiftUI
import UIKit
import UniformTypeIdentifiers
import MeeshySDK
import os

/// **Le collage dans le champ du composer** (#9037) — posé en `background` du
/// `TextField`, il retrouve la `UITextView` que SwiftUI monte pour lui et y
/// installe un `UITextPasteDelegate` :
///
/// - le champ ACCEPTE désormais une image, une vidéo, un son ou un document
///   collés (sans quoi « Coller » n'apparaît même pas pour une image seule) ;
///   l'OBJET part en pièce jointe par `onIngest`, jamais son chemin ;
/// - un texte qui ferait dépasser la limite d'un message part en `.txt`, et le
///   champ reste tel qu'il était.
///
/// La décision est celle de `PastedContentRouter`, pure et éprouvée. Si la vue
/// de texte n'est pas trouvée, rien n'est installé : le filet du changement de
/// texte (`handleClipboardCheck`) garde la limite.
struct ComposerPasteInterceptor: UIViewRepresentable {
    let limit: Int
    let onIngest: ([ComposerIngest]) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(limit: limit, onIngest: onIngest) }

    func makeUIView(context: Context) -> ProbeView {
        let probe = ProbeView()
        probe.isUserInteractionEnabled = false
        probe.coordinator = context.coordinator
        return probe
    }

    func updateUIView(_ uiView: ProbeView, context: Context) {
        context.coordinator.limit = limit
        context.coordinator.onIngest = onIngest
        uiView.coordinator = context.coordinator
    }

    /// La sonde : invisible, sans toucher, de la taille du champ.
    final class ProbeView: UIView {
        weak var coordinator: Coordinator?
        nonisolated deinit {}

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil else { return }
            DispatchQueue.main.async { [weak self] in self?.installOnFieldTextView() }
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            if coordinator?.textView == nil { installOnFieldTextView() }
        }

        /// La vue de texte du champ : celle, parmi les descendantes des
        /// ancêtres proches, dont le cadre recouvre le plus la sonde.
        private func installOnFieldTextView() {
            guard let coordinator, coordinator.textView == nil, let window else { return }
            let probeFrame = convert(bounds, to: window)
            var ancestor: UIView? = superview
            for _ in 0..<8 {
                guard let current = ancestor else { return }
                let overlap: (UITextView) -> CGFloat = { textView in
                    let shared = textView.convert(textView.bounds, to: window).intersection(probeFrame)
                    return shared.isNull ? 0 : shared.width * shared.height
                }
                let candidates: [UITextView] = Self.textViews(in: current).filter { overlap($0) > 0 }
                if let best = candidates.max(by: { overlap($0) < overlap($1) }) {
                    coordinator.install(on: best)
                    return
                }
                ancestor = current.superview
            }
        }

        private static func textViews(in root: UIView) -> [UITextView] {
            root.subviews.flatMap { child -> [UITextView] in
                if let textView = child as? UITextView { return [textView] }
                return textViews(in: child)
            }
        }
    }

    final class Coordinator: NSObject, UITextPasteDelegate {
        var limit: Int
        var onIngest: ([ComposerIngest]) -> Void
        weak var textView: UITextView?
        private static let logger = Logger(subsystem: "me.meeshy.app", category: "composer-paste")

        /// Ce que le champ accepte EN PLUS du texte : ce qu'on joint.
        static let attachableTypes: [String] = [UTType.image, .movie, .audio, .fileURL, .data].map(\.identifier)

        init(limit: Int, onIngest: @escaping ([ComposerIngest]) -> Void) {
            self.limit = limit
            self.onIngest = onIngest
        }

        nonisolated deinit {}

        func install(on textView: UITextView) {
            self.textView = textView
            textView.pasteDelegate = self
            if let configuration = textView.pasteConfiguration {
                configuration.addAcceptableTypeIdentifiers(Self.attachableTypes)
            } else {
                textView.pasteConfiguration = UIPasteConfiguration(
                    acceptableTypeIdentifiers: [UTType.plainText.identifier, UTType.text.identifier, UTType.url.identifier] + Self.attachableTypes
                )
            }
        }

        func textPasteConfigurationSupporting(_ textPasteConfigurationSupporting: UITextPasteConfigurationSupporting,
                                              transform item: UITextPasteItem) {
            let provider = item.itemProvider
            let types = provider.registeredTypeIdentifiers.compactMap(UTType.init)
            switch PastedContentRouter.classify(types) {
            case .media:
                item.setNoResult()
                attach(provider)
            case .text:
                guard provider.canLoadObject(ofClass: NSString.self) else { return item.setDefaultResult() }
                Task { @MainActor [weak self] in
                    let pasted = await ComposerDropResolver.loadString(from: provider)
                    guard let self, let pasted else { return item.setDefaultResult() }
                    self.route(pasted, item: item)
                }
            }
        }

        private func route(_ pasted: String, item: UITextPasteItem) {
            let current = textView.map { PastedContentRouter.length($0.text ?? "") } ?? 0
            let replaced = textView?.selectedRange.length ?? 0
            switch PastedContentRouter.decide(.text(pasted), currentLength: current, replacedLength: replaced, limit: limit) {
            case .insertText, .attachMedia:
                item.setResult(string: pasted)
            case .attachText:
                item.setNoResult()
                do {
                    onIngest([try PastedTextFile.write(pasted)])
                    HapticFeedback.medium()
                } catch {
                    Self.logger.error("Collage long : le .txt n'a pas pu être écrit")
                    ComposerIngestFeedback.showFailure(names: [PastedTextFile.fileName(at: Date())])
                }
            }
        }

        private func attach(_ provider: NSItemProvider) {
            let name = provider.suggestedName ?? String(localized: "composer.drop.unnamedItem", defaultValue: "élément sans nom", bundle: .main)
            Task { @MainActor [weak self] in
                guard let ingest = await ComposerDropResolver.resolve(provider), case .file = ingest else {
                    ComposerIngestFeedback.showFailure(names: [name])
                    return
                }
                self?.onIngest([ingest])
                HapticFeedback.medium()
            }
        }
    }
}

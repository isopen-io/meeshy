import SwiftUI
import UIKit
import MeeshySDK

final class ComposerTextEditingUITextView: UITextView {
    var accessoryViewBuilder: (() -> UIView)?

    override var inputAccessoryView: UIView? {
        accessoryViewBuilder?()
    }
}

struct ComposerTextEditingView: UIViewRepresentable {
    @Binding var text: String
    let elementId: String
    let viewModel: StoryComposerViewModel
    let onDone: () -> Void

    func makeUIView(context: Context) -> ComposerTextEditingUITextView {
        let tv = ComposerTextEditingUITextView()
        tv.delegate = context.coordinator
        tv.text = text
        tv.font = .systemFont(ofSize: 17)
        tv.textColor = .white
        tv.backgroundColor = .clear
        tv.autocorrectionType = .no
        tv.smartQuotesType = .no
        tv.accessoryViewBuilder = { [weak tv] in
            guard let tv else { return UIView() }
            let host = UIHostingController(rootView: ComposerTextFormatBand(
                elementId: elementId,
                viewModel: viewModel,
                onDone: {
                    onDone()
                    tv.resignFirstResponder()
                }
            ))
            host.view.translatesAutoresizingMaskIntoConstraints = false
            host.view.backgroundColor = .clear

            // iOS 16.4+: explicit safe-area handling to avoid double-inset.
            if #available(iOS 16.4, *) {
                host.safeAreaRegions = []
            }
            host.sizingOptions = .intrinsicContentSize

            // Wrap in a container view with explicit height constraint so
            // UIHostingController.view doesn't collapse to zero size.
            let wrapper = UIView()
            wrapper.translatesAutoresizingMaskIntoConstraints = false
            wrapper.addSubview(host.view)
            NSLayoutConstraint.activate([
                host.view.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor),
                host.view.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor),
                host.view.topAnchor.constraint(equalTo: wrapper.topAnchor),
                host.view.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor),
                wrapper.heightAnchor.constraint(equalToConstant: 50),
            ])
            // Auto-resize horizontally to keyboard width
            wrapper.autoresizingMask = [.flexibleWidth]
            return wrapper
        }
        return tv
    }

    func updateUIView(_ tv: ComposerTextEditingUITextView, context: Context) {
        if tv.text != text { tv.text = text }
    }

    func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

    final class Coordinator: NSObject, UITextViewDelegate {
        @Binding var text: String
        init(text: Binding<String>) { self._text = text }
        func textViewDidChange(_ tv: UITextView) { text = tv.text }
    }
}

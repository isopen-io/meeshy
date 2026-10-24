import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - Zone 2 : ce qu'on peut en faire

extension ShareSheetView {

    /// Publier (cochable comme un destinataire, D2), « Modifier dans le
    /// studio », puis Enregistrer, Copier, Imager, Partager hors de Meeshy. Une
    /// entrée interdite n'apparaît pas ; une ligne grise dit pourquoi.
    @ViewBuilder
    func actionsZone(_ plan: SharePlan) -> some View {
        let publications = model.offeredPublications
        let studio = plan.offers(.studio) && actions.onCompose != nil && model.studioHasMatter
        let tools = toolActions(plan)
        let reason = withheldLine(plan)
        if !publications.isEmpty || studio || !tools.isEmpty || reason != nil {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                if !publications.isEmpty || studio {
                    sectionHeader(ShareSheetCopy.publishZone).padding(.horizontal, -MeeshySpacing.lg)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: MeeshySpacing.sm) {
                            ForEach(publications, id: \.self) { target in publicationChip(target) }
                            if studio { studioChip }
                        }
                        .padding(.vertical, 1)
                    }
                }
                if !tools.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: MeeshySpacing.sm) {
                            ForEach(tools, id: \.self) { tool in toolChip(tool, plan: plan) }
                        }
                        .padding(.vertical, 1)
                    }
                }
                if let reason {
                    Label(reason, systemImage: "info.circle")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                        .foregroundColor(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
        }
    }

    /// Les outils que le plan offre ET que l'hôte sait exécuter.
    func toolActions(_ plan: SharePlan) -> [ShareAction] {
        [ShareAction.save, .copyLink, .copyText, .imager, .shareOut].filter { action in
            guard plan.offers(action) else { return false }
            switch action {
            case .save: return actions.onSave != nil
            case .imager: return actions.onImageDiscussion != nil
            case .copyLink, .shareOut: return shareURL != nil || copyableText != nil
            case .copyText: return copyableText != nil
            default: return false
            }
        }
    }

    /// La raison la plus parlante de ce qui n'est pas rendu — une seule ligne.
    func withheldLine(_ plan: SharePlan) -> String? {
        let priority: [ShareWithheldReason] = [.flame, .blurred, .encrypted, .citesProtected, .tooManyForPublication, .singlePhotoNotAReel]
        return priority.first { reason in plan.withheld.contains { $0.reason == reason } }.map(ShareSheetCopy.withheld)
    }

    private func publicationChip(_ target: PublicationTarget) -> some View {
        let isOn = model.publications.contains(target)
        return Button {
            HapticFeedback.light()
            if !isOn, let piece = model.publishableAttachment,
               PublicationTargetRule.needsCaptureConfirmation(capturedInApp: piece.capturedInApp, target: target) {
                pendingCapture = target
            } else {
                model.togglePublication(target)
            }
        } label: {
            Label(ShareSheetCopy.publication(target), systemImage: isOn ? "checkmark.circle.fill" : Self.symbol(for: target))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(isOn ? .white : accent)
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .background(Capsule().fill(isOn ? accent : accent.opacity(MeeshyOpacity.light)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(model.hasSent)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    private static func symbol(for target: PublicationTarget) -> String {
        switch target {
        case .story: return "circle.dashed"
        case .post: return "square.grid.2x2"
        case .reel: return "play.rectangle"
        }
    }

    private var studioChip: some View {
        Button {
            close()
            actions.onCompose?()
        } label: {
            Label(ShareSheetCopy.studio, systemImage: "wand.and.stars")
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(accent)
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .background(Capsule().stroke(accent.opacity(0.4), lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func toolChip(_ tool: ShareAction, plan: SharePlan) -> some View {
        switch tool {
        case .shareOut:
            if model.republishableStory != nil {
                // Une story : le lien suivi se frappe AU GESTE (#12644), puis la
                // feuille du système part avec lui.
                Button {
                    Task {
                        guard let url = await model.ensureCardLink() else { return }
                        outgoingLink = ShareOutgoingLink(url: url)
                    }
                } label: { toolLabel(ShareSheetCopy.shareOut, "square.and.arrow.up") }
                    .buttonStyle(.plain)
            } else if let url = shareURL {
                ShareLink(item: url) { toolLabel(ShareSheetCopy.shareOut, "square.and.arrow.up") }
            } else if let text = copyableText {
                ShareLink(item: text) { toolLabel(ShareSheetCopy.shareOut, "square.and.arrow.up") }
            }
        case .copyLink:
            Button {
                if model.republishableStory != nil {
                    Task { copy(await model.ensureCardLink()?.absoluteString) }
                } else {
                    copy(shareURL?.absoluteString ?? copyableText)
                }
            } label: { toolLabel(ShareSheetCopy.copyLink, "link") }
                .buttonStyle(.plain)
        case .copyText:
            Button { copy(copyableText) } label: { toolLabel(ShareSheetCopy.copyText, "doc.on.doc") }
                .buttonStyle(.plain)
        case .save:
            Button { close(); actions.onSave?() } label: { toolLabel(ShareSheetCopy.save, "square.and.arrow.down") }
                .buttonStyle(.plain)
        case .imager:
            Button { close(); actions.onImageDiscussion?() } label: { toolLabel(ShareSheetHostBridge.imagerLabel, ShareSheetHostBridge.imagerSymbol) }
                .buttonStyle(.plain)
        default:
            EmptyView()
        }
    }

    private func toolLabel(_ title: String, _ symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize))
            .foregroundColor(theme.textPrimary)
            .padding(.horizontal, MeeshySpacing.md)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .background(Capsule().fill(MeeshyColors.surfaceFill(isDark: isDark)))
            .contentShape(Capsule())
    }

    private func copy(_ text: String?) {
        guard let text, !text.isEmpty else { return }
        UIPasteboard.general.string = text
        HapticFeedback.success()
        ShareSheetHostBridge.announce(ShareSheetCopy.copied, open: nil)
    }

    /// L'URL d'un lien ou d'une carte.
    var shareURL: URL? {
        switch model.subject {
        case .link(let url): return url
        case .card(let card): return card.url
        case .incoming(let incoming): return incoming.media.isEmpty ? incoming.link : nil
        case .messages, .piece, .text: return nil
        }
    }

    /// Le texte des messages qui partent, dans l'ordre.
    var copyableText: String? {
        switch model.subject {
        case .messages(let messages, _, _):
            let kept = Set(model.plan.kept)
            let text = messages.filter { kept.contains($0.id) && !$0.content.isEmpty }.map(\.content).joined(separator: "\n")
            return text.isEmpty ? nil : text
        case .text(let text): return text
        case .link(let url): return url.absoluteString
        case .card(let card): return card.url?.absoluteString
        case .incoming(let incoming): return incoming.media.isEmpty ? incoming.text : nil
        case .piece: return nil
        }
    }
}

/// Le lien prêt à partir hors de Meeshy — l'identité de la feuille présentée.
struct ShareOutgoingLink: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// La feuille du système, portable : l'écran de partage est aussi compilé
/// dans l'extension de partage, qui n'a pas le `ShareSheet` de l'app.
struct ShareOutActivityView: UIViewControllerRepresentable {
    let activityItems: [Any]
    let onFinish: () -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
        controller.completionWithItemsHandler = { _, _, _, _ in onFinish() }
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

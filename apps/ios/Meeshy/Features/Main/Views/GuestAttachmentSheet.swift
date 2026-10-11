import SwiftUI
import UIKit
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// MARK: - Le tri d'une sélection, avant tout envoi

/// Ce qu'une sélection de fichiers devient pour un invité restreint : les
/// admis partent vers le composeur, le premier refusé est EXPLIQUÉ. Le serveur
/// reste juge du contenu réel ; ce tri n'offre que ce qui peut passer.
struct GuestAttachmentScreening: Equatable {
    struct Candidate: Equatable {
        let name: String
        let byteCount: Int64
    }

    struct Refusal: Equatable {
        let fileName: String
        let reason: GuestAttachmentRefusal.Reason
    }

    let acceptedIndices: [Int]
    let refusals: [Refusal]

    init(candidates: [Candidate], allowance: GuestAttachmentAllowance) {
        var accepted: [Int] = []
        var refused: [Refusal] = []
        for (index, candidate) in candidates.enumerated() {
            switch allowance.verdict(fileName: candidate.name, byteCount: candidate.byteCount) {
            case .accepted:
                accepted.append(index)
            case .refused(let reason):
                refused.append(Refusal(fileName: candidate.name, reason: reason))
            }
        }
        acceptedIndices = accepted
        refusals = refused
    }

    /// Les fichiers déposés ou collés dans le composeur suivent la MÊME loi
    /// que ceux du sélecteur ; le texte passe toujours.
    static func screenIngest(
        _ items: [ComposerIngest],
        allowance: GuestAttachmentAllowance,
        byteCount: (URL) -> Int64
    ) -> (kept: [ComposerIngest], refusals: [Refusal]) {
        guard allowance.isRestricted else { return (items, []) }
        var kept: [ComposerIngest] = []
        var refusals: [Refusal] = []
        for item in items {
            guard case .file(let url, let name, _) = item else {
                kept.append(item)
                continue
            }
            switch allowance.verdict(fileName: name, byteCount: byteCount(url)) {
            case .accepted:
                kept.append(item)
            case .refused(let reason):
                refusals.append(Refusal(fileName: name, reason: reason))
            }
        }
        return (kept, refusals)
    }
}

/// Les types que le sélecteur de fichiers propose pour une famille.
enum GuestAttachmentContentTypes {
    static func types(for kind: GuestAttachmentKind) -> [UTType] {
        switch kind {
        case .text: return [.plainText]
        case .audio: return [.audio]
        case .image: return [.jpeg, .png, .gif, .webP]
        case .pdf: return [.pdf]
        }
    }
}

// MARK: - La feuille « Partager dans … » (planche « Attach »)

/// Le sélecteur de pièces jointes d'un invité restreint (#10006) : une tuile
/// par famille OUVERTE, la phrase qui dit ce qui passe, et — quand un fichier
/// choisi ne passe pas — la raison, nommée, sans fermer la feuille.
struct GuestAttachmentSheet: View {
    let conversationTitle: String
    let allowance: GuestAttachmentAllowance
    /// Les fichiers admis, dans l'ordre choisi. L'hôte les fait suivre au
    /// composeur comme une sélection ordinaire.
    let onAccepted: ([URL]) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var pickedKind: GuestAttachmentKind?
    @State private var isImporting = false
    @State private var refusalMessage: String?

    private var kinds: [GuestAttachmentKind] { allowance.kinds ?? GuestAttachmentKind.allCases }
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.mdPlus) {
            Text(GuestAttachmentCopy.title(conversationTitle))
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                .foregroundColor(textPrimary)
                .accessibilityAddTraits(.isHeader)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: MeeshySpacing.smPlus), GridItem(.flexible(), spacing: MeeshySpacing.smPlus)], spacing: MeeshySpacing.smPlus) {
                ForEach(kinds, id: \.self) { kind in
                    tile(kind)
                }
            }

            note

            if let refusalMessage {
                refusalRow(refusalMessage)
                    .transition(.opacity)
            }

            Button {
                dismiss()
            } label: {
                Text(GuestAttachmentCopy.cancel)
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                    .foregroundColor(textPrimary)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .strokeBorder(MeeshyColors.indigo300.opacity(0.42), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.xl)
        .padding(.bottom, MeeshySpacing.xxxl)
        .animation(.easeOut(duration: 0.2), value: refusalMessage)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .fileImporter(
            isPresented: $isImporting,
            allowedContentTypes: pickedKind.map(GuestAttachmentContentTypes.types(for:)) ?? [],
            allowsMultipleSelection: true
        ) { result in
            handlePicked(result)
        }
    }

    // MARK: - Tuiles

    private func tile(_ kind: GuestAttachmentKind) -> some View {
        Button {
            HapticFeedback.light()
            refusalMessage = nil
            pickedKind = kind
            isImporting = true
        } label: {
            VStack(spacing: MeeshySpacing.sm) {
                Image(systemName: icon(kind))
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                    .foregroundColor(tint(kind))
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(tint(kind).opacity(0.14)))
                    .accessibilityHidden(true)
                Text(GuestAttachmentCopy.tileLabel(kind))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(textPrimary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, minHeight: 96)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(isDark ? Color.black.opacity(0.35) : Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .strokeBorder(isDark ? Color.white.opacity(0.06) : MeeshyColors.indigo200, lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    private func icon(_ kind: GuestAttachmentKind) -> String {
        switch kind {
        case .text: return "doc.text"
        case .audio: return "music.note"
        case .image: return "photo"
        case .pdf: return "doc.richtext"
        }
    }

    private func tint(_ kind: GuestAttachmentKind) -> Color {
        switch kind {
        case .text: return MeeshyColors.indigo400
        case .audio: return MeeshyColors.success
        case .image: return MeeshyColors.warning
        case .pdf: return MeeshyColors.info
        }
    }

    // MARK: - Ce qui passe, et le refus

    private var note: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(GuestAttachmentCopy.note(conversationTitle: conversationTitle, kinds: kinds))
            Text(GuestAttachmentCopy.createAccount)
                .fontWeight(.semibold)
        }
        .font(MeeshyFont.relative(MeeshyFont.labelSize))
        .foregroundColor(MeeshyColors.indigo300)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(isDark ? Color.black.opacity(0.35) : MeeshyColors.indigo50)
        )
        .accessibilityElement(children: .combine)
    }

    private func refusalRow(_ message: String) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "nosign")
                .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                .foregroundColor(MeeshyColors.error)
                .frame(width: 32, height: 32)
                .background(Circle().fill(MeeshyColors.error.opacity(0.18)))
                .accessibilityHidden(true)
            Text(message)
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .foregroundColor(textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(MeeshyColors.error.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .strokeBorder(MeeshyColors.error.opacity(0.4), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }

    private var textPrimary: Color { isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950 }

    // MARK: - Sélection

    private func handlePicked(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, !urls.isEmpty else { return }
        let candidates = urls.map { url in
            GuestAttachmentScreening.Candidate(name: url.lastPathComponent, byteCount: Self.byteCount(of: url))
        }
        let screening = GuestAttachmentScreening(candidates: candidates, allowance: allowance)
        let accepted = screening.acceptedIndices.map { urls[$0] }
        if !accepted.isEmpty {
            onAccepted(accepted)
        }
        guard let refusal = screening.refusals.first else {
            dismiss()
            return
        }
        HapticFeedback.error()
        refusalMessage = GuestAttachmentCopy.refusal(fileName: refusal.fileName, reason: refusal.reason, kinds: kinds)
        UIAccessibility.post(notification: .announcement, argument: refusalMessage)
    }

    /// La taille d'un fichier du sélecteur, lue SOUS sa portée de sécurité.
    private static func byteCount(of url: URL) -> Int64 {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber
        return size?.int64Value ?? 0
    }
}

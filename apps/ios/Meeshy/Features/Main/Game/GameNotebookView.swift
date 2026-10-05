import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA PAGE DU CARNET (#9382) — les photos gardées (partager, retirer) et les
/// moments en attente (« Photographier »). Rien n'est promis qui ne soit dans
/// l'appareil ; aucune image n'est envoyée au serveur.
struct GameNotebookPage: View {
    @StateObject private var viewModel = GameNotebookViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var taking: GamePhotoSession?
    @State private var sharing: UIImage?
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            VStack(spacing: 0) {
                GamePageHeader(title: String(localized: "game.notebook.page_title", defaultValue: "Carnet de progression", bundle: .main), onBack: { dismiss() })
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                        if viewModel.isLoaded && viewModel.isEmpty { emptyState }
                        if !viewModel.pending.isEmpty { pendingSection }
                        if !viewModel.kept.isEmpty { keptSection }
                    }
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.md)
                }
            }
        }
        .task { await viewModel.load() }
        .fullScreenCover(item: $taking) { session in
            GamePhotoFlowView(session: session) {
                taking = nil
                Task { await viewModel.load() }
            }
        }
        .sheet(item: Binding(get: { sharing.map(SharedImage.init) }, set: { sharing = $0?.image })) { item in
            ShareSheet(activityItems: [item.image])
        }
        .accessibilityIdentifier("game.notebook.page")
    }

    private struct SharedImage: Identifiable {
        let image: UIImage
        var id: ObjectIdentifier { ObjectIdentifier(image) }
    }

    private var emptyState: some View {
        VStack(spacing: MeeshySpacing.sm) {
            MeeStickerFilmView(filmID: "meo-selfie", animated: false, side: 96, animates: false, pixelCap: 240)
                .frame(width: 96, height: 96)
                .accessibilityHidden(true)
            Text(String(
                localized: "game.notebook.empty",
                defaultValue: "Ton carnet est vide. Les grands moments — un rang, une première Meesh, une Flamme de 7 jours — se photographient avec Mee et Meo, et la photo reste sur ton appareil.",
                bundle: .main
            ))
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
            .foregroundColor(theme.textMuted)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(MeeshySpacing.lg)
    }

    private var pendingSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "game.notebook.pending", defaultValue: "En attente", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ForEach(viewModel.pending) { entry in
                HStack(spacing: MeeshySpacing.md) {
                    entryTitles(entry)
                    Spacer(minLength: 0)
                    Button {
                        HapticFeedback.light()
                        taking = viewModel.makeSession(for: entry)
                    } label: {
                        Text(String(localized: "game.photo.offer.start", defaultValue: "Photographier", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .foregroundColor(MeeshyColors.brandPrimary)
                            .padding(.horizontal, MeeshySpacing.md)
                            .frame(minHeight: 44)
                            .background(Capsule().fill(MeeshyColors.brandPrimary.opacity(0.12)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("game.notebook.take")
                }
                .padding(MeeshySpacing.md)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.backgroundSecondary))
            }
        }
    }

    private var keptSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "game.notebook.kept", defaultValue: "Photos gardées", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ForEach(viewModel.kept) { entry in
                HStack(alignment: .top, spacing: MeeshySpacing.md) {
                    Group {
                        if let image = viewModel.thumbnails[entry.momentId] {
                            Image(uiImage: image).resizable().scaledToFill()
                        } else {
                            Rectangle().fill(theme.textMuted.opacity(0.15))
                        }
                    }
                    .frame(width: 72, height: 128)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
                    .accessibilityLabel(String(localized: "game.notebook.photo_a11y", defaultValue: "Photo : \(entry.title)", bundle: .main))
                    VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                        entryTitles(entry)
                        HStack(spacing: MeeshySpacing.sm) {
                            smallButton(String(localized: "game.photo.share", defaultValue: "Partager", bundle: .main), id: "game.notebook.share") {
                                Task { sharing = await viewModel.fullImage(of: entry, square: false) }
                            }
                            smallButton(String(localized: "game.notebook.remove", defaultValue: "Retirer", bundle: .main), id: "game.notebook.remove") {
                                Task { await viewModel.remove(entry) }
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(MeeshySpacing.md)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.backgroundSecondary))
            }
            if viewModel.removalFailed {
                GameErrorLine(
                    message: String(localized: "game.notebook.remove_failed", defaultValue: "Le carnet n’a pas pu retirer cette photo.", bundle: .main),
                    identifier: "game.notebook.remove.error"
                )
            }
        }
    }

    private func entryTitles(_ entry: NotebookEntry) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.kicker)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .textCase(.uppercase)
                .foregroundColor(theme.textMuted)
            Text(entry.title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundColor(theme.textPrimary)
            Text(entry.createdAt.formatted(date: .abbreviated, time: .omitted))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
    }

    private func smallButton(_ title: String, id: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(MeeshyColors.brandPrimary)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(minHeight: 44)
                .background(Capsule().fill(MeeshyColors.brandPrimary.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}

extension GamePhotoSession: Identifiable {
    var id: String { moment.id }
}

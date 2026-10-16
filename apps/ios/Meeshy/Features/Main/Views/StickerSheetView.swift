import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La fiche d'un sticker reçu** (#10630) — ce que le toucher ouvre, à la place
/// d'un plein écran d'image : l'aperçu, et « Ajouter à mes stickers » quand il
/// n'y est pas (sinon « Dans mes stickers »). Jamais « Enregistrer l'image » :
/// un sticker n'est pas une photo.
struct StickerSheetView: View {
    let sticker: BubbleContent.Sticker
    let savable: StoryStickerLibrary.Savable?
    let isMine: Bool
    var senderName: String? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var inLibrary = false
    @State private var isAdding = false
    @State private var isFavorite = false

    /// Ce qu'on POSSÈDE déjà (emoji, gabarit du catalogue, Mee) se met en
    /// favori ; seul ce qu'on n'a pas se dépose dans « Mes stickers » (#10688).
    private var favoriteEntry: StickerUsageEntry? {
        MessageStickerFavorite.entry(for: MessageSticker(templateId: sticker.templateId, slots: sticker.slots,
                                                         animation: sticker.animation, emoji: sticker.emoji))
    }

    private static let previewSide: CGFloat = 220

    var body: some View {
        VStack(spacing: 20) {
            MessageStickerArtwork(sticker: sticker, side: Self.previewSide)
                .padding(.top, 28)
                .accessibilityLabel(BubbleSticker.accessibilityLabel(for: sticker))

            if let sender = StickerSheetLinks.senderLine(senderName) {
                Text(sender)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("message.sticker.sender")
            }

            if let favoriteEntry {
                favoriteRow(favoriteEntry)
            } else if savable != nil {
                libraryRow
            }
            if let vitrine = StickerSheetLinks.vitrine(templateId: sticker.templateId) {
                viewPackRow(vitrine)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, MeeshySpacing.xxl)
        .padding(.bottom, MeeshySpacing.xxl)
        .task {
            if let favoriteEntry { isFavorite = StickerUsageStore.shared.isFavorite(favoriteEntry) }
            await syncLibraryState()
        }
        .modifier(StickerSheetDetents())
    }

    @ViewBuilder
    private var libraryRow: some View {
        if inLibrary {
            // Le texte reste à l'encre du thème : le vert sémantique (#34D399) sur
            // une feuille claire n'atteint pas le contraste d'un libellé — seule
            // l'icône le porte.
            Label {
                Text(String(localized: "message.sticker.inLibrary",
                            defaultValue: "Dans mes stickers", bundle: .main))
            } icon: {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(MeeshyColors.success)
            }
            .font(.headline)
            .foregroundStyle(.primary)
            .frame(minHeight: 44)
        } else {
            Button {
                add()
            } label: {
                Label(String(localized: "message.sticker.add",
                             defaultValue: "Ajouter à mes stickers", bundle: .main),
                      systemImage: "plus.circle.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Capsule().fill(MeeshyColors.brandGradient))
                    .foregroundStyle(Color.white)
            }
            .buttonStyle(.plain)
            .disabled(isAdding)
        }
    }

    /// « Voir le pack » ouvre la vitrine des stickers centrée sur CE pack (#10703) : la fiche se
    /// ferme, la porte profonde fait le reste — la même que le lien `meeshy://`.
    private func viewPackRow(_ vitrine: DeepLink) -> some View {
        Button {
            HapticFeedback.light()
            dismiss()
            DeepLinkRouter.shared.pendingDeepLink = vitrine
        } label: {
            Label(String(localized: "message.sticker.viewPack", defaultValue: "Voir le pack", bundle: .main),
                  systemImage: "bag")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(MeeshyColors.indigo500)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("message.sticker.viewPack")
    }

    private func favoriteRow(_ entry: StickerUsageEntry) -> some View {
        Button {
            HapticFeedback.light()
            StickerUsageStore.shared.toggleFavorite(entry)
            isFavorite = StickerUsageStore.shared.isFavorite(entry)
        } label: {
            Label(isFavorite ? StickerFavoriteCopy.remove : StickerFavoriteCopy.add,
                  systemImage: isFavorite ? "star.slash" : "star.fill")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Capsule().fill(MeeshyColors.brandGradient))
                .foregroundStyle(Color.white)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("message.sticker.favorite")
    }

    private func syncLibraryState() async {
        guard let savable else { return }
        await ReceivedStickerLedger.shared.refresh()
        inLibrary = ReceivedSticker.isInLibrary(
            savable, isMine: isMine, libraryStickerId: sticker.libraryStickerId,
            known: ReceivedStickerLedger.shared.ids)
    }

    private func add() {
        guard let savable, !isAdding else { return }
        isAdding = true
        HapticFeedback.light()
        Task {
            await ReceivedStickerLedger.shared.add(savable)
            await syncLibraryState()
            isAdding = false
        }
    }
}

private struct StickerSheetDetents: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 16.0, *) {
            content
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        } else {
            content
        }
    }
}

/// **Le toucher d'un sticker ouvre sa fiche** — posé sur le dessin, jamais sur la
/// rangée. Le toucher est RETARDÉ de la fenêtre du double toucher et ANNULÉ par un
/// second : le double toucher reste au menu du message (conteneur de la cellule).
/// Le geste est SIMULTANÉ — il ne vole rien à l'appui long ni au double toucher.
struct StickerSheetOnTap: ViewModifier {
    let sticker: BubbleContent.Sticker
    let isMine: Bool
    var senderName: String? = nil
    var isEnabled: Bool = true

    @State private var isPresented = false
    @State private var pendingOpen: Task<Void, Never>?

    private var savable: StoryStickerLibrary.Savable? {
        guard let picture = sticker.picture else { return nil }
        return ReceivedSticker.savable(attachmentId: picture.attachmentId, fileUrl: picture.fileUrl)
    }

    func body(content: Content) -> some View {
        content
            .task { await ReceivedStickerLedger.shared.refresh() }
            .simultaneousGesture(TapGesture().onEnded { tapped() }, including: isEnabled ? .all : .subviews)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { if isEnabled { isPresented = true } }
            .sheet(isPresented: $isPresented) {
                StickerSheetView(sticker: sticker, savable: savable, isMine: isMine, senderName: senderName)
            }
            .onDisappear { pendingOpen?.cancel(); pendingOpen = nil }
    }

    private func tapped() {
        if let pending = pendingOpen {
            pending.cancel()
            pendingOpen = nil
            return
        }
        pendingOpen = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(ReceivedSticker.doubleTapWindow * 1_000_000_000))
            guard !Task.isCancelled else { return }
            pendingOpen = nil
            HapticFeedback.light()
            isPresented = true
        }
    }
}

extension View {
    func stickerSheetOnTap(sticker: BubbleContent.Sticker, isMine: Bool, senderName: String? = nil,
                           isEnabled: Bool = true) -> some View {
        modifier(StickerSheetOnTap(sticker: sticker, isMine: isMine, senderName: senderName, isEnabled: isEnabled))
    }
}

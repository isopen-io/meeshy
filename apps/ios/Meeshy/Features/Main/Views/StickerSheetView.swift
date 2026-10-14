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
    let libraryStickerId: String?

    @Environment(\.dismiss) private var dismiss
    @State private var inLibrary = false
    @State private var isAdding = false

    private static let previewSide: CGFloat = 220

    var body: some View {
        VStack(spacing: 20) {
            MessageStickerArtwork(sticker: sticker, side: Self.previewSide)
                .padding(.top, 28)
                .accessibilityLabel(BubbleSticker.accessibilityLabel(for: sticker))

            if savable != nil {
                libraryRow
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
        .task { await syncLibraryState() }
        .modifier(StickerSheetDetents())
    }

    @ViewBuilder
    private var libraryRow: some View {
        if inLibrary {
            Label(String(localized: "message.sticker.inLibrary",
                         defaultValue: "Dans mes stickers", bundle: .main),
                  systemImage: "checkmark.circle.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(MeeshyColors.success)
        } else {
            Button {
                add()
            } label: {
                Label(String(localized: "message.sticker.add",
                             defaultValue: "Ajouter à mes stickers", bundle: .main),
                      systemImage: "plus.circle.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Capsule().fill(MeeshyColors.brandGradient))
                    .foregroundStyle(Color.white)
            }
            .buttonStyle(.plain)
            .disabled(isAdding)
        }
    }

    private func syncLibraryState() async {
        guard let savable else { return }
        await ReceivedStickerLedger.shared.refresh()
        inLibrary = ReceivedSticker.isInLibrary(
            savable, isMine: isMine, libraryStickerId: libraryStickerId,
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
            content.presentationDetents([.medium])
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
    let libraryStickerId: String?
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
                StickerSheetView(sticker: sticker, savable: savable,
                                 isMine: isMine, libraryStickerId: libraryStickerId)
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
    func stickerSheetOnTap(sticker: BubbleContent.Sticker, isMine: Bool,
                           libraryStickerId: String? = nil, isEnabled: Bool = true) -> some View {
        modifier(StickerSheetOnTap(sticker: sticker, isMine: isMine,
                                   libraryStickerId: libraryStickerId, isEnabled: isEnabled))
    }
}

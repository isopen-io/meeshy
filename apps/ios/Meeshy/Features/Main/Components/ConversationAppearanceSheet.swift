import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Fond et accent de la conversation (#10631, spec §§ 5.4, 9, 13)
//
// Le sélecteur PERSONNEL : Signature, les modèles du catalogue embarqué, une
// couleur unie de la gamme, une photo envoyée dans la conversation (voile et
// flou), et l'accent. Chaque choix s'applique au toucher ; un refus du serveur
// le rétablit (`ConversationAppearanceViewModel`). Cibles ≥ 44 pt, nom localisé
// et état « sélectionné » portés à VoiceOver.

struct ConversationAppearanceSheet: View {
    /// L'accent CALCULÉ de la conversation (« Automatique »), jamais l'accent personnel déjà choisi.
    let accentColor: String

    @StateObject private var viewModel: ConversationAppearanceViewModel
    @StateObject private var media: ConversationMediaHubViewModel
    @State private var veilDraft: Double = 0.3
    @State private var blurDraft: Double = 0
    @State private var draggingSlider = false
    @State private var showsShop = false
    /// Les packs de fonds possédés et installés (`nil` tant qu'ils ne sont pas lus : les packs installés d'office).
    /// Cache-first : la dernière liste lue pour ce compte, puis la relecture réseau.
    @State private var installedWallpapers: [ShopPack]? = InstalledWallpapersMemo.shared.packs(for: AuthManager.shared.currentUser?.id)
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    private let catalog = AppearanceCatalog.shared
    private let language = Locale.preferredLanguages.first ?? "fr"
    private var isDark: Bool { colorScheme == .dark }
    private var scheme: AppearanceScheme { isDark ? .dark : .light }
    private var theme: ThemeManager { ThemeManager.shared }
    private let columns = [GridItem(.adaptive(minimum: 72), spacing: MeeshySpacing.md)]

    init(conversationId: String, initial: ConversationAppearance?, accentColor: String) {
        self.accentColor = accentColor
        _viewModel = StateObject(wrappedValue: ConversationAppearanceViewModel(conversationId: conversationId, initial: initial))
        _media = StateObject(wrappedValue: ConversationMediaHubViewModel(conversationId: conversationId))
    }

    private var appearance: ConversationAppearance { viewModel.appearance }
    private var effectiveAccent: String {
        ConversationBackgroundResolution.effectiveAccentHex(appearance, computedHex: accentColor, isDark: isDark)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                    modelsSection
                    solidSection
                    photoSection
                    accentSection
                    shopLink
                    resetButton
                    if let message = viewModel.errorMessage {
                        Text(message)
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                            .foregroundColor(MeeshyColors.error)
                    }
                }
                .padding(MeeshySpacing.xl)
            }
            .navigationTitle(String(localized: "conversation.appearance.sheet.title", defaultValue: "Fond et accent", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.done", defaultValue: "Terminé", bundle: .main)) { dismiss() }
                }
            }
        }
        .task { media.select(.visual) }
        .task { await loadInstalledWallpapers() }
        // « Plus dans la boutique » installe puis revient : le sélecteur relit les packs installés.
        .sheet(isPresented: $showsShop, onDismiss: { Task { await loadInstalledWallpapers() } }) {
            PacksSettingsView(initialDomain: .wallpaper)
        }
        .onReceive(NotificationCenter.default.publisher(for: ConversationAppearanceChange.notification).receive(on: DispatchQueue.main)) { note in
            if let remote = ConversationAppearanceChange.appearance(in: note, for: viewModel.conversationId) { viewModel.adopt(remote) }
        }
        .onAppear { syncDrafts() }
        // Un refus (retour arrière) ou l'écho d'un autre appareil remet aussi les curseurs à leur place.
        .onChange(of: viewModel.appearance) { _ in syncDrafts() }
    }

    private func loadInstalledWallpapers() async {
        let result: Result<[ShopPack], Error>
        do {
            result = .success(try await PackService<ShopPack>(domain: .wallpaper).installed())
        } catch {
            result = .failure(error)
        }
        guard let list = WallpaperPackOptions.installedList(from: result) else { return }
        InstalledWallpapersMemo.shared.remember(list, for: AuthManager.shared.currentUser?.id)
        installedWallpapers = list
    }

    private func syncDrafts() {
        guard let settings = viewModel.currentPhotoSettings else { return }
        veilDraft = settings.veil
        blurDraft = Double(settings.blur)
    }

    // MARK: Modèles

    private var modelsSection: some View {
        section(String(localized: "conversation.appearance.section.models", defaultValue: "Modèles", bundle: .main)) {
            LazyVGrid(columns: columns, spacing: MeeshySpacing.md) {
                tile(
                    label: String(localized: "conversation.appearance.signature", defaultValue: "Signature", bundle: .main),
                    selected: appearance.background == .signature
                ) {
                    LinearGradient(colors: [Color(hex: effectiveAccent).opacity(0.25), MeeshyColors.backgroundPrimary(isDark: isDark)], startPoint: .top, endPoint: .bottom)
                } action: { viewModel.selectSignature() }

                ForEach(WallpaperPackOptions.packs(installed: installedWallpapers, catalog: catalog)) { pack in
                    ForEach(pack.designs) { design in
                        tile(
                            label: catalog.designName(design.key, language: language) ?? design.key,
                            selected: appearance.background == .design(pack: pack.slug, design: design.key)
                        ) {
                            AppearanceDesignView(design: design, isDark: isDark, accentHex: effectiveAccent)
                                .equatable()
                                .overlay {
                                    if let lottie = design.lottie {
                                        PackLottieLayer(ref: lottie, contentMode: .fill)
                                    }
                                }
                                .clipped()
                        } action: { viewModel.selectDesign(pack: pack.slug, design: design.key) }
                    }
                }
            }
        }
    }

    // MARK: Couleur unie

    private var solidSection: some View {
        section(String(localized: "conversation.appearance.section.solid", defaultValue: "Couleur unie", bundle: .main)) {
            LazyVGrid(columns: columns, spacing: MeeshySpacing.md) {
                ForEach(catalog.gamut.entries) { entry in
                    tile(
                        label: catalog.gamutName(entry.key, language: language) ?? entry.name,
                        selected: appearance.background == .solid(color: entry.key)
                    ) {
                        Color(hex: entry.shade(scheme).surface)
                    } action: { viewModel.selectSolid(color: entry.key) }
                }
            }
        }
    }

    // MARK: Photo

    private var photoCandidates: [MessageAttachment] {
        media.listing.items.compactMap { item -> MessageAttachment? in
            guard case .attachment(let attachment) = item.payload,
                  attachment.type == .image, ConversationBackgroundPhotoVerdict.mayBeOffered(attachment) else { return nil }
            return attachment
        }
    }

    private var photoSection: some View {
        section(String(localized: "conversation.appearance.section.photo", defaultValue: "Photo de la conversation", bundle: .main)) {
            if photoCandidates.isEmpty {
                photoEmptyState
            } else {
                LazyVGrid(columns: columns, spacing: MeeshySpacing.md) {
                    ForEach(photoCandidates, id: \.id) { attachment in
                        tile(
                            label: ConversationBackgroundPhotoVerdict.accessibilityLabel(createdAt: attachment.createdAt),
                            selected: isSelectedPhoto(attachment.id)
                        ) {
                            CachedAsyncImage(url: attachment.thumbnailUrl ?? attachment.fileUrl, targetSize: CGSize(width: 72, height: 96), thumbHash: attachment.thumbHash)
                                .scaledToFill()
                        } action: {
                            viewModel.selectPhoto(
                                attachmentId: attachment.id,
                                photo: ConversationBackgroundPhoto(thumbnailUrl: attachment.thumbnailUrl, fullUrl: attachment.fileUrl, thumbHash: attachment.thumbHash)
                            )
                            syncDrafts()
                        }
                        .onAppear {
                            if attachment.id == photoCandidates.last?.id, media.listing.canLoadMore { media.loadMore() }
                        }
                    }
                }
            }
            if viewModel.currentPhotoSettings != nil {
                photoSliders
            }
        }
    }

    /// Vide, oui — mais seulement une fois la galerie lue : pendant le chargement, hors ligne ou en
    /// échec, l'état le dit plutôt que d'affirmer qu'aucune photo n'a été envoyée.
    @ViewBuilder private var photoEmptyState: some View {
        switch media.listing.phase {
        case .loading:
            HStack(spacing: MeeshySpacing.sm) {
                ProgressView()
                Text(ConversationMediaHubCopy.loading)
            }
            .font(MeeshyFont.relative(MeeshyFont.subheadSize))
            .foregroundColor(theme.textMuted)
            .accessibilityElement(children: .combine)
        case .offline:
            photoStateText(ConversationMediaHubCopy.offlineEmpty)
        case .failed:
            photoStateText(ConversationMediaHubCopy.error)
        case .loaded:
            photoStateText(String(localized: "conversation.appearance.photo.empty", defaultValue: "Aucune photo envoyée dans cette conversation", bundle: .main))
        }
    }

    private func photoStateText(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize))
            .foregroundColor(theme.textMuted)
    }

    private func isSelectedPhoto(_ id: String) -> Bool {
        if case .photo(let selected, _, _) = appearance.background { return selected == id }
        return false
    }

    private var photoSliders: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "conversation.appearance.photo.veil", defaultValue: "Voile", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            Slider(value: $veilDraft, in: 0...ConversationBackground.photoVeilMax, step: ConversationBackground.photoVeilStep) { editing in
                draggingSlider = editing
                if !editing { viewModel.setPhotoVeil(veilDraft) }
            }
            .accessibilityLabel(String(localized: "conversation.appearance.photo.veil", defaultValue: "Voile", bundle: .main))
            // VoiceOver et le clavier ajustent le curseur sans geste de glissement : la valeur s'enregistre aussitôt.
            .onChange(of: veilDraft) { value in
                if !draggingSlider { viewModel.setPhotoVeil(value) }
            }
            Text(String(localized: "conversation.appearance.photo.blur", defaultValue: "Flou", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            Slider(value: $blurDraft, in: 0...Double(ConversationBackground.photoBlurMax), step: 1) { editing in
                draggingSlider = editing
                if !editing { viewModel.setPhotoBlur(Int(blurDraft.rounded())) }
            }
            .accessibilityLabel(String(localized: "conversation.appearance.photo.blur", defaultValue: "Flou", bundle: .main))
            .onChange(of: blurDraft) { value in
                if !draggingSlider { viewModel.setPhotoBlur(Int(value.rounded())) }
            }
        }
    }

    // MARK: Accent

    private var accentSection: some View {
        section(String(localized: "conversation.appearance.section.accent", defaultValue: "Mon accent", bundle: .main)) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 48), spacing: MeeshySpacing.md)], spacing: MeeshySpacing.md) {
                swatch(
                    label: String(localized: "conversation.appearance.accent.auto", defaultValue: "Automatique", bundle: .main),
                    selected: appearance.accent == nil
                ) {
                    ZStack {
                        Circle().fill(Color(hex: accentColor))
                        Image(systemName: "wand.and.stars").foregroundColor(.white).accessibilityHidden(true)
                    }
                } action: { viewModel.setAccent(nil) }

                ForEach(catalog.gamut.entries) { entry in
                    swatch(
                        label: catalog.gamutName(entry.key, language: language) ?? entry.name,
                        selected: appearance.accent == entry.key
                    ) {
                        Circle().fill(Color(hex: entry.shade(scheme).accent))
                    } action: { viewModel.setAccent(entry.key) }
                }
            }
        }
    }

    /// « Plus dans la boutique » : la vitrine unique, filtrée sur les fonds (#10632).
    private var shopLink: some View {
        Button {
            HapticFeedback.light()
            showsShop = true
        } label: {
            Label(String(localized: "conversation.appearance.shop", defaultValue: "Plus dans la boutique", bundle: .main),
                  systemImage: "bag")
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
    }

    private var resetButton: some View {
        Button(role: .destructive) {
            viewModel.reset()
            syncDrafts()
        } label: {
            Text(String(localized: "conversation.appearance.reset", defaultValue: "Rétablir Signature", bundle: .main))
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .disabled(appearance.isDefault)
    }

    // MARK: Briques

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                .foregroundColor(theme.textSecondary)
                .accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func tile<Preview: View>(label: String, selected: Bool, @ViewBuilder preview: () -> Preview, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            preview()
                .frame(width: 72, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .strokeBorder(selected ? Color(hex: effectiveAccent) : theme.textMuted.opacity(0.3), lineWidth: selected ? 3 : 1)
                )
                .overlay(alignment: .bottomTrailing) {
                    if selected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(Color(hex: effectiveAccent))
                            .background(Circle().fill(.white))
                            .padding(MeeshySpacing.xs)
                            .accessibilityHidden(true)
                    }
                }
                .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    private func swatch<Preview: View>(label: String, selected: Bool, @ViewBuilder preview: () -> Preview, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            preview()
                .frame(width: 40, height: 40)
                .overlay(Circle().strokeBorder(selected ? theme.textPrimary : Color.clear, lineWidth: 3))
                .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - La dernière liste de packs de fonds lue, par compte (#10708, Cache-First)

/// Mémoire de processus, bornée à UN compte : la rouverture du sélecteur ne repeint pas la grille
/// sous le doigt, et un autre compte ne lit jamais la liste du premier.
struct InstalledWallpapersMemo {
    @MainActor static var shared = InstalledWallpapersMemo()

    private var entry: (userId: String, packs: [ShopPack])?

    func packs(for userId: String?) -> [ShopPack]? {
        guard let userId, let entry, entry.userId == userId else { return nil }
        return entry.packs
    }

    mutating func remember(_ packs: [ShopPack], for userId: String?) {
        guard let userId else { return }
        entry = (userId, packs)
    }
}

import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - StoryExportShareSheet
//
// Author-only sheet that bakes the current slide into an MP4 and presents
// the system share sheet (`ShareSheet`) so the user can drop the file into
// Photos / Messages / WhatsApp / AirDrop. NEVER touches the Meeshy backend.

struct StoryExportShareSheet: View {
    let story: StoryItem
    @ObservedObject var viewModel: StoryExportShareViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                header
                if !viewModel.availableLanguages.isEmpty {
                    languagePicker
                }
                Spacer(minLength: 0)
                progressOrAction
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 24)
            .background(StoryExportSheetPalette.wash(isDark: isDark).ignoresSafeArea())
            .navigationTitle(String(localized: "story.export.share.title", defaultValue: "Exporter en vidéo"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler")) {
                        viewModel.cancel()
                        dismiss()
                    }
                }
            }
            .onAppear {
                viewModel.prepare(story: story)
            }
            .sheet(item: Binding<ShareWrapper?>(
                get: { viewModel.sharedURL.map(ShareWrapper.init) },
                set: { _ in }
            )) { wrapper in
                ShareSheet(activityItems: [wrapper.url], onCompletion: { completed in
                    viewModel.finishSharing(success: completed)
                    dismiss()
                })
                .onAppear { viewModel.markSharingPresented() }
            }
            .alert(
                String(localized: "story.export.share.errorTitle",
                       defaultValue: "Export impossible"),
                isPresented: Binding(
                    get: { viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.errorMessage = nil } }
                ),
                actions: {
                    Button(String(localized: "common.ok", defaultValue: "OK"),
                           role: .cancel) { viewModel.errorMessage = nil }
                },
                message: {
                    if let msg = viewModel.errorMessage {
                        Text(msg)
                    }
                }
            )
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "square.and.arrow.up.fill")
                // Doctrine 84i : hero décoratif de la sheet (~36pt) → taille figée
                // (un glyphe hero qui grossit en XXXL déséquilibrerait l'en-tête) ;
                // masqué du rotor car le sous-titre adjacent porte le sens.
                .font(.system(size: 36, weight: .semibold))
                .foregroundStyle(MeeshyColors.brandGradient)
                .accessibilityHidden(true)
            Text(String(localized: "story.export.share.subtitle",
                        defaultValue: "Génère un MP4 fidèle à la prévisualisation pour le partager hors Meeshy."))
            .font(MeeshyFont.relative(14))
            .multilineTextAlignment(.center)
            .foregroundColor(.secondary)
        }
        .padding(.top, 8)
    }

    // MARK: - Language Picker

    private var languagePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "story.export.share.languageLabel",
                        defaultValue: "Langue à graver"))
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(.secondary)

            Menu {
                Button(String(localized: "story.export.share.languageOriginal",
                              defaultValue: "Texte original")) {
                    viewModel.selectedLanguage = nil
                }
                ForEach(viewModel.availableLanguages, id: \.self) { lang in
                    Button(displayName(for: lang)) {
                        viewModel.selectedLanguage = lang
                    }
                }
            } label: {
                HStack {
                    Text(viewModel.selectedLanguage.map(displayName(for:))
                         ?? String(localized: "story.export.share.languageOriginal",
                                   defaultValue: "Texte original"))
                        .foregroundColor(.primary)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(.secondary)
                        .accessibilityHidden(true)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(StoryExportSheetPalette.pickerFill(isDark: isDark))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(StoryExportSheetPalette.pickerStroke(isDark: isDark), lineWidth: 1)
                )
            }
            .disabled(viewModel.phase == .exporting || viewModel.phase == .sharing)
        }
    }

    private func displayName(for code: String) -> String {
        Locale.current.localizedString(forLanguageCode: code)?.capitalized
            ?? code.uppercased()
    }

    // MARK: - Progress / CTA

    @ViewBuilder
    private var progressOrAction: some View {
        switch viewModel.phase {
        case .exporting:
            VStack(spacing: 12) {
                ProgressView(value: viewModel.progress)
                    .progressViewStyle(.linear)
                    .tint(MeeshyColors.indigo500)
                Text(String(
                    format: String(localized: "story.export.share.exporting",
                                   defaultValue: "Export en cours… %lld%%"),
                    Int(viewModel.progress * 100)
                ))
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(.secondary)
            }
        case .idle, .failed:
            Button {
                HapticFeedback.medium()
                Task { await viewModel.startExport(story: story) }
            } label: {
                Text(String(localized: "story.export.share.cta", defaultValue: "Exporter en vidéo"))
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(MeeshyColors.brandGradient)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
        case .ready, .sharing:
            ProgressView()
                .tint(MeeshyColors.indigo500)
        }
    }
}

// MARK: - Share Sheet wrapper

private struct ShareWrapper: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

// MARK: - Palette de surface

/// Jetons de surface de la feuille d'export, dérivés du **`colorScheme` réel
/// de rendu** — jamais de `ThemeManager.mode`.
///
/// La distinction n'est pas théorique : cette feuille a deux points d'entrée,
/// et l'un des deux force le sombre. `StoryViewerView` applique
/// `.preferredColorScheme(.dark)` à son contenu, et une `.sheet` présentée
/// depuis cette hiérarchie en hérite. Le sélecteur de langue s'y rendait donc
/// **toujours** avec ses valeurs de mode clair, quel que soit le thème choisi
/// dans l'app : texte `.primary` (blanc en sombre) sur un fond lavande très
/// clair, soit un contraste de **2,7:1** — sous le seuil WCAG AA de 4,5:1.
/// Le chevron `.secondary` tombait à ~1,9:1.
///
/// Les valeurs de mode clair sont reprises **à l'identique** : l'itération
/// répare le mode sombre, elle ne re-règle pas le mode clair.
enum StoryExportSheetPalette {

    /// Voile de fond de la feuille. En clair, la lavande sombre de la marque à
    /// 4 % ; en sombre, son inverse — l'ancienne valeur y peignait du presque
    /// noir sur du noir, c'est-à-dire rien.
    static func wash(isDark: Bool) -> Color {
        isDark ? MeeshyColors.indigo50.opacity(0.04) : MeeshyColors.indigo950.opacity(0.04)
    }

    /// Fond du sélecteur de langue.
    static func pickerFill(isDark: Bool) -> Color {
        isDark ? MeeshyColors.indigo900.opacity(0.35) : MeeshyColors.indigo50.opacity(0.6)
    }

    /// Bordure du sélecteur de langue.
    static func pickerStroke(isDark: Bool) -> Color {
        isDark ? MeeshyColors.indigo700.opacity(0.5) : MeeshyColors.indigo200
    }
}

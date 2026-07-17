import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryExportShareSheet
//
// Author-only sheet that bakes the current slide into an MP4 and presents
// the system `UIActivityViewController` so the user can drop the file into
// Photos / Messages / WhatsApp / AirDrop. NEVER touches the Meeshy backend.

struct StoryExportShareSheet: View {
    let story: StoryItem
    @ObservedObject var viewModel: StoryExportShareViewModel
    @Environment(\.dismiss) private var dismiss

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
            .background(MeeshyColors.indigo950.opacity(0.04).ignoresSafeArea())
            .navigationTitle(String(localized: "story.export.share.title",
                                    defaultValue: "Exporter en vidéo"))
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
                ActivityView(url: wrapper.url) { completed in
                    viewModel.finishSharing(success: completed)
                    dismiss()
                }
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
                    Button("OK", role: .cancel) { viewModel.errorMessage = nil }
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
            Text(String(
                localized: "story.export.share.subtitle",
                defaultValue: "Génère un MP4 fidèle à la prévisualisation pour le partager hors Meeshy."
            ))
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
                        .fill(MeeshyColors.indigo50.opacity(0.6))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(MeeshyColors.indigo200, lineWidth: 1)
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
                Text(String(localized: "story.export.share.cta",
                            defaultValue: "Exporter en vidéo"))
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

// MARK: - Share Sheet wrappers

private struct ShareWrapper: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

private struct ActivityView: UIViewControllerRepresentable {
    let url: URL
    let onCompletion: (Bool) -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        vc.completionWithItemsHandler = { _, completed, _, _ in
            onCompletion(completed)
        }
        return vc
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

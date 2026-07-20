import SwiftUI
import UIKit
import MeeshySDK

/// Unified, immersive video editor.
///
/// Replaces the old two-step *edit* / *use* flow with a single fullscreen
/// surface: a preview stage, a zoomable timeline, a Simple / Pro switch and
/// the FAB-driven tool band borrowed from the Story composer. Editing is
/// non-destructive — the source file is only flattened on confirm.
public struct MeeshyVideoEditorView: View {
    @StateObject private var viewModel: VideoEditorViewModel

    @Environment(\.theme) private var theme
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.scenePhase) private var scenePhase

    public init(
        url: URL,
        context: MediaPreviewContext = .post,
        accentColor: String = MeeshyColors.brandPrimaryHex,
        onComplete: @escaping (VideoEditResult) -> Void,
        onCancel: (() -> Void)? = nil
    ) {
        _viewModel = StateObject(wrappedValue: VideoEditorViewModel(
            url: url,
            context: context,
            accentColor: accentColor,
            onComplete: onComplete,
            onCancel: onCancel ?? {}
        ))
    }

    private var accent: Color { Color(hex: viewModel.accentColor) }

    /// VRAIS safe-area insets de la fenêtre — JAMAIS ceux de l'environnement
    /// SwiftUI. Présenté depuis le composer de post, l'éditeur vit dans un
    /// `.fullScreenCover` imbriqué (le composer est lui-même un cover) où la
    /// présentation modale en cascade — combinée au `.statusBarHidden()` des
    /// éditeurs frères — rapporte `safeAreaInsets = 0`. Le chrome déborderait
    /// alors sous la Dynamic Island / home indicator. La fenêtre, elle, expose
    /// toujours les insets physiques réels du device. Même pattern que
    /// `StoryComposerView.safeAreaBottomInset` et `ConversationView`.
    private var deviceSafeAreaInsets: UIEdgeInsets {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first(where: { $0.isKeyWindow })?.safeAreaInsets ?? .zero
    }

    public var body: some View {
        // On applique nous-mêmes les insets fenêtre et on neutralise la safe
        // area de l'environnement via `.ignoresSafeArea()` (sinon double
        // comptage quand elle est correctement renseignée). Le fond passe par
        // `.background(...)` — jamais en enfant d'un `ZStack` : combiné au
        // `VideoEditorStage` flexible (`maxHeight: .infinity`), un fond ZStack
        // pleine page étirerait le VStack hors safe area.
        let insets = deviceSafeAreaInsets
        return VStack(spacing: 0) {
            topBar
            historyRow
            VideoEditorStage(viewModel: viewModel)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            VideoEditorTimeline(viewModel: viewModel)
                .padding(.horizontal, 8)
            bottomDock
        }
        .padding(.top, insets.top + 8)
        .padding(.bottom, insets.bottom)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.backgroundPrimary)
        .ignoresSafeArea()
        .overlay(alignment: .top) {
            if let banner = viewModel.banner {
                bannerView(banner)
            }
        }
        .overlay {
            if viewModel.isExporting || exportFailed {
                exportOverlay
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: viewModel.panel)
        .animation(.easeInOut(duration: 0.25), value: viewModel.banner)
        .task { await viewModel.load() }
        .onDisappear { viewModel.teardown() }
        .adaptiveOnChange(of: scenePhase) { _, phase in viewModel.handleScenePhase(phase) }
        .alert(
            "Reprendre l'édition ?",
            isPresented: Binding(
                get: { viewModel.pendingRecovery != nil },
                set: { if !$0 { viewModel.discardRecovery() } }
            )
        ) {
            Button("Restaurer") { viewModel.acceptRecovery() }
            Button("Recommencer", role: .cancel) { viewModel.discardRecovery() }
        } message: {
            Text("Une session d'édition non terminée a été retrouvée pour cette vidéo.")
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(spacing: 10) {
            Button {
                viewModel.cancelEditing()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(theme.textPrimary)
                    .frame(width: 38, height: 38)
                    .background(theme.glassMaterial, in: Circle())
            }
            .buttonStyle(.plain)

            Spacer()

            VideoEditorModeSwitcher(
                mode: viewModel.mode,
                isDark: colorScheme == .dark,
                onSelect: viewModel.setMode
            )
            .equatable()

            Spacer()

            Button {
                viewModel.confirm()
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                    Text("Terminer")
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background(Capsule().fill(MeeshyColors.brandGradient))
            }
            .buttonStyle(.plain)
            .disabled(viewModel.isExporting)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
    }

    // MARK: - History row

    private var historyRow: some View {
        HStack(spacing: 8) {
            historyButton(icon: "arrow.uturn.backward", enabled: viewModel.canUndo) {
                viewModel.undo()
            }
            historyButton(icon: "arrow.uturn.forward", enabled: viewModel.canRedo) {
                viewModel.redo()
            }
            Spacer()
            if viewModel.document.hasEdits {
                Button {
                    viewModel.resetAllEdits()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.counterclockwise")
                        Text("Réinitialiser")
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(theme.textSecondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 4)
    }

    private func historyButton(icon: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(enabled ? theme.textPrimary : theme.textMuted.opacity(0.5))
                .frame(width: 32, height: 32)
                .background(theme.glassMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }

    // MARK: - Bottom dock

    @ViewBuilder
    private var bottomDock: some View {
        if viewModel.panel.isVisible {
            VideoEditorBand(viewModel: viewModel)
                .padding(.horizontal, 6)
                .padding(.top, 6)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        } else {
            HStack {
                VideoEditorFABColumn(
                    activeCategory: viewModel.panel.activeCategory,
                    onTap: viewModel.tapFAB
                )
                Spacer()
            }
            .padding(.leading, 16)
            .padding(.top, 10)
            .padding(.bottom, 6)
            .transition(.opacity)
        }
    }

    // MARK: - Banner

    private func bannerView(_ banner: VideoEditorViewModel.Banner) -> some View {
        VStack {
            HStack(spacing: 8) {
                Image(systemName: banner.isError ? "exclamationmark.triangle.fill" : "info.circle.fill")
                Text(banner.message)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(2)
                Spacer(minLength: 0)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(banner.isError ? theme.error : accent)
            )
            .padding(.horizontal, 20)
            .padding(.top, 70)
            Spacer()
        }
        .transition(.move(edge: .top).combined(with: .opacity))
        .onTapGesture { viewModel.banner = nil }
        .task(id: banner.id) {
            try? await Task.sleep(for: .seconds(4))
            if viewModel.banner?.id == banner.id { viewModel.banner = nil }
        }
    }

    // MARK: - Export overlay

    private var exportFailed: Bool {
        if case .failed = viewModel.exportPhase { return true }
        return false
    }

    private var exportProgress: Double {
        if case .exporting(let value) = viewModel.exportPhase { return value }
        return 0
    }

    private var exportOverlay: some View {
        ZStack {
            Color.black.opacity(0.72).ignoresSafeArea()

            VStack(spacing: 16) {
                if case .failed(let message) = viewModel.exportPhase {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 34))
                        .foregroundStyle(theme.warning)
                    Text("Export impossible")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(theme.textPrimary)
                    Text(message)
                        .font(.system(size: 12))
                        .foregroundStyle(theme.textSecondary)
                        .multilineTextAlignment(.center)
                    HStack(spacing: 12) {
                        overlayButton("Fermer", filled: false) { viewModel.cancelExport() }
                        overlayButton("Réessayer", filled: true) { viewModel.confirm() }
                    }
                } else {
                    progressRing
                    Text(viewModel.exportPhase == .preparing ? "Préparation…" : "Export \(Int(exportProgress * 100)) %")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(theme.textPrimary)
                    overlayButton("Annuler", filled: false) { viewModel.cancelExport() }
                }
            }
            .padding(28)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(theme.backgroundSecondary)
            )
            .padding(40)
        }
        .transition(.opacity)
    }

    private var progressRing: some View {
        ZStack {
            Circle()
                .stroke(theme.textMuted.opacity(0.3), lineWidth: 6)
            Circle()
                .trim(from: 0, to: max(0.02, exportProgress))
                .stroke(accent, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Image(systemName: "film")
                .font(.system(size: 20))
                .foregroundStyle(theme.textSecondary)
        }
        .frame(width: 78, height: 78)
        .animation(.easeOut(duration: 0.2), value: exportProgress)
    }

    private func overlayButton(_ title: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(filled ? Color.white : theme.textPrimary)
                .padding(.horizontal, 18)
                .padding(.vertical, 9)
                .background(
                    Capsule().fill(filled
                        ? AnyShapeStyle(MeeshyColors.brandGradient)
                        : AnyShapeStyle(theme.glassMaterial))
                )
        }
        .buttonStyle(.plain)
    }
}

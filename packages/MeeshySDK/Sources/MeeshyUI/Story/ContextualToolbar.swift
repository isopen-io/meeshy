import SwiftUI
import MeeshySDK

// MARK: - Contextual Toolbar

/// Full-width segmented toggle: FOND / FRONT.
/// Selecting a segment reveals its tool pills below. Always visible, no tap-to-expand.
struct ContextualToolbar: View {
    @Bindable var viewModel: StoryComposerViewModel
    @Environment(\.theme) private var theme
    @State private var selectedGroup: StoryToolGroup = .fond

    var body: some View {
        VStack(spacing: 10) {
            // Segmented toggle
            segmentedToggle

            // Tool pills for active group
            toolPills
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .onChange(of: viewModel.activeTool) { _, newTool in
            guard let tool = newTool else { return }
            if selectedGroup != tool.group {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    selectedGroup = tool.group
                }
            }
        }
    }

    // MARK: - Segmented Toggle

    private var segmentedToggle: some View {
        HStack(spacing: 0) {
            segmentButton(.fond, label: "FOND")
            segmentButton(.front, label: "FRONT")
        }
    }

    private func segmentButton(_ group: StoryToolGroup, label: String) -> some View {
        let isSelected = selectedGroup == group

        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                selectedGroup = group
                if viewModel.activeTool?.group != group {
                    viewModel.activeTool = nil
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(label)
                    .font(.system(size: 14, weight: isSelected ? .bold : .regular, design: .rounded))

                if groupBadge(group) > 0 {
                    Text("\(groupBadge(group))")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(MeeshyColors.indigo400)
                        .clipShape(Circle())
                }
            }
            .foregroundStyle(.white)
            .opacity(isSelected ? 1.0 : 0.4)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Tool Pills

    private var toolPills: some View {
        HStack(spacing: 8) {
            switch selectedGroup {
            case .fond:
                toolPill(.bgMedia, icon: "photo.fill", label: String(localized: "story.toolbar.background", defaultValue: "Fond", bundle: .module), badge: bgMediaCount)
                toolPill(.drawing, icon: "pencil.tip", label: String(localized: "story.toolbar.drawing", defaultValue: "Dessin", bundle: .module), badge: hasDrawing ? 1 : 0)
                // DISABLED: bgAudio — non fonctionnel
            case .front:
                toolPill(.text, icon: "textformat", label: String(localized: "story.toolbar.text", defaultValue: "Texte", bundle: .module), badge: textCount)
                toolPill(.media, icon: "photo.on.rectangle.angled", label: String(localized: "story.toolbar.media", defaultValue: "Media", bundle: .module), badge: fgMediaCount)
                toolPill(.audio, icon: "waveform", label: String(localized: "story.toolbar.audio", defaultValue: "Audio", bundle: .module), badge: fgAudioCount)
            }
        }
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: selectedGroup)
    }

    // MARK: - Tool Pill

    @ViewBuilder
    private func toolPill(
        _ tool: StoryToolMode,
        icon: String,
        label: String,
        badge: Int
    ) -> some View {
        let isActive = viewModel.activeTool == tool
        let isDisabled = isToolDisabled(tool)

        Button {
            guard !isDisabled else { return }
            viewModel.selectTool(tool)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                Text(label)
                    .font(.system(size: 12, weight: .medium))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(pillBackground(isActive: isActive))
            .foregroundStyle(isActive ? .white : theme.textSecondary)
            .clipShape(Capsule())
            .opacity(isDisabled ? 0.4 : 1.0)
            .overlay(alignment: .topTrailing) {
                if badge > 0 {
                    badgeView(count: badge)
                        .offset(x: 6, y: -6)
                }
            }
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.15), value: isActive)
    }

    // MARK: - Pill Background

    @ViewBuilder
    private func pillBackground(isActive: Bool) -> some View {
        if isActive {
            MeeshyColors.brandGradient
        } else {
            theme.backgroundTertiary
        }
    }

    // MARK: - Badge

    private func badgeView(count: Int) -> some View {
        Text("\(count)")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white)
            .frame(minWidth: 14, minHeight: 14)
            .background(MeeshyColors.indigo400)
            .clipShape(Circle())
    }

    // MARK: - Group Badge

    private func groupBadge(_ group: StoryToolGroup) -> Int {
        switch group {
        case .fond:
            return bgMediaCount + (hasDrawing ? 1 : 0)
        case .front:
            return textCount + fgMediaCount + fgAudioCount
        }
    }

    // MARK: - Badge Counts

    private var textCount: Int {
        viewModel.currentEffects.textObjects?.count ?? 0
    }

    private var fgMediaCount: Int {
        viewModel.currentEffects.mediaObjects?
            .filter { $0.placement == "foreground" }
            .count ?? 0
    }

    private var fgAudioCount: Int {
        viewModel.currentEffects.audioPlayerObjects?
            .filter { $0.placement == "foreground" }
            .count ?? 0
    }

    private var bgMediaCount: Int {
        viewModel.currentEffects.mediaObjects?
            .filter { $0.placement == "background" }
            .count ?? 0
    }

    private var hasDrawing: Bool {
        viewModel.drawingData != nil
    }

    // MARK: - Disabled State

    private func isToolDisabled(_ tool: StoryToolMode) -> Bool {
        switch tool {
        case .text: return !viewModel.canAddText
        case .media: return !viewModel.canAddMedia
        case .audio: return !viewModel.canAddAudio
        default: return false
        }
    }
}

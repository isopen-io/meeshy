import SwiftUI
import MeeshySDK

struct ContextualToolbar: View {
    @Bindable var viewModel: StoryComposerViewModel
    @Environment(\.theme) private var theme
    @State private var selectedTab: StoryTab = .contenu

    var body: some View {
        VStack(spacing: 10) {
            segmentedToggle
            toolPills
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .onChange(of: viewModel.activeTool) { _, newTool in
            guard let tool = newTool else { return }
            if selectedTab != tool.tab {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    selectedTab = tool.tab
                }
            }
        }
    }

    // MARK: - Segmented Toggle

    private var segmentedToggle: some View {
        HStack(spacing: 0) {
            segmentButton(.contenu, label: String(localized: "story.toolbar.contenu", defaultValue: "CONTENU", bundle: .module))
            segmentButton(.effets, label: String(localized: "story.toolbar.effets", defaultValue: "EFFETS", bundle: .module))
        }
    }

    private func segmentButton(_ tab: StoryTab, label: String) -> some View {
        let isSelected = selectedTab == tab

        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                selectedTab = tab
                if viewModel.activeTool?.tab != tab {
                    viewModel.activeTool = nil
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(label)
                    .font(.system(size: 14, weight: isSelected ? .bold : .regular, design: .rounded))

                if tabBadge(tab) > 0 {
                    Text("\(tabBadge(tab))")
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
            switch selectedTab {
            case .contenu:
                toolPill(.photo, icon: "photo.fill", label: String(localized: "story.toolbar.photo", defaultValue: "Photo", bundle: .module), badge: mediaCount)
                toolPill(.drawing, icon: "pencil.tip", label: String(localized: "story.toolbar.drawing", defaultValue: "Dessin", bundle: .module), badge: hasDrawing ? 1 : 0)
                toolPill(.text, icon: "textformat", label: String(localized: "story.toolbar.text", defaultValue: "Texte", bundle: .module), badge: textCount)
                toolPill(.audio, icon: "waveform", label: String(localized: "story.toolbar.audio", defaultValue: "Audio", bundle: .module), badge: audioCount)
            case .effets:
                toolPill(.filters, icon: "camera.filters", label: String(localized: "story.toolbar.filters", defaultValue: "Filtres", bundle: .module), badge: viewModel.selectedFilter != nil ? 1 : 0)
                toolPill(.timeline, icon: "timer", label: String(localized: "story.toolbar.timeline", defaultValue: "Timeline", bundle: .module), badge: 0)
            }
        }
        .animation(.spring(response: 0.25, dampingFraction: 0.8), value: selectedTab)
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

    @ViewBuilder
    private func pillBackground(isActive: Bool) -> some View {
        if isActive {
            MeeshyColors.brandGradient
        } else {
            theme.backgroundTertiary
        }
    }

    private func badgeView(count: Int) -> some View {
        Text("\(count)")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white)
            .frame(minWidth: 14, minHeight: 14)
            .background(MeeshyColors.indigo400)
            .clipShape(Circle())
    }

    // MARK: - Badge Counts

    private func tabBadge(_ tab: StoryTab) -> Int {
        switch tab {
        case .contenu: return mediaCount + (hasDrawing ? 1 : 0) + textCount + audioCount
        case .effets: return (viewModel.selectedFilter != nil ? 1 : 0)
        }
    }

    private var textCount: Int { viewModel.currentEffects.textObjects?.count ?? 0 }
    private var mediaCount: Int { viewModel.currentEffects.mediaObjects?.count ?? 0 }
    private var audioCount: Int { viewModel.currentEffects.audioPlayerObjects?.count ?? 0 }
    private var hasDrawing: Bool { viewModel.drawingData != nil }

    private func isToolDisabled(_ tool: StoryToolMode) -> Bool {
        switch tool {
        case .text: return !viewModel.canAddText
        case .photo: return !viewModel.canAddMedia
        case .audio: return !viewModel.canAddAudio
        default: return false
        }
    }
}

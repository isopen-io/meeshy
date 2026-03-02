import SwiftUI
import MeeshySDK

// MARK: - Contextual Toolbar

/// Collapsible group toolbar: FOND / FRONT / PLUS flat labels.
/// Tap a group to expand its tool pills to the right. Only one group open at a time.
/// Collapsing a group deactivates any active tool in that group.
/// Group labels are flat text (no background) when collapsed — distinct from tool pills.
struct ContextualToolbar: View {
    @Bindable var viewModel: StoryComposerViewModel
    @Environment(\.theme) private var theme
    @State private var expandedGroup: StoryToolGroup?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                groupLabel(.fond, label: "FOND")

                if expandedGroup == .fond {
                    HStack(spacing: 6) {
                        toolPill(.bgMedia, icon: "photo.fill", label: "Fond", badge: bgMediaCount)
                        toolPill(.drawing, icon: "pencil.tip", label: "Dessin", badge: hasDrawing ? 1 : 0)
                        toolPill(.bgAudio, icon: "music.note", label: "Ambiance", badge: hasBgAudio ? 1 : 0)
                    }
                    .transition(.asymmetric(
                        insertion: .move(edge: .leading).combined(with: .opacity),
                        removal: .opacity
                    ))
                }

                groupLabel(.front, label: "FRONT")

                if expandedGroup == .front {
                    HStack(spacing: 6) {
                        toolPill(.text, icon: "textformat", label: "Texte", badge: textCount)
                        toolPill(.image, icon: "photo", label: "Image", badge: fgImageCount)
                        toolPill(.video, icon: "video.fill", label: "Video", badge: fgVideoCount)
                        toolPill(.audio, icon: "waveform", label: "Audio", badge: fgAudioCount)
                    }
                    .transition(.asymmetric(
                        insertion: .move(edge: .leading).combined(with: .opacity),
                        removal: .opacity
                    ))
                }

                groupLabel(.plus, label: "PLUS")

                if expandedGroup == .plus {
                    HStack(spacing: 6) {
                        toolPill(.filter, icon: "camera.filters", label: "Filtre", badge: hasFilter ? 1 : 0)
                        toolPill(.effects, icon: "sparkles", label: "Effets", badge: hasEffects ? 1 : 0)
                        toolPill(.timeline, icon: "timeline.selection", label: "Timeline", badge: 0)
                    }
                    .transition(.asymmetric(
                        insertion: .move(edge: .leading).combined(with: .opacity),
                        removal: .opacity
                    ))
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 4)
        }
        .onChange(of: viewModel.activeTool) { _, newTool in
            guard let tool = newTool else { return }
            if expandedGroup != tool.group {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    expandedGroup = tool.group
                }
            }
        }
    }

    // MARK: - Group Label (flat style)

    @ViewBuilder
    private func groupLabel(_ group: StoryToolGroup, label: String) -> some View {
        let isExpanded = expandedGroup == group
        let hasContent = groupTotalBadge(group) > 0

        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                if expandedGroup == group {
                    expandedGroup = nil
                    if viewModel.activeTool?.group == group {
                        viewModel.activeTool = nil
                    }
                } else {
                    expandedGroup = group
                }
            }
        } label: {
            HStack(spacing: 3) {
                Text(label)
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                if isExpanded {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 7, weight: .bold))
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .foregroundStyle(isExpanded ? MeeshyColors.brandPrimary : theme.textMuted)
            .padding(.horizontal, isExpanded ? 0 : 2)
            .overlay(alignment: .topTrailing) {
                if !isExpanded, hasContent {
                    Circle()
                        .fill(MeeshyColors.indigo400)
                        .frame(width: 6, height: 6)
                        .offset(x: 6, y: -4)
                }
            }
        }
        .buttonStyle(.plain)
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

    // MARK: - Group Total Badge

    private func groupTotalBadge(_ group: StoryToolGroup) -> Int {
        switch group {
        case .fond:
            return bgMediaCount + (hasDrawing ? 1 : 0) + (hasBgAudio ? 1 : 0)
        case .front:
            return textCount + fgImageCount + fgVideoCount + fgAudioCount
        case .plus:
            return (hasFilter ? 1 : 0) + (hasEffects ? 1 : 0)
        }
    }

    // MARK: - Badge Counts

    private var textCount: Int {
        viewModel.currentEffects.textObjects?.count ?? 0
    }

    private var fgImageCount: Int {
        viewModel.currentEffects.mediaObjects?
            .filter { $0.mediaType == "image" && $0.placement == "foreground" }
            .count ?? 0
    }

    private var fgVideoCount: Int {
        viewModel.currentEffects.mediaObjects?
            .filter { $0.mediaType == "video" && $0.placement == "foreground" }
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

    private var hasBgAudio: Bool {
        viewModel.currentEffects.backgroundAudioId != nil ||
        viewModel.currentEffects.audioPlayerObjects?.contains(where: { $0.placement == "background" }) == true
    }

    private var hasFilter: Bool {
        viewModel.currentEffects.filter != nil
    }

    private var hasEffects: Bool {
        viewModel.currentEffects.opening != nil || viewModel.currentEffects.closing != nil
    }

    // MARK: - Disabled State

    private func isToolDisabled(_ tool: StoryToolMode) -> Bool {
        switch tool {
        case .text: return !viewModel.canAddText
        case .image: return !viewModel.canAddImage
        case .video: return !viewModel.canAddVideo
        case .audio: return !viewModel.canAddAudio
        default: return false
        }
    }
}

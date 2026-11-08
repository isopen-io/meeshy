import MeeshySDK
import SwiftUI

struct ImageEditorFiltersPanel: View {
    @ObservedObject var viewModel: ImageEditorViewModel
    let accent: Color

    @ResolvedThemePalette private var theme

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.md) {
                ForEach(visibleFilters) { filter in
                    filterCell(filter)
                }
            }
            .padding(.horizontal, MeeshySpacing.xxs)
            .padding(.bottom, MeeshySpacing.xs)
        }
    }

    private var visibleFilters: [ImageFilter] {
        viewModel.mode.isPro ? ImageFilter.allCases : ImageFilter.allCases.filter(\.isEssential)
    }

    private func filterCell(_ filter: ImageFilter) -> some View {
        let isSelected = viewModel.state.filter == filter
        return Button {
            HapticFeedback.light()
            viewModel.perform(filter.displayName) { $0.filter = filter }
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                Group {
                    if let thumb = viewModel.filterThumbnails[filter] {
                        Image(uiImage: thumb)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } else {
                        Rectangle()
                            .fill(theme.inputBackground)
                            .overlay(ProgressView().controlSize(.small))
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                        .strokeBorder(isSelected ? accent : .clear, lineWidth: MeeshyBorder.strong)
                )

                Text(filter.displayName)
                    .font(.system(size: MeeshyFont.captionSize, weight: isSelected ? .bold : .medium))
                    .foregroundColor(isSelected ? accent : theme.textSecondary)
            }
        }
        .buttonStyle(.plain)
    }
}

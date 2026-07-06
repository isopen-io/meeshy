import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + SlideStrip

extension StoryComposerView {
    // MARK: - Slide Strip

    var slideStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(viewModel.slides.enumerated()), id: \.element.id) { index, slide in
                    slideThumb(slide: slide, index: index)
                }
            }
            .padding(.horizontal, 8)
        }
    }

    func slideThumb(slide: StorySlide, index: Int) -> some View {
        let isSelected = viewModel.currentSlideIndex == index
        let thumbH: CGFloat = 42
        let thumbW: CGFloat = thumbH * 9 / 16
        let isCurrent = viewModel.currentSlideIndex == index
        let drawData = isCurrent ? viewModel.drawingData : slide.effects.drawingData

        return Button {
            syncCurrentSlideEffects()
            withAnimation(.spring(response: 0.25)) { viewModel.selectSlide(at: index) }
            restoreCanvas(from: viewModel.slides[index])
            HapticFeedback.light()
        } label: {
            SlideMiniPreview(
                effects: slide.effects,
                bgImage: viewModel.slideImages[slide.id],
                drawingData: drawData,
                loadedImages: viewModel.loadedImages,
                index: index
            )
            .frame(width: thumbW, height: thumbH)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .strokeBorder(
                        isSelected ? MeeshyColors.brandPrimary : Color.white.opacity(0.2),
                        lineWidth: isSelected ? 1.5 : 0.5
                    )
            )
        }
        .contextMenu {
            if viewModel.slides.count > 1 {
                Button(role: .destructive) {
                    syncCurrentSlideEffects()
                    viewModel.removeSlide(at: index)
                    restoreCanvas(from: viewModel.currentSlide)
                } label: {
                    Label(String(localized: "story.composer.deleteSlide", defaultValue: "Supprimer", bundle: .module), systemImage: "trash")
                }
            }
            Button {
                syncCurrentSlideEffects()
                viewModel.duplicateSlide(at: index)
                restoreCanvas(from: viewModel.currentSlide)
            } label: {
                Label(String(localized: "story.composer.duplicateSlide", defaultValue: "Dupliquer", bundle: .module), systemImage: "doc.on.doc")
            }
        }
        // Réordonner les slides par glisser-déposer (long-press natif), MÊME mécanisme
        // que la liste des médias (`.draggable` + `.dropDestination`) — convention
        // `.onMove` (offset post-cible). Câble enfin `moveSlide` (it.37).
        .draggable(slide.id) {
            SlideMiniPreview(effects: slide.effects, bgImage: viewModel.slideImages[slide.id],
                             drawingData: drawData, loadedImages: viewModel.loadedImages, index: index)
                .frame(width: thumbW, height: thumbH)
                .clipShape(RoundedRectangle(cornerRadius: 3))
        }
        .dropDestination(for: String.self) { items, _ in
            guard let sourceId = items.first,
                  let sourceIdx = viewModel.slides.firstIndex(where: { $0.id == sourceId }),
                  let targetIdx = viewModel.slides.firstIndex(where: { $0.id == slide.id }),
                  sourceIdx != targetIdx else { return false }
            // Offset `.onMove` : après la cible si on descend, avant si on monte.
            let destination = sourceIdx < targetIdx ? targetIdx + 1 : targetIdx
            syncCurrentSlideEffects()
            viewModel.moveSlide(from: sourceIdx, to: destination)
            restoreCanvas(from: viewModel.currentSlide)
            HapticFeedback.light()
            return true
        }
    }
}

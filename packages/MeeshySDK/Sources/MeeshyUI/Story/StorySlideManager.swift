import SwiftUI
import MeeshySDK

// MARK: - Story Slide Manager

@MainActor
public class StorySlideManager: ObservableObject {
    @Published public var slides: [StorySlide] = [StorySlide()]
    @Published public var currentSlideIndex: Int = 0
    @Published public var slideImages: [String: UIImage] = [:]

    public static let maxSlides = 10

    public init() {}

    public var currentSlide: StorySlide {
        get {
            guard currentSlideIndex < slides.count else { return StorySlide() }
            return slides[currentSlideIndex]
        }
        set {
            guard currentSlideIndex < slides.count else { return }
            slides[currentSlideIndex] = newValue
        }
    }

    public var canAddSlide: Bool {
        slides.count < Self.maxSlides
    }

    public var slideCount: Int { slides.count }

    public func addSlide() {
        guard canAddSlide else { return }
        let newSlide = StorySlide(order: slides.count)
        slides.append(newSlide)
        currentSlideIndex = slides.count - 1
    }

    public func removeSlide(at index: Int) {
        guard slides.count > 1, index < slides.count else { return }
        let slideId = slides[index].id
        slides.remove(at: index)
        slideImages.removeValue(forKey: slideId)
        reorderSlides()
        if currentSlideIndex >= slides.count {
            currentSlideIndex = slides.count - 1
        }
    }

    public func duplicateSlide(at index: Int) {
        guard canAddSlide, index < slides.count else { return }
        var copy = slides[index]
        copy.id = UUID().uuidString
        copy.order = slides.count
        slides.insert(copy, at: index + 1)
        reorderSlides()
        currentSlideIndex = index + 1
    }

    public func moveSlide(from source: Int, to destination: Int) {
        guard source < slides.count, destination < slides.count, source != destination else { return }
        let slide = slides.remove(at: source)
        slides.insert(slide, at: destination)
        reorderSlides()
        currentSlideIndex = destination
    }

    public func selectSlide(at index: Int) {
        guard index >= 0, index < slides.count else { return }
        currentSlideIndex = index
    }

    public func setImage(_ image: UIImage?, for slideId: String) {
        if let image {
            slideImages[slideId] = image
        } else {
            slideImages.removeValue(forKey: slideId)
        }
    }

    public func imageForCurrentSlide() -> UIImage? {
        slideImages[currentSlide.id]
    }

    private func reorderSlides() {
        for i in slides.indices {
            slides[i].order = i
        }
    }
}

// MARK: - Slide Carousel View

public struct StorySlideCarousel: View {
    @ObservedObject public var manager: StorySlideManager
    public var onAddSlide: () -> Void

    public init(manager: StorySlideManager, onAddSlide: @escaping () -> Void) {
        self.manager = manager; self.onAddSlide = onAddSlide
    }

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(manager.slides.enumerated()), id: \.element.id) { index, slide in
                    slideThumb(slide: slide, index: index)
                }

                if manager.canAddSlide {
                    addSlideButton
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .frame(height: 72)
        .background(Color.black.opacity(0.3))
    }

    private func slideThumb(slide: StorySlide, index: Int) -> some View {
        let isSelected = manager.currentSlideIndex == index
        return Button {
            withAnimation(.spring(response: 0.25)) { manager.selectSlide(at: index) }
            HapticFeedback.light()
        } label: {
            ZStack {
                if let image = manager.slideImages[slide.id] {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else if let bg = slide.effects.background {
                    Color(hex: bg)
                } else {
                    Color(hex: "222230")
                }

                Text("\(index + 1)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .shadow(radius: 2)
            }
            .frame(width: 44, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? Color(hex: "FF2E63") : Color.white.opacity(0.2), lineWidth: isSelected ? 2 : 1)
            )
            .scaleEffect(isSelected ? 1.1 : 1.0)
        }
        .contextMenu {
            if manager.slides.count > 1 {
                Button(role: .destructive) {
                    manager.removeSlide(at: index)
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
            Button {
                manager.duplicateSlide(at: index)
            } label: {
                Label("Duplicate", systemImage: "doc.on.doc")
            }
        }
    }

    private var addSlideButton: some View {
        Button {
            onAddSlide()
            HapticFeedback.medium()
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.white.opacity(0.08))
                    .frame(width: 44, height: 56)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.white.opacity(0.2), style: StrokeStyle(lineWidth: 1, dash: [4]))
                    )

                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
        .accessibilityLabel("Add slide")
    }
}

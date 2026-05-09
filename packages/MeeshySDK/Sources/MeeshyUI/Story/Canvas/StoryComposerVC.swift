import UIKit
import CoreMedia
import MeeshySDK

/// `UIViewController` shell hosting a `StoryCanvasUIView` for slide composition.
///
/// Provides the standard 9:16 letterbox layout (centered, fits to 95% width and
/// 85% height) plus a top `UISegmentedControl` to flip between Edit and Play
/// while staying on the same canvas — the hybrid composer toggle
/// (decision D-3 in the spec).
public final class StoryComposerVC: UIViewController {

    public private(set) var slide: StorySlide
    public var onSlideChanged: ((StorySlide) -> Void)?

    private var canvasView: StoryCanvasUIView!
    private var modeSegment: UISegmentedControl!

    public init(slide: StorySlide) {
        self.slide = slide
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    public required init?(coder: NSCoder) {
        fatalError("StoryComposerVC does not support NSCoder")
    }

    public func updateSlide(_ newSlide: StorySlide) {
        slide = newSlide
        canvasView?.slide = newSlide
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureCanvas()
        configureModeSegment()
        installLayout()
    }

    private func configureCanvas() {
        canvasView = StoryCanvasUIView(slide: slide, mode: .edit)
        canvasView.translatesAutoresizingMaskIntoConstraints = false
        canvasView.onItemModified = { [weak self] modifiedSlide in
            self?.slide = modifiedSlide
            self?.onSlideChanged?(modifiedSlide)
        }
        view.addSubview(canvasView)
    }

    private func configureModeSegment() {
        modeSegment = UISegmentedControl(items: ["Edit", "Play"])
        modeSegment.selectedSegmentIndex = 0
        modeSegment.addTarget(self, action: #selector(modeChanged), for: .valueChanged)
        modeSegment.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(modeSegment)
    }

    private func installLayout() {
        NSLayoutConstraint.activate([
            modeSegment.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            modeSegment.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            canvasView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            canvasView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            canvasView.widthAnchor.constraint(equalTo: canvasView.heightAnchor, multiplier: 9.0/16.0),
            canvasView.heightAnchor.constraint(lessThanOrEqualTo: view.heightAnchor, multiplier: 0.85),
            canvasView.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, multiplier: 0.95),
        ])
    }

    @objc private func modeChanged() {
        let mode: RenderMode = modeSegment.selectedSegmentIndex == 0 ? .edit : .play
        canvasView.setMode(mode, time: .zero)
    }
}

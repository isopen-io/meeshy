import UIKit
import CoreMedia
import MeeshySDK

/// Read-only `UIViewController` that plays back a `StorySlide` end-to-end.
///
/// Mirrors `StoryComposerVC` but locks the canvas in `.play` mode and
/// stretches it edge-to-edge (no letterbox crop, the storage aspect already
/// is 9:16 — see `CanvasGeometry.designSize`).
public final class StoryViewerVC: UIViewController {

    public private(set) var slide: StorySlide
    public var onCompletion: (() -> Void)?

    private var canvasView: StoryCanvasUIView!

    public init(slide: StorySlide) {
        self.slide = slide
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    public required init?(coder: NSCoder) {
        fatalError("StoryViewerVC does not support NSCoder")
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        canvasView = StoryCanvasUIView(slide: slide, mode: .play)
        canvasView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(canvasView)
        NSLayoutConstraint.activate([
            canvasView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            canvasView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            canvasView.widthAnchor.constraint(equalTo: canvasView.heightAnchor, multiplier: 9.0/16.0),
            canvasView.heightAnchor.constraint(lessThanOrEqualTo: view.heightAnchor),
            canvasView.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor),
        ])
    }

    public override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        canvasView.setMode(.play, time: .zero)
    }

    public override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        canvasView.setMode(.edit, time: .zero)  // freezes the playback link
    }
}

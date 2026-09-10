import UIKit

final class ThreadChromeFadeContainer: UIView {

    init(hosting content: UIView) {
        super.init(frame: content.frame)
        addSubview(content)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    var topBandFrame: CGRect? { nil }
    var bottomBandFrame: CGRect? { nil }

    func apply(_ fade: ThreadChromeFade, transition: ListInsetTransition?) {}
}

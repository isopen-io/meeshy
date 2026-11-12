import UIKit

/// **Une vue d'entrée du champ** (K17) : la barre (accessoire) ou le panneau (qui remplace le clavier). Elle
/// héberge la vue SwiftUI d'un contrôleur et laisse passer tout toucher qui tombe sur une zone transparente :
/// glisser, pincer ou tourner le texte sous la barre continue d'atteindre l'hôte (loi 9).
final class MeeshyKeyboardDockInputView: UIInputView {

    nonisolated deinit {}

    private weak var hosted: UIView?
    private var heightConstraint: NSLayoutConstraint?

    init(frame: CGRect, style: UIInputView.Style) {
        super.init(frame: frame, inputViewStyle: style)
        allowsSelfSizing = true
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) {
        nil
    }

    /// La vue hébergée couvre toute la vue d'entrée.
    func embed(_ view: UIView) {
        view.backgroundColor = .clear
        view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(view)
        NSLayoutConstraint.activate([
            view.leadingAnchor.constraint(equalTo: leadingAnchor),
            view.trailingAnchor.constraint(equalTo: trailingAnchor),
            view.topAnchor.constraint(equalTo: topAnchor),
            view.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        hosted = view
    }

    /// Le panneau prend la hauteur du clavier retenu, par son cadre ET par sa contrainte : le système lit l'un
    /// ou l'autre selon qu'il pose la vue. La contrainte reste à peine sous le niveau requis pour que la
    /// hauteur du contenu, qui défile, ne la contredise jamais.
    func setHeight(_ height: CGFloat) {
        if let heightConstraint {
            heightConstraint.constant = height
        } else {
            let constraint = heightAnchor.constraint(equalToConstant: height)
            constraint.priority = .required - 1
            constraint.isActive = true
            heightConstraint = constraint
        }
        frame.size.height = height
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let result = super.hitTest(point, with: event)
        guard let result, result !== self, result !== hosted else { return nil }
        return result
    }
}

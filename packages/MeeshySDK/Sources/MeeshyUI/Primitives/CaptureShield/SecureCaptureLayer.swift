import UIKit
import OSLog

// MARK: - La toile sécurisée

/// Une toile dont le contenu est exclu des captures d'écran, des
/// enregistrements et de la recopie d'écran (#9574) : `canvas` reçoit le
/// contenu, `container` se pose dans la hiérarchie.
public struct SecureCaptureCanvas {
    public let container: UIView
    public let canvas: UIView

    public init(container: UIView, canvas: UIView) {
        self.container = container
        self.canvas = canvas
    }
}

/// Fournit la toile sécurisée. `isAvailable` répond SANS monter de contenu :
/// c'est sur lui que `CaptureShield` choisit entre la toile et le placeholder.
public protocol SecureCaptureLayerProviding {
    var isAvailable: Bool { get }
    func makeCanvas() -> SecureCaptureCanvas?
}

/// **La couche sécurisée du système, empruntée au champ de saisie de mot de
/// passe.** iOS n'expose aucune API publique « exclure cette vue des
/// captures » ; il exclut en revanche, depuis toujours, la toile d'un
/// `UITextField` dont `isSecureTextEntry` est vrai. Tout ce qui est posé dans
/// cette toile est rendu noir par la capture, l'enregistrement et la recopie
/// d'écran — et reste affiché normalement à l'écran.
///
/// Aucun sélecteur privé n'est appelé. La seule dépendance à la hiérarchie
/// interne est l'IDENTIFICATION de la toile : la sous-vue du champ dont le
/// type porte `CanvasView` (`_UITextFieldCanvasView` jusqu'à iOS 16,
/// `_UITextLayoutCanvasView` depuis iOS 17). Elle est résolue de façon
/// défensive : sans toile reconnue, `makeCanvas()` rend `nil`, et le bouclier
/// rend le placeholder — jamais le contenu en clair. Le témoin
/// `test_systemLayer_resolvesASecureCanvasOnThisRuntime` rougit le jour où un
/// runtime la déplace.
public struct SystemSecureCaptureLayer: SecureCaptureLayerProviding {

    public init() {}

    /// Sondé UNE fois par processus : la hiérarchie d'un champ de saisie ne
    /// change pas pendant la vie de l'application.
    private static let probe: Bool = SystemSecureCaptureLayer().makeCanvas() != nil

    public var isAvailable: Bool { Self.probe }

    public func makeCanvas() -> SecureCaptureCanvas? {
        let field = SecureCaptureTextField(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        field.isSecureTextEntry = true
        field.layoutIfNeeded()
        let candidates = field.subviews + [field.layer.sublayers?.first?.delegate as? UIView].compactMap { $0 }
        guard let canvas = Self.secureCanvas(in: field, candidates: candidates) else { return nil }
        field.adopt(canvas)
        return SecureCaptureCanvas(container: field, canvas: canvas)
    }

    /// La toile d'un champ sécurisé parmi ses candidats — `nil` si aucune
    /// n'est reconnue. Une vue quelconque n'est JAMAIS prise pour la toile :
    /// rien ne prouverait qu'elle soit exclue des captures.
    static func secureCanvas(in field: UITextField, candidates: [UIView]) -> UIView? {
        guard field.isSecureTextEntry else { return nil }
        return candidates.first { candidate in
            candidate.superview === field && String(describing: type(of: candidate)).contains("CanvasView")
        }
    }
}

// MARK: - Le champ porteur

/// Le champ qui PORTE la toile, et rien d'autre : il ne devient jamais
/// répondeur, n'ouvre aucun clavier, ne capte aucun geste, ne se présente pas
/// à VoiceOver, et étend sa toile à toute sa surface.
final class SecureCaptureTextField: UITextField {
    nonisolated deinit {}

    private weak var secureCanvas: UIView?

    override var canBecomeFirstResponder: Bool { false }

    override func textRect(forBounds bounds: CGRect) -> CGRect { bounds }
    override func editingRect(forBounds bounds: CGRect) -> CGRect { bounds }
    override func placeholderRect(forBounds bounds: CGRect) -> CGRect { .zero }

    override func addGestureRecognizer(_ gestureRecognizer: UIGestureRecognizer) {
        gestureRecognizer.isEnabled = false
        super.addGestureRecognizer(gestureRecognizer)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        secureCanvas?.frame = bounds
    }

    func adopt(_ canvas: UIView) {
        secureCanvas = canvas
        borderStyle = .none
        backgroundColor = .clear
        tintColor = .clear
        autocorrectionType = .no
        spellCheckingType = .no
        clipsToBounds = false
        isAccessibilityElement = false
        gestureRecognizers?.forEach { $0.isEnabled = false }
        canvas.clipsToBounds = false
        canvas.isUserInteractionEnabled = true
        canvas.frame = bounds
    }
}

// MARK: - Ce qui est à l'écran

/// Le nombre de contenus protégés ACTUELLEMENT dans une fenêtre. L'hôte s'en
/// sert pour voiler l'instantané du sélecteur d'applications ; le SDK ne
/// décide rien de plus.
public enum SecureCaptureRegistry {
    public private(set) static var visibleCount = 0

    public static var holdsProtectedContent: Bool { visibleCount > 0 }

    static func enter() { visibleCount += 1 }
    static func leave() { visibleCount = max(0, visibleCount - 1) }
}

// MARK: - Le signalement

/// Un contenu protégé n'a pas pu être placé dans la couche sécurisée : il a
/// été remplacé par son placeholder, et cela se SIGNALE. L'hôte branche
/// `reporter` sur son outil de diagnostic ; le journal système le reçoit dans
/// tous les cas. Un signalement par processus suffit : la cause (un runtime
/// qui a déplacé la toile) est la même pour tous les contenus.
public enum CaptureShieldDiagnostics {
    public static var reporter: (@MainActor (String) -> Void)?

    private static var hasReported = false
    private static let logger = Logger(subsystem: "me.meeshy.sdk", category: "capture-shield")

    static let unavailableMessage = "capture-shield: la couche sécurisée du système est introuvable — contenu protégé remplacé par son placeholder"

    static func reportUnavailable() {
        logger.fault("\(unavailableMessage, privacy: .public)")
        guard !hasReported else { return }
        hasReported = true
        reporter?(unavailableMessage)
    }

    static func resetForTesting() {
        hasReported = false
    }
}

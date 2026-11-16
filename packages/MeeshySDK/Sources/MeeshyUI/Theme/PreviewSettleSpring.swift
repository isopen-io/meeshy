import Foundation

/// Le ressort de FIN des aperçus d'appui long (#18722, #18723) : l'aperçu
/// d'une conversation ou d'un message se pose avec un léger rebond — il
/// dépasse sa place d'un rien, puis s'y pose. Un ressort amorti à 0,86 (la
/// valeur précédente) dépassait de moins de 0,6 % : invisible. Sous « Réduire
/// les animations », les hôtes remplacent ce ressort par un fondu.
public nonisolated enum PreviewSettleSpring {

    /// La réponse du ressort qui fait naître l'aperçu d'une conversation de sa ligne.
    public static let response: Double = 0.5

    /// La réponse du ressort qui pose l'aperçu d'un message.
    public static let messageResponse: Double = 0.42

    /// Sous-amorti : environ 4 % de dépassement, un rebond qu'on voit sans qu'il tremble.
    public static let dampingFraction: Double = 0.72

    /// Le « pop » de la bulle d'un message, plus vif : son échelle varie peu,
    /// il faut un ressort plus souple pour que le rebond se voie.
    public static let popDampingFraction: Double = 0.58

    /// L'échelle d'où la bulle d'un message part pour se poser.
    public static let messageStartScale: CGFloat = 0.9

    /// La progression qu'une loi de cadre laisse passer : le dépassement du
    /// ressort au-delà de 1 se voit, une course folle jamais.
    public static let maximumProgress: CGFloat = 1.1

    /// Le dépassement d'un ressort amorti, en fraction de sa course :
    /// `exp(−ζπ / √(1 − ζ²))`, nul dès l'amortissement critique.
    public static func overshoot(dampingFraction: Double) -> Double {
        guard dampingFraction < 1 else { return 0 }
        return exp(-dampingFraction * .pi / (1 - dampingFraction * dampingFraction).squareRoot())
    }

    /// Une progression bornée pour un cadre : jamais sous la source (0),
    /// jamais au-delà de `maximumProgress`.
    public static func bounded(_ progress: CGFloat) -> CGFloat {
        min(maximumProgress, max(0, progress))
    }
}

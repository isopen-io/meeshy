import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La story qui n'est qu'une image se présente comme l'image** (#6636,
/// directive porteur 2026-09-15).
///
/// > « Si rien ne sort des cadres de l'image, il ne faut pas afficher le
/// > canvas : considère le fond du plein écran ! »
///
/// La loi vit au SDK (`StoryImageOnlyPresentation`) et le rendu la mesure
/// (`StorySceneFootprint`). Ce fichier tient ce que le LECTEUR en fait :
///
/// - la carte ne rogne plus le canvas entier mais le seul rectangle de l'image,
///   avec l'arrondi de la carte — ni bandes ni carte 9:16, et le fond plein
///   écran du lecteur, déjà là, habille le reste ;
/// - le canvas garde sa taille (`canvasFitSize`) : les objets posés dans l'image
///   restent à leur place, et la projection design → rendu est intacte ;
/// - le remplissage des bandes n'est plus PEINT (`servesLetterboxFill`) —
///   rogner un calque qu'on continue de peindre paierait un flou que personne
///   ne voit.
///
/// La légende, la barre de réaction, la barre latérale et les gestes ne lisent
/// rien d'ici : ils se placent par rapport au PLATEAU, comme avant (#6141).
///
/// Sorti de `StoryViewerView+Canvas.swift`, hors budget : on n'y ajoute pas, on
/// extrait d'abord.
extension StoryCardView {

    /// Le rectangle de l'image quand la story n'est qu'une image, dans le repère
    /// du canvas ; `nil` quand la carte reste.
    func imageOnlyRect(of story: StoryItem) -> CGRect? {
        guard case .imageOnly(let rect) = imageOnlyVerdictCache.verdict(
            for: story, chain: resolvedViewerLanguageChain, canvasSize: canvasFitSize)
        else { return nil }
        return rect
    }
}

/// **Un verdict se calcule une fois par story, pas une fois par image.**
///
/// Le `body` du lecteur se réévalue à chaque tick de la barre de progression, et
/// mesurer un texte configure un calque. Pendant un fondu, deux stories sont
/// évaluées à chaque passe — la sortante et la courante —, d'où quelques
/// entrées plutôt qu'une : un cache à une entrée recalculerait les deux à chaque
/// image pendant 350 ms.
///
/// La clé porte ce qui change le verdict : l'identité, la chaîne du Prisme (un
/// texte traduit n'a pas la longueur de l'original), les traductions arrivées en
/// temps réel, et la taille du canvas.
@MainActor
final class StoryImageOnlyVerdictCache {
    // iOS 26.1 : deinit synthétisée isolée → double-free au démontage hors tâche.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let capacity = 4

    private var entries: [(key: String, verdict: StoryImageOnlyPresentation.Verdict)] = []
    private(set) var computations = 0

    func verdict(for story: StoryItem,
                 chain: [String],
                 canvasSize: CGSize) -> StoryImageOnlyPresentation.Verdict {
        let key = Self.key(for: story, chain: chain, canvasSize: canvasSize)
        if let hit = entries.first(where: { $0.key == key }) { return hit.verdict }
        let slide = story.toRenderableSlide(preferredLanguages: chain)
        let verdict = StorySceneFootprint.verdict(for: slide, canvasSize: canvasSize, languages: chain)
        computations += 1
        entries = Array(([(key: key, verdict: verdict)] + entries).prefix(Self.capacity))
        return verdict
    }

    static func key(for story: StoryItem, chain: [String], canvasSize: CGSize) -> String {
        let translationCounts = (story.storyEffects?.textObjects ?? [])
            .map { String($0.translations?.count ?? 0) }
            .joined(separator: ".")
        return "\(story.id)|\(chain.joined(separator: ","))|\(translationCounts)"
            + "|\(canvasSize.width)x\(canvasSize.height)"
    }
}

/// **La forme de la carte** : le canvas entier, ou le seul rectangle de l'image.
struct StoryReaderCardShape: Shape {
    let imageRect: CGRect?
    let cornerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        Path(roundedRect: imageRect ?? rect, cornerRadius: cornerRadius, style: .continuous)
    }

    /// Le clip vit dans l'espace NON mis à l'échelle : le rayon se compense pour
    /// rendre, après `scaleEffect`, le rayon de la carte.
    static func unscaledCornerRadius(for framing: StoryCanvasFraming.Result) -> CGFloat {
        framing.scale > 0 ? framing.cornerRadius / framing.scale : framing.cornerRadius
    }
}

extension View {

    /// **Le cadrage « carte → plein écran » d'une couche du canvas.**
    ///
    /// `clipShape` AVANT `scaleEffect`/`offset` : appliqué après, le clip restait
    /// sur les bornes NON déplacées — le contenu décalé vers le bas gardait un
    /// bord haut carré et se faisait rogner en bas par les coins du rectangle
    /// d'origine (bug user 2026-07-11 « haut carré, bas à moitié arrondi »).
    ///
    /// Les trois couches qui suivent la carte — le canvas sortant, le canvas
    /// courant, le chargeur — le partagent : un clip qui diverge entre elles
    /// ferait sauter la forme au moment où le chargement se retire.
    func readerCard(framing: StoryCanvasFraming.Result, imageRect: CGRect?) -> some View {
        clipShape(StoryReaderCardShape(imageRect: imageRect,
                                       cornerRadius: StoryReaderCardShape.unscaledCornerRadius(for: framing)))
            .scaleEffect(framing.scale)
            .offset(y: framing.offset.height)
    }
}

import Foundation
import CoreGraphics
import MeeshySDK

/// **Le crédit d'une republication — quand il est DÛ, et à quoi il ressemble**
/// (directive porteur 2026-09-01).
///
/// > « Lorsqu'on republie une story, on doit afficher le chip de crédit
/// > uniquement si la story originale était publique. […] Par contre on n'a
/// > plus besoin de ce chip en bas si la story n'était pas publique ou
/// > communautaire — lors de l'affichage on a quand même déjà un indicateur de
/// > republication ! »
///
/// ## Pourquoi la visibilité décide
///
/// Un crédit posé sur le canvas est une SIGNATURE : il nomme un auteur devant
/// tous ceux qui verront la republication. Cela n'a de sens que si l'original
/// était lui-même adressé à tous. Sur une story privée, d'amis ou de
/// communauté, la pastille nomme quelqu'un auprès d'un public que son original
/// n'avait pas — et elle le fait sur une matière que le lecteur voit déjà
/// étiquetée « republication » par l'en-tête du lecteur.
///
/// > Deux fois la même information n'est pas deux fois plus claire : la seconde
/// > occupe le canvas et fait douter de la première.
///
/// ## Fail-closed, par construction
///
/// `StoryItem.isPublic` rend `false` quand `visibility` est absente. Une story
/// dont on ne SAIT PAS l'audience n'obtient donc pas de crédit — l'ignorance ne
/// se lit jamais comme une permission de nommer.
public nonisolated enum StoryRepostCredit {

    /// Position par défaut : bas de scène, centrée. **Un défaut, pas une
    /// place** — la pastille se déplace au doigt (le verrou d'édition
    /// n'interdit que ce qui la retire ou la dénature ; voir
    /// `StorySceneObjectPredicates.isLocked`).
    public static let defaultX = 0.5
    public static let defaultY = 0.9

    /// La taille du crédit, en pixels de DESIGN (référentiel 1080).
    ///
    /// Elle valait 14 — soit un septième d'un texte d'auteur (96) et un
    /// cinquième du plus petit autre site (64). Sur un canvas de 402 pt, cela
    /// faisait environ 5 pt : une signature que personne ne peut lire, donc une
    /// attribution qui n'attribue rien. 44 la rend lisible sans qu'elle
    /// dispute la vedette au contenu.
    public static let fontSize: Double = 44

    /// **La DÉCISION, seule et pure** : le crédit est-il dû ?
    ///
    /// Séparée de sa fabrication parce que c'est elle qui porte la règle, et
    /// qu'un témoin ne doit pas avoir à monter un catalogue de traductions pour
    /// l'interroger. `StoryItem.isPublic` rend `false` quand `visibility` est
    /// absente : l'ignorance de l'audience ne se lit jamais comme une
    /// permission de nommer.
    public static func isDue(for story: StoryItem) -> Bool {
        story.isPublic
    }

    /// Le crédit dû à `story`, ou `nil` s'il ne l'est pas.
    ///
    /// `nil` ne signifie pas « rien à faire » : l'appelant doit AUSSI retirer
    /// les crédits hérités de la source (voir `stripped(from:)`), faute de quoi
    /// republier une republication publique vers une audience restreinte
    /// garderait la signature qu'on vient de juger indue.
    /// `@MainActor` pour la SEULE raison que `Bundle.module` l'est dans cette
    /// cible (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`), et que le libellé
    /// se lit du catalogue. La DÉCISION — le crédit est-il dû ? — reste pure et
    /// s'éprouve par `isDue(for:)`, qui ne touche aucun catalogue.
    @MainActor
    public static func badge(for story: StoryItem,
                             authorHandle: String,
                             id: String = UUID().uuidString) -> StoryTextObject? {
        guard isDue(for: story) else { return nil }
        let handle = authorHandle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !handle.isEmpty else { return nil }
        return StoryTextObject(
            id: id,
            text: label(handle: handle),
            x: defaultX, y: defaultY,
            scale: 1.0, rotation: 0,
            fontSize: fontSize,
            textStyle: "bold",
            textColor: "FFFFFF",
            textAlign: "center",
            // `textBg` reste NUL : l'aplat indigo opaque qu'il portait est
            // exactement ce que la directive appelle « à revoir ». Le fond vit
            // désormais dans `backgroundStyle`, la forme que le dépôt préfère
            // pour tout contenu neuf.
            textBg: nil,
            // **Le verre plutôt que l'aplat.** `.glass` floute la région du
            // canvas sous la pastille au rendu (`StoryBlurFilter`) : elle prend
            // la couleur de ce qu'elle recouvre au lieu de la masquer, ce qui
            // la fait tenir sur une photo claire comme sur une sombre sans
            // qu'aucune teinte n'ait à être choisie. Rayon 24 — celui des
            // préréglages de texte du dépôt, donc la même matière que ce que
            // l'auteur peut poser lui-même.
            backgroundStyle: .glass(radius: 24),
            fontWeight: "semibold",
            // Capsule : la forme d'un chip. `rounded`, l'ancien défaut, donnait
            // une étiquette rectangulaire à coins mous — la forme d'une boîte
            // de texte, pas d'un crédit.
            frameShape: "pill",
            // Un peu d'air autour des glyphes : une capsule serrée sur son
            // texte se lit comme un bouton pressé.
            framePaddingScale: 1.35,
            isLocked: true
        )
    }

    /// Le libellé, localisé. Il était écrit en français DANS LE CODE — un
    /// commentaire l'assumait en promettant une clé de catalogue « quand elle
    /// existera ». Elle existe.
    @MainActor
    public static func label(handle: String) -> String {
        String(format: String(localized: "story.repost.credit",
                              defaultValue: "Reposté de @%@",
                              bundle: .module),
               handle)
    }

    /// Les textes de `effects` DÉBARRASSÉS de tout crédit hérité.
    ///
    /// Republier une republication empilerait sinon deux pastilles au même
    /// point. Les textes verrouillés sont EXCLUSIVEMENT des crédits — `badge`
    /// en est l'unique producteur —, donc ce filtre ne touche jamais le texte
    /// éditable de l'auteur.
    public static func stripped(from texts: [StoryTextObject]) -> [StoryTextObject] {
        texts.filter { $0.isLocked != true }
    }
}

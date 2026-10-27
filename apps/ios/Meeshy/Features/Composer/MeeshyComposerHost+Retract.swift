import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le RETRAIT d'un média, en UN lieu** (#6577) — le meuble, parce qu'il est le
// seul à voir les DEUX porteurs. Le SDK n'a aucun accès au `@State` app-side :
// `deleteElement` et `removeSlide` ne peuvent, par construction, nettoyer que la
// moitié qui se VOIT. C'est ce qui a laissé le média supprimé partir à la
// publication pendant tout un lot — et le gateway le grave à `order: 0`,
// c'est-à-dire en COUVERTURE.
//
// **Aucun précédent n'existait, contrairement à ce que ce fichier a affirmé.**
// Sa première version disait que `deleteEditedSound()` « fait les deux moitiés
// depuis #4696 ». C'était faux, et mesurable : cette porte nettoyait DEUX
// porteurs sur huit (`documentLocalMedia`, `documentTranscriptions`) et
// n'appelait jamais `preUploads.forget(url:)` — le manque exact sur lequel ce
// lot fonde un témoin entier. Sa jumelle `deleteForegroundSound(_:)` faisait de
// même. Les deux passent désormais par le point d'entrée ci-dessous.
//
// > **Un précédent cité de mémoire est une garde imaginaire.** La phrase
// > rassurait sur la porte la plus proche du défaut, donc sur la seule qu'il
// > fallait relire ; et elle l'a dispensée de l'être.

@MainActor
extension MeeshyComposerHost {

    /// **Le point d'entrée UNIQUE du retrait d'un média.**
    ///
    /// Les CINQ gestes de suppression y arrivent : le rail trailing de la scène
    /// (`handleTrailingRailAction(.delete)`), le menu d'appui long sur un fond
    /// (`applyBackgroundMenu(.delete)`, #5041), la corbeille du rail de scènes
    /// (`retractScene(at:)`) et les deux portes du SON (`deleteEditedSound()`,
    /// `deleteForegroundSound(_:)`). Cinq sites qui retirent seraient cinq
    /// inventaires à tenir d'accord, donc un oubli à venir — c'est exactement la
    /// forme du défaut qu'on ferme ici, et deux des cinq gestes ne figuraient
    /// déjà plus dans l'inventaire qu'on en avait fait.
    ///
    /// L'ORDRE des trois moitiés (pré-montée, porteurs, SDK) est porteur, et il
    /// vit dans `ComposerMediaRetractionRun.apply` — le seul lieu qui les
    /// applique, et le seul qu'un témoin puisse instancier.
    ///
    /// - Parameters:
    ///   - objectIds: ce que le geste NOMME. Un `objectId` qui ne désigne aucun
    ///     fichier (un texte, une pastille) ne retire rien des porteurs et
    ///     descend tel quel au SDK : c'est le cas nominal du rail trailing.
    ///   - slideId: la scène jetée, s'il y en a une — elle emporte TOUS ses
    ///     objets, le relevé du canvas les lui donnant.
    ///   - fileURLs: les fichiers nommés DIRECTEMENT, réservés aux portes du son :
    ///     une carte de contenu n'a pas d'objet de canvas, donc aucun relevé ne
    ///     peut la désigner.
    func retractMedia(objectIds: [String], slideId: String? = nil, fileURLs: Set<URL> = []) {
        ComposerMediaRetractionRun.apply(objectIds: objectIds,
                                         slideId: slideId,
                                         fileURLs: fileURLs,
                                         store: mediaPorterStore,
                                         preUploads: preUploads,
                                         viewModel: viewModel)
    }

    /// **L'adaptateur de la corbeille du rail de scènes** — un INDEX y devient
    /// une identité.
    ///
    /// Le rail ne connaît que la position de la tuile ; le point d'entrée
    /// ci-dessus ne travaille que sur des identités, seule forme qui survive à
    /// l'élagage d'une scène voisine. La traduction vit donc ici, et une seule
    /// fois : la refaire dans la fermeture du rail en ferait un second retrait.
    ///
    /// **Les objets de la scène ne sont plus énumérés ici, et c'est le
    /// correctif.** Cette fonction nommait `scene.effects.mediaObjects` — UNE
    /// famille sur cinq. Un SON posé sur la scène (`audioPlayerObjects`) restait
    /// donc pré-monté côté serveur avec sa transcription accrochée à son URL,
    /// et aucune des trois voies de rattrapage ne pouvait le nommer : le pont
    /// `documentMediaObjectIdBySource` n'est alimenté que par
    /// `applyContentMedia`, qui écarte l'audio ; `slideIdByMediaURL` n'indexe
    /// que les FONDS ; et `syncPostMediaIntoSlides` filtre `kind != .audio`.
    /// C'est le relevé du canvas qui énumère désormais, depuis la slide — les
    /// cinq familles, sans liste à tenir.
    func retractScene(at index: Int) {
        guard viewModel.slides.indices.contains(index) else { return }
        retractMedia(objectIds: [], slideId: viewModel.slides[index].id)
    }
}

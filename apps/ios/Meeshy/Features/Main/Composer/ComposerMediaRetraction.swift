import Foundation
import MeeshySDK

/// **Tout ce qu'un média LAISSE derrière lui dans le meuble** (#6577).
///
/// Le composer tient deux porteurs de la liste des médias, et un seul se voyait :
///
/// | porteur | ce qu'il est | qui le nettoyait |
/// |---|---|---|
/// | `viewModel.slides[].effects.mediaObjects` | ce que la VUE peint | `deleteElement` / `removeSlide` (SDK) |
/// | les huit champs ci-dessous | ce que la PUBLICATION téléverse | **personne** |
///
/// Le SDK n'a aucun accès au `@State` app-side : `deleteElement` et `removeSlide`
/// ne PEUVENT PAS nettoyer le second. Retirer un média ne retirait donc que sa
/// vignette — le fichier restait dans `documentLocalMedia`, repartait au
/// téléversement, et le gateway le gravait à `order: 0`, c'est-à-dire en
/// COUVERTURE. « Je supprime un média et rechoisit un autre : c'est l'ancien qui
/// est publié » (constat porteur, 2026-09-14).
///
/// ## Pourquoi un TYPE plutôt que huit lignes dans le meuble
///
/// Parce que `mediaRoleByURL` et `railPosedMediaURLs` portent DEUX charges à la
/// fois — le rôle (ou la porte) ET la garde d'idempotence de la re-pose. Les
/// retirer séparément, ou en oublier un, ne perd pas seulement une information :
/// ça re-pose le média au tour de dérivation suivant, ou ça BLOQUE en silence la
/// re-sélection du même fichier. Le retrait est donc atomique par construction.
///
/// C'est la même leçon que `createMentionNotificationsBatch` du gateway — « un
/// relais qui RECOPIE champ par champ est un inventaire à tenir à jour » — et
/// que « Tout effacer » (#5013) a déjà payée sur ces mêmes champs.
nonisolated struct ComposerMediaPorters: Equatable, Sendable {

    /// Les pièces jointes LOCALES — **c'est elle que la publication téléverse.**
    var localMedia: [ComposerDocumentMedia]

    /// Le rôle de chaque média posé, ET la garde d'idempotence de la re-pose.
    var roleByURL: [URL: ComposerMediaRole]

    /// L'index des FONDATIONS : quelle slide un média a ouverte.
    var slideIdByMediaURL: [URL: String]

    /// Le pont `URL source → identifiant d'objet de canvas`, qui porte les
    /// alternatives textuelles jusqu'à la charge.
    var objectIdBySource: [URL: String]

    /// Les légendes, clées par URL locale — elles voyagent dans la charge.
    var captions: ComposerMediaCaptions

    /// Les alternatives textuelles, clées par identifiant d'OBJET : c'est ce que
    /// l'éditeur édite. Le pont ci-dessus les traduit en URL au moment de
    /// composer le brouillon, donc un objet oublié ici accroche son alternative
    /// au fichier SUIVANT posé sous le même identifiant.
    var altsByObjectId: [String: String]

    /// Ce que Whisper a compris sur l'appareil, par URL.
    var transcriptions: [URL: MobileTranscriptionPayload]

    /// Les médias entrés par le rail de la scène — seconde garde d'idempotence,
    /// lue par `ComposerMediaPlacement` pour décider de la porte.
    var railPosedURLs: Set<URL>

    /// **`identifiant d'objet → alternative` devient `URL source → alternative`.**
    ///
    /// La projection vivait sur le meuble (`altsParURLSource`) ; elle descend ici
    /// parce qu'elle ne lit QUE deux des champs ci-dessus, et qu'un retrait doit
    /// pouvoir se prouver sur ce que la charge porte VRAIMENT — pas sur une
    /// jumelle réécrite dans un témoin.
    ///
    /// Une source dont l'objet n'a pas d'alternative n'entre pas dans la carte :
    /// un `nil` et une chaîne vide se disent pareil à l'arrivée, et une chaîne
    /// vide poserait une alternative BLANCHE — un lecteur d'écran annoncerait
    /// « image » suivi de rien, ce qui est pire que rien.
    var altsBySourceURL: ComposerMediaCaptions {
        objectIdBySource.reduce(into: ComposerMediaCaptions()) { carte, entree in
            let (source, objectId) = entree
            guard let texte = altsByObjectId[objectId],
                  !texte.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else { return }
            carte[source] = texte
        }
    }
}

/// **Le retrait d'un média, calculé — jamais appliqué ici.**
///
/// La règle est pure : elle rend les porteurs NETTOYÉS et dit ce qu'elle a
/// retiré, pour que le meuble sache quoi oublier ailleurs. Ses trois champs ont
/// chacun leur lecteur, et c'est voulu — une loi qui calcule une valeur que
/// personne ne lit est pire qu'absente, ses tests faisant croire la question
/// réglée :
///
/// | champ | son lecteur |
/// |---|---|
/// | `porteurs` | les huit `@State` du meuble, réécrits d'un bloc |
/// | `retiredURLs` | `ComposerPreUploadRegistry.forget(url:)` — la moitié SERVEUR du geste |
/// | `retiredObjectIds` | `StoryComposerViewModel.deleteElement(id:)` — la moitié MODÈLE |
nonisolated struct ComposerMediaRetraction: Equatable, Sendable {

    let porteurs: ComposerMediaPorters
    let retiredURLs: Set<URL>
    let retiredObjectIds: Set<String>

    /// **Ce que le geste désigne, et ce que la règle en DÉDUIT.**
    ///
    /// Un geste nomme des objets (le rail trailing) ou une scène (la corbeille
    /// du rail de scènes) ; il ne nomme jamais de FICHIER. Les URL se déduisent
    /// donc des deux index du meuble — le pont des objets et l'index des
    /// fondations — et l'ensemble des objets se referme ensuite sur elles :
    /// jeter une scène emporte le fichier qui l'a fondée, donc l'objet né de ce
    /// fichier, que l'appelant n'avait aucune raison de nommer.
    static func retracting(_ porteurs: ComposerMediaPorters,
                           objectIds: [String],
                           slideId: String?) -> ComposerMediaRetraction {
        let vises = Set(objectIds)
        var urls = Set(porteurs.objectIdBySource.compactMap { source, objet in
            vises.contains(objet) ? source : nil
        })
        if let slideId {
            for (source, slide) in porteurs.slideIdByMediaURL where slide == slideId {
                urls.insert(source)
            }
        }
        let objets = vises.union(urls.compactMap { porteurs.objectIdBySource[$0] })

        var restants = porteurs
        restants.localMedia = porteurs.localMedia.filter { !urls.contains($0.url) }
        restants.roleByURL = porteurs.roleByURL.filter { !urls.contains($0.key) }
        restants.slideIdByMediaURL = porteurs.slideIdByMediaURL.filter { !urls.contains($0.key) }
        restants.objectIdBySource = porteurs.objectIdBySource.filter { !urls.contains($0.key) }
        restants.captions = porteurs.captions.filter { !urls.contains($0.key) }
        restants.transcriptions = porteurs.transcriptions.filter { !urls.contains($0.key) }
        restants.railPosedURLs = porteurs.railPosedURLs.subtracting(urls)
        restants.altsByObjectId = porteurs.altsByObjectId.filter { !objets.contains($0.key) }

        return ComposerMediaRetraction(porteurs: restants,
                                       retiredURLs: urls,
                                       retiredObjectIds: objets)
    }
}

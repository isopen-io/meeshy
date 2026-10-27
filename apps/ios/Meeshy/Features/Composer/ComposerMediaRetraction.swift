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

    /// **La page blanche — les huit porteurs à zéro, en UNE valeur.**
    ///
    /// C'est ce que « Tout effacer » consomme. L'effacement s'écrivait en
    /// ÉNUMÉRATION (`documentLocalMedia = []`, `slideIdByMediaURL = [:]`, …) et
    /// en oubliait DEUX sur huit — `altsByObjectId` et `railPosedURLs`, que rien
    /// n'affectait nulle part ailleurs. Une énumération perd le prochain champ
    /// comme elle a perdu ceux-là, et rien ne rougit ; une VALEUR ne peut pas en
    /// perdre, le compilateur exigeant les huit.
    static let empty = ComposerMediaPorters(
        localMedia: [], roleByURL: [:], slideIdByMediaURL: [:], objectIdBySource: [:],
        captions: [:], altsByObjectId: [:], transcriptions: [:], railPosedURLs: [])
}

/// **Un objet de la scène, vu du RETRAIT : son identité, sa page, son fichier.**
///
/// Le retrait a besoin de trois faits sur chaque objet, et de rien d'autre. Les
/// porter dans une valeur PURE est ce qui rend la règle éprouvable sans monter
/// un `StoryComposerViewModel` — et ce qui l'oblige à dire, pour chaque objet,
/// s'il peint un fichier ou non.
nonisolated struct ComposerCanvasObject: Equatable, Sendable {

    let id: String
    let slideId: String

    /// **L'adresse du fichier que l'objet PEINT** — `nil` pour un texte, une
    /// pastille, un lieu.
    ///
    /// Ce n'est PAS l'URL source du meuble : `applyContentMedia` copie le
    /// fichier choisi sous `tmp/<objectId>.<ext>` et c'est CETTE adresse que
    /// l'objet porte. Deux objets qui partagent la même adresse partagent donc
    /// le même fichier — c'est exactement ce qu'une DUPLICATION produit, et ce
    /// que le retrait doit voir pour ne pas jeter un fichier encore peint.
    let fileURL: URL?
}

/// **Le relevé de ce que le MODÈLE peint, remis à la règle pure.**
///
/// Trois questions y trouvent leur réponse, et aucune ne se pose sans lui :
///
/// | question | pourquoi le meuble seul ne peut pas y répondre |
/// |---|---|
/// | quels objets une SCÈNE porte-t-elle ? | `slideIdByMediaURL` n'indexe que les FONDS ; une scène porte aussi du texte, des pastilles, un SON |
/// | quel fichier un objet peint-il ? | le pont `objectIdBySource` ne connaît que les médias VISUELS entrés par `applyContentMedia` — jamais l'audio |
/// | ce fichier est-il encore peint AILLEURS ? | dupliquer un objet fabrique un second peintre pour le même fichier, et le pont ne connaît que le premier |
nonisolated struct ComposerCanvasCensus: Equatable, Sendable {

    let objects: [ComposerCanvasObject]

    static let empty = ComposerCanvasCensus(objects: [])

    /// Les objets que le geste ÉPARGNE.
    func survivors(excluding retires: Set<String>) -> [ComposerCanvasObject] {
        objects.filter { !retires.contains($0.id) }
    }

    /// Les fichiers peints par ces objets-là.
    func files(of objectIds: Set<String>) -> Set<URL> {
        Set(objects.filter { objectIds.contains($0.id) }.compactMap(\.fileURL))
    }

    func fileURL(of objectId: String) -> URL? {
        objects.first(where: { $0.id == objectId })?.fileURL
    }

    func ids(onSlide slideId: String) -> Set<String> {
        Set(objects.filter { $0.slideId == slideId }.map(\.id))
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
    /// du rail de scènes) ; il ne nomme un FICHIER que depuis les deux portes du
    /// SON, seules à tenir une carte de contenu sans objet de canvas. Les URL se
    /// déduisent donc de TROIS sources — le pont des objets, l'index des
    /// fondations, et le relevé du canvas — et l'ensemble des objets se referme
    /// ensuite sur elles : jeter une scène emporte le fichier qui l'a fondée,
    /// donc l'objet né de ce fichier, que l'appelant n'avait aucune raison de
    /// nommer.
    ///
    /// ## Le relevé n'est pas un confort : il porte ce qu'aucun index ne dit
    ///
    /// - **L'AUDIO.** Le pont `objectIdBySource` n'est alimenté que par
    ///   `applyContentMedia`, qui écarte le son par construction ; l'index des
    ///   fondations n'indexe que les FONDS. Sans le relevé, jeter une scène qui
    ///   porte un son laissait son fichier pré-monté côté serveur et sa
    ///   transcription accrochée à une URL que le prochain fichier posé sous le
    ///   même nom hériterait.
    /// - **TOUS les objets d'une scène**, pas seulement ses médias — c'est ce
    ///   qui permet au repli (quand `removeSlide` refuse) de tenir la promesse
    ///   de « scène vierge » que son commentaire faisait sans le code.
    /// - **La DUPLICATION.** Deux objets peignent un seul fichier ; le pont ne
    ///   connaît que le premier. Supprimer l'original retirait le fichier de la
    ///   charge pendant que le clone restait peint — l'INVERSE du défaut
    ///   d'origine, et tout aussi invisible.
    ///
    /// Un relevé VIDE rend exactement l'ancienne règle : les trois apports
    /// ci-dessus sont des unions et des filtres sur l'ensemble vide.
    static func retracting(_ porteurs: ComposerMediaPorters,
                           objectIds: [String],
                           slideId: String?,
                           fileURLs: Set<URL> = [],
                           census: ComposerCanvasCensus = .empty) -> ComposerMediaRetraction {
        let vises = Set(objectIds).union(slideId.map(census.ids(onSlide:)) ?? [])

        var deduites = Set(porteurs.objectIdBySource.compactMap { source, objet in
            vises.contains(objet) ? source : nil
        })
        if let slideId {
            for (source, slide) in porteurs.slideIdByMediaURL where slide == slideId {
                deduites.insert(source)
            }
        }
        deduites.formUnion(census.files(of: vises))

        // **Un fichier encore PEINT ne quitte pas la charge.** La déduction
        // ci-dessus part des objets retirés ; elle ne sait pas qu'un clone
        // survivant peint le même fichier. Les URL NOMMÉES par l'appelant, elles,
        // ne passent pas par ce filtre : elles viennent des portes du son, où
        // l'auteur a désigné le fichier lui-même.
        let survivants = census.survivors(excluding: vises)
        let peintsAilleurs = Set(survivants.compactMap(\.fileURL))
        let urls = deduites.filter { source in
            let empreinte = porteurs.objectIdBySource[source].flatMap(census.fileURL(of:))
            return !peintsAilleurs.contains(source)
                && !(empreinte.map(peintsAilleurs.contains) ?? false)
        }.union(fileURLs)

        let objets = vises.union(urls.compactMap { porteurs.objectIdBySource[$0] })

        var restants = porteurs
        restants.localMedia = porteurs.localMedia.filter { !urls.contains($0.url) }
        restants.roleByURL = porteurs.roleByURL.filter { !urls.contains($0.key) }
        restants.slideIdByMediaURL = porteurs.slideIdByMediaURL.filter { !urls.contains($0.key) }
        restants.objectIdBySource = porteurs.objectIdBySource.filter { !urls.contains($0.key) }
        restants.captions = porteurs.captions.filter { !urls.contains($0.key) }
        restants.transcriptions = porteurs.transcriptions.filter { !urls.contains($0.key) }
        restants.railPosedURLs = porteurs.railPosedURLs.subtracting(urls)

        // **Une source qui SURVIT change de peintre, et son alternative le
        // suit.** Le pont voyage dans la charge (`mediaObjectIds`) : l'y laisser
        // pointer un objet que le modèle ne connaît plus ferait partir une
        // publication qui désigne un fantôme, et l'alternative saisie sur
        // l'original — qui décrit le FICHIER, pas l'objet — serait perdue alors
        // que le fichier, lui, reste publié.
        let repreneurs: [(source: URL, ancien: String, repreneur: String)] =
            porteurs.objectIdBySource.compactMap { source, ancien in
                guard !urls.contains(source), objets.contains(ancien),
                      let empreinte = census.fileURL(of: ancien),
                      let repreneur = survivants.first(where: { $0.fileURL == empreinte })
                else { return nil }
                return (source, ancien, repreneur.id)
            }
        restants.altsByObjectId = porteurs.altsByObjectId.filter { !objets.contains($0.key) }
        for reprise in repreneurs {
            restants.objectIdBySource[reprise.source] = reprise.repreneur
            restants.altsByObjectId[reprise.repreneur] = porteurs.altsByObjectId[reprise.ancien]
        }

        return ComposerMediaRetraction(porteurs: restants,
                                       retiredURLs: urls,
                                       retiredObjectIds: objets)
    }
}

// MARK: - Le relevé, LU depuis le modèle

extension ComposerCanvasCensus {

    /// **Le relevé, dressé depuis les slides — CINQ familles d'objets, DEUX
    /// porteuses de fichier.**
    ///
    /// L'énumération des objets passe par `StorySlide.sceneObjects`, la somme du
    /// SDK : une sixième famille y entrera sans que ce site ait à l'apprendre.
    /// L'adresse du fichier, elle, ne peut pas en venir — `MeeshySceneObject`
    /// n'expose aucune URL — et se lit donc sur les deux familles qui en portent
    /// une, la MÊME paire que le balayage de pré-montée
    /// (`MeeshyComposerHost+PreUpload.startPendingPreUploads`) :
    ///
    /// > « Une seule paire (`postMediaId`, `mediaURL`) décrit les deux familles,
    /// > d'où une liste plate plutôt qu'une boucle par famille. »
    ///
    /// Les deux sites doivent rester d'accord : **ce qui se pré-monte est
    /// exactement ce qu'un retrait doit faire oublier.**
    ///
    /// Une adresse DISTANTE (une URL `https` posée par l'adoption d'une
    /// pré-montée) n'entre pas dans le relevé : elle ne désigne aucun fichier
    /// local, donc ni une entrée de `documentLocalMedia` à retirer, ni une clé
    /// du registre de pré-montée à oublier.
    static func of(_ slides: [StorySlide]) -> ComposerCanvasCensus {
        ComposerCanvasCensus(objects: slides.flatMap { slide in
            let fichiers = fileURLsByObjectId(in: slide.effects)
            return slide.sceneObjects.map {
                ComposerCanvasObject(id: $0.id, slideId: slide.id, fileURL: fichiers[$0.id])
            }
        })
    }

    private static func fileURLsByObjectId(in effects: StoryEffects) -> [String: URL] {
        let porteurs: [(id: String, adresse: String?)] =
            (effects.mediaObjects ?? []).map { ($0.id, $0.mediaURL) }
            + (effects.audioPlayerObjects ?? []).map { ($0.id, $0.mediaURL) }
        return porteurs.reduce(into: [String: URL]()) { carte, porteur in
            guard let adresse = porteur.adresse,
                  let url = URL(string: adresse), url.isFileURL
            else { return }
            carte[porteur.id] = url
        }
    }
}

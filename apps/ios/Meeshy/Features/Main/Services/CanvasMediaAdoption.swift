import Foundation
import MeeshySDK
import os

/// **Un canvas publié ne peut désigner que des médias que le post POSSÈDE**
/// (#5280, 2026-09-05).
///
/// ## Le défaut que cette règle nomme
///
/// Une photo posée sur la scène est téléversée DEUX fois : une pré-montée à la
/// pose (pour que le canvas ait une URL affichable tout de suite), puis une
/// seconde à la publication (pour que le POST ait son média). Deux lignes
/// `PostMedia`, deux fichiers, une seule photo.
///
/// Tant que le canvas garde l'identité de la PREMIÈRE, il désigne une ligne qui
/// n'appartient pas au post. Mesuré sur staging :
///
/// | | id |
/// |---|---|
/// | `post.media[0].id` | `6a9c52e32fe27d0b04dda8da` |
/// | `canvas…postMediaId` | `6a9c52c22fe27d0b04dda8d9` |
///
/// Le lecteur cherche l'id du canvas dans `post.media`, ne le trouve pas, et
/// peint une scène VIDE — sur toute la carte, pour tous les viewers.
///
/// > **Un identifiant orphelin ne produit ni erreur, ni journal, ni rendu
/// > partiel : il produit du BLANC.** Les deux fichiers existent, les deux
/// > requêtes répondent 200, et rien dans la chaîne n'a de raison de se
/// > plaindre. C'est la forme la plus coûteuse d'un défaut de référence — elle
/// > ressemble à un contenu vide, donc à une erreur de l'auteur.
///
/// ## Pourquoi une RÈGLE et pas seulement un correctif
///
/// Le correctif (adopter l'identité du téléversement de publication dans
/// l'objet de canvas) vit à UN endroit du chemin de publication. L'invariant,
/// lui, vaut pour TOUT canvas qui part — publication, édition, republication —
/// et ces chemins sont écrits séparément : `runStoryUpload` et
/// `runStoryUpdate` portent chacun leur étage d'upload, à quatre cents lignes
/// d'écart, avec la même structure et le même oubli.
///
/// Cette règle est ce qui permet de le VÉRIFIER sans monter une vue, et de le
/// vérifier sur les deux chemins avec le même témoin.
nonisolated enum CanvasMediaAdoption {

    /// Les `postMediaId` que le canvas désigne et que le post ne possède pas.
    ///
    /// Vide ⇒ le canvas est cohérent avec sa publication.
    ///
    /// Un objet dont le `postMediaId` est VIDE n'est pas un orphelin : c'est un
    /// objet dont l'asset manquait au moment de publier
    /// (`publish foreground media asset missing`), déjà journalisé là-bas et
    /// délibérément laissé hors de `mediaIds`. Le confondre avec un orphelin
    /// ferait rougir ce témoin sur un cas que le code traite déjà, en connaissance.
    static func orphanIds(in effects: StoryEffects, postMediaIds: [String]) -> [String] {
        let possedes = Set(postMediaIds)
        return designatedIds(in: effects)
            .filter { !$0.isEmpty && !possedes.contains($0) }
    }

    /// **Tous les `postMediaId` que le document DÉSIGNE**, où qu'ils vivent.
    ///
    /// Un document publié en porte à DEUX endroits : le runtime
    /// (`mediaObjects`, la première slide) et les scènes que `canvasV3`
    /// transporte pour les suivantes. N'en lire qu'un rendait `isCoherent`
    /// vraie sur la publication exacte qui échouait à l'écran — **une garde qui
    /// ne voit pas la moitié du document certifie l'autre moitié.**
    static func designatedIds(in effects: StoryEffects) -> [String] {
        let runtime = (effects.mediaObjects ?? []).map(\.postMediaId)
        let scenes = (effects.canvasV3?.scenes ?? [])
            .flatMap(\.objects)
            .filter { $0.kind == .media }
            .compactMap { objet -> String? in
                guard case .string(let id)? = objet.payload["postMediaId"] else { return nil }
                return id
            }
        return runtime + scenes
    }

    /// `true` ⇔ tout ce que le canvas désigne est attaché au post.
    static func isCoherent(effects: StoryEffects, postMediaIds: [String]) -> Bool {
        orphanIds(in: effects, postMediaIds: postMediaIds).isEmpty
    }
}

/// **`nonisolated` sur l'EXTENSION aussi, pas seulement sur l'énuméré.**
///
/// L'isolation par défaut de l'app est `MainActor` : un `nonisolated enum` ne
/// la fait pas hériter à ses extensions, et `OutboxDispatcher` — qui dispatche
/// hors du fil principal — s'est vu refuser l'appel. C'est le piège que
/// `SocialMediaCaption` documente déjà (leçon 473 : l'annotation est une SONDE
/// avant d'être un correctif) ; la règle est PURE, elle n'appartient à aucun
/// acteur, et c'est l'oublier sur l'extension qui la rendait inatteignable là
/// où elle sert.
nonisolated extension CanvasMediaAdoption {

    /// **L'ADOPTION — le canvas reprend l'identité que le post vient de
    /// créer** (#5280).
    ///
    /// Trois cartes se rencontrent ici, et nulle part ailleurs :
    ///
    /// | carte | ce qu'elle dit | qui la produit |
    /// |---|---|---|
    /// | `objectIdsBySourceIndex` | position du fichier → objet de canvas | le meuble (`applyContentMedia`) |
    /// | `idsBySourceIndex` | position → `PostMedia.id` | l'upload de ce dispatch |
    /// | `urlsBySourceIndex` | position → URL servie | idem |
    ///
    /// La POSITION est le seul lien qui survive à la relocalisation des
    /// fichiers : la file ne garde que des chemins relatifs, et l'URL d'origine
    /// n'existe plus au moment du dispatch. C'est aussi pourquoi l'index
    /// s'ENREGISTRE à l'upload (`uploadedSourceIndexes`) au lieu de se déduire
    /// d'une longueur — un upload sauté romprait l'alignement en silence.
    ///
    /// Un objet que rien ne désigne est laissé INTACT plutôt que vidé : il peut
    /// venir d'une pré-montée dont le fichier est déjà en ligne et parfaitement
    /// valide. Effacer ce qu'on ne sait pas remplacer est le geste qui
    /// transforme un doute en perte.
    ///
    /// - Returns: `nil` si `effects` était `nil` — un post sans canvas traverse
    ///   sans rien changer.
    static func adopting(
        _ effects: StoryEffects?,
        objectIdsBySourceIndex: [String?]?,
        idsBySourceIndex: [Int: String],
        urlsBySourceIndex: [Int: String]
    ) -> StoryEffects? {
        let journal = os.Logger(subsystem: "me.meeshy.app", category: "media")
        guard var effets = effects,
              let objectIds = objectIdsBySourceIndex,
              var objets = effets.mediaObjects,
              !objets.isEmpty
        else {
            journal.info(
                "adoption IMPOSSIBLE: effets=\(effects != nil, privacy: .public) objectIds=\(objectIdsBySourceIndex?.count ?? -1, privacy: .public) mediaObjects=\(effects?.mediaObjects?.count ?? -1, privacy: .public)"
            )
            return effects
        }
        var adoptes = 0
        defer {
            journal.info(
                "adoption: \(adoptes, privacy: .public)/\(objets.count, privacy: .public) objet(s) — ponts=\(objectIds.compactMap { $0 }.count, privacy: .public) ids=\(idsBySourceIndex.count, privacy: .public)"
            )
        }

        for (index, objectId) in objectIds.enumerated() {
            guard let objectId, !objectId.isEmpty,
                  let servedId = idsBySourceIndex[index],
                  let position = objets.firstIndex(where: { $0.id == objectId })
            else { continue }
            objets[position].postMediaId = servedId
            adoptes += 1
            if let servedUrl = urlsBySourceIndex[index] {
                objets[position].mediaURL = servedUrl
            }
        }
        effets.mediaObjects = objets
        effets.canvasV3 = adopting(effets.canvasV3,
                                   objectIdsBySourceIndex: objectIds,
                                   idsBySourceIndex: idsBySourceIndex,
                                   urlsBySourceIndex: urlsBySourceIndex)
        return effets
    }

    /// **Les scènes que le CANVAS transporte s'adoptent comme le runtime.**
    ///
    /// `ComposerStoryCanvas.publishedSlide` pose la première slide en runtime et
    /// porte les suivantes dans `canvasV3.scenes` — sans changer aucune
    /// signature, ce qui est ce qui a rendu ce transport possible. La
    /// contrepartie est ici : les objets des scènes 2 à N n'apparaissent dans
    /// AUCUN `mediaObjects`, donc la boucle ci-dessus ne les voyait pas, et
    /// leur `postMediaId` restait celui de la pré-montée.
    ///
    /// Mesuré au simulateur le 2026-09-06 : la scène 2 d'une publication à deux
    /// photos désignait un id que le post ne possédait pas. Elle ne rendait pas
    /// du blanc — elle rendait **l'image de la scène 1**, par repli sur le
    /// premier visuel. Un rendu qui a l'air réussi n'invite pas à regarder deux
    /// fois.
    ///
    /// > **Un correctif de transport se suit jusqu'à ce qui ADOPTE.** Le lot qui
    /// > a fait voyager les scènes par le canvas a laissé derrière lui une règle
    /// > dont l'invariant restait vrai de tout ce qu'elle voyait.
    ///
    /// L'appariement est le MÊME — par identifiant d'objet — parce que la
    /// migration réutilise l'id du `StoryMediaObject` comme id de l'`ObjectV3`.
    /// Un second critère (la position, l'ordre) aurait divergé du premier.
    private static func adopting(
        _ document: CanvasV3?,
        objectIdsBySourceIndex: [String?],
        idsBySourceIndex: [Int: String],
        urlsBySourceIndex: [Int: String]
    ) -> CanvasV3? {
        guard let document, !document.scenes.isEmpty else { return document }
        var servisParObjet: [String: (id: String, url: String?)] = [:]
        for (index, objectId) in objectIdsBySourceIndex.enumerated() {
            guard let objectId, !objectId.isEmpty,
                  let servedId = idsBySourceIndex[index] else { continue }
            servisParObjet[objectId] = (servedId, urlsBySourceIndex[index])
        }
        guard !servisParObjet.isEmpty else { return document }

        // **Reconstruit, jamais muté** : `SceneV3` et `ObjectV3` sont
        // immuables. Et reconstruire oblige à ÉNUMÉRER ce qui voyage avec ce
        // qu'on change — l'ouverture, la fermeture, les transitions, la durée,
        // le thumbHash, le rapport porteur. Les omettre les perdrait en
        // silence : rien ne rougit quand une transition disparaît d'un canvas
        // publié.
        let scenesAdoptees = document.scenes.map { scene -> SceneV3 in
            SceneV3(
                id: scene.id,
                objects: scene.objects.map { objet -> ObjectV3 in
                    guard objet.kind == .media,
                          let servi = servisParObjet[objet.id] else { return objet }
                    var charge = objet.payload
                    charge["postMediaId"] = .string(servi.id)
                    // L'URL n'est réécrite que si le dispatch en a servi une :
                    // un objet dont le fichier est déjà en ligne garde la sienne.
                    if let url = servi.url { charge["mediaURL"] = .string(url) }
                    return ObjectV3(id: objet.id, kind: objet.kind, anchor: objet.anchor,
                                    plane: objet.plane, z: objet.z, transform: objet.transform,
                                    timing: objet.timing, locale: objet.locale, payload: charge)
                },
                opening: scene.opening,
                closing: scene.closing,
                clipTransitions: scene.clipTransitions,
                timelineDuration: scene.timelineDuration,
                thumbHash: scene.thumbHash,
                carrierAspect: scene.carrierAspect)
        }
        return CanvasV3(v: document.v, scenes: scenesAdoptees,
                        sound: document.sound, layout: document.layout)
    }

}

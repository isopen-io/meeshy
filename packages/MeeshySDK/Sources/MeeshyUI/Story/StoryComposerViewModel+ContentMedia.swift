import SwiftUI
import UIKit
import os
import MeeshySDK

// MARK: - Le MÉDIA du composer, porté dans la scène (B1, #3924)

/// **Ce qu'un hôte app demande de porter dans la scène — un média LOCAL déjà
/// composé ailleurs (une pièce jointe du document).**
///
/// OPAQUE, exactement comme `StoryComposerSeed` : le SDK ne sait pas d'où il
/// vient — ni pièce jointe, ni règle « quand porter ». Il reçoit un fichier
/// local et un type, et le pose sur la slide courante. C'est le jumeau média
/// d'`applyContentText` (B1) : le composer garde UN seul contenu quand il change
/// de mode, et le média composé au document doit apparaître sur la scène qui
/// naît (loi 9 — changer de mode ne jette jamais ce qui est composé).
public struct ComposerContentMedia: Equatable, Sendable {

    /// **`audio` a rejoint les deux autres au #4052.** Le modèle (§ 4) donne au
    /// son un TROISIÈME emplacement, à côté du fond visuel et des objets de
    /// premier plan : « une scène peut avoir un média de fond ET un audio en
    /// fond ». Le refus du SDK — « un son n'a pas de place de FOND sur un
    /// canvas » — était juste d'un fond VISUEL, et faux du son.
    ///
    /// `file` n'y est PAS, et ce n'est pas un oubli : un document n'a de place
    /// ni visuelle ni sonore sur une scène. Il reste une pièce jointe du post.
    public enum Kind: Sendable, Equatable { case image, video, audio }

    /// L'URL LOCALE du média — la CLÉ d'idempotence. L'hôte la garde stable
    /// (elle nomme le fichier temp du document), si bien qu'un aller-retour de
    /// mode ne porte pas le média deux fois.
    public let sourceURL: URL
    public let kind: Kind
    public let durationMs: Int?

    /// **Le mime DÉCLARÉ à la source (#4038)** — celui que le sélecteur a dit,
    /// jamais un mime re-dérivé du nom du fichier.
    ///
    /// Il compte parce que la pose COPIE le fichier sous `{objectId}.{ext}` et
    /// que tout l'aval lit ce nom : `MimeTypeResolver.mimeType(forURL:)` est ce
    /// qui étiquette le téléversement. Le choix de l'extension EST donc le
    /// transport du mime — et il était GUESSÉ : `pathExtension.isEmpty ? "jpg"`
    /// baptisait « jpg » un PNG ou un HEIC dont l'URL source n'avait pas
    /// d'extension. Le fichier partait alors sous une étiquette fausse, sans que
    /// rien ne rougisse.
    ///
    /// `nil` ⇒ la source n'a rien déclaré : le repli historique s'applique. Ne
    /// jamais inventer un mime ici — c'est exactement ce que le repli « jpg »
    /// faisait.
    public let mimeType: String?

    public init(sourceURL: URL, kind: Kind, durationMs: Int? = nil, mimeType: String? = nil) {
        self.sourceURL = sourceURL
        self.kind = kind
        self.durationMs = durationMs
        self.mimeType = mimeType
    }
}

/// **Où se range un audio posé sur une scène (#4052) — règle §4-3 du modèle.**
///
/// « Un audio devient le son de fond **s'il n'y en a pas** ». Le second n'écrase
/// donc pas le premier : il se pose en premier plan, où il reste audible et
/// déplaçable, plutôt que de faire disparaître en silence la bande-son que
/// l'auteur venait de choisir.
///
/// **Extraite, pas dupliquée.** Elle vivait en clair dans `addAudioObject()`,
/// le chemin de l'atelier ; le chemin du document en avait besoin à son tour.
/// Deux copies auraient divergé au premier ajustement de l'une — et c'est
/// précisément ce que l'issue interdisait.
///
/// Rend `Bool?` et non `Bool` parce que c'est le type du champ : `nil` et
/// `false` disent tous deux « pas en fond » sur `StoryAudioPlayerObject`, et
/// l'existant écrit `nil`. Le normaliser ici changerait ce que la persistance
/// voit, sans qu'aucun test ne le demande.
public nonisolated enum ComposerAudioPlacement {
    public static func isBackground(sceneAlreadyHasBackgroundAudio: Bool) -> Bool? {
        sceneAlreadyHasBackgroundAudio ? nil : true
    }

    /// **Le choix de l'AUTEUR gagne sur la règle automatique (#4483).**
    ///
    /// La règle ci-dessus DEVINE : elle met en fond le premier son d'une scène
    /// qui n'en a pas. C'est un bon défaut, et il reste le défaut — `nil`
    /// signifie « l'auteur n'a rien dit », pas « premier plan ». Ce qui change
    /// est qu'il devient possible de le contredire, ce que le porteur a demandé
    /// (« de les mettre en background ou en foreground »).
    public static func isBackground(chosen: ComposerAudioRole?,
                                    sceneAlreadyHasBackgroundAudio: Bool) -> Bool? {
        switch chosen {
        case .background:
            return true
        case .foreground:
            // `nil` et `false` disent tous deux « pas en fond » sur
            // `StoryAudioPlayerObject`, et tout l'existant écrit `nil`. Écrire
            // `false` ici changerait ce que la persistance voit sans qu'aucun
            // témoin ne le demande.
            return nil
        case .none:
            return isBackground(sceneAlreadyHasBackgroundAudio: sceneAlreadyHasBackgroundAudio)
        }
    }
}

/// **Le rôle de MIXAGE d'un son sur une scène — distinct de son CRÉDIT.**
///
/// La doctrine du composer affirmait qu'« une note vocale n'est JAMAIS un fond
/// audio », au motif qu'un fond allume le crédit (« ♫ NUITS BLANCHES · @lume »).
/// Elle confondait deux champs orthogonaux de `StoryAudioPlayerObject` :
///
/// | ce qui est en jeu | le champ qui le porte | qui l'écrit |
/// |---|---|---|
/// | le CRÉDIT | `soundId` + `soundAuthorUsername` | `addBorrowedSound`, et lui seul |
/// | le rôle de MIXAGE | `isBackground` | n'importe quel son |
///
/// Un vocal mis en fond porte donc `isBackground = true` et `soundId = nil` : le
/// bon mixage, sans ligne de crédit mensongère. Ce que la doctrine protégeait
/// vraiment reste protégé.
public nonisolated enum ComposerAudioRole: String, Equatable, Hashable, CaseIterable, Sendable {
    /// Sous tout le reste, en boucle — la bande-son de la scène.
    case background
    /// Un objet parmi les autres, avec sa place et sa durée.
    case foreground
}

/// **L'extension sous laquelle un média porté est MATÉRIALISÉ (#4038).**
///
/// Règle pure, hors de toute vue, parce qu'elle décide de ce que le serveur
/// recevra comme type : l'extension de la source quand elle existe (elle est la
/// plus fidèle — c'est le fichier lui-même qui la porte), à défaut celle que le
/// mime DÉCLARÉ commande, et seulement en dernier recours le repli historique.
///
/// Le repli reste `jpg` et ce n'est pas un oubli : une image sans extension NI
/// mime déclaré n'a plus aucune source de vérité, et `jpg` est le format que
/// l'app écrit elle-même pour ses captures. Ce qui change est qu'il cesse d'être
/// le PREMIER choix.
public nonisolated enum ComposerContentMediaFile {
    public static func fileExtension(sourceURL: URL,
                                     declaredMimeType: String?,
                                     fallback: String) -> String {
        if !sourceURL.pathExtension.isEmpty { return sourceURL.pathExtension }
        if let declaredMimeType,
           let derived = MimeTypeResolver.preferredExtension(for: declaredMimeType) {
            return derived
        }
        return fallback
    }
}

public extension StoryComposerViewModel {

    /// **Semer le MÉDIA depuis un hôte app (B1, #3924).** Point d'entrée PUBLIC,
    /// jumeau d'`applyContentText` : le média composé au document SUIT sur la
    /// slide de la scène qui naît. Le PREMIER média devient le fond (c'est
    /// `addMediaObject` qui l'y range quand la slide n'a encore ni fond média ni
    /// image de fond) ; les suivants se posent en premier plan.
    ///
    /// **IDEMPOTENT — c'est le cœur du contrat.** Les closures de bascule de
    /// mode (`MeeshyComposerHost`) refirent à chaque changement Post↔Story↔Réel :
    /// sans `carriedContentSources`, un simple aller-retour dupliquerait chaque
    /// média. Chaque `sourceURL` n'est donc portée qu'UNE fois, et seulement
    /// après que la pose a RÉUSSI (le plafond `canAddMedia` peut la refuser).
    ///
    /// **La convention « `obj.id` == nom du fichier temp » est STRUCTURANTE** —
    /// elle relie le bitmap au `composerKey` que `StoryBackgroundLayer` dérive du
    /// fichier. On COPIE donc la source sous `{objectId}.{ext}`, exactement
    /// comme le chemin caméra (`addCapturedMedia`) et la graine
    /// (`StoryComposerSeedFile`) ; référencer la source telle quelle laisserait
    /// le fond introuvable → canvas noir (bug 2026-07-20).
    ///
    /// Ne porte QUE l'image et la vidéo : un son ou un document n'a pas de place
    /// de FOND sur un canvas, et la qualification réel qui les concerne se règle
    /// en amont, côté hôte.
    /// **`intoSlideId` — poser sur une slide DÉSIGNÉE plutôt que la courante.**
    /// Le modèle (§ 3, `docs/product/meeshy-composer-modele.md`) dit qu'en profil
    /// Post **une slide EST un média du post** : l'hôte crée donc une slide par
    /// média et vise son id. Sans ce paramètre, tout atterrissait sur la slide
    /// COURANTE et un post à trois photos n'aurait jamais eu qu'une slide — une
    /// scène composée, ce qui est un AUTRE objet produit.
    ///
    /// Paramètre OPAQUE : le SDK ne sait pas pourquoi l'hôte vise cette slide-là.
    /// « Une slide par média en Post, une seule en Réel » est une décision
    /// produit, donc app-side. Optionnel ⇒ les sites de bascule de mode, qui
    /// posent bien sur la slide courante, ne changent pas d'un caractère.
    /// - Returns: `sourceURL → objectId`, pour les médias RÉELLEMENT posés sur
    ///   la scène.
    ///
    ///   **Cette valeur de retour est ce qui manquait au texte alternatif d'un
    ///   post** (2026-09-05). Cette fonction est le SEUL site qui connaisse les
    ///   deux bouts : elle frappe l'`objectId`, copie `item.sourceURL` vers
    ///   `tmp/<objectId>.<ext>` — et jetait la correspondance.
    ///   `carriedContentSources` garde les sources en Set, jamais en carte.
    ///
    ///   L'appelant, lui, a besoin exactement de ce lien : il tient les alts
    ///   par identifiant d'OBJET (c'est ce que l'éditeur de scène édite) et le
    ///   publieur durable travaille par POSITION dans `localMedia`, c'est-à-dire
    ///   par URL SOURCE.
    ///
    ///   > **Reconstruire ce lien par l'ORDRE aurait tenu jusqu'au premier
    ///   > refus.** Trois `continue` vivent dans cette boucle — image non
    ///   > décodable, copie ratée, insertion refusée — et #4879 les a rendus
    ///   > bruyants précisément parce qu'ils arrivent. Une correspondance par
    ///   > position se décalerait alors en silence, sur le chemin même dont on
    ///   > venait de rendre les échecs visibles : l'alt d'une photo se
    ///   > retrouverait sous la suivante.
    ///
    ///   Les entrées DÉJÀ portées (`carriedContentSources`) n'y figurent pas :
    ///   la boucle les saute, et cette fonction ne rend que ce qu'elle vient de
    ///   poser. L'appelant ACCUMULE — c'est lui qui tient la mémoire du
    ///   brouillon, pas le modèle de scène.
    @discardableResult
    func applyContentMedia(
        _ items: [ComposerContentMedia],
        intoSlideId targetSlideId: String? = nil
    ) -> [URL: String] {
        var objetParSource: [URL: String] = [:]
        let slideId = targetSlideId ?? currentSlide.id
        // **Chaque refus se DIT** (#4879). Cette fonction portait quatre
        // `continue` muets — décodage impossible, copie ratée, insertion
        // refusée — sur le chemin par lequel TOUT média rejoint une scène. Un
        // média correctement ingéré pouvait donc disparaître entre la
        // photothèque et le canvas sans laisser une ligne.
        //
        // > Quand aucune des deux erreurs n'a de réparateur, il ne faut pas
        // > choisir — il faut CRÉER le réparateur. Ici il coûte quatre lignes,
        // > et il est le seul moyen d'attribuer un canvas resté noir.
        let journal = os.Logger(subsystem: "me.meeshy.app", category: "media")
        for item in items where !carriedContentSources.contains(item.sourceURL) {
            let objectId = UUID().uuidString
            switch item.kind {
            case .image:
                guard let image = UIImage(contentsOfFile: item.sourceURL.path) else {
                    journal.error(
                        "applyContentMedia: image NON DÉCODABLE, ignorée — \(item.sourceURL.lastPathComponent, privacy: .public) mime=\(item.mimeType ?? "nil", privacy: .public)"
                    )
                    continue
                }
                let ext = ComposerContentMediaFile.fileExtension(
                    sourceURL: item.sourceURL,
                    declaredMimeType: item.mimeType,
                    fallback: "jpg"
                )
                let destination = FileManager.default.temporaryDirectory
                    .appendingPathComponent("\(objectId).\(ext)")
                try? FileManager.default.removeItem(at: destination)
                guard (try? FileManager.default.copyItem(at: item.sourceURL, to: destination)) != nil else {
                    journal.error(
                        "applyContentMedia: COPIE ratée, image ignorée — \(item.sourceURL.lastPathComponent, privacy: .public)"
                    )
                    continue
                }
                guard insertForegroundImage(image, fileURL: destination,
                                            intoSlideId: slideId, objectId: objectId) != nil else {
                    journal.error(
                        "applyContentMedia: INSERTION refusée pour l'image — slide=\(slideId, privacy: .public)"
                    )
                    continue
                }
                carriedContentSources.insert(item.sourceURL)
                objetParSource[item.sourceURL] = objectId

            case .video:
                guard let copied = StoryComposerSeedFile.copyForComposer(
                        source: item.sourceURL, objectId: objectId,
                        declaredMimeType: item.mimeType) else {
                    journal.error(
                        "applyContentMedia: COPIE ratée, vidéo ignorée — \(item.sourceURL.lastPathComponent, privacy: .public)"
                    )
                    continue
                }
                let duration = item.durationMs.map { Float($0) / 1000 }
                guard insertForegroundVideo(
                        url: copied, thumbnail: nil, aspectRatio: nil,
                        duration: duration, intoSlideId: slideId, objectId: objectId) != nil
                else {
                    journal.error(
                        "applyContentMedia: INSERTION refusée pour la vidéo — slide=\(slideId, privacy: .public)"
                    )
                    continue
                }
                carriedContentSources.insert(item.sourceURL)
                objetParSource[item.sourceURL] = objectId

            case .audio:
                // Le son ne passe PAS par ce canal : il n'a pas de place de fond
                // VISUEL, et `insertForegroundImage`/`insertForegroundVideo` ne
                // savent poser que des médias visuels. Son emplacement est le
                // TROISIÈME (#4052) — `applyContentAudio` ci-dessous. Écrit en
                // toutes lettres plutôt qu'avalé par un `default` : le jour où un
                // quatrième `Kind` naîtra, la compilation le dira ici.
                continue
            }
        }
        return objetParSource
    }

    /// **Porter un SON sur la scène (#4052) — le troisième emplacement.**
    ///
    /// Jumeau d'`applyContentMedia`, et séparé de lui pour la raison que le SDK
    /// donnait déjà en refusant l'audio : un son n'a pas de place de fond
    /// VISUEL. Il en a une TROISIÈME, à côté du fond et des premiers plans, et
    /// c'est celle-là que ce canal sert.
    ///
    /// **Il pose sur la slide COURANTE**, sans jamais en créer une. C'est ce qui
    /// le distingue du média en profil Post, où chaque fichier ouvre sa propre
    /// slide : un son n'est pas une page du carrousel, c'est la bande-son de la
    /// scène que l'auteur regarde.
    ///
    /// **Il ne COPIE pas le fichier**, à la différence du média : la convention
    /// « `obj.id` == nom du fichier temp » sert à relier un BITMAP à son
    /// `composerKey`, et un son n'a pas de bitmap — `loadedAudioURLs[obj.id]`
    /// l'indexe directement. C'est exactement ce que fait déjà le chemin de
    /// l'atelier (`addVocalToForeground`).
    ///
    /// IDEMPOTENT par la même mémoire que son jumeau : une bascule de mode
    /// aller-retour ne pose pas deux fois le même vocal.
    func applyContentAudio(_ items: [ComposerContentMedia]) {
        for item in items where item.kind == .audio && !carriedContentSources.contains(item.sourceURL) {
            guard FileManager.default.fileExists(atPath: item.sourceURL.path),
                  let obj = addAudioObject() else { continue }
            loadedAudioURLs[obj.id] = item.sourceURL
            carriedContentSources.insert(item.sourceURL)

            if let durationMs = item.durationMs, durationMs > 0 {
                applyAudioDuration(Float(durationMs) / 1000, to: obj.id)
            }
            // La forme d'onde est COSMÉTIQUE et son analyse est asynchrone — la
            // pose ne l'attend pas, exactement comme le chemin de l'atelier, qui
            // retombe sur des barres plates quand elle échoue.
            let url = item.sourceURL
            let objectId = obj.id
            Task { @MainActor [weak self] in
                guard let samples = try? await WaveformCache.shared.samples(from: url) else { return }
                self?.applyAudioWaveform(samples, to: objectId)
            }
        }
    }

    private func applyAudioDuration(_ seconds: Float, to objectId: String) {
        var effects = currentEffects
        guard let index = effects.audioPlayerObjects?.firstIndex(where: { $0.id == objectId }) else { return }
        effects.audioPlayerObjects?[index].duration = seconds
        currentEffects = effects
    }

    private func applyAudioWaveform(_ samples: [Float], to objectId: String) {
        var effects = currentEffects
        guard let index = effects.audioPlayerObjects?.firstIndex(where: { $0.id == objectId }) else { return }
        effects.audioPlayerObjects?[index].waveformSamples = samples
        currentEffects = effects
    }
}

public extension StoryComposerViewModel {

    /// **Poser le rôle de mixage d'un son de la scène (#4483).**
    ///
    /// Deux invariants, et le second n'est pas celui qu'on croit.
    ///
    /// ## Un seul fond par slide
    ///
    /// Promouvoir un son RÉTROGRADE celui qui l'était — il ne disparaît pas, il
    /// redevient un objet parmi les autres. `backgroundAudioId` (le champ
    /// legacy) n'est PAS touché : `resolvedBackgroundAudio` élit d'abord un
    /// objet `isBackground == true`, donc le legacy est déjà éclipsé. Le nuller
    /// SUPPRIMERAIT une bande-son que l'auteur n'a pas demandé d'effacer.
    ///
    /// ## `false` n'est pas `nil`, et ici la nuance décide
    ///
    /// Sur `StoryAudioPlayerObject`, `nil` et `false` disent tous deux « pas en
    /// fond » — sauf pour `resolvedBackgroundAudio`, qui ne consulte le fond
    /// legacy QUE si **tous** les objets sont à `nil` (« l'auteur n'a rien
    /// dit »). Rétrograder vers `nil` ferait donc REVIVRE un ancien fond que
    /// personne n'a redemandé.
    ///
    /// D'où la règle : on écrit `false` — « l'auteur a parlé » — et seulement
    /// quand l'objet était EFFECTIVEMENT le fond. Choisir « premier plan » sur
    /// un son qui l'est déjà ne doit rien changer : écrire `false` là
    /// éteindrait le legacy d'une slide qui s'en sert, sans que l'auteur ait
    /// touché à ce son-là.
    ///
    /// L'historique suit tout seul : `currentEffects` est publié, et le
    /// `historyTrigger` débouncé enregistre l'instantané.
    func setAudioRole(id: String, role: ComposerAudioRole) {
        var effects = currentEffects
        guard var audios = effects.audioPlayerObjects,
              let cible = audios.firstIndex(where: { $0.id == id }) else { return }

        switch role {
        case .background:
            for autre in audios.indices where autre != cible && audios[autre].isBackground == true {
                audios[autre].isBackground = false
            }
            audios[cible].isBackground = true
        case .foreground:
            guard audios[cible].isBackground == true else { return }
            audios[cible].isBackground = false
        }

        effects.audioPlayerObjects = audios
        currentEffects = effects
    }

    /// Le rôle ACTUEL d'un son — ce que le sélecteur doit montrer coché.
    func audioRole(id: String) -> ComposerAudioRole {
        let audio = (currentEffects.audioPlayerObjects ?? []).first { $0.id == id }
        return audio?.isBackground == true ? .background : .foreground
    }
}

// MARK: - Rogner la source d'un objet (#4082)

public extension StoryComposerViewModel {

    /// **Écrire une fenêtre de source sur l'objet sélectionné.**
    ///
    /// UN seul site écrit les trois champs, et c'est `MediaTrimRule.fields` qui
    /// les rend ensemble : `sourceStart`/`sourceEnd` disent où lire dans le
    /// fichier, `duration` combien de temps l'objet occupe la slide. Écrire les
    /// deux premiers sans le troisième laisserait `contentDerivedDuration`
    /// compter l'ancienne longueur — la story attendrait dans le vide après la
    /// fin du clip rogné, sans que rien n'ait l'air faux.
    ///
    /// **Rien n'est ré-encodé.** Le fichier source reste celui que l'auteur a
    /// posé : la doctrine de publication d'une story veut que le serveur
    /// reçoive la source d'origine et les objets qui la décrivent, jamais un
    /// composite. C'est ce qui sépare cette écriture des trois éditeurs de
    /// média du dépôt, qui cuisent un nouveau fichier au confirm.
    func setSourceTrim(id: String, bounds: MediaTrimBounds, sourceDuration: Double) {
        let champs = MediaTrimRule.fields(for: bounds, sourceDuration: sourceDuration)
        var effets = currentEffects

        if let index = effets.mediaObjects?.firstIndex(where: { $0.id == id }) {
            effets.mediaObjects?[index].sourceStart = champs.start
            effets.mediaObjects?[index].sourceEnd = champs.end
            effets.mediaObjects?[index].duration = champs.duration
            currentEffects = effets
            return
        }
        guard let index = effets.audioPlayerObjects?.firstIndex(where: { $0.id == id }) else { return }
        effets.audioPlayerObjects?[index].sourceStart = champs.start
        effets.audioPlayerObjects?[index].sourceEnd = champs.end
        effets.audioPlayerObjects?[index].duration = Float(champs.duration)
        currentEffects = effets
    }

    /// La fenêtre COURANTE d'un objet, et la source sur laquelle elle se lit.
    ///
    /// `nil` quand l'objet n'a pas de source à rogner — c'est le même verdict
    /// que `StorySceneObjectPredicates.hasTrimmableSource`, rendu ici avec la
    /// matière plutôt qu'avec un booléen : l'hôte a besoin de l'URL, de la
    /// durée et des bornes, et les redemander une à une multiplierait les
    /// occasions de les désaccorder.
    ///
    /// **`sourceDuration` est une ESTIMATION, et l'hôte doit la remplacer par la
    /// mesure du fichier.** Une vidéo porte `intrinsicDuration`, la durée native
    /// de l'asset, qui survit au rognage ; un son n'a pas ce champ, et sa
    /// `duration` DEVIENT celle de la fenêtre dès le premier rognage. Rouvrir la
    /// bande sur cette valeur montrerait une source rétrécie, et la queue coupée
    /// deviendrait irrécupérable — un rognage qui ne se défait pas n'est pas un
    /// rognage. Le repli composé ici (`sourceEnd`, sinon début + fenêtre) est le
    /// meilleur MINORANT tiré du modèle ; seul `AVURLAsset` dit la vérité, et
    /// c'est une mesure asynchrone qui n'a pas sa place dans un accesseur.
    func sourceTrim(id: String) -> (url: URL, bounds: MediaTrimBounds, sourceDuration: Double, isVideo: Bool)? {
        if let media = currentEffects.mediaObjects?.first(where: { $0.id == id }),
           media.kind == .video,
           let url = loadedVideoURLs[id] {
            let duree = media.intrinsicDuration ?? media.duration ?? 0
            return (url, media.trimBounds(sourceDuration: duree), duree, true)
        }
        guard let audio = currentEffects.audioPlayerObjects?.first(where: { $0.id == id }),
              let url = loadedAudioURLs[id] else { return nil }
        let fenetre = Double(audio.duration ?? 0)
        let duree = max(audio.sourceEnd ?? 0, (audio.sourceStart ?? 0) + fenetre)
        return (url, audio.trimBounds(sourceDuration: duree), duree, false)
    }
}

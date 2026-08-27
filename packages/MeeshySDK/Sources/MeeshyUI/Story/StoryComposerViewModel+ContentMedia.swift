import SwiftUI
import UIKit
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

    public enum Kind: Sendable, Equatable { case image, video }

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
    func applyContentMedia(_ items: [ComposerContentMedia], intoSlideId targetSlideId: String? = nil) {
        let slideId = targetSlideId ?? currentSlide.id
        for item in items where !carriedContentSources.contains(item.sourceURL) {
            let objectId = UUID().uuidString
            switch item.kind {
            case .image:
                guard let image = UIImage(contentsOfFile: item.sourceURL.path) else { continue }
                let ext = ComposerContentMediaFile.fileExtension(
                    sourceURL: item.sourceURL,
                    declaredMimeType: item.mimeType,
                    fallback: "jpg"
                )
                let destination = FileManager.default.temporaryDirectory
                    .appendingPathComponent("\(objectId).\(ext)")
                try? FileManager.default.removeItem(at: destination)
                guard (try? FileManager.default.copyItem(at: item.sourceURL, to: destination)) != nil,
                      insertForegroundImage(
                        image, fileURL: destination,
                        intoSlideId: slideId, objectId: objectId) != nil
                else { continue }
                carriedContentSources.insert(item.sourceURL)

            case .video:
                guard let copied = StoryComposerSeedFile.copyForComposer(
                        source: item.sourceURL, objectId: objectId,
                        declaredMimeType: item.mimeType) else { continue }
                let duration = item.durationMs.map { Float($0) / 1000 }
                guard insertForegroundVideo(
                        url: copied, thumbnail: nil, aspectRatio: nil,
                        duration: duration, intoSlideId: slideId, objectId: objectId) != nil
                else { continue }
                carriedContentSources.insert(item.sourceURL)
            }
        }
    }
}

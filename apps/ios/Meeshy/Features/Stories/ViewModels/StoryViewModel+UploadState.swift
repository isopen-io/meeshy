/// Ligne de la file locale des publications en cours (`activeUploads`) :
/// l'état qu'une publication traîne de son hand-off à son succès, son
/// annulation ou son rejet.
///
/// Extrait de `StoryViewModel+Publication.swift` — type imbriqué à
/// l'identique (`StoryViewModel.StoryUploadState`).

import Foundation
import UIKit
import MeeshySDK
import MeeshyUI

extension StoryViewModel {
    struct StoryUploadState: Identifiable {
        let id: String
        let thumbnailImage: UIImage
        /// E5 — id de l'item write-ahead dans `StoryPublishQueue` (et le
        /// tempStoryId de son dossier médias) : retiré au succès/cancel ;
        /// un kill le laisse en queue → repris au boot.
        var queueId: String?
        var queueTempStoryId: String?
        /// Brouillon d'origine (directive 2026-08-02) : gelé au hand-off, il
        /// n'est supprimé qu'au SUCCÈS serveur confirmé ; l'annulation le
        /// dégèle, l'échec permanent le ramène éditable avec son erreur.
        var draftId: String?
        /// Republication d'une story d'autrui : id de l'ORIGINAL, transporté
        /// jusqu'à `createStory` pour que la copie porte son attribution et
        /// crédite ses vues. `nil` pour une publication nominale.
        var repostOfId: String?
        /// E5 — le VM détient-il la revendication de son item en queue ?
        /// Posée au write-ahead, CONSERVÉE à l'échec dès qu'une slide est
        /// commise (`releaseQueueClaimIfNothingCommitted`). Un retry ne doit
        /// re-revendiquer que s'il l'a relâchée : sinon `markInFlight`
        /// refuserait sa PROPRE revendication et la ligne resterait en
        /// `.queued`, hors de portée du drain comme du geste « Réessayer ».
        var ownsQueueClaim: Bool = false
        var phase: UploadPhase

        let authorId: String
        let authorName: String
        let authorAvatar: String?

        /// Variable pour recevoir les slides ENRICHIES (thumbHashes calculés en
        /// aval du hand-off) avant que l'upload ne démarre.
        var slides: [StorySlide]
        let slideImages: [String: UIImage]
        let loadedImages: [String: UIImage]
        let loadedVideoURLs: [String: URL]
        let loadedAudioURLs: [String: URL]
        /// **Les octets ANIMÉS des stickers collés, keyés par id d'élément**
        /// (#3956) — vide pour toute publication sans GIF.
        ///
        /// `loadedImages` n'en porte que la PREMIÈRE image ; téléverser
        /// celle-ci publierait un sticker figé après l'avoir composé animé —
        /// l'aperçu aurait dit vrai et la publication, non.
        var loadedStickerAnimations: [String: Data] = [:]
        let originalLanguage: String?
        let visibility: String
        let visibilityUserIds: [String]
        /// Les personnes que l'auteur a DÉCLARÉES, avec leur mode — ce que la
        /// publication envoie au lieu de deviner les `@handle` des objets
        /// texte. Vide = aucune référence hors texte ; le serveur relit le
        /// texte lui-même.
        var declaredMentions: [PostMentionInput] = []
        /// **Les mentions PAR SLIDE** (#4068, porteur 2026-09-03).
        ///
        /// > Une mention est attachée à la publication. En Story, une
        /// > publication est une slide ; en Post et en Réel, il n'y en a qu'une.
        ///
        /// `declaredMentions` ci-dessus est composer-wide, et la boucle
        /// d'envoi le semait sur CHAQUE slide : une NOTE posée en pensant à la
        /// première notifiait trois fois. Vide ⇒ repli sur la liste plate,
        /// c'est-à-dire sur l'ancien comportement — le cas nominal des formats
        /// à publication unique.
        var mentionsBySlide: [String: [PostMentionInput]] = [:]
        /// Les DEUX textes saisis par l'auteur — texte alternatif et LÉGENDE
        /// (#4055) —, keyés par ID D'ÉLÉMENT DU COMPOSER. La traduction vers
        /// les ids `PostMedia` n'est possible qu'après l'upload, qui les
        /// attribue — `runStoryUpload` la fait juste avant l'envoi
        /// (`StoryMediaTextMapping.serverKeyed`).
        ///
        /// Un porteur NOMMÉ plutôt que deux dictionnaires voisins : cf.
        /// `ComposerMediaTexts`, dont le doc dit pourquoi l'ordre positionnel
        /// ne doit pas être ce qui les distingue.
        var composerMediaTexts: ComposerMediaTexts = .none
        /// L'opt-in d'extraction de bande-son du post. `nil` = l'auteur n'a rien
        /// tranché : le défaut serveur s'applique par silence.
        var allowSoundExtraction: Bool? = nil
        /// Le FORMAT choisi dans le composer (V3-3), porté jusqu'à l'envoi.
        /// `.story` par défaut : toute surface qui n'offre pas d'éventail
        /// publie exactement ce qu'elle publiait.
        var targetType: PostType = .story
        /// « Publier AUSSI en réel » (#9476) — le réel part avec la story, sur
        /// ses propres médias copiés par le serveur. `false` = la story seule.
        var alsoAsReel: Bool = false
        /// IDs of slide-Posts already created server-side. Tracked so that:
        /// (a) `retryUpload()` skips them (otherwise a partial-failure retry creates
        ///     duplicate slides — what was previously committed plus the same again),
        /// (b) `cancelUpload()` can DELETE them (otherwise a 5-slide story that
        ///     fails at slide 3 leaves slides 1-2 visible to friends as orphans).
        var publishedPostIds: [String] = []

        enum UploadPhase: Sendable, Equatable {
            /// L'entrée existe pour l'UI mais son intent n'est pas encore
            /// durable : write-ahead et enrichissement thumbHash en cours. La
            /// drainer publierait des slides sans thumbHash, sans revendication
            /// et sans `queueId` (l'intent survivrait alors au succès et serait
            /// republié au boot). JAMAIS drainable.
            case preparing
            /// Persistée, revendiquée, enrichie — en attente de son tour.
            case queued
            case uploading
            case publishing
            case failed(String)
        }
    }
}

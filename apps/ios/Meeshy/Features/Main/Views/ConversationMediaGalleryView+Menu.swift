import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le menu ⋯ du couloir haut
//
// Extrait de `ConversationMediaGalleryView.swift` (#6145), qui était à 989
// lignes sur un plafond DUR de 1 200 : le menu et ses deux transports ne s'y
// ajoutaient pas sans consommer la marge que #6141 venait déjà d'entamer. La
// découpe suit la règle des frères précédents — une responsabilité par fichier.
//
// Deux gardes ancrées sur le FICHIER racine suivent ce code dans le même
// commit, parce qu'une découpe éteint en silence ce qui s'ancre sur un chemin
// (leçon 578) :
//   • `FixedFontSizeGuardTests.bearingFiles` — le glyphe figé du couloir
//     déménage, la POPULATION ne bouge pas (relocalisation pure, plafonds
//     inchangés) ;
//   • `LocalizationConsistencyTests.fullyLocalizedScreens` — les clés neuves du
//     menu doivent rester tenues par le cliquet qui épingle l'écran.

// MARK: - Ce que cette page-ci sait enregistrer

/// **Une page porte une ŒUVRE ou une PIÈCE, jamais les deux** (#7052).
///
/// Le menu pose cette question UNE fois, et trois lecteurs la lisent : son
/// MONTAGE (pas de sujet ⇒ pas de menu, loi 4), le TRANSPORT d'« Enregistrer »,
/// et la NOTE de marque. Trois résolutions parallèles divergeraient, et l'une
/// d'elles le prouve déjà : `brandingNote`, adossée à `currentSaveRequest`
/// seule, rendait `""` — un verbe sans sous-titre — dès que le menu se montait
/// sur une surface que cette requête ne décrit pas.
enum GallerySaveSubject {

    /// **Une SCÈNE de post.** Rien d'enregistrable ne vit sur sa pièce jointe
    /// (#6709 : elle est synthétique, sa seule URL est la vignette de son
    /// média — l'écrire sortirait un fond sans le texte ni les stickers de
    /// l'auteur). Ce qui s'enregistre est l'œuvre BAKÉE, par la chaîne d'export
    /// de story, sans prélude ni outro (`StoryPhotoSaveService.save(scene:)`).
    case scene(GallerySceneItem)

    /// **Une pièce TRANSMISE** : le fichier tel qu'il est arrivé, par le
    /// composant unifié d'enregistrement.
    case media(MediaSaveRequest)

    /// Ce que le prédicat de la marque interroge — l'origine d'abord, la
    /// famille ensuite (`MeeshyMediaSaveBranding.stamps`). Une scène est une
    /// œuvre composée chez nous et sort en MP4 : le bake y grave
    /// `MeeshyExportWatermark`, que `appendsBrandOutro: false` ne retire pas —
    /// il ne retire que la CARTE DE FIN.
    var branding: (origin: MediaOrigin, kind: AttachmentKind) {
        switch self {
        case .scene: return (.composed, .video)
        case .media(let request): return (request.origin, request.kind)
        }
    }

    /// **« Partager hors de Meeshy » ne s'offre QUE sur une pièce**, et c'est
    /// une décision, pas un oubli. Ce verbe va DROIT à la share sheet système
    /// avec l'URL de la requête ; sur une page scène cette URL est la vignette
    /// du média, donc le partage sortirait exactement le fichier que #6709 a
    /// retiré du menu. Un partage HONNÊTE d'une scène demanderait d'attendre
    /// son bake, comme la sheet d'export d'une story — un autre lot. Tant
    /// qu'il n'existe pas, offrir le verbe serait un contrôle inerte (loi 4).
    var offersExternalShare: Bool {
        if case .media = self { return true }
        return false
    }
}

extension ConversationMediaGalleryView {

    /// **Le sujet de cette page**, lu une fois pour les trois. La scène d'abord :
    /// elle se lit sur `sceneContext`, jamais sur le MIME (#6709), et c'est ce
    /// même contexte qui rend `currentSaveRequest` nulle sur cette surface.
    var currentSaveSubject: GallerySaveSubject? {
        if let scene = currentScene { return .scene(scene) }
        return currentSaveRequest.map(GallerySaveSubject.media)
    }

    /// **Le menu ⋯ — ce que la page sait faire, et ce que chacun fera dit sous
    /// lui.**
    ///
    /// Il remplace le bouton d'enregistrement direct (directive porteur : « plutôt
    /// un menu hamburger … vertical », avec l'option de partager hors de
    /// l'application). Un second verbe n'avait aucune place où se poser dans un
    /// couloir de 56 pt sans l'encombrer ; le menu en porte deux sans rien
    /// prendre à la scène.
    ///
    /// **Il n'y a pas d'entrée « Enregistrer sans la marque », et c'est une
    /// conséquence, pas un oubli.** La marque ne se choisit plus : elle se
    /// déduit de l'ORIGINE du média (#6146, `MeeshyMediaSaveBranding.stamps`),
    /// et un média de conversation est toujours `.transmitted` — donc jamais
    /// marqué. Offrir le choix ici serait un contrôle sans effet, ce que la loi
    /// 4 de la planche interdit.
    ///
    /// **Aucune entrée n'est listée sans chemin.** Sur une PIÈCE, les deux
    /// passent par le composant unifié `mediaSaveFlow` : « Enregistrer » ouvre
    /// sa sheet de destinations, « Partager hors de Meeshy » va droit à sa
    /// destination `.share`, qui stage une copie lisible puis présente la share
    /// sheet système. Rien n'est réécrit — le second verbe n'est qu'un raccourci
    /// vers une destination que le flux savait déjà servir. Sur une SCÈNE,
    /// « Enregistrer » part sur la chaîne d'export de story (#7052) et le second
    /// verbe n'est pas listé : voir `requestSaveCurrent()` et
    /// `GallerySaveSubject.offersExternalShare`.
    ///
    /// **Une page SCÈNE le monte depuis #7052**, et le second verbe s'y retire.
    /// Le menu n'a jamais porté « deux verbes » comme une propriété : il porte
    /// ce que la page sait TENIR (`GallerySaveSubject.offersExternalShare`).
    /// Une scène sait s'enregistrer — l'œuvre bakée, sans prélude ni outro —
    /// et ne sait pas encore se partager.
    @ViewBuilder
    var overflowMenu: some View {
        if let subject = currentSaveSubject {
            Menu {
                Button {
                    requestSaveCurrent()
                } label: {
                    // Trois vues dans le label d'une entrée de menu : titre,
                    // SOUS-TITRE, glyphe. C'est le seul emplacement où la note
                    // de marque peut vivre sous son verbe plutôt qu'à côté.
                    Text(saveVerb)
                    Text(brandingNote)
                    Image(systemName: "arrow.down.to.line")
                }
                .accessibilityLabel(saveVerb)
                .accessibilityHint(brandingNote)

                if subject.offersExternalShare {
                    Button {
                        shareCurrentOutsideMeeshy()
                    } label: {
                        Label(shareVerb, systemImage: "square.and.arrow.up")
                    }
                    .accessibilityLabel(shareVerb)
                }
            } label: {
                overflowGlyph
            }
            .disabled(saveCoordinator.isProcessing)
            .accessibilityLabel(
                String(localized: "gallery.menu.more", defaultValue: "Autres actions", bundle: .main))
            .accessibilityValue(saveStateAccessibilityValue)
            // Le flux vit DANS la présentation plein écran : une sheet attachée
            // sous un `fullScreenCover` ne se présente pas (SwiftUI iOS 16).
            .mediaSaveFlow(saveCoordinator)
        } else {
            Color.clear.frame(width: 44, height: 44)
        }
    }

    /// **L'ellipse VERTICALE, dans le même cercle glass 40 pt que la croix.**
    ///
    /// SF Symbols ne porte aucun glyphe d'ellipse verticale — `ellipsis` est
    /// horizontal, et `ellipsis.vertical` n'existe pas. On tourne donc celui
    /// qu'on a d'un quart de tour, plutôt que de dessiner trois points à la
    /// main : la rotation garde le poids, l'échelle optique et le rendu du
    /// symbole système.
    ///
    /// Le verre reste à 40 pt pour que le couloir n'ait pas deux grammaires ;
    /// la CIBLE, elle, vaut 44 pt — un cadre plus large posé autour, et un
    /// `contentShape` pour que la zone entière réponde. Sans lui, seuls les
    /// pixels dessinés seraient touchables et les 4 pt gagnés ne serviraient
    /// à rien.
    ///
    /// Chrome : glyphe figé dans un cadre fixe (doctrine 82i) — ne pas scaler.
    /// Une police relative ferait grossir le glyphe sans que le cercle suive.
    private var overflowGlyph: some View {
        Group {
            if saveCoordinator.isProcessing {
                ProgressView().tint(.white)
            } else {
                Image(systemName: "ellipsis")
                    .rotationEffect(.degrees(90))
            }
        }
        .font(.system(size: 18, weight: .semibold))
        .foregroundColor(.white.opacity(0.9))
        .frame(width: 40, height: 40)
        .adaptiveGlass(in: Circle(), interactive: true)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }

    // MARK: - Les deux transports

    /// **UN verbe, DEUX chemins — celui de la page décide** (#7052).
    ///
    /// Une pièce ouvre la sheet de destinations du composant unifié (Photos /
    /// Fichiers / Partager), inchangée depuis le bouton direct qu'elle servait.
    ///
    /// Une SCÈNE part sur la chaîne d'export de story — le MÊME bake, le même
    /// anneau, la même annulation, le même nettoyage du MP4 périmé — par
    /// `StoryPhotoSaveService.save(scene:)`, qui tient déjà « sans prélude ni
    /// outro ». Elle ne passe pas par le coordinateur, et ce n'est pas une
    /// exception qu'on s'autorise : le coordinateur enregistre un FICHIER
    /// DISTANT, et une œuvre composée n'en a aucun tant qu'elle n'est pas
    /// bakée.
    ///
    /// L'aiguillage vit ICI, dans le transport, plutôt qu'en amont dans le
    /// bouton : le menu ne porte qu'UN verbe « Enregistrer », et deux boutons
    /// qui promettent le même mot se mettraient à diverger sur le libellé, la
    /// note ou le haptique.
    ///
    /// **Pas d'anneau de progression sur ce ⋯, et c'est mesuré, pas oublié.**
    /// L'état d'un bake vit sur `StoryPhotoSaveService.jobs` ; l'observer
    /// depuis la galerie republierait la racine à chaque tour de progression,
    /// sous le doigt d'un pager qui doit tenir ses 60 images. Le retour
    /// immédiat est le haptique, la fin est le toast du service — comme sur la
    /// ligne « Mes stories » quand son anneau n'est pas à l'écran. Un second
    /// tap pendant le bake est ignoré par `bakeThenSave` (garde `jobs`).
    func requestSaveCurrent() {
        guard let subject = currentSaveSubject else { return }
        HapticFeedback.light()
        switch subject {
        case .scene(let scene):
            StoryPhotoSaveService.shared.save(scene: scene)
        case .media(let request):
            saveCoordinator.requestSave(request)
        }
    }

    /// Va DROIT à la share sheet système, sans passer par le choix de
    /// destination : c'est tout ce que « Partager hors de Meeshy » promet, et
    /// lui faire traverser une sheet intermédiaire trahirait le verbe.
    func shareCurrentOutsideMeeshy() {
        guard let request = currentSaveRequest else { return }
        HapticFeedback.light()
        Task { await saveCoordinator.pick(.share, request: request) }
    }

    /// **Un seul site compose la requête**, que les deux verbes partagent. Deux
    /// compositions parallèles divergeraient sur l'origine ou sur le nom de
    /// fichier, et le média sortirait différemment selon l'entrée choisie.
    var currentSaveRequest: MediaSaveRequest? {
        guard currentIndex < allAttachments.count else { return nil }
        let attachment = allAttachments[currentIndex]
        // **Une scène ne s'enregistre pas par ce menu** (#6709). Sa pièce est
        // SYNTHÉTIQUE : sa seule URL est la vignette de son média, et
        // l'enregistrer ferait sortir un fond sans le texte ni les stickers que
        // l'auteur a posés — l'œuvre composée n'est pas ce fichier. Sans
        // requête, le menu n'est pas monté (loi 4).
        guard sceneContext?.scenes[attachment.id] == nil else { return nil }
        let urlString = attachment.fileUrl.isEmpty
            ? (attachment.thumbnailUrl ?? "")
            : attachment.fileUrl
        guard !urlString.isEmpty else { return nil }
        return MediaSaveRequest(
            kind: attachment.type == .video ? .video : .image,
            // La galerie d'une CONVERSATION ne montre que du média transmis —
            // jamais une œuvre composée chez nous. L'origine se déclare, elle
            // ne se devine pas (`MediaOrigin`).
            origin: .transmitted,
            remoteURLString: urlString,
            suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
            attachmentId: attachment.id.isEmpty ? nil : attachment.id
        )
    }

    // MARK: - Ce que le menu DIT

    /// **Ce que l'enregistrement fera se LIT sur la règle, il ne se rédige pas.**
    ///
    /// La note vient du prédicat de la marque lui-même. Une phrase écrite à la
    /// main dirait ce que son auteur croyait le jour où il l'a tapée ; le jour
    /// où la règle change, les deux divergeraient sans que rien ne rougisse —
    /// et le menu affirmerait au lecteur le contraire de ce qui part sur son
    /// disque.
    ///
    /// **Elle se lit sur le SUJET, pas sur la requête** (#7052). Une page scène
    /// n'a pas de `MediaSaveRequest` — sa pièce est synthétique — et la note
    /// rendait donc `""` le jour où le menu s'y est monté : le verbe perdait
    /// son sous-titre sur la SEULE surface dont l'enregistrement porte
    /// réellement la marque.
    var brandingNote: String {
        guard let branding = currentSaveSubject?.branding else { return "" }
        return MeeshyMediaSaveBranding.stamps(origin: branding.origin, kind: branding.kind)
            ? String(localized: "gallery.menu.brand.meeshy",
                     defaultValue: "Œuvre composée — l'enregistrement porte la marque Meeshy.",
                     bundle: .main)
            : String(localized: "gallery.menu.brand.none",
                     defaultValue: "Média original — enregistré tel quel, sans marque.",
                     bundle: .main)
    }

    private var saveVerb: String {
        String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main)
    }

    private var shareVerb: String {
        String(localized: "gallery.menu.share",
               defaultValue: "Partager hors de Meeshy", bundle: .main)
    }

    /// Annonce VoiceOver de l'état d'enregistrement. Vide au repos — un lecteur
    /// d'écran qui énoncerait « au repos » à chaque survol serait bavard sans
    /// informer.
    var saveStateAccessibilityValue: String {
        saveCoordinator.isProcessing
            ? String(localized: "common.saving", defaultValue: "Enregistrement…", bundle: .main)
            : ""
    }
}

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

extension ConversationMediaGalleryView {

    /// **Le menu ⋯ — deux verbes, et ce que chacun fera dit sous lui.**
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
    /// **Aucune entrée n'est listée sans chemin.** Les deux passent par le
    /// composant unifié `mediaSaveFlow` : « Enregistrer » ouvre sa sheet de
    /// destinations, « Partager hors de Meeshy » va droit à sa destination
    /// `.share`, qui stage une copie lisible puis présente la share sheet
    /// système. Rien n'est réécrit — le second verbe n'est qu'un raccourci vers
    /// une destination que le flux savait déjà servir.
    @ViewBuilder
    var overflowMenu: some View {
        if currentSaveRequest != nil {
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

                Button {
                    shareCurrentOutsideMeeshy()
                } label: {
                    Label(shareVerb, systemImage: "square.and.arrow.up")
                }
                .accessibilityLabel(shareVerb)
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

    /// Ouvre la sheet de destinations du composant unifié (Photos / Fichiers /
    /// Partager), inchangée depuis le bouton direct qu'elle servait.
    func requestSaveCurrent() {
        guard let request = currentSaveRequest else { return }
        HapticFeedback.light()
        saveCoordinator.requestSave(request)
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
    var brandingNote: String {
        guard let request = currentSaveRequest else { return "" }
        return MeeshyMediaSaveBranding.stamps(origin: request.origin, kind: request.kind)
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

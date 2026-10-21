import Foundation

// MARK: - LE vocabulaire des actions d'un message (#11234)
//
// Trois menus offrent les actions d'un message : la liste de l'appui long
// (`MessageActionsMenu`), la feuille « Plus… » (`MessageMoreSheet`) et le menu
// système du double toucher (`MessageEditMenuAction.primaires`). Chacun tenait
// SA table de libellés et de symboles, et elles avaient divergé : « Éditer » au
// double toucher, « Modifier » ailleurs ; deux clés pour « Sélectionner », trois
// pour « Transférer ». Un acte a désormais UN verbe, et un verbe a UN libellé et
// UN symbole — les menus le lisent, aucun ne l'écrit.

/// Un acte sur un message, indépendamment du menu qui l'offre et de la cible
/// (le message entier ou l'une de ses pièces).
enum MessageActionVerb: CaseIterable {
    case reply, retry, forward, edit, select, compose, imager, exportQuick, create
    case translate, copy, saveMedia, more, callDetail, wholeMessage
    case delete, deleteMedia, share
    case addSticker, favoriteSticker, unfavoriteSticker
    case openLink, copyLink, openInMaps, copyAddress
    case thread, media, pin, unpin, star, unstar, pinSticker, unpinSticker
    case views, reactions, transcription, sentiment, history, report

    var label: String {
        switch self {
        case .reply: return String(localized: "action.reply", defaultValue: "Répondre", bundle: .main)
        case .retry: return String(localized: "bubble.retry.resend", defaultValue: "Renvoyer le message", bundle: .main)
        case .forward: return String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main)
        case .edit: return String(localized: "action.edit", defaultValue: "Modifier", bundle: .main)
        case .select: return String(localized: "action.select", defaultValue: "Sélectionner", bundle: .main)
        case .compose: return String(localized: "message.compose.title", defaultValue: "Composer", bundle: .main)
        case .imager: return MessageCardExportMenu.imageLabel
        case .exportQuick: return MessageCardExportMenu.quickLabel
        case .create: return MessageCardExportMenu.createLabel
        case .translate: return String(localized: "action.translate", defaultValue: "Traduire", bundle: .main)
        case .copy: return String(localized: "action.copy", defaultValue: "Copier", bundle: .main)
        case .saveMedia: return String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main)
        case .more: return String(localized: "action.more", defaultValue: "Plus…", bundle: .main)
        case .callDetail: return String(localized: "bubble.call.details.action", defaultValue: "Détails de l'appel", bundle: .main)
        case .wholeMessage: return String(localized: "message.piece.wholeMessage", defaultValue: "Tout le message", bundle: .main)
        case .delete: return String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main)
        case .deleteMedia: return String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main)
        case .share: return String(localized: "action.share", defaultValue: "Partager", bundle: .main)
        case .addSticker: return String(localized: "message.sticker.add", defaultValue: "Ajouter à mes stickers", bundle: .main)
        case .favoriteSticker: return StickerFavoriteCopy.add
        case .unfavoriteSticker: return StickerFavoriteCopy.remove
        case .openLink: return String(localized: "message.action.openLink", defaultValue: "Ouvrir le lien", bundle: .main)
        case .copyLink: return String(localized: "common.copyLink", defaultValue: "Copier le lien", bundle: .main)
        case .openInMaps: return String(localized: "message.action.openInMaps", defaultValue: "Ouvrir dans Plans", bundle: .main)
        case .copyAddress: return String(localized: "message.action.copyAddress", defaultValue: "Copier l'adresse", bundle: .main)
        case .thread: return String(localized: "action.thread", defaultValue: "Discussion", bundle: .main)
        case .media: return String(localized: "action.media", defaultValue: "Média", bundle: .main)
        case .pin: return String(localized: "action.pin", defaultValue: "Épingler", bundle: .main)
        case .unpin: return String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main)
        case .star: return String(localized: "action.favorite", defaultValue: "Favori", bundle: .main)
        case .unstar: return String(localized: "action.unfavorite", defaultValue: "Retirer le favori", bundle: .main)
        // Le libellé NOMME l'objet — « la décoration », pas « le favori » :
        // le message reste dans sa conversation, la décoration part dans la palette.
        case .pinSticker: return String(localized: "action.pinSticker", defaultValue: "Épingler la décoration", bundle: .main)
        case .unpinSticker: return String(localized: "action.unpinSticker", defaultValue: "Retirer la décoration", bundle: .main)
        case .views: return String(localized: "message-detail.tab.views", defaultValue: "Qui a vu", bundle: .main)
        case .reactions: return String(localized: "message-detail.tab.reactions", defaultValue: "Réactions", bundle: .main)
        case .transcription: return String(localized: "message-detail.tab.transcription", defaultValue: "Transcription", bundle: .main)
        case .sentiment: return String(localized: "message-detail.tab.sentiment", defaultValue: "Sentiment", bundle: .main)
        case .history: return String(localized: "message-detail.tab.history", defaultValue: "Historique", bundle: .main)
        case .report: return String(localized: "message-detail.tab.report", defaultValue: "Signaler", bundle: .main)
        }
    }

    /// Nom SF Symbol.
    var symbol: String {
        switch self {
        case .reply: return "arrowshape.turn.up.left"
        case .retry: return "arrow.clockwise"
        case .forward: return "arrowshape.turn.up.right"
        case .edit: return "pencil"
        case .select: return "checkmark.circle"
        case .compose: return "wand.and.stars"
        case .imager: return MessageCardExportMenu.imageSymbol
        case .exportQuick: return MessageCardExportMenu.quickSymbol
        case .create: return MessageCardExportMenu.createSymbol
        case .translate: return "globe"
        case .copy: return "doc.on.doc"
        case .saveMedia: return "arrow.down.to.line"
        case .more: return "ellipsis"
        case .callDetail: return "info.circle"
        case .wholeMessage: return "text.bubble"
        case .delete, .deleteMedia: return "trash"
        case .share: return "square.and.arrow.up"
        case .addSticker: return "plus.rectangle.on.rectangle"
        case .favoriteSticker: return "star"
        case .unfavoriteSticker: return "star.slash"
        case .openLink: return "safari"
        case .copyLink: return "link"
        case .openInMaps: return "map"
        case .copyAddress: return "mappin.and.ellipse"
        case .thread: return "bubble.left.and.bubble.right"
        case .media: return "paperclip.badge.ellipsis"
        case .pin: return "pin"
        case .unpin: return "pin.slash"
        case .star: return "star"
        case .unstar: return "star.slash"
        case .pinSticker: return "rectangle.portrait.on.rectangle.portrait.angled"
        case .unpinSticker: return "rectangle.portrait.slash"
        case .views: return "eye"
        case .reactions: return "face.smiling"
        case .transcription: return "waveform"
        case .sentiment: return "brain.head.profile"
        case .history: return "clock.arrow.circlepath"
        case .report: return "exclamationmark.triangle"
        }
    }

    /// La variante PLEINE du symbole, pour la barre rapide qui dessine des
    /// pastilles colorées — le même glyphe, jamais un autre.
    var filledSymbol: String { "\(symbol).fill" }
}

extension PrimaryAction {
    /// Le verbe de l'entrée — le même acte sur le message ou sur une pièce
    /// (répondre, transférer) est UN verbe.
    var verb: MessageActionVerb {
        switch self {
        case .edit: return .edit
        case .translate: return .translate
        case .copy: return .copy
        case .saveMedia: return .saveMedia
        case .more: return .more
        case .reply, .replyToPiece: return .reply
        case .retry: return .retry
        case .openLink: return .openLink
        case .copyLink: return .copyLink
        case .openInMaps: return .openInMaps
        case .copyAddress: return .copyAddress
        case .compose: return .compose
        case .callDetail: return .callDetail
        case .select: return .select
        case .exportImage: return .imager
        case .exportQuick: return .exportQuick
        case .wholeMessage: return .wholeMessage
        case .deletePiece: return .deleteMedia
        case .forwardPiece: return .forward
        case .addSticker: return .addSticker
        case .favoriteSticker: return .favoriteSticker
        case .unfavoriteSticker: return .unfavoriteSticker
        }
    }
}

extension MoreItem {
    /// Le verbe de l'entrée de « Plus… » — « Traduire » ouvre la vue Langue,
    /// et c'est le même acte que la primaire « Traduire ».
    var verb: MessageActionVerb {
        switch self {
        case .reply: return .reply
        case .forward: return .forward
        case .thread: return .thread
        case .media: return .media
        case .pin: return .pin
        case .unpin: return .unpin
        case .star: return .star
        case .unstar: return .unstar
        case .pinSticker: return .pinSticker
        case .unpinSticker: return .unpinSticker
        case .delete: return .delete
        case .edit: return .edit
        case .copy: return .copy
        case .share: return .share
        case .imager: return .imager
        case .language: return .translate
        case .views: return .views
        case .reactions: return .reactions
        case .transcription: return .transcription
        case .sentiment: return .sentiment
        case .history: return .history
        case .report: return .report
        }
    }
}

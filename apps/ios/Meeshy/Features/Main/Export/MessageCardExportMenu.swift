import Foundation
import MeeshySDK

/// Les entrées des menus qui mènent à l'atelier « Imagine » — libellés,
/// symboles et le fait qui ouvre « Export rapide ». Un seul site pour tous
/// leurs lecteurs : liste verticale, overlay, menu natif, menu du double tap,
/// feuille « Plus… » et menu d'un commentaire (#8692).
enum MessageCardExportMenu {

    static let imageSymbol = "photo.on.rectangle.angled"
    static let quickSymbol = "bolt"
    /// Le (>) du menu du double tap : il déplie « Composer » ET « Imager ».
    static let createSymbol = "wand.and.stars"

    /// « Imager » — directive porteur 2026-09-29 : l'action s'appelle ainsi
    /// partout ; l'atelier qu'elle ouvre est titré « Imagine ».
    static var imageLabel: String {
        String(localized: "message.menu.export", defaultValue: "Imager", bundle: .main)
    }

    static var quickLabel: String {
        String(localized: "message.menu.exportQuick", defaultValue: "Export rapide", bundle: .main)
    }

    static var createLabel: String {
        String(localized: "message.action.create", defaultValue: "Créer", bundle: .main)
    }

    /// Un format par défaut est-il enregistré sur l'appareil ? « Export rapide »
    /// n'existe qu'avec lui.
    static var hasDefaultFormat: Bool {
        MessageCardFormat.readDefault(from: UserDefaultsMessageCardStore()) != nil
    }

    /// **Un message devient une carte** (#8692) : le texte que le Prisme sert au lecteur, ou
    /// l'original, ses médias — et ceux du message cité quand il est en mémoire (#8901) — puis la
    /// carte de chaque langue où il existe. `nil` pour un message que rien ne peint. Site unique
    /// de la conversation et de la vitrine (#8855).
    ///
    /// Un son part dans sa piste SERVIE (#8979) : celle que la bulle fait entendre au lecteur
    /// (`audioPrism`, `audioOverride` — la bascule du drapeau), ou celle de la langue d'export.
    /// Le vocal CITÉ suit la même loi, avec la bascule de SON drapeau (`quotedAudioOverride`).
    static func request(message: Message, translations: [MessageTranslation], servedText: String?, viewer: MessageCardSubject.Viewer, handle: String?, quotedMessage: Message?, conversationTitle: String?, accentColor: String, quick: Bool,
                        audioPrism: [String] = [], audioOverride: String? = nil, quotedAudioOverride: String? = nil) -> MessageCardExportRequest? {
        let texts = Dictionary(translations.map { ($0.targetLanguage.lowercased(), $0.translatedContent) }, uniquingKeysWith: { first, _ in first })
        let quotedAt = quotedMessage?.createdAt
        let served: (String?) -> [String: String] = { language in
            servedAudioLanguages(of: message, quotedMessage: quotedMessage, exportLanguage: language,
                                 prism: audioPrism, override: audioOverride, quotedOverride: quotedAudioOverride)
        }
        guard let subject = MessageCardSubject.of(
            message: message, servedText: servedText, translations: texts, viewer: viewer,
            quotedAt: quotedAt, quotedMessage: quotedMessage,
            audioLanguages: served(nil),
            now: Date()
        ) else { return nil }
        return MessageCardExportRequest(
            subject: subject,
            languages: MessageCardSubject.languages(of: message, translations: texts),
            subjectIn: { language in
                MessageCardSubject.of(
                    message: message, servedText: servedText, translations: texts,
                    viewer: viewer, language: language, quotedAt: quotedAt, quotedMessage: quotedMessage,
                    audioLanguages: served(language),
                    now: Date()
                )
            },
            handle: handle,
            conversationTitle: conversationTitle,
            accentColor: accentColor,
            quick: quick
        )
    }

    /// **La piste SERVIE de chaque son de la carte** (#8979), par identifiant de
    /// pièce — la loi de la bulle (`AudioTrackLanguageResolver`) : une langue
    /// d'export désigne sa piste traduite (l'original sinon) ; « comme je le
    /// lis » rejoue la bascule du drapeau, puis le Prisme du lecteur. Un son
    /// absent de la table part dans son original.
    ///
    /// Le vocal CITÉ en fait partie (revue #8979) — une réponse texte à un
    /// vocal, c'est ce vocal que la carte fait entendre : en mémoire, avec la
    /// bascule de SON drapeau (`ConversationViewModel+QuotedAudio`) ; hors de
    /// la fenêtre, depuis les pistes que la citation porte, sur le seul Prisme.
    static func servedAudioLanguages(of message: Message, quotedMessage: Message? = nil, exportLanguage: String?,
                                     prism: [String], override: String?, quotedOverride: String? = nil) -> [String: String] {
        var served = servedTracks(of: message.attachments, originalLanguage: message.originalLanguage, override: exportLanguage ?? override, prism: prism)
        guard let reference = message.replyTo else { return served }
        if let quotedMessage, quotedMessage.id == reference.messageId {
            let quoted = servedTracks(of: quotedMessage.attachments, originalLanguage: quotedMessage.originalLanguage,
                                      override: exportLanguage ?? quotedOverride, prism: prism)
            return served.merging(quoted) { own, _ in own }
        }
        guard let attachment = reference.quotedAttachment, attachment.type == .audio,
              let tracks = reference.quotedAudioTracks, !tracks.urlsByLanguage.isEmpty,
              let language = AudioTrackLanguageResolver.resolve(
                  manualOverride: exportLanguage,
                  originalLanguage: tracks.originalLanguage ?? "",
                  preferredLanguages: prism,
                  availableLanguages: Array(tracks.urlsByLanguage.keys)
              ) else { return served }
        served[attachment.id] = served[attachment.id] ?? language
        return served
    }

    private static func servedTracks(of attachments: [MessageAttachment], originalLanguage: String, override: String?, prism: [String]) -> [String: String] {
        let served = attachments.compactMap { attachment -> (String, String)? in
            let available = (attachment.audioTranslations ?? [:])
                .filter { !$0.value.url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                .map(\.key)
            guard attachment.type == .audio, !available.isEmpty,
                  let language = AudioTrackLanguageResolver.resolve(
                      manualOverride: override,
                      originalLanguage: originalLanguage,
                      preferredLanguages: prism,
                      availableLanguages: available
                  ) else { return nil }
            return (attachment.id, language)
        }
        return Dictionary(served, uniquingKeysWith: { first, _ in first })
    }

    /// **Un commentaire devient une carte** : le texte que le lecteur a sous
    /// les yeux (`showOriginal` suit la puce de langue de la ligne), son auteur,
    /// ses médias. `nil` pour un commentaire protégé ou vide. Une réponse
    /// emporte sa racine (`quoting`) en citation — l'arbre de réponses (#8709).
    ///
    /// Son vocal part dans la piste que le Prisme du lecteur (`audioPrism`) sert — l'original
    /// quand la ligne montre l'original (#8979).
    static func request(comment: FeedComment, showOriginal: Bool, accentColor: String, viewer: MessageCardSubject.Viewer, handle: String?, quoting root: FeedComment? = nil,
                        audioPrism: [String] = []) -> MessageCardExportRequest? {
        let served = showOriginal ? [:] : servedAudioLanguages(of: comment, prism: audioPrism)
        guard let subject = MessageCardSubject.of(comment: comment, viewer: viewer, showOriginal: showOriginal, quoting: root, audioLanguages: served) else { return nil }
        return MessageCardExportRequest(
            subject: subject,
            languages: [],
            subjectIn: { _ in nil },
            handle: handle,
            conversationTitle: nil,
            accentColor: accentColor,
            quick: false
        )
    }

    /// La piste servie de chaque son d'un commentaire — même loi que celle d'un message.
    static func servedAudioLanguages(of comment: FeedComment, prism: [String]) -> [String: String] {
        let served = comment.media.compactMap { item -> (String, String)? in
            let available = item.translatedAudios.filter { !$0.url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.map(\.targetLanguage)
            guard item.type == .audio, !available.isEmpty,
                  let language = AudioTrackLanguageResolver.resolve(
                      originalLanguage: item.transcription?.language ?? comment.originalLanguage ?? "",
                      preferredLanguages: prism,
                      availableLanguages: available
                  ) else { return nil }
            return (item.id, language)
        }
        return Dictionary(served, uniquingKeysWith: { first, _ in first })
    }
}

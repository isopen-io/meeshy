import Foundation
import MeeshySDK

/// **SOURCE UNIQUE de l'étiquette humaine d'un média.**
///
/// Le dépôt portait la même arithmétique de libellés à **huit** endroits, sur
/// **deux** familles de clés au contenu identique (`attachment.kind.*` et
/// `attachment.label.*`), dont **deux** copies en français gravé — invisibles
/// pour `FrenchDefaultValueRatchetTests`, qui n'inspecte que les appels
/// `String(localized:defaultValue:)` : une chaîne française qui n'est jamais
/// devenue une clé ne franchit jamais son extracteur.
///
/// Deux REGISTRES, parce que deux surfaces différentes :
///
/// | registre | forme | où |
/// |---|---|---|
/// | ``name(_:bundle:locale:)`` | « Photo », « Vidéo » | une **icône** double déjà le texte (tuile, puce, bouton de défilement) |
/// | ``summary(_:bundle:locale:)`` | « 📷 Photo », « 🎥 Vidéo » | un **aperçu** seul en ligne (liste, citation, message épinglé) |
///
/// Un aperçu porte son emoji parce qu'aucune icône ne l'accompagne ; une
/// étiquette compacte ne le porte pas parce qu'elle en aurait deux.
///
/// `nonisolated` au niveau du type : la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests non.
nonisolated enum MediaKindLabel {

    /// Les cinq natures de média du dépôt — l'image EXACTE de
    /// `MessageAttachment.AttachmentType`, sans cas fourre-tout : un `default:`
    /// est ce qui a laissé une citation de lieu s'annoncer « 📎 Piece jointe »
    /// pendant que la même donnée, dans la liste, disait « 📍 Position ».
    enum Kind: String, CaseIterable, Sendable {
        case photo, video, audio, file, location
    }

    // MARK: - Registre COMPACT

    /// Étiquette NUE de la nature du média, pour une surface où une icône ou
    /// une vignette porte déjà le sens visuel.
    static func name(_ kind: Kind,
                     bundle: Bundle = .main,
                     locale: Locale = .current) -> String {
        switch kind {
        case .photo:
            return String(localized: "attachment.label.photo", defaultValue: "Photo", bundle: bundle, locale: locale)
        case .video:
            return String(localized: "attachment.label.video", defaultValue: "Vidéo", bundle: bundle, locale: locale)
        case .audio:
            return String(localized: "attachment.label.audio", defaultValue: "Audio", bundle: bundle, locale: locale)
        case .file:
            return String(localized: "attachment.label.file", defaultValue: "Fichier", bundle: bundle, locale: locale)
        case .location:
            return String(localized: "attachment.label.location", defaultValue: "Position", bundle: bundle, locale: locale)
        }
    }

    // MARK: - Registre APERÇU

    /// Étiquette PRÉFIXÉE de son emoji, pour un aperçu qui tient seul sur une
    /// ligne : ligne de la liste des conversations, carte de citation, message
    /// épinglé.
    ///
    /// `.audio` rend « 🎙️ Message vocal » et non « 🎵 Audio » : dans Meeshy un
    /// attachement audio EST un message vocal (le pipeline audio est un
    /// pipeline de voix — transcription puis synthèse). C'est déjà ce que
    /// disait la ligne de liste ; les deux copies de la citation disaient
    /// « 🎵 Message vocal », le même texte sous un autre emoji.
    static func summary(_ kind: Kind,
                        bundle: Bundle = .main,
                        locale: Locale = .current) -> String {
        switch kind {
        case .photo:
            return String(localized: "media.summary.photo", defaultValue: "📷 Photo", bundle: bundle, locale: locale)
        case .video:
            return String(localized: "media.summary.video", defaultValue: "🎥 Vidéo", bundle: bundle, locale: locale)
        case .audio:
            return String(localized: "media.summary.voice", defaultValue: "🎙️ Message vocal", bundle: bundle, locale: locale)
        case .file:
            return String(localized: "media.summary.file", defaultValue: "📎 Fichier", bundle: bundle, locale: locale)
        case .location:
            return String(localized: "media.summary.location", defaultValue: "📍 Position", bundle: bundle, locale: locale)
        }
    }

    // MARK: - Cas nommé : la puce d'un vocal fraîchement enregistré

    /// Nom porté par la puce du composeur pour un vocal qui vient d'être
    /// enregistré : « Message vocal (0:12) ».
    ///
    /// Registre à part — ni ``name(_:bundle:locale:)`` (« Audio » perd que
    /// c'est la VOIX de l'utilisateur qu'il s'apprête à envoyer), ni
    /// ``summary(_:bundle:locale:)`` (la puce porte déjà son glyphe d'onde).
    /// La durée passe par ``LocalizedNumber/duration(seconds:)`` : sans elle
    /// une interface arabe mêlait chiffres arabo-indiens et chiffres latins
    /// sur la même puce (247i).
    static func voiceRecording(duration: TimeInterval,
                               bundle: Bundle = .main,
                               locale: Locale = .current) -> String {
        let formatted = LocalizedNumber.duration(seconds: duration)
        return String(localized: "composer.attachment.voice",
                      defaultValue: "Message vocal (\(formatted))",
                      bundle: bundle,
                      locale: locale)
    }

    // MARK: - Étiquette d'une pièce jointe RÉELLE

    /// Étiquette de la puce d'une pièce jointe déjà constituée.
    ///
    /// Une pièce jointe préfère TOUJOURS son identité propre à son type : la
    /// durée pour un audio, le nom d'origine pour un fichier. Le libellé de
    /// type n'est que le repli quand cette identité manque — « Audio » plutôt
    /// qu'une puce muette.
    ///
    /// Cette règle vivait en DEUX copies rigoureusement identiques
    /// (`ConversationView+Composer.labelForAttachment`,
    /// `FeedView+Attachments.feedLabelForAttachment`), la seconde surmontée
    /// d'un commentaire qui la déclarait déjà « la même SSOT » que la première.
    /// Un commentaire ne fait pas d'une copie une source unique.
    static func attachmentLabel(for attachment: MessageAttachment,
                                bundle: Bundle = .main,
                                locale: Locale = .current) -> String {
        switch attachment.type {
        case .audio:
            return attachment.durationFormatted ?? name(.audio, bundle: bundle, locale: locale)
        case .file:
            return attachment.originalName.isEmpty
                ? name(.file, bundle: bundle, locale: locale)
                : attachment.originalName
        case .image, .video, .location:
            return name(kind(for: attachment.type), bundle: bundle, locale: locale)
        }
    }

    /// Étiquette de la puce d'un LIEU en attente d'envoi : son nom quand il en
    /// porte un, « Position » sinon. Six copies dans le dépôt, toutes écrites
    /// `place.name ?? String(localized: "attachment.label.location", …)`.
    ///
    /// Le `??` seul laissait passer la chaîne VIDE — un lieu au nom vide
    /// rendait une puce muette là où le repli existait ; `isEmpty` la ferme.
    static func placeLabel(_ placeName: String?,
                           bundle: Bundle = .main,
                           locale: Locale = .current) -> String {
        guard let placeName, !placeName.isEmpty else {
            return name(.location, bundle: bundle, locale: locale)
        }
        return placeName
    }

    // MARK: - Passerelles depuis les vocabulaires de type du dépôt

    /// Depuis le type d'une pièce jointe. Total par construction : les cinq
    /// cas de `AttachmentType` sont les cinq ``Kind``.
    static func kind(for type: MessageAttachment.AttachmentType) -> Kind {
        switch type {
        case .image: return .photo
        case .video: return .video
        case .audio: return .audio
        case .file: return .file
        case .location: return .location
        }
    }

    /// Depuis le type d'un message. Rend `nil` pour `.text`, qui n'est pas un
    /// média : c'est à l'appelant de dire ce qu'il affiche à la place, pas à
    /// cette table d'inventer un libellé.
    static func kind(for type: Message.MessageType) -> Kind? {
        switch type {
        case .image: return .photo
        case .video: return .video
        case .audio: return .audio
        case .file: return .file
        case .location: return .location
        case .text: return nil
        }
    }

    /// Depuis le vocabulaire SÉRIALISÉ (`"image"`, `"video"`, `"audio"`,
    /// `"file"`, `"location"`) que portent les instantanés persistés.
    /// Rend `nil` sur un jeton inconnu — jamais un libellé par défaut.
    static func kind(forAttachmentRawValue raw: String) -> Kind? {
        // Appel APPLIQUÉ, jamais `.map(kind(for:))` : `kind(for:)` est surchargé
        // sur deux types de départ, et une référence non appliquée l'expose à
        // une résolution ambiguë.
        guard let type = MessageAttachment.AttachmentType(rawValue: raw) else { return nil }
        return kind(for: type)
    }
}

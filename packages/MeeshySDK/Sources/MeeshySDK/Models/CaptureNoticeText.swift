import Foundation

/// **La phrase de l'avis de capture pour UN lecteur** (#9617) — sa langue,
/// son fuseau. Miroir de `captureNoticeText` / `captureNoticeFallbackText`
/// (`packages/shared/utils/capture-notice.ts`) : mêmes sept langues, mêmes
/// gabarits, langue hors catalogue ⇒ français, fuseau absent ou invalide ⇒ UTC.
/// L'heure dite est l'heure d'ENVOI de l'éphémère capturé : deux lecteurs de
/// fuseaux différents ne lisent pas le même jour.
public enum CaptureNoticeText {

    public static let languages = ["fr", "en", "es", "pt", "de", "it", "ar"]

    private struct Templates {
        let screenshot: String
        let recording: String
        let blockedScreenshot: String
        let blockedRecording: String
    }

    private static let templates: [String: Templates] = [
        "fr": Templates(
            screenshot: "{actor} a capturé l’éphémère du {date} à {time}",
            recording: "{actor} a enregistré l’écran pendant l’éphémère du {date} à {time}",
            blockedScreenshot: "{actor} a tenté de capturer un message à vue unique — impossible",
            blockedRecording: "{actor} a tenté d’enregistrer un message à vue unique — impossible"
        ),
        "en": Templates(
            screenshot: "{actor} took a screenshot of the disappearing message from {date} at {time}",
            recording: "{actor} recorded the screen during the disappearing message from {date} at {time}",
            blockedScreenshot: "{actor} tried to capture a view-once message — not possible",
            blockedRecording: "{actor} tried to record a view-once message — not possible"
        ),
        "es": Templates(
            screenshot: "{actor} capturó el mensaje efímero del {date} a las {time}",
            recording: "{actor} grabó la pantalla durante el mensaje efímero del {date} a las {time}",
            blockedScreenshot: "{actor} intentó capturar un mensaje de visualización única — no es posible",
            blockedRecording: "{actor} intentó grabar un mensaje de visualización única — no es posible"
        ),
        "pt": Templates(
            screenshot: "{actor} capturou a mensagem temporária de {date} às {time}",
            recording: "{actor} gravou a tela durante a mensagem temporária de {date} às {time}",
            blockedScreenshot: "{actor} tentou capturar uma mensagem de visualização única — não é possível",
            blockedRecording: "{actor} tentou gravar uma mensagem de visualização única — não é possível"
        ),
        "de": Templates(
            screenshot: "{actor} hat einen Screenshot der verschwindenden Nachricht vom {date} um {time} gemacht",
            recording: "{actor} hat den Bildschirm während der verschwindenden Nachricht vom {date} um {time} aufgezeichnet",
            blockedScreenshot: "{actor} hat versucht, eine Einmalansicht-Nachricht aufzunehmen — nicht möglich",
            blockedRecording: "{actor} hat versucht, eine Einmalansicht-Nachricht aufzuzeichnen — nicht möglich"
        ),
        "it": Templates(
            screenshot: "{actor} ha catturato il messaggio effimero del {date} alle {time}",
            recording: "{actor} ha registrato lo schermo durante il messaggio effimero del {date} alle {time}",
            blockedScreenshot: "{actor} ha tentato di catturare un messaggio a visualizzazione singola — impossibile",
            blockedRecording: "{actor} ha tentato di registrare un messaggio a visualizzazione singola — impossibile"
        ),
        "ar": Templates(
            screenshot: "التقط {actor} صورة شاشة للرسالة المؤقتة المرسلة بتاريخ {date} الساعة {time}",
            recording: "سجّل {actor} الشاشة أثناء عرض الرسالة المؤقتة المرسلة بتاريخ {date} الساعة {time}",
            blockedScreenshot: "حاول {actor} التقاط رسالة تُعرض مرة واحدة — غير ممكن",
            blockedRecording: "حاول {actor} تسجيل رسالة تُعرض مرة واحدة — غير ممكن"
        ),
    ]

    /// Le mot qui distingue un invité sans compte d'un homonyme inscrit (audit #9617, A8).
    private static let guestWords: [String: String] = [
        "fr": "invité", "en": "guest", "es": "invitado", "pt": "convidado",
        "de": "Gast", "it": "ospite", "ar": "ضيف",
    ]

    /// `fr-FR`, `en_US`, `PT` ⇒ la langue du catalogue ; hors catalogue ⇒ `fr`.
    public static func normalizedLanguage(_ code: String?) -> String {
        let base = (code ?? "").lowercased()
            .split(whereSeparator: { $0 == "-" || $0 == "_" })
            .first.map(String.init) ?? ""
        return languages.contains(base) ? base : "fr"
    }

    /// L'acteur tel que la phrase le nomme : un invité porte « (invité) »,
    /// un inscrit son pseudo — deux homonymes ne se confondent pas.
    public static func actorLabel(_ actor: CaptureNoticeMetadata.Actor, language: String?) -> String {
        let name = sanitizedName(actor.displayName)
        if actor.isAnonymous {
            return "\(name) (\(guestWords[normalizedLanguage(language)] ?? "invité"))"
        }
        guard let username = actor.username.map(sanitizedName), username != "?", username != name else { return name }
        return "\(name) (@\(username))"
    }

    /// Sans contrôle de direction ni caractère de contrôle, espaces resserrés,
    /// 64 caractères au plus ; vide ⇒ « ? ». La passerelle assainit à
    /// l'écriture ; le lecteur le refait pour un avis plus ancien.
    public static func sanitizedName(_ raw: String) -> String {
        let kept = raw.unicodeScalars.filter { scalar in
            let category = scalar.properties.generalCategory
            return category != .format && category != .control || scalar == " "
        }
        let words = String(String.UnicodeScalarView(kept)).split(whereSeparator: \.isWhitespace)
        let joined = String(words.joined(separator: " ").prefix(64))
        return joined.isEmpty ? "?" : joined
    }

    public static func compose(_ notice: CaptureNoticeMetadata, language: String?, timeZone: TimeZone?) -> String {
        let lang = normalizedLanguage(language)
        let zone = timeZone ?? TimeZone(identifier: "UTC")!
        let actor = actorLabel(notice.actor, language: lang)
        let table = templates[lang] ?? templates["fr"]!
        let template: String
        switch (notice.outcome, notice.captureKind) {
        case (.blocked, .recording): template = table.blockedRecording
        case (.blocked, .screenshot): template = table.blockedScreenshot
        case (.announced, .recording): template = table.recording
        case (.announced, .screenshot): template = table.screenshot
        }
        return template
            .replacingOccurrences(of: "{actor}", with: actor)
            .replacingOccurrences(of: "{date}", with: format(notice.sentAt, template: "ddMMyyyy", language: lang, zone: zone))
            .replacingOccurrences(of: "{time}", with: format(notice.sentAt, template: "jjmm", language: lang, zone: zone))
    }

    /// Le repli stocké dans `Message.content` — français, UTC DIT comme tel.
    public static func fallback(_ notice: CaptureNoticeMetadata) -> String {
        let text = compose(notice, language: "fr", timeZone: TimeZone(identifier: "UTC"))
        return notice.outcome == .blocked ? text : "\(text) (UTC)"
    }

    /// Le fuseau d'un identifiant IANA ; absent ou invalide ⇒ UTC.
    public static func timeZone(identifier: String?) -> TimeZone {
        identifier.flatMap(TimeZone.init(identifier:)) ?? TimeZone(identifier: "UTC")!
    }

    private static func format(_ date: Date, template: String, language: String, zone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: language)
        formatter.timeZone = zone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }
}

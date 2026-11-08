package me.meeshy.sdk.model

import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.chrono.IsoChronology
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.format.FormatStyle
import java.util.Locale

/**
 * **La phrase d'un avis système pour UN lecteur** — sa langue, son fuseau. Miroir de
 * `captureNoticeText` (`packages/shared/utils/capture-notice.ts`), de `CaptureNoticeText` (iOS)
 * et de `arrivalsNoticeText` : mêmes sept langues, mêmes gabarits, langue hors catalogue ⇒
 * français, fuseau absent ou invalide ⇒ UTC.
 *
 * L'heure dite est l'heure d'ENVOI de l'éphémère capturé : deux lecteurs de fuseaux
 * différents peuvent lire deux jours différents.
 */
object SystemNoticeText {

    val LANGUAGES: List<String> = listOf("fr", "en", "es", "pt", "de", "it", "ar")

    private const val DEFAULT_LANGUAGE = "fr"
    private const val NAME_MAX_LENGTH = 64

    private data class Capture(
        val screenshot: String,
        val recording: String,
        val blockedScreenshot: String,
        val blockedRecording: String,
    )

    private data class Arrived(val one: String, val two: String, val three: String, val many: String)

    private val captureTemplates: Map<String, Capture> = mapOf(
        "fr" to Capture(
            screenshot = "{actor} a capturé l’éphémère du {date} à {time}",
            recording = "{actor} a enregistré l’écran pendant l’éphémère du {date} à {time}",
            blockedScreenshot = "{actor} a tenté de capturer un message à vue unique — impossible",
            blockedRecording = "{actor} a tenté d’enregistrer un message à vue unique — impossible",
        ),
        "en" to Capture(
            screenshot = "{actor} took a screenshot of the disappearing message from {date} at {time}",
            recording = "{actor} recorded the screen during the disappearing message from {date} at {time}",
            blockedScreenshot = "{actor} tried to capture a view-once message — not possible",
            blockedRecording = "{actor} tried to record a view-once message — not possible",
        ),
        "es" to Capture(
            screenshot = "{actor} capturó el mensaje efímero del {date} a las {time}",
            recording = "{actor} grabó la pantalla durante el mensaje efímero del {date} a las {time}",
            blockedScreenshot = "{actor} intentó capturar un mensaje de visualización única — no es posible",
            blockedRecording = "{actor} intentó grabar un mensaje de visualización única — no es posible",
        ),
        "pt" to Capture(
            screenshot = "{actor} capturou a mensagem temporária de {date} às {time}",
            recording = "{actor} gravou a tela durante a mensagem temporária de {date} às {time}",
            blockedScreenshot = "{actor} tentou capturar uma mensagem de visualização única — não é possível",
            blockedRecording = "{actor} tentou gravar uma mensagem de visualização única — não é possível",
        ),
        "de" to Capture(
            screenshot = "{actor} hat einen Screenshot der verschwindenden Nachricht vom {date} um {time} gemacht",
            recording = "{actor} hat den Bildschirm während der verschwindenden Nachricht vom {date} um {time} aufgezeichnet",
            blockedScreenshot = "{actor} hat versucht, eine Einmalansicht-Nachricht aufzunehmen — nicht möglich",
            blockedRecording = "{actor} hat versucht, eine Einmalansicht-Nachricht aufzuzeichnen — nicht möglich",
        ),
        "it" to Capture(
            screenshot = "{actor} ha catturato il messaggio effimero del {date} alle {time}",
            recording = "{actor} ha registrato lo schermo durante il messaggio effimero del {date} alle {time}",
            blockedScreenshot = "{actor} ha tentato di catturare un messaggio a visualizzazione singola — impossibile",
            blockedRecording = "{actor} ha tentato di registrare un messaggio a visualizzazione singola — impossibile",
        ),
        "ar" to Capture(
            screenshot = "التقط {actor} صورة شاشة للرسالة المؤقتة المرسلة بتاريخ {date} الساعة {time}",
            recording = "سجّل {actor} الشاشة أثناء عرض الرسالة المؤقتة المرسلة بتاريخ {date} الساعة {time}",
            blockedScreenshot = "حاول {actor} التقاط رسالة تُعرض مرة واحدة — غير ممكن",
            blockedRecording = "حاول {actor} تسجيل رسالة تُعرض مرة واحدة — غير ممكن",
        ),
    )

    private val arrivedTemplates: Map<String, Arrived> = mapOf(
        "fr" to Arrived(
            one = "{first} vient d’arriver — dis-lui salut",
            two = "{first} et {second} viennent d’arriver — dis-leur salut",
            three = "{first}, {second} et {third} viennent d’arriver — dis-leur salut",
            many = "{first}, {second} et {others} autres viennent d’arriver — dis-leur salut",
        ),
        "en" to Arrived(
            one = "{first} just arrived — say hi",
            two = "{first} and {second} just arrived — say hi",
            three = "{first}, {second} and {third} just arrived — say hi",
            many = "{first}, {second} and {others} others just arrived — say hi",
        ),
        "es" to Arrived(
            one = "{first} acaba de llegar — salúdale",
            two = "{first} y {second} acaban de llegar — salúdalos",
            three = "{first}, {second} y {third} acaban de llegar — salúdalos",
            many = "{first}, {second} y {others} más acaban de llegar — salúdalos",
        ),
        "pt" to Arrived(
            one = "{first} acabou de chegar — diz olá",
            two = "{first} e {second} acabaram de chegar — diz olá",
            three = "{first}, {second} e {third} acabaram de chegar — diz olá",
            many = "{first}, {second} e mais {others} acabaram de chegar — diz olá",
        ),
        "de" to Arrived(
            one = "{first} ist gerade angekommen — sag hallo",
            two = "{first} und {second} sind gerade angekommen — sag hallo",
            three = "{first}, {second} und {third} sind gerade angekommen — sag hallo",
            many = "{first}, {second} und {others} weitere sind gerade angekommen — sag hallo",
        ),
        "it" to Arrived(
            one = "Nuovo arrivo: {first} — fai un saluto",
            two = "Nuovi arrivi: {first} e {second} — fai un saluto",
            three = "Nuovi arrivi: {first}, {second} e {third} — fai un saluto",
            many = "Nuovi arrivi: {first}, {second} e altri {others} — fai un saluto",
        ),
        "ar" to Arrived(
            one = "وصل {first} للتو — قل مرحبًا",
            two = "وصل {first} و{second} للتو — قل مرحبًا",
            three = "وصل {first} و{second} و{third} للتو — قل مرحبًا",
            many = "وصل {first} و{second} و{others} آخرون للتو — قل مرحبًا",
        ),
    )

    /** Le mot qui distingue un invité sans compte d'un homonyme inscrit (audit #9617, A8). */
    private val guestWords: Map<String, String> = mapOf(
        "fr" to "invité", "en" to "guest", "es" to "invitado", "pt" to "convidado",
        "de" to "Gast", "it" to "ospite", "ar" to "ضيف",
    )

    /**
     * La phrase d'un avis système composée CHEZ LE LECTEUR depuis la métadonnée du message —
     * capture, puis arrivées groupées —, ou `null` pour retomber sur le `content` (forme fausse,
     * autre famille d'avis, message ordinaire). Un message qui n'est pas système n'en reçoit jamais.
     */
    fun of(message: ApiMessage, language: String?, timeZoneId: String?): String? {
        if (!message.isSystemMessage) return null
        message.captureNotice?.let { return capture(it, language, timeZoneId) }
        message.arrivalsNotice?.let { return arrivals(it, language) }
        return null
    }

    /** `fr-FR`, `en_US`, `PT` ⇒ la langue du catalogue ; hors catalogue ⇒ `fr`. */
    fun normalizedLanguage(code: String?): String {
        val base = code.orEmpty().lowercase().split('-', '_').firstOrNull().orEmpty()
        return if (base in LANGUAGES) base else DEFAULT_LANGUAGE
    }

    /** Un identifiant IANA ; absent ou invalide ⇒ UTC. */
    fun zoneOf(identifier: String?): ZoneId =
        identifier?.takeIf { it.isNotBlank() }?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneOffset.UTC

    /**
     * Sans contrôle de direction ni caractère de contrôle, espaces resserrés, 64 caractères
     * au plus ; vide ⇒ « ? ». La passerelle assainit à l'écriture ; le lecteur le refait
     * pour un avis plus ancien.
     */
    fun sanitizedName(raw: String): String {
        val kept = buildString { raw.codePoints().filter { !isUnsafe(it) }.forEach { appendCodePoint(it) } }
        val collapsed = kept.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
        val bounded = collapsed.codePoints().limit(NAME_MAX_LENGTH.toLong()).toArray()
            .let { String(it, 0, it.size) }.trim()
        return bounded.ifEmpty { "?" }
    }

    private fun isUnsafe(cp: Int): Boolean =
        cp in 0x0000..0x001F || cp in 0x007F..0x009F || cp == 0x061C || cp in 0x200B..0x200F ||
            cp in 0x2028..0x202E || cp in 0x2060..0x2069 || cp == 0xFEFF

    /** « Bob (invité) » pour un invité, « Bob (@bob) » pour un inscrit avec pseudo, le nom sinon. */
    fun actorLabel(actor: CaptureNoticeMetadata.Actor, language: String?): String {
        val name = sanitizedName(actor.displayName)
        if (actor.isAnonymous) return "$name (${guestWords[normalizedLanguage(language)] ?: "invité"})"
        val username = actor.username?.takeIf { it.isNotEmpty() } ?: return name
        return "$name (@${sanitizedName(username)})"
    }

    /** La phrase de l'avis de capture pour ce lecteur. Pure. */
    fun capture(notice: CaptureNoticeMetadata, language: String?, timeZoneId: String?): String {
        val lang = normalizedLanguage(language)
        val zone = zoneOf(timeZoneId)
        val table = captureTemplates.getValue(lang)
        val blocked = notice.outcome == CaptureNoticeMetadata.Outcome.BLOCKED
        val recording = notice.captureKind == CaptureNoticeMetadata.CaptureKind.RECORDING
        val template = when {
            blocked && recording -> table.blockedRecording
            blocked -> table.blockedScreenshot
            recording -> table.recording
            else -> table.screenshot
        }
        val sentAt = Instant.ofEpochMilli(notice.sentAtEpochMillis).atZone(zone)
        return template
            .replace("{actor}", actorLabel(notice.actor, lang))
            .replace("{date}", dateFormatter(lang).format(sentAt))
            .replace("{time}", timeFormatter(lang).format(sentAt))
    }

    /** Le repli stocké dans `Message.content` — français, UTC DIT comme tel. */
    fun captureFallback(notice: CaptureNoticeMetadata): String {
        val text = capture(notice, "fr", "UTC")
        return if (notice.outcome == CaptureNoticeMetadata.Outcome.BLOCKED) text else "$text (UTC)"
    }

    /**
     * Miroir de `arrivalsNoticeLine` + `arrivalsNoticeText` : trois arrivées au plus se nomment
     * toutes ; au-delà, deux noms et le nombre des autres.
     */
    fun arrivals(notice: ArrivalsNoticeMetadata, language: String?): String {
        val table = arrivedTemplates.getValue(normalizedLanguage(language))
        val template = when (ArrivalsNoticeMetadata.lineKey(notice.count)) {
            ArrivalsNoticeMetadata.LineKey.ONE -> table.one
            ArrivalsNoticeMetadata.LineKey.TWO -> table.two
            ArrivalsNoticeMetadata.LineKey.THREE -> table.three
            ArrivalsNoticeMetadata.LineKey.MANY -> table.many
        }
        val named = notice.namedArrivals().map { it.displayName }
        return template
            .replace("{first}", named.getOrElse(0) { "" })
            .replace("{second}", named.getOrElse(1) { "" })
            .replace("{third}", named.getOrElse(2) { "" })
            .replace("{others}", maxOf(0, notice.count - named.size).toString())
    }

    private fun datePattern(language: String): String {
        val raw = DateTimeFormatterBuilder.getLocalizedDateTimePattern(
            FormatStyle.SHORT, null, IsoChronology.INSTANCE, Locale.forLanguageTag(language),
        )
        return raw.replace(Regex("(?<!d)d(?!d)"), "dd").replace(Regex("(?<!M)M(?!M)"), "MM")
            .replace(Regex("(?<!y)y{1,2}(?!y)"), "yyyy")
    }

    private fun timePattern(language: String): String {
        val raw = DateTimeFormatterBuilder.getLocalizedDateTimePattern(
            null, FormatStyle.SHORT, IsoChronology.INSTANCE, Locale.forLanguageTag(language),
        )
        return raw.replace(Regex("(?<!H)H(?!H)"), "HH").replace(Regex("(?<!h)h(?!h)"), "hh")
    }

    private fun dateFormatter(language: String): DateTimeFormatter =
        DateTimeFormatter.ofPattern(datePattern(language), Locale.forLanguageTag(language))

    private fun timeFormatter(language: String): DateTimeFormatter =
        DateTimeFormatter.ofPattern(timePattern(language), Locale.forLanguageTag(language))
}

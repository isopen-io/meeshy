package me.meeshy.sdk.model.call.frames

import java.text.BreakIterator
import kotlin.math.max

/** Une personne de l'appel, moi compris — le nom qu'on voit déjà dans l'appel, et son @pseudo s'il est connu. */
public data class CallFramePerson(val id: String, val name: String, val handle: String?, val isSelf: Boolean)

/** Les deux couleurs d'accent de la conversation (hex), pour le fond `accent`. */
public data class CallFrameAccent(val primary: String, val secondary: String)

/** Ce que le cadre écrit hors des visages : le nom du groupe (en groupe seulement), la date déjà formatée, l'accent. */
public data class CallFrameTexts(
    val groupName: String?,
    val isGroup: Boolean,
    val date: String,
    val accentHex: CallFrameAccent?,
)

public data class CallFrameFittedText(val text: String, val size: Double)

/**
 * LES MOTS D'UN CADRE — portage de `frame-text.ts` et `CallFrameText.swift` : ce que le titre, le
 * sous-titre et les noms ÉCRIVENT, en fonctions pures. La mesure du texte est injectée, pour que la
 * règle se prouve sans moteur de texte.
 */
public object CallFrameText {
    /** L'UNIQUE graphie de la marque dans un cadre : en minuscules, jamais passée en capitales. */
    public const val BRAND_WORD: String = "meeshy"
    public const val VISIBLE_NAMES: Int = 3
    public const val MIN_SHARE: Double = 0.6
    public const val ELLIPSIS: String = "…"

    private fun hasText(value: String?): Boolean = value != null && value.trim().isNotEmpty()

    /** « Awa » · « Awa & Karim » · « Awa, Karim & Lina » · « Awa, Karim, Lina + 2 ». */
    public fun namesText(people: List<CallFramePerson>): String {
        val names = people.map { it.name.trim() }.filter { it.isNotEmpty() }
        if (names.size <= 1) return names.firstOrNull().orEmpty()
        if (names.size <= VISIBLE_NAMES) return "${names.dropLast(1).joinToString(", ")} & ${names.last()}"
        return "${names.take(VISIBLE_NAMES).joinToString(", ")} + ${names.size - VISIBLE_NAMES}"
    }

    /** Un pseudo, toujours préfixé d'UN seul « @ ». */
    public fun handleText(handle: String): String = "@" + handle.trim().dropWhile { it == '@' }

    /**
     * Le texte d'un titre ou d'un sous-titre. `group` hors groupe (ou sans nom de groupe) ⇒ les noms.
     * La marque ne passe jamais en capitales. L'heure, le lieu, le monument et l'émotion n'écrivent
     * rien tant que leur moteur n'est pas là.
     */
    public fun titleText(
        source: CallFrameTitleSource,
        people: List<CallFramePerson>,
        texts: CallFrameTexts,
        letterCase: CallFrameLetterCase? = null,
    ): String {
        val raw = when (source) {
            CallFrameTitleSource.GROUP ->
                if (texts.isGroup && hasText(texts.groupName)) texts.groupName!!.trim() else namesText(people)
            CallFrameTitleSource.NAMES -> namesText(people)
            CallFrameTitleSource.BRAND -> BRAND_WORD
            CallFrameTitleSource.DATE -> texts.date.trim()
            CallFrameTitleSource.NONE -> ""
            CallFrameTitleSource.TIME, CallFrameTitleSource.DATETIME, CallFrameTitleSource.PLACE,
            CallFrameTitleSource.LANDMARK, CallFrameTitleSource.EMOTION -> ""
        }
        return if (letterCase == CallFrameLetterCase.UPPER && source != CallFrameTitleSource.BRAND) raw.uppercase() else raw
    }

    /** Les lignes qu'une personne porte sous [show] : le nom, le @pseudo, ou les deux. Sans pseudo connu, le nom le remplace. */
    public fun personLines(person: CallFramePerson, show: CallFrameNameShow): List<String> {
        val name = person.name.trim()
        val handle = person.handle?.takeIf { hasText(it) }?.let(::handleText)
        return when (show) {
            CallFrameNameShow.NONE -> emptyList()
            CallFrameNameShow.NAME -> if (name.isNotEmpty()) listOf(name) else listOfNotNull(handle)
            CallFrameNameShow.HANDLE -> if (handle != null) listOf(handle) else if (name.isEmpty()) emptyList() else listOf(name)
            CallFrameNameShow.BOTH -> listOfNotNull(name, handle).filter { it.isNotEmpty() }
        }
    }

    /** Une ligne de la liste des noms (style `list`) : « Awa », « @awa » ou « Awa @awa ». */
    public fun listEntry(person: CallFramePerson, show: CallFrameNameShow): String =
        personLines(person, show).joinToString(" ")

    /**
     * Un texte trop long pour [maxWidth] rétrécit jusqu'à 60 % de sa taille, puis se tronque d'une ellipse
     * (§ 5.3) — coupé entre deux caractères perçus, jamais au milieu d'un caractère composé.
     */
    public fun fit(text: String, maxWidth: Double, size: Double, measure: (String, Double) -> Double): CallFrameFittedText {
        if (text.isEmpty() || maxWidth <= 0) return CallFrameFittedText(if (maxWidth <= 0) "" else text, size)
        val width = measure(text, size)
        if (width <= maxWidth) return CallFrameFittedText(text, size)
        val floor = size * MIN_SHARE
        var fitted = max(floor, size * maxWidth / width)
        while (fitted > floor && measure(text, fitted) > maxWidth) fitted = max(floor, fitted * 0.97)
        if (measure(text, fitted) <= maxWidth) return CallFrameFittedText(text, fitted)
        val glyphs = glyphs(text)
        fun cut(keep: Int): String {
            if (keep <= 0) return ELLIPSIS
            return glyphs.take(keep).joinToString("").trimEnd { it.isWhitespace() } + ELLIPSIS
        }
        var low = 0
        var high = glyphs.size - 1
        while (low < high) {
            val middle = (low + high + 1) / 2
            if (measure(cut(middle), fitted) <= maxWidth) low = middle else high = middle - 1
        }
        val empty = low == 0 && measure(ELLIPSIS, fitted) > maxWidth
        return CallFrameFittedText(if (empty) "" else cut(low), fitted)
    }

    private fun glyphs(text: String): List<String> {
        val iterator = BreakIterator.getCharacterInstance()
        iterator.setText(text)
        val out = ArrayList<String>()
        var start = iterator.first()
        var end = iterator.next()
        while (end != BreakIterator.DONE) {
            out += text.substring(start, end)
            start = end
            end = iterator.next()
        }
        return out
    }
}

package me.meeshy.app.chat.export

enum class CardAlignment { LEFT, RIGHT, CENTER }

sealed interface CardOp {
    /** [y] est la ligne de base. */
    data class Text(
        val text: String, val x: Double, val y: Double, val font: CardFont, val color: CardColor,
        val align: CardAlignment, val direction: CardTextDirection,
    ) : CardOp

    /** Un filet plein, aux bouts arrondis. */
    data class Bar(val x: Double, val y: Double, val width: Double, val height: Double, val radius: Double, val color: CardColor) : CardOp

    /** Une bulle : un rectangle arrondi sous un bloc de texte. */
    data class Panel(val x: Double, val y: Double, val width: Double, val height: Double, val radius: Double, val color: CardColor) : CardOp

    /** Un trait horizontal — interrompu par un cercle au milieu quand [radius] > 0. */
    data class Separator(
        val x1: Double, val x2: Double, val y: Double, val radius: Double, val color: CardColor,
        val dash: List<Double>, val lineWidth: Double,
    ) : CardOp

    data class Dot(val x: Double, val y: Double, val radius: Double, val color: CardColor) : CardOp

    /** Des opérations peintes ensemble, tournées de [rotation] radians autour de (cx, cy). */
    data class Group(val rotation: Double, val cx: Double, val cy: Double, val ops: List<CardOp>) : CardOp
}

/** Les PARTIES d'une carte qu'un geste peut désigner sur l'aperçu. */
enum class CardPartId { HEADER, QUOTE, LINK, REPLY, BACKGROUND }

data class CardRegion(val part: CardPartId, val x: Double, val y: Double, val width: Double, val height: Double)

data class CardInput(
    val quoted: CardPart?,
    val reply: CardPart,
    val template: CardTemplateId,
    /** Le pseudo de qui exporte — il signe le filigrane ; `null` : la marque seule. */
    val handle: String?,
    val title: String? = null,
    val date: String? = null,
    val showAuthors: Boolean = true,
    val aspect: CardAspect = CardAspect.AUTO,
    val authorPlacement: CardAuthorPlacement = CardAuthorPlacement.ABOVE,
    val tilt: CardTilt = CardTilt.NONE,
    val quotedTime: String? = null,
    val replyTime: String? = null,
) {
    companion object {
        /**
         * La carte telle que le format la demande — un titre absent ou vide n'est jamais « affiché »,
         * un auteur anonymisé cède son nom à [anonymousLabel], « pseudo » peint `@pseudo` quand on le
         * connaît. Le filigrane, lui, garde toujours le pseudo de qui exporte.
         */
        fun of(
            subject: CardSubject,
            format: CardFormat,
            handle: String?,
            conversationTitle: String?,
            anonymousLabel: String,
            formatDate: (Long) -> String,
            formatTime: (Long) -> String = { "" },
        ): CardInput {
            val named: (CardPart) -> CardPart = { part ->
                val h = part.handle
                if (format.useHandles && h != null) part.copy(author = "@$h") else part
            }
            val quoted = subject.quoted?.let { if (format.anonymizeQuoted) CardPart(anonymousLabel, it.text) else named(it) }
            val reply = if (format.anonymizeReply) CardPart(anonymousLabel, subject.reply.text) else named(subject.reply)
            return CardInput(
                quoted = quoted,
                reply = reply,
                template = format.template,
                handle = handle,
                title = if (format.showConversationTitle) conversationTitle else null,
                date = if (format.showDate) formatDate(subject.sentAtMillis) else null,
                showAuthors = format.showAuthors,
                aspect = format.aspect,
                authorPlacement = format.authorPlacement,
                tilt = format.tilt,
                quotedTime = if (format.showTimes) subject.quotedAtMillis?.let(formatTime) else null,
                replyTime = if (format.showTimes) formatTime(subject.sentAtMillis) else null,
            )
        }
    }
}

data class CardLayout(
    val width: Double,
    val height: Double,
    val ops: List<CardOp>,
    /** Les zones touchables, de haut en bas — seules les parties PEINTES en ont une. */
    val regions: List<CardRegion>,
    val watermark: String,
    /** Vrai quand, au plancher des polices, un texte a dû être coupé. */
    val truncated: Boolean,
) {
    /**
     * La même carte, LISIBLE à petite échelle : les traits, filets et points sont portés à
     * [minimumPoints] une fois réduits ; tout le reste est celui de l'image exportée.
     */
    fun legible(atScale: Double, minimumPoints: Double = 1.5): CardLayout {
        if (atScale <= 0 || atScale >= 1) return this
        val floor = minimumPoints / atScale
        return copy(ops = ops.map { legible(it, floor) })
    }

    private fun legible(op: CardOp, floor: Double): CardOp = when (op) {
        is CardOp.Separator -> {
            val lineWidth = maxOf(op.lineWidth, floor)
            val stretch = lineWidth / maxOf(op.lineWidth, 0.001)
            op.copy(
                radius = if (op.radius == 0.0) 0.0 else maxOf(op.radius, floor * 3),
                dash = op.dash.map { it * stretch },
                lineWidth = lineWidth,
            )
        }
        is CardOp.Bar -> if (op.width < floor || op.height < floor) {
            val w = maxOf(op.width, floor)
            val h = maxOf(op.height, floor)
            op.copy(x = op.x - (w - op.width) / 2, y = op.y - (h - op.height) / 2, width = w, height = h, radius = minOf(w, h) / 2)
        } else {
            op
        }
        is CardOp.Dot -> op.copy(radius = maxOf(op.radius, floor * 1.5))
        is CardOp.Group -> op.copy(ops = op.ops.map { legible(it, floor) })
        else -> op
    }

    companion object {
        const val CARD_WIDTH = 1080.0
        const val MIN_HEIGHT = 1080.0
        const val MAX_HEIGHT = 1920.0

        /** « Meeshy @pseudo » — le pseudo sans son éventuel « @ », la marque seule quand il manque. */
        fun watermark(handle: String?): String {
            val name = CardText.nonBlank(handle?.trimStart('@'))
            return if (name == null) "Meeshy" else "Meeshy @$name"
        }
    }
}

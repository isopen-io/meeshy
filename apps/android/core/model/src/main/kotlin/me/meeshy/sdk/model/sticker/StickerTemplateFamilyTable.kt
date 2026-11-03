package me.meeshy.sdk.model.sticker

import me.meeshy.sdk.model.StickerAnimation

/**
 * La TABLE des vingt familles du catalogue — miroir des `StickerTemplateCatalog+<Famille>.swift` d'iOS, mêmes
 * identifiants, mêmes replis emoji, mêmes échelles de pose, mêmes mouvements. Écrite UNE fois, ici : les lots de
 * familles (dessin) ne la touchent jamais, ils ajoutent leurs dessinateurs côté `:sdk-ui`. Pur : aucune chaîne
 * localisée, aucun dessin.
 */
internal object StickerTemplateFamilyTable {

    private fun slotsOf(kind: SlotKind): List<StickerTemplateSlot> = when (kind) {
        SlotKind.NONE -> emptyList()
        SlotKind.PROSE -> listOf(StickerTemplateSlot(StickerSlotFiller.TEXT, StickerTemplateSlot.Nature.PROSE))
        SlotKind.PLACE -> listOf(
            StickerTemplateSlot(StickerSlotFiller.PLACE_NAME, StickerTemplateSlot.Nature.VALUE),
            StickerTemplateSlot(StickerSlotFiller.PLACE_DETAIL, StickerTemplateSlot.Nature.VALUE),
        )
        SlotKind.TIME -> listOf(
            StickerTemplateSlot(StickerSlotFiller.TIME, StickerTemplateSlot.Nature.VALUE),
            StickerTemplateSlot(StickerSlotFiller.HOUR, StickerTemplateSlot.Nature.VALUE),
            StickerTemplateSlot(StickerSlotFiller.MINUTE, StickerTemplateSlot.Nature.VALUE),
        )
        SlotKind.CLOCK -> listOf(StickerTemplateSlot(StickerSlotFiller.TIME, StickerTemplateSlot.Nature.VALUE))
        SlotKind.HOUR_MINUTE -> listOf(
            StickerTemplateSlot(StickerSlotFiller.HOUR, StickerTemplateSlot.Nature.VALUE),
            StickerTemplateSlot(StickerSlotFiller.MINUTE, StickerTemplateSlot.Nature.VALUE),
        )
        SlotKind.DATE -> listOf(StickerTemplateSlot(StickerSlotFiller.DATE, StickerTemplateSlot.Nature.VALUE))
    }

    private enum class SlotKind { NONE, PROSE, PLACE, TIME, CLOCK, HOUR_MINUTE, DATE }

    private fun tpl(
        id: String,
        family: StickerTemplateFamily,
        slots: SlotKind,
        emoji: String,
        scale: Double,
        animation: StickerAnimation?,
    ) = StickerTemplate(id, family, slotsOf(slots), emoji, scale, animation)

    fun templates(family: StickerTemplateFamily): List<StickerTemplate> = when (family) {
        StickerTemplateFamily.LOCATION -> location
        StickerTemplateFamily.TIME -> time
        StickerTemplateFamily.LOVE -> love
        StickerTemplateFamily.WEATHER -> weather
        StickerTemplateFamily.TEXT -> text
        StickerTemplateFamily.JOY -> joy
        StickerTemplateFamily.SURPRISE -> surprise
        StickerTemplateFamily.MOOD -> mood
        StickerTemplateFamily.GREETING -> greeting
        StickerTemplateFamily.REACTION -> reaction
        StickerTemplateFamily.PARTY -> party
        StickerTemplateFamily.AVAILABILITY -> availability
        StickerTemplateFamily.NATURE -> nature
        StickerTemplateFamily.CHEER -> cheer
        StickerTemplateFamily.ANSWER -> answer
        StickerTemplateFamily.FOOD -> food
        StickerTemplateFamily.SPORT -> sport
        StickerTemplateFamily.TRAVEL -> travel
        StickerTemplateFamily.WORK -> work
        StickerTemplateFamily.MUSIC -> music
    }

    private val location: List<StickerTemplate> = listOf(
        tpl("location.pill", StickerTemplateFamily.LOCATION, SlotKind.PLACE, "📍", 1.0, null),
        tpl("location.postcard", StickerTemplateFamily.LOCATION, SlotKind.PLACE, "📍", 1.0, null),
        tpl("location.ticket", StickerTemplateFamily.LOCATION, SlotKind.PLACE, "📍", 1.0, null),
        tpl("location.stamp", StickerTemplateFamily.LOCATION, SlotKind.PLACE, "📍", 1.0, null),
        tpl("location.compass", StickerTemplateFamily.LOCATION, SlotKind.PLACE, "🧭", 1.0, null),
        tpl("location.marquee", StickerTemplateFamily.LOCATION, SlotKind.PLACE, "📍", 1.0, null),
        tpl("location.mapPin", StickerTemplateFamily.LOCATION, SlotKind.PLACE, "🗺️", 1.0, StickerAnimation.BOUNCE),
        tpl("location.roadSign", StickerTemplateFamily.LOCATION, SlotKind.PLACE, "🪧", 1.0, StickerAnimation.SWING),
        tpl("location.luggageTag", StickerTemplateFamily.LOCATION, SlotKind.PLACE, "🧳", 1.0, StickerAnimation.WOBBLE),
        tpl("location.globe", StickerTemplateFamily.LOCATION, SlotKind.PLACE, "🌍", 1.0, StickerAnimation.PULSE),
    )

    private val time: List<StickerTemplate> = listOf(
        tpl("time.digital", StickerTemplateFamily.TIME, SlotKind.TIME, "🕐", 1.0, null),
        tpl("time.analog", StickerTemplateFamily.TIME, SlotKind.TIME, "🕐", 1.0, null),
        tpl("time.ribbon", StickerTemplateFamily.TIME, SlotKind.TIME, "🕐", 1.0, null),
        tpl("time.hourglass", StickerTemplateFamily.TIME, SlotKind.CLOCK, "⌛", 1.0, StickerAnimation.SWING),
        tpl("time.stopwatch", StickerTemplateFamily.TIME, SlotKind.CLOCK, "⏱️", 1.0, StickerAnimation.PULSE),
        tpl("time.calendarDay", StickerTemplateFamily.TIME, SlotKind.DATE, "📅", 1.0, null),
        tpl("time.alarm", StickerTemplateFamily.TIME, SlotKind.CLOCK, "⏰", 1.0, StickerAnimation.SHAKE),
        tpl("time.timeTag", StickerTemplateFamily.TIME, SlotKind.CLOCK, "🏷️", 1.0, StickerAnimation.WOBBLE),
        tpl("time.moon", StickerTemplateFamily.TIME, SlotKind.CLOCK, "🌙", 1.0, StickerAnimation.BLINK),
        tpl("time.pocketWatch", StickerTemplateFamily.TIME, SlotKind.HOUR_MINUTE, "🕰️", 1.0, StickerAnimation.SWING),
    )

    private val love: List<StickerTemplate> = listOf(
        tpl("love.heartFrame", StickerTemplateFamily.LOVE, SlotKind.NONE, "❤️", 1.4, StickerAnimation.HEARTBEAT),
        tpl("love.doubleHeart", StickerTemplateFamily.LOVE, SlotKind.NONE, "💕", 1.4, StickerAnimation.FLOAT),
        tpl("love.since", StickerTemplateFamily.LOVE, SlotKind.DATE, "💞", 1.0, null),
        tpl("love.arrowHeart", StickerTemplateFamily.LOVE, SlotKind.NONE, "💘", 1.4, StickerAnimation.HEARTBEAT),
        tpl("love.loveLetter", StickerTemplateFamily.LOVE, SlotKind.NONE, "💌", 1.0, StickerAnimation.WOBBLE),
        tpl("love.kissMark", StickerTemplateFamily.LOVE, SlotKind.NONE, "💋", 1.4, StickerAnimation.POP),
        tpl("love.heartBalloon", StickerTemplateFamily.LOVE, SlotKind.NONE, "🎈", 1.4, StickerAnimation.FLOAT),
        tpl("love.infinity", StickerTemplateFamily.LOVE, SlotKind.NONE, "♾️", 1.3, StickerAnimation.PULSE),
        tpl("love.loveBadge", StickerTemplateFamily.LOVE, SlotKind.NONE, "💟", 1.0, StickerAnimation.PULSE),
        tpl("love.heartRain", StickerTemplateFamily.LOVE, SlotKind.NONE, "💗", 1.4, StickerAnimation.FLOAT),
    )

    private val weather: List<StickerTemplate> = listOf(
        tpl("weather.sunny", StickerTemplateFamily.WEATHER, SlotKind.NONE, "☀️", 1.0, StickerAnimation.PULSE),
        tpl("weather.cloudy", StickerTemplateFamily.WEATHER, SlotKind.NONE, "☁️", 1.0, StickerAnimation.FLOAT),
        tpl("weather.rainy", StickerTemplateFamily.WEATHER, SlotKind.NONE, "🌧️", 1.0, StickerAnimation.FLOAT),
        tpl("weather.stormy", StickerTemplateFamily.WEATHER, SlotKind.NONE, "⛈️", 1.0, StickerAnimation.SHAKE),
        tpl("weather.snowy", StickerTemplateFamily.WEATHER, SlotKind.NONE, "❄️", 1.0, StickerAnimation.FLOAT),
        tpl("weather.windy", StickerTemplateFamily.WEATHER, SlotKind.NONE, "🌬️", 1.0, StickerAnimation.WOBBLE),
        tpl("weather.rainbow", StickerTemplateFamily.WEATHER, SlotKind.NONE, "🌈", 1.0, StickerAnimation.PULSE),
        tpl("weather.hot", StickerTemplateFamily.WEATHER, SlotKind.NONE, "🔥", 1.0, StickerAnimation.HEARTBEAT),
        tpl("weather.cold", StickerTemplateFamily.WEATHER, SlotKind.NONE, "🥶", 1.0, StickerAnimation.SHAKE),
        tpl("weather.night", StickerTemplateFamily.WEATHER, SlotKind.NONE, "🌙", 1.0, StickerAnimation.BLINK),
    )

    private val text: List<StickerTemplate> = listOf(
        tpl("text.speechBubble", StickerTemplateFamily.TEXT, SlotKind.PROSE, "💬", 1.0, StickerAnimation.POP),
        tpl("text.thoughtBubble", StickerTemplateFamily.TEXT, SlotKind.PROSE, "💭", 1.0, StickerAnimation.FLOAT),
        tpl("text.stickyNote", StickerTemplateFamily.TEXT, SlotKind.PROSE, "📝", 1.0, null),
        tpl("text.ribbon", StickerTemplateFamily.TEXT, SlotKind.PROSE, "🎗️", 1.0, StickerAnimation.SWING),
        tpl("text.badge", StickerTemplateFamily.TEXT, SlotKind.PROSE, "🏷️", 1.0, StickerAnimation.PULSE),
        tpl("text.neon", StickerTemplateFamily.TEXT, SlotKind.PROSE, "💡", 1.0, StickerAnimation.BLINK),
        tpl("text.tag", StickerTemplateFamily.TEXT, SlotKind.PROSE, "🔖", 1.0, StickerAnimation.WOBBLE),
        tpl("text.signboard", StickerTemplateFamily.TEXT, SlotKind.PROSE, "🪧", 1.0, StickerAnimation.SWING),
        tpl("text.tape", StickerTemplateFamily.TEXT, SlotKind.PROSE, "📎", 1.0, null),
        tpl("text.stamp", StickerTemplateFamily.TEXT, SlotKind.PROSE, "✅", 1.0, StickerAnimation.TADA),
    )

    private val joy: List<StickerTemplate> = listOf(
        tpl("joy.bigSmile", StickerTemplateFamily.JOY, SlotKind.NONE, "😀", 1.4, StickerAnimation.PULSE),
        tpl("joy.sunshine", StickerTemplateFamily.JOY, SlotKind.NONE, "🌞", 1.0, StickerAnimation.PULSE),
        tpl("joy.dance", StickerTemplateFamily.JOY, SlotKind.NONE, "💃", 1.0, StickerAnimation.WOBBLE),
        tpl("joy.yay", StickerTemplateFamily.JOY, SlotKind.NONE, "🥳", 1.2, StickerAnimation.TADA),
        tpl("joy.heartEyes", StickerTemplateFamily.JOY, SlotKind.NONE, "😍", 1.4, StickerAnimation.HEARTBEAT),
        tpl("joy.goodVibes", StickerTemplateFamily.JOY, SlotKind.NONE, "😊", 1.0, StickerAnimation.FLOAT),
        tpl("joy.sparkle", StickerTemplateFamily.JOY, SlotKind.NONE, "✨", 1.0, StickerAnimation.BLINK),
        tpl("joy.happyCloud", StickerTemplateFamily.JOY, SlotKind.NONE, "😇", 1.0, StickerAnimation.FLOAT),
        tpl("joy.laugh", StickerTemplateFamily.JOY, SlotKind.NONE, "😂", 1.0, StickerAnimation.BOUNCE),
        tpl("joy.starGrin", StickerTemplateFamily.JOY, SlotKind.NONE, "🤩", 1.4, StickerAnimation.PULSE),
    )

    private val surprise: List<StickerTemplate> = listOf(
        tpl("surprise.wow", StickerTemplateFamily.SURPRISE, SlotKind.NONE, "🤩", 1.2, StickerAnimation.TADA),
        tpl("surprise.omg", StickerTemplateFamily.SURPRISE, SlotKind.NONE, "😱", 1.2, StickerAnimation.POP),
        tpl("surprise.exclamation", StickerTemplateFamily.SURPRISE, SlotKind.NONE, "❗", 1.5, StickerAnimation.BOUNCE),
        tpl("surprise.whatBubble", StickerTemplateFamily.SURPRISE, SlotKind.NONE, "⁉️", 1.0, StickerAnimation.SHAKE),
        tpl("surprise.openMouth", StickerTemplateFamily.SURPRISE, SlotKind.NONE, "😮", 1.4, StickerAnimation.POP),
        tpl("surprise.shockBolt", StickerTemplateFamily.SURPRISE, SlotKind.NONE, "⚡", 1.0, StickerAnimation.SHAKE),
        tpl("surprise.wideEyes", StickerTemplateFamily.SURPRISE, SlotKind.NONE, "👀", 1.4, StickerAnimation.BLINK),
        tpl("surprise.noWay", StickerTemplateFamily.SURPRISE, SlotKind.NONE, "😳", 1.0, StickerAnimation.WOBBLE),
        tpl("surprise.unbelievable", StickerTemplateFamily.SURPRISE, SlotKind.NONE, "😲", 1.0, StickerAnimation.SWING),
        tpl("surprise.mindBlown", StickerTemplateFamily.SURPRISE, SlotKind.NONE, "🤯", 1.0, StickerAnimation.PULSE),
    )

    private val mood: List<StickerTemplate> = listOf(
        tpl("mood.sad", StickerTemplateFamily.MOOD, SlotKind.NONE, "😢", 1.0, StickerAnimation.FLOAT),
        tpl("mood.angry", StickerTemplateFamily.MOOD, SlotKind.NONE, "😠", 1.4, StickerAnimation.SHAKE),
        tpl("mood.calm", StickerTemplateFamily.MOOD, SlotKind.NONE, "😌", 1.0, StickerAnimation.FLOAT),
        tpl("mood.tired", StickerTemplateFamily.MOOD, SlotKind.NONE, "😴", 1.0, StickerAnimation.FLOAT),
        tpl("mood.motivated", StickerTemplateFamily.MOOD, SlotKind.NONE, "💪", 1.0, StickerAnimation.PULSE),
        tpl("mood.stressed", StickerTemplateFamily.MOOD, SlotKind.NONE, "😰", 1.0, StickerAnimation.SHAKE),
        tpl("mood.zen", StickerTemplateFamily.MOOD, SlotKind.NONE, "🧘", 1.0, StickerAnimation.PULSE),
        tpl("mood.bored", StickerTemplateFamily.MOOD, SlotKind.NONE, "😑", 1.4, null),
        tpl("mood.proud", StickerTemplateFamily.MOOD, SlotKind.NONE, "🏅", 1.0, StickerAnimation.SWING),
        tpl("mood.nostalgic", StickerTemplateFamily.MOOD, SlotKind.NONE, "🖼️", 1.0, StickerAnimation.WOBBLE),
    )

    private val greeting: List<StickerTemplate> = listOf(
        tpl("greeting.hello", StickerTemplateFamily.GREETING, SlotKind.NONE, "🌅", 1.0, StickerAnimation.PULSE),
        tpl("greeting.goodEvening", StickerTemplateFamily.GREETING, SlotKind.NONE, "🌆", 1.0, StickerAnimation.FLOAT),
        tpl("greeting.goodNight", StickerTemplateFamily.GREETING, SlotKind.NONE, "🌃", 1.0, StickerAnimation.BLINK),
        tpl("greeting.hi", StickerTemplateFamily.GREETING, SlotKind.NONE, "👋", 1.0, StickerAnimation.WOBBLE),
        tpl("greeting.thanks", StickerTemplateFamily.GREETING, SlotKind.NONE, "🙏", 1.2, StickerAnimation.HEARTBEAT),
        tpl("greeting.welcome", StickerTemplateFamily.GREETING, SlotKind.NONE, "🤗", 1.0, StickerAnimation.SWING),
        tpl("greeting.seeYou", StickerTemplateFamily.GREETING, SlotKind.NONE, "✈️", 1.0, StickerAnimation.FLOAT),
        tpl("greeting.bonAppetit", StickerTemplateFamily.GREETING, SlotKind.NONE, "🍽️", 1.0, StickerAnimation.BOUNCE),
        tpl("greeting.bonVoyage", StickerTemplateFamily.GREETING, SlotKind.NONE, "🧳", 1.0, StickerAnimation.SWING),
        tpl("greeting.kisses", StickerTemplateFamily.GREETING, SlotKind.NONE, "😘", 1.0, StickerAnimation.POP),
    )

    private val reaction: List<StickerTemplate> = listOf(
        tpl("reaction.lol", StickerTemplateFamily.REACTION, SlotKind.NONE, "😂", 1.2, StickerAnimation.BOUNCE),
        tpl("reaction.gg", StickerTemplateFamily.REACTION, SlotKind.NONE, "🏆", 1.0, StickerAnimation.POP),
        tpl("reaction.ok", StickerTemplateFamily.REACTION, SlotKind.NONE, "👌", 1.0, StickerAnimation.PULSE),
        tpl("reaction.no", StickerTemplateFamily.REACTION, SlotKind.NONE, "❌", 1.0, StickerAnimation.SHAKE),
        tpl("reaction.yes", StickerTemplateFamily.REACTION, SlotKind.NONE, "✅", 1.0, StickerAnimation.BOUNCE),
        tpl("reaction.top", StickerTemplateFamily.REACTION, SlotKind.NONE, "👍", 1.0, StickerAnimation.PULSE),
        tpl("reaction.hundred", StickerTemplateFamily.REACTION, SlotKind.NONE, "💯", 1.2, StickerAnimation.TADA),
        tpl("reaction.bravo", StickerTemplateFamily.REACTION, SlotKind.NONE, "👏", 1.0, StickerAnimation.TADA),
        tpl("reaction.oops", StickerTemplateFamily.REACTION, SlotKind.NONE, "🙈", 1.0, StickerAnimation.WOBBLE),
        tpl("reaction.mdr", StickerTemplateFamily.REACTION, SlotKind.NONE, "🤣", 1.2, StickerAnimation.SHAKE),
    )

    private val party: List<StickerTemplate> = listOf(
        tpl("party.birthday", StickerTemplateFamily.PARTY, SlotKind.NONE, "🎂", 1.1, StickerAnimation.BOUNCE),
        tpl("party.balloons", StickerTemplateFamily.PARTY, SlotKind.NONE, "🎈", 1.4, StickerAnimation.FLOAT),
        tpl("party.gift", StickerTemplateFamily.PARTY, SlotKind.NONE, "🎁", 1.0, StickerAnimation.POP),
        tpl("party.cheers", StickerTemplateFamily.PARTY, SlotKind.NONE, "🥂", 1.0, StickerAnimation.WOBBLE),
        tpl("party.fireworks", StickerTemplateFamily.PARTY, SlotKind.NONE, "🎆", 1.0, StickerAnimation.PULSE),
        tpl("party.newYear", StickerTemplateFamily.PARTY, SlotKind.NONE, "🎊", 1.0, StickerAnimation.BLINK),
        tpl("party.discoBall", StickerTemplateFamily.PARTY, SlotKind.NONE, "🕺", 1.3, StickerAnimation.SPIN),
        tpl("party.partyHat", StickerTemplateFamily.PARTY, SlotKind.NONE, "🥳", 1.0, StickerAnimation.TADA),
        tpl("party.congrats", StickerTemplateFamily.PARTY, SlotKind.NONE, "🎉", 1.0, StickerAnimation.SWING),
        tpl("party.trophy", StickerTemplateFamily.PARTY, SlotKind.NONE, "🏆", 1.0, StickerAnimation.PULSE),
    )

    private val availability: List<StickerTemplate> = listOf(
        tpl("availability.available", StickerTemplateFamily.AVAILABILITY, SlotKind.NONE, "✅", 1.0, StickerAnimation.PULSE),
        tpl("availability.busy", StickerTemplateFamily.AVAILABILITY, SlotKind.NONE, "🔴", 1.0, null),
        tpl("availability.doNotDisturb", StickerTemplateFamily.AVAILABILITY, SlotKind.NONE, "🔕", 1.0, null),
        tpl("availability.inMeeting", StickerTemplateFamily.AVAILABILITY, SlotKind.NONE, "📅", 1.0, null),
        tpl("availability.onBreak", StickerTemplateFamily.AVAILABILITY, SlotKind.NONE, "☕", 1.0, StickerAnimation.FLOAT),
        tpl("availability.onVacation", StickerTemplateFamily.AVAILABILITY, SlotKind.NONE, "🏖️", 1.0, StickerAnimation.SWING),
        tpl("availability.away", StickerTemplateFamily.AVAILABILITY, SlotKind.NONE, "🚶", 1.0, StickerAnimation.WOBBLE),
        tpl("availability.callMe", StickerTemplateFamily.AVAILABILITY, SlotKind.NONE, "📞", 1.0, StickerAnimation.SHAKE),
        tpl("availability.online", StickerTemplateFamily.AVAILABILITY, SlotKind.NONE, "🟢", 1.0, StickerAnimation.BLINK),
        tpl("availability.backSoon", StickerTemplateFamily.AVAILABILITY, SlotKind.NONE, "⏳", 1.0, StickerAnimation.BOUNCE),
    )

    private val nature: List<StickerTemplate> = listOf(
        tpl("nature.flower", StickerTemplateFamily.NATURE, SlotKind.NONE, "🌸", 1.4, StickerAnimation.POP),
        tpl("nature.butterfly", StickerTemplateFamily.NATURE, SlotKind.NONE, "🦋", 1.4, StickerAnimation.FLOAT),
        tpl("nature.leaf", StickerTemplateFamily.NATURE, SlotKind.NONE, "🍂", 1.4, StickerAnimation.SWING),
        tpl("nature.cat", StickerTemplateFamily.NATURE, SlotKind.NONE, "🐱", 1.0, StickerAnimation.WOBBLE),
        tpl("nature.dog", StickerTemplateFamily.NATURE, SlotKind.NONE, "🐶", 1.0, StickerAnimation.BOUNCE),
        tpl("nature.mountain", StickerTemplateFamily.NATURE, SlotKind.NONE, "⛰️", 1.0, null),
        tpl("nature.wave", StickerTemplateFamily.NATURE, SlotKind.NONE, "🌊", 1.0, StickerAnimation.FLOAT),
        tpl("nature.moon", StickerTemplateFamily.NATURE, SlotKind.NONE, "🌛", 1.0, null),
        tpl("nature.cactus", StickerTemplateFamily.NATURE, SlotKind.NONE, "🌵", 1.4, null),
        tpl("nature.rainbow", StickerTemplateFamily.NATURE, SlotKind.NONE, "🌈", 1.3, StickerAnimation.PULSE),
    )

    private val cheer: List<StickerTemplate> = listOf(
        tpl("cheer.bravo", StickerTemplateFamily.CHEER, SlotKind.NONE, "👏", 1.0, StickerAnimation.TADA),
        tpl("cheer.courage", StickerTemplateFamily.CHEER, SlotKind.NONE, "💪", 1.0, StickerAnimation.WOBBLE),
        tpl("cheer.youGotThis", StickerTemplateFamily.CHEER, SlotKind.NONE, "👍", 1.0, StickerAnimation.POP),
        tpl("cheer.goForIt", StickerTemplateFamily.CHEER, SlotKind.NONE, "🚀", 1.0, StickerAnimation.SHAKE),
        tpl("cheer.proudOfYou", StickerTemplateFamily.CHEER, SlotKind.NONE, "🏅", 1.0, null),
        tpl("cheer.neverGiveUp", StickerTemplateFamily.CHEER, SlotKind.NONE, "⚡", 1.0, StickerAnimation.PULSE),
        tpl("cheer.respect", StickerTemplateFamily.CHEER, SlotKind.NONE, "🙌", 1.0, null),
        tpl("cheer.wellPlayed", StickerTemplateFamily.CHEER, SlotKind.NONE, "⭐", 1.0, StickerAnimation.BOUNCE),
        tpl("cheer.youWillMakeIt", StickerTemplateFamily.CHEER, SlotKind.NONE, "📈", 1.0, StickerAnimation.FLOAT),
        tpl("cheer.thankYou", StickerTemplateFamily.CHEER, SlotKind.NONE, "💗", 1.0, StickerAnimation.HEARTBEAT),
    )

    private val answer: List<StickerTemplate> = listOf(
        tpl("answer.yes", StickerTemplateFamily.ANSWER, SlotKind.NONE, "✅", 1.0, StickerAnimation.POP),
        tpl("answer.no", StickerTemplateFamily.ANSWER, SlotKind.NONE, "❌", 1.0, StickerAnimation.SHAKE),
        tpl("answer.maybe", StickerTemplateFamily.ANSWER, SlotKind.NONE, "🤷", 1.0, StickerAnimation.WOBBLE),
        tpl("answer.what", StickerTemplateFamily.ANSWER, SlotKind.NONE, "❓", 1.0, StickerAnimation.BOUNCE),
        tpl("answer.ok", StickerTemplateFamily.ANSWER, SlotKind.NONE, "👌", 1.0, null),
        tpl("answer.never", StickerTemplateFamily.ANSWER, SlotKind.NONE, "🚫", 1.0, null),
        tpl("answer.totally", StickerTemplateFamily.ANSWER, SlotKind.NONE, "🙌", 1.0, StickerAnimation.TADA),
        tpl("answer.why", StickerTemplateFamily.ANSWER, SlotKind.NONE, "🤔", 1.0, StickerAnimation.FLOAT),
        tpl("answer.tellMe", StickerTemplateFamily.ANSWER, SlotKind.NONE, "🗣️", 1.0, StickerAnimation.SWING),
        tpl("answer.vote", StickerTemplateFamily.ANSWER, SlotKind.NONE, "🗳️", 1.0, null),
    )

    private val food: List<StickerTemplate> = listOf(
        tpl("food.coffee", StickerTemplateFamily.FOOD, SlotKind.NONE, "☕", 1.0, StickerAnimation.FLOAT),
        tpl("food.pizza", StickerTemplateFamily.FOOD, SlotKind.NONE, "🍕", 1.4, StickerAnimation.WOBBLE),
        tpl("food.birthdayCake", StickerTemplateFamily.FOOD, SlotKind.NONE, "🎂", 1.3, StickerAnimation.BLINK),
        tpl("food.cheers", StickerTemplateFamily.FOOD, SlotKind.NONE, "🥂", 1.0, StickerAnimation.TADA),
        tpl("food.iceCream", StickerTemplateFamily.FOOD, SlotKind.NONE, "🍦", 1.4, StickerAnimation.SWING),
        tpl("food.croissant", StickerTemplateFamily.FOOD, SlotKind.NONE, "🥐", 1.0, null),
        tpl("food.ramen", StickerTemplateFamily.FOOD, SlotKind.NONE, "🍜", 1.3, null),
        tpl("food.burger", StickerTemplateFamily.FOOD, SlotKind.NONE, "🍔", 1.4, StickerAnimation.BOUNCE),
        tpl("food.yum", StickerTemplateFamily.FOOD, SlotKind.NONE, "😋", 1.0, StickerAnimation.POP),
        tpl("food.bonAppetit", StickerTemplateFamily.FOOD, SlotKind.NONE, "🍽️", 1.0, null),
    )

    private val sport: List<StickerTemplate> = listOf(
        tpl("sport.soccerBall", StickerTemplateFamily.SPORT, SlotKind.NONE, "⚽", 1.4, StickerAnimation.BOUNCE),
        tpl("sport.goldMedal", StickerTemplateFamily.SPORT, SlotKind.NONE, "🥇", 1.2, StickerAnimation.SWING),
        tpl("sport.trophy", StickerTemplateFamily.SPORT, SlotKind.NONE, "🏆", 1.4, null),
        tpl("sport.stopwatch", StickerTemplateFamily.SPORT, SlotKind.NONE, "⏱️", 1.0, StickerAnimation.TADA),
        tpl("sport.sneakers", StickerTemplateFamily.SPORT, SlotKind.NONE, "👟", 1.0, StickerAnimation.WOBBLE),
        tpl("sport.dumbbell", StickerTemplateFamily.SPORT, SlotKind.NONE, "🏋️", 1.0, null),
        tpl("sport.bike", StickerTemplateFamily.SPORT, SlotKind.NONE, "🚲", 1.4, StickerAnimation.FLOAT),
        tpl("sport.flame", StickerTemplateFamily.SPORT, SlotKind.NONE, "🔥", 1.0, StickerAnimation.PULSE),
        tpl("sport.podium", StickerTemplateFamily.SPORT, SlotKind.NONE, "🏅", 1.3, null),
        tpl("sport.whistle", StickerTemplateFamily.SPORT, SlotKind.NONE, "🏟️", 1.0, StickerAnimation.SHAKE),
    )

    private val travel: List<StickerTemplate> = listOf(
        tpl("travel.plane", StickerTemplateFamily.TRAVEL, SlotKind.NONE, "✈️", 1.4, StickerAnimation.FLOAT),
        tpl("travel.suitcase", StickerTemplateFamily.TRAVEL, SlotKind.NONE, "🧳", 1.3, StickerAnimation.WOBBLE),
        tpl("travel.passport", StickerTemplateFamily.TRAVEL, SlotKind.NONE, "🛂", 1.2, null),
        tpl("travel.boardingPass", StickerTemplateFamily.TRAVEL, SlotKind.NONE, "🎫", 1.0, StickerAnimation.POP),
        tpl("travel.palm", StickerTemplateFamily.TRAVEL, SlotKind.NONE, "🌴", 1.4, StickerAnimation.SWING),
        tpl("travel.camper", StickerTemplateFamily.TRAVEL, SlotKind.NONE, "🚐", 1.3, StickerAnimation.BOUNCE),
        tpl("travel.hotel", StickerTemplateFamily.TRAVEL, SlotKind.NONE, "🏨", 1.3, null),
        tpl("travel.backpack", StickerTemplateFamily.TRAVEL, SlotKind.NONE, "🎒", 1.3, StickerAnimation.SWING),
        tpl("travel.train", StickerTemplateFamily.TRAVEL, SlotKind.NONE, "🚆", 1.4, StickerAnimation.SHAKE),
        tpl("travel.onMyWay", StickerTemplateFamily.TRAVEL, SlotKind.NONE, "🛣️", 1.0, StickerAnimation.TADA),
    )

    private val work: List<StickerTemplate> = listOf(
        tpl("work.laptop", StickerTemplateFamily.WORK, SlotKind.NONE, "💻", 1.3, StickerAnimation.BLINK),
        tpl("work.briefcase", StickerTemplateFamily.WORK, SlotKind.NONE, "💼", 1.3, null),
        tpl("work.idea", StickerTemplateFamily.WORK, SlotKind.NONE, "💡", 1.4, StickerAnimation.BLINK),
        tpl("work.checklist", StickerTemplateFamily.WORK, SlotKind.NONE, "📋", 1.2, StickerAnimation.POP),
        tpl("work.rocket", StickerTemplateFamily.WORK, SlotKind.NONE, "🚀", 1.4, StickerAnimation.FLOAT),
        tpl("work.chart", StickerTemplateFamily.WORK, SlotKind.NONE, "📈", 1.3, StickerAnimation.POP),
        tpl("work.brainstorm", StickerTemplateFamily.WORK, SlotKind.NONE, "🧠", 1.4, StickerAnimation.PULSE),
        tpl("work.done", StickerTemplateFamily.WORK, SlotKind.NONE, "✅", 1.0, StickerAnimation.TADA),
        tpl("work.team", StickerTemplateFamily.WORK, SlotKind.NONE, "🤝", 1.3, StickerAnimation.WOBBLE),
        tpl("work.remote", StickerTemplateFamily.WORK, SlotKind.NONE, "🏡", 1.0, null),
    )

    private val music: List<StickerTemplate> = listOf(
        tpl("music.note", StickerTemplateFamily.MUSIC, SlotKind.NONE, "🎵", 1.4, StickerAnimation.FLOAT),
        tpl("music.headphones", StickerTemplateFamily.MUSIC, SlotKind.NONE, "🎧", 1.3, StickerAnimation.PULSE),
        tpl("music.vinyl", StickerTemplateFamily.MUSIC, SlotKind.NONE, "💿", 1.3, StickerAnimation.SPIN),
        tpl("music.guitar", StickerTemplateFamily.MUSIC, SlotKind.NONE, "🎸", 1.4, StickerAnimation.WOBBLE),
        tpl("music.mic", StickerTemplateFamily.MUSIC, SlotKind.NONE, "🎤", 1.3, StickerAnimation.SWING),
        tpl("music.piano", StickerTemplateFamily.MUSIC, SlotKind.NONE, "🎹", 1.3, null),
        tpl("music.speaker", StickerTemplateFamily.MUSIC, SlotKind.NONE, "🔊", 1.3, StickerAnimation.SHAKE),
        tpl("music.nowPlaying", StickerTemplateFamily.MUSIC, SlotKind.NONE, "🎶", 1.0, StickerAnimation.POP),
        tpl("music.beat", StickerTemplateFamily.MUSIC, SlotKind.NONE, "🎛️", 1.2, StickerAnimation.BOUNCE),
        tpl("music.radio", StickerTemplateFamily.MUSIC, SlotKind.NONE, "📻", 1.2, StickerAnimation.BLINK),
    )

}

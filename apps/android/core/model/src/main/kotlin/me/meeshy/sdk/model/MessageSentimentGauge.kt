package me.meeshy.sdk.model

/** Les cinq paliers de la fiche « Sentiment » (seuils de `MessageDetailSentimentTab.swift`). */
enum class MessageSentimentTier(val emoji: String) {
    VeryNegative("😡"),
    Negative("😔"),
    Neutral("😐"),
    Positive("🙂"),
    VeryPositive("😄"),
    ;

    companion object {
        fun from(score: Double): MessageSentimentTier = when {
            score < -0.6 -> VeryNegative
            score < -0.2 -> Negative
            score < 0.2 -> Neutral
            score < 0.6 -> Positive
            else -> VeryPositive
        }
    }
}

/** Jauge de la fiche : le score de [SentimentAnalyzer] ramené sur `[-1, 1]`, le curseur sur `[0, 1]`. */
data class MessageSentimentGauge(val score: Double, val tier: MessageSentimentTier, val position: Float) {
    companion object {
        fun of(text: String): MessageSentimentGauge = fromScore(SentimentAnalyzer.score(text))

        fun fromScore(raw: Double): MessageSentimentGauge {
            val score = raw.coerceIn(-1.0, 1.0)
            return MessageSentimentGauge(score, MessageSentimentTier.from(score), ((score + 1.0) / 2.0).toFloat())
        }
    }
}

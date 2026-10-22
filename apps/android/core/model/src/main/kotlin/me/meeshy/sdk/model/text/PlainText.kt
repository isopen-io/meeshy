package me.meeshy.sdk.model.text

import me.meeshy.sdk.model.MessageSegment
import me.meeshy.sdk.model.MessageTextParser

/**
 * What one reads, without the notation — `**gras**` -> `gras`, `[doc](https://…)`
 * -> `doc`, `# Titre` -> `Titre`. Mirror of `plainTextOf`
 * (`packages/shared/utils/text-plain.ts`) and iOS `MessageTextRenderer.plainText`,
 * for one-line surfaces (conversation preview, screen-reader labels). DERIVED
 * from the two splitting laws, never from regexes of its own.
 */
object PlainText {

    fun of(text: String): String =
        TextBlocks.parse(text).joinToString("\n") { block ->
            when (block) {
                is TextBlock.Code -> block.text
                is TextBlock.ListBlock -> block.items.joinToString("\n", transform = ::inline)
                is TextBlock.Paragraph -> inline(block.text)
                is TextBlock.Heading -> inline(block.text)
                is TextBlock.Quote -> inline(block.text)
            }
        }

    private fun inline(text: String): String =
        MessageTextParser.parse(text).joinToString("") { segment ->
            when (segment) {
                is MessageSegment.Text -> segment.text
                is MessageSegment.Code -> segment.text
                is MessageSegment.MentionLink -> segment.display
                is MessageSegment.HashtagLink -> segment.display
                is MessageSegment.MeeshyTokenLink -> segment.display
                is MessageSegment.UrlLink -> segment.display
                is MessageSegment.Link -> LinkDisplayLaw.resolve(segment.written, null).let { it.text + it.remainder }
            }
        }
}

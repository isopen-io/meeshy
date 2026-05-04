import CoreText
import Foundation

#if canImport(UIKit)
import UIKit
#endif

public enum BubbleLayoutEngine {

    public struct LayoutResult: Sendable {
        public let size: CGSize
        public let lastLineWidth: CGFloat
        public let lineCount: Int
        public let timestampInline: Bool
    }

    public static let timestampWidth: CGFloat = 52
    public static let timestampInlineGap: CGFloat = 8
    @MainActor public static var globalLayoutEpoch: Int = 1

    @MainActor
    public static func invalidateAllLayouts() {
        globalLayoutEpoch += 1
    }

    /// Compute bubble size via CTFramesetter — thread-safe, call from any thread
    public static func computeLayout(
        content: String?,
        contentType: String,
        attachmentDimensions: CGSize?,
        replyPreview: Bool,
        reactionCount: Int,
        maxWidth: CGFloat
    ) -> LayoutResult {
        let bubblePadding: CGFloat = 12
        let timestampRowHeight: CGFloat = 18
        let replyPreviewHeight: CGFloat = replyPreview ? 44 : 0
        let reactionBarHeight: CGFloat = reactionCount > 0 ? 28 : 0
        let contentMaxWidth = maxWidth * 0.75 - (bubblePadding * 2)

        switch contentType {
        case "text":
            guard let text = content, !text.isEmpty else {
                return LayoutResult(
                    size: CGSize(width: 80, height: timestampRowHeight + bubblePadding * 2),
                    lastLineWidth: 0, lineCount: 0, timestampInline: false
                )
            }

            let font = CTFontCreateWithName("SFProText-Regular" as CFString, 16, nil)
            let attrString = CFAttributedStringCreate(
                nil, text as CFString,
                [kCTFontAttributeName: font] as CFDictionary
            )!
            let framesetter = CTFramesetterCreateWithAttributedString(attrString)

            var fitRange = CFRange()
            let textSize = CTFramesetterSuggestFrameSizeWithConstraints(
                framesetter,
                CFRange(location: 0, length: CFAttributedStringGetLength(attrString)),
                nil,
                CGSize(width: contentMaxWidth, height: .greatestFiniteMagnitude),
                &fitRange
            )

            let path = CGPath(
                rect: CGRect(origin: .zero,
                             size: CGSize(width: contentMaxWidth, height: textSize.height + 100)),
                transform: nil
            )
            let frame = CTFramesetterCreateFrame(
                framesetter,
                CFRange(location: 0, length: CFAttributedStringGetLength(attrString)),
                path, nil
            )
            let lines = (CTFrameGetLines(frame) as? [CTLine]) ?? []
            let lineCount = lines.count

            var lastLineWidth: CGFloat = 0
            if let lastLine = lines.last {
                var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
                lastLineWidth = CGFloat(CTLineGetTypographicBounds(lastLine, &ascent, &descent, &leading))
            }

            let spaceForTimestamp = contentMaxWidth - lastLineWidth
            let timestampInline = spaceForTimestamp >= (timestampWidth + timestampInlineGap)

            let textHeight = ceil(textSize.height)
            let totalHeight = textHeight
                + (timestampInline ? 0 : timestampRowHeight)
                + replyPreviewHeight
                + reactionBarHeight
                + bubblePadding * 2

            let totalWidth = ceil(max(
                textSize.width,
                timestampInline
                    ? lastLineWidth + timestampWidth + timestampInlineGap
                    : timestampWidth
            )) + bubblePadding * 2

            return LayoutResult(
                size: CGSize(width: min(totalWidth, maxWidth * 0.75), height: totalHeight),
                lastLineWidth: lastLineWidth,
                lineCount: lineCount,
                timestampInline: timestampInline
            )

        case "image", "video":
            guard let dims = attachmentDimensions else {
                return LayoutResult(
                    size: CGSize(width: 200, height: 200 + timestampRowHeight + reactionBarHeight),
                    lastLineWidth: 200, lineCount: 0, timestampInline: true
                )
            }
            let maxMediaWidth = maxWidth * 0.65
            let maxMediaHeight: CGFloat = 300
            let ratio = min(maxMediaWidth / dims.width, maxMediaHeight / dims.height, 1.0)
            return LayoutResult(
                size: CGSize(width: dims.width * ratio,
                             height: dims.height * ratio + timestampRowHeight + reactionBarHeight),
                lastLineWidth: dims.width * ratio,
                lineCount: 0,
                timestampInline: true
            )

        case "audio":
            return LayoutResult(
                size: CGSize(width: maxWidth * 0.65,
                             height: 56 + timestampRowHeight + reactionBarHeight),
                lastLineWidth: maxWidth * 0.65,
                lineCount: 0,
                timestampInline: true
            )

        default:
            return LayoutResult(
                size: CGSize(width: maxWidth * 0.6, height: 60 + reactionBarHeight),
                lastLineWidth: maxWidth * 0.6,
                lineCount: 0,
                timestampInline: false
            )
        }
    }
}

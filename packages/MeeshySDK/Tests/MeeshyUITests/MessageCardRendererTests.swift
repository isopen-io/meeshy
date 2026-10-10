import Testing
import Foundation
import UIKit
import MeeshySDK
@testable import MeeshyUI

/// La peinture réelle d'une carte : un PNG de 1080 px de large, signé Meeshy
/// dans ses métadonnées, pour chaque liaison et chaque typographie.
struct MessageCardRendererTests {

    private static func input(_ template: MessageCardTemplateID, quoted: Bool = true) -> MessageCardInput {
        MessageCardInput(
            quoted: quoted ? MessageCardPart(author: "Awa", text: "On se retrouve où ce soir ?") : nil,
            reply: MessageCardPart(author: "Jacques", text: "Chez Lina, à 20 h !"),
            template: template,
            handle: "jacques",
            title: "Soirée",
            date: "28 septembre 2026"
        )
    }

    @Test func render_paintsAPNGOfTheLayoutSize_signedMeeshy() throws {
        let card = try #require(MessageCardRenderer.render(Self.input(MessageCardTemplates.defaultID)))
        let image = try #require(UIImage(data: card.png))
        #expect(card.width == 1080)
        #expect(Int(image.size.width * image.scale) == 1080)
        #expect(Int(image.size.height * image.scale) == card.height)
        #expect(!card.truncated)
        #expect(MessageCardPNGMetadata.textChunks(of: card.png)["Software"] == "Meeshy")
    }

    @Test func render_everyLinkAndTypeface_producesAnImage() {
        for link in MessageCardLinkID.allCases {
            for typeface in MessageCardTypefaceID.allCases {
                let template = MessageCardTemplateID(palette: .editorial, typeface: typeface, link: link)
                #expect(MessageCardRenderer.render(Self.input(template)) != nil, "\(template)")
            }
        }
    }

    @Test func uiFont_storyFacesResolveToTheirStoryFont() {
        let poster = MessageCardRenderer.uiFont(MessageCardFont(face: .story(.poster), size: 40))
        #expect(poster.fontName == StoryTextStyle.poster.fontName)
        #expect(poster.pointSize == 40)
    }

    @Test func render_carriesTheTouchableRegionsOfItsLayout() throws {
        let card = try #require(MessageCardRenderer.render(Self.input(MessageCardTemplates.defaultID)))
        #expect(card.regions.map(\.part) == [.header, .quote, .link, .reply])
    }

    @Test func thumbnail_paintsTheSameCardAtTheGalleryWidth() throws {
        let card = try #require(MessageCardRenderer.render(Self.input(MessageCardTemplates.defaultID)))
        let thumb = try #require(MessageCardRenderer.thumbnail(Self.input(MessageCardTemplates.defaultID), width: 120, displayScale: 1))
        #expect(Int(thumb.size.width.rounded()) == 120)
        #expect(abs(Double(thumb.size.height) - Double(card.height) * 120 / 1080) < 1)
    }
}

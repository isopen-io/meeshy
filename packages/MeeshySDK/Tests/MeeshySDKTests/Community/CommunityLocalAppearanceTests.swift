import Foundation
import Testing
@testable import MeeshySDK

/// L'emoji et la couleur d'une communauté ne quittent pas l'appareil (#6380,
/// #6377) : la création, les réglages et le détail lisent et écrivent la MÊME
/// clé, par ce seul site.
struct CommunityLocalAppearanceTests {

    private func freshDefaults() -> UserDefaults {
        let suite = "community-local-appearance-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    @Test func uneCommunauteSansReglageLocal_nAniEmojiNiCouleur() {
        let appearance = CommunityLocalAppearance.read(communityId: "c1", from: freshDefaults())
        #expect(appearance.emoji == nil)
        #expect(appearance.color == nil)
    }

    @Test func lEmojiEcrit_seRelitPourCetteCommunauteSeulement() {
        let defaults = freshDefaults()
        CommunityLocalAppearance.writeEmoji("🚀", communityId: "c1", to: defaults)

        #expect(CommunityLocalAppearance.read(communityId: "c1", from: defaults).emoji == "🚀")
        #expect(CommunityLocalAppearance.read(communityId: "c2", from: defaults).emoji == nil)
    }

    @Test func unEmojiVide_effaceLeChoix() {
        let defaults = freshDefaults()
        CommunityLocalAppearance.writeEmoji("🚀", communityId: "c1", to: defaults)
        CommunityLocalAppearance.writeEmoji("  ", communityId: "c1", to: defaults)

        #expect(CommunityLocalAppearance.read(communityId: "c1", from: defaults).emoji == nil)
    }

    @Test func laCleEst_celleQueLesInstallationsExistantesOntDejaEcrite() {
        let defaults = freshDefaults()
        defaults.set("🎨", forKey: "community.emoji.c1")
        defaults.set("FF6B6B", forKey: "community.color.c1")

        let appearance = CommunityLocalAppearance.read(communityId: "c1", from: defaults)
        #expect(appearance.emoji == "🎨")
        #expect(appearance.color == "FF6B6B")
    }

    @Test func laCouleurEcrite_seRelit() {
        let defaults = freshDefaults()
        CommunityLocalAppearance.writeColor("4ECDC4", communityId: "c1", to: defaults)
        #expect(CommunityLocalAppearance.read(communityId: "c1", from: defaults).color == "4ECDC4")
    }
}

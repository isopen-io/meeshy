import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// La transition d'état d'un geste de sélection — la seule partie de la feuille
/// qui se décide sans UI, et donc la seule qui se teste en millisecondes.
struct ReferencePickerTests {

    @Test func test_tap_defaultsToSilent_fromThePicker() {
        // Depuis le chip hors-texte, le tap simple pose la référence la plus
        // discrète : la personne est notifiée, rien ne s'affiche.
        let result = ReferencePickerLogic.apply(
            .tap, username: "alice", userId: "u-a", to: [], context: .picker
        )
        #expect(result.map(\.display) == [.silent])
    }

    @Test func test_tap_defaultsToInline_fromTheTextList() {
        let result = ReferencePickerLogic.apply(
            .tap, username: "alice", userId: "u-a", to: [], context: .textList
        )
        #expect(result.map(\.display) == [.inline])
    }

    @Test func test_longPressChoice_overridesTheDefault() {
        let result = ReferencePickerLogic.apply(
            .choose(.pinned), username: "alice", userId: "u-a", to: [], context: .picker
        )
        #expect(result.map(\.display) == [.pinned])
    }

    @Test func test_choosingAgain_changesModeWithoutDuplicating() {
        let first = ReferencePickerLogic.apply(
            .tap, username: "alice", userId: "u-a", to: [], context: .picker
        )
        let second = ReferencePickerLogic.apply(
            .choose(.note), username: "alice", userId: "u-a", to: first, context: .picker
        )
        #expect(second.count == 1)
        #expect(second[0].display == .note)
    }
}

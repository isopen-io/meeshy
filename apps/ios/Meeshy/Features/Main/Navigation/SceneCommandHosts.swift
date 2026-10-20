import SwiftUI

struct NewConversationSheetHost: ViewModifier {
    @Binding var isPresented: Bool
    let statusViewModel: StatusViewModel

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $isPresented) {
                NewConversationView()
                    .environmentObject(statusViewModel)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .closesForConversationOpening(.sheet)
            }
            .modifier(PublishesSceneAction(keyPath: \.meeshyNewConversation, perform: { isPresented = true }))
    }
}

struct GlobalSearchCoverHost: ViewModifier {
    @Binding var isPresented: Bool
    let conversationViewModel: ConversationListViewModel
    let router: Router

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $isPresented) {
                GlobalSearchView()
                    .environmentObject(conversationViewModel)
                    .environmentObject(router)
            }
            .modifier(PublishesSceneAction(keyPath: \.meeshySearch, perform: { isPresented = true }))
    }
}

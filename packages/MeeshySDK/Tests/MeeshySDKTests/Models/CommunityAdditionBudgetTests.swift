import Foundation
import Testing
@testable import MeeshySDK

/// Le refus du budget d'ajouts sans accord (#19812) se lit par son code machine,
/// jamais par la phrase du serveur ni par le seul statut 429 (#20664).
struct CommunityAdditionBudgetTests {

    @Test func rejectedWithTheBudgetCode_isThrottled() {
        let error = MeeshyError.rejected(APIRejection(
            statusCode: 429, code: "COMMUNITY_ADDITION_BUDGET_EXCEEDED", message: "Trop d'ajouts"
        ))

        #expect(CommunityAdditionBudget.isThrottled(error))
    }

    @Test func bare429_isAnOrdinaryFailure() {
        #expect(!CommunityAdditionBudget.isThrottled(MeeshyError.server(statusCode: 429, message: "Trop de requetes")))
    }

    @Test func otherCodeOrOtherStatus_isNotThrottled() {
        #expect(!CommunityAdditionBudget.isThrottled(MeeshyError.rejected(APIRejection(
            statusCode: 429, code: "DAILY_COMMENT_LIMIT", message: "x"
        ))))
        #expect(!CommunityAdditionBudget.isThrottled(MeeshyError.rejected(APIRejection(
            statusCode: 400, code: "COMMUNITY_ADDITION_BUDGET_EXCEEDED", message: "x"
        ))))
        #expect(!CommunityAdditionBudget.isThrottled(MeeshyError.server(statusCode: 500, message: "x")))
    }
}

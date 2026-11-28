package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommunityAdditionBudgetTest {

    @Test
    fun `seul un 429 qui porte le code du budget est un refus du budget`() {
        assertThat(CommunityAdditionBudget.isThrottled(httpStatus = 429, code = "COMMUNITY_ADDITION_BUDGET_EXCEEDED")).isTrue()
        assertThat(CommunityAdditionBudget.isThrottled(httpStatus = 429, code = null)).isFalse()
        assertThat(CommunityAdditionBudget.isThrottled(httpStatus = 429, code = "DAILY_COMMENT_LIMIT")).isFalse()
        assertThat(CommunityAdditionBudget.isThrottled(httpStatus = 400, code = "COMMUNITY_ADDITION_BUDGET_EXCEEDED")).isFalse()
        assertThat(CommunityAdditionBudget.isThrottled(httpStatus = null, code = "COMMUNITY_ADDITION_BUDGET_EXCEEDED")).isFalse()
    }
}

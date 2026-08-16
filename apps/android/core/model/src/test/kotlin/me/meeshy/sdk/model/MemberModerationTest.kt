package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MemberModerationTest {

    // MARK: removal

    @Test
    fun nobody_can_remove_themselves_from_the_member_list() {
        MemberRole.entries.forEach { role ->
            assertThat(MemberModeration.canRemove(actor = role, target = role, isSelf = true)).isFalse()
        }
    }

    @Test
    fun the_creator_is_never_removable_even_by_another_creator() {
        MemberRole.entries.forEach { actor ->
            assertThat(
                MemberModeration.canRemove(actor = actor, target = MemberRole.CREATOR, isSelf = false),
            ).isFalse()
        }
    }

    @Test
    fun the_creator_can_remove_admins_moderators_and_members() {
        listOf(MemberRole.ADMIN, MemberRole.MODERATOR, MemberRole.MEMBER).forEach { target ->
            assertThat(
                MemberModeration.canRemove(actor = MemberRole.CREATOR, target = target, isSelf = false),
            ).isTrue()
        }
    }

    @Test
    fun an_admin_can_remove_another_admin() {
        assertThat(
            MemberModeration.canRemove(actor = MemberRole.ADMIN, target = MemberRole.ADMIN, isSelf = false),
        ).isTrue()
    }

    @Test
    fun a_moderator_can_remove_plain_members_only() {
        assertThat(
            MemberModeration.canRemove(actor = MemberRole.MODERATOR, target = MemberRole.MEMBER, isSelf = false),
        ).isTrue()
        assertThat(
            MemberModeration.canRemove(actor = MemberRole.MODERATOR, target = MemberRole.MODERATOR, isSelf = false),
        ).isFalse()
        assertThat(
            MemberModeration.canRemove(actor = MemberRole.MODERATOR, target = MemberRole.ADMIN, isSelf = false),
        ).isFalse()
    }

    @Test
    fun a_plain_member_can_remove_nobody() {
        MemberRole.entries.forEach { target ->
            assertThat(
                MemberModeration.canRemove(actor = MemberRole.MEMBER, target = target, isSelf = false),
            ).isFalse()
        }
    }

    // MARK: role changes

    @Test
    fun nobody_is_offered_role_actions_on_their_own_row() {
        MemberRole.entries.forEach { role ->
            assertThat(MemberModeration.roleActions(actor = role, target = role, isSelf = true)).isEmpty()
        }
    }

    @Test
    fun the_creator_s_own_role_is_never_changeable_by_anyone() {
        MemberRole.entries.forEach { actor ->
            assertThat(
                MemberModeration.roleActions(actor = actor, target = MemberRole.CREATOR, isSelf = false),
            ).isEmpty()
        }
    }

    @Test
    fun the_creator_can_promote_a_member_to_moderator_or_admin() {
        assertThat(
            MemberModeration.roleActions(actor = MemberRole.CREATOR, target = MemberRole.MEMBER, isSelf = false),
        ).containsExactly(MemberRoleAction.PROMOTE_MODERATOR, MemberRoleAction.PROMOTE_ADMIN).inOrder()
    }

    @Test
    fun the_creator_can_promote_a_moderator_to_admin_or_demote_them_to_member() {
        assertThat(
            MemberModeration.roleActions(actor = MemberRole.CREATOR, target = MemberRole.MODERATOR, isSelf = false),
        ).containsExactly(MemberRoleAction.PROMOTE_ADMIN, MemberRoleAction.DEMOTE_MEMBER).inOrder()
    }

    @Test
    fun the_creator_can_demote_an_admin_to_moderator_or_member() {
        assertThat(
            MemberModeration.roleActions(actor = MemberRole.CREATOR, target = MemberRole.ADMIN, isSelf = false),
        ).containsExactly(MemberRoleAction.DEMOTE_MODERATOR, MemberRoleAction.DEMOTE_MEMBER).inOrder()
    }

    @Test
    fun an_admin_gets_the_same_actions_as_the_creator_on_members_and_moderators() {
        assertThat(
            MemberModeration.roleActions(actor = MemberRole.ADMIN, target = MemberRole.MEMBER, isSelf = false),
        ).containsExactly(MemberRoleAction.PROMOTE_MODERATOR, MemberRoleAction.PROMOTE_ADMIN).inOrder()
        assertThat(
            MemberModeration.roleActions(actor = MemberRole.ADMIN, target = MemberRole.MODERATOR, isSelf = false),
        ).containsExactly(MemberRoleAction.PROMOTE_ADMIN, MemberRoleAction.DEMOTE_MEMBER).inOrder()
    }

    @Test
    fun an_admin_cannot_change_another_admin_s_role() {
        assertThat(
            MemberModeration.roleActions(actor = MemberRole.ADMIN, target = MemberRole.ADMIN, isSelf = false),
        ).isEmpty()
    }

    @Test
    fun a_moderator_cannot_change_anyone_s_role() {
        listOf(MemberRole.ADMIN, MemberRole.MODERATOR, MemberRole.MEMBER).forEach { target ->
            assertThat(
                MemberModeration.roleActions(actor = MemberRole.MODERATOR, target = target, isSelf = false),
            ).isEmpty()
        }
    }

    @Test
    fun a_plain_member_cannot_change_anyone_s_role() {
        listOf(MemberRole.ADMIN, MemberRole.MODERATOR, MemberRole.MEMBER).forEach { target ->
            assertThat(
                MemberModeration.roleActions(actor = MemberRole.MEMBER, target = target, isSelf = false),
            ).isEmpty()
        }
    }

    @Test
    fun every_offered_action_targets_a_role_the_gateway_accepts_on_the_wire() {
        // `PATCH /conversations/:id/participants/:userId/role` only enumerates
        // admin | moderator | member — `creator` is never a reachable target.
        assertThat(MemberRoleAction.entries.map { it.target })
            .containsNoneOf(MemberRole.CREATOR, null)
    }
}

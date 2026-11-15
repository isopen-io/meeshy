package me.meeshy.sdk.model.settings

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SettingsHubCatalogTest {

    @Test
    fun `sections follow the iOS order with voice then transcription slotted after appearance`() {
        assertThat(SettingsHubCatalog.sections().map { it.id }).containsExactly(
            SettingsHubSectionId.ACCOUNT,
            SettingsHubSectionId.APPEARANCE,
            SettingsHubSectionId.VOICE,
            SettingsHubSectionId.TRANSCRIPTION,
            SettingsHubSectionId.NOTIFICATIONS,
            SettingsHubSectionId.DATA,
            SettingsHubSectionId.TOOLS,
            SettingsHubSectionId.HELP,
            SettingsHubSectionId.ABOUT,
            SettingsHubSectionId.SIGN_OUT,
        ).inOrder()
    }

    @Test
    fun `account is privacy security blocked users and delete with no split security entries`() {
        val account = SettingsHubCatalog.sections().first { it.id == SettingsHubSectionId.ACCOUNT }

        assertThat(account.rows.map { it.id }).containsExactly(
            SettingsHubRowId.PRIVACY,
            SettingsHubRowId.SECURITY,
            SettingsHubRowId.BLOCKED_USERS,
            SettingsHubRowId.DELETE_ACCOUNT,
        ).inOrder()
    }

    @Test
    fun `a section whose rows are all hidden disappears`() {
        val hidden = setOf(SettingsHubRowId.HELP_CENTER)

        assertThat(SettingsHubCatalog.sections(hidden).map { it.id }).doesNotContain(SettingsHubSectionId.HELP)
    }

    @Test
    fun `hiding some rows keeps the section with the others`() {
        val tools = SettingsHubCatalog.sections(setOf(SettingsHubRowId.STATS))
            .first { it.id == SettingsHubSectionId.TOOLS }

        assertThat(tools.rows.map { it.id }).doesNotContain(SettingsHubRowId.STATS)
        assertThat(tools.rows).isNotEmpty()
    }

    @Test
    fun `only delete account and sign out are destructive and heavy`() {
        val rows = SettingsHubCatalog.sections().flatMap { it.rows }

        assertThat(rows.filter { it.destructive }.map { it.id })
            .containsExactly(SettingsHubRowId.DELETE_ACCOUNT, SettingsHubRowId.SIGN_OUT)
        assertThat(rows.filter { it.haptic == SettingsHubHaptic.HEAVY }.map { it.id })
            .containsExactly(SettingsHubRowId.DELETE_ACCOUNT, SettingsHubRowId.SIGN_OUT)
    }

    @Test
    fun `every row appears once and hiding everything yields nothing`() {
        val ids = SettingsHubCatalog.sections().flatMap { it.rows }.map { it.id }

        assertThat(ids).containsNoDuplicates()
        assertThat(ids).containsExactlyElementsIn(SettingsHubRowId.entries)
        assertThat(SettingsHubCatalog.sections(SettingsHubRowId.entries.toSet())).isEmpty()
    }
}

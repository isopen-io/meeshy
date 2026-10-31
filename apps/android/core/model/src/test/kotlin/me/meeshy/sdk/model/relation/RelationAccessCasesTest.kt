package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.AgeClass
import me.meeshy.sdk.model.PlatformRole
import org.junit.Test

/**
 * LA LOI D'ACCÈS DES CERCLES, côté Android (#13927) : le miroir Kotlin rejoue les cas COMMUNS
 * `packages/shared/fixtures/relation-access-cases.json`, écrits à la main pour la loi TypeScript `resolveRelationAccess`
 * (même fichier que le miroir Swift). Il ne décide d'AUCUN accès : il sert à ne pas PROPOSER ce que le serveur refusera.
 * Un seuil, une garde ou un ordre de verdicts qui dériverait du TypeScript rougit ici.
 */
class RelationAccessCasesTest {

    private fun sharedText(path: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, path)
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        throw AssertionError("Fichier partagé introuvable : $path")
    }

    private class SharedCase(val id: String, val input: JsonObject, val expected: JsonObject)

    private val cases: List<SharedCase> =
        Json.parseToJsonElement(sharedText("packages/shared/fixtures/relation-access-cases.json"))
            .jsonObject.getValue("cases").jsonArray.map {
                val case = it.jsonObject
                SharedCase(
                    id = case.getValue("id").jsonPrimitive.content,
                    input = case.getValue("input").jsonObject,
                    expected = case.getValue("expected").jsonObject,
                )
            }

    private fun JsonObject.text(key: String): String? =
        this[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull

    private fun JsonObject.flag(key: String): Boolean = getValue(key).jsonPrimitive.content.toBoolean()

    private fun featureOf(case: SharedCase): RelationFeature =
        requireNotNull(RelationFeature.of(case.input.text("feature"))) {
            "feature inconnue du miroir : ${case.input.text("feature")}"
        }

    private fun lawInput(case: SharedCase): RelationAccessInput = RelationAccessInput(
        viewerId = case.input.getValue("viewerId").jsonPrimitive.content,
        targetId = case.input.getValue("targetId").jsonPrimitive.content,
        grantedByViewer = RelationLevel.of(case.input.text("grantedByViewer")),
        grantedByTarget = RelationLevel.of(case.input.text("grantedByTarget")),
        sharesCommunity = case.input.flag("sharesCommunity"),
        blockedEitherWay = case.input.flag("blockedEitherWay"),
        viewerMinor = AgeClass.from(case.input.text("viewerMinor")),
        targetMinor = AgeClass.from(case.input.text("targetMinor")),
        viewerRole = PlatformRole.caseFolding(case.input.text("viewerRole")),
        feature = featureOf(case),
        consent = case.input.text("consent")?.let { RelationConsent.of(it) },
    )

    private fun input(
        feature: RelationFeature,
        level: RelationLevel = RelationLevel.BLOOD,
        viewerMinor: AgeClass = AgeClass.ADULT,
        targetMinor: AgeClass = AgeClass.ADULT,
        viewerRole: PlatformRole? = PlatformRole.USER,
        consent: RelationConsent? = null,
    ): RelationAccessInput = RelationAccessInput(
        viewerId = "a",
        targetId = "b",
        grantedByViewer = level,
        grantedByTarget = level,
        sharesCommunity = false,
        blockedEitherWay = false,
        viewerMinor = viewerMinor,
        targetMinor = targetMinor,
        viewerRole = viewerRole,
        feature = feature,
        consent = consent,
    )

    // ── Le fichier commun ──

    @Test
    fun `the shared file carries cases, never zero`() {
        assertThat(cases.size).isAtLeast(60)
    }

    @Test
    fun `every shared case gives the same verdict as the TypeScript law`() {
        cases.forEach { case ->
            val actual = RelationAccess.resolve(lawInput(case))
            val label = "cas ${case.id}"
            assertWithMessage("$label : allowed").that(actual.allowed).isEqualTo(case.expected.flag("allowed"))
            assertWithMessage("$label : effectiveLevel").that(actual.effectiveLevel.wire)
                .isEqualTo(case.expected.text("effectiveLevel"))
            assertWithMessage("$label : reason").that(actual.reason.wire).isEqualTo(case.expected.text("reason"))
            assertWithMessage("$label : requiresConsent").that(actual.requiresConsent)
                .isEqualTo(case.expected.flag("requiresConsent"))
        }
    }

    @Test
    fun `the shared cases cover every feature and every verdict reason`() {
        assertThat(cases.map(::featureOf).toSet()).isEqualTo(RelationFeature.entries.toSet())
        assertThat(cases.mapNotNull { it.expected.text("reason") }.toSet())
            .isEqualTo(RelationAccessReason.entries.map { it.wire }.toSet())
    }

    // ── La table du TypeScript, relue pour que le miroir ne dérive pas ──

    private val levelsSource: String get() = sharedText("packages/shared/utils/relation-levels.ts")

    private fun blockAfter(marker: String, terminator: String, text: String): String {
        val start = text.indexOf(marker)
        assertWithMessage("repère $marker").that(start).isAtLeast(0)
        val tail = text.substring(start + marker.length)
        val end = tail.indexOf(terminator)
        assertWithMessage("fin de $marker").that(end).isAtLeast(0)
        return tail.substring(0, end)
    }

    private fun featureSet(name: String): Set<String> {
        val declaration = blockAfter("export const $name", "]);", levelsSource)
        val body = declaration.substringAfter("new Set<RelationFeature>([")
        return Regex("'([\\w.]+)'").findAll(body).map { it.groupValues[1] }.toSet()
    }

    @Test
    fun `the minimum level of every feature is the one of the TypeScript table`() {
        val table = blockAfter("export const RELATION_FEATURE_MIN_LEVEL", "};", levelsSource)
        val declared = Regex("(?:'([\\w.]+)'|(\\w+)):\\s*'([A-Z]+)'").findAll(table)
            .associate { row -> (row.groupValues[1].ifEmpty { row.groupValues[2] }) to row.groupValues[3] }
        assertThat(declared.size).isEqualTo(RelationFeature.entries.size)
        RelationFeature.entries.forEach { feature ->
            assertWithMessage(feature.wire).that(declared[feature.wire]).isEqualTo(feature.minimumLevel.wire)
        }
    }

    @Test
    fun `the consent, directed and presence sets are the ones of the TypeScript table`() {
        assertThat(RelationFeature.entries.filter { it.requiresConsent }.map { it.wire }.toSet())
            .isEqualTo(featureSet("RELATION_CONSENT_FEATURES"))
        assertThat(RelationFeature.entries.filter { it.isDirected }.map { it.wire }.toSet())
            .isEqualTo(featureSet("RELATION_DIRECTED_FEATURES"))
        assertThat(RelationFeature.entries.filter { it.isPresence }.map { it.wire }.toSet())
            .isEqualTo(featureSet("RELATION_PRESENCE_FEATURES"))
    }

    @Test
    fun `the features are the ones of the TypeScript list, in the same order`() {
        val declaration = blockAfter("export const RELATION_FEATURES = [", "] as const", levelsSource)
        val declared = Regex("'([\\w.]+)'").findAll(declaration).map { it.groupValues[1] }.toList()
        assertThat(RelationFeature.entries.map { it.wire }).containsExactlyElementsIn(declared).inOrder()
    }

    @Test
    fun `the levels are ordered as in the TypeScript scale`() {
        val source = sharedText("packages/shared/types/relation.ts")
        val scale = blockAfter("export const RELATION_LEVELS = [", "] as const", source)
        val declared = Regex("'([A-Z]+)'").findAll(scale).map { it.groupValues[1] }.toList()
        assertThat(RelationLevel.entries.sorted().map { it.wire }).containsExactlyElementsIn(declared).inOrder()
        assertThat(declared).hasSize(6)
    }

    // ── Les lectures fermées par défaut ──

    @Test
    fun `an unreadable level reads public, never higher`() {
        assertThat(RelationLevel.of("GALAXY")).isEqualTo(RelationLevel.PUBLIC)
        assertThat(RelationLevel.of("ATOM")).isEqualTo(RelationLevel.PUBLIC)
        assertThat(RelationLevel.of("blood")).isEqualTo(RelationLevel.PUBLIC)
        assertThat(RelationLevel.of(null)).isEqualTo(RelationLevel.PUBLIC)
        assertThat(RelationLevel.of("BLOOD")).isEqualTo(RelationLevel.BLOOD)
    }

    @Test
    fun `a lower-case role still reads as administrator, like the TypeScript law`() {
        val access = RelationAccess.resolve(
            input(RelationFeature.PRESENCE_DETAILED, level = RelationLevel.PUBLIC, viewerRole = PlatformRole.caseFolding("admin")),
        )
        assertThat(access.reason).isEqualTo(RelationAccessReason.ROLE)
        assertThat(access.allowed).isTrue()
    }

    @Test
    fun `a missing consent is an unknown one and keeps the feature closed`() {
        val access = RelationAccess.resolve(input(RelationFeature.LOCATION_LIVE, consent = null))
        assertThat(access.allowed).isFalse()
        assertThat(access.reason).isEqualTo(RelationAccessReason.CONSENT)
        assertThat(access.requiresConsent).isTrue()
    }

    @Test
    fun `an unreadable consent keeps the feature closed`() {
        val access = RelationAccess.resolve(
            input(RelationFeature.LOCATION_LIVE, consent = RelationConsent.of("GRANTED")),
        )
        assertThat(access.allowed).isFalse()
        assertThat(access.reason).isEqualTo(RelationAccessReason.CONSENT)
        assertThat(RelationConsent.of("granted")).isEqualTo(RelationConsent.GRANTED)
    }

    @Test
    fun `an unreadable age is an unknown one, never an adult`() {
        assertThat(AgeClass.from("teen")).isEqualTo(AgeClass.UNKNOWN)
        assertThat(AgeClass.from(null)).isEqualTo(AgeClass.UNKNOWN)
        assertThat(AgeClass.from("minor")).isEqualTo(AgeClass.MINOR)
    }

    // ── Un ancien client contre un serveur plus récent ──

    @Test
    fun `a feature the mirror does not know is no case, never a crash`() {
        assertThat(RelationFeature.of("relay.everywhere")).isNull()
        assertThat(RelationFeature.of(null)).isNull()
        assertThat(RelationFeature.of("location.live")).isEqualTo(RelationFeature.LOCATION_LIVE)
    }

    @Test
    fun `a minor and an unknown age never meet automatically, but blood stays open behind consent`() {
        val automatic = RelationAccess.resolve(
            input(
                RelationFeature.ACQUAINTANCE_AUTO,
                viewerMinor = AgeClass.MINOR,
                targetMinor = AgeClass.from("teen"),
            ),
        )
        assertThat(automatic.reason).isEqualTo(RelationAccessReason.MINOR)
        val location = RelationAccess.resolve(
            input(RelationFeature.LOCATION_LIVE, viewerMinor = AgeClass.MINOR, consent = RelationConsent.GRANTED),
        )
        assertThat(location.allowed).isTrue()
    }
}

package me.meeshy.feature.kit

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * Le registre du chantier (`.claude/workflows/meeshy-kit-planche.lots.json`) dit quels composants le kit doit porter ;
 * le catalogue dit lesquels il porte. Cette garde les met face à face : un composant LIVRÉ (son fichier existe) a une
 * entrée non vide, son témoin `<Nom>Test`, et les images de chacun de ses états ; un composant qui n'existe pas encore
 * a une entrée VIDE, donc n'apparaît pas. Miroir de `KitRegistryGuardTests` (iOS).
 */
class KitRegistryGuardTest {

    private fun lots(): List<KitRegistryAudit.Lot> {
        val root = Json.parseToJsonElement(KitRepository.registry.readText()).jsonObject
        val all: JsonArray = root.getValue("lots").jsonArray
        return all.map { it.jsonObject }
            .filter { it.string("type") == "kit" }
            .map { KitRegistryAudit.Lot(key = it.string("cle")!!, name = it.string("nom")!!, target = it.string("cible_android")!!) }
    }

    private fun JsonObject.string(name: String): String? = get(name)?.jsonPrimitive?.content

    private fun boardViewIds(): Set<String> {
        val html = KitRepository.board.readText()
        val table = html.indexOf("const S=[")
        assertWithMessage("la table S a disparu de la planche").that(table).isAtLeast(0)
        return Regex("""\{id:'([A-Z]+[0-9]+)'""").findAll(html.substring(table)).map { it.groupValues[1] }.toSet()
    }

    private fun disk(lots: List<KitRegistryAudit.Lot>): KitRegistryAudit.Disk {
        val existing = KitRegistryAudit.candidatePaths(lots).filter { File(KitRepository.repositoryRoot, it).exists() }.toSet()
        val snapshots = KitRepository.snapshots
        val images = snapshots.walkTopDown().filter { it.isFile }.map { it.relativeTo(snapshots).invariantPath() }.toList()
        return KitRegistryAudit.Disk(existing, images)
    }

    private fun File.invariantPath(): String = path.replace(File.separatorChar, '/')

    @Test
    fun `le registre est lu`() {
        assertThat(lots()).hasSize(25)
    }

    @Test
    fun `les entrees egalent les cles et les noms du registre`() {
        val lots = lots()

        assertThat(MeeshyKitCatalog.entries.map { it.key }).containsExactlyElementsIn(lots.map { it.key }).inOrder()
        assertThat(MeeshyKitCatalog.entries.map { it.name }).containsExactlyElementsIn(lots.map { it.name }).inOrder()
    }

    @Test
    fun `chaque lot du registre est en regle avec le catalogue`() {
        val lots = lots()

        val problems = KitRegistryAudit.problems(lots, MeeshyKitCatalog.entries, boardViewIds(), disk(lots))

        assertWithMessage(problems.joinToString("\n")).that(problems).isEmpty()
    }

    @Test
    fun `la cible Android de chaque lot est dans le kit de sdk-ui`() {
        lots().forEach {
            assertThat(it.target).startsWith("apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit/")
        }
    }

    @Test
    fun `la table de la planche porte ses vues`() {
        assertThat(boardViewIds()).containsAtLeast("R1", "R3", "A2", "O1", "S1", "P1", "C1", "I1")
    }
}

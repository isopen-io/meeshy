package me.meeshy.app.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.Country
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.util.Locale

/**
 * Le catalogue des pays, noms localisés compris — construit UNE fois par
 * composition. Il pèse deux cent trente entrées à trier : le reconstruire à
 * chaque frappe du champ téléphone se voyait.
 */
@Composable
internal fun rememberCountryCatalog(): List<Country> =
    remember { CountryCatalog.build(::countryDisplayName) }

/**
 * Le pays choisi. Un code inconnu du catalogue rend quand même une entrée —
 * avec son drapeau déduit et, à défaut d'indicatif, une chaîne vide : un bouton
 * d'indicatif vide reste tapable, un bouton absent ne l'est pas.
 */
internal fun selectedCountry(iso: String, countries: List<Country>): Country =
    countries.firstOrNull { it.iso == iso } ?: Country(
        iso = iso,
        name = iso,
        dialCode = CountryCatalog.dialCode(iso).orEmpty(),
        flag = CountryCatalog.flag(iso),
    )

/**
 * La feuille de choix du pays de l'indicatif : une recherche, puis la liste
 * triée pays-prioritaires d'abord.
 *
 * Filtre et libellé d'accessibilité viennent verbatim de [CountryCatalog], le
 * SSOT déjà livré — cette feuille ne décide de rien, elle rend.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CountryPickerSheet(
    countries: List<Country>,
    onSelect: (Country) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(query, countries) { CountryCatalog.search(query, countries) }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg)) {
            Text(
                text = stringResource(R.string.signup_country_picker_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(bottom = MeeshySpacing.sm),
            )
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                placeholder = { Text(stringResource(R.string.signup_country_search_hint)) },
                modifier = Modifier.fillMaxWidth(),
            )
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 420.dp)
                    .padding(vertical = MeeshySpacing.sm),
            ) {
                items(filtered, key = { it.iso }) { country ->
                    val rowLabel = CountryCatalog.accessibilityLabel(country)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(country) }
                            .padding(vertical = MeeshySpacing.sm)
                            .semantics { contentDescription = rowLabel },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                    ) {
                        Text(text = country.flag, style = MaterialTheme.typography.titleMedium)
                        Text(
                            text = country.name,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MeeshyTheme.tokens.textPrimary,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = country.dialCode,
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                }
            }
        }
    }
}

/** Résolveur de nom localisé injecté dans [CountryCatalog.build]. */
private fun countryDisplayName(iso: String): String = Locale("", iso).displayCountry

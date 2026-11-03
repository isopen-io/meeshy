package me.meeshy.app.stories

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshySpacing

/** La barre de suppression en masse, ancrée en bas : le conteneur ne la montre qu'avec une sélection vivante. */
@Composable
internal fun MyStoriesBulkBar(count: Int, onDelete: () -> Unit, modifier: Modifier = Modifier) {
    Button(
        onClick = onDelete,
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.error,
            contentColor = MaterialTheme.colorScheme.onError,
        ),
        modifier = modifier.fillMaxWidth().navigationBarsPadding().padding(MeeshySpacing.lg),
    ) {
        Text(stringResource(R.string.my_stories_delete_selected, count))
    }
}

package me.meeshy.app.conversations.links

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Un champ de feuille de création : son libellé au-dessus, le libellé aussi porté par le champ (lecteur d'écran). */
@Composable
internal fun LinkField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    accent: Color,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    lowercase: Boolean = false,
    singleLine: Boolean = true,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
            placeholder = placeholder?.let { { Text(it, color = MeeshyTheme.tokens.textMuted) } },
            singleLine = singleLine,
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                capitalization = if (lowercase) KeyboardCapitalization.None else KeyboardCapitalization.Sentences,
            ),
        )
    }
}

/** Le bouton plein de validation d'une feuille : grisé tant que le formulaire est invalide, un cercle pendant l'envoi. */
@Composable
internal fun LinkPrimaryButton(
    text: String,
    enabled: Boolean,
    isLoading: Boolean,
    accent: Color,
    inProgressDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !isLoading,
        modifier = modifier
            .fillMaxWidth()
            .height(52.dp)
            .semantics { if (isLoading) stateDescription = inProgressDescription },
        colors = ButtonDefaults.buttonColors(containerColor = accent, disabledContainerColor = accent.copy(alpha = 0.4f)),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
            if (isLoading) {
                CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
            }
            Text(text, fontWeight = FontWeight.SemiBold, color = Color.White)
        }
    }
}

@Composable
internal fun LinkFormError(message: String) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.Medium,
        color = MeeshyTheme.tokens.error,
        modifier = Modifier.padding(horizontal = MeeshySpacing.xs),
    )
}

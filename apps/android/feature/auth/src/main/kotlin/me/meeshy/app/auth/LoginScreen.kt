package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.ui.component.BrandLogo
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.theme.MeeshyTheme

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onAuthenticated: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated) onAuthenticated()
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MeeshyTheme.tokens.backgroundPrimary) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            BrandLogo()

            Text(
                text = "Welcome back",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(top = 24.dp),
            )

            OutlinedTextField(
                value = state.username,
                onValueChange = viewModel::onUsernameChange,
                label = { Text("Username") },
                singleLine = true,
                enabled = !state.isSubmitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp),
            )

            OutlinedTextField(
                value = state.password,
                onValueChange = viewModel::onPasswordChange,
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                enabled = !state.isSubmitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
            )

            state.errorMessage?.let { message ->
                Text(
                    text = message,
                    color = MeeshyTheme.tokens.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )
            }

            MeeshyPrimaryButton(
                text = "Log in",
                onClick = viewModel::login,
                enabled = state.canSubmit,
                loading = state.isSubmitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp),
            )
        }
    }
}

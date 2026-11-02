package me.meeshy.ui.sticker

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.StickerSheetPage
import me.meeshy.sdk.model.StickerSheetPageModel
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'onglet Recherche : le champ, puis le catalogue. Une requête vide montre tout ; sinon les FAMILLES (les
 * packs dont le titre correspond, sans casse ni accents) mènent à leur page, suivies des emoji trouvés par
 * mots-clés — le surplus assumé d'Android. Rien ne correspond : « Aucune famille ne correspond. »
 */
internal fun LazyGridScope.stickerSearchContent(
    query: String,
    onQueryChange: (String) -> Unit,
    capabilities: StickerCapabilities,
    packEntries: List<StickerSheetTabEntry>,
    onSelectPage: (StickerSheetPage) -> Unit,
    actions: StickerCellActions,
    smileysTitle: String,
    noResultTitle: String,
) {
    item(key = "search:field", span = { GridItemSpan(maxLineSpan) }, contentType = "field") {
        StickerSearchField(query, onQueryChange)
    }
    if (query.isBlank()) {
        capabilities.emojiCategories.forEach { category ->
            stickerSectionHeader("cat:${category.id}", category.title)
            stickerEmojiCells("cat:${category.id}", category.emojis, actions)
        }
        return
    }
    val families = StickerSheetPageModel.filterByTitle(packEntries, query) { it.title }
    val emojis = capabilities.emojiSearch(query)
    if (families.isEmpty() && emojis.isEmpty()) {
        item(key = "search:empty", span = { GridItemSpan(maxLineSpan) }, contentType = "empty") {
            Text(
                text = noResultTitle,
                color = MeeshyTheme.tokens.textMuted,
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xxl),
            )
        }
        return
    }
    families.forEach { family ->
        item(key = "search:family:${family.page.id}", span = { GridItemSpan(maxLineSpan) }, contentType = "family") {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable { onSelectPage(family.page) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                Icon(family.icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
                Text(family.title, color = MeeshyTheme.tokens.textPrimary, fontSize = 15.sp)
            }
        }
    }
    if (emojis.isNotEmpty()) {
        stickerSectionHeader("search:emoji", smileysTitle)
        stickerEmojiCells("search", emojis, actions)
    }
}

@Composable
private fun StickerSearchField(query: String, onQueryChange: (String) -> Unit) {
    val prompt = stringResource(R.string.sticker_sheet_search_prompt)
    val clear = stringResource(R.string.sticker_sheet_search_clear)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MeeshyTheme.tokens.inputBackground)
            .heightIn(min = 48.dp)
            .padding(horizontal = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(Icons.Filled.Search, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(18.dp))
        BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            singleLine = true,
            textStyle = TextStyle(color = MeeshyTheme.tokens.textPrimary, fontSize = 14.sp),
            cursorBrush = SolidColor(MeeshyPalette.Indigo500),
            modifier = Modifier.weight(1f),
            decorationBox = { inner ->
                if (query.isEmpty()) Text(prompt, color = MeeshyTheme.tokens.textMuted, fontSize = 14.sp)
                inner()
            },
        )
        if (query.isNotEmpty()) {
            IconButton(onClick = { onQueryChange("") }) {
                Icon(Icons.Filled.Close, contentDescription = clear, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(18.dp))
            }
        }
    }
}

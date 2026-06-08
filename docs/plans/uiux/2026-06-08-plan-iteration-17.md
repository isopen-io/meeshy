# UI/UX Plan — Iteration 17 (2026-06-08)

Based on `docs/analyses/uiux/2026-06-08-iteration-17.md`.

## Web Pass 1 — viewers.json: 3 new text.* keys (4 locales)

Add under `text` in all 4 `viewers.json` files:
- `copied`: "Copied to clipboard" / "Copié dans le presse-papiers" / "Copiado al portapapeles" / "Copiado para a área de transferência"
- `copyError`: "Unable to copy" / "Impossible de copier" / "No se pudo copiar" / "Não foi possível copiar"
- `loadError`: "Unable to load file" / "Impossible de charger le fichier" / "No se pudo cargar el archivo" / "Não foi possível carregar o arquivo"

## Web Pass 2 — admin.json: 2 new security.* keys (4 locales)

Add under `security` in all 4 `admin.json` files (or create `security` subsection):
- `enable2FA`: "Enable 2FA" / "Activer 2FA" / "Activar 2FA" / "Ativar 2FA"
- `disable2FA`: "Disable 2FA" / "Désactiver 2FA" / "Desactivar 2FA" / "Desativar 2FA"

## Web Pass 3 — TextLightbox.tsx (6 fixes)

Add `const { t: tViewers } = useI18n('viewers')` alongside existing `useI18n('common')`.

- L234: wordWrap aria-label → `tViewers('text.disableWordWrap')` / `tViewers('text.enableWordWrap')`
- L249: copy aria-label → `tViewers('text.copy')`
- L273: download aria-label → `tViewers('text.download')`
- L192: copied toast → `tViewers('text.copied')`
- L196: copyError toast → `tViewers('text.copyError')`
- L307: load error → `tViewers('text.loadError')`

## Web Pass 4 — PPTXLightbox.tsx (1 fix)

`t` already bound to `useI18n('common')`.
- L92: `aria-label="Télécharger la présentation"` → `aria-label={t('common.download')}`

## Web Pass 5 — SimpleAudioPlayer.tsx (1-2 fixes)

Add `useI18n('common')` if not present.
- L261: `aria-label="Télécharger l'audio"` → `aria-label={t('common.download')}`
- L261: `title="Télécharger l'audio"` → remove title or replace with `t('common.download')`

## Web Pass 6 — UserSecuritySection.tsx (1 fix)

Add `useI18n('admin')`.
- L170: `{has2FA ? 'Désactiver 2FA' : 'Activer 2FA'}` → `{has2FA ? t('admin.security.disable2FA') : t('admin.security.enable2FA')}`

## Web Pass 7 — PDFViewer.tsx (1 fix)

Add `useI18n('viewers')` if not present.
- L77: `'Impossible de charger le PDF'` → `t('viewers.pdf.loadError')`

## Web Pass 8 — AudioRecorderCard.tsx (1 fix)

Add `microphoneError` key to `audioEffects.json` (all 4 locales), or use nearest existing namespace.
- L309: French toast → `t('audioEffects.microphoneError')`

## iOS Pass 1 — Fix magic link localization key names

**MeeshyApp.swift**: change literal French keys to English identifiers.
**Router.swift**: same change.

- `"Connexion reussie !"` → `"magicLink.success"` with `defaultValue: "Login successful!"`
- `"Lien invalide ou expire"` → `"magicLink.error.invalidLink"` with `defaultValue: "Invalid or expired link"`

## Checklist

- [ ] W1 — 3 keys added to 4 viewers.json files (text.copied/copyError/loadError)
- [ ] W2 — 2 keys added to 4 admin.json files (security.enable2FA/disable2FA)
- [ ] W3 — TextLightbox 6× French → tViewers()
- [ ] W4 — PPTXLightbox 1× aria-label → t('common.download')
- [ ] W5 — SimpleAudioPlayer 1× aria-label + title → t('common.download')
- [ ] W6 — UserSecuritySection 1× French button text → t()
- [ ] W7 — PDFViewer 1× French error → tViewers('pdf.loadError')
- [ ] W8 — AudioRecorderCard 1× French toast → t()
- [ ] I1 — MeeshyApp + Router magic link key names fixed
- [ ] Commit & push
- [ ] CI green
- [ ] Merge into main

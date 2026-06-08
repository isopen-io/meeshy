# Plan UI/UX — Itération 2 (2026-06-08)

## Objectif

Corriger les issues HIGH et une MEDIUM identifiées dans `2026-06-08-iteration-2.md`.

## Changements Web

### 1. Locales calls.json (en/fr/es/pt)
Créer `apps/web/locales/{en,fr,es,pt}/calls.json` avec les clés :
- `calls.loading`, `calls.banner.inProgress`, `calls.banner.participant`, `calls.banner.participants`, `calls.banner.join`, `calls.banner.dismiss`
- `calls.error.title`, `calls.error.message`, `calls.error.tryAgain`, `calls.error.returnHome`
- `calls.error.troubleshooting.*` (5 items)

### 2. OngoingCallBanner.tsx — i18n + dark mode bouton
- Ajouter `useI18n('calls')` 
- Remplacer toutes les strings hardcodées par `t()`
- Pluralisation du compteur participants via ternaire `t(n === 1 ? 'calls.banner.participant' : 'calls.banner.participants')`
- Bouton Join : `bg-white text-green-700 hover:bg-green-50` → `bg-white/90 dark:bg-white/10 text-green-700 dark:text-white hover:bg-white/80 dark:hover:bg-white/20`
- Bouton Dismiss : ajouter `aria-label={t('calls.banner.dismiss')}`

### 3. VideoCallInterface.tsx — "Loading call..."
- Ligne 503 : `"Loading call..."` → `{t('calls.loading')}`
- Ajouter `useI18n('calls')` (ou réutiliser si déjà présent)

### 4. CallErrorBoundary.tsx — extract + i18n
- Extraire la fallback UI vers un composant fonctionnel `CallErrorDisplay` (même fichier)
- `CallErrorDisplay` utilise `useI18n('calls')`
- `CallErrorBoundary.render()` délègue à `<CallErrorDisplay error={...} onReset={...} />`

## Changements iOS

### 5. ConversationView+Composer.swift — labelForAttachment i18n
Remplacer les 5 cases par `String(localized:defaultValue:bundle:)` :
```swift
case .image:    return String(localized: "attachment.label.photo", defaultValue: "Photo", bundle: .main)
case .video:    return String(localized: "attachment.label.video", defaultValue: "Video", bundle: .main)
case .audio:    return attachment.durationFormatted ?? String(localized: "attachment.label.audio", defaultValue: "Audio", bundle: .main)
case .file:     return attachment.originalName.isEmpty ? String(localized: "attachment.label.file", defaultValue: "File", bundle: .main) : attachment.originalName
case .location: return String(localized: "attachment.label.location", defaultValue: "Location", bundle: .main)
```

## Statut

- [x] Analyse créée
- [x] Plan créé
- [x] Locales calls.json (en/fr/es/pt)
- [x] OngoingCallBanner.tsx i18n + dark mode
- [x] VideoCallInterface.tsx loading i18n
- [x] CallErrorBoundary.tsx extract + i18n
- [x] iOS: labelForAttachment i18n
- [ ] Commit + push
- [ ] CI pass
- [ ] Merge dans main

# Audit des Composants Settings

**Date:** 2026-01-19
**Audité selon:** Web Interface Guidelines + Vercel React Best Practices
**Composants:** language-settings.tsx, theme-settings.tsx, encryption-settings.tsx

---

## 📊 Score Global

| Composant | Accessibilité | Performance | UX | Score |
|-----------|---------------|-------------|----| ------|
| language-settings | ⚠️ 7/10 | ✅ 9/10 | ✅ 9/10 | **83%** |
| theme-settings | ⚠️ 6/10 | ✅ 8/10 | ✅ 8/10 | **73%** |
| encryption-settings | ✅ 9/10 | ✅ 9/10 | ✅ 9/10 | **90%** |

---

## 🔴 Problèmes Critiques

### language-settings.tsx

#### 1. **N'utilise PAS usePreferences hook** (Ligne 23-108)
**Problème:** Gestion manuelle des fetch au lieu du pattern standard
**Impact:** Pas d'optimistic updates, pas de gestion centralisée des erreurs, code dupliqué

```tsx
// ❌ Actuel - Fetch manuel
const handleSave = async () => {
  const response = await fetch(buildApiUrl('/users/me'), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authManager.getAuthToken()}`
    },
    body: JSON.stringify(settings)
  });
}

// ✅ Attendu - usePreferences
const { data, updatePreferences, isUpdating } = usePreferences<'language'>('language');
await updatePreferences({ systemLanguage: value });
```

**Référence:** privacy-settings.tsx:36-48

#### 2. **Emojis non accessibles** (Lignes 215, 283)
**Problème:** Utilise `⚠️` et `💡` au lieu d'icônes Lucide
**Impact:** Problèmes avec screen readers

```tsx
// ❌ Actuel
<p>⚠️ {t('translation.autoTranslation.exclusiveMode')}</p>
<strong>💡 {t('translation.autoTranslation.tip')}</strong>

// ✅ Correct
<AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
<Lightbulb className="h-4 w-4 text-blue-500" aria-hidden="true" />
```

---

### theme-settings.tsx

#### 1. **Boutons sans aria-label** (Lignes 99-122)
**Problème:** Boutons de thème non accessibles aux screen readers
**Impact:** Utilisateurs avec screen readers ne savent pas ce que font les boutons

```tsx
// ❌ Actuel
<Button
  variant={theme === 'light' ? 'default' : 'outline'}
  onClick={() => handleThemeChange('light')}
>
  <Sun className="h-4 w-4" />
  <span>{t('theme.displayMode.light')}</span>
</Button>

// ✅ Correct
<Button
  variant={theme === 'light' ? 'default' : 'outline'}
  onClick={() => handleThemeChange('light')}
  aria-label={t('theme.displayMode.light')}
  aria-pressed={theme === 'light'}
>
  <Sun className="h-4 w-4" aria-hidden="true" />
  <span>{t('theme.displayMode.light')}</span>
</Button>
```

#### 2. **useEffect vide** (Lignes 35-36)
**Problème:** Code mort qui ne fait rien

```tsx
// ❌ À supprimer
useEffect(() => {
}, [currentInterfaceLanguage]);
```

#### 3. **N'utilise PAS usePreferences** (Ligne 47-62)
**Problème:** Utilise localStorage directement au lieu du hook standard

```tsx
// ❌ Actuel - localStorage manuel
const handleConfigChange = (key: keyof ThemeConfig, value: string | boolean) => {
  const newConfig = { ...config, [key]: value };
  setConfig(newConfig);
  localStorage.setItem('meeshy-theme-config', JSON.stringify(newConfig));
}

// ✅ Attendu - usePreferences
const { data: config, updatePreferences } = usePreferences<'theme'>('theme');
await updatePreferences({ [key]: value });
```

---

### encryption-settings.tsx

#### 1. **Radio buttons déguisés en boutons** (Lignes 281-311)
**Problème:** Options mutuellement exclusives pas implémentées comme radio group
**Impact:** Navigation clavier incorrecte, annonces screen reader incorrectes

```tsx
// ❌ Actuel - Boutons
<button
  type="button"
  onClick={() => setSelectedPreference(option.value)}
  className="..."
>

// ✅ Correct - Radio buttons
<RadioGroup value={selectedPreference} onValueChange={setSelectedPreference}>
  {preferenceOptions.map((option) => (
    <div className="flex items-center space-x-2">
      <RadioGroupItem value={option.value} id={option.value} />
      <Label htmlFor={option.value}>{t(option.labelKey)}</Label>
    </div>
  ))}
</RadioGroup>
```

---

## ⚠️ Problèmes Mineurs

### language-settings.tsx

1. **Pas de SoundFeedback** (Ligne 72-108)
   Manque feedback sonore sur save/cancel comme privacy-settings

2. **htmlFor manquants sur certains Labels** (Lignes 145, 158, 171)
   Les LanguageSelector n'ont pas d'ID correspondant

---

### theme-settings.tsx

1. **Select sans name/autocomplete** (Lignes 161-217)
   Guideline: Form inputs need name and autocomplete attributes

2. **Inline styles pour font** (Lignes 298-316)
   Devrait utiliser des classes CSS pour prefers-reduced-motion

---

### encryption-settings.tsx

1. **Date formatting hardcodé** (Ligne 180-186)
   Devrait détecter locale de l'utilisateur au lieu de `undefined`

```tsx
// ❌ Actuel
new Date(data).toLocaleDateString(undefined, {...})

// ✅ Correct
const userLocale = navigator.language || 'fr-FR';
new Date(data).toLocaleDateString(userLocale, {...})
```

---

## ✅ Points Forts

### Tous les composants

- ✅ Responsive design avec breakpoints sm/lg
- ✅ Dark mode supporté
- ✅ Structure Card/CardHeader/CardContent consistante
- ✅ Icônes Lucide accessibles (sauf emojis)
- ✅ Loading states avec Loader2

### encryption-settings.tsx (Référence)

- ✅ Utilise role="status" et aria-label (ligne 134)
- ✅ Utilise sr-only pour screen readers
- ✅ Focus states avec focus-visible:ring
- ✅ Gère prefers-reduced-motion
- ✅ Utilise Intl.DateTimeFormat
- ✅ Boutons disabled correctement

---

## 🎯 Plan de Correction

### Priorité 1 (Critique)

1. **language-settings.tsx**
   - [ ] Remplacer fetch manuel par usePreferences
   - [ ] Remplacer emojis par icônes Lucide
   - [ ] Ajouter SoundFeedback

2. **theme-settings.tsx**
   - [ ] Ajouter aria-label/aria-pressed sur boutons thème
   - [ ] Supprimer useEffect vide
   - [ ] Migrer vers usePreferences

3. **encryption-settings.tsx**
   - [ ] Remplacer boutons par RadioGroup

### Priorité 2 (Important)

1. **language-settings.tsx**
   - [ ] Ajouter IDs aux LanguageSelector
   - [ ] Lier Labels avec htmlFor

2. **theme-settings.tsx**
   - [ ] Ajouter name/autocomplete aux Select
   - [ ] Extraire inline styles en classes CSS

3. **encryption-settings.tsx**
   - [ ] Détecter locale utilisateur pour dates

---

## 📚 Références

- [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)
- [Vercel React Best Practices](https://vercel.com/docs/frameworks/react)
- Composant référence: `privacy-settings.tsx`
- Hook standard: `usePreferences` (`hooks/use-preferences.ts`)

---

## 🔄 Changelog

| Date | Action | Composant |
|------|--------|-----------|
| 2026-01-19 | Audit initial | Tous |
| 2026-01-19 | Corrections priorité 1 | À venir |

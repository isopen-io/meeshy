# ApplicationSettings Component

Composant de gestion des 18 paramètres d'application organisés en 5 sections thématiques.

## Vue d'ensemble

Le composant `ApplicationSettings` permet aux utilisateurs de configurer leurs préférences d'apparence, de langue, de disposition, d'accessibilité et des fonctionnalités avancées.

## Architecture

### Fichiers

- **Composant**: `/apps/web/components/settings/ApplicationSettings.tsx`
- **Types backend**: `/packages/shared/types/preferences/application.ts`
- **Traductions EN**: `/apps/web/locales/en/settings.json` (section `settings.application`)
- **Traductions FR**: `/apps/web/locales/fr/settings.json` (section `settings.application`)

### API Backend

- **Endpoint GET**: `/user-preferences/application`
- **Endpoint PUT**: `/user-preferences/application`
- **Authentification**: Bearer token requis

## Les 18 Champs de Préférences

### 1. Section Appearance (4 champs)

| Champ | Type | Valeurs | Description |
|-------|------|---------|-------------|
| `theme` | enum | `light`, `dark`, `auto` | Thème visuel de l'application |
| `accentColor` | string | `blue`, `green`, `purple`, `red`, `orange`, `pink` | Couleur d'accentuation principale |
| `fontSize` | enum | `small`, `medium`, `large` | Taille de la police globale |
| `fontFamily` | string | `inter`, `system`, `roboto`, `open-sans`, `lato` | Famille de polices de l'interface |

### 2. Section Languages (4 champs)

| Champ | Type | Valeurs | Description |
|-------|------|---------|-------------|
| `interfaceLanguage` | string | ISO 639-1 code | Langue de l'interface utilisateur |
| `systemLanguage` | string | ISO 639-1 code | Langue principale pour les messages |
| `regionalLanguage` | string? | ISO 639-1 code | Langue régionale secondaire (optionnel) |
| `customDestinationLanguage` | string? | ISO 639-1 code | Langue de traduction personnalisée (optionnel) |

### 3. Section Layout (4 champs)

| Champ | Type | Valeurs | Description |
|-------|------|---------|-------------|
| `compactMode` | boolean | `true`, `false` | Mode compact avec espacement réduit |
| `sidebarPosition` | enum | `left`, `right` | Position de la barre latérale |
| `showAvatars` | boolean | `true`, `false` | Affichage des avatars dans les messages |
| `animationsEnabled` | boolean | `true`, `false` | Activation des animations d'interface |

### 4. Section Accessibility (3 champs)

| Champ | Type | Valeurs | Description |
|-------|------|---------|-------------|
| `reducedMotion` | boolean | `true`, `false` | Réduction des mouvements et animations |
| `highContrastMode` | boolean | `true`, `false` | Mode contraste élevé pour visibilité |
| `screenReaderOptimized` | boolean | `true`, `false` | Optimisation pour lecteurs d'écran |

### 5. Section Advanced (3 champs + 1 array)

| Champ | Type | Valeurs | Description |
|-------|------|---------|-------------|
| `keyboardShortcutsEnabled` | boolean | `true`, `false` | Activation des raccourcis clavier |
| `tutorialsCompleted` | string[] | Array of IDs | Liste des tutoriels terminés |
| `betaFeaturesEnabled` | boolean | `true`, `false` | Accès aux fonctionnalités expérimentales |
| `telemetryEnabled` | boolean | `true`, `false` | Partage de données d'usage anonymes |

**Total: 18 champs** (17 champs primitifs + 1 array)

## Utilisation

### Import basique

```tsx
import { ApplicationSettings } from '@/components/settings/ApplicationSettings';

export default function SettingsPage() {
  return (
    <div>
      <h1>Application Settings</h1>
      <ApplicationSettings />
    </div>
  );
}
```

### Fonctionnalités clés

1. **Auto-sauvegarde**: Les changements sont détectés automatiquement, un bouton "Save" apparaît en sticky bottom
2. **Feedback sonore**: Utilise `SoundFeedback` pour les interactions avec les toggles
3. **i18n complet**: Toutes les chaînes sont traduites via `useI18n('settings')`
4. **Accessibilité**: Support complet ARIA, rôles, et motion réduit
5. **Responsive**: Optimisé mobile-first avec breakpoints SM

## Clés de Traduction i18n

### Structure

Toutes les traductions sont sous `settings.application.*`:

```json
{
  "settings": {
    "application": {
      "appearance": {
        "title": "Appearance",
        "description": "...",
        "theme": { "label": "...", "description": "..." },
        "accentColor": { "label": "...", "description": "..." },
        "fontSize": { "label": "...", "description": "..." },
        "fontFamily": { "label": "...", "description": "..." }
      },
      "languages": { ... },
      "layout": { ... },
      "accessibility": { ... },
      "advanced": { ... }
    }
  }
}
```

### Exemples d'utilisation dans le code

```tsx
// Titre de section
t('application.appearance.title', 'Appearance')

// Label de champ
t('application.appearance.theme.label', 'Theme')

// Description
t('application.appearance.theme.description', 'Choose between light, dark, or auto mode')
```

## Intégration Backend

### Format de requête PUT

```typescript
PUT /user-preferences/application
Authorization: Bearer {token}
Content-Type: application/json

{
  "theme": "dark",
  "accentColor": "blue",
  "interfaceLanguage": "fr",
  "systemLanguage": "en",
  "fontSize": "medium",
  "fontFamily": "inter",
  "lineHeight": "normal",
  "compactMode": false,
  "sidebarPosition": "left",
  "showAvatars": true,
  "animationsEnabled": true,
  "reducedMotion": false,
  "highContrastMode": false,
  "screenReaderOptimized": false,
  "keyboardShortcutsEnabled": true,
  "tutorialsCompleted": ["onboarding", "first-message"],
  "betaFeaturesEnabled": false,
  "telemetryEnabled": true
}
```

### Réponse attendue

```typescript
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "user-uuid",
    "theme": "dark",
    // ... tous les champs
    "isDefault": false,
    "createdAt": "2025-01-18T10:00:00Z",
    "updatedAt": "2025-01-18T10:05:00Z"
  }
}
```

## État et Gestion

### Hook interne

Le composant gère son propre état local avec:
- `preferences`: State ApplicationPreference complet
- `loading`: État de chargement initial
- `saving`: État de sauvegarde en cours
- `hasChanges`: Détection de modifications non sauvegardées

### Cycle de vie

1. **Mount**: Chargement automatique depuis l'API
2. **Change**: Mise à jour du state local + `hasChanges = true`
3. **Save**: Appel PUT API + reset `hasChanges = false`
4. **Feedback**: Toast de confirmation ou erreur

## Accessibilité

### ARIA Labels

- Tous les switches ont des labels associés
- Les selects ont des rôles `combobox` appropriés
- État de chargement avec `role="status"` et `aria-label`

### Keyboard Navigation

- Navigation au clavier complète via Tab
- Enter/Space pour activer les switches
- Arrow keys dans les selects

### Reduced Motion

- Détection automatique via `useReducedMotion()`
- Désactivation des animations si `reducedMotion = true`
- Respect des préférences système

## Styling

### Classes Tailwind

Le composant utilise:
- Responsive breakpoints: `sm:`, `md:`, `lg:`
- Spacing cohérent: `space-y-4 sm:space-y-6`
- Layout flexible: `flex flex-col`, `sm:flex-row`
- Focus states: `focus-visible:ring-2`

### Dark Mode

Support automatique via Tailwind `dark:` prefix:
- `bg-white/50 dark:bg-gray-800/50`
- `text-gray-900 dark:text-white`

## Tests

### Checklist de tests manuels

- [ ] Chargement initial affiche les valeurs correctes
- [ ] Changement de theme (light/dark/auto) fonctionne
- [ ] Sélection de couleur d'accent visuelle
- [ ] Changement de langue met à jour l'interface
- [ ] Bouton Save apparaît après modifications
- [ ] Sauvegarde persiste les changements
- [ ] Toast de succès/erreur s'affiche
- [ ] Mode compact réduit l'espacement
- [ ] Reduced motion désactive les animations
- [ ] Reset tutorials vide le tableau
- [ ] Responsive mobile fonctionne

### Tests unitaires suggérés

```typescript
describe('ApplicationSettings', () => {
  it('should load preferences on mount', async () => {
    // Test fetch initial
  });

  it('should show save button when preferences change', () => {
    // Test hasChanges detection
  });

  it('should save preferences to API', async () => {
    // Test PUT request
  });

  it('should display loading state', () => {
    // Test loader
  });
});
```

## Notes de Migration

Si vous utilisez actuellement des préférences dispersées, voici comment migrer:

1. **Identifier les champs existants** dans votre DB ou localStorage
2. **Mapper vers ApplicationPreference** selon le tableau ci-dessus
3. **Créer migration Prisma** si nécessaire pour ajouter les nouveaux champs
4. **Déployer le endpoint backend** `/user-preferences/application`
5. **Intégrer le composant** dans votre page de settings

## Roadmap

### Fonctionnalités futures

- [ ] Preview en temps réel des changements (thème, font)
- [ ] Import/Export de configurations
- [ ] Presets prédéfinis (Kids, Seniors, Pro, etc.)
- [ ] Sync multi-device via WebSocket
- [ ] Historique des changements (audit log)
- [ ] Reset to defaults par section

### Améliorations UX

- [ ] Animations de transition entre themes
- [ ] Color picker avancé pour accent color
- [ ] Font preview avec texte d'exemple
- [ ] Tooltips explicatifs sur survol
- [ ] Raccourcis clavier pour ouvrir settings (Cmd+,)

## Support

Pour toute question ou bug:
- Ouvrir une issue sur le repo
- Consulter la documentation backend dans `/services/gateway/docs`
- Vérifier les types dans `/packages/shared/types/preferences/`

---

**Créé le**: 2025-01-18
**Dernière mise à jour**: 2025-01-18
**Auteur**: Claude Code
**Version**: 1.0.0

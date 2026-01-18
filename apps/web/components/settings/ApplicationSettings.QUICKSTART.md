# ApplicationSettings - Guide de Démarrage Rapide

## Installation en 3 étapes

### Étape 1: Import du composant

```tsx
// Dans votre page de settings
import { ApplicationSettings } from '@/components/settings/ApplicationSettings';

export default function SettingsPage() {
  return (
    <div className="container max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Application Settings</h1>
      <ApplicationSettings />
    </div>
  );
}
```

### Étape 2: Vérifier l'endpoint backend

L'API doit répondre sur ces routes :

```
GET  /user-preferences/application
PUT  /user-preferences/application
```

Format de réponse attendu :

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "user-uuid",
    "theme": "dark",
    "accentColor": "blue",
    "interfaceLanguage": "en",
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
    "tutorialsCompleted": [],
    "betaFeaturesEnabled": false,
    "telemetryEnabled": true,
    "createdAt": "2025-01-18T10:00:00Z",
    "updatedAt": "2025-01-18T10:00:00Z"
  }
}
```

### Étape 3: Tester

1. Démarrez votre application
2. Naviguez vers la page de settings
3. Modifiez quelques préférences
4. Cliquez sur "Save changes"
5. Vérifiez le toast de confirmation
6. Rechargez la page pour vérifier la persistance

## Les 5 Sections

### 1. Appearance (Apparence)
- **Theme** : Clair, Sombre, ou Auto
- **Accent Color** : 6 couleurs disponibles
- **Font Size** : Petit, Moyen, Grand
- **Font Family** : Inter, System, Roboto, Open Sans, Lato

### 2. Languages (Langues)
- **Interface Language** : Langue des menus et boutons
- **System Language** : Langue principale des messages
- **Regional Language** : Langue secondaire (optionnel)
- **Custom Language** : Langue de traduction personnalisée (optionnel)

### 3. Layout (Disposition)
- **Compact Mode** : Réduire l'espacement
- **Sidebar Position** : Gauche ou Droite
- **Show Avatars** : Afficher les photos de profil
- **Animations** : Activer les transitions

### 4. Accessibility (Accessibilité)
- **Reduced Motion** : Minimiser les animations
- **High Contrast** : Augmenter le contraste
- **Screen Reader** : Optimiser pour lecteur d'écran

### 5. Advanced (Avancé)
- **Keyboard Shortcuts** : Raccourcis clavier
- **Tutorials** : Bouton Reset pour réinitialiser
- **Beta Features** : Fonctionnalités expérimentales
- **Telemetry** : Partage de données anonymes

## Personnalisation

### Ajouter une nouvelle langue

Dans `ApplicationSettings.tsx`, modifiez `AVAILABLE_LANGUAGES` :

```tsx
const AVAILABLE_LANGUAGES = [
  // ... langues existantes
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
];
```

Ajoutez ensuite les traductions dans :
- `locales/nl/settings.json`

### Ajouter une nouvelle police

Modifiez `FONT_FAMILIES` :

```tsx
const FONT_FAMILIES = [
  // ... polices existantes
  { value: 'comic-sans', label: 'Comic Sans' },
];
```

### Modifier les couleurs d'accent

Modifiez `ACCENT_COLORS` :

```tsx
const ACCENT_COLORS = [
  // ... couleurs existantes
  { value: 'teal', label: 'Teal', color: 'bg-teal-500' },
];
```

## Traductions

### Structure i18n

Toutes les clés sont sous `settings.application.*` :

```json
{
  "settings": {
    "application": {
      "appearance": {
        "title": "Apparence",
        "theme": {
          "label": "Thème",
          "description": "..."
        }
      }
    }
  }
}
```

### Ajouter une nouvelle langue UI

1. Créer `/locales/de/settings.json`
2. Copier la structure de `en/settings.json`
3. Traduire toutes les valeurs
4. Ajouter 'de' dans `AVAILABLE_LANGUAGES`

## Debugging

### Le composant ne charge pas

Vérifiez :
1. `authManager.getAuthToken()` retourne un token valide
2. L'endpoint backend répond en 200 OK
3. La console browser pour les erreurs fetch

### Les traductions ne s'affichent pas

Vérifiez :
1. Le fichier `locales/{lang}/settings.json` existe
2. La clé `settings.application` est présente
3. Le hook `useI18n('settings')` fonctionne

### Le bouton Save ne sauvegarde pas

Vérifiez :
1. L'endpoint PUT existe
2. Le token Bearer est valide
3. Le body JSON est correct
4. La console pour les erreurs 400/401/500

## Tests

### Lancer les tests unitaires

```bash
npm test ApplicationSettings.test.tsx
```

### Tests manuels

- [ ] Chargement affiche les valeurs correctes
- [ ] Changement de theme fonctionne
- [ ] Sélection couleur d'accent visuelle
- [ ] Changement de langue met à jour l'UI
- [ ] Bouton Save apparaît après modifications
- [ ] Sauvegarde persiste les changements
- [ ] Toast de succès/erreur s'affiche
- [ ] Mode compact réduit l'espacement
- [ ] Reduced motion désactive animations
- [ ] Reset tutorials vide le tableau
- [ ] Responsive mobile fonctionne

## Support

### Documentation complète
Consultez `ApplicationSettings.README.md` pour la documentation détaillée.

### Exemples d'intégration
Consultez `ApplicationSettings.example.tsx` pour 7 patterns différents.

### Types Backend
Les types sont définis dans :
`/packages/shared/types/preferences/application.ts`

## FAQ

**Q: Comment désactiver une section ?**
A: Commentez la Card correspondante dans le JSX.

**Q: Puis-je contrôler le composant de l'extérieur ?**
A: Oui, voir Pattern 7 dans `ApplicationSettings.example.tsx`.

**Q: Comment ajouter un champ personnalisé ?**
A:
1. Ajoutez le champ dans `ApplicationPreferenceSchema`
2. Ajoutez l'UI dans le composant
3. Ajoutez les traductions i18n

**Q: Le composant est-il accessible ?**
A: Oui, support complet WCAG avec ARIA labels et keyboard navigation.

**Q: Puis-je l'utiliser dans un modal ?**
A: Oui, voir Pattern 3 dans les exemples.

---

**Besoin d'aide ?** Consultez la documentation complète ou créez une issue.

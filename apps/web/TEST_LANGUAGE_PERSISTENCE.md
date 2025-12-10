# Test de la persistance de la langue

## Problème identifié
Le store Zustand utilisait `detectBrowserLanguage()` dans `initialState`, ce qui écrasait la valeur sauvegardée dans localStorage à chaque chargement.

## Solutions appliquées

### 1. Modification de `initialState`
```typescript
// AVANT (incorrect)
const initialState: LanguageState = {
  currentInterfaceLanguage: detectBrowserLanguage(), // ❌ S'exécute avant la rehydratation
  currentMessageLanguage: detectBrowserLanguage(),
  ...
};

// APRÈS (correct)
const initialState: LanguageState = {
  currentInterfaceLanguage: 'en', // ✅ Valeur par défaut, sera remplacée par localStorage
  currentMessageLanguage: 'en',
  ...
};
```

### 2. Ajout de la version au persist
```typescript
{
  name: 'meeshy-language',
  version: 1, // Permet de forcer la ré-initialisation si nécessaire
  partialize: (state) => ({
    currentInterfaceLanguage: state.currentInterfaceLanguage,
    currentMessageLanguage: state.currentMessageLanguage,
    userLanguageConfig: state.userLanguageConfig,
  }),
}
```

## Comment tester

### Test 1 : Changement de langue
1. Ouvrir http://localhost:3100/settings#theme
2. Changer la langue de "English" à "Français"
3. Attendre le rechargement de la page
4. **Résultat attendu** : L'interface est en français et le sélecteur affiche "Français"

### Test 2 : Persistance après rechargement
1. Après avoir changé la langue en français (Test 1)
2. Fermer l'onglet complètement
3. Ouvrir un nouvel onglet sur http://localhost:3100
4. **Résultat attendu** : L'interface reste en français

### Test 3 : Vérifier le localStorage
1. Ouvrir la console du navigateur (F12)
2. Aller dans l'onglet "Application" > "Local Storage" > http://localhost:3100
3. Chercher la clé `meeshy-language`
4. **Résultat attendu** : 
```json
{
  "state": {
    "currentInterfaceLanguage": "fr",
    "currentMessageLanguage": "fr",
    "userLanguageConfig": {...}
  },
  "version": 1
}
```

### Test 4 : Premier visiteur (langue du navigateur)
1. Ouvrir la console et exécuter : `localStorage.removeItem('meeshy-language')`
2. Recharger la page
3. **Résultat attendu** : 
   - Si votre navigateur est en français : interface en français
   - Si votre navigateur est en anglais : interface en anglais
   - Autres langues : interface en anglais (fallback)

## Debug si ça ne fonctionne pas

### Vérifier les logs console
Les logs suivants devraient apparaître :
```
[LANGUAGE_STORE] Setting interface language: fr
```

### Vider le cache et le localStorage
Si le problème persiste :
1. Console du navigateur : `localStorage.clear()`
2. Recharger avec Ctrl+Shift+R (hard reload)
3. Réessayer

### Vérifier la version de Zustand persist
La version du store est dans le localStorage :
```javascript
JSON.parse(localStorage.getItem('meeshy-language'))?.version
// Devrait retourner: 1
```

## Fichiers modifiés
- `frontend/stores/language-store.ts` : Suppression de `detectBrowserLanguage()` dans `initialState`, ajout de `version: 1`

## Prochaine étape
Si le problème persiste, vérifier que le composant `<DebugLanguageStore />` est bien monté dans le layout pour voir les logs en temps réel.

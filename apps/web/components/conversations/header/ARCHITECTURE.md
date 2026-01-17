# Architecture ConversationHeader

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                     ConversationHeader                          │
│                     (203 lignes)                                │
│                                                                 │
│  Responsabilité: Orchestration des composants et hooks         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ utilise
                              ▼
         ┌────────────────────────────────────────┐
         │                                        │
         │          Hooks personnalisés           │
         │                                        │
         └────────────────────────────────────────┘
                              │
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Preferences   │    │ Participant   │    │   Actions     │
│               │    │     Info      │    │               │
│ - Pin/Mute    │    │ - Nom         │    │ - Upload      │
│ - Archive     │    │ - Avatar      │    │ - Partage     │
│ - Tags        │    │ - Statut      │    │ - Modales     │
└───────────────┘    └───────────────┘    └───────────────┘

        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Call Banner  │    │  Encryption   │    │  Permissions  │
│               │    │               │    │               │
│ - Durée       │    │ - E2EE        │    │ - Vidéo       │
│ - Join/Quit   │    │ - Hybrid      │    │ - Modif image │
└───────────────┘    └───────────────┘    └───────────────┘
                              │
                              │ fourni aux
                              ▼
         ┌────────────────────────────────────────┐
         │                                        │
         │          Composants UI                 │
         │                                        │
         └────────────────────────────────────────┘
                              │
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ HeaderAvatar  │    │  HeaderTags   │    │ HeaderActions │
│               │    │               │    │               │
│ - Avatar      │    │ - Catégorie   │    │ - Menu        │
│ - Statut      │    │ - Tags        │    │ - Dropdown    │
│ - Encryption  │    │               │    │               │
└───────────────┘    └───────────────┘    └───────────────┘

        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ HeaderToolbar │    │ Participants  │    │    Typing     │
│               │    │   Display     │    │   Indicator   │
│ - Vidéo       │    │               │    │               │
│ - Drawer      │    │ - Liste       │    │ - Animation   │
│ - Lien        │    │ - Typing      │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
```

## Flux de données

```
User Action (UI)
      │
      ▼
Hook (Logique métier)
      │
      ├─► API Service Call
      │
      ├─► State Update (Optimistic UI)
      │
      ▼
Component Re-render (React.memo)
      │
      ▼
UI Update
```

## Exemple: Toggle Pin

```
1. User clicks "Épingler" in HeaderActions
         │
         ▼
2. HeaderActions.onClick → onTogglePin()
         │
         ▼
3. useHeaderPreferences.togglePin()
         │
         ├─► setPreferences({ isPinned: true })  (Optimistic)
         │
         ├─► userPreferencesService.togglePin()   (API Call)
         │
         ▼
4. HeaderActions re-renders (isPinned = true)
         │
         ▼
5. UI shows "Désépingler" with filled icon
```

## Dépendances entre composants

```
ConversationHeader
├── useHeaderPreferences
│   └── userPreferencesService
│
├── useParticipantInfo
│   └── useUserStore (statut temps réel)
│
├── useHeaderActions
│   ├── AttachmentService
│   └── conversationsService
│
├── useCallBanner
│   └── useCallStore
│
├── useEncryptionInfo
│   └── (aucune dépendance externe)
│
└── usePermissions
    └── (aucune dépendance externe)
```

## Services utilisés

```
┌─────────────────────────────────────────┐
│         Services externes               │
├─────────────────────────────────────────┤
│ userPreferencesService                  │
│  - getPreferences()                     │
│  - togglePin()                          │
│  - toggleMute()                         │
│  - toggleArchive()                      │
│                                         │
│ AttachmentService                       │
│  - uploadFiles()                        │
│                                         │
│ conversationsService                    │
│  - updateConversation()                 │
│                                         │
│ Stores Zustand                          │
│  - useUserStore (statuts en temps réel) │
│  - useCallStore (appels vidéo)         │
└─────────────────────────────────────────┘
```

## Pattern de composition

```typescript
// Composant principal
export function ConversationHeader(props) {
  // 1. Extraction de la logique dans les hooks
  const { preferences, togglePin, ... } = useHeaderPreferences(...);
  const { participantInfo, ... } = useParticipantInfo(...);
  const { handleImageUpload, ... } = useHeaderActions(...);

  // 2. Calcul des valeurs dérivées
  const displayName = preferences.customName
    ? `${preferences.customName} (${participantInfo.name})`
    : participantInfo.name;

  // 3. Composition des composants UI
  return (
    <>
      <HeaderTagsBar {...} />
      <HeaderAvatar {...} />
      <ParticipantsDisplay {...} />
      <HeaderToolbar {...} />
    </>
  );
}
```

## Optimisation des re-renders

```
┌─────────────────────────────────────────┐
│  ConversationHeader                     │
│  Re-render si: props change             │
└─────────────────────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌────────┐
│Avatar  │  │ Tags   │  │Actions │
│        │  │        │  │        │
│memo()  │  │memo()  │  │memo()  │
└────────┘  └────────┘  └────────┘
    │            │            │
    │            │            │
Re-render     Re-render    Re-render
uniquement    uniquement   uniquement
si avatar     si tags      si actions
change        change       change
```

## Types centralisés

```typescript
// types.ts - Source unique de vérité

export interface ConversationHeaderProps {
  // Props publiques du composant
}

export interface HeaderPreferences {
  // État des préférences
}

export interface ParticipantInfo {
  // Infos calculées sur les participants
}

export interface EncryptionInfo {
  // Infos de chiffrement
}

// Tous les fichiers importent depuis types.ts
// ✅ Cohérence garantie
// ✅ Refactoring facile
// ✅ Type checking strict
```

## Stratégie de test

```
┌─────────────────────────────────────────┐
│             Tests Unitaires             │
│                                         │
│  Hooks (use-*.ts)                       │
│  ├── useHeaderPreferences.test.ts       │
│  ├── useParticipantInfo.test.ts         │
│  ├── useHeaderActions.test.ts           │
│  └── ...                                │
│                                         │
│  Utils                                  │
│  └── permissions.test.ts                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│         Tests de composants             │
│                                         │
│  Composants UI (*.tsx)                  │
│  ├── HeaderActions.test.tsx             │
│  ├── HeaderAvatar.test.tsx              │
│  ├── ParticipantsDisplay.test.tsx       │
│  └── ...                                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│         Tests d'intégration             │
│                                         │
│  ConversationHeader.integration.test.tsx│
│  - Teste l'orchestration complète       │
│  - Mock des services                    │
│  - Scénarios utilisateur complets       │
└─────────────────────────────────────────┘
```

## Points d'extension futurs

### Ajouter une nouvelle préférence

1. Ajouter le champ dans `HeaderPreferences` (types.ts)
2. Ajouter la logique dans `useHeaderPreferences.ts`
3. Ajouter l'UI dans `HeaderActions.tsx`

### Ajouter un nouveau badge sur l'avatar

1. Créer le hook dans `header/use-new-badge.ts`
2. Ajouter le type dans `types.ts`
3. Intégrer dans `HeaderAvatar.tsx`

### Ajouter un nouveau bouton dans la toolbar

1. Ajouter le handler dans `useHeaderActions.ts`
2. Ajouter le bouton dans `HeaderToolbar.tsx`
3. Gérer les permissions dans `usePermissions.ts`

## Règles de contribution

1. **Un fichier = Une responsabilité**
2. **Composants = React.memo**
3. **Hooks = useCallback pour les fonctions**
4. **Types = Définis dans types.ts**
5. **Tests = Un test par hook/composant**
6. **Imports = Depuis index.ts uniquement**

## Conclusion

Cette architecture permet :

- ✅ Séparation claire des responsabilités
- ✅ Testabilité maximale
- ✅ Réutilisabilité des composants
- ✅ Performance optimisée
- ✅ Extensibilité facilitée
- ✅ Maintenabilité à long terme

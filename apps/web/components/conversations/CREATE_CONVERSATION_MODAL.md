# CreateConversationModal - Documentation

## Vue d'ensemble

Le modal de création de conversation a été refactorisé pour améliorer la maintenabilité, la testabilité et les performances. Le fichier principal est passé de **971 lignes** à **367 lignes** (~62% de réduction).

## Architecture

### Structure des fichiers

```
apps/web/
├── components/conversations/
│   ├── create-conversation-modal.tsx         (367 lignes - fichier principal)
│   └── steps/
│       ├── MemberSelectionStep.tsx            (Step 1 - Sélection membres)
│       ├── ConversationTypeStep.tsx           (Step 2 - Type de conversation)
│       ├── ConversationDetailsStep.tsx        (Step 3 - Titre et identifier)
│       ├── CommunitySelectionStep.tsx         (Step 4 - Communauté optionnelle)
│       └── index.ts                           (Exports)
└── hooks/
    ├── use-conversation-creation.ts           (Logique de création)
    ├── use-identifier-validation.ts           (Validation identifier)
    ├── use-user-search.ts                     (Recherche et sélection utilisateurs)
    └── use-community-search.ts                (Recherche communautés)
```

## Hooks personnalisés

### 1. `useConversationCreation`

Gère la création de conversations avec validation et gestion d'erreurs.

```typescript
const { isCreating, createConversation } = useConversationCreation();

await createConversation({
  title: 'My Group',
  conversationType: 'group',
  selectedUsers: [...],
  customIdentifier: 'my-group-abc123',
  selectedCommunity: 'community-id'
});
```

**Responsabilités:**
- Validation des participants selon le type de conversation
- Construction du payload de requête
- Appel API via conversationsService
- Gestion des erreurs avec messages toast
- État de chargement

### 2. `useIdentifierValidation`

Valide et génère des identifiants uniques pour les conversations.

```typescript
const {
  identifierAvailable,        // boolean | null
  isCheckingIdentifier,        // boolean
  validateIdentifierFormat,    // (identifier: string) => boolean
  checkIdentifierAvailability, // (identifier: string) => Promise<void>
  generateIdentifierFromTitle  // (title: string) => string
} = useIdentifierValidation(customIdentifier, conversationType);
```

**Fonctionnalités:**
- Validation du format (regex: `^[a-zA-Z0-9\-_@]+$`)
- Génération d'identifier depuis le titre avec suffixe hex unique
- Vérification de disponibilité en temps réel (debounce 300ms)
- Auto-validation selon le type de conversation

### 3. `useUserSearch` et `useUserSelection`

Recherche d'utilisateurs avec debouncing et gestion de la sélection.

```typescript
// Recherche
const { availableUsers, isLoading, searchUsers } = useUserSearch(
  currentUser.id,
  selectedUsers
);

// Sélection
const { selectedUsers, toggleUserSelection, clearSelection } = useUserSelection();
```

**Fonctionnalités:**
- Recherche avec minimum 2 caractères
- Exclusion de l'utilisateur courant et des déjà sélectionnés
- Gestion d'erreurs avec toast
- Toggle de sélection optimisé

### 4. `useCommunitySearch`

Recherche de communautés avec support de filtrage.

```typescript
const { communities, isLoadingCommunities, loadCommunities } = useCommunitySearch();

// Charger avec recherche optionnelle
await loadCommunities('search term');
```

## Composants Steps

### MemberSelectionStep

**Props:**
```typescript
{
  searchQuery: string;
  onSearchChange: (query: string) => void;
  availableUsers: User[];
  selectedUsers: User[];
  onToggleUser: (user: User) => void;
  isLoading: boolean;
}
```

**Fonctionnalités:**
- Input de recherche avec affichage des résultats
- Liste des utilisateurs disponibles avec avatar et statut en ligne
- SmartSearch pour suggestions intelligentes
- Badges colorés pour utilisateurs sélectionnés
- Accessibilité complète (ARIA labels, keyboard navigation)

### ConversationTypeStep

**Props:**
```typescript
{
  conversationType: ConversationType;
  onTypeChange: (type: ConversationType) => void;
  selectedUsersCount: number;
}
```

**Fonctionnalités:**
- Sélection du type: Direct, Group, Public
- Affichage conditionnel selon le nombre d'utilisateurs
- Icônes contextuelles

### ConversationDetailsStep

**Props:**
```typescript
{
  title: string;
  customIdentifier: string;
  conversationType: ConversationType;
  onTitleChange: (title: string) => void;
  onIdentifierChange: (identifier: string) => void;
  selectedUsers: User[];
  identifierAvailable: boolean | null;
  isCheckingIdentifier: boolean;
  validateIdentifierFormat: (identifier: string) => boolean;
}
```

**Fonctionnalités:**
- Input titre avec placeholder contextuel
- Input identifier avec préfixe visuel
- Validation en temps réel avec feedback visuel (✓/❌)
- Suggestions d'identifiants via IdentifierSuggestions
- Masqué pour conversations directes

### CommunitySelectionStep

**Props:**
```typescript
{
  showCommunitySection: boolean;
  onToggleSection: (show: boolean) => void;
  communities: Community[];
  communitySearchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCommunity: string;
  onCommunitySelect: (communityId: string) => void;
  isLoadingCommunities: boolean;
}
```

**Fonctionnalités:**
- Toggle switch pour afficher/masquer la section
- Recherche de communautés avec debounce
- Affichage des communautés avec icône privé/public
- Sélection unique

## Optimisations

### Performance

1. **React.memo** sur tous les steps pour éviter les re-renders inutiles
2. **useCallback** pour tous les event handlers
3. **useMemo** pour les listes filtrées (users, communities)
4. **Debouncing** sur les recherches (300ms)
5. Filtrage côté client après fetch initial

### Séparation des préoccupations

- **Logique métier** → Hooks personnalisés
- **UI/Présentation** → Composants Steps
- **Orchestration** → Modal principal
- **Utilitaires** → Helpers partagés

### Bundle size

Les steps sont importés normalement (pas de lazy loading dynamique) car:
- Tous sont nécessaires pour le modal
- Code-splitting au niveau modal via dynamic imports du parent
- Meilleure expérience utilisateur (pas de loading states)

## API publique

L'interface du composant reste **100% identique** à la version précédente:

```typescript
interface CreateConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onConversationCreated: (conversationId: string, conversationData?: any) => void;
}
```

## Flux de données

```
┌─────────────────────────────────────┐
│   CreateConversationModal (Main)   │
│  - Gère l'état UI                   │
│  - Orchestre les hooks              │
│  - Coordonne les steps              │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼────────┐    ┌──────▼──────────┐
│   Hooks    │    │     Steps       │
│            │    │                 │
│ - Creation │    │ - Members       │
│ - Validation│   │ - Type          │
│ - Search   │    │ - Details       │
│ - Community│    │ - Community     │
└────────────┘    └─────────────────┘
```

## Tests recommandés

### Hooks
```typescript
// use-conversation-creation.test.ts
- ✅ Créer conversation direct
- ✅ Créer groupe avec identifier
- ✅ Validation erreurs participants
- ✅ Gestion erreurs API

// use-identifier-validation.test.ts
- ✅ Format validation
- ✅ Génération depuis titre
- ✅ Vérification disponibilité
- ✅ Debounce check

// use-user-search.test.ts
- ✅ Recherche avec min 2 chars
- ✅ Filtrage utilisateur courant
- ✅ Toggle sélection
```

### Composants
```typescript
// MemberSelectionStep.test.tsx
- ✅ Affichage résultats recherche
- ✅ Sélection utilisateur
- ✅ Accessibilité keyboard

// ConversationTypeStep.test.tsx
- ✅ Affichage conditionnel types
- ✅ Changement de type
```

## Migration depuis l'ancienne version

**Aucune migration nécessaire** - L'API publique est identique. Le composant est un drop-in replacement.

```typescript
// Avant et après - identique
<CreateConversationModal
  isOpen={isOpen}
  onClose={handleClose}
  currentUser={currentUser}
  onConversationCreated={handleCreated}
/>
```

## Métriques

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| Lignes fichier principal | 971 | 367 | -62% |
| Fonctions dans un fichier | 15+ | 5 | -67% |
| Hooks customs | 0 | 4 | +4 |
| Composants steps | 0 | 4 | +4 |
| Testabilité | ⭐⭐ | ⭐⭐⭐⭐⭐ | +150% |
| Maintenabilité | ⭐⭐ | ⭐⭐⭐⭐⭐ | +150% |

## Prochaines améliorations possibles

1. **Tests unitaires** complets pour tous les hooks et steps
2. **Storybook** pour documentation visuelle des steps
3. **Error boundaries** autour des steps
4. **Analytics tracking** pour chaque étape du wizard
5. **A/B testing** infrastructure pour expérimenter avec le flow

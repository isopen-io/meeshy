# Groups Layout - Guide d'Utilisation

## Table des Matières
- [Utilisation Basique](#utilisation-basique)
- [Architecture](#architecture)
- [Hooks Disponibles](#hooks-disponibles)
- [Composants Disponibles](#composants-disponibles)
- [Personnalisation](#personnalisation)
- [Exemples d'Extension](#exemples-dextension)

---

## Utilisation Basique

### Import Standard
```typescript
import { GroupsLayout } from '@/components/groups';

// Utilisation dans une page
export default function GroupsPage({ params }) {
  return <GroupsLayout selectedGroupIdentifier={params.identifier} />;
}
```

### Props
```typescript
interface GroupsLayoutProps {
  selectedGroupIdentifier?: string; // Identifiant du groupe à afficher
}
```

---

## Architecture

### Séparation des Responsabilités

```
groups-layout.tsx (Orchestrateur)
  ├── Hooks (Logique Métier)
  │   ├── useGroups - Gestion liste des groupes
  │   ├── useGroupDetails - Détails d'un groupe
  │   ├── useGroupForm - Formulaire création
  │   ├── useCommunityConversations - Conversations
  │   └── useGroupsResponsive - Responsivité
  │
  └── Composants (UI)
      ├── GroupsList - Liste avec filtres
      ├── GroupDetails - Vue détails
      ├── GroupCard - Carte individuelle
      ├── ConversationsList - Liste conversations (lazy)
      └── CreateGroupModal - Modal création
```

---

## Hooks Disponibles

### `useGroups()`
Gère la liste des groupes de l'utilisateur.

```typescript
import { useGroups } from '@/hooks/use-groups';

function MyComponent() {
  const { groups, isLoading, loadGroups, refetch } = useGroups();

  // Rafraîchir manuellement
  const handleRefresh = () => {
    refetch();
  };

  return <div>{groups.length} groupes</div>;
}
```

**Retour:**
- `groups: Group[]` - Liste des groupes
- `setGroups: (groups: Group[]) => void` - Modifier la liste
- `isLoading: boolean` - État de chargement
- `loadGroups: () => Promise<void>` - Charger les groupes
- `refetch: () => Promise<void>` - Recharger (alias)

---

### `useGroupDetails()`
Gère les détails d'un groupe sélectionné.

```typescript
import { useGroupDetails } from '@/hooks/use-group-details';

function MyComponent() {
  const {
    selectedGroup,
    setSelectedGroup,
    isLoadingDetails,
    loadGroupDetails
  } = useGroupDetails();

  // Charger un groupe par identifiant
  const loadGroup = async (identifier: string) => {
    await loadGroupDetails(identifier, isMobile);
  };

  return selectedGroup ? <div>{selectedGroup.name}</div> : null;
}
```

**Retour:**
- `selectedGroup: Group | null` - Groupe sélectionné
- `setSelectedGroup: (group: Group | null) => void` - Sélectionner
- `isLoadingDetails: boolean` - État de chargement
- `loadGroupDetails: (identifier: string, isMobile: boolean) => Promise<void>` - Charger détails

---

### `useGroupForm(options)`
Gère le formulaire de création de groupe avec validation.

```typescript
import { useGroupForm } from '@/hooks/use-group-form';
import { useI18n } from '@/hooks/useI18n';

function MyComponent() {
  const { t } = useI18n('groups');

  const form = useGroupForm({
    tGroups: t,
    onSuccess: (newGroup) => {
      console.log('Groupe créé:', newGroup);
      // Fermer modal, etc.
    }
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.createGroup(); }}>
      <input
        value={form.newGroupName}
        onChange={(e) => form.setNewGroupName(e.target.value)}
      />

      {/* Indicateur de validation */}
      {form.isCheckingIdentifier && <Spinner />}
      {form.identifierAvailable === true && <CheckIcon />}
      {form.identifierAvailable === false && <ErrorIcon />}

      <button disabled={!form.isValid}>Créer</button>
    </form>
  );
}
```

**Options:**
```typescript
interface UseGroupFormOptions {
  onSuccess?: (group: Group) => void;
  tGroups: (key: string) => string; // Fonction i18n
}
```

**Retour:**
- `newGroupName: string` - Nom du groupe
- `setNewGroupName: (value: string) => void`
- `newGroupDescription: string` - Description
- `setNewGroupDescription: (value: string) => void`
- `newGroupIdentifier: string` - Identifiant (auto-généré)
- `setNewGroupIdentifier: (value: string) => void` - Avec sanitization
- `newGroupIsPrivate: boolean` - Privé ou public
- `setNewGroupIsPrivate: (value: boolean) => void`
- `isCheckingIdentifier: boolean` - Vérification en cours
- `identifierAvailable: boolean | null` - Disponibilité
- `createGroup: () => Promise<void>` - Créer le groupe
- `resetForm: () => void` - Réinitialiser
- `isValid: boolean` - Formulaire valide

---

### `useCommunityConversations()`
Gère les conversations d'une communauté.

```typescript
import { useCommunityConversations } from '@/hooks/use-community-conversations';

function MyComponent() {
  const {
    communityConversations,
    isLoadingConversations,
    loadCommunityConversations
  } = useCommunityConversations();

  useEffect(() => {
    if (groupId) {
      loadCommunityConversations(groupId, isPrivate);
    }
  }, [groupId]);

  return <div>{communityConversations.length} conversations</div>;
}
```

**Retour:**
- `communityConversations: Conversation[]` - Liste des conversations
- `isLoadingConversations: boolean` - État de chargement
- `loadCommunityConversations: (groupId: string, isPrivate?: boolean) => Promise<void>`

---

### `useGroupsResponsive(selectedGroup)`
Gère la responsivité mobile/desktop.

```typescript
import { useGroupsResponsive } from '@/hooks/use-groups-responsive';

function MyComponent() {
  const { showGroupsList, setShowGroupsList, isMobile } = useGroupsResponsive(selectedGroup);

  return (
    <div className={isMobile ? 'mobile' : 'desktop'}>
      {showGroupsList && <GroupsList />}
      {selectedGroup && <GroupDetails />}
    </div>
  );
}
```

**Params:**
- `selectedGroup: any` - Groupe sélectionné (pour auto-toggle mobile)

**Retour:**
- `showGroupsList: boolean` - Afficher la liste
- `setShowGroupsList: (show: boolean) => void` - Toggle
- `isMobile: boolean` - Mode mobile détecté

---

## Composants Disponibles

### `GroupCard`
Carte d'affichage d'un groupe (optimisée avec React.memo).

```typescript
import { GroupCard } from '@/components/groups/GroupCard';

<GroupCard
  group={group}
  isSelected={selectedGroup?.id === group.id}
  onSelect={(group) => console.log('Selected:', group)}
  onCopyIdentifier={(identifier, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(identifier);
  }}
  copiedIdentifier={copiedId}
/>
```

**Props:**
```typescript
interface GroupCardProps {
  group: Group;
  isSelected: boolean;
  onSelect: (group: Group) => void;
  onCopyIdentifier: (identifier: string, e: React.MouseEvent) => void;
  copiedIdentifier: string | null;
}
```

---

### `GroupsList`
Liste complète avec filtrage, tabs et recherche (optimisée).

```typescript
import { GroupsList } from '@/components/groups/GroupsList';

<GroupsList
  groups={groups}
  selectedGroup={selectedGroup}
  activeTab="public" // 'public' | 'private'
  searchFilter=""
  copiedIdentifier={null}
  isMobile={false}
  showGroupsList={true}
  isLoading={false}
  onTabChange={(tab) => setActiveTab(tab)}
  onSearchChange={(search) => setSearch(search)}
  onSelectGroup={(group) => console.log(group)}
  onCopyIdentifier={(id, e) => {}}
  onCreateClick={() => setModalOpen(true)}
  tGroups={(key) => key} // Fonction i18n
/>
```

---

### `GroupDetails`
Vue détaillée d'un groupe avec lazy loading des conversations.

```typescript
import { GroupDetails } from '@/components/groups/GroupDetails';

<GroupDetails
  group={selectedGroup}
  conversations={conversations}
  isLoadingConversations={false}
  copiedIdentifier={null}
  isMobile={false}
  onBack={() => router.push('/groups')}
  onCopyIdentifier={(id) => {}}
  onSettingsClick={() => setSettingsOpen(true)}
  tGroups={(key) => key}
/>
```

---

### `CreateGroupModal`
Modal de création avec validation temps réel.

```typescript
import { CreateGroupModal } from '@/components/groups/CreateGroupModal';
import { useGroupForm } from '@/hooks/use-group-form';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);
  const form = useGroupForm({ tGroups: t, onSuccess: handleSuccess });

  return (
    <CreateGroupModal
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      formState={form}
      onSubmit={form.createGroup}
      tGroups={t}
    />
  );
}
```

---

## Personnalisation

### Thème et Styles

Tous les composants utilisent Tailwind CSS et sont personnalisables via `className`:

```typescript
// Personnaliser GroupCard
<GroupCard
  {...props}
  className="custom-card" // Non supporté par défaut
/>

// Alternative: wrapper
<div className="custom-wrapper">
  <GroupCard {...props} />
</div>
```

### Dark Mode

Le dark mode est géré automatiquement via `dark:` variants:
```css
bg-background/80 dark:bg-background/90
```

---

## Exemples d'Extension

### Ajouter un Hook Custom

```typescript
// hooks/use-group-members.ts
import { useState, useCallback } from 'react';
import { apiService } from '@/services/api.service';

export function useGroupMembers(groupId?: string) {
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadMembers = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const response = await apiService.get(`/communities/${id}/members`);
      setMembers(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (groupId) {
      loadMembers(groupId);
    }
  }, [groupId, loadMembers]);

  return { members, isLoading, loadMembers, refetch: loadMembers };
}
```

**Utilisation:**
```typescript
// Dans groups-layout.tsx
const { members } = useGroupMembers(selectedGroup?.id);

// Passer aux composants
<GroupDetails {...props} members={members} />
```

---

### Ajouter un Composant

```typescript
// components/groups/GroupMembers.tsx
import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface GroupMembersProps {
  members: Array<{ id: string; username: string; avatar?: string }>;
}

export const GroupMembers = memo(function GroupMembers({ members }: GroupMembersProps) {
  return (
    <div className="space-y-2">
      <h3 className="font-bold">Membres ({members.length})</h3>
      {members.map((member) => (
        <div key={member.id} className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={member.avatar} />
            <AvatarFallback>{member.username[0]}</AvatarFallback>
          </Avatar>
          <span>{member.username}</span>
        </div>
      ))}
    </div>
  );
});
```

**Utilisation:**
```typescript
// Dans GroupDetails.tsx
import { GroupMembers } from './GroupMembers';

<GroupMembers members={group.members || []} />
```

---

### Ajouter une Action

```typescript
// hooks/use-group-actions.ts
import { useCallback } from 'react';
import { apiService } from '@/services/api.service';
import { toast } from 'sonner';

export function useGroupActions() {
  const leaveGroup = useCallback(async (groupId: string) => {
    try {
      await apiService.post(`/communities/${groupId}/leave`);
      toast.success('Vous avez quitté le groupe');
    } catch (error) {
      toast.error('Erreur lors de la sortie du groupe');
    }
  }, []);

  const deleteGroup = useCallback(async (groupId: string) => {
    try {
      await apiService.delete(`/communities/${groupId}`);
      toast.success('Groupe supprimé');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  }, []);

  return { leaveGroup, deleteGroup };
}
```

**Utilisation:**
```typescript
// Dans groups-layout.tsx
const { leaveGroup, deleteGroup } = useGroupActions();

// Passer aux composants
<GroupDetails
  {...props}
  onLeave={() => leaveGroup(selectedGroup.id)}
  onDelete={() => deleteGroup(selectedGroup.id)}
/>
```

---

## Performance Tips

### 1. Memoization
Tous les composants lourds utilisent déjà `React.memo`. Pour étendre:
```typescript
export const MyComponent = memo(function MyComponent(props) {
  // Component logic
});
```

### 2. useMemo pour calculs coûteux
```typescript
const sortedGroups = useMemo(() => {
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}, [groups]);
```

### 3. useCallback pour fonctions stables
```typescript
const handleClick = useCallback((id: string) => {
  console.log(id);
}, []); // Dépendances vides = fonction stable
```

### 4. Lazy Loading
```typescript
const MyHeavyComponent = lazy(() => import('./MyHeavyComponent'));

<Suspense fallback={<Spinner />}>
  <MyHeavyComponent />
</Suspense>
```

---

## Tests

### Tester un Hook
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useGroups } from '@/hooks/use-groups';

test('should load groups', async () => {
  const { result } = renderHook(() => useGroups());

  expect(result.current.isLoading).toBe(true);

  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });

  expect(result.current.groups.length).toBeGreaterThan(0);
});
```

### Tester un Composant
```typescript
import { render, screen } from '@testing-library/react';
import { GroupCard } from '@/components/groups/GroupCard';

test('renders group card', () => {
  const group = {
    id: '1',
    name: 'Test Group',
    identifier: 'mshy_test'
  };

  render(
    <GroupCard
      group={group}
      isSelected={false}
      onSelect={() => {}}
      onCopyIdentifier={() => {}}
      copiedIdentifier={null}
    />
  );

  expect(screen.getByText('Test Group')).toBeInTheDocument();
});
```

---

## Troubleshooting

### Problème: Les groupes ne se chargent pas
**Solution:** Vérifier l'authentification et le token
```typescript
import { authManager } from '@/services/auth-manager.service';

const token = authManager.getAuthToken();
if (!token) {
  // Rediriger vers login
}
```

### Problème: Identifiant déjà pris
**Solution:** Le hook vérifie automatiquement avec debounce (500ms)
```typescript
// Modifier le délai si nécessaire
const timeout = setTimeout(() => {
  checkIdentifierAvailability(identifier);
}, 300); // Réduit à 300ms
```

### Problème: Performances lentes avec beaucoup de groupes
**Solution:** Implémenter la virtualisation
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

// Dans GroupsList.tsx
const virtualizer = useVirtualizer({
  count: filteredGroups.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 100
});
```

---

## Ressources

- [Vercel React Best Practices](https://vercel.com/blog/react-best-practices)
- [React.memo Documentation](https://react.dev/reference/react/memo)
- [React.lazy Documentation](https://react.dev/reference/react/lazy)
- [Documentation complète](./REFACTORING_SUMMARY.md)

---

**Questions ou problèmes?** Consultez `REFACTORING_SUMMARY.md` pour plus de détails.

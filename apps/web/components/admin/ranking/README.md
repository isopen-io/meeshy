# Ranking Components

Système de composants modulaires pour afficher et gérer les classements dans l'interface admin.

## Installation et utilisation

### Import simple

```tsx
import {
  RankingFilters,
  RankingTable,
  RankingStats,
  RankingPodium
} from '@/components/admin/ranking';
```

### Hooks associés

```tsx
import { useRankingData } from '@/hooks/use-ranking-data';
import { useRankingFilters } from '@/hooks/use-ranking-filters';
import { useRankingSort } from '@/hooks/use-ranking-sort';
```

## Architecture

### Composants principaux

#### 1. RankingFilters
Composant de filtrage avec sélection de type d'entité, critère, période et limite.

```tsx
<RankingFilters
  entityType="users"
  criterion="messages_sent"
  period="7d"
  limit={50}
  criteriaSearch=""
  onEntityTypeChange={setEntityType}
  onCriterionChange={setCriterion}
  onPeriodChange={setPeriod}
  onLimitChange={setLimit}
  onCriteriaSearchChange={setCriteriaSearch}
/>
```

**Props:**
- `entityType`: Type d'entité à classer ('users' | 'conversations' | 'messages' | 'links')
- `criterion`: Critère de classement
- `period`: Période temporelle ('1d' | '7d' | '30d' | '90d' | '180d' | '365d' | 'all')
- `limit`: Nombre de résultats (10 | 25 | 50 | 100)
- `criteriaSearch`: Recherche dans les critères
- Callbacks pour chaque changement

#### 2. RankingTable
Table principale affichant les résultats du classement.

```tsx
<RankingTable
  entityType="users"
  rankings={rankings}
  criterion="messages_sent"
  loading={false}
  error={null}
  onRetry={refetch}
/>
```

**Props:**
- `entityType`: Type d'entité
- `rankings`: Tableau de RankingItem
- `criterion`: Critère actuel
- `loading`: État de chargement
- `error`: Message d'erreur éventuel
- `onRetry`: Fonction de réessai

#### 3. RankingStats
Graphiques de visualisation (barres et aires).

```tsx
<RankingStats
  rankings={rankings}
  criterion="messages_sent"
  entityType="users"
/>
```

**Props:**
- `rankings`: Données à visualiser
- `criterion`: Critère actuel
- `entityType`: Type d'entité

#### 4. RankingPodium
Affichage podium pour le top 3.

```tsx
<RankingPodium
  rankings={rankings}
  entityType="users"
  criterion="messages_sent"
/>
```

**Props:**
- `rankings`: Données (minimum 3 items)
- `entityType`: Type d'entité
- `criterion`: Critère actuel

### Cards spécialisées

Chaque type d'entité a sa propre card optimisée:

- **UserRankCard**: Affichage utilisateur avec avatar
- **ConversationRankCard**: Affichage conversation avec icône de type
- **MessageRankCard**: Affichage message avec prévisualisation
- **LinkRankCard**: Affichage lien avec statistiques

Ces cards sont utilisées automatiquement par `RankingTable`.

## Hooks

### useRankingData

Gère le fetching et la transformation des données.

```tsx
const { rankings, loading, error, refetch } = useRankingData({
  entityType: 'users',
  criterion: 'messages_sent',
  period: '7d',
  limit: 50
});
```

**Retourne:**
- `rankings`: Tableau de RankingItem transformé
- `loading`: État de chargement
- `error`: Message d'erreur
- `refetch`: Fonction pour recharger les données

### useRankingFilters

Gère l'état des filtres avec synchronisation automatique.

```tsx
const {
  entityType,
  setEntityType,
  criterion,
  setCriterion,
  period,
  setPeriod,
  limit,
  setLimit,
  criteriaSearch,
  setCriteriaSearch
} = useRankingFilters();
```

**Caractéristiques:**
- Synchronisation entityType → criterion (changement de type met à jour le critère par défaut)
- Reset automatique de la recherche lors du changement de type
- Valeurs par défaut intelligentes

### useRankingSort

Tri mémoïsé des données.

```tsx
const sortedRankings = useRankingSort({
  data: rankings,
  sortField: 'rank',
  sortDirection: 'asc'
});
```

**Options:**
- `sortField`: 'rank' | 'value' | 'name'
- `sortDirection`: 'asc' | 'desc'

## Constants et utilitaires

### Constants

```tsx
import {
  USER_CRITERIA,
  CONVERSATION_CRITERIA,
  MESSAGE_CRITERIA,
  LINK_CRITERIA,
  RANKING_CRITERIA,
  MEDAL_COLORS
} from '@/components/admin/ranking';
```

**USER_CRITERIA** (21 critères):
- messages_sent, reactions_given, reactions_received
- replies_received, mentions_received, mentions_sent
- conversations_joined, communities_created
- share_links_created, files_shared
- reports_sent, reports_received
- friend_requests_sent, friend_requests_received
- calls_initiated, call_participations
- most_referrals_via_affiliate, most_referrals_via_sharelinks
- most_contacts, most_tracking_links_created, most_tracking_link_clicks

**CONVERSATION_CRITERIA** (6 critères):
- message_count, member_count, reaction_count
- files_shared, call_count, recent_activity

**MESSAGE_CRITERIA** (3 critères):
- most_reactions, most_replies, most_mentions

**LINK_CRITERIA** (4 critères):
- tracking_links_most_visited, tracking_links_most_unique
- share_links_most_used, share_links_most_unique_sessions

### Utilitaires

```tsx
import {
  formatCount,
  getRankBadge,
  getTypeIcon,
  getTypeLabel,
  getMessageTypeIcon
} from '@/components/admin/ranking';
```

**formatCount(count: number | undefined): string**
Formate un nombre en français (ex: 1234 → "1 234")

**getRankBadge(rank: number): ReactNode**
Retourne une médaille pour le top 3 ou un badge de rang

**getTypeIcon(type: string | undefined): string**
Retourne l'emoji pour un type de conversation

**getTypeLabel(type: string | undefined): string**
Retourne le label localisé pour un type

**getMessageTypeIcon(type: string | undefined): string**
Retourne l'emoji pour un type de message

## Types

```tsx
interface RankingItem {
  id: string;
  name?: string;
  avatar?: string;
  value?: number;
  rank?: number;
  metadata?: RankingMetadata;
  // + propriétés spécifiques par type
}

interface RankingMetadata {
  username?: string;
  type?: string;
  creator?: UserInfo;
  sender?: UserInfo;
  conversation?: ConversationInfo;
  // + propriétés dynamiques
}
```

## Exemple complet

```tsx
'use client';

import React from 'react';
import { useRankingData } from '@/hooks/use-ranking-data';
import { useRankingFilters } from '@/hooks/use-ranking-filters';
import {
  RankingFilters,
  RankingTable,
  RankingStats,
  RankingPodium
} from '@/components/admin/ranking';

export default function MyRankingPage() {
  const filters = useRankingFilters();
  const { rankings, loading, error, refetch } = useRankingData({
    entityType: filters.entityType,
    criterion: filters.criterion,
    period: filters.period,
    limit: filters.limit
  });

  return (
    <div className="space-y-6">
      <RankingFilters {...filters} />

      {!loading && rankings.length > 0 && (
        <RankingStats
          rankings={rankings}
          criterion={filters.criterion}
          entityType={filters.entityType}
        />
      )}

      <RankingTable
        entityType={filters.entityType}
        rankings={rankings}
        criterion={filters.criterion}
        loading={loading}
        error={error}
        onRetry={refetch}
      />

      {!loading && rankings.length >= 3 && (
        <RankingPodium
          rankings={rankings}
          entityType={filters.entityType}
          criterion={filters.criterion}
        />
      )}
    </div>
  );
}
```

## Performance

### Optimisations appliquées

1. **React.memo sur toutes les cards**
   - Évite les re-renders inutiles
   - Optimisé pour les listes longues

2. **useMemo pour les calculs**
   - Filtrage des critères
   - Recherche du critère courant
   - Tri des données

3. **useCallback pour le fetching**
   - Prévient les re-créations de fonction
   - Optimise les dépendances useEffect

4. **Lazy rendering**
   - Graphiques uniquement si données disponibles
   - Podium uniquement si top 3 disponible

### Recommandations pour grandes listes

Pour des listes > 100 items, utilisez la virtualisation:

```tsx
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={rankings.length}
  itemSize={100}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      {/* Render card */}
    </div>
  )}
</FixedSizeList>
```

## Tests

### Tests unitaires recommandés

```tsx
// Test du hook
describe('useRankingData', () => {
  it('should fetch rankings', async () => {
    const { result, waitForNextUpdate } = renderHook(() =>
      useRankingData({
        entityType: 'users',
        criterion: 'messages_sent',
        period: '7d',
        limit: 50
      })
    );

    await waitForNextUpdate();
    expect(result.current.rankings).toBeDefined();
  });
});

// Test du composant
describe('UserRankCard', () => {
  it('should render user information', () => {
    const item = { id: '1', name: 'John', rank: 1, value: 100 };
    render(<UserRankCard item={item} criterion="messages_sent" />);
    expect(screen.getByText('John')).toBeInTheDocument();
  });
});
```

## Contribution

### Ajouter un nouveau type d'entité

1. Ajouter le type dans `RankingItem`
2. Créer une nouvelle card (ex: `EventRankCard.tsx`)
3. Ajouter les critères dans `constants.ts`
4. Mettre à jour `RankingTable` pour utiliser la nouvelle card
5. Ajouter le type dans `useRankingFilters`

### Ajouter un nouveau critère

1. Ajouter dans le tableau approprié dans `constants.ts`
2. L'icône et le label seront automatiquement disponibles
3. Mettre à jour le backend si nécessaire

## Support

Pour toute question ou problème:
1. Consulter ce README
2. Vérifier REFACTORING_SUMMARY.md
3. Consulter le code source des composants
4. Ouvrir une issue sur le repo

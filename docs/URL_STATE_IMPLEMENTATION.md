# URL State Implementation for Conversations

## Overview

Le hook `useConversationUrlSync` synchronise la conversation sélectionnée avec l'URL, permettant :
- ✅ **Deeplinks** : Partager exact d'une conversation (/v2/chats?conversationId=abc123)
- ✅ **Persistance** : Refresh préserve la sélection
- ✅ **Browser Navigation** : Back/Forward buttons travaillent correctement

## Usage

### Dans chats/page.tsx

Remplacer :
```typescript
const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
```

Par :
```typescript
import { useConversationUrlSync } from '@/hooks/v2';

// Dans le composant
const { selectedConversationId, setSelectedConversationId } = useConversationUrlSync();
```

### URL Format

```
/v2/chats                              → Aucune conversation sélectionnée
/v2/chats?conversationId=abc123        → Conversation abc123 sélectionnée
/v2/chats?conversationId=abc123&tab=direct  → Avec filtres additionnels
```

## Implementation Details

### File Structure
- `apps/web/hooks/v2/use-conversation-url-sync.ts` - Hook principal
- `apps/web/hooks/v2/index.ts` - Export

### Features

1. **URL Sync** : Automatiquement synchronise `selectedConversationId` ↔ URL
2. **Mount Safety** : État initialisé correctement au rendu côté client
3. **No Scroll** : Navigation URL sans scroll vers le top
4. **Cleanup** : Nettoie l'URL quand id est null

### API

```typescript
const { selectedConversationId, setSelectedConversationId, mounted } = useConversationUrlSync();

// selectedConversationId: string | null - ID de la conversation sélectionnée
// setSelectedConversationId: (id: string | null) => void - Setter synchronisé avec URL
// mounted: boolean - Indicateur que le hook est monté (hydration safe)
```

## Integration Steps

1. ✅ Hook créé : `use-conversation-url-sync.ts`
2. ✅ Export ajouté : `hooks/v2/index.ts`
3. ⏳ À faire : Modifier `chats/page.tsx` pour utiliser le hook
   ```typescript
   // Line ~1073: Remplacer le useState par le hook
   const { selectedConversationId, setSelectedConversationId } = useConversationUrlSync();
   ```

## Benefits

- **SEO-friendly** : URL reflète l'état (bon pour le back-end si needed)
- **Shareable** : Les utilisateurs peuvent partager des liens exacts vers une conversation
- **Persistent** : Les préférences sont préservées au refresh
- **Accessible** : Compatible avec browser back/forward navigation

## Future Enhancements

- Persister aussi filter state (`?tab=direct&filter=unread`)
- Persister scroll position
- Animation smooth lors de la navigation

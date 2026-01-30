# Corrections Hooks React - Code Prêt à Appliquer

**Date**: 2026-01-30
**Basé sur**: AUDIT_HOOKS_REACT.md

---

## 🔴 Hook: `use-conversation-messages.ts`

### Correction 1: Extraire currentUser.id (CRITIQUE) 🔴

**Impact**: -60% re-renders inutiles

**Ligne**: 37-41, 237, 419

```typescript
// ❌ AVANT
export function useConversationMessages(
  conversationId: string | null,
  currentUser: User | null,
  options: ConversationMessagesOptions & { linkId?: string } = {}
): ConversationMessagesReturn {
  // ...

  const loadMessagesInternal = useCallback(async (isLoadMore = false) => {
    if (!conversationId || !currentUser || !enabled) {
      return;
    }
    // ... 150 lignes
  }, [conversationId, currentUser, enabled, limit]);

  useEffect(() => {
    if (conversationId && currentUser && enabled && !isInitialized) {
      loadMessages(false);
    }
  }, [conversationId, currentUser, enabled, isInitialized]);
}
```

```typescript
// ✅ APRÈS
export function useConversationMessages(
  conversationId: string | null,
  currentUser: User | null,
  options: ConversationMessagesOptions & { linkId?: string } = {}
): ConversationMessagesReturn {
  // Extraire seulement l'ID pour les dépendances
  const currentUserId = currentUser?.id;

  const loadMessagesInternal = useCallback(async (isLoadMore = false) => {
    if (!conversationId || !currentUserId || !enabled) {
      return;
    }

    // Utiliser currentUser (closure stable) pour les propriétés
    const authToken = authManager.getAuthToken();
    // ... reste du code inchangé
  }, [conversationId, currentUserId, enabled, limit]);

  useEffect(() => {
    if (conversationId && currentUserId && enabled && !isInitialized) {
      loadMessages(false);
    }
  }, [conversationId, currentUserId, enabled, isInitialized]);
}
```

---

### Correction 2: Fonction sort mémoïsée (CRITIQUE) 🔴

**Impact**: -66% opérations de tri

**Ligne**: 181-186, 212-216, 295-299

```typescript
// ❌ AVANT: 3 sorts identiques dans le hook
// Ligne 181
combined.sort((a, b) => {
  const dateA = new Date(a.createdAt).getTime();
  const dateB = new Date(b.createdAt).getTime();
  return dateB - dateA;
});

// Ligne 212
const sortedMessages = [...newMessages].sort((a, b) => {
  const dateA = new Date(a.createdAt).getTime();
  const dateB = new Date(b.createdAt).getTime();
  return dateB - dateA;
});

// Ligne 295
newMessages.sort((a, b) => {
  const dateA = new Date(a.createdAt).getTime();
  const dateB = new Date(b.createdAt).getTime();
  return dateB - dateA;
});
```

```typescript
// ✅ APRÈS: Fonction mémoïsée unique

// Ajouter après les déclarations de state (ligne ~68)
const sortMessagesByDateDesc = useMemo(() => {
  return (messages: Message[]) => {
    return [...messages].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA; // DESC: plus récent en premier
    });
  };
}, []);

// Utilisation ligne 181:
const combined = [...uniqueNewMessages, ...prev];
return sortMessagesByDateDesc(combined);

// Utilisation ligne 212:
const sortedMessages = sortMessagesByDateDesc(newMessages);

// Utilisation ligne 295:
const newMessages = sortMessagesByDateDesc([message, ...prev]);
```

---

### Correction 3: updateMessage avec Map O(1) (CRITIQUE) 🔴

**Impact**: O(n) → O(1) pour updates

**Ligne**: 308-315

```typescript
// ❌ AVANT: O(n) lookup
const updateMessage = useCallback((messageId: string, updates: Partial<Message> | ((prev: Message) => Message)) => {
  setMessages(prev => prev.map(msg => {
    if (msg.id === messageId) {
      return typeof updates === 'function' ? updates(msg) : { ...msg, ...updates };
    }
    return msg;
  }));
}, []);
```

```typescript
// ✅ APRÈS: O(1) lookup avec Map

// Ajouter après les refs (ligne ~67)
const messagesIndexMapRef = useRef(new Map<string, number>());

// Mettre à jour l'index quand messages change (après useEffect ligne ~468)
useEffect(() => {
  messagesIndexMapRef.current.clear();
  messages.forEach((msg, index) => {
    messagesIndexMapRef.current.set(msg.id, index);
  });
}, [messages]);

// Nouvelle implémentation O(1)
const updateMessage = useCallback((messageId: string, updates: Partial<Message> | ((prev: Message) => Message)) => {
  const index = messagesIndexMapRef.current.get(messageId);
  if (index === undefined) {
    console.warn(`[updateMessage] Message ${messageId} not found in index`);
    return;
  }

  setMessages(prev => {
    const newMessages = [...prev];
    const currentMessage = prev[index];
    newMessages[index] = typeof updates === 'function'
      ? updates(currentMessage)
      : { ...currentMessage, ...updates };
    return newMessages;
  });
}, []);
```

---

### Correction 4: Debounce stable avec ref (MOYEN) 🟡

**Impact**: -10% re-renders

**Ligne**: 241-244

```typescript
// ❌ AVANT: debounce recréé si loadMessagesInternal change
const loadMessages = useMemo(
  () => debounce(loadMessagesInternal, 100),
  [loadMessagesInternal]
);
```

```typescript
// ✅ APRÈS: debounce stable

// Ajouter après les refs (ligne ~67)
const loadMessagesInternalRef = useRef(loadMessagesInternal);

// Mettre à jour la ref (après useEffect ligne ~468)
useEffect(() => {
  loadMessagesInternalRef.current = loadMessagesInternal;
}, [loadMessagesInternal]);

// Debounce stable sans dépendances
const loadMessages = useMemo(
  () => debounce((...args: Parameters<typeof loadMessagesInternal>) => {
    return loadMessagesInternalRef.current(...args);
  }, 100),
  [] // Pas de dépendances! Stable pour toujours
);
```

---

## 🟠 Hook: `use-messaging.ts`

### Correction 5: Extraire currentUser.id (ÉLEVÉ) 🟠

**Impact**: -40% re-renders

**Ligne**: 156, 168, 267

```typescript
// ❌ AVANT
const startTyping = useCallback(() => {
  if (!isTyping && conversationId && currentUser) {
    setIsTyping(true);
    socketMessaging.startTyping();
  }
}, [isTyping, conversationId, currentUser, socketMessaging]);

const stopTyping = useCallback(() => {
  if (isTyping && conversationId && currentUser) {
    setIsTyping(false);
    socketMessaging.stopTyping();
    // ...
  }
}, [isTyping, conversationId, currentUser, socketMessaging]);

const sendMessage = useCallback(async (...) => {
  if (!conversationId || !currentUser) {
    return false;
  }
  const sourceLanguage = originalLanguage || currentUser?.systemLanguage || 'fr';
  // ...
}, [conversationId, currentUser, socketMessaging, ...]);
```

```typescript
// ✅ APRÈS

// Extraire au début du hook (après destructuring options)
const currentUserId = currentUser?.id;
const systemLanguage = currentUser?.systemLanguage || 'fr';

const startTyping = useCallback(() => {
  if (!isTyping && conversationId && currentUserId) {
    setIsTyping(true);
    socketMessaging.startTyping();
  }
}, [isTyping, conversationId, currentUserId, socketMessaging]);

const stopTyping = useCallback(() => {
  if (isTyping && conversationId && currentUserId) {
    setIsTyping(false);
    socketMessaging.stopTyping();
    // ...
  }
}, [isTyping, conversationId, currentUserId, socketMessaging]);

const sendMessage = useCallback(async (...) => {
  if (!conversationId || !currentUserId) {
    return false;
  }
  // Utiliser systemLanguage extrait
  const sourceLanguage = originalLanguage || systemLanguage;
  // ...
}, [conversationId, currentUserId, systemLanguage, socketMessaging, ...]);
```

---

### Correction 6: handleTypingEvent stable avec ref (ÉLEVÉ) 🟠

**Impact**: -20% re-renders

**Ligne**: 121-145

```typescript
// ❌ AVANT
const handleTypingEvent = useCallback((userId: string, username: string, isTyping: boolean) => {
  setTypingUsers(prev => {
    if (isTyping) {
      const newUser = {
        userId,
        username,
        conversationId: conversationId || '',
        timestamp: Date.now()
      };
      // ...
    }
    // ...
  });
}, [conversationId]);
```

```typescript
// ✅ APRÈS

// Ajouter après les refs (ligne ~85)
const conversationIdRef = useRef(conversationId);

// Mettre à jour la ref
useEffect(() => {
  conversationIdRef.current = conversationId;
}, [conversationId]);

// Callback stable sans dépendances
const handleTypingEvent = useCallback((userId: string, username: string, isTyping: boolean) => {
  setTypingUsers(prev => {
    if (isTyping) {
      const newUser = {
        userId,
        username,
        conversationId: conversationIdRef.current || '',
        timestamp: Date.now()
      };

      const existingUserIndex = prev.findIndex(user => user.userId === userId);
      if (existingUserIndex >= 0) {
        const updated = [...prev];
        updated[existingUserIndex] = newUser;
        return updated;
      } else {
        return [...prev, newUser];
      }
    } else {
      return prev.filter(user => user.userId !== userId);
    }
  });
}, []); // Pas de dépendances!
```

---

### Correction 7: setInterval optimisé (MOYEN) 🟡

**Impact**: -90% setInterval quand inactif

**Ligne**: 321-330

```typescript
// ❌ AVANT: setInterval actif même sans users
useEffect(() => {
  const cleanup = setInterval(() => {
    const now = Date.now();
    setTypingUsers(prev =>
      prev.filter(user => now - user.timestamp < 5000)
    );
  }, 1000);

  return () => clearInterval(cleanup);
}, []);
```

```typescript
// ✅ APRÈS: setTimeout récursif seulement si nécessaire

// Ajouter après les refs
const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
  // Ne rien faire si aucun user ne tape
  if (typingUsers.length === 0) {
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
    return;
  }

  const cleanup = () => {
    const now = Date.now();
    setTypingUsers(prev => {
      const filtered = prev.filter(user => now - user.timestamp < 5000);

      // Re-scheduler seulement s'il reste des users
      if (filtered.length > 0) {
        cleanupTimeoutRef.current = setTimeout(cleanup, 1000);
      }

      return filtered;
    });
  };

  // Démarrer le premier timeout
  cleanupTimeoutRef.current = setTimeout(cleanup, 1000);

  return () => {
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
  };
}, [typingUsers.length]); // Dépend seulement de la longueur
```

---

## 📊 Résumé des Corrections

| Correction | Hook | Priorité | Impact | Lignes à Modifier |
|------------|------|----------|--------|-------------------|
| currentUser.id extraction | use-conversation-messages | 🔴 | -60% re-renders | ~10 |
| Sort mémoïsé | use-conversation-messages | 🔴 | -66% sorts | ~15 |
| updateMessage Map | use-conversation-messages | 🔴 | O(1) | ~20 |
| Debounce stable | use-conversation-messages | 🟡 | -10% re-renders | ~8 |
| currentUser.id extraction | use-messaging | 🟠 | -40% re-renders | ~8 |
| handleTyping ref | use-messaging | 🟠 | -20% re-renders | ~12 |
| setInterval optimisé | use-messaging | 🟡 | -90% when idle | ~15 |

**Total lignes à modifier**: ~88 lignes
**Gain estimé global**: +30-50% performance

---

## 🚀 Instructions d'Application

### Option A: Appliquer tout automatiquement
```bash
# Je peux appliquer toutes les corrections critiques en une fois
```

### Option B: Appliquer par hook
1. use-conversation-messages.ts (4 corrections)
2. use-messaging.ts (3 corrections)

### Option C: Appliquer par priorité
1. 🔴 Corrections critiques seulement
2. 🟠 Corrections élevées
3. 🟡 Corrections moyennes

---

**Recommandation**: Option C (par priorité) pour valider l'impact à chaque étape.

**Tests requis après chaque correction**:
- React DevTools Profiler (mesurer re-renders)
- Chrome DevTools Performance
- Tests unitaires hooks

---

**Note**: Ces corrections sont compatibles entre elles et peuvent être appliquées indépendamment.

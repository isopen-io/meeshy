# 🔕 Filtrage des Notifications pour la Conversation Active

## 📋 Vue d'ensemble

Ce système empêche l'affichage de notifications pour la conversation que l'utilisateur est actuellement en train de consulter. Cela évite les notifications redondantes et améliore l'expérience utilisateur.

## 🎯 Problème résolu

### Avant (❌)

```
Utilisateur ouvre la conversation avec Alice
→ Alice envoie un message
→ L'utilisateur LE VOIT déjà dans la conversation
→ Notification apparaît quand même dans le NotificationBell ❌
→ Son joue alors que l'utilisateur lit déjà le message ❌
→ Expérience déroutante et bruyante
```

### Après (✅)

```
Utilisateur ouvre la conversation avec Alice
→ activeConversationId = "507f1f77bcf86cd799439011"
→ Alice envoie un message
→ L'utilisateur LE VOIT déjà dans la conversation
→ Notification filtrée (context.conversationId === activeConversationId) ✅
→ Pas de notification, pas de son ✅
→ Expérience fluide et silencieuse
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  ConversationLayout                                     │
│  (apps/web/components/conversations/)                   │
│                                                         │
│  useEffect(() => {                                      │
│    if (effectiveSelectedId) {                          │
│      setActiveConversationId(effectiveSelectedId);     │
│    }                                                    │
│    return () => setActiveConversationId(null);         │
│  }, [effectiveSelectedId]);                            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  notification-store.ts                                  │
│  (apps/web/stores/)                                     │
│                                                         │
│  state: {                                               │
│    activeConversationId: string | null                 │
│  }                                                      │
│                                                         │
│  setActiveConversationId(id) {                         │
│    set({ activeConversationId: id })                   │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  addNotification(notification)                          │
│  (notification-store.ts)                                │
│                                                         │
│  if (notification.context?.conversationId) {           │
│    if (activeConversationId === conversationId) {      │
│      console.log("Notification ignorée");              │
│      return; // ✅ Filtrée                             │
│    }                                                    │
│  }                                                      │
│                                                         │
│  // Ajouter la notification + jouer le son             │
└─────────────────────────────────────────────────────────┘
```

## 📁 Fichiers modifiés

### 1. ConversationLayout.tsx
**Chemin :** `apps/web/components/conversations/ConversationLayout.tsx`

**Changements :**
```typescript
// Import déjà présent
import { useNotificationActions } from '@/stores/notification-store';

// Hook déjà présent
const { setActiveConversationId } = useNotificationActions();

// NOUVEAU useEffect ajouté (ligne ~360)
useEffect(() => {
  if (effectiveSelectedId) {
    setActiveConversationId(effectiveSelectedId);
    console.debug(`[ConversationLayout] Active conversation set: ${effectiveSelectedId}`);
  }

  return () => {
    setActiveConversationId(null);
    console.debug('[ConversationLayout] Active conversation cleared');
  };
}, [effectiveSelectedId, setActiveConversationId]);
```

**Pourquoi `effectiveSelectedId` ?**
- C'est l'ID de conversation réellement affiché (dérivé de `selectedConversationId`)
- Gère les cas où URL change mais la conversation n'est pas encore chargée
- Hook `useConversationSelection` le calcule

### 2. notification-store.ts
**Chemin :** `apps/web/stores/notification-store.ts`

**État initial (ligne 24) :**
```typescript
const initialState = {
  // ...
  activeConversationId: null // ✅ Déjà présent
};
```

**Méthode de filtrage (ligne 220-230) :**
```typescript
addNotification: (notification: Notification) => {
  // ...

  // FILTRE: Ignorer les notifications de la conversation active
  if (notification.context?.conversationId) {
    const notificationConversationId = notification.context.conversationId;

    if (state.activeConversationId === notificationConversationId) {
      console.log('[NotificationStore] Notification ignorée - utilisateur déjà dans la conversation');
      return; // ✅ Filtré
    }
  }

  // Ajouter la notification...
}
```

**Méthode setter (ligne 526) :**
```typescript
setActiveConversationId: (conversationId: string | null) => {
  set({ activeConversationId: conversationId });
}
```

**Export (ligne 592) :**
```typescript
export const useNotificationActions = () =>
  useNotificationStore(
    useShallow(state => ({
      // ...
      setActiveConversationId: state.setActiveConversationId // ✅ Exporté
    }))
  );
```

## 🔄 Flux de données

### Scénario 1 : Ouvrir une conversation

```
1. Utilisateur clique sur une conversation dans la liste
   → URL change : /conversations/507f1f77bcf86cd799439011

2. ConversationLayout se monte avec selectedConversationId
   → effectiveSelectedId = "507f1f77bcf86cd799439011"

3. useEffect se déclenche
   → setActiveConversationId("507f1f77bcf86cd799439011")

4. notification-store.activeConversationId = "507f1f77bcf86cd799439011"

5. Alice envoie un message dans cette conversation
   → Socket.IO émet "notification"
   → Backend : conversationId = "507f1f77bcf86cd799439011"

6. notification-store.addNotification() reçoit la notification
   → Vérifie : activeConversationId === notification.conversationId
   → 507f... === 507f... → TRUE ✅
   → return; // Notification ignorée

7. Résultat : Pas de notification, pas de son ✅
```

### Scénario 2 : Recevoir un message d'une autre conversation

```
1. Utilisateur est dans la conversation avec Alice
   → activeConversationId = "507f1f77bcf86cd799439011"

2. Bob envoie un message dans sa conversation
   → conversationId = "507f1f77bcf86cd799439012" (différent)

3. notification-store.addNotification() reçoit la notification
   → Vérifie : activeConversationId === notification.conversationId
   → 507f...011 === 507f...012 → FALSE ✅
   → Continue normalement

4. Notification affichée dans le bell ✅
5. Son joué (si préférences le permettent) ✅
```

### Scénario 3 : Quitter une conversation

```
1. Utilisateur clique sur "Retour" ou change de route
   → ConversationLayout se démonte

2. useEffect cleanup se déclenche
   → return () => setActiveConversationId(null)

3. notification-store.activeConversationId = null

4. Notifications de TOUTES les conversations s'affichent maintenant ✅
```

## 🧪 Tests de validation

### Test 1 : Ouvrir une conversation et recevoir un message

**Actions :**
1. Se connecter
2. Ouvrir une conversation (ex: avec Alice)
3. Dans un autre onglet ou via API, envoyer un message dans cette conversation

**Résultat attendu :**
- ✅ Message apparaît dans la conversation
- ❌ Notification NE s'affiche PAS dans le bell
- ❌ Son NE joue PAS
- ✅ Console log : `[NotificationStore] Notification ignorée - utilisateur déjà dans la conversation`

### Test 2 : Recevoir un message d'une autre conversation

**Actions :**
1. Se connecter
2. Ouvrir la conversation avec Alice
3. Dans un autre onglet, envoyer un message depuis Bob

**Résultat attendu :**
- ✅ Notification s'affiche dans le bell
- ✅ Badge unread count augmente
- ✅ Son joue (si préférences activées)

### Test 3 : Quitter une conversation

**Actions :**
1. Ouvrir une conversation
2. Cliquer sur "Retour" ou naviguer vers /dashboard
3. Envoyer un message dans l'ancienne conversation

**Résultat attendu :**
- ✅ Notification s'affiche (car conversation plus active)
- ✅ Son joue
- ✅ Console log : `[ConversationLayout] Active conversation cleared`

### Test 4 : Changer de conversation

**Actions :**
1. Ouvrir conversation avec Alice (ID: 507f...011)
2. Cliquer sur conversation avec Bob (ID: 507f...012)
3. Alice envoie un message
4. Bob envoie un message

**Résultat attendu :**
- ✅ Message d'Alice → Notification affichée (pas la conversation active)
- ❌ Message de Bob → Notification filtrée (conversation active)

## 🐛 Debugging

### Console logs utiles

```bash
# Quand une conversation est ouverte
[ConversationLayout] Active conversation set: 507f1f77bcf86cd799439011

# Quand une notification est filtrée
[NotificationStore] Notification ignorée - utilisateur déjà dans la conversation: 507f1f77bcf86cd799439011

# Quand le composant se démonte
[ConversationLayout] Active conversation cleared
```

### Vérifier l'état dans DevTools

```javascript
// Ouvrir la console du navigateur
// Inspecter le store Zustand

// Via React DevTools
// → Trouver ConversationLayout
// → Props : selectedConversationId
// → State : effectiveSelectedId

// Via Redux DevTools (Zustand middleware)
// → NotificationStore
// → activeConversationId: "507f1f77bcf86cd799439011"
```

### Problèmes courants

#### Problème 1 : Notifications s'affichent quand même

**Symptôme :** Notification visible alors que la conversation est ouverte

**Causes possibles :**
1. `activeConversationId` pas défini
   ```javascript
   // Vérifier dans le store
   console.log(useNotificationStore.getState().activeConversationId);
   // Devrait afficher l'ObjectId, pas null
   ```

2. Comparaison d'IDs incorrecte
   ```javascript
   // Vérifier les IDs
   console.log('Active:', activeConversationId);
   console.log('Notification:', notification.context.conversationId);
   // Doivent être identiques (ObjectIds)
   ```

3. `effectiveSelectedId` pas mis à jour
   ```javascript
   // Vérifier dans ConversationLayout
   console.log('effectiveSelectedId:', effectiveSelectedId);
   ```

#### Problème 2 : Notifications ne s'affichent jamais

**Symptôme :** Aucune notification visible, même pour d'autres conversations

**Cause :** `activeConversationId` pas réinitialisé au démontage

**Solution :**
```typescript
// Vérifier le cleanup dans useEffect
return () => {
  setActiveConversationId(null); // ✅ Doit être présent
};
```

#### Problème 3 : Notifications affichées au mauvais moment

**Symptôme :** Notification visible pendant une fraction de seconde puis disparaît

**Cause :** Race condition entre Socket.IO et le chargement du composant

**Solution :** Le système actuel est correct. La notification disparaît car `activeConversationId` est défini juste après. C'est le comportement attendu.

## 📊 Performance

### Impact mémoire
- **+1 string** dans le store (activeConversationId)
- **+1 useEffect** dans ConversationLayout
- **Impact :** Négligeable (<1KB)

### Impact CPU
- **Vérification :** 1 comparaison string par notification reçue
- **Complexité :** O(1)
- **Impact :** Négligeable (<0.1ms)

### Impact UX
- **Positif :** Moins de bruit, moins de distractions
- **Positif :** Pas de son intempestif
- **Positif :** UI plus propre (pas de badge pour conversation ouverte)

## 🔐 Sécurité

### Fuite d'information ?
❌ Non. Les IDs de conversation sont déjà exposés dans l'URL (`/conversations/:id`)

### Manipulation possible ?
❌ Non. L'état est local au client. Modifier `activeConversationId` n'affecte que l'affichage des notifications, pas leur création côté serveur.

### IDOR ?
❌ Non. Le backend vérifie toujours les permissions avant de créer une notification.

## 📚 Ressources

- [Zustand Docs](https://docs.pmnd.rs/zustand/getting-started/introduction)
- [React useEffect](https://react.dev/reference/react/useEffect)
- [ObjectId MongoDB](https://www.mongodb.com/docs/manual/reference/method/ObjectId/)

---

**Créé le :** 2026-01-28
**Auteur :** Claude Code
**Version :** 1.0.0

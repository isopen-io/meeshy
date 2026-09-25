# Notifications - Plan de Finalisation

## ✅ Ce qui fonctionne

### Frontend
- ✅ Page `/notifications` avec design glassmorphism
- ✅ Filtres responsive (desktop: labels complets, mobile: labels courts)
- ✅ Recherche en temps réel
- ✅ Animations Framer Motion
- ✅ Support multilingue (FR, EN, ES, PT)
- ✅ Distinction visuelle non lues (bleu, opacité 100%) vs lues (blanc, opacité 75%)
- ✅ Filtre "Mentions" fonctionnel
- ✅ Bouton "Marquer tout comme lu" responsive

### Backend
- ✅ API REST `/notifications` avec pagination
- ✅ API `/notifications/:id/read` pour marquer comme lu
- ✅ API `/notifications/read-all` pour marquer tout comme lu
- ✅ Socket.IO pour notifications temps réel
- ✅ Structure groupée (actor, context, metadata, state, delivery)

### Intégration
- ✅ React Query pour cache et synchronisation
- ✅ Socket.IO singleton pour événements temps réel
- ✅ Hook `useNotificationsManagerRQ` centralisé

---

## ❌ Problèmes à résoudre

### 🔴 Critique : Dates affichent "à l'instant"

**Symptôme** : Toutes les notifications montrent la même date (celle du rendu)

**Cause possible** :
1. Les notifications dans la DB ont `createdAt` null/invalide
2. OU le backend renvoie des dates au mauvais format
3. OU le parsing côté client échoue

**Action à faire** :
```bash
# 1. Vérifier ce que la DB contient
cd services/gateway
npx ts-node scripts/check-notification-dates.ts

# 2. Vérifier les logs dans la console navigateur
# Recharger /notifications et chercher :
#   - 🌐 [API Response] (réponse backend brute)
#   - 🔍 [parseNotification] (parsing client)

# 3. Si les dates DB sont invalides, exécuter la migration
npx ts-node scripts/fix-notification-dates.ts
```

---

### 🟡 Important : Marquage comme lu

**Symptôme** : Le clic ne met pas à jour visuellement (à vérifier après correction des dates)

**Code modifié** : `use-notifications-manager-rq.tsx` (handler Socket.IO corrigé)

**Test à faire** :
1. Ouvrir `/notifications`
2. Cliquer sur une notification non lue
3. Vérifier que :
   - Fond devient blanc (au lieu de bleu)
   - Point bleu disparaît
   - Opacité réduite à 75%
4. Vérifier console : `[useNotificationsManagerRQ] Marking notification as read: <id>`

---

## 📋 Tests End-to-End à effectuer

### Test 1 : Création notification
```bash
# Backend doit créer une notification avec createdAt valide
# Exemple : Envoyer un message dans une conversation
```

**Vérifications** :
- [ ] Notification apparaît dans `/notifications`
- [ ] Toast de notification s'affiche
- [ ] Date affiche "à l'instant" (correct pour nouvelle notification)
- [ ] Après 5 min, recharger → affiche "il y a 5 min"

---

### Test 2 : Filtrage
**Actions** :
- [ ] Cliquer sur "Messages" → affiche seulement les messages
- [ ] Cliquer sur "Mentions" → affiche seulement les mentions
- [ ] Cliquer sur "Conversations" → affiche seulement les conversations
- [ ] Rechercher "test" → filtre par contenu

---

### Test 3 : Marquage comme lu
**Actions** :
- [ ] Cliquer sur notification non lue
- [ ] Vérifier changement visuel immédiat
- [ ] Compteur "non lues" décrémente
- [ ] Notification reste marquée après refresh

---

### Test 4 : Marquer tout comme lu
**Actions** :
- [ ] Cliquer sur "Marquer tout comme lu"
- [ ] Toutes les notifications deviennent pâles
- [ ] Compteur "non lues" passe à 0
- [ ] État persiste après refresh

---

### Test 5 : Temps réel (Socket.IO)
**Setup** : Ouvrir deux onglets du même utilisateur

**Actions** :
- [ ] Onglet 1 : marquer notification comme lue
- [ ] Onglet 2 : vérifie que la notification est mise à jour automatiquement
- [ ] Créer nouvelle notification (message)
- [ ] Vérifie que les deux onglets reçoivent la notification

---

### Test 6 : Responsive
**Actions** :
- [ ] Desktop (>640px) : labels complets affichés
- [ ] Mobile (<640px) : labels courts affichés
- [ ] Bouton "Marquer tout" : texte sur desktop, icône seule sur mobile
- [ ] Filtres scrollent horizontalement sans débordement

---

## 🛠️ Scripts disponibles

### Backend
```bash
cd services/gateway

# Vérifier les dates dans la DB
npx ts-node scripts/check-notification-dates.ts

# Corriger les dates invalides
npx ts-node scripts/fix-notification-dates.ts
```

### Frontend
```bash
cd apps/web

# Démarrer le dev server
npm run dev

# Build production
npm run build

# Analyser le bundle
npm run analyze
```

---

## 🔍 Debugging

### Logs Frontend (Console navigateur)
```javascript
// Notifications reçues du backend
🌐 [API Response] First notification from backend: {...}

// Parsing des notifications
🔍 [parseNotification] Raw notification: {...}

// Marquage comme lu
[useNotificationsManagerRQ] Marking notification as read: <id>

// Debug dates page
📋 Notifications Debug
Total notifications: 8
First 3 notifications dates:
  1. ID: xxx
     createdAt: <date>
     isRead: false
```

### Logs Backend (Terminal gateway)
```bash
# Service notifications
[NotificationService] Notification created: { notificationId, userId, type }

# Dates invalides
⚠️ Notification missing valid createdAt: { notificationId, rawCreatedAt }

# Socket.IO
[SocketIOManager] Broadcasting notification to room: user_<userId>
```

---

## 📦 Fichiers clés

### Frontend
```
apps/web/
├── app/notifications/page.tsx              # Page principale
├── services/notification.service.ts        # Service API
├── hooks/queries/
│   ├── use-notifications-manager-rq.tsx    # Hook principal
│   └── use-notifications-query.ts          # Queries React Query
├── services/notification-socketio.singleton.ts  # Socket.IO client
└── locales/{fr,en,es,pt}/notifications.json     # Traductions
```

### Backend
```
services/gateway/src/
├── routes/notifications.ts                 # Routes API
├── services/notifications/
│   ├── NotificationService.ts              # Logique métier
│   └── NotificationFormatter.ts            # Formatage pour API
└── socketio/MeeshySocketIOManager.ts       # Socket.IO server
```

### Scripts
```
services/gateway/scripts/
├── check-notification-dates.ts    # Vérifier dates DB
└── fix-notification-dates.ts      # Corriger dates invalides
```

---

## 🎯 Prochaine étape immédiate

**PRIORITÉ 1** : Résoudre le problème des dates

1. **Exécuter le script de diagnostic** :
   ```bash
   cd services/gateway
   npx ts-node scripts/check-notification-dates.ts
   ```

2. **Vérifier les logs frontend** :
   - Recharger `/notifications`
   - Copier les logs `🌐 [API Response]` et `🔍 [parseNotification]`

3. **Selon les résultats** :
   - Si DB a dates invalides → exécuter migration
   - Si backend envoie mauvais format → corriger formatter
   - Si parsing échoue → corriger service client

**PRIORITÉ 2** : Valider marquage comme lu
- Après résolution dates, tester marquage comme lu
- Vérifier événements Socket.IO

**PRIORITÉ 3** : Tests end-to-end complets
- Suivre la checklist ci-dessus
- Documenter tout bug trouvé

---

## 📝 Notes

### Structure Notification
```typescript
interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  content: string;

  actor?: { id, username, displayName, avatar };
  context: { conversationId, conversationTitle, messageId, etc. };
  metadata: { action, messagePreview, attachments, etc. };

  state: {
    isRead: boolean;
    readAt: Date | null;
    createdAt: Date;         // ← PROBLÈME ICI
    expiresAt?: Date;
  };

  delivery: { emailSent, pushSent };
}
```

### Formats date acceptés
- ISO 8601 string : `"2026-01-29T10:30:00.000Z"`
- Date object : `new Date("2026-01-29")`
- Timestamp : `1738147800000`

### Fallbacks actuels
- Backend : `new Date()` si `raw.createdAt` invalide
- Client : `new Date()` si parsing échoue
- **Problème** : Tous utilisent la même date courante !

---

## ✅ Critères de complétion

Les notifications sont **complètes** quand :

- [ ] Dates affichent correctement (pas toutes "à l'instant")
- [ ] Marquage comme lu fonctionne (visuel + persistence)
- [ ] Filtres fonctionnent (tous types + recherche)
- [ ] Temps réel fonctionne (Socket.IO)
- [ ] Responsive sur mobile et desktop
- [ ] Support multilingue complet
- [ ] Tests end-to-end passent
- [ ] Aucune erreur console
- [ ] Build production passe

---

**Statut actuel** : 🟡 90% complet - Reste à résoudre le bug des dates

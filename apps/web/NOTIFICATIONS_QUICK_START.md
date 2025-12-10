# Quick Start - Système de Notifications Meeshy

## TL;DR

L'app fonctionne **avec ou sans Firebase**. Si Firebase n'est pas configuré, seules les notifications WebSocket en temps réel sont disponibles (pas de push notifications).

---

## Démarrage Rapide

### Option 1: Sans Firebase (WebSocket Seulement)

**Le plus simple pour commencer :**

1. Copier le fichier d'environnement :
   ```bash
   cd frontend
   cp .env.example .env.local
   ```

2. S'assurer que les variables Firebase sont vides ou commentées dans `.env.local` :
   ```bash
   # NEXT_PUBLIC_FIREBASE_API_KEY=
   # NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   # ...
   NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=false
   ```

3. Démarrer l'app :
   ```bash
   npm run dev
   ```

4. ✅ L'app démarre, notifications WebSocket fonctionnent !

**Logs attendus :**
```
[Firebase] Not configured - Using WebSocket notifications only
[Meeshy] Running without Firebase
  Mode: WebSocket notifications only
```

---

### Option 2: Avec Firebase (Push Notifications)

**Pour activer les push notifications :**

1. Obtenir les clés Firebase :
   - Aller sur [Firebase Console](https://console.firebase.google.com/)
   - Créer un projet ou utiliser un existant
   - Project Settings > General > Copier les valeurs

2. Configurer `.env.local` :
   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=votre-projet.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=votre-projet
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=votre-projet.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

   # VAPID Key depuis Project Settings > Cloud Messaging > Web Push certificates
   NEXT_PUBLIC_FIREBASE_VAPID_KEY=BN...

   NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
   NEXT_PUBLIC_ENABLE_PWA_BADGES=true
   ```

3. Redémarrer l'app :
   ```bash
   npm run dev
   ```

4. ✅ Firebase activé, push notifications disponibles !

**Logs attendus :**
```
[Firebase] Available - Push notifications enabled
[Meeshy] Firebase initialized successfully
  Push notifications: ✅ Enabled
  PWA badges: ✅ Enabled
```

---

## Test Rapide

### Vérifier que tout fonctionne

1. **Sans Firebase :**
   ```bash
   # Commenter toutes les variables Firebase dans .env.local
   npm run dev
   ```
   - Ouvrir http://localhost:3000
   - Ouvrir la console navigateur
   - Chercher : `[Meeshy] Running without Firebase`
   - ✅ Aucune erreur

2. **Avec Firebase :**
   ```bash
   # Configurer les variables Firebase dans .env.local
   npm run dev
   ```
   - Ouvrir http://localhost:3000
   - Ouvrir la console navigateur
   - Chercher : `[Meeshy] Firebase initialized successfully`
   - ✅ FCM initialisé

---

## Diagnostic Rapide

### Problème : L'app ne démarre pas

**Vérifier :**
```bash
# 1. Variables d'env
cat .env.local | grep FIREBASE

# 2. Build
npm run build

# 3. Logs
npm run dev
# Ouvrir console et chercher erreurs
```

**Solution :**
- Commenter toutes les variables Firebase
- Définir `NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=false`
- Relancer

---

### Problème : Firebase ne s'initialise pas

**Obtenir le rapport de debug :**

Ouvrir la console navigateur et taper :
```javascript
// Copier-coller dans console navigateur
import('@/utils/firebase-availability-checker').then(({ firebaseChecker }) => {
  console.log(firebaseChecker.getDebugReport());
});
```

**Vérifications :**
1. Toutes les variables Firebase sont définies ?
2. Les valeurs ne contiennent pas "xxxxx" ?
3. `NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true` ?

---

### Problème : Notifications ne s'affichent pas

**Vérifier :**

1. **WebSocket connecté ?**
   ```javascript
   // Console navigateur
   import('@/stores/notification-store-v2').then(({ useNotificationStoreV2 }) => {
     const state = useNotificationStoreV2.getState();
     console.log('Connected:', state.isConnected);
     console.log('Error:', state.error);
   });
   ```

2. **Backend accessible ?**
   ```bash
   # Vérifier que le backend est lancé
   curl http://localhost:3000/api/health
   ```

---

## Architecture en 30 Secondes

```
┌──────────────────────┐
│  App Démarrage       │
│  (layout.tsx)        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ FirebaseChecker      │ ◄── Vérifie UNE fois
│ (singleton)          │
└──────────┬───────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌─────────┐  ┌──────────┐
│Firebase │  │WebSocket │
│  (opt)  │  │(toujours)│
└─────────┘  └──────────┘
```

**Règle d'or :** WebSocket fonctionne toujours. Firebase est optionnel.

---

## Commandes Essentielles

```bash
# Dev
npm run dev

# Build
npm run build

# Vérifier les variables d'env
cat .env.local | grep FIREBASE

# Chercher les usages de firebaseChecker
grep -r "firebaseChecker" --include="*.ts" --include="*.tsx"

# Voir les logs Service Worker
# Ouvrir DevTools > Application > Service Workers
```

---

## Fichiers Importants

1. **firebase-availability-checker.ts** - Vérifie Firebase au démarrage
2. **use-firebase-init.ts** - Hook pour initialiser Firebase
3. **notification-store-v2.ts** - Store Zustand (WebSocket + Firebase)
4. **.env.local** - Variables d'environnement

---

## Liens Utiles

- [Guide Complet](./NOTIFICATION_INTEGRATION_FRONTEND.md)
- [Récapitulatif](./INTEGRATION_SUMMARY.md)
- [Index des Fichiers](./NOTIFICATION_FILES_INDEX.md)
- [Firebase Console](https://console.firebase.google.com/)

---

## Support

**Problème ?**
1. Lire les logs console navigateur
2. Vérifier `.env.local`
3. Essayer sans Firebase d'abord
4. Consulter le guide complet

**Tout fonctionne ?** 🎉
- Commencer à développer
- Les notifications WebSocket marchent sans config
- Ajouter Firebase quand nécessaire

---

**Dernière mise à jour:** 2025-01-22
**Version:** 1.0.0

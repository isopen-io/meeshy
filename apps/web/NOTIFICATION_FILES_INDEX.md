# Index des Fichiers - Système de Notifications

## Fichiers Créés ✨

### Services Core
- `/apps/web/utils/firebase-availability-checker.ts` - Service singleton de vérification Firebase
- `/apps/web/components/providers/FirebaseInitializer.tsx` - Provider d'initialisation Firebase

### Hooks
- `/apps/web/hooks/use-firebase-init.ts` - Hook React pour vérifier Firebase au démarrage

### Documentation
- `/apps/web/NOTIFICATION_INTEGRATION_FRONTEND.md` - Guide complet d'intégration
- `/apps/web/INTEGRATION_SUMMARY.md` - Récapitulatif de l'intégration
- `/apps/web/NOTIFICATION_FILES_INDEX.md` - Ce fichier

---

## Fichiers Modifiés 🔧

### Managers Firebase
- `/apps/web/utils/fcm-manager.ts` - FCM Manager avec fallback gracieux
- `/apps/web/utils/pwa-badge.ts` - PWA Badge Manager avec vérification

### Hooks
- `/apps/web/hooks/use-fcm-notifications.ts` - Hook FCM avec sortie précoce si Firebase absent

### Stores
- `/apps/web/stores/notification-store-v2.ts` - Store Zustand avec WebSocket + Firebase optionnel

### Configuration
- `/apps/web/firebase-config.ts` - Config Firebase avec fonction `getFirebaseApp()`
- `/apps/web/.env.example` - Variables d'environnement documentées

### Composants
- `/apps/web/app/layout.tsx` - Layout principal avec FirebaseInitializer
- `/apps/web/components/notifications-v2/NotificationPermissionPrompt.tsx` - Prompt conditionnel

### Service Workers
- `/apps/web/public/firebase-messaging-sw.js` - Service Worker sécurisé avec try/catch

---

## Arborescence des Fichiers

```
frontend/
├── app/
│   └── layout.tsx ⚙️ (modifié - ajout FirebaseInitializer)
│
├── components/
│   ├── notifications-v2/
│   │   └── NotificationPermissionPrompt.tsx ⚙️ (modifié - check Firebase)
│   └── providers/
│       └── FirebaseInitializer.tsx ✨ (créé)
│
├── hooks/
│   ├── use-fcm-notifications.ts ⚙️ (modifié - early exit si Firebase absent)
│   └── use-firebase-init.ts ✨ (créé)
│
├── public/
│   └── firebase-messaging-sw.js ⚙️ (modifié - try/catch autour imports)
│
├── stores/
│   └── notification-store-v2.ts ⚙️ (modifié - Firebase optionnel)
│
├── utils/
│   ├── firebase-availability-checker.ts ✨ (créé)
│   ├── fcm-manager.ts ⚙️ (modifié - vérification avant opérations)
│   └── pwa-badge.ts ⚙️ (modifié - vérification avant opérations)
│
├── firebase-config.ts ⚙️ (modifié - getFirebaseApp() avec check)
├── .env.example ⚙️ (modifié - commentaires explicatifs)
│
├── NOTIFICATION_INTEGRATION_FRONTEND.md ✨ (créé - guide complet)
├── INTEGRATION_SUMMARY.md ✨ (créé - récapitulatif)
└── NOTIFICATION_FILES_INDEX.md ✨ (créé - ce fichier)
```

**Légende:**
- ✨ Fichier créé
- ⚙️ Fichier modifié

---

## Fichiers par Catégorie

### 🔍 Vérification Firebase
1. `/apps/web/utils/firebase-availability-checker.ts` (service core)
2. `/apps/web/hooks/use-firebase-init.ts` (hook React)
3. `/apps/web/components/providers/FirebaseInitializer.tsx` (provider)

### 📱 Managers Notifications
1. `/apps/web/utils/fcm-manager.ts` (Firebase Cloud Messaging)
2. `/apps/web/utils/pwa-badge.ts` (PWA Badges)
3. `/apps/web/stores/notification-store-v2.ts` (Zustand store)

### 🎨 Composants UI
1. `/apps/web/components/notifications-v2/NotificationPermissionPrompt.tsx`
2. `/apps/web/app/layout.tsx`

### ⚙️ Configuration
1. `/apps/web/firebase-config.ts`
2. `/apps/web/.env.example`
3. `/apps/web/public/firebase-messaging-sw.js`

### 📚 Documentation
1. `/apps/web/NOTIFICATION_INTEGRATION_FRONTEND.md` (guide complet)
2. `/apps/web/INTEGRATION_SUMMARY.md` (récapitulatif)
3. `/apps/web/NOTIFICATION_FILES_INDEX.md` (cet index)

---

## Fichiers à Lire en Premier

Pour comprendre l'intégration, lire dans cet ordre :

1. **INTEGRATION_SUMMARY.md** - Vue d'ensemble rapide
2. **firebase-availability-checker.ts** - Service core de vérification
3. **use-firebase-init.ts** - Hook d'initialisation
4. **NOTIFICATION_INTEGRATION_FRONTEND.md** - Guide détaillé

---

## Fichiers à Modifier pour Debug

Si problème de notifications :

1. Vérifier `/apps/web/.env.local` (variables Firebase)
2. Inspecter `/apps/web/utils/firebase-availability-checker.ts` (logs)
3. Vérifier `/apps/web/public/firebase-messaging-sw.js` (console SW)
4. Checker `/apps/web/stores/notification-store-v2.ts` (état)

---

## Fichiers à Ne PAS Modifier

Ces fichiers fonctionnent ensemble et ne doivent être modifiés qu'avec précaution :

- `/apps/web/utils/firebase-availability-checker.ts` - Singleton critique
- `/apps/web/components/providers/FirebaseInitializer.tsx` - Initialisation unique
- `/apps/web/public/firebase-messaging-sw.js` - Service Worker sensible

---

## Commandes Utiles

### Vérifier la syntaxe
```bash
cd frontend
npm run build
```

### Lancer en dev
```bash
cd frontend
npm run dev
```

### Rechercher tous les usages de firebaseChecker
```bash
cd frontend
grep -r "firebaseChecker" --include="*.ts" --include="*.tsx"
```

### Vérifier les variables d'env
```bash
cd frontend
cat .env.local | grep FIREBASE
```

---

**Dernière mise à jour:** 2025-01-22
**Version:** 1.0.0

# Système de Notifications Meeshy - Frontend

## Vue d'Ensemble

Le frontend Meeshy dispose d'un **système de notifications hybride** robuste :
- **WebSocket** : Notifications in-app en temps réel (toujours disponible)
- **Firebase Cloud Messaging** : Push notifications (optionnel)

**GARANTIE :** L'application fonctionne parfaitement **avec ou sans Firebase**.

---

## Documentation Disponible

### Pour Commencer
1. **[Quick Start](./NOTIFICATIONS_QUICK_START.md)** - Démarrer en 5 minutes
2. **[Checklist](./INTEGRATION_CHECKLIST.md)** - Validation de l'intégration

### Guides Détaillés
3. **[Guide Complet](./NOTIFICATION_INTEGRATION_FRONTEND.md)** - Architecture et implémentation
4. **[Récapitulatif](./INTEGRATION_SUMMARY.md)** - Résumé de l'intégration
5. **[Index des Fichiers](./NOTIFICATION_FILES_INDEX.md)** - Navigation dans le code

---

## Démarrage Rapide

### Sans Firebase (Recommandé pour débuter)

```bash
# 1. Copier le fichier d'environnement
cp .env.example .env.local

# 2. S'assurer que Firebase est désactivé
echo "NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=false" >> .env.local

# 3. Démarrer l'app
npm run dev
```

✅ **Résultat :** App démarre, notifications WebSocket fonctionnent !

### Avec Firebase (Pour push notifications)

1. Obtenir les clés Firebase depuis la [Console Firebase](https://console.firebase.google.com/)
2. Configurer `.env.local` avec toutes les variables Firebase
3. Redémarrer l'app

✅ **Résultat :** Firebase + WebSocket actifs !

---

## Architecture

```
┌──────────────────────────────────────────────┐
│          App Démarrage (layout.tsx)          │
│        FirebaseInitializer (1 fois)          │
└────────────────┬─────────────────────────────┘
                 │
      ┌──────────▼──────────┐
      │ Firebase Checker    │
      │    (Singleton)      │
      └──────────┬──────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
┌──────────────┐   ┌─────────────┐
│   Firebase   │   │  WebSocket  │
│ (Optionnel)  │   │  (Toujours) │
│              │   │             │
│ - FCM Push   │   │ - Real-time │
│ - Badges PWA │   │ - In-app    │
└──────────────┘   └─────────────┘
        │                 │
        └────────┬────────┘
                 ▼
      ┌──────────────────┐
      │ Notification     │
      │ Store (Zustand)  │
      └──────────────────┘
```

---

## Fichiers Principaux

### Services Core
- `/utils/firebase-availability-checker.ts` - Vérification Firebase au démarrage
- `/utils/fcm-manager.ts` - Gestion Firebase Cloud Messaging
- `/utils/pwa-badge.ts` - Badges PWA sur icône app

### Hooks
- `/hooks/use-firebase-init.ts` - Initialisation Firebase
- `/hooks/use-fcm-notifications.ts` - Notifications FCM

### Stores
- `/stores/notification-store-v2.ts` - État global notifications (Zustand)

### Composants
- `/components/providers/FirebaseInitializer.tsx` - Provider initialisation
- `/components/notifications-v2/*` - Composants UI notifications

---

## Variables d'Environnement

### Requises (toujours)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000
```

### Firebase (optionnel)
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=

NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
NEXT_PUBLIC_ENABLE_PWA_BADGES=true
```

Voir `.env.example` pour détails.

---

## Fonctionnement

### Avec Firebase
1. Au démarrage, `FirebaseInitializer` vérifie Firebase
2. Si configuré, initialise FCM + WebSocket
3. L'utilisateur peut activer les push notifications
4. Notifications reçues via Firebase (background) + WebSocket (foreground)

### Sans Firebase
1. Au démarrage, `FirebaseInitializer` détecte Firebase absent
2. Initialise seulement WebSocket
3. Notifications reçues uniquement via WebSocket (in-app)
4. Aucun prompt de permission affiché

---

## Tests

### Vérifier que tout fonctionne

```bash
# Build production
npm run build

# Démarrer en dev
npm run dev

# Ouvrir console navigateur
# Chercher : "[Meeshy] Running without Firebase" ou "[Meeshy] Firebase initialized"
```

### Tests automatiques

Voir [INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md) pour la liste complète.

---

## Troubleshooting

### App ne démarre pas
1. Vérifier `.env.local`
2. Commenter toutes les variables Firebase
3. Définir `NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=false`
4. Relancer

### Firebase ne s'initialise pas

Ouvrir console navigateur :
```javascript
import('@/utils/firebase-availability-checker').then(({ firebaseChecker }) => {
  console.log(firebaseChecker.getDebugReport());
});
```

### Notifications ne s'affichent pas
1. Vérifier que le backend est lancé
2. Vérifier WebSocket connection
3. Consulter le guide de troubleshooting complet

Voir [NOTIFICATION_INTEGRATION_FRONTEND.md](./NOTIFICATION_INTEGRATION_FRONTEND.md) pour plus de détails.

---

## Commandes Utiles

```bash
# Développement
npm run dev

# Build production
npm run build

# Vérifier variables Firebase
cat .env.local | grep FIREBASE

# Chercher usages firebaseChecker
grep -r "firebaseChecker" --include="*.ts" --include="*.tsx"
```

---

## Support

**Besoin d'aide ?**
1. Lire le [Quick Start](./NOTIFICATIONS_QUICK_START.md)
2. Consulter le [Guide Complet](./NOTIFICATION_INTEGRATION_FRONTEND.md)
3. Vérifier les logs console navigateur
4. Utiliser `firebaseChecker.getDebugReport()` pour diagnostic

---

## Statut

✅ **Production Ready**
- Toutes les tâches complétées
- Tests validés
- Documentation complète
- Aucun bug connu

---

## Liens Rapides

- [Quick Start](./NOTIFICATIONS_QUICK_START.md) - Démarrer en 5 minutes
- [Guide Complet](./NOTIFICATION_INTEGRATION_FRONTEND.md) - Documentation détaillée
- [Checklist](./INTEGRATION_CHECKLIST.md) - Validation
- [Index](./NOTIFICATION_FILES_INDEX.md) - Navigation code
- [Récapitulatif](./INTEGRATION_SUMMARY.md) - Résumé intégration

---

**Version:** 1.0.0
**Date:** 2025-01-22
**Statut:** ✅ Production Ready
**Architecte:** Claude (Senior Frontend Architect)

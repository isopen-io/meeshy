# Checklist de Tests Manuels - Système de Statut Utilisateur Temps Réel

## Vue d'ensemble

Ce document contient la checklist complète des tests manuels à effectuer pour valider le système de statut utilisateur en temps réel.

**Durée estimée**: 45-60 minutes
**Testeurs requis**: 2 personnes minimum
**Environnements**: Development, Staging, Production

---

## Préparation des Tests

### Prérequis
- [ ] 2 comptes utilisateurs de test créés
- [ ] 2 navigateurs différents disponibles (Chrome, Firefox/Safari)
- [ ] Connexion réseau stable
- [ ] Accès aux logs backend (pour debugging)
- [ ] DevTools ouverts (Network, Console)

### Configuration
- [ ] Variables d'environnement vérifiées
- [ ] WebSocket activé sur le serveur
- [ ] Job de maintenance actif
- [ ] Base de données accessible

---

## Test 1: Connexion Temps Réel

**Objectif**: Vérifier que le statut "en ligne" apparaît immédiatement à la connexion

### Procédure
1. [ ] **User A**: Se connecte avec le compte test A
2. [ ] **User B**: Se connecte avec le compte test B dans un autre navigateur
3. [ ] **User B**: Navigue vers la page Contacts/Amis
4. [ ] **User B**: Vérifie l'indicateur de statut de User A

### Critères de Validation
- [ ] Indicateur vert visible pour User A
- [ ] Temps de détection: **< 100ms** après connexion de A
- [ ] Tooltip affiche "En ligne" au survol
- [ ] Aucune erreur dans la console
- [ ] WebSocket connecté (vérifier Network tab)

### Cas d'Erreur
- [ ] Si indicateur gris → Vérifier connexion WebSocket
- [ ] Si délai > 1s → Vérifier broadcast USER_STATUS
- [ ] Si tooltip incorrect → Vérifier traductions i18n

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Test 2: Déconnexion Immédiate

**Objectif**: Vérifier que le statut "hors ligne" apparaît immédiatement à la déconnexion

### Procédure
1. [ ] **User A et B**: Tous deux connectés
2. [ ] **User B**: Page Contacts ouverte, User A visible
3. [ ] **User A**: Se déconnecte (logout ou ferme navigateur)
4. [ ] **User B**: Observe le changement de statut de User A

### Critères de Validation
- [ ] Indicateur passe de vert à gris
- [ ] Temps de détection: **< 100ms**
- [ ] Tooltip affiche "Hors ligne - Il y a X secondes/minutes"
- [ ] Event `USER_STATUS` reçu (vérifier console avec debug)
- [ ] DB mise à jour: `isOnline = false`, `lastSeen` défini

### Test de Variantes
- [ ] Déconnexion propre (logout) → Immediate
- [ ] Fermeture onglet → Détecté par pingTimeout (10s)
- [ ] Crash navigateur → Détecté par maintenance job (5 min)

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Test 3: Activité REST et Mise à Jour du Statut

**Objectif**: Vérifier que les requêtes REST mettent à jour `lastActiveAt`

### Procédure
1. [ ] **User A**: Connecté via WebSocket
2. [ ] **Vérifier DB**: Noter la valeur actuelle de `lastActiveAt` pour User A
3. [ ] **User A**: Envoie un message dans une conversation (API REST)
4. [ ] **Attendre**: 2 secondes
5. [ ] **Vérifier DB**: Relire `lastActiveAt` pour User A

### Critères de Validation
- [ ] `lastActiveAt` a été mis à jour (timestamp plus récent)
- [ ] Mise à jour visible dans les 2 secondes
- [ ] User B recalcule statut localement si nécessaire
- [ ] Statut reste "en ligne" (< 5 min d'inactivité)

### Vérification Throttling
1. [ ] **User A**: Envoie 10 messages en 10 secondes
2. [ ] **Vérifier DB**: Compter le nombre de mises à jour de `lastActiveAt`
3. [ ] **Critère**: Maximum **1 mise à jour** (throttling actif)

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Test 4: Zombie Cleanup (Connexions Mortes)

**Objectif**: Vérifier que les connexions zombies sont nettoyées

### Scénario 1: Timeout Socket.IO (10 secondes)
1. [ ] **User A**: Connecté normalement
2. [ ] **Simuler**: Couper le réseau côté User A (DevTools → Offline)
3. [ ] **Attendre**: 15 secondes
4. [ ] **User B**: Vérifie le statut de User A

**Critères**:
- [ ] User A marqué offline après pingTimeout (10s)
- [ ] Event `disconnect` déclenché côté serveur
- [ ] DB mise à jour: `isOnline = false`

### Scénario 2: Maintenance Job (5 minutes)
1. [ ] **Créer zombie**: User A se connecte puis crash navigateur (kill process)
2. [ ] **Vérifier DB**: User A reste `isOnline = true` initialement
3. [ ] **Attendre**: 6-7 minutes
4. [ ] **Vérifier DB**: Maintenance job a détecté et nettoyé

**Critères**:
- [ ] Après 5 min: User A marqué `isOnline = false`
- [ ] `lastSeen` mis à jour
- [ ] User B reçoit broadcast `USER_STATUS` (offline)
- [ ] Logs montrent: "[CLEANUP] X utilisateurs marqués comme hors ligne"

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Test 5: Multi-Onglets (Même Utilisateur)

**Objectif**: Vérifier que l'utilisateur reste en ligne avec plusieurs onglets ouverts

### Procédure
1. [ ] **User A**: Ouvre 3 onglets dans le même navigateur
2. [ ] **User A**: Se connecte dans chaque onglet (même compte)
3. [ ] **User B**: Vérifie le statut de User A → Doit être **en ligne**
4. [ ] **User A**: Ferme onglet 1
5. [ ] **User B**: Vérifie → Toujours **en ligne**
6. [ ] **User A**: Ferme onglet 2
7. [ ] **User B**: Vérifie → Toujours **en ligne**
8. [ ] **User A**: Ferme onglet 3 (dernier)
9. [ ] **User B**: Vérifie → Maintenant **hors ligne**

### Critères de Validation
- [ ] Statut reste "en ligne" tant qu'au moins 1 onglet connecté
- [ ] Passage à "hors ligne" uniquement quand tous les onglets fermés
- [ ] Pas de "flickering" (changements rapides) de statut
- [ ] Backend compte correctement les connexions par user

### Vérification Backend
```sql
-- Vérifier nombre de connexions Socket.IO par user
SELECT userId, COUNT(*) as connections
FROM active_sockets
GROUP BY userId;
```

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Test 6: Throttling des Mises à Jour

**Objectif**: Vérifier que le throttling empêche les mises à jour DB excessives

### Procédure
1. [ ] **User A**: Connecté
2. [ ] **Vérifier DB**: Noter `lastActiveAt` initial (T0)
3. [ ] **User A**: Faire 20 requêtes REST en 30 secondes
   - Envoyer messages
   - Rafraîchir conversations
   - Charger contacts
4. [ ] **Vérifier DB**: Compter les mises à jour de `lastActiveAt`

### Critères de Validation
- [ ] **Maximum 1 mise à jour par minute** (throttle window = 60s)
- [ ] Si 20 requêtes en 30s → **1 seule update**
- [ ] Si attente 65s + nouvelle requête → **Nouvelle update OK**
- [ ] Statut UX reste "en ligne" (pas d'impact visible)

### Vérification Cache
- [ ] Middleware utilise cache en mémoire pour throttling
- [ ] Cache nettoyé après 5 minutes (vieux entries supprimés)
- [ ] Logs montrent "[THROTTLE] Skipping update for user X"

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Test 7: Statut "Away" (Inactif depuis 5 minutes)

**Objectif**: Vérifier l'affichage du statut "away" après inactivité

### Procédure
1. [ ] **User A**: Connecté et actif
2. [ ] **User A**: Ne fait AUCUNE action pendant 6 minutes
3. [ ] **User B**: Observe le statut de User A pendant cette période

### Critères de Validation
- [ ] Après 5 min: Statut passe de "en ligne" (vert) à "away" (orange/jaune)
- [ ] Tooltip affiche "Inactif depuis X minutes"
- [ ] `isOnline` reste `true` en DB
- [ ] `lastActiveAt` > 5 minutes
- [ ] Frontend calcule `isAway = (now - lastActiveAt) > 5 min && isOnline`

### Logique Frontend
```typescript
const isAway = user.isOnline &&
               ((Date.now() - user.lastActiveAt) > 5 * 60 * 1000);
```

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Test 8: Participants Anonymes

**Objectif**: Vérifier le statut pour les utilisateurs anonymes (via share link)

### Procédure
1. [ ] **User A**: Crée un lien de partage de conversation
2. [ ] **User B**: Ouvre le lien en navigation privée (non connecté)
3. [ ] **User B**: Entre nom anonyme et rejoint la conversation
4. [ ] **User A**: Vérifie le statut de User B (anonyme)

### Critères de Validation
- [ ] User B apparaît comme "en ligne" pour User A
- [ ] Indicateur vert visible
- [ ] Badge "Anonyme" ou icône spécifique affiché
- [ ] DB: `anonymousParticipant.isOnline = true`
- [ ] Déconnexion de User B → Statut update pour User A

### Cleanup Anonymes
1. [ ] **Créer participant anonyme** avec `lastActiveAt` vieux (25h)
2. [ ] **Attendre nettoyage journalier** (ou trigger manuel)
3. [ ] **Vérifier**: Participant supprimé de la DB

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Test 9: Reconnexion Automatique

**Objectif**: Vérifier que le client se reconnecte automatiquement après coupure réseau

### Procédure
1. [ ] **User A**: Connecté normalement
2. [ ] **DevTools**: Network → Simulate Offline pendant 5 secondes
3. [ ] **DevTools**: Network → Restore Online
4. [ ] **Observer**: Console et indicateurs WebSocket

### Critères de Validation
- [ ] WebSocket se reconnecte automatiquement
- [ ] Event `reconnect` déclenché
- [ ] Statut resynchronisé (mise à jour `lastActiveAt`)
- [ ] User B voit User A repasser "en ligne" rapidement
- [ ] Nombre de tentatives: Max 5 (configurable)
- [ ] Délai entre tentatives: 1s, 2s, 4s, 8s... (backoff exponentiel)

### Logs Attendus
```
[Socket.IO] Connection lost
[Socket.IO] Reconnecting... (attempt 1/5)
[Socket.IO] Reconnected successfully
[AUTH] User X re-authenticated
```

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Test 10: Performance - 10 Utilisateurs Simultanés

**Objectif**: Vérifier les performances avec plusieurs utilisateurs connectés

### Procédure
1. [ ] **Créer 10 comptes test** (user-test-1 à user-test-10)
2. [ ] **Connecter tous simultanément** (10 onglets/navigateurs)
3. [ ] **Mesurer**: Temps de connexion et broadcast
4. [ ] **User 11**: Observe la liste de statuts

### Critères de Validation
- [ ] Tous les utilisateurs apparaissent en ligne
- [ ] Temps total de connexion: **< 5 secondes** pour 10 users
- [ ] CPU serveur: **< 50%** de charge
- [ ] Mémoire: **Pas de fuite** (vérifier après 5 min)
- [ ] DB queries: **Optimisées** (utiliser EXPLAIN sur requêtes)

### Monitoring
```bash
# Backend
top -p $(pgrep -f gateway)

# Database
SHOW PROCESSLIST; -- MySQL
SELECT * FROM pg_stat_activity; -- PostgreSQL
```

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Test 11: Compatibilité Navigateurs

**Objectif**: Vérifier le fonctionnement sur différents navigateurs

### Navigateurs à Tester
- [ ] **Chrome** (dernière version)
  - [ ] Desktop
  - [ ] Mobile (DevTools simulation)
- [ ] **Firefox** (dernière version)
  - [ ] Desktop
  - [ ] Mobile
- [ ] **Safari** (Mac/iOS)
  - [ ] Desktop
  - [ ] iPhone
- [ ] **Edge** (Chromium)

### Tests par Navigateur
- [ ] Connexion WebSocket réussie
- [ ] Broadcast temps réel fonctionne
- [ ] Reconnexion automatique OK
- [ ] Indicateurs visuels corrects
- [ ] Pas d'erreurs console

**Résultats**:
- Chrome: ✅ / ❌
- Firefox: ✅ / ❌
- Safari: ✅ / ❌
- Edge: ✅ / ❌

---

## Test 12: Migration - Suppression du Polling

**Objectif**: Vérifier que l'ancien système de polling a été complètement supprimé

### Vérifications Code
- [ ] `useParticipantsStatusPolling` **non importé** nulle part
- [ ] Aucun `setInterval` pour polling de statut dans le frontend
- [ ] Fichiers legacy supprimés ou deprecated

### Commande de Vérification
```bash
# Rechercher imports de l'ancien hook
grep -r "useParticipantsStatusPolling" frontend/

# Doit retourner 0 résultats (ou seulement fichiers .test)
```

### Vérifications Runtime
- [ ] Network tab: **Aucune requête polling** répétitive (/api/status, etc.)
- [ ] Seules connexions: WebSocket (wss://) et requêtes REST ponctuelles
- [ ] Performance améliorée (moins de requêtes HTTP)

**Résultat**: ✅ PASS / ❌ FAIL
**Notes**: _______________________________________________

---

## Rapport de Test Final

### Résumé
- **Tests réussis**: __ / 12
- **Tests échoués**: __ / 12
- **Bugs critiques**: __ (liste ci-dessous)
- **Améliorations suggérées**: __ (liste ci-dessous)

### Bugs Identifiés
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Améliorations Suggérées
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Environnement de Test
- **Date**: _______________
- **Testeur**: _______________
- **Environnement**: Development / Staging / Production
- **Version Backend**: _______________
- **Version Frontend**: _______________

### Conclusion Globale
[ ] ✅ Système prêt pour production
[ ] ⚠️ Corrections mineures nécessaires
[ ] ❌ Corrections majeures requises

**Signature**: _______________
**Date**: _______________

---

## Annexe: Commandes Utiles

### Vérifier État du Système
```bash
# Backend - Logs temps réel
tail -f gateway/gateway.log | grep "STATUS\|CLEANUP\|MAINTENANCE"

# Database - Utilisateurs en ligne
SELECT COUNT(*) FROM User WHERE isOnline = true;

# Socket.IO - Stats
curl http://localhost:3000/api/socketio/stats
```

### Debugging WebSocket
```javascript
// Console frontend
window.socket.on('USER_STATUS', (data) => {
  console.log('Status update:', data);
});

// Vérifier état connexion
console.log('Connected:', window.socket.connected);
```

### Forcer Cleanup Manuel (Dev seulement)
```bash
# Trigger maintenance job
curl -X POST http://localhost:3000/api/maintenance/trigger-cleanup \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

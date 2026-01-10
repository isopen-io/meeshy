# Index Documentation - Système de Statut en Temps Réel

## Version 1.0 | Date: 2025-11-03

---

## Vue d'Ensemble

Cette suite de documents décrit l'architecture complète du système de statut utilisateur en temps réel pour la plateforme Meeshy. Le système utilise une architecture **push-only (SANS POLLING)** basée sur Socket.IO pour les mises à jour temps réel.

### Principe de Design

```
🚀 Push-Only Architecture
📡 WebSocket (Socket.IO) pour événements temps réel
🔄 REST API avec throttling pour activité silencieuse
🎨 Calcul local frontend basé sur lastActiveAt
⚡ Temps réel garanti < 100ms
🛡️ Résilience via job maintenance (fallback zombie cleanup)
```

---

## Documents Disponibles

### 1. ARCHITECTURE_REALTIME_STATUS.md

**Fichier**: `/docs/ARCHITECTURE_REALTIME_STATUS.md`

**Type**: Documentation Complète (Architecture Détaillée)

**Contenu**:
- Vue d'ensemble système
- Architecture composants (diagrammes C4-like)
- Flux de données détaillés
- Modèle de données (Prisma schema)
- Événements Socket.IO (SERVER_EVENTS.USER_STATUS)
- APIs REST (Auth middleware avec throttling)
- Services backend (MaintenanceService, MeeshySocketIOManager)
- Calcul statut frontend (Zustand store)
- Garanties de cohérence (temps réel, quasi-temps réel, minute-niveau)
- Résilience et fallbacks
- Monitoring et métriques (Prometheus, Grafana)
- Guide de troubleshooting

**Public**: Architectes, Lead Developers, DevOps

**Durée lecture**: 30-45 minutes

**Quand l'utiliser**:
- Design review
- Onboarding nouveaux développeurs seniors
- Décisions architecturales
- Audit de sécurité/performance

---

### 2. ARCHITECTURE_REALTIME_STATUS_DIAGRAMS.md

**Fichier**: `/docs/ARCHITECTURE_REALTIME_STATUS_DIAGRAMS.md`

**Type**: Diagrammes de Séquence (Mermaid)

**Contenu**:
- 1. Connexion utilisateur authentifié (JWT)
- 2. Connexion utilisateur anonyme (Session Token)
- 3. Activité REST API avec throttling
- 4. Déconnexion normale
- 5. Déconnexion brutale (crash navigateur)
- 6. Job maintenance - nettoyage zombies
- 7. Envoi message WebSocket
- 8. Calcul statut local frontend
- 9. Reconnexion après perte réseau
- 10. Utilisateur multi-onglets

**Public**: Développeurs (tous niveaux), QA, Product Managers

**Durée lecture**: 20-30 minutes

**Quand l'utiliser**:
- Comprendre flux spécifique
- Débugger issue
- Visualiser interactions composants
- Rédiger tests E2E

---

### 3. REALTIME_STATUS_QUICK_REFERENCE.md

**Fichier**: `/docs/REALTIME_STATUS_QUICK_REFERENCE.md`

**Type**: Guide de Référence Rapide (Cheat Sheet)

**Contenu**:
- Vue d'ensemble 30 secondes
- Champs base de données (résumé)
- Événements Socket.IO (payloads)
- APIs clés (backend + frontend)
- Configuration critique
- Logique calcul statut (seuils)
- Flux principaux (simplifié)
- Debug checklist
- Commandes utiles (curl, mongo)
- Métriques performance attendues
- Snippets code
- Checklist pré-déploiement
- FAQ

**Public**: Développeurs (implémentation quotidienne), DevOps

**Durée lecture**: 5-10 minutes

**Quand l'utiliser**:
- Implémentation feature
- Debugging rapide
- Code review
- Déploiement production
- Référence quotidienne

---

## Parcours de Lecture Recommandés

### Pour un Nouveau Développeur

1. **Jour 1**: Lire `REALTIME_STATUS_QUICK_REFERENCE.md` (10 min)
   - Comprendre principe général
   - Mémoriser événements clés

2. **Jour 2-3**: Lire `ARCHITECTURE_REALTIME_STATUS_DIAGRAMS.md` (30 min)
   - Visualiser flux connexion/déconnexion
   - Comprendre throttling REST API

3. **Semaine 1**: Lire `ARCHITECTURE_REALTIME_STATUS.md` (sections pertinentes)
   - Section "Services Backend" si travail backend
   - Section "Calcul Statut Frontend" si travail frontend

4. **En continu**: Référencer `REALTIME_STATUS_QUICK_REFERENCE.md` pour snippets

### Pour un Bug Fix

1. Identifier symptôme dans `REALTIME_STATUS_QUICK_REFERENCE.md` → "Debug Checklist"
2. Visualiser flux concerné dans `ARCHITECTURE_REALTIME_STATUS_DIAGRAMS.md`
3. Approfondir dans `ARCHITECTURE_REALTIME_STATUS.md` → "Guide de Troubleshooting"
4. Appliquer fix
5. Vérifier métriques monitoring

### Pour un Code Review

1. Vérifier conformité avec `REALTIME_STATUS_QUICK_REFERENCE.md` → "Snippets Code"
2. Comparer flux implémenté vs `ARCHITECTURE_REALTIME_STATUS_DIAGRAMS.md`
3. Valider garanties dans `ARCHITECTURE_REALTIME_STATUS.md` → "Garanties de Cohérence"

### Pour un Déploiement Production

1. Compléter `REALTIME_STATUS_QUICK_REFERENCE.md` → "Checklist Pré-Déploiement"
2. Configurer alertes selon `ARCHITECTURE_REALTIME_STATUS.md` → "Monitoring et Métriques"
3. Préparer runbook basé sur `ARCHITECTURE_REALTIME_STATUS.md` → "Guide de Troubleshooting"

---

## Fichiers Source Clés

### Backend (Gateway)

| Fichier | Description | Lignes | Complexité |
|---------|-------------|--------|------------|
| `/gateway/src/services/maintenance.service.ts` | Job maintenance, cleanup zombies, updateUserOnlineStatus | 387 | Moyenne |
| `/gateway/src/socketio/MeeshySocketIOManager.ts` | Gestion Socket.IO, broadcast USER_STATUS, auth | 2000+ | Élevée |
| `/gateway/src/middleware/auth.ts` | Auth unifié JWT/Session, throttling lastActiveAt | 476 | Moyenne |

### Frontend

| Fichier | Description | Lignes | Complexité |
|---------|-------------|--------|------------|
| `/apps/web/services/usersService.ts` | Zustand store, calcul statut, listeners Socket.IO | ~300 | Moyenne |
| `/apps/web/components/users/OnlineIndicator.tsx` | Indicateur visuel statut utilisateur | ~50 | Faible |
| `/apps/web/hooks/useRealtimeStatus.ts` | Hook React pour statut temps réel | ~40 | Faible |

### Shared Types

| Fichier | Description | Lignes | Complexité |
|---------|-------------|--------|------------|
| `/shared/types/socketio-events.ts` | Types Socket.IO (SERVER_EVENTS, CLIENT_EVENTS) | 589 | Moyenne |
| `/shared/schema.prisma` | Modèle de données (User, AnonymousParticipant) | 779 | Élevée |

---

## Concepts Clés

### 1. Champs de Statut (Triple State)

```
isOnline: Boolean      → Flag WebSocket (true si socket connectée)
lastSeen: DateTime     → Horodatage dernière DÉCONNEXION
lastActiveAt: DateTime → Horodatage dernière ACTIVITÉ (REST ou WS)
```

**Principe**: 3 champs complémentaires pour garantir précision temps réel + fallback.

### 2. Événement USER_STATUS (Push-Only)

```typescript
SERVER_EVENTS.USER_STATUS: {
  userId: string;
  username: string;
  isOnline: boolean;
}
```

**Principe**: Broadcast ciblé (seulement conversations utilisateur) pour scalabilité.

### 3. Throttling REST API (1x/min)

```
Requête REST authentifiée
  ↓
Auth Middleware: Check throttleCache
  ├─ Si last update < 60s → SKIP
  └─ Sinon → UPDATE lastActiveAt
```

**Principe**: Protéger DB tout en maintenant précision suffisante (seuil statut = 5min).

### 4. Job Maintenance (Zombie Cleanup)

```
Toutes les 60s:
  SELECT * FROM User WHERE isOnline=true AND lastActiveAt < (NOW() - 5min)
  UPDATE → isOnline=false
  Broadcast USER_STATUS
```

**Principe**: Sécurité fallback si Socket.IO timeout échoue.

### 5. Calcul Local Frontend

```typescript
getUserStatus(user): 'online' | 'away' | 'offline' {
  const diffMinutes = (now - user.lastActiveAt) / 60000;
  if (diffMinutes < 5) return 'online';   // 🟢
  if (diffMinutes < 30) return 'away';    // 🟠
  return 'offline';                        // ⚪
}
```

**Principe**: 0 requête réseau, réactif, précision ±60s (acceptable).

---

## Garanties Système

| Métrique | Garantie | Mesure |
|----------|----------|--------|
| **Latence broadcast** | < 100ms (p95) | Temps event → UI update |
| **Détection zombie** | < 70s | Crash navigateur → statut offline |
| **Précision lastActiveAt** | ±60s | Throttling REST API |
| **Charge DB** | < 1 update/min/user | Throttling protection |
| **Scalabilité** | 10,000 users actifs | Broadcast ciblé |
| **Disponibilité** | 99.9% | Fallbacks multiples |

---

## Tests Recommandés

### Tests Unitaires

```bash
# Backend
npm test -- maintenance.service.test.ts
npm test -- auth.middleware.test.ts

# Frontend
npm test -- usersService.test.ts
npm test -- OnlineIndicator.test.tsx
```

### Tests d'Intégration

```bash
# Backend: Connexion/Déconnexion
npm test -- socket-connection.integration.test.ts

# Frontend: Réception USER_STATUS
npm test -- realtime-status.integration.test.tsx
```

### Tests E2E

```bash
# Scénario 1: Connexion utilisateur
cypress run --spec "cypress/e2e/user-connection.cy.ts"

# Scénario 2: Déconnexion brutale
cypress run --spec "cypress/e2e/user-crash.cy.ts"

# Scénario 3: Multi-onglets
cypress run --spec "cypress/e2e/multi-tab.cy.ts"
```

### Tests de Charge

```bash
# Artillery.io
artillery run load-tests/realtime-status.yml

# k6
k6 run load-tests/socket-connections.js

# Cibles:
# - 1000 connexions simultanées
# - 100 broadcasts/s
# - Latence p95 < 100ms
```

---

## Monitoring Production

### Métriques Prometheus

```promql
# Zombies nettoyés/min
rate(meeshy_zombies_cleaned_total[1m])

# Broadcasts USER_STATUS/s
rate(meeshy_user_status_broadcasts_total[1s])

# Latence broadcast (p95)
histogram_quantile(0.95, meeshy_broadcast_latency_seconds_bucket)

# Utilisateurs en ligne (gauge)
meeshy_users_online_total

# Throttling efficiency
meeshy_throttled_requests_total / meeshy_auth_requests_total * 100
```

### Alertes Critiques

```yaml
# Alert 1: Trop de zombies
- alert: HighZombieRate
  expr: rate(meeshy_zombies_cleaned_total[5m]) > 10
  severity: warning

# Alert 2: Broadcast lent
- alert: SlowBroadcast
  expr: histogram_quantile(0.95, meeshy_broadcast_latency_seconds_bucket) > 0.5
  severity: warning

# Alert 3: Job maintenance down
- alert: MaintenanceJobDown
  expr: time() - meeshy_last_cleanup_timestamp > 120
  severity: critical
```

### Dashboards Grafana

**Panel 1: Statut Temps Réel**
- Gauge: Utilisateurs en ligne
- Time series: Connexions/Déconnexions par minute
- Heatmap: Latence broadcasts (p50, p95, p99)

**Panel 2: Performance**
- Time series: Broadcasts/s
- Time series: DB updates/s (throttling)
- Stat: Throttling efficiency (%)

**Panel 3: Zombies & Maintenance**
- Time series: Zombies nettoyés/min
- Stat: Dernier cleanup (timestamp)
- Log panel: Logs CLEANUP

---

## Évolutions Futures Possibles

### Phase 2: Améliorations

1. **Précision accrue**: Réduire throttling à 30s (trade-off charge DB)
2. **Multi-onglets avancé**: Permettre N sockets/utilisateur
3. **Statut personnalisé**: "Occupé", "Ne pas déranger", "Invisible"
4. **Géolocalisation**: "En ligne depuis Paris" (IP → ville)

### Phase 3: Features Avancées

1. **Prédiction activité**: ML pour prédire retour utilisateur
2. **Notifications intelligentes**: Notifier quand contact revient en ligne
3. **Analyse temporelle**: Graphiques activité utilisateur
4. **Privacy controls**: Masquer statut pour certains utilisateurs

---

## Contact & Support

**Questions Architecture**: Consulter `ARCHITECTURE_REALTIME_STATUS.md`

**Questions Implémentation**: Consulter `REALTIME_STATUS_QUICK_REFERENCE.md`

**Bugs/Issues**: Suivre `ARCHITECTURE_REALTIME_STATUS.md` → "Guide de Troubleshooting"

**Améliorations**: Proposer ADR (Architecture Decision Record)

---

## Changelog

### Version 1.0 (2025-11-03)

- ✅ Documentation complète architecture
- ✅ Diagrammes de séquence Mermaid (10 scénarios)
- ✅ Quick Reference guide
- ✅ Index et parcours lecture

### Version 1.1 (Futur)

- [ ] Tests E2E Cypress
- [ ] Dashboards Grafana templates
- [ ] Runbook incidents production
- [ ] Video walkthrough (screencast)

---

**Rédigé Par**: Claude (Anthropic)
**Date**: 2025-11-03
**Statut**: ✅ Documentation Complète
**Versions**:
- Architecture: 1.0
- Diagrammes: 1.0
- Quick Reference: 1.0
- Index: 1.0

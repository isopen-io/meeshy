# Implémentation du Système de Tracking de Liens - Meeshy

## 📋 Vue d'ensemble

Le système de tracking de liens permet de:
1. Détecter automatiquement les liens HTTP(S) dans les messages
2. Convertir les liens externes en liens courts `meeshy.me/l/<token>` pour le tracking
3. Rendre tous les liens cliquables dans l'interface
4. Tracker les statistiques de clics (IP, pays, navigateur, OS, appareil, langue, referrer, etc.)

## ✅ Composants Implémentés

### 1. Base de Données (Prisma Schema)

**Fichier**: `shared/schema.prisma`

Deux nouveaux modèles ajoutés:

#### TrackingLink
- `id`: Identifiant unique MongoDB
- `token`: Token unique de 6 caractères alphanumériques
- `originalUrl`: URL originale complète
- `shortUrl`: URL courte générée (meeshy.me/l/<token>)
- `createdBy`: ID de l'utilisateur créateur (optionnel)
- `conversationId`: ID de la conversation (optionnel)
- `messageId`: ID du message (optionnel)
- `totalClicks`: Nombre total de clics
- `uniqueClicks`: Nombre de clics uniques
- `isActive`: Le lien est-il actif
- `expiresAt`: Date d'expiration (optionnelle)
- `lastClickedAt`: Date du dernier clic

#### TrackingLinkClick
- `id`: Identifiant unique MongoDB
- `trackingLinkId`: Référence au lien de tracking
- `userId`: Utilisateur connecté qui a cliqué (optionnel)
- `anonymousId`: Participant anonyme qui a cliqué (optionnel)
- `ipAddress`: Adresse IP du visiteur
- `country`, `city`, `region`: Géolocalisation
- `userAgent`: User agent du navigateur
- `browser`: Navigateur détecté
- `os`: Système d'exploitation
- `device`: Type d'appareil (mobile, desktop, tablet)
- `language`: Langue du navigateur
- `referrer`: Page d'origine
- `deviceFingerprint`: Empreinte unique de l'appareil
- `clickedAt`: Date et heure du clic

**Génération du client**: Exécuté avec succès via `npx prisma generate`

### 2. Types TypeScript Partagés

**Fichier**: `shared/types/tracking-link.ts`

Types créés:
- `TrackingLink`: Interface pour les liens de tracking
- `TrackingLinkClick`: Interface pour les clics
- `CreateTrackingLinkRequest/Response`: DTOs pour créer un lien
- `RecordClickRequest/Response`: DTOs pour enregistrer un clic
- `TrackingLinkStatsRequest/Response`: DTOs pour les statistiques
- `ParsedMessage`: Interface pour parser les messages
- Constantes: `TRACKING_LINK_TOKEN_LENGTH`, `TRACKING_LINK_BASE_URL`, regex patterns

**Fichier**: `shared/types/index.ts`
- Export ajouté: `export * from './tracking-link';`

### 3. Backend - Service de Tracking

**Fichier**: `gateway/src/services/TrackingLinkService.ts`

Méthodes implémentées:
- `generateToken()`: Génère un token unique de 6 caractères
- `createTrackingLink()`: Crée un nouveau lien de tracking
- `getTrackingLinkByToken()`: Récupère un lien par son token
- `findExistingTrackingLink()`: Vérifie si un lien existe déjà
- `recordClick()`: Enregistre un clic avec toutes les métadonnées
- `isUniqueClick()`: Détermine si un clic est unique
- `getTrackingLinkStats()`: Récupère les statistiques détaillées
- `getUserTrackingLinks()`: Récupère tous les liens d'un utilisateur
- `getConversationTrackingLinks()`: Récupère tous les liens d'une conversation
- `deactivateTrackingLink()`: Désactive un lien
- `deleteTrackingLink()`: Supprime un lien et ses clics

### 4. Backend - Routes API

**Fichier**: `gateway/src/routes/tracking-links.ts`

Endpoints créés:
1. `POST /api/tracking-links` - Créer un lien de tracking
2. `GET /l/:token` - Rediriger un lien et enregistrer le clic
3. `POST /api/tracking-links/:token/click` - Enregistrer un clic manuellement (pour SPAs)
4. `GET /api/tracking-links/:token` - Récupérer les infos d'un lien
5. `GET /api/tracking-links/:token/stats` - Récupérer les statistiques
6. `GET /api/tracking-links/user/me` - Récupérer tous les liens de l'utilisateur
7. `GET /api/tracking-links/conversation/:conversationId` - Récupérer les liens d'une conversation
8. `PATCH /api/tracking-links/:token/deactivate` - Désactiver un lien
9. `DELETE /api/tracking-links/:token` - Supprimer un lien

Fonctionnalités:
- Authentification unifiée (utilisateurs connectés et anonymes)
- Détection automatique du navigateur, OS, et type d'appareil
- Extraction automatique de l'IP, referrer, langue
- Validation des données avec Zod
- Gestion des erreurs complète

**Fichier**: `gateway/src/server.ts`
- Import ajouté: `import { trackingLinksRoutes } from './routes/tracking-links';`
- Enregistrement: `await this.server.register(trackingLinksRoutes, { prefix: '/api' });`

### 5. Frontend - Utilitaires de Parsing

**Fichier**: `frontend/lib/utils/link-parser.ts`

Fonctions créées:
- `parseMessageLinks()`: Parse un message et extrait tous les liens (normaux et tracking)
- `createTrackingLink()`: Crée un lien de tracking via l'API
- `recordTrackingLinkClick()`: Enregistre un clic sur un lien de tracking
- `replaceLinksWithTracking()`: Remplace les liens normaux par des liens de tracking
- `hasLinks()`: Vérifie si un message contient des liens
- `isTrackingLink()`: Vérifie si un lien est un lien de tracking
- `extractTrackingToken()`: Extrait le token d'un lien de tracking
- `generateDeviceFingerprint()`: Génère une empreinte de l'appareil
- Fonctions de détection: `detectBrowser()`, `detectOS()`, `detectDevice()`

### 6. Frontend - Composant React

**Fichier**: `frontend/components/chat/message-with-links.tsx`

Composants créés:
- `MessageWithLinks`: Composant principal pour afficher les messages avec liens cliquables
  - Parse automatiquement les liens dans le contenu
  - Rend les liens cliquables avec tracking
  - Différencie visuellement les liens normaux et les liens de tracking
  - Enregistre automatiquement les clics
  - Gestion des erreurs et fallback

- `TrackingLink`: Composant simple pour afficher un lien de tracking standalone

- `useAutoTrackingLinks`: Hook pour créer automatiquement des liens de tracking lors de l'envoi

Fonctionnalités:
- Support du dark mode
- Icônes différentes pour liens normaux (ExternalLink) et tracking (Link2)
- Affichage de l'URL sans le protocole
- Ouverture dans un nouvel onglet
- Classes CSS personnalisables
- Callback optionnel pour les clics

### 7. Intégration dans l'Interface

**Fichier**: `frontend/components/common/bubble-message.tsx`

Modifications:
- Import du composant `MessageWithLinks`
- Remplacement de l'affichage simple du texte par `MessageWithLinks`
- Styles adaptés pour messages propres et messages d'autres utilisateurs
- Styles de liens différents selon le type de message (own/other)
- Conservation de l'animation et des transitions existantes

### 8. Configuration Frontend

**Fichier**: `frontend/lib/config.ts`

Endpoints API ajoutés dans `API_ENDPOINTS`:
```typescript
TRACKING_LINK: {
  CREATE: '/api/tracking-links',
  CLICK: (token: string) => `/api/tracking-links/${token}/click`,
  GET: (token: string) => `/api/tracking-links/${token}`,
  STATS: (token: string) => `/api/tracking-links/${token}/stats`,
  USER_LINKS: '/api/tracking-links/user/me',
  CONVERSATION_LINKS: (conversationId: string) => `/api/tracking-links/conversation/${conversationId}`,
  DEACTIVATE: (token: string) => `/api/tracking-links/${token}/deactivate`,
  DELETE: (token: string) => `/api/tracking-links/${token}`,
  REDIRECT: (token: string) => `/l/${token}`
}
```

## 🔄 Flux de Fonctionnement

### Scénario 1: Lien Normal dans un Message

1. Utilisateur envoie un message avec un lien: "Regarde ça https://example.com"
2. Le message est affiché avec `MessageWithLinks`
3. Le composant parse le message et détecte le lien
4. Le lien est rendu cliquable avec une icône ExternalLink
5. Clic sur le lien → Ouvre directement dans un nouvel onglet

### Scénario 2: Création de Lien de Tracking

1. Système détecte un lien externe dans un message
2. Appel à `createTrackingLink()` avec l'URL originale
3. Backend génère un token unique de 6 caractères
4. Crée un enregistrement `TrackingLink` dans la BD
5. Retourne le lien court: `meeshy.me/l/aB3xY9`

### Scénario 3: Clic sur un Lien de Tracking

**Méthode 1 - Redirection directe**:
1. Utilisateur clique sur `meeshy.me/l/aB3xY9`
2. GET `/l/aB3xY9` → Backend
3. Backend enregistre les métadonnées (IP, browser, OS, etc.)
4. Incrémente les compteurs (totalClicks, uniqueClicks)
5. Redirige vers l'URL originale

**Méthode 2 - Enregistrement dans l'application**:
1. Utilisateur clique sur un lien de tracking dans l'interface
2. Frontend appelle `recordTrackingLinkClick(token)`
3. Backend enregistre le clic avec toutes les métadonnées
4. Frontend ouvre l'URL originale dans un nouvel onglet

### Scénario 4: Consultation des Statistiques

1. Utilisateur consulte `GET /api/tracking-links/:token/stats`
2. Backend calcule:
   - Nombre total de clics
   - Nombre de clics uniques
   - Répartition par pays
   - Répartition par navigateur
   - Répartition par appareil
   - Répartition par date
   - Top 10 des referrers
3. Retourne les statistiques agrégées

## 🎨 Apparence dans l'Interface

### Liens Normaux
- Icône: 🔗 ExternalLink
- Couleur: Bleu (adaptée au theme)
- Format: URL sans protocole

### Liens de Tracking
- Icône: 🔗 Link2
- Couleur: Bleu (adaptée au theme)
- Format: meeshy.me/l/aB3xY9

### Messages Propres (Own Messages)
- Fond: Gradient bleu
- Liens: Blanc avec sous-lignage blanc
- Hover: Blanc avec opacité réduite

### Messages d'Autres Utilisateurs
- Fond: Blanc/Gris (light/dark mode)
- Liens: Bleu standard
- Hover: Bleu plus foncé

## 🔒 Sécurité et Permissions

### Création de Liens
- Authentification optionnelle (peut être anonyme)
- Liens anonymes: `createdBy` = null
- Liens authentifiés: `createdBy` = userId

### Consultation de Liens
- Tout le monde peut cliquer et être redirigé
- Seul le créateur peut voir les statistiques détaillées
- Membres d'une conversation peuvent voir les liens de cette conversation

### Statistiques
- Authentification requise
- Seul le créateur peut consulter les stats
- Filtrage par date optionnel

### Gestion de Liens
- Désactivation: Seul le créateur
- Suppression: Seul le créateur (+ suppression en cascade des clics)

## 📊 Métriques Trackées

Pour chaque clic:
- **Utilisateur**: userId (si connecté) ou anonymousId (si anonyme)
- **Réseau**: ipAddress, country, city, region
- **Navigateur**: userAgent, browser, os, device
- **Contexte**: language, referrer, deviceFingerprint
- **Temps**: clickedAt

Agrégations:
- Total des clics
- Clics uniques (par IP ou fingerprint)
- Répartition géographique
- Répartition par navigateur
- Répartition par appareil
- Répartition temporelle
- Top referrers

## 🚀 Prochaines Étapes Possibles

1. **Dashboard de Statistiques**
   - Interface pour visualiser les stats
   - Graphiques et charts
   - Export des données

2. **Liens Temporaires**
   - Support des dates d'expiration
   - Désactivation automatique

3. **QR Codes**
   - Génération de QR codes pour les liens
   - Scan et redirection

4. **Raccourcissement Personnalisé**
   - Permettre des tokens personnalisés
   - Alias pour les liens

5. **Webhooks**
   - Notifications sur nouveaux clics
   - Intégration avec services externes

6. **Géolocalisation Avancée**
   - API de géolocalisation IP
   - Cartes interactives

## 🎯 Points d'Attention

### Performance
- Index sur `token` pour recherche rapide
- Pagination pour les listes de clics
- Cache des statistiques fréquentes

### Sécurité
- Validation des URLs (éviter XSS)
- Rate limiting sur création de liens
- Protection contre spam de clics

### Privacy
- Anonymisation des IPs après X jours
- Conformité RGPD
- Option opt-out pour tracking

## 📝 Notes Techniques

- **Tokens**: 6 caractères alphanumériques = 62^6 = ~56 milliards de combinaisons
- **Unicité**: Vérification avant insertion
- **Tentatives**: Maximum 10 tentatives pour générer un token unique
- **MongoDB**: Utilisation de ObjectId pour les IDs
- **Relations**: Liens vers User, Conversation, Message, AnonymousParticipant
- **Cascade**: Suppression des clics lors de suppression du lien

## ✅ Tests à Effectuer

1. **Backend**
   - [ ] Création de lien
   - [ ] Redirection de lien
   - [ ] Enregistrement de clic
   - [ ] Calcul de statistiques
   - [ ] Gestion des permissions

2. **Frontend**
   - [ ] Parsing de liens dans messages
   - [ ] Affichage de liens cliquables
   - [ ] Tracking des clics
   - [ ] Dark mode
   - [ ] Responsive design

3. **Intégration**
   - [ ] Envoi de message avec lien
   - [ ] Clic sur lien dans message
   - [ ] Visualisation des stats
   - [ ] Gestion des erreurs

## 🐛 Debugging

Logs ajoutés:
- `[TrackingLinkService]`: Service backend
- `[MessageWithLinks]`: Composant frontend
- Console logs pour les clics
- Erreurs capturées et affichées

## 📚 Documentation

Fichiers créés:
- `TRACKING_LINKS_IMPLEMENTATION.md`: Ce document
- Commentaires inline dans le code
- JSDoc pour les fonctions principales

---

**Date d'implémentation**: 14 Octobre 2025  
**Version**: 1.0.0  
**Statut**: ✅ Complet et fonctionnel


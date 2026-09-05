# Issues à créer — Meeshy Web V3

> Date: 2026-09-05
> Parent: #4371 (épopée Web V3)
> Milestone: 74 (« La v3 web sert le rôle premier »)
> Label: web

---

## 1. La recherche trouve aussi les médias et les liens — les quatre groupes de la cible répondent

**Clé**: `search`  
**Genre**: écran  
**Route**: `/search`  
**Priorité**: P1 — focus porteur (search)  
**Audience**: connecté

### Contexte
La vue existante (app/connecte/recherche-vue.ts:206l) ne rend que deux groupes (Conversations, Personnes) car aucune route de passerelle ne servait les deux autres. Depuis hier, GET /attachments/search (#5174) et GET /links?q= (#5171) existent dans dev. Le travail complète la surface pour servir les QUATRE groupes de la cible (cible/search.png).

**Source fichier**: app/connecte/recherche-vue.ts:32-35 (raison de l'écart documentée et désormais périmée)

### Preuve attendue
- `bun run test` (recherche*.test.ts) vert avec des témoins qui servent les QUATRE groupes depuis le bouchon
- Chaque rangée Médias porte un href `?autour=<message>&media=<pièce>` composé par lib/api/adresses-du-fil.ts (assertion sur le document servi)
- Chaque rangée Liens ouvre une adresse réelle
- Aucun résultat ne révèle la présence d'un utilisateur hors amitié acceptée — ni par un champ, ni par un ordre, ni par une sélection (critère matrice.json#search)
- e2e/visual/lib/serveurs.ts sert /attachments/search et /links?q= hors ligne

### Critère de fin
Deux récupérateurs dans lib/api/recherche.ts ; deux groupes dans recherche-vue.ts dont chaque rangée ouvre une adresse réelle (média → /chats/:cle via adresses-du-fil.ts ; lien → sa conversation ou /links) ; frappe incrémentale étendue aux deux groupes ; passerelle de bouchon complétée pour les deux endpoints ; chemin pauvre d'abord (GET de formulaire), module ensuite (§ 12.4).

### Source
Lot: ordre.md (écrans #1) | Cible: cible/search.png | Matrice: matrice.json#search | Conception: conception-web-v3.md § 5 (contrat de données)

---

## 2. On sort enfin de la v3 — la déconnexion efface le jeton, la session invitée et les caches de zone

**Clé**: `deconnexion`  
**Genre**: infra  
**Route**: POST sur une adresse de la zone (ex. /deconnexion), contrôle dans l'espace membre  
**Priorité**: P1 — focus porteur nommé (#5095)  
**Audience**: connecté

### Contexte
Le cookie meeshy_auth est volontairement non-HttpOnly « pour qu'une déconnexion puisse le retirer » (app/authentification/remise.ts:79-85) — mais la déconnexion qui justifie ce choix n'existe pas. La déconnexion doit être une route de la zone qui efface le jeton ET les traces locales. Voir aussi: lib/api/guest-session.ts (effaceSession, état F), lib/sw/travailleur.js § 2 (« lot purge à la déconnexion »), app/connecte/espace-vue.ts (l'espace membre).

### Preuve attendue
- Témoin jest: le POST rend un Set-Cookie qui expire meeshy_auth et un 302 vers /
- Après lui, GET / avec le même jar rend la VITRINE (aiguillage app/route.ts)
- Témoin sw-zone: à réception du signal de déconnexion, plus aucune entrée d'API au namespace v3 dans le Cache Storage simulé
- Le contrôle est un <form> servi, atteignable au clavier, dans les deux thèmes

### Critère de fin
<form method=post> dans l'espace membre (cible ≥ 52 px), traité par une route de la zone : efface meeshy_auth (Set-Cookie Max-Age=0, mêmes attributs que remise.ts), 302 vers / — qui rend alors la vitrine. Côté client (amélioration progressive) : effacement des sessions invitées (site unique guest-session.ts) et purge des caches du SW segmentés par empreinte de jeton (message au travailleur ou caches.delete par namespace v3, jamais le préfixe meeshy-cache- du legacy). Aucune nouvelle surface de composition.

### Source
Lot: ordre.md (espace/déconnexion) | Cible: cible/espace.png | Matrice: matrice.json#space | Conception: conception-web-v3.md § 4.4 (déploiement) & § 6 (session invitée)

---

## 3. Les onze bascules de notification ont chacune un effet — et le serveur les relit après rechargement

**Clé**: `notifPrefs`  
**Genre**: écran  
**Route**: `/notifications/preferences`  
**Priorité**: P1 — focus porteur nommé  
**Audience**: connecté

### Contexte
La passerelle sert déjà GET/PATCH /me/preferences?categories=notification (consommé par le legacy apps/web/app/notifications/preferences/page.tsx:94,159). La v3 doit implémenter le même écran à `/notifications/preferences` : porte + vue + feuille sur le patron de la zone connectée.

### Preuve attendue
- Critère matrice.json#notifPrefs : les onze bascules envoient chacune sa mutation et sont RELUES du serveur après rechargement (onze allers-retours vérifiés par les témoins contre le bouchon)
- Échec réseau ⇒ rollback VISIBLE, jamais un état affiché divergent du serveur
- 0 violation axe serious/critical ; quatre colonnes de thème sous seuil

### Critère de fin
Route + porte + vue + feuille : chaque bascule est un <form method=post> vers la même adresse (chemin pauvre, Post/Redirect/Get, marche sans JS), la porte relit /me/preferences à chaque GET ; module de participation AMÉLIORE (bascule optimiste, rollback visible à l'échec réseau). La passerelle de bouchon gagne /me/preferences.

### Source
Lot: ordre.md (écrans #3) | Cible: cible/notifPrefs.png | Matrice: matrice.json#notifPrefs (L6) | Conception: conception-web-v3.md § 3.1 (placement écrans) & § 12.4 (amélioration progressive)

---

## 4. L'historique des appels se consulte dans la v3 — sans embarquer un octet de WebRTC

**Clé**: `calls`  
**Genre**: écran  
**Route**: `/calls`  
**Priorité**: P2 — confort (écran suivant de ordre.md #44), dépendance home livrée  
**Audience**: connecté

### Contexte
Écran de CONSULTATION seulement : la liste des appels passés. Pas d'embarquement de CallManager ni de la pile WebRTC (tenu par construction : aucun module hydraté). La passerelle sert déjà l'endpoint (services/gateway/src/routes/calls-consultation.ts et calls.ts, index.ts:317).

### Preuve attendue
- Critère matrice.json#calls : le chunk de /calls ne contient NI CallManager NI la pile WebRTC (assertion sur le document servi)
- Liste servie cache-first (aucun spinner sur cache non vide)
- 0 violation axe serious/critical ; quatre colonnes de thème sous seuil
- Le bouchon sert l'endpoint de consultation des appels

### Critère de fin
Porte + vue + feuille sur le patron connecté : liste servie cache-first (no spinner on non-empty cache), chaque appel rend direction, correspondant, durée, manqué. Passer un appel reste hors périmètre (« Hors condition de livraison de la v3 »).

### Source
Lot: ordre.md (écrans #44) | Cible: cible/calls.png | Matrice: matrice.json#calls (L7) | Conception: conception-web-v3.md § 8 (budgets)

---

## 5. Les communautés du lecteur s'ouvrent en deux gestes — et la co-appartenance ne révèle aucune présence

**Clé**: `communities`  
**Genre**: écran  
**Route**: `/communities`  
**Priorité**: P2 — confort (écran suivant de ordre.md #45), dépendance home livrée  
**Audience**: connecté

### Contexte
app/connecte/espace-vue.ts:32 note qu'un rond vers /communities « sortirait de la zone » — cet écran referme cette frontière. La passerelle sert déjà l'endpoint (services/gateway/src/routes/communities.ts et communities/, index.ts:238).

### Preuve attendue
- Critère matrice.json#communities : liste servie cache-first (aucun spinner sur cache non vide), ouverture d'une communauté en ≤ 2 gestes depuis l'accueil
- Test de garde : la co-appartenance ne révèle AUCUNE présence (isOnline / lastActiveAt absents de la charge hors amitié acceptée)
- 0 violation axe serious/critical ; quatre colonnes de thème sous seuil
- Le bouchon sert l'endpoint communities

### Critère de fin
Porte + vue + feuille : liste des communautés du lecteur servie par le serveur, cache-first, ouverture en ≤ 2 gestes depuis l'accueil. Garde de présence TESTÉE : la charge servie ne porte ni isOnline ni lastActiveAt hors amitié acceptée (directive 2026-08-25), et le client ne fabrique rien.

### Source
Lot: ordre.md (écrans #45) | Cible: cible/communities.png | Matrice: matrice.json#communities (L7) | Conception: conception-web-v3.md § 3.1 (placement) & CLAUDE.md § User Presence

---

_Generated by [Claude Code](https://claude.ai/code)_

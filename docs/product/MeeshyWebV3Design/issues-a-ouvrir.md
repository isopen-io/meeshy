# Issues à créer — Meeshy Web V3

> Date: 2026-09-06
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

## 6. Un message retiré peut se rattraper : « Annuler » pendant la fenêtre optimiste, et les gestes du fil sont éprouvés hors Chromium

**Clé**: `thread`  
**Genre**: écran  
**Route**: `/chats/:cle` (et `/chat/:lien`, même vue)  
**Priorité**: P0 — rôle premier  
**Audience**: les deux (connecté + invité)

### Contexte
Le menu répondre/modifier/retirer est livré (#5163) : fil-gestes.ts porte la poignée de destruction (ligne 299) et le repli SubmitEvent.submitter (lignes 158-169). Le retrait est optimiste avec confirmation/rétablissement — mais IRRÉVERSIBLE pour le lecteur (aucun « Annuler », grep vide sur fil-lignes.ts et fil-gestes.ts), et la réplique des gestes n'est éprouvée que sur Chromium (restantes déclarées § 12.12).

**Source fichier**: fil-gestes.ts:299 (destruction) ; fil-lignes.ts (rendu optimiste) ; e2e/visual/v3-fil-gestes.spec.ts (gateway seule)

### Preuve attendue
- Témoin e2e/visual/v3-fil-gestes.spec.ts : retirer un message affiche « Annuler » et cliquer Annuler restaure la ligne SANS rechargement (assertion DOM + aucune ligne perdue côté serveur au reload)
- La suite v3-fil-gestes passe sur les trois moteurs (chromium, webkit, firefox) du playwright.config.ts
- Sans JavaScript, le POST de retrait aboutit toujours (javaScriptEnabled:false)

### Critère de fin
Extraction de fil-vue.ts (1029 l, budget 1000-1200) : créer fil-opcodes.ts ou similaire. Le « Annuler » suit le patron Optimistic Update du CLAUDE.md : snapshot → retrait local avec bandeau « Message retiré — Annuler » → envoi différé ou DELETE puis restauration sur Annuler. Sans JavaScript, le POST de retrait reste immédiat (le chemin qui marche partout). Éprouver ensuite les gestes sur WebKit/Firefox dans la config Playwright existante.

### Source
Lot: ordre.md (fil) | Cible: cible/thread.png | Matrice: matrice.json#thread | Conception: conception-web-v3.md § 5 (contrat de données)

---

## 7. Une position partagée survit à la resynchronisation : GET /sync hisse `location`, et le module du fil a un plafond

**Clé**: `rich`  
**Genre**: écran  
**Route**: `/chats/:cle`  
**Priorité**: P0 — rôle premier  
**Audience**: les deux

### Contexte
#5061 a livré micro et position : location postée au premier niveau de POST /conversations/:id/messages, validée par parseSharedPlace() côté passerelle, lue comme un LIEU dans le fil. Mais GET /sync ne hisse pas `location` (grep vide sur services/gateway/src/routes/sync*) — un lieu reçu pendant une coupure n'arrive que par le repli metadata.location, partiel. Et participate.js pèse 32 676 o gzip (+16 %) sans plafond déclaré (budgets.json note « À ÉTABLIR » ne se compare à rien).

**Source fichier**: services/gateway/src/routes/sync (passerelle) ; lib/realtime/participate.js (web) ; budgets.json (plafond)

### Preuve attendue
- Témoin gateway : GET /sync rend `location` au premier niveau d'un message qui en porte (suite services/gateway verte)
- Témoin web : un message à lieu arrivé par la voie sync se peint comme un LIEU (nom, adresse, lien geo:), jamais des coordonnées brutes, et jamais pour un message protégé/éphémère/vue-unique/retiré
- Fichier __tests__/bundle-budget.test.ts rougit si participate.js dépasse le plafond nouvellement déclaré dans budgets.json

### Critère de fin
(a) Passerelle : la route sync de la passerelle projette `location` comme messages-list le fait déjà (une source, pas une jumelle — vérifier le select Prisma, leçon « champ vérifié DOIT y être ») + test gateway
(b) Web : déclarer le plafond de participate.js dans budgets.json depuis la mesure existante de budgets-mesures.json (jamais un chiffre inventé)

### Source
Lot: ordre.md (fil) | Cible: cible/rich.png | Matrice: matrice.json#rich | Conception: conception-web-v3.md § 5 (contrat de données)

---

## 8. Les quatre réglages-détails existent des deux côtés : confidentialité, médias, messages et notifications se règlent et sont relus du serveur

**Clé**: `reglages-details`  
**Genre**: écran  
**Route**: `/settings/privacy` · `/settings/media` · `/settings/message` · `/settings/notification`  
**Priorité**: P1 — rôle secondaire  
**Audience**: connecté

### Contexte
Rien pour ces quatre clés : ls app/settings → application, profile, profile/edit, security, security/password seulement ; grep privacySettings/mediaSettings/messageSettings/notificationSettings sur services/gateway/src/routes → 0. Le patron existe à côté : reglages-vue/porte/feuille.ts et app/settings/application/route.ts pour le web, community-preferences.ts / conversation-preferences.ts pour la forme passerelle. detail-notification dépend de notifPrefs (livré, #4899).

**Source fichier**: app/settings (existant) ; services/gateway/src/routes (passerelle)

### Preuve attendue
- Matrice.json : chaque clé (detail-privacy, detail-media, detail-message, detail-notification) respecte son critère :
  - detail-privacy : chaque bascule mute et est relue du serveur, un test de garde prouve qu'aucun réglage ne peut ÉLARGIR la visibilité de présence, 0 violation axe serious/critical
  - detail-media : modifier « téléchargement automatique » CHANGE le comportement observé sur /chats/:cle/medias (assertion CDP : 0 octet de média quand « jamais »)
  - detail-message : aucun contrôle inerte, état vide dessiné
  - detail-notification : les six groupes mutent et sont relus, la plage 22:00-08:00 persistée et respectée (assertion serveur), Intl natif sans bibliothèque de dates
- e2e/visual/lib/serveurs.ts complété pour chaque endpoint neuf

### Critère de fin
Passerelle d'abord (TDD) : chaque réglage en PATCH vers /me/preferences avec les champs appropriés (privacySettings, mediaSettings, messageSettings, notificationSettings). Puis quatre routes web sur le patron reglages-* : porte qui relit les prefs à chaque GET, vue + feuille. detail-privacy ne peut qu'RESTREINDRE la visibilité de présence (jamais élargir au-delà de la loi serveur resolvePresenceVisibility) ; detail-message n'expose AUCUN contrôle inerte (régime 3 : capacité absente non exposée, état vide DESSINÉ).

Si le tour ne peut livrer les QUATRE, livrer privacy et notification d'abord (dimensions 1 et 8) et déclarer le reste à l'issue.

### Source
Lot: ordre.md (#5066, focus porteur) | Cible: cible/detail-privacy.png, detail-media.png, detail-message.png, detail-notification.png | Matrice: matrice.json#detail-* | Conception: conception-web-v3.md § 3.1 (placement)

---

## 9. La navigation douce ne fuit ni listener ni socket : la mesure sur 20 navigations existe, et UN socket survit à /chats → fil → /chats

**Clé**: `navigateur-de-zone`  
**Genre**: infra  
**Route**: (transversal — `/chats` → `/chats/:cle` → `/chats`)  
**Priorité**: P1 — rôle secondaire  
**Audience**: connecté

### Contexte
L'étage 3 est implémenté (lib/realtime/navigateur.ts 215 l : meeshy:zone-depart → destruction, ré-armement data-module, scroll/focus/annonce) et fil-gestes.ts rend sa poignée de destruction (ligne 299). Mais AUCUN témoin ne mesure les points 4 et 6 du § 12.11.3 : grep « 20 navigations|fuite|listener » sur e2e/visual/v3-navigateur.spec.ts → vide. La promesse est implémentée, pas PROUVÉE — c'est aussi la restante « rétention mémoire non mesurée » du fil (§ 12.12).

**Source fichier**: lib/realtime/navigateur.ts ; e2e/visual/v3-navigateur.spec.ts (existant, à enrichir)

### Preuve attendue
- Témoin Playwright/CDP : 20 navigations douces `/chats` → fil → `/chats` dans le même onglet
- Compte instrumenté d'addEventListener/removeEventListener (ou HeapProfiler) non monotone croissant
- Compte de connexions socket.io ouvertes stable
- Témoin de forme du point 6 : la connexion du module liste n'est PAS fermée/rouverte à chaque bascule quand les deux écrans partagent le même socket authentifié
- Assertions vertes en CI contre la passerelle de bouchon

### Critère de fin
Un témoin Playwright dans e2e/visual/v3-navigateur.spec.ts : 20 navigations douces, comptage de listeners et de sockets, assertions sur la stabilité. Aucun code de production attendu si la mesure est verte ; si elle rougit, le correctif est le vrai livrable.

### Source
Lot: ordre.md (#4371, épopée) | Conception: conception-web-v3.md § 12.11.3 (navigation douce) & § 12.12 (mesures)

---

## 10. Le gate de conformité redevient un signal : le référentiel des captures cible est réconcilié avec la navigation en une page

**Clé**: `infra-1`  
**Genre**: infra  
**Route**: (transversal — les 48 vues)  
**Priorité**: P1 — rôle secondaire  
**Audience**: les deux

### Contexte
L'issue décision-produit q15 n'existe pas encore d'après la conception. compare-rendu.js, capture-cibles.js et conformite-des-vues.ts existent et tournent ; 48/48 vues hors cible (ecart_structurel_max=0,5507, 2026-09-05) parce que thread/chats/rich portent une barre de navigation globale (§ 12.11) que les captures cible ne montrent pas — seuls cible/thread.png, rich.png, rights.png ont été régénérés. § 11 q. 15 nomme la décision-produit à ouvrir : (a) régénérer cible/*.png post-nav-en-une-page pour toute la matrice, ou ajuster le socle ; (b) trancher le paradigme de sheet:link (formulaire livré vs feuille sommaire dessinée).

**Source fichier**: scripts/conformite-des-vues.ts ; docs/product/conception-web-v3.md § 11 q15

### Preuve attendue
- L'issue décision-produit q15 existe, labellisée et assignée au porteur avec les deux options chiffrées
- Si (a) est tranché : `bun run scripts/conformite-des-vues.ts` ne rapporte plus la barre de navigation comme écart ; le nombre de vues hors cible chute de 48 à un ensemble nommé, chaque écart restant étant un VRAI écart tracé vers son issue

### Critère de fin
OUVRIR l'issue décision-produit q15 (label décision-produit, assignée au porteur, milestone 74). Dès que le porteur tranche (a) : `node capture-cibles.js` régénère cible/, vues.md et les captures d'UNE commande (aucune capture à la main), commit avec la raison. Si le porteur ne tranche pas dans le tour, la moitié (1) est le livrable et le gate reste rapporté rouge-transversal (§ 12.10.9 : un rouge transversal n'arrête pas la PR, il s'y dit).

### Source
Lot: ordre.md (#4371, épopée) | Conception: conception-web-v3.md § 11 questions | Scripts: docs/product/MeeshyWebV3Design/scripts/compare-rendu.js, capture-cibles.js

---

## 11. La puce « Lien » ne s'offre plus quand la passerelle refuserait : le fil connaît le type et le rang avant de proposer

**Clé**: `links`  
**Genre**: écran  
**Route**: `/chats/:cle?lien`  
**Priorité**: P1 — rôle secondaire  
**Audience**: connecté

### Contexte
lienDepuisLeFil est livré (#5034) : feuille partagée (nouveau-lien-vue.ts, témoin fil-source-unique.test.ts), porte qui poste la clé des PARAMS, écoute unique (feuille-de-lien.ts). § 12.10.5 déclare le non-livré : la puce s'affiche sur des conversations que POST /links refuse (direct, rang < MODERATOR — services/gateway/src/routes/links/creation.ts:24-28) parce que `Fil` ne projette ni type ni rang ; le 403 est peint verbatim et « une issue de suivi le porte ».

**Source fichier**: lib/api/fil.ts (charge) ; fil-vue.ts (rendu) ; services/gateway/src/routes/links/creation.ts (garde passerelle)

### Preuve attendue
- Témoin unitaire : la puce « Lien » n'est pas rendue pour une conversation `direct` ni pour un rang < MODERATOR, et absente aussi quand type/rang manquent à la charge (fail-closed)
- Elle reste rendue pour un membre MODERATOR+ d'un groupe
- Témoin e2e : sur la fixture directe du bouchon, aucun contrôle inerte (loi 4 : un contrôle existe s'il a un effet) — le 403 verbatim disparaît du chemin nominal

### Critère de fin
Projeter type et rang du lecteur dans la charge du fil (lib/api/fil.ts — vérifier le select de la passerelle, jamais une jumelle : la loi vit dans creation.ts, le client ne fait que ne pas OFFRIR ce qui sera refusé — fail-closed si l'info manque). Puis gater la puce dans fil-vue.ts (extraction d'abord, 1029 l). Le QR (régime 3) reste HORS de ce travail : aucune route ne le sert, il exige sa propre décision. Ne pas toucher au paradigme de la feuille (q15, travail infra-1).

### Source
Lot: ordre.md (fil) | Cible: cible/thread.png | Matrice: matrice.json#thread | Conception: conception-web-v3.md § 12.10.5 (existant non-livré)

---

_Generated by [Claude Code](https://claude.ai/code)_

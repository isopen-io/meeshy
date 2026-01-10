# Index - Documents d'Architecture de Messagerie Meeshy

## Trois documents créés pour l'analyse architecture:

### 1. MESSAGING_ARCHITECTURE_DMA.md (📘 Complet - 600+ lignes)
**Pour:** Comprendre l'architecture complète de messagerie  
**Contient:**
- Vue d'ensemble du système (Frontend → Gateway → Backend)
- Modèles de données détaillés (Message, Conversation, Translation)
- Services de messagerie (MessagingService, TranslationService, etc.)
- Protocoles de communication (Socket.IO vs REST)
- Flux complet d'envoi de messages
- Sécurité et authentification
- Structure des conversations et rooms
- Formats de messages
- **BONUS: Points clés pour intégration DMA/MLS**

**À lire en premier pour:** Avoir une vue complète et des points de départ pour l'implémentation MLS

---

### 2. MESSAGING_FILES_STRUCTURE.md (📗 Technique - 400+ lignes)
**Pour:** Naviguer dans le codebase et comprendre les dépendances  
**Contient:**
- Hiérarchie complète des fichiers
- Description détaillée de chaque service/composant
- Dépendances npm (frontend et backend)
- Architecture détaillée de MessagingService
- Flux Socket.IO message:send
- Points d'intégration MLS avec emplacements exacts

**À lire pour:** Retrouver rapidement un fichier, comprendre où implémenter une feature

---

### 3. QUICK_START_GUIDE.md (📙 Pratique - 400+ lignes)
**Pour:** Comprendre l'architecture en 15 minutes  
**Contient:**
- 3 approches de lecture: globale, par couches, par cas d'usage
- Cas d'usage détaillés: envoi message, traduction, rejoindre conversation
- 5 fichiers CRITIQUES à connaître
- Flux de données pour chaque opération
- Points d'intégration MLS avec phases
- Checklist de compréhension (10 questions)
- Commandes bash utiles
- Dépannage rapide

**À lire pour:** Comprendre rapidement puis dépanner facilement

---

## Ordre de lecture recommandé

### Pour les architectes/leads:
1. QUICK_START_GUIDE.md (vue rapide)
2. MESSAGING_ARCHITECTURE_DMA.md (détails)
3. MESSAGING_FILES_STRUCTURE.md (implémentation)

### Pour les développeurs:
1. QUICK_START_GUIDE.md (understand the flow)
2. MESSAGING_FILES_STRUCTURE.md (find the files)
3. MESSAGING_ARCHITECTURE_DMA.md (deep dive)

### Pour l'intégration MLS:
1. MESSAGING_ARCHITECTURE_DMA.md (section 9: Points clés pour DMA/MLS)
2. MESSAGING_FILES_STRUCTURE.md (section: Points d'intégration MLS)
3. QUICK_START_GUIDE.md (section: Points d'intégration MLS)

---

## Fichiers clés mentionnés

### Types partagés (Foundation)
```
/shared/types/socketio-events.ts     <- Défini TOUS les événements
/shared/types/messaging.ts           <- Format requête/réponse
/shared/types/message-types.ts       <- Types gateway vs UI
/shared/types/conversation.ts        <- Types conversations
/shared/schema.prisma                <- Schéma MongoDB
```

### Backend (Fastify)
```
/gateway/src/server.ts                          <- Point d'entrée
/gateway/src/services/MessagingService.ts      <- SERVICE PRINCIPAL
/gateway/src/services/TranslationService.ts
/gateway/src/socketio/MeeshySocketIOManager.ts <- WEBSOCKET
/gateway/src/routes/messages.ts                <- REST API
/gateway/src/middleware/auth.ts                <- AUTHENTIFICATION
```

### Frontend (Next.js)
```
/apps/web/services/meeshy-socketio.service.ts  <- CLIENT SOCKET.IO
/apps/web/services/messages.service.ts         <- REST API
/apps/web/hooks/use-socketio-messaging.ts      <- HOOK PRINCIPAL
/apps/web/components/common/BubbleMessage.tsx  <- AFFICHAGE
```

---

## Termes clés

- **Socket.IO**: Protocol WebSocket temps réel bidirectionnel
- **MessageRequest**: Format standard d'envoi de message
- **MessagingService**: Service backend principal qui traite messages
- **MeeshySocketIOManager**: Gère connexions Socket.IO et rooms
- **BubbleMessage**: Composant React d'affichage d'un message
- **MLS (Message Layer Security)**: Protocole chiffrement DMA
- **Room**: Groupe Socket.IO pour broadcast (ex: conversation:123)
- **AuthenticationContext**: Contexte JWT ou session token

---

## Raccourcis utiles

**Voir les événements Socket.IO:**
```bash
cd /home/user/meeshy
grep -n "SERVER_EVENTS\|CLIENT_EVENTS" shared/types/socketio-events.ts
```

**Voir le modèle Message:**
```bash
grep -A 30 "^model Message {" shared/schema.prisma
```

**Voir MessagingService:**
```bash
cat gateway/src/services/MessagingService.ts | head -100
```

**Voir MeeshySocketIOManager:**
```bash
cat gateway/src/socketio/MeeshySocketIOManager.ts | head -150
```

**Voir meeshy-socketio.service.ts:**
```bash
cat frontend/services/meeshy-socketio.service.ts | head -150
```

---

## Questions fréquentes

**Q: Comment ajouter un nouvel événement Socket.IO?**
A: 
1. Ajouter dans `/shared/types/socketio-events.ts` (SERVER_EVENTS ou CLIENT_EVENTS)
2. Ajouter la signature dans ServerToClientEvents ou ClientToServerEvents
3. Implémenter handler côté backend dans MeeshySocketIOManager
4. Implémenter listener côté frontend dans meeshy-socketio.service.ts

**Q: Comment ajouter une nouvelle route REST?**
A:
1. Créer dans `/gateway/src/routes/...ts`
2. Ajouter middleware auth si nécessaire
3. Enregistrer dans `server.ts`
4. Créer service frontend correspondant

**Q: Où mettre le chiffrement MLS?**
A:
1. Frontend: Avant `socket.emit('message:send')` dans meeshy-socketio.service.ts
2. Backend: Après réception dans MessagingService.handleMessage()
3. BD: Nouveau champ `encryptedContent`
4. Frontend: Déchiffrement dans BubbleMessage.tsx

**Q: Comment tester les messages?**
A: Voir `/gateway/__tests__/MessageNotificationService.test.ts`

---

## Prochaines étapes

### Pour compléter l'analyse:
1. Lire les 3 documents dans l'ordre recommandé
2. Consulter le code source aux emplacements indiqués
3. Exécuter les commandes bash pour explorer
4. Vérifier les points d'intégration MLS

### Pour implémenter MLS:
1. Créer `MLSKeyManagementService.ts`
2. Créer `MessageEncryptionService.ts`
3. Modifier `schema.prisma` pour ajouter tables MLS
4. Intégrer dans MessagingService et meeshy-socketio.service.ts
5. Gérer backward compatibility avec messages existants

---

## Documents de référence existants

Le projet contient d'autres documents d'architecture:
- `/docs/ARCHITECTURE_REALTIME_STATUS.md`
- `/docs/REACTION_SYSTEM_DESIGN.md`
- `/gateway/docs/webrtc_p2p_architecture.md`
- `/docs/video-calls/ARCHITECTURE.md`


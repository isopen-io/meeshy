# Référence des Types de Notifications - Meeshy

Ce document fournit une référence rapide pour chaque type de notification implémenté dans Meeshy.

---

## 1. NEW_MESSAGE - "Message de XXXX"

### Déclencheur
- Un utilisateur reçoit un nouveau message dans une conversation

### Formatage
- **Titre**: `Nouveau message de {senderUsername}`
- **Contenu**: `{messagePreview}` (25 mots max) ou `📷 Photo` pour attachments
- **Contexte**: Si pas en temps réel → `il y a X minutes dans {conversationTitle}`

### Métadonnées
```json
{
  "conversationId": "conv_123",
  "messageId": "msg_456",
  "conversationTitle": "Groupe Famille",
  "conversationType": "group",
  "attachments": {
    "count": 2,
    "firstType": "image",
    "firstFilename": "photo.jpg"
  }
}
```

### Action
- Cliquer → Ouvre la conversation et scroll vers le message

### Priorité
- `NORMAL`

### Conditions d'envoi
- L'utilisateur n'est pas l'expéditeur
- L'utilisateur est membre actif de la conversation
- Préférence `newMessageEnabled` activée
- Conversation non muted

---

## 2. NEW_CONVERSATION_DIRECT - "Conversation avec XXXX"

### Déclencheur
- Un utilisateur est invité à une nouvelle conversation directe (1-to-1)

### Formatage
- **Titre**: `Nouvelle conversation avec {inviterUsername}`
- **Contenu**: `{inviterUsername} a démarré une conversation avec vous`

### Métadonnées
```json
{
  "conversationId": "conv_789",
  "conversationType": "direct",
  "action": "view_conversation"
}
```

### Action
- Cliquer → Ouvre la conversation directe

### Priorité
- `NORMAL`

---

## 3. NEW_CONVERSATION_GROUP - "Invitation de XXXX"

### Déclencheur
- Un utilisateur est invité à rejoindre un groupe

### Formatage
- **Titre**: `Invitation à "{conversationTitle}"`
- **Contenu**: `{inviterUsername} vous a invité à rejoindre "{conversationTitle}"`

### Métadonnées
```json
{
  "conversationId": "conv_999",
  "conversationTitle": "Groupe Projet",
  "conversationType": "group",
  "inviterId": "user_123",
  "action": "view_conversation"
}
```

### Action
- Cliquer → Ouvre le groupe

### Priorité
- `NORMAL`

---

## 4. MESSAGE_REPLY - "Réponse de XXXX"

### Déclencheur
- Un utilisateur reçoit une réponse à l'un de ses messages

### Formatage
- **Titre**: `Réponse de {replierUsername}`
- **Contenu**: `{replyPreview}` (25 mots max)
- **Contexte**: `En réponse à: "{originalMessagePreview}"`

### Métadonnées
```json
{
  "conversationId": "conv_123",
  "messageId": "reply_msg_789",
  "originalMessageId": "original_msg_456",
  "conversationTitle": "Discussion Tech",
  "action": "view_message"
}
```

### Action
- Cliquer → Ouvre la conversation et scroll vers la réponse, avec le message original visible

### Priorité
- `NORMAL`

### Conditions d'envoi
- L'utilisateur n'est pas celui qui répond
- Préférence `replyEnabled` activée

---

## 5. MEMBER_JOINED - "XXXX a rejoint le groupe"

### Déclencheur
- Un nouveau membre rejoint un groupe (notification envoyée uniquement aux admins/créateur)

### Formatage
- **Titre**: `Nouveau membre dans "{groupTitle}"`
- **Contenu**: `{newMemberUsername} a rejoint le groupe`

### Métadonnées
```json
{
  "conversationId": "group_123",
  "groupTitle": "Groupe Tech",
  "newMemberId": "user_999",
  "joinMethod": "via_link" | "invited",
  "action": "view_conversation"
}
```

### Action
- Cliquer → Ouvre la conversation de groupe

### Priorité
- `LOW` (notification informative, pas urgente)

### Conditions d'envoi
- L'utilisateur recevant la notification est admin ou créateur
- Préférence `memberJoinedEnabled` activée (désactivée par défaut)

---

## 6. CONTACT_REQUEST - "XXXX veut se connecter"

### Déclencheur
- Un utilisateur reçoit une demande de contact (friend request)

### Formatage
- **Titre**: `{requesterUsername} veut se connecter`
- **Contenu**: `{customMessage}` (si fourni) ou `{requesterUsername} vous a envoyé une invitation`

### Métadonnées
```json
{
  "friendRequestId": "fr_123",
  "requesterId": "user_456",
  "message": "Salut, j'ai vu ton profil!",
  "action": "accept_or_reject_contact"
}
```

### Action
- Cliquer → Ouvre un modal/page pour accepter ou refuser la demande

### Priorité
- `HIGH` (nécessite une action utilisateur)

### Conditions d'envoi
- Préférence `contactRequestEnabled` activée

---

## 7. CONTACT_ACCEPTED - "XXXX accepte la connexion"

### Déclencheur
- L'utilisateur qui avait envoyé une demande de contact est notifié de l'acceptation

### Formatage
- **Titre**: `{accepterUsername} accepte la connexion`
- **Contenu**: `{accepterUsername} a accepté votre invitation. Vous pouvez maintenant discuter ensemble.`

### Métadonnées
```json
{
  "conversationId": "conv_new_123",
  "accepterId": "user_789",
  "action": "view_conversation"
}
```

### Action
- Cliquer → Ouvre la nouvelle conversation directe créée automatiquement

### Priorité
- `NORMAL`

---

## 8. USER_MENTIONED - "XXXX vous a cité"

### Déclencheur
- Un utilisateur est mentionné avec @username dans un message

### Formatage
- **Titre**:
  - 1 mention: `{senderUsername} vous a mentionné`
  - Multiple mentions: `{senderUsername} vous a mentionné aux côtés d'autres`
- **Contenu**:
  - Si membre: `{messagePreview}` (20 mots max)
  - Si non-membre: `{messagePreview}\n\nVous n'êtes pas membre de cette conversation. Cliquez pour la rejoindre.`

### Métadonnées
```json
{
  "conversationId": "conv_123",
  "messageId": "msg_456",
  "conversationTitle": "Groupe Projet",
  "isMember": true,
  "action": "view_message" | "join_conversation",
  "attachments": {
    "count": 1,
    "firstType": "image"
  }
}
```

### Action
- Si membre: Cliquer → Ouvre la conversation et scroll vers le message
- Si non-membre: Cliquer → Ouvre un modal pour rejoindre la conversation

### Priorité
- `NORMAL`

### Sécurité
- Rate limiting: Max 5 mentions par minute d'un sender vers un recipient
- Anti-spam intégré pour éviter les abus

### Conditions d'envoi
- L'utilisateur mentionné n'est pas l'expéditeur
- Préférence `mentionEnabled` activée
- Rate limit non dépassé

---

## 9. MESSAGE_REACTION - "XXXX a réagi à votre message"

### Déclencheur
- Un utilisateur ajoute une réaction emoji à un message

### Formatage
- **Titre**: `{reactorUsername} a réagi à votre message`
- **Contenu**: `{emoji} {messagePreview}` (15 mots max)

### Métadonnées
```json
{
  "conversationId": "conv_123",
  "messageId": "msg_456",
  "reactionId": "react_789",
  "emoji": "❤️",
  "conversationTitle": "Chat Direct",
  "action": "view_message"
}
```

### Action
- Cliquer → Ouvre la conversation et scroll vers le message avec la réaction

### Priorité
- `LOW` (notification légère, non intrusive)

### Conditions d'envoi
- L'utilisateur qui réagit n'est pas l'auteur du message
- Préférence `reactionEnabled` activée

---

## 10. MISSED_CALL - "Appel manqué"

### Déclencheur
- Un utilisateur manque un appel (audio ou vidéo)

### Formatage
- **Titre**: `Appel {callType} manqué`
- **Contenu**: `Appel manqué de {callerUsername}`

### Métadonnées
```json
{
  "conversationId": "conv_123",
  "callSessionId": "call_456",
  "callType": "video" | "audio",
  "action": "open_call"
}
```

### Action
- Cliquer → Ouvre l'historique de l'appel ou redémarre un appel

### Priorité
- `HIGH` (appel nécessite une réponse rapide)

### Conditions d'envoi
- Préférence `missedCallEnabled` activée

---

## 11. SYSTEM - "Notification système"

### Déclencheur
- Notification administrative, maintenance, alerte de sécurité, etc.

### Formatage
- **Titre**: Variable selon le message système
- **Contenu**: Variable selon le message système

### Métadonnées
```json
{
  "systemType": "maintenance" | "security" | "announcement" | "feature",
  "action": "view_details" | "update_app" | "none"
}
```

### Action
- Variable selon le type

### Priorité
- `URGENT` pour sécurité/maintenance critique
- `NORMAL` pour annonces générales

### Conditions d'envoi
- Préférence `systemEnabled` activée

---

## Règles de Formatage Communes

### Timestamps
- **En temps réel** (< 10 secondes): Pas de mention de temps ni de conversation
  - Ex: `Message de Xena: Hello!`

- **Différé**: Inclure le temps relatif ET le contexte de conversation
  - Ex: `Message de Xena il y a 5 minutes dans Groupe Famille: Hello!`

### Aperçu des Messages (Message Preview)
- **Texte seul**: Tronquer à 25 mots, ajouter `...` si plus long
- **Avec attachment**: Tronquer à 15 mots + icône d'attachment
  - Ex: `Regarde cette photo 📷 Photo`
  - Ex: `Voici le document 📄 PDF`
- **Attachment seul (pas de texte)**: Juste l'icône
  - Ex: `📷 Photo`
  - Ex: `🎥 Vidéo (+2)` (si plusieurs)

### Icônes d'Attachments
- 📷 Photo → `image/*`
- 🎥 Vidéo → `video/*`
- 🎵 Audio → `audio/*`
- 📄 PDF → `application/pdf`
- 📎 Document → `application/*` (autres)
- 📎 Fichier → type inconnu

### Noms d'Utilisateurs (XXXX)
- Utiliser `username` (pas `displayName` ni `firstName`)
- Tronquer si > 20 caractères: `{username.slice(0, 17)}...`

### Noms de Conversations (YYYY)
- Utiliser `conversationTitle` si disponible
- Fallback pour direct: `Conversation avec {username}`
- Fallback pour groupe: `Groupe`

---

## Matrice de Compatibilité des Préférences

| Type de Notification | Préférence Principale | Préférences Secondaires | DND Respecté | Mute Conversation |
|---------------------|----------------------|------------------------|--------------|------------------|
| NEW_MESSAGE | `newMessageEnabled` | `conversationEnabled` | ✅ | ✅ |
| NEW_CONVERSATION_DIRECT | `conversationEnabled` | - | ✅ | ❌ |
| NEW_CONVERSATION_GROUP | `conversationEnabled` | - | ✅ | ❌ |
| MESSAGE_REPLY | `replyEnabled` | `newMessageEnabled` | ✅ | ✅ |
| MEMBER_JOINED | `memberJoinedEnabled` | `conversationEnabled` | ✅ | ✅ |
| CONTACT_REQUEST | `contactRequestEnabled` | - | ✅ | ❌ |
| CONTACT_ACCEPTED | `conversationEnabled` | - | ✅ | ❌ |
| USER_MENTIONED | `mentionEnabled` | `newMessageEnabled` | ✅ | ✅ |
| MESSAGE_REACTION | `reactionEnabled` | - | ✅ | ✅ |
| MISSED_CALL | `missedCallEnabled` | - | ⚠️ | ❌ |
| SYSTEM | `systemEnabled` | - | ⚠️ | ❌ |

**Légende**:
- ✅ = Toujours respecté
- ⚠️ = Respecté sauf si priorité URGENT
- ❌ = Jamais respecté (notifications importantes)

---

## Exemples Visuels

### Message Simple
```
┌────────────────────────────────────────┐
│ 💬 Message de Xena                     │ [•]
├────────────────────────────────────────┤
│ Salut! Comment ça va aujourd'hui?      │
│                                        │
│ il y a 2 minutes • dans Groupe Famille │
└────────────────────────────────────────┘
```

### Message avec Photo
```
┌────────────────────────────────────────┐
│ 💬 Message de Xena                     │ [•]
├────────────────────────────────────────┤
│ Regarde cette superbe vue 📷 Photo     │
│                                        │
│ il y a 5 minutes • dans Vacances 2024 │
└────────────────────────────────────────┘
```

### Mention (membre)
```
┌────────────────────────────────────────┐
│ @ Xena vous a mentionné                │ [•]
├────────────────────────────────────────┤
│ @john peux-tu vérifier le bug?         │
│                                        │
│ il y a 1 minute • dans Tech Support    │
└────────────────────────────────────────┘
```

### Mention (non-membre)
```
┌────────────────────────────────────────┐
│ @ Xena vous a mentionné                │ [•]
├────────────────────────────────────────┤
│ @john on a besoin de ton aide!         │
│                                        │
│ Vous n'êtes pas membre de cette        │
│ conversation. Cliquez pour rejoindre.  │
│                                        │
│ il y a 3 minutes • dans Projet Alpha   │
└────────────────────────────────────────┘
```

### Réponse
```
┌────────────────────────────────────────┐
│ ↩️ Réponse de Marc                     │ [•]
├────────────────────────────────────────┤
│ Oui, je suis d'accord avec toi!        │
│                                        │
│ il y a 30 secondes • dans Chat Direct  │
└────────────────────────────────────────┘
```

### Réaction
```
┌────────────────────────────────────────┐
│ ❤️ Marc a réagi à votre message       │
├────────────────────────────────────────┤
│ ❤️ Super idée pour le projet!          │
│                                        │
│ il y a 10 secondes • dans Brainstorm   │
└────────────────────────────────────────┘
```

### Invitation Groupe
```
┌────────────────────────────────────────┐
│ 👥 Invitation à "Équipe Marketing"     │ [•]
├────────────────────────────────────────┤
│ Sophie vous a invité à rejoindre       │
│ "Équipe Marketing"                     │
│                                        │
│ il y a 1 heure                         │
└────────────────────────────────────────┘
```

### Membre Rejoint
```
┌────────────────────────────────────────┐
│ 👋 Nouveau membre dans "Projet Alpha"  │
├────────────────────────────────────────┤
│ Jean a rejoint le groupe               │
│                                        │
│ il y a 5 minutes                       │
└────────────────────────────────────────┘
```

### Demande de Contact
```
┌────────────────────────────────────────┐
│ 🤝 Alice veut se connecter             │ [•]
├────────────────────────────────────────┤
│ Salut! On s'est rencontré à la conf    │
│ hier, ça serait cool de rester en      │
│ contact!                               │
│                                        │
│ il y a 10 minutes                      │
│                                        │
│ [Accepter] [Refuser]                   │
└────────────────────────────────────────┘
```

### Contact Accepté
```
┌────────────────────────────────────────┐
│ ✅ Alice accepte la connexion          │
├────────────────────────────────────────┤
│ Alice a accepté votre invitation.      │
│ Vous pouvez maintenant discuter        │
│ ensemble.                              │
│                                        │
│ il y a 2 minutes                       │
└────────────────────────────────────────┘
```

### Appel Manqué
```
┌────────────────────────────────────────┐
│ 📞 Appel vidéo manqué                  │ [•]
├────────────────────────────────────────┤
│ Appel manqué de Thomas                 │
│                                        │
│ il y a 15 minutes • dans Chat Direct   │
│                                        │
│ [Rappeler]                             │
└────────────────────────────────────────┘
```

---

## Actions Rapides (Quick Actions)

Certaines notifications peuvent avoir des actions rapides directement accessibles depuis la notification :

| Type | Actions Disponibles |
|------|-------------------|
| CONTACT_REQUEST | [Accepter] [Refuser] |
| MISSED_CALL | [Rappeler] |
| NEW_CONVERSATION_GROUP | [Rejoindre] [Ignorer] |
| MESSAGE_REACTION | [Réagir aussi] |

---

## Codes Couleur (UI)

Pour faciliter la reconnaissance visuelle :

| Type | Couleur Badge | Icône |
|------|--------------|-------|
| NEW_MESSAGE | Bleu | 💬 |
| MESSAGE_REPLY | Bleu clair | ↩️ |
| USER_MENTIONED | Orange | @ |
| MESSAGE_REACTION | Rose | ❤️ (emoji variable) |
| CONTACT_REQUEST | Vert | 🤝 |
| CONTACT_ACCEPTED | Vert clair | ✅ |
| NEW_CONVERSATION_* | Bleu | 👤 / 👥 |
| MEMBER_JOINED | Gris | 👋 |
| MISSED_CALL | Rouge | 📞 |
| SYSTEM | Violet | 🔔 |

---

Ce document sert de référence complète pour l'implémentation et le design des notifications dans Meeshy.

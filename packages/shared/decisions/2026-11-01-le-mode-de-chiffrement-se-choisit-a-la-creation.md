## 2026-11-01 : Le mode de chiffrement se choisit à la création, et le serveur chiffre toujours au repos

**Statut** : Accepté (directive porteur du 2026-11-01).

**Contexte** : la fiche Chiffrement des trois clients décrivait les modes avec des phrases de développeur (« Meeshy peut lire les messages », « AES-256-GCM ») et le mode Hybride se confondait avec Serveur. Une conversation se créait toujours sans mode, donc stockée en clair, et le chiffrement au repos pouvait se désactiver.

**Décisions** :
- **Trois modes, aucun « sans chiffrement ».** Le serveur chiffre toujours au repos. L'écran de création propose Serveur, Hybride, et Bout en bout ; Serveur est le défaut d'un utilisateur.
- **Bout en bout** se choisit par le rôle de plateforme qui peut déjà l'activer (ANALYST et plus, #12588), et il est présélectionné pour ces rôles LÀ OÙ IL FONCTIONNE : un tête-à-tête, sur un client qui sait le lire et l'écrire (iOS, Android). Dans un groupe, ou sur le web, il paraît « bientôt » et le défaut reste Serveur. Un rôle inférieur ne le voit pas.
- **Hybride** reste visible. Il chiffre aujourd'hui comme Serveur ; la fiche le dit sans jargon.
- **Les créations hors de l'écran de création** (ouvrir la conversation depuis un profil, un partage, un transfert, une réponse depuis une notification) ne choisissent rien : la passerelle pose Serveur. Jamais Bout en bout d'office, ces chemins portant des pièces jointes que le bout en bout ne scelle pas encore.
- **Le chiffrement au repos ne se désactive plus** (`409 ENCRYPTION_AT_REST_PERMANENT`). Serveur et Hybride passent directement à un autre mode, Bout en bout compris. Bout en bout ne se quitte jamais (#12949).
- **Le contrat** : `POST /conversations` accepte `encryptionMode: 'server' | 'hybrid' | 'e2ee'`. Absent, ou avec `plaintext: true` : `server`. `e2ee` : 403 `ENCRYPTION_ACTIVATION_RESTRICTED` sous ANALYST, 400 `ENCRYPTION_MODE_CONFLICT` avec `plaintext`, et il rouvre le tête-à-tête chiffré de la paire s'il existe. Le régime est écrit par le `create`, sous une clé obtenue AVANT : sans clé maîtresse, 503 `SERVER_AT_REST_UNAVAILABLE` et rien n'est créé.
- **Une règle, trois miroirs** : `packages/shared/utils/conversation-creation-encryption.ts` (`creationEncryptionOffer`), iOS `ConversationCreationEncryption`, Android `ConversationCreationEncryption.kt`.

**Les mots** (source française ; l'utilisateur lit ce qui le concerne, jamais qui détient une clé) :

| où | texte |
|---|---|
| en-tête du choix | Chiffrement |
| Serveur | **Serveur** — Vos messages sont chiffrés sur nos serveurs. Traduction, transcription et recherche fonctionnent. |
| Hybride | **Hybride** — Chiffré sur nos serveurs, comme Serveur. Le double chiffrement par vos appareils arrive bientôt. |
| Bout en bout | **Bout en bout** — Seuls vos appareils et ceux des participants lisent les messages. La traduction se fait sur votre appareil. |
| Bout en bout, groupe | Bientôt disponible pour les groupes |
| Bout en bout, web | Bientôt disponible sur le web |
| pied du choix | Le chiffrement de bout en bout ne se désactive jamais. Vous pourrez toujours ouvrir une autre conversation, sans chiffrement de bout en bout, avec les mêmes personnes. |
| résumé Serveur | Chiffrée sur nos serveurs |
| résumé Hybride | Chiffrée sur nos serveurs (mode hybride) |
| résumé ancienne conversation sans mode | Conversation créée avant le chiffrement systématique : ses messages ne sont pas chiffrés |
| résumé Bout en bout | Chiffrée de bout en bout : seuls les appareils des participants lisent les messages |

**Alternatives rejetées** : un choix « sans chiffrement » (contraire à la directive) ; Bout en bout présélectionné partout pour les analystes (le web ne le lit pas, et aucun client n'écrit encore dans un groupe chiffré) ; poser le régime par une bascule après la création (la conversation existerait un instant sans mode) ; garder la désactivation du chiffrement au repos.

**Conséquences** : les conversations créées avant cette décision sans mode restent en clair jusqu'à une migration de données, qui attend le feu vert du porteur et une sauvegarde vérifiée. Les anciens clients qui ne connaissent pas `encryptionMode` créent des conversations Serveur. Les phrases « Meeshy peut lire les messages » quittent les trois clients.

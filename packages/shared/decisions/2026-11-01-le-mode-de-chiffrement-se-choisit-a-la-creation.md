## 2026-11-01 : Le mode de chiffrement se choisit à la création, et le serveur chiffre toujours au repos

**Statut** : Accepté (directive porteur du 2026-11-01).

**Contexte** : la fiche Chiffrement des trois clients décrivait les modes avec des phrases de développeur (« Meeshy peut lire les messages », « AES-256-GCM ») et le mode Hybride se confondait avec Serveur. Une conversation se créait toujours sans mode, donc stockée en clair, et le chiffrement au repos pouvait se désactiver.

**Décisions** :
- **Trois modes, aucun « sans chiffrement ».** Le serveur chiffre toujours au repos. L'écran de création propose Serveur, Hybride, et Bout en bout ; Serveur est le défaut d'un utilisateur.
- **Bout en bout** se choisit par le rôle de plateforme qui peut déjà l'activer (ANALYST et plus, #12588), et il est présélectionné pour ces rôles LÀ OÙ IL FONCTIONNE : un tête-à-tête, sur un client qui sait le lire et l'écrire. **Correction du 2026-11-02 (#14369)** : seul iOS lit et écrit le bout en bout aujourd'hui ; Android (#14591) et le web (#14592) portent libsignal dans des chantiers en cours, et la règle `creationEncryptionOffer` les traite comme des clients qui ne le savent pas encore. Dans un groupe, ou sur un client sans libsignal, il paraît « bientôt » et le défaut reste Serveur. Un rôle inférieur ne le voit pas.
- **Hybride** reste visible. ~~Il chiffre aujourd'hui comme Serveur~~ — depuis le 2026-11-02 (#14369), il chiffre deux fois : la couche serveur scellée au repos et une couche appareil libsignal posée par les clients qui la savent (iOS, en tête-à-tête). Protocole et modèle de menace : `services/gateway/decisions/2026-11-02-le-mode-hybride-chiffre-deux-fois-14369.md`.
- **Les créations hors de l'écran de création** (ouvrir la conversation depuis un profil, un partage, un transfert, une réponse depuis une notification) ne choisissent rien : la passerelle pose Serveur. Jamais Bout en bout d'office, ces chemins portant des pièces jointes que le bout en bout ne scelle pas encore.
- **Le chiffrement au repos ne se désactive plus** (`409 ENCRYPTION_AT_REST_PERMANENT`). Serveur et Hybride passent directement à un autre mode, Bout en bout compris. Bout en bout ne se quitte jamais (#12949).
- **Le contrat** : `POST /conversations` accepte `encryptionMode: 'server' | 'hybrid' | 'e2ee'`. Absent, ou avec `plaintext: true` : `server`. `e2ee` : 403 `ENCRYPTION_ACTIVATION_RESTRICTED` sous ANALYST, 400 `ENCRYPTION_MODE_CONFLICT` avec `plaintext`, et il rouvre le tête-à-tête chiffré de la paire s'il existe. Le régime est écrit par le `create`, sous une clé obtenue AVANT : sans clé maîtresse, 503 `SERVER_AT_REST_UNAVAILABLE` et rien n'est créé.
- **Revue adversariale du lot (2026-11-01)** — ce qu'elle a fait changer :
  - **La règle de la paire (#12966) juge aussi la montée server/hybrid → e2ee** : une paire garde un seul tête-à-tête chiffré de bout en bout.
  - **Tout `conversation.create` de production pose son régime** : amitié acceptée, lien de partage (deux branches), création implicite de la traduction. Une garde de balayage l'impose. Seules exceptions déclarées : les conversations SYSTÈME de démarrage (Meeshy Global, conversation monde), laissées à la migration pour que la passerelle démarre sans dépendre de la clé maîtresse.
  - **Un tête-à-tête ancien sans mode, rouvert, est chiffré au repos** sous sa clé (sans clé maîtresse : 503, jamais rouvert en clair).
  - **Bout en bout à la création : tête-à-tête seulement** (400 `ENCRYPTION_MODE_UNSUPPORTED`) — aucun client n'écrit encore dans un groupe chiffré, et le bout en bout ne se quitte pas.
  - **Et à la bascule aussi (2026-11-04, #16113, décision par défaut en attente du porteur)** : `POST /conversations/:id/encryption {mode: 'e2ee'}` hors tête-à-tête rend le même 400 `ENCRYPTION_MODE_UNSUPPORTED`, après le 404 de l'étranger et le 403 du rang, sans rien écrire ni annoncer. Faits du 2026-11-04 : iOS et Android ne scellent que pour UN correspondant (`E2EEMessageSealer.seal(_:to:)`, `E2eeMessageSealer.seal`), le web n'a aucune clé ; la production n'a aucune conversation `e2ee`, le staging six groupes `e2ee`, laissés tels quels (#12949). Prédicat unique du TYPE : `endToEndSupportsConversationType` (`packages/shared/utils/conversation-creation-encryption.ts`), qui gouverne l'offre de création, la création et la bascule. Il ne juge que le type : la règle de la PAIRE (#12966) n'est vérifiée qu'à la bascule, et deux chemins antérieurs font encore un tête-à-tête `e2ee` à plus de deux membres (création `direct` à plusieurs invités, ajout d'un membre à un tête-à-tête), relevés par l’audit adversarial du lot : #16187 et #16188. Android refuse aussi localement (`ConversationEncryptionRepository.enable(…, isDirect)`).
  - **Le mode Serveur garde les fonctions serveur** (#9224) : l'édition et l'agent sont rétablis en `server`/`hybrid`. La recherche serveur (le texte au repos est rangé chiffré) est un suivi, et **la promotion en production l'attend**.
  - **Anciens clients** : ceux qui proposaient « Désactiver » (ANALYST et plus seulement) reçoivent un 409 lisible au lieu d'une désactivation.
- **Une règle, trois miroirs** : `packages/shared/utils/conversation-creation-encryption.ts` (`creationEncryptionOffer`), iOS `ConversationCreationEncryption`, Android `ConversationCreationEncryption.kt`.

**Les mots** (source française ; l'utilisateur lit ce qui le concerne, jamais qui détient une clé) :

| où | texte |
|---|---|
| en-tête du choix | Chiffrement |
| Serveur | **Serveur** — Vos messages sont chiffrés sur nos serveurs. Traduction, transcription et recherche fonctionnent. (La recherche serveur revient avant la promotion en production.) |
| Hybride | **Hybride** — Chiffré deux fois : sur nos serveurs, pour la traduction et la recherche, et de bout en bout par les appareils compatibles, qui vérifient que chaque message arrive intact. (#14369, remplace « … arrive bientôt ») |
| Bout en bout | **Bout en bout** — Seuls vos appareils et ceux des participants lisent les messages. La traduction se fait sur votre appareil. |
| Bout en bout, groupe | Bientôt disponible pour les groupes |
| Bout en bout, web | Bientôt disponible sur le web |
| pied du choix | Le chiffrement de bout en bout ne se désactive jamais. Vous pourrez toujours ouvrir une autre conversation, sans chiffrement de bout en bout, avec les mêmes personnes. |
| résumé Serveur | Chiffrée sur nos serveurs |
| résumé Hybride | Chiffrée deux fois : sur nos serveurs et par les appareils compatibles (#14369) |
| résumé ancienne conversation sans mode | Conversation créée avant le chiffrement systématique : ses messages ne sont pas chiffrés |
| résumé Bout en bout | Chiffrée de bout en bout : seuls les appareils des participants lisent les messages |

**Alternatives rejetées** : un choix « sans chiffrement » (contraire à la directive) ; Bout en bout présélectionné partout pour les analystes (le web ne le lit pas, et aucun client n'écrit encore dans un groupe chiffré) ; poser le régime par une bascule après la création (la conversation existerait un instant sans mode) ; garder la désactivation du chiffrement au repos.

**Conséquences** : les conversations créées avant cette décision sans mode restent en clair jusqu'à une migration de données, qui attend le feu vert du porteur et une sauvegarde vérifiée. Les anciens clients qui ne connaissent pas `encryptionMode` créent des conversations Serveur. Les phrases « Meeshy peut lire les messages » quittent les trois clients.

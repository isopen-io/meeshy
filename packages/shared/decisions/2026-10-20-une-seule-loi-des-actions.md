## 2026-10-20: Une seule loi dit quelles actions un lecteur peut faire sur un message ou une conversation (#11205)

**Statut** : Accepté (lois partagées livrées ; consommées par les lots web et iOS du milestone #195).

**Contexte** : demande porteur du 2026-10-20 — des appuis longs « exploitables et modernes », dont les actions suivent le TYPE de contenu et les RÔLES. Les règles vivaient dans les admissions de la passerelle (`messageEditAdmission.ts`, `messageDeleteAdmission.ts`, `conversationWriteAdmission.ts`, `utils/conversation-authority.ts`), que les clients ne peuvent pas importer ; le web les éclatait en quatre fichiers, iOS en quatre sites divergents.

**Décision** : trois lois PURES dans `packages/shared/utils`, exportées par `@meeshy/shared/utils` :
- `messageContentKind` — le type (text, link, image, video, audio, file, location, contact, poll, sticker, call, system, deleted, multi) et les drapeaux (vue unique, flou, chiffré, éphémère, optimiste, échec, avis de capture), dérivés en UN site.
- `messageActionsFor({ message, conversation, viewer, now })` — des GROUPES ordonnés (primaire plafonné à 6, Répondre en tête, « Réessayer » avant tout sur un échec ; organiser, plus, modération, destructif) et des VERDICTS alignés sur la passerelle : édition par l'auteur 24 h ou par un MODERATOR+ de plateforme membre, suppression pour tous par l'auteur sans fenêtre, retrait (motif requis) par un tiers privilégié jamais en direct, avis de capture retirable par l'auteur du message qu'il nomme.
- `conversationActionsFor({ conversation, viewer })` — le rang effectif de `conversation-authority` (ADMIN/BIGBOSS membre ⇒ créateur), l'appel délégué à `canStartCall`.

Le rôle de plateforme se lit par `globalRoleLevel` (inconnu ⇒ 0 ; AUDIT et ANALYST valent USER). Transférer, copier et enregistrer suivent `contentExitLaw`.

**Le client offre MOINS que la passerelle, jamais plus** : en E2EE ni édition ni transfert, traduction `'device'`, transcription et ton absents (`'e2ee-server-feature-absent'`) ; ni édition d'un message système, à vue unique ou sans texte ; rien qu'« Supprimer pour moi » sur un message supprimé ou expiré ; un rang d'écriture inconnu ferme ; un `direct` n'a pas d'autorité de conversation ; Global ne se renomme, ne se quitte ni ne se supprime pour tous. Vecteurs : `fixtures/action-policy/{message,conversation}-actions.vectors.json`, générés en exécutant la loi ; `clientStricter` y nomme les verdicts où le client refuse plus. `services/gateway/src/__tests__/unit/services/messaging/action-policy-parity.test.ts` les rejoue contre `admitMessageEdit`, `admitMessageDelete` et `actorHasMinimumRole` : inclusion toujours, égalité hors `clientStricter`.

**Alternatives rejetées** : exporter les admissions de la passerelle — elles lisent la base et ne compilent pas chez les clients. Une loi par client — c'est la divergence que ce lot ferme.

**Reporté, non tranché ici** : les contradictions du serveur — un MODERATOR de plateforme écrit et modère partout (`PLATFORM_STAFF_ROLES`) alors que `conversation-authority` en fait un membre ordinaire ; le rang `creator` d'un `direct` modère (édition, retrait d'un avis de capture) ; la passerelle ne refuse pas l'édition d'un message chiffré. La loi les reproduit tels quels là où elle les suit, et l'issue les porte.

**Conséquences** : les clients consomment ces lois au lieu de réécrire les règles ; le miroir Swift est le lot `sdk-action-policy-mirror`. Le miroir Kotlin natif ne la reçoit pas (gel Android du 2026-09-16).

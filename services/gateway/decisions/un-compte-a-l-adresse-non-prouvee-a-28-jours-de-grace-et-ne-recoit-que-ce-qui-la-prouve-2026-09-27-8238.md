## Un compte à l'adresse non prouvée a 28 jours de grâce, et ne reçoit que les e-mails qui la prouvent (2026-09-27, #8238, absorbe #8236)

Directive porteur 2026-09-27 : « pouvoir créer un compte avec un e-mail simplement et avoir jusqu'à une semaine d'utilisation sans dérangement, puis pendant 3 semaines invitation à remplir son compte jusqu'à blocage total » ; « chaque compte non actif / non vérifié ne reçoit plus d'e-mail sauf celui d'activation ». Précision du même jour, qui prime : « le but est de vérifier le compte, pas de suivre une procédure à tout prix » — toute action venue d'un e-mail prouve l'adresse. **Remplace le blocage immédiat de #8055** (`sans-numero-un-compte-n-est-actif-qu-une-fois-l-adresse-prouvee-2026-09-26-8055.md`).

### 1. La loi — `services/auth/account-activation.ts`, site unique

| état du compte | phase | `deadline` |
|---|---|---|
| adresse prouvée (`emailVerifiedAt`) | `done` | `null` |
| adresse cédée à une revendication prouvée (`emailReleasedAt`, #8214) | `done` — plus rien à prouver | `null` |
| numéro porté, adresse non prouvée | `quiet` avant J7, puis `invite` sans fin | `null` |
| ni numéro ni preuve | `quiet` < J7 ≤ `invite` < J28 ≤ `blocked` | début + 28 j |

- Constantes nommées `QUIET_DAYS = 7`, `BLOCK_AFTER_DAYS = 28`. Fonctions pures, l'instant est toujours passé par l'appelant ; chaque porte reçoit une horloge injectable (`now`), les témoins ne lisent jamais l'horloge murale.
- **L'horloge** : `activationStartedAt = max(createdAt, ACTIVATION_GRACE_EPOCH)`, l'époque étant le déploiement (`2026-09-28T00:00:00Z`). Un compte existant démarre au déploiement, un compte neuf à sa création — sans colonne ni migration. Sans cette clause, tous les comptes non vérifiés de plus de 28 jours seraient bloqués le jour même.
- **Le numéro n'est jamais bloquant** : il figure dans `missing`, jamais comme condition de blocage. Et un compte qui PORTE un numéro n'est jamais bloqué : #8055 disait « si un numéro est donné, le compte est activé directement », et la directive de #8238 ne porte que sur le compte « créé avec un e-mail simplement ». Il reste invité (`invite`, `deadline: null`) à prouver son adresse. Précisé sur #8238 et #8239.

### 2. Le contrat servi — `activation: { phase, deadline, missing }`

Type `AccountActivation` (`@meeshy/shared/types/account-activation`), déclaré dans `userSchema` (`accountActivationSchema`, JSON Schema, sans zod) et sur `SocketIOUser`. Servi sur l'objet `user` de `POST /auth/login`, `/auth/register`, `/auth/verify-email`, `/auth/refresh`, `/auth/magic-link/validate` (projecteur unique `AuthService.userToSocketIOUser`, et `MagicLinkService`) et de `GET /me` (le middleware le calcule sur la ligne qu'il lit déjà, cache compris).

### 3. Les portes

- **Mot de passe** (`AuthService.authenticate`) : `blocked` ⇒ `ActivationRequiresEmailProofError` ⇒ `verification-required` + code d'activation (porte `proven-password`, inchangée). Avant J28, la session s'ouvre ; **plus aucun code n'est renvoyé à chaque connexion** — pendant le délai, rien n'est demandé, puis les clients invitent (#8239).
- **Inscription** (`POST /auth/register`) : sans numéro, la session s'ouvre désormais tout de suite (#8055 rendait `verification-required`). L'e-mail de vérification part toujours, pour plus tard. Seule la revendication `claimEmail` (#8214) garde son code obligatoire — hors de cette loi.
- **Sessions existantes** : toute route authentifiée (`createUnifiedAuthMiddleware`, `ActivationBlockedError`) et `POST /auth/refresh` rendent `401 ACCOUNT_ACTIVATION_REQUIRED` ; le socket reçoit `auth:session-revoked` avec `reason: 'activation_required'` et est coupé (`AuthHandler._authenticateJWTUser`). La phase se recalcule à chaque requête : elle dépend de l'heure, pas de la ligne en cache.
- **Toute action venue d'un e-mail prouve l'adresse et active le compte**, y compris depuis `blocked` — site unique `services/auth/email-address-proof.ts` (`proveEmailAddress`, ou `emailProofFields` + `settleEmailAddressProof` pour une porte qui écrit dans sa propre transaction) : lien magique ET lien du résumé quotidien (`MagicLinkService.validateMagicLink`, avant le second facteur), lien de réinitialisation du mot de passe (`PasswordResetService.completePasswordReset`, jeton `email.` seulement — un jeton SMS ne prouve que le téléphone), code et lien de vérification (`verifyEmailProof`). Chaque preuve marque les attentes « prouvées », vide le cache d'auth du compte (pour que `done` se lise tout de suite) et annonce l'arrivée (#8105) quand elle est neuve. C'est ce qui solde #8236 : aucune porte n'ouvre plus de session sur une adresse « à prouver » sans la prouver.

### 4. La politique d'e-mail — `services/email/recipient-policy.ts`, garde CENTRALE

`EmailService.sendEmail`, le passage de tout envoi, demande `emailMayLeave({ to, kind })`. Une adresse NON vérifiée ne reçoit que les familles dont l'USAGE prouve l'adresse : `verification`, `login_code`, `password_reset`, `magic_link`, plus deux familles décidées ici — `email_change` (part vers la NOUVELLE adresse pour la prouver) et `deletion_confirm` (demandé par la personne ; le couper empêcherait un compte non vérifié de se fermer). Résumé, notifications, diffusions, invitations, alertes de sécurité ou de connexion, mot de passe changé, rappel de suppression : coupés. Une adresse sans compte (invitation d'un inconnu) n'est pas visée.

- **« Mot de passe oublié » envoie la réinitialisation NORMALE** à une adresse non vérifiée : la garde de #6642 (adresse non vérifiée + mot de passe ⇒ aucun lien) est levée, et il n'y a PAS de substitution par l'e-mail d'activation — l'usage du lien prouve l'adresse. Le lien magique demandé sur une adresse non vérifiée suit déjà la porte « e-mail seul » (#8033) : code + lien de vérification.
- **Fail-closed** : le lecteur d'adresses est enregistré au démarrage (`registerEmailRecipientLookup(prismaRecipientAddressLookup(this.prisma))`, `server.ts`) ; sans lui, sur une lecture qui lève, ou pour un envoi sans famille déclarée, une famille non probante ne part pas.

### 5. Ce qui ne bouge pas, et ce qui reste

- La revendication `claimEmail` (#8214) : la preuve active le compte REVENDIQUANT, jamais l'ancien détenteur (`email-claim.ts`, hors de `email-address-proof.ts`).
- Les clients (modal d'invitation de J7 à J28, écran du code en `blocked`) : #8239. Miroir Kotlin natif non touché (gel du 2026-09-16).
- Budget de taille : `AuthService.ts` (vérification SMS → `services/auth/phone-verification.ts`) et `EmailService.ts` (feuille de style → `services/email/base-styles.ts`) sont repassés sous 1000 lignes avant d'accueillir la loi.

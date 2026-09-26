## Une adresse inconnue devient un compte, et la vérification ouvre la session (2026-09-26, #8033, #8036)

**Contexte** : Directive porteur 2026-09-26 : « Lorsqu'on essaye de se connecter avec un email qui n'existe pas, il faut directement créer le compte et envoyer le code et le lien pour valider son compte ! », amendée le même jour : par la porte « e-mail seul », un compte EXISTANT reçoit lui aussi code + lien, avant toute session.

**Décision** :

1. **Une fonction unique**, `startAccountFromEmail` (`src/services/auth/account-from-email.ts`), partagée par `POST /auth/login` (porte `password-login`) et `POST /auth/magic-link/request` (porte `email-only`).
2. **Aucun mot de passe tapé à la connexion n'est stocké** : le compte naît sans (`User.password = null`, #6424). Sinon un tiers qui tape votre adresse vous imposerait son mot de passe.
3. **Aucune session sans preuve de possession** : seule `POST /auth/verify-email` (code ou lien) ouvre la session, sous la forme de `POST /login`. Un compte à second facteur reçoit le défi (`requires2FA` + `twoFactorToken`), jamais la session.
4. **La paire code + lien est un secret de connexion** (`src/services/auth/email-code.ts`) : code stocké HACHÉ (SHA-256), comparé en temps constant, usage unique (écriture conditionnée à la paire lue), une seule paire vivante par compte (la plus récente), 15 minutes pour une connexion, `EMAIL_VERIFICATION_TOKEN_EXPIRY` pour une inscription. Les codes écrits en clair avant ce lot restent reconnus jusqu'à leur expiration.
5. **Plus de « déjà vérifié » gratuit** : `verify-email` répondait `alreadyVerified` à quiconque nommait une adresse vérifiée, sans preuve. Depuis, un compte vérifié sans paire en cours est refusé comme un code faux.
6. **Compte supprimé (`isActive: false`)** : `User.email` reste unique, la ligne garde l'adresse. Ni recréation (contrainte), ni réactivation (le détenteur l'a fermé) : l'adresse est « indisponible » — 401 inchangé au login, réponse publique inchangée à la porte « e-mail seul ».
7. **Débit** : envois (création, code) comptés par adresse ET par IP (3 et 10 par heure en production) ; `verify-email` limitée à 5 essais / 15 min par adresse et 20 / 15 min par IP. Par la porte « e-mail seul », le débit est compté AVANT la lecture du compte : le 429 ne dit rien de l'existence.
8. **Staging (#8036)** : `MEESHY_ENV=staging`, lu une fois, marque chaque e-mail au point unique d'envoi (`src/services/email/staging-marker.ts`) — sujet `[STAGING] `, bandeau en tête du HTML, mention en tête du texte.

**Conséquences** :

- La porte « e-mail seul » n'honore plus `rememberDevice` ni `returnUrl` (le lien mène à `/auth/verify-email`) ; `MagicLinkService.requestMagicLink` n'a plus d'appelant — `/auth/magic-link/validate` reste valide pour les liens déjà partis.
- La création à la connexion vaut acceptation des CGU comme l'inscription (`termsAcceptedAt`) : les clients doivent l'écrire sous le bouton.
- Miroir Kotlin natif non touché (gel du 2026-09-16).

## 2026-09-26 (soir) — Sans numéro, un compte n'est actif qu'une fois l'adresse prouvée (#8055)

Règle porteur : « Le code s'entre après la création de compte la première fois pour continuer sur l'application ! Sans ce code on ne rejoint aucun canal, le compte reste inactif ! Si un numéro est donné en plus de l'email, le compte est activé directement et on peut entrer le code ou cliquer sur le lien plus tard. »

1. **`POST /auth/register` SANS numéro** (ni `phoneNumber` retenu sur le compte, ni `phoneTransferToken` validé) : réponse `{ status: "verification-required", accountCreated: true, email }` — la MÊME branche que la connexion (`verificationRequiredProperties`, `packages/shared/types/api-schemas/auth.ts`, dont `loginVerificationRequiredProperties` est désormais l'alias) — AUCUNE session, aucun jeton. Le code et le lien partent avec l'e-mail de vérification de l'inscription (paire de `email-code.ts`, `EMAIL_VERIFICATION_TOKEN_EXPIRY`). **Le mot de passe choisi EST enregistré** : contrairement à la connexion (§ 2 ci-dessus), c'est la personne qui l'a tapé sur SA page d'inscription. `POST /auth/verify-email` ouvre la session ; son `password` optionnel ne s'applique qu'à un compte qui n'en a pas, donc il n'écrase jamais celui de l'inscription.
2. **AVEC numéro** : inchangé — session immédiate (#4264), l'adresse se vérifie plus tard (code ou lien).
3. **`POST /auth/login`, bon mot de passe, compte non vérifié ET sans numéro** : `AuthService.authenticate` lève `ActivationRequiresEmailProofError` (portant l'adresse DU COMPTE) après la vérification du mot de passe et du verrou, avant le second facteur et toute écriture de présence ; la route renvoie le code par la porte `proven-password` de `startAccountFromEmail` (débit par adresse et par IP comme `password-login`, jamais de création, `accountCreated: false`). Un mot de passe faux reste un 401 compté : seul qui connaît le mot de passe apprend que le compte attend son code. Compte non vérifié AVEC numéro : inchangé (session + renvoi du code).
4. **Comptes historiques** : les comptes non vérifiés sans numéro qui se connectaient jusqu'ici par mot de passe passent désormais par le code à leur prochaine connexion. C'est la règle voulue, pas une régression. Les sessions DÉJÀ ouvertes ne sont pas révoquées.
5. **Clients** : iOS — `AuthManager.registerThrowing` rend `RegistrationOutcome` (`.authenticated` / `.verificationRequired`), et l'inscription présente `EmailVerificationView` sans renvoyer le mot de passe. Web — livré séparément (#8055, `apps/web/src/routes/signup.tsx`). Miroir Kotlin natif non touché (gel du 2026-09-16).

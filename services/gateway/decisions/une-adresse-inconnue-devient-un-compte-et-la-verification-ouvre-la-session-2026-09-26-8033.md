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

import { liftEmailLinkSecret } from './email-link-secret';

/**
 * #10859 — importé EN PREMIER par `main.tsx` : le jeton d'un lien d'e-mail
 * quitte la barre d'adresse avant que le routeur ne la lise à son import.
 */
if (typeof window !== 'undefined') liftEmailLinkSecret(window);

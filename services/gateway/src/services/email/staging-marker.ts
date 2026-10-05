/**
 * Le MARQUAGE d'un e-mail parti de staging (#8036).
 *
 * Staging envoie de vrais e-mails à de vraies boîtes (recette à plusieurs
 * adresses). Sans marque, un code de connexion de test ressemble trait pour
 * trait à un vrai — et un destinataire qui n'attendait rien peut le prendre
 * pour une tentative d'intrusion. Trois marques, chacune lisible là où les
 * autres ne le sont pas : le SUJET (liste de la boîte), un BANDEAU en tête du
 * HTML, et le TEXTE brut (clients sans HTML, aperçus).
 *
 * Appliqué au point UNIQUE d'envoi (`EmailService.sendEmail`) : tout gabarit,
 * présent ou futur, est couvert sans y penser. `MEESHY_ENV` se lit UNE fois, à
 * la construction du service ; seule la valeur exacte `staging` marque.
 *
 * @module services/email/staging-marker
 */

export type OutgoingEmail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

const SUBJECT_PREFIX = '[STAGING] ';
const NOTICE = 'Email de TEST — environnement staging, ignorez-le si vous n’attendiez rien.';

const BANNER_HTML =
  `<div role="note" style="background:#FEF3C7;border:2px solid #D97706;color:#78350F;padding:12px 16px;` +
  `margin:0 0 12px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;text-align:center">` +
  `⚠️ ${NOTICE}</div>`;

export const isStagingEnvironment = (value: string | undefined): boolean => value === 'staging';

/** Rend l'e-mail marqué quand `staging` est vrai, inchangé sinon. */
export function markForEnvironment<T extends OutgoingEmail>(email: T, staging: boolean): T {
  if (!staging) return email;

  const bodyOpen = /<body[^>]*>/i.exec(email.html);
  const html = bodyOpen
    ? `${email.html.slice(0, bodyOpen.index + bodyOpen[0].length)}${BANNER_HTML}${email.html.slice(bodyOpen.index + bodyOpen[0].length)}`
    : `${BANNER_HTML}${email.html}`;

  return {
    ...email,
    subject: `${SUBJECT_PREFIX}${email.subject}`,
    html,
    text: `${SUBJECT_PREFIX}${NOTICE}\n\n${email.text}`,
  };
}

/**
 * L'échappatoire de la garde de domaine d'e-mail (#16491), lue UNE fois au
 * chargement : `ALLOW_RESERVED_EMAIL_DOMAINS=true` — cette valeur exacte et
 * aucune autre — ouvre les adresses réservées et jetables (staging, dev,
 * tests). Absente, la garde est active ; la production ne la pose pas.
 *
 * Module à part pour qu'un témoin puisse couper l'échappatoire sans doubler la
 * garde elle-même.
 *
 * @module services/auth/email-domain-escape
 */
export const RESERVED_EMAIL_DOMAINS_ALLOWED = process.env.ALLOW_RESERVED_EMAIL_DOMAINS === 'true';

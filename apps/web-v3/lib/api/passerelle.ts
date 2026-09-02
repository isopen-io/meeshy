/**
 * OÙ EST LA PASSERELLE — les deux origines, et rien d'autre.
 *
 * Elles vivaient dans `lib/api/links.ts`, où elles n'avaient qu'un
 * consommateur. `lib/api/invite.ts` en est le second, et `links.ts` a besoin de
 * LUI (l'aperçu d'un lien de conversation n'a qu'un lecteur, § « une source par
 * vérité ») : les laisser là-bas fermait un cycle d'imports. Le site le plus
 * bas de la pile porte donc ce que les deux lisent ; `links.ts` les ré-exporte
 * pour que ses importateurs n'aient rien à apprendre.
 */

/**
 * La base que le SERVEUR joint — l'adresse interne du réseau Docker en
 * production (`MEESHY_GATEWAY_URL`), sinon celle du navigateur.
 */
export const baseDeLaPasserelle = (): string =>
  (process.env.MEESHY_GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );

/**
 * La base que le NAVIGATEUR peut joindre — pour le module de participation
 * (§ 12.4), qui parle à la passerelle depuis le téléphone du lecteur, pas depuis
 * le conteneur. `MEESHY_GATEWAY_URL` est l'adresse INTERNE du réseau Docker
 * (`http://gateway:3000`, `docker-compose.prod.yml`) : un navigateur ne la
 * résout pas.
 */
export const baseDeLaPasserellePublique = (): string =>
  (process.env.NEXT_PUBLIC_API_URL ?? process.env.MEESHY_GATEWAY_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );

/**
 * LE DÉLAI D'ABANDON d'un appel à la passerelle, écrit une fois pour les trois
 * modules que le SERVEUR et le module de participation partagent (`compte`,
 * `fil`, `invite`) : au-delà, une passerelle muette est une PANNE (§ 7), et
 * l'appel se retire par `AbortSignal.timeout`. Le harnais de cycle de vie
 * (`e2e/visual/lib/navigateur-cycle.ts`) le lit aussi : sous l'horloge
 * virtuelle de Playwright, ce délai court en temps de PAGE, et une avance
 * virtuelle ne doit jamais le franchir d'un seul saut — sinon la réponse
 * RÉELLE arrive après l'abandon.
 */
export const DELAI_DE_REPONSE_MS = 6000;

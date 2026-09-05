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

const sansBarreFinale = (url: string): string => url.replace(/\/+$/, '');

/**
 * La base que le SERVEUR joint — l'adresse interne du réseau Docker en
 * production (`MEESHY_GATEWAY_URL`), sinon celle du navigateur.
 */
export const baseDeLaPasserelle = (): string =>
  sansBarreFinale(
    process.env.MEESHY_GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
  );

/**
 * Une origine que le navigateur du lecteur joint depuis SA machine — la seule
 * forme d'adresse interne qui soit aussi la sienne : le poste de développement,
 * où la passerelle et le navigateur partagent la boucle locale.
 */
const BOUCLE_LOCALE = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?$/i;

/**
 * La base que le NAVIGATEUR peut joindre — pour le module de participation
 * (§ 12.4), qui parle à la passerelle depuis le téléphone du lecteur, pas depuis
 * le conteneur, et pour toute URL de média que le document lui remet.
 * `MEESHY_GATEWAY_URL` est l'adresse INTERNE du réseau Docker
 * (`http://gateway:3000`, `docker-compose.prod.yml`) : un navigateur ne la
 * résout pas.
 *
 * ELLE REFUSE DE SERVIR UNE ADRESSE INTERNE (staging, 2026-09-05). Le repli
 * `NEXT_PUBLIC_API_URL ?? MEESHY_GATEWAY_URL` remettait au navigateur
 * `http://gateway-staging:3000` dès que la variable publique manquait à
 * l'environnement du conteneur : la page, servie en HTTPS, voyait son socket
 * (`ws://`) et sa relecture des messages (`http://`) BLOQUÉS en contenu mixte,
 * et le fil restait un formulaire — sans qu'aucun témoin ne rougisse, puisque
 * le document se composait sans erreur. Un repli n'en est un que s'il peut
 * MARCHER : la seule adresse interne qu'un navigateur atteint est la boucle
 * locale du poste de développement. Hors d'elle, la configuration manque, et
 * lever ici est ce qui la rend visible — `/healthz` relaie le même verdict, si
 * bien qu'un conteneur mal configuré ne devient jamais sain.
 *
 * `NEXT_PUBLIC_API_URL` est lue à l'EXÉCUTION, et c'est une propriété à garder :
 * Next inline toute variable `NEXT_PUBLIC_*` PRÉSENTE au moment du `next build`,
 * jusque dans le code serveur. Elle ne l'est pas parce que le Dockerfile de la
 * v3 ne la déclare ni en `ARG` ni en `ENV` — `scripts/check-v3-pipeline.mjs`
 * le garde ; le jour où elle entrerait dans le build, la valeur du compose
 * serait ignorée et ce repli redeviendrait la seule adresse servie.
 */
export const baseDeLaPasserellePublique = (): string => {
  const publique = process.env.NEXT_PUBLIC_API_URL;
  if (publique !== undefined && publique !== '') return sansBarreFinale(publique);
  const interne = sansBarreFinale(process.env.MEESHY_GATEWAY_URL ?? 'http://localhost:3000');
  if (BOUCLE_LOCALE.test(interne)) return interne;
  throw new Error(
    `La passerelle PUBLIQUE n'est pas configurée : NEXT_PUBLIC_API_URL est absente et MEESHY_GATEWAY_URL ` +
      `vaut « ${interne} », une adresse interne au réseau des conteneurs qu'un navigateur ne résout pas. ` +
      `Le document refuse de la servir : déclarez NEXT_PUBLIC_API_URL (l'origine https de la passerelle ` +
      `derrière Traefik) sur le service de la v3.`,
  );
};

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

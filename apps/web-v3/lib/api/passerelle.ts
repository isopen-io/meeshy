/**
 * Comment la v3 PARLE à la passerelle — le site unique de cette plomberie.
 *
 * Ce module ne connaît aucune route et aucun domaine : il porte la base, le
 * délai, la lecture défensive d'une charge JSON et les quatre accesseurs qui
 * refusent de faire confiance à ce qui traverse le réseau. `links.ts` (la
 * résolution d'un jeton `/l/:token`) et `adhesion.ts` (l'entrée par un lien de
 * partage) en dépendent tous deux ; les recopier chez le second aurait produit
 * deux conventions de délai, deux façons de lire `data`, et deux versions du
 * jour où l'une des deux se corrige.
 *
 * TROIS PROPRIÉTÉS Y SONT TENUES, ET AUCUNE N'EST UNE PRÉFÉRENCE DE STYLE
 *
 *   • **Rien ne jette.** Une passerelle injoignable est un fait de RÉSEAU, pas
 *     un refus (§ 7, « erreur réseau ≠ 401 ») : l'appelant reçoit une valeur qui
 *     le DIT, et l'écran peint « indisponible » plutôt que « fermé ». Confondre
 *     les deux fait afficher « ce lien a expiré » sur une coupure de tunnel, un
 *     mensonge que le lecteur ne peut pas contredire.
 *   • **Rien n'attend indéfiniment.** Le § 8.3 vise 600 ms du TTFB à la 302 :
 *     une passerelle lente ne tient pas un lecteur en otage.
 *   • **Rien n'est mis en cache.** L'état d'un lien change sans prévenir —
 *     désactivé par son auteur, épuisé, expiré. Next met en cache les `fetch`
 *     serveur selon la route ; l'écrire ici rend la règle indépendante de la
 *     configuration de rendu, et un lien fermé ne peut pas continuer d'ouvrir.
 *   • **L'identité RÉSEAU du visiteur voyage.** Voir `IdentiteDuVisiteur`
 *     ci-dessous : un appel serveur-à-serveur qui ne la porte pas remplace
 *     l'adresse du lecteur par celle du conteneur, pour tous les lecteurs à la
 *     fois.
 *
 * Les accesseurs lisent les propriétés PROPRES d'une valeur décodée : ce que
 * `JSON.parse` rend n'est pas un type, et une assertion le prétendrait. Les
 * propriétés héritées sont ignorées de surcroît — une charge trafiquée par
 * `__proto__` ne peut rien fournir.
 */

const PREFIXE = '/api/v1';

/** Le délai au-delà duquel une passerelle muette devient une indisponibilité. */
const DELAI_MS = 2500;

/** Ce que l'appelant injecte pour être testable sans réseau. */
export type Recuperateur = (url: string, options?: RequestInit) => Promise<Response>;

/**
 * La base de la passerelle. Lue à CHAQUE appel, jamais au chargement du
 * module : `next build` évalue les modules serveur, et une base figée à la
 * construction serait celle de l'image, pas celle du déploiement.
 */
export const baseDeLaPasserelle = (): string =>
  (process.env.MEESHY_GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );

/**
 * LA BASE QUE LE NAVIGATEUR PEUT JOINDRE — et pourquoi ce n'est pas la même.
 *
 * `baseDeLaPasserelle()` ci-dessus est celle des appels SERVEUR-À-SERVEUR : en
 * production elle vaut une adresse de réseau interne (`http://gateway:3000`),
 * qu'aucun navigateur ne résout. L'îlot du fil, lui, bat et rattrape depuis le
 * NAVIGATEUR : il lui faut l'adresse publique.
 *
 * Elle est lue ICI, côté serveur, et passée en propriété à l'îlot. Le détour
 * n'est pas de la cérémonie : une variable préfixée `NEXT_PUBLIC_` référencée
 * depuis du code CLIENT est remplacée au BUILD, donc figée dans l'image — une
 * même image déployée sur deux environnements servirait la passerelle du
 * premier. Lue au rendu, la valeur est celle du DÉPLOIEMENT.
 *
 * L'ordre des deux clés est l'INVERSE de celui de `baseDeLaPasserelle` : ici
 * c'est l'adresse publique qui prime, et l'interne n'est qu'un repli — utile en
 * développement et dans les harnais, où les deux sont la même machine.
 */
export const basePubliqueDeLaPasserelle = (): string =>
  (process.env.NEXT_PUBLIC_API_URL ?? process.env.MEESHY_GATEWAY_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );

export const cheminDeLaPasserelle = (chemin: string): string => `${PREFIXE}${chemin}`;

/**
 * L'ADRESSE D'UN MÉDIA — le chemin que la base porte, rendu joignable par un
 * navigateur.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * `fileUrl` EST UN CHEMIN, PAS UNE URL — malgré son nom
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `MessageAttachment.fileUrl` est écrit par `UploadProcessor.getAttachmentPath`,
 * qui rend `/api/v1/attachments/file/<encodé>` — RELATIF, sans origine. (Sa
 * jumelle `getAttachmentUrl` rend l'absolu ; c'est la RELATIVE qui est
 * persistée.) Les pistes TTS suivent la même forme
 * (`/api/v1/attachments/file/translated/…`, `MessageTranslationService`).
 *
 * Posé tel quel dans un `<a href>` ou un `<audio src>`, ce chemin se résout
 * contre l'origine du DOCUMENT — `https://meeshy.me/api/v1/…` en production. Or
 * le routeur de la passerelle y est `Host(gate.${DOMAIN})` SEUL : l'apex est
 * attrapé par le routeur `frontend`, aucun `PathPrefix('/api')` n'y existe, et
 * `next.config.ts` ne pose aucune `rewrites`. Chaque tuile mènerait donc au 404
 * de Next, et chaque lecteur audio ne jouerait rien — un écran entier de
 * contrôles INERTES, ce que la loi 4 refuse, sur l'écran du rôle premier.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DONNER L'ORIGINE N'EST PAS RECOMPOSER LE CHEMIN (§ 5.1)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le § 5.1 interdit de « reconstruire l'URL côté client » : la signature
 * `?exp=&sig=` viendra dans la valeur servie, et un écran qui recomposerait le
 * CHEMIN la perdrait en silence. Cette fonction ne touche jamais au chemin —
 * elle ne fait que le PRÉFIXER de l'origine publique. C'est la distinction que
 * la conception ne faisait pas, et que le § 5.1 porte désormais.
 *
 * `basePubliqueDeLaPasserelle()` et non `baseDeLaPasserelle()` : cette adresse
 * est rendue dans le DOCUMENT et suivie par le NAVIGATEUR, jamais par le
 * serveur. L'adresse interne (`http://gateway:3000`) n'est résolue par aucun
 * téléphone.
 *
 * Une valeur DÉJÀ absolue traverse telle quelle — c'est la forme que servent
 * les harnais, et celle qu'une passerelle configurée avec `PUBLIC_URL` peut
 * servir un jour. Ce qui n'est ni absolu ni enraciné n'est pas une adresse que
 * ce module sache joindre : il rend `null`, et l'appelant écarte le média
 * plutôt que de peindre une tuile morte. Fabriquer un chemin par-dessus une
 * clé de stockage serait précisément la recomposition que le § 5.1 interdit.
 */
export const adresseDuMedia = (valeur: unknown): string | null => {
  const brut = texte(valeur);
  if (brut === null) return null;

  if (brut.startsWith('http://') || brut.startsWith('https://')) return brut;
  if (brut.startsWith('/')) return `${basePubliqueDeLaPasserelle()}${brut}`;

  return null;
};

export const texte = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur.trim() !== '' ? valeur : null;

export const champ = (objet: object, nom: string): unknown =>
  Object.getOwnPropertyDescriptor(objet, nom)?.value;

export const objet = (valeur: unknown): object | null =>
  typeof valeur === 'object' && valeur !== null ? valeur : null;

export const entier = (valeur: unknown): number | null =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;

/** Une date ISO servie par la passerelle, ou `null` — jamais un `NaN` qui se compare faux en silence. */
export const instant = (valeur: unknown): number | null => {
  const brut = texte(valeur);
  if (brut === null) return null;
  const ms = Date.parse(brut);
  return Number.isNaN(ms) ? null : ms;
};

export const listeDeTextes = (valeur: unknown): readonly string[] =>
  Array.isArray(valeur) ? valeur.flatMap((entree) => (texte(entree) === null ? [] : [String(entree)])) : [];

export const lisLaCharge = async (reponse: Response): Promise<object | null> => {
  try {
    return objet(await reponse.json());
  } catch {
    return null;
  }
};

/** `data` de l'enveloppe `{ success, data }` — `null` dès qu'elle manque ou n'est pas un objet. */
export const donneeDe = async (reponse: Response): Promise<object | null> => {
  const corps = await lisLaCharge(reponse);
  return corps === null ? null : objet(champ(corps, 'data'));
};

/** `sendError` pose le code dans `error` ; `code` reste son champ d'appoint. */
export const codeDeRefus = (corps: object): string | null =>
  texte(champ(corps, 'error')) ?? texte(champ(corps, 'code'));

export const recupere = async (
  url: string,
  options: RequestInit,
  recuperer: Recuperateur | undefined,
): Promise<Response> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    ...options,
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
  });

/**
 * L'IDENTITÉ RÉSEAU DU VISITEUR — ce que la v3 ne peut pas se permettre de
 * garder pour elle.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TYPE EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `apps/web` appelle `POST /anonymous/join` depuis le NAVIGATEUR
 * (`hooks/use-conversation-join.ts`) : la passerelle voit l'adresse du lecteur
 * parce que le lecteur est l'appelant. La v3 appelle SERVEUR-À-SERVEUR (§ 5.1,
 * pour ne pas faire traverser l'identité du créateur), donc l'appelant est le
 * conteneur `meeshy-frontend-v3` — LE MÊME pour tout le monde.
 *
 * Ce que cela casse, mesuré côté passerelle et non supposé :
 *
 *   • `admitLinkEntry` évalue `link.allowedIpRanges.some((r) =>
 *     isIpInRange(request.ip, r))` (`services/conversations/linkAdmission.ts`).
 *     Sans transfert, le verdict devient une CONSTANTE : ou bien l'adresse du
 *     conteneur n'entre dans aucune plage et TOUT visiteur légitime reçoit
 *     `REGION_NOT_ALLOWED` — un refus que l'écran peint en non-réessayable,
 *     donc un cul-de-sac —, ou bien elle y entre et le filtre laisse passer le
 *     monde entier pendant que l'hôte du lien croit filtrer. Les deux sont
 *     faux, et le second est le pire : il ment à l'hôte.
 *   • `ipAddress: requestIp` est PERSISTÉ sur chaque `anonymousSession`
 *     (`routes/conversations/link-admission.ts`) : le signal d'abus et la piste
 *     d'audit de tout invité v3 deviendraient la même valeur.
 *   • Le limiteur de débit de la passerelle clé lui aussi sur `request.ip`
 *     (`middleware/rate-limiter.ts`) : toute la zone v3 partagerait UN seau.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX EN-TÊTES NOMMÉS, ET JAMAIS UN `...headers` AVEUGLE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Répandre les en-têtes entrants ferait partir `cookie` (la session d'un
 * lecteur CONNECTÉ de la zone legacy) et `authorization` vers une porte
 * anonyme : une élévation d'identité offerte pour un confort d'écriture. Seuls
 * les deux en-têtes que le mandataire POSE traversent, et ils traversent
 * VERBATIM.
 *
 * **Verbatim, et c'est la propriété qui compte.** Traefik APPEND l'adresse du
 * pair à `x-forwarded-for` : un client qui préfixe la chaîne lui-même déplace
 * ce qu'il écrit vers la GAUCHE, jamais vers la droite. La passerelle, elle,
 * fait confiance à `TRUST_PROXY_HOPS` maillons DEPUIS LA DROITE
 * (`config/trust-proxy.ts`) — le dernier maillon reste donc celui que notre
 * propre infrastructure a posé. Nettoyer la chaîne, la tronquer ou n'en garder
 * qu'une adresse casserait cet invariant ; la recopier telle quelle le
 * préserve, et rend l'appel serveur-à-serveur exactement équivalent à l'appel
 * navigateur du legacy (`MEESHY_GATEWAY_URL=http://gateway:3000` — aucun
 * mandataire entre les deux conteneurs, donc aucun maillon ajouté).
 */
export type IdentiteDuVisiteur = {
  /** `x-forwarded-for` tel que le mandataire l'a composé — la chaîne ENTIÈRE. */
  readonly chaineDeTransfert: string | null;
  /** `x-real-ip` : l'adresse que le mandataire attribue au visiteur. */
  readonly adresseReelle: string | null;
};

/** Ce dont la lecture a besoin — `Headers`, `ReadonlyHeaders` de Next, ou un double. */
export type EnTetesEntrants = { readonly get: (nom: string) => string | null };

export const identiteDuVisiteur = (entetes: EnTetesEntrants): IdentiteDuVisiteur => ({
  chaineDeTransfert: texte(entetes.get('x-forwarded-for')),
  adresseReelle: texte(entetes.get('x-real-ip')),
});

/**
 * Les en-têtes à poser sur l'appel sortant.
 *
 * `x-forwarded-for` est SYNTHÉTISÉ depuis `x-real-ip` quand le mandataire n'a
 * posé que celui-là : c'est la seule des deux clés que la passerelle lit pour
 * établir `request.ip`, et se taire y vaudrait exactement l'adresse du
 * conteneur. Rien n'est INVENTÉ pour autant — une requête sans aucun des deux
 * (appel direct, développement local) ne pose aucun en-tête, et la passerelle
 * lit alors la socket, ce qui est la vérité.
 */
export const enTetesDuVisiteur = (
  identite: IdentiteDuVisiteur | undefined,
): Readonly<Record<string, string>> => {
  if (identite === undefined) return {};

  const chaine = identite.chaineDeTransfert ?? identite.adresseReelle;

  return {
    ...(chaine === null ? {} : { 'x-forwarded-for': chaine }),
    ...(identite.adresseReelle === null ? {} : { 'x-real-ip': identite.adresseReelle }),
  };
};

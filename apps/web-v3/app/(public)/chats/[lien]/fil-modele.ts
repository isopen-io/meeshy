import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';

import { langueServie } from '@/lib/a11y/langue-servie';

/**
 * CE QUI SE PEINT DANS LE FIL — le modèle, avant le pixel (planche `thread`,
 * `cible/thread.png`).
 *
 * Il est ici, sous la surface qui le rend (règle de placement (B)), et il est
 * PUR : ni fetch, ni horloge, ni DOM. C'est ce qui permet aux trois lois qu'il
 * porte d'être gagées sans navigateur, là où l'écran, lui, exige un serveur, un
 * lien et un jeton.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE PRISME N'EST PAS RÉÉCRIT ICI
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La descente est UNE fonction — `resolvePrismTranslation()`
 * (`packages/shared/utils/conversation-helpers.ts`) — et ce module l'APPELLE.
 * Le corollaire 3 du § 3.2 vise nommément la famille de résolveurs trouvée dans
 * `apps/web/components/feed/ReelPlayer.tsx` : un lookup de rang 1 sans
 * normalisation, qui rate toute traduction d'un rang inférieur dès que le rang
 * 1 manque — c'est-à-dire le cas NOMINAL d'un invité dont la langue déclarée
 * n'est pas celle de l'expéditeur.
 *
 * Ce que le module ajoute, et qui n'est pas dans la descente : `lang`. C'est ce
 * qui « part À CÔTÉ » du texte résolu (cycle 123) et que le § 2 mesure comme
 * absent de `apps/web` — `TranslationToggle` n'en pose dans AUCUNE branche de
 * rendu, si bien qu'un lecteur d'écran anglais prononce une bulle française en
 * phonétique anglaise. La règle vit dans `lib/a11y/langue-servie.ts` depuis que
 * la galerie de médias en est le second consommateur (règle de placement (B)) :
 * deux comparaisons de langues recopiées divergent au premier `fr-FR`.
 */

/** Ce que la passerelle sert d'un message, une fois projeté (`lib/api/messagerie.ts`). */
export type MessageServi = {
  readonly id: string;
  readonly auteur: string;
  /** `true` quand le `senderId` est celui de la place — ce qui range la bulle à droite. */
  readonly moi: boolean;
  /** `Participant.type === 'anonymous'` — ce que la cible marque d'un fantôme. */
  readonly anonyme: boolean;
  readonly contenu: string;
  readonly langueOriginale: string | null;
  /** `langue → texte`, la forme que la descente attend. */
  readonly traductions: Readonly<Record<string, string>>;
  readonly instantMs: number;
};

export type EtatDeBulle = 'servie' | 'en-attente' | 'refusee';

export type Bulle = {
  readonly id: string;
  readonly auteur: string;
  readonly moi: boolean;
  /** L'auteur est sans compte : la cible le marque d'un fantôme et du mot « anonyme ». */
  readonly anonyme: boolean;
  readonly texte: string;
  /** La langue du texte SERVI quand elle diffère de celle du document — `null` sinon. */
  readonly langue: string | null;
  readonly instantMs: number;
  readonly etat: EtatDeBulle;
  /** Ce que le refus DIT (§ 6.3 G) : une file annulée en silence est une file perdue. */
  readonly raison: string | null;
  /**
   * Le rang de tri : 0 pour ce que la passerelle a servi, `RANG_DE_LA_FILE`
   * pour ce qui n'est pas encore parti. Un message optimiste est toujours le
   * plus récent — le dater de l'horloge du device le rangerait au mauvais
   * endroit dès que celle-ci décale (le défaut mesuré au cycle 126 sur la bulle
   * pré-enregistrée de la NSE).
   */
  readonly rang: number;
};

export const RANG_DE_LA_FILE = 1;

export const bulleServie = ({
  message,
  prisme,
  langueDuDocument,
}: {
  readonly message: MessageServi;
  readonly prisme: readonly string[];
  readonly langueDuDocument: string;
}): Bulle => {
  const resolue = resolvePrismTranslation({
    translations: message.traductions,
    originalLanguage: message.langueOriginale,
    preferredLanguages: prisme,
  });

  return {
    id: message.id,
    auteur: message.auteur,
    moi: message.moi,
    anonyme: message.anonyme,
    texte: resolue?.text ?? message.contenu,
    langue: langueServie(resolue?.language ?? message.langueOriginale, langueDuDocument),
    instantMs: message.instantMs,
    etat: 'servie',
    raison: null,
    rang: 0,
  };
};

/**
 * La bulle OPTIMISTE — celle qui s'affiche avant que le réseau n'ait dit oui
 * (« Optimistic Updates », principes non négociables).
 *
 * Elle ne porte AUCUNE langue : ce que le visiteur vient d'écrire est déjà dans
 * la sienne, et la traduction n'existe pas encore.
 */
export const bulleEnAttente = ({
  cle,
  texte,
  auteur,
  instantMs,
}: {
  readonly cle: string;
  readonly texte: string;
  readonly auteur: string;
  readonly instantMs: number;
}): Bulle => ({
  id: cle,
  auteur,
  moi: true,
  /** C'est le visiteur qui écrit, et il est sans compte : la cible le marque aussi. */
  anonyme: true,
  texte,
  langue: null,
  instantMs,
  etat: 'en-attente',
  raison: null,
  rang: RANG_DE_LA_FILE,
});

export type FilAPeindre = {
  readonly bulles: readonly Bulle[];
  /** Le séparateur « des messages manquent ici » du § 7 — peint SEULEMENT sur `hasGap`. */
  readonly lacune: boolean;
};

/**
 * L'ORDRE, et il n'est pas chronologique seul.
 *
 * Ce qui est SERVI se range par son horloge SERVEUR ; ce qui attend se range
 * après, dans son ordre d'ÉCRITURE — la file du § 7 se vide en FIFO, et
 * l'écran doit montrer cet ordre-là, sinon deux messages hors-ligne qui partent
 * dans l'ordre s'affichent dans le désordre.
 *
 * Une entrée de file dont l'identifiant a été servi entre-temps DISPARAÎT : la
 * réponse de l'envoi rend l'identifiant du serveur, et peindre les deux
 * afficherait le même message deux fois pendant le temps d'un rendu.
 */
export const filAPeindre = ({
  servis,
  enAttente,
  lacune,
}: {
  readonly servis: readonly Bulle[];
  readonly enAttente: readonly Bulle[];
  readonly lacune: boolean;
}): FilAPeindre => {
  const servisParId = new Set(servis.map((bulle) => bulle.id));

  return {
    bulles: [
      ...[...servis].sort((a, b) => a.instantMs - b.instantMs || a.id.localeCompare(b.id)),
      ...enAttente.filter((bulle) => !servisParId.has(bulle.id)),
    ],
    lacune,
  };
};

/**
 * LA FUSION D'UN DELTA — la dédup est à la charge du client, et le delta GAGNE.
 *
 * `GET /sync` RELIT parfois ce qu'on a déjà : le watermark est reculé côté
 * serveur (`SYNC_CHECKPOINT_LAG_MS`, « au pire elle en relit »). C'est la seule
 * direction sûre, et elle a un prix — la déduplication par `id` — qui se paie
 * ici plutôt que dans un composant. Le delta gagne parce qu'il porte la version
 * la plus récente d'un message ÉDITÉ.
 *
 * L'ORDRE D'ARRIVÉE est conservé pour les nouvelles bulles ; `filAPeindre`
 * retrie par horloge serveur juste après. Deux tris valent mieux qu'un ordre
 * fabriqué par une `Map` dont personne ne garantit rien.
 */
export const fusionneLesBulles = (
  precedentes: readonly Bulle[],
  delta: readonly Bulle[],
): readonly Bulle[] => {
  const parId = new Map(precedentes.map((bulle) => [bulle.id, bulle]));
  for (const bulle of delta) parId.set(bulle.id, bulle);
  return [...parId.values()];
};

/**
 * LES INITIALES de l'avatar de la cible (`cible/thread.png` : IB, MR, AD).
 *
 * Deux mots ⇒ deux initiales ; un seul ⇒ ses deux premières lettres, qui
 * distinguent « Marta » de « Marc » là où une initiale unique ne le fait pas.
 * Un nom vide rend une chaîne vide : l'avatar reste alors un disque sans
 * lettre, jamais un « ? » qui ressemblerait à une erreur de chargement.
 */
export const initiales = (auteur: string): string => {
  const mots = auteur.trim().split(/\s+/).filter((mot) => mot !== '');
  if (mots.length === 0) return '';
  if (mots.length === 1) return [...(mots[0] ?? '')].slice(0, 2).join('').toUpperCase();
  return [mots[0], mots[1]]
    .map((mot) => [...(mot ?? '')][0] ?? '')
    .join('')
    .toUpperCase();
};

/**
 * L'HEURE d'une bulle (« 12:01 » sur toutes les bulles de la cible).
 *
 * `fuseau` est le point délicat, et il est EXPLICITE plutôt que deviné. Le
 * serveur ne connaît pas le fuseau du lecteur : rendre l'heure LOCALE dans le
 * HTML puis la re-rendre côté navigateur produirait une divergence
 * d'hydratation sur chaque bulle. Le serveur rend donc `UTC` — la seule heure
 * que les deux côtés calculent pareil —, et l'îlot repasse en heure locale
 * après le montage, dans un effet, c'est-à-dire APRÈS l'hydratation.
 *
 * Ce que ça coûte, et c'est déclaré : sans JavaScript, l'heure lue est UTC. Le
 * `datetime` de l'élément `<time>`, lui, porte l'instant EXACT dans les deux
 * cas — c'est la valeur qu'une machine lit, et elle n'est jamais fausse.
 */
export const heureDe = ({
  instantMs,
  langue,
  fuseau,
}: {
  readonly instantMs: number;
  readonly langue: string;
  readonly fuseau: 'UTC' | 'locale';
}): string =>
  new Intl.DateTimeFormat(langue, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(fuseau === 'UTC' ? { timeZone: 'UTC' } : {}),
  }).format(new Date(instantMs));

const NORMALISE = (langue: string): string => langue.toLowerCase().split('-')[0] ?? langue;

/** Le dernier rang : celui que le § Prisme nomme comme repli, jamais une langue devinée. */
const REPLI = 'fr';

/**
 * LE PRISME D'UN LECTEUR ANONYME — les seuls rangs qu'il possède.
 *
 * Un invité n'a ni `systemLanguage`, ni `regionalLanguage`, ni
 * `customDestinationLanguage` : la seule langue qu'il DÉCLARE est celle du
 * champ « Langue parlée » du formulaire d'entrée, que la passerelle persiste en
 * `Participant.language`. La locale de l'appareil entre ENSUITE (règle 2 du
 * Prisme : « jamais en remplacement des préférences in-app »), puis `fr`.
 *
 * Le résultat est DÉDUPLIQUÉ et normalisé : `resolvePrismTranslation` compare
 * des langues canoniques, et un prisme `['fr','fr-FR','fr']` ferait trois tours
 * de boucle pour un seul rang.
 */
export const prismeDuLecteur = ({
  declaree,
  locale,
}: {
  readonly declaree: string | null;
  readonly locale: string | null;
}): readonly string[] => {
  const rangs = [declaree, locale, REPLI].flatMap((langue) =>
    langue === null || langue.trim() === '' ? [] : [NORMALISE(langue)],
  );

  return [...new Set(rangs)];
};

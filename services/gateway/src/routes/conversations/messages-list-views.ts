/**
 * Les QUATRE VUES de la collection de messages (#4340 critère 1).
 *
 * ## Ce que ce module change, et ce qu'il ne change pas
 *
 * Trois adresses lisaient la même collection : `GET .../messages` (chronologie
 * et fil de réponses), `GET .../messages/search` et `GET .../pinned-messages`.
 * Ce module fait de `?view=timeline|thread|pinned|search` le SÉLECTEUR de la
 * collection unique — sans retirer aucune adresse : les deux routes dédiées
 * restent servies, inchangées, et leur transformation en alias est un lot
 * suivant.
 *
 * ## Pourquoi un sélecteur, et pas trois handlers qui se ressemblent
 *
 * La mesure du 2026-09-02, faite sur le corps SÉRIALISÉ des trois routes et non
 * sur leur code, rend deux écarts qu'aucune lecture du code ne montre :
 *
 * - **Les gardes divergent.** Le refus d'un lien de partage ÉCHU
 *   (403 `SHARE_LINK_EXPIRED`) n'existe QUE sur `GET .../messages`. Ni la
 *   recherche ni la liste des épinglés ne lit `expiresAt` : elles lisent le
 *   lien pour son seul `allowViewHistory` (`loadReaderHistoryFloor`), ce qui
 *   rétrécit une LECTURE sans jamais fermer la PORTE. Un invité dont le lien
 *   est mort ne peut plus lire le fil, et peut toujours en chercher un mot ou
 *   en lire les épingles.
 * - **La forme diverge.** Un résultat de recherche ne porte NI `isViewOnce`,
 *   NI `isBlurred`, NI `expiresAt`, NI `attachments`, NI `deletedAt` — son
 *   `select` ne les demande pas. Les drapeaux qui disent à un client qu'un
 *   message est PROTÉGÉ n'atteignent donc pas la surface de recherche. Et son
 *   `reactionCount` vaut toujours `0` : c'est le `default` du schéma partagé,
 *   jamais un comptage, la route ne sélectionnant pas `_count`.
 *
 * Un paramètre `view` qui se contenterait de router vers ces trois formes
 * n'aurait rien unifié. Les quatre vues passent donc par le MÊME `select`, le
 * MÊME sérialiseur et les MÊMES gardes que la chronologie ; ce module ne rend
 * que ce qui les distingue vraiment — un prédicat, un ordre, et la façon de
 * résoudre l'ensemble cherché.
 *
 * ## Le rang de `?replyToId=`
 *
 * `view=thread&parentId=X` et `?replyToId=X` désignent la même sous-collection,
 * et le vérifier fait partie du lot : les deux rendent le même corps, champ
 * pour champ (`messages-collection-view-parity.test.ts`). `replyToId` reste
 * accepté — `ThreadRepliesLoader.swift` l'envoie en production — et il n'y a
 * donc rien à migrer côté client.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { applyPersonalHistoryHiding, type PersonalHistoryHiding } from '../../services/personalHistoryFilter';

/** Les quatre sous-collections que `?view=` sait désigner. */
export type CollectionView = 'timeline' | 'thread' | 'pinned' | 'search';

const VUES: readonly CollectionView[] = ['timeline', 'thread', 'pinned', 'search'];

/** La longueur minimale d'un terme de recherche — celle du schéma de `…/messages/search`. */
const LONGUEUR_MINIMALE_RECHERCHE = 2;

/**
 * Ce que la vue apporte à la requête, et rien d'autre.
 *
 * `predicate` s'AJOUTE au `where` de la route (conversation, `deletedAt`,
 * plancher, curseur) : il ne le remplace jamais, et il est posé à l'identique
 * sur la page ET sur le COUNT — un prédicat appliqué à l'une et pas à l'autre
 * est exactement le défaut que #4177 a corrigé pour `replyToId`, où `hasMore`
 * promettait des pages que la page suivante ne pouvait pas servir.
 *
 * `allowsAround` dit ce que la fenêtre `?around=` peut faire de la vue : elle
 * construit une liste d'identifiants (`id: { in: [...] }`) sans connaître le
 * prédicat, donc elle remplirait ses deux moitiés de messages qui n'y
 * appartiennent pas, puis les perdrait au filtrage — une fenêtre qui rend moins
 * que demandé sans le dire. La recherche, elle, utilise déjà cette même case.
 */
export type VueResolue = {
  readonly genre: 'ok';
  readonly view: CollectionView;
  readonly predicate: Readonly<Record<string, unknown>>;
  readonly orderBy: Readonly<Record<string, 'asc' | 'desc'>>;
  readonly allowsAround: boolean;
  /** Présent pour `view=search` seulement : le terme, normalisé en minuscules. */
  readonly searchTerm?: string;
};

/** Un refus de VALIDATION, que la route traduit en 400 en nommant le paramètre manquant. */
export type VueRefusee = { readonly genre: 'refus'; readonly message: string };

export type ResolutionDeVue = VueResolue | VueRefusee;

export type ParametresDeVue = {
  readonly view?: string;
  readonly parentId?: string;
  readonly replyToId?: string;
  readonly q?: string;
};

const CHRONOLOGIE: VueResolue = {
  genre: 'ok',
  view: 'timeline',
  predicate: {},
  orderBy: { createdAt: 'desc' },
  allowsAround: true,
};

/**
 * Traduit la querystring en vue.
 *
 * `view` n'est PAS validé par un `enum` de schéma : Fastify refuserait alors la
 * valeur avec sa propre enveloppe d'erreur (`{ statusCode, code, error,
 * message }`), qui ne porte pas `success: false` et qu'aucun client de ce
 * dépôt ne sait lire comme un refus applicatif. Le refus est donc rendu ici, et
 * la route le sert avec `sendBadRequest` — la même enveloppe que tous ses
 * autres refus.
 */
export function resolveCollectionView(params: ParametresDeVue): ResolutionDeVue {
  const demandee = params.view?.trim();

  // Sans `?view=`, `?replyToId=` reste le moyen historique de demander le fil
  // d'un message. Il désigne la MÊME sous-collection que `view=thread`.
  if (!demandee) {
    return params.replyToId ? filDeReponses(params.replyToId) : CHRONOLOGIE;
  }

  if (!(VUES as readonly string[]).includes(demandee)) {
    return { genre: 'refus', message: `Unknown view "${demandee}". Expected one of: ${VUES.join(', ')}` };
  }

  const view = demandee as CollectionView;

  if (view === 'thread') {
    const parent = params.parentId?.trim() || params.replyToId?.trim();
    if (!parent) return { genre: 'refus', message: 'view=thread requires parentId' };
    return filDeReponses(parent);
  }

  // `?replyToId=` sur une vue qui n'est PAS le fil est une CONTRADICTION, et
  // elle se refuse plutôt que de se perdre. Servir la chronologie en jetant le
  // filtre en silence est exactement le défaut de #4177 — AJV retirait
  // `replyToId` avant le handler, et ouvrir un fil sur iOS chargeait les
  // cinquante derniers messages de la conversation ENTIÈRE. Un paramètre de
  // SÉLECTION qui disparaît sans le dire coûte toujours la même chose : le
  // client croit avoir demandé une sous-collection et en reçoit une autre, de
  // la bonne forme et de la bonne taille.
  if (params.replyToId?.trim()) {
    return { genre: 'refus', message: `view=${view} cannot be combined with replyToId (use view=thread)` };
  }

  if (view === 'timeline') return CHRONOLOGIE;

  if (view === 'pinned') {
    return {
      genre: 'ok',
      view,
      predicate: { pinnedAt: { not: null } },
      // Même ordre que `GET .../pinned-messages` : la dernière épingle posée
      // d'abord, jamais le dernier message écrit.
      orderBy: { pinnedAt: 'desc' },
      allowsAround: false,
    };
  }

  const terme = params.q?.trim().toLowerCase() ?? '';
  if (terme.length < LONGUEUR_MINIMALE_RECHERCHE) {
    return {
      genre: 'refus',
      message: `view=search requires q (at least ${LONGUEUR_MINIMALE_RECHERCHE} characters)`,
    };
  }
  return {
    genre: 'ok',
    view: 'search',
    // Le prédicat de la recherche n'est pas exprimable en une clause Prisma :
    // les traductions sont une CARTE Mongo qu'aucun opérateur ne fouille. Il
    // est donc résolu en amont, en un ensemble d'identifiants — voir
    // `resolveSearchMessageIds`.
    predicate: {},
    orderBy: { createdAt: 'desc' },
    allowsAround: false,
    searchTerm: terme,
  };
}

function filDeReponses(parentId: string): VueResolue {
  return {
    genre: 'ok',
    view: 'thread',
    predicate: { replyToId: parentId },
    orderBy: { createdAt: 'desc' },
    allowsAround: true,
  };
}

/**
 * Les propriétés que `?view=` ajoute au schéma de querystring de la route.
 *
 * Tenues ICI plutôt qu'étalées dans le schéma de la route : la forme du
 * paramètre et la règle qui le lit vivent alors dans le même fichier — c'est la
 * projection trop étroite, pas l'appel manquant, qui rend une règle
 * inapplicable en aval sans qu'aucun témoin ne rougisse (AJV `removeAdditional`
 * retire en silence tout paramètre non déclaré, ce qui est exactement ce qui
 * avait rendu `?replyToId=` inopérant pendant des mois).
 */
export const MESSAGES_VIEW_QUERY_PROPERTIES = {
  view: {
    type: 'string',
    description:
      "#4340 — sous-collection lue : 'timeline' (défaut), 'thread' (avec parentId), 'pinned', 'search' (avec q). Les quatre passent par les mêmes gardes et le même sérialiseur. Une valeur inconnue est refusée en 400 plutôt que servie comme la chronologie.",
  },
  parentId: {
    type: 'string',
    description: "#4340 — requis par view=thread : le message dont on lit les réponses. Synonyme de replyToId, qui reste accepté.",
  },
  q: {
    type: 'string',
    description: '#4340 — requis par view=search : le terme cherché dans le contenu ET les traductions (2 caractères minimum).',
  },
} as const;

export type EnsembleDeRechercheParams = {
  /** Le `where` déjà construit par la route : conversation, `deletedAt`, plancher, curseur. */
  readonly base: Record<string, unknown>;
  readonly hiding: PersonalHistoryHiding;
  readonly term: string;
  /** Taille de page demandée, `offset` compris — plus une ligne de sonde. */
  readonly wanted: number;
};

/**
 * Le nombre de messages TRADUITS parcourus pour y chercher le terme.
 *
 * Repris tel quel de `GET .../messages/search`, pour que les deux surfaces
 * trouvent le même ensemble : une borne différente ferait diverger deux
 * réponses que ce lot promet identiques.
 */
const CANDIDATS_TRADUITS = 200;

/**
 * Résout l'ensemble cherché en identifiants — le prédicat que Prisma ne sait
 * pas écrire.
 *
 * `Message.translations` est une carte `langue → { text }` : aucun opérateur
 * Mongo ne la fouille, donc la recherche se fait en deux temps, comme sur la
 * route dédiée — les correspondances de CONTENU en base, les correspondances de
 * TRADUCTION en mémoire sur un lot borné.
 *
 * Les DEUX requêtes reçoivent la base complète de la route (plancher et masquage
 * personnel compris) : c'est ici que se joue la garde, pas dans le `findMany`
 * final. Une recherche est la surface la plus révélatrice d'un historique
 * effacé — elle rend un message par son CONTENU, donc en connaître un mot
 * suffit.
 */
type LigneTrouvee = { readonly id: string; readonly createdAt: Date; readonly translations?: unknown };

export async function resolveSearchMessageIds(
  prisma: Pick<PrismaClient, 'message'>,
  { base, hiding, term, wanted }: EnsembleDeRechercheParams
): Promise<string[]> {
  const [parContenu, candidatsTraduits] = (await Promise.all([
    prisma.message.findMany({
      where: applyPersonalHistoryHiding({ ...base, content: { contains: term, mode: 'insensitive' } }, hiding),
      orderBy: { createdAt: 'desc' },
      take: wanted,
      select: { id: true, createdAt: true },
    }),
    prisma.message.findMany({
      where: applyPersonalHistoryHiding(
        {
          ...base,
          NOT: { content: { contains: term, mode: 'insensitive' } },
          translations: { not: { equals: null } },
        },
        hiding
      ),
      orderBy: { createdAt: 'desc' },
      take: CANDIDATS_TRADUITS,
      select: { id: true, createdAt: true, translations: true },
    }),
  ])) as unknown as [ReadonlyArray<LigneTrouvee>, ReadonlyArray<LigneTrouvee>];

  const vus = new Set<string>(parContenu.map((m) => m.id));
  const fusion: LigneTrouvee[] = [...parContenu];
  for (const candidat of candidatsTraduits) {
    if (vus.has(candidat.id)) continue;
    if (!traductionContient(candidat.translations, term)) continue;
    vus.add(candidat.id);
    fusion.push(candidat);
  }

  fusion.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return fusion.map((m) => m.id);
}

/** Une traduction porte son texte sous `text` ou `content`, ou EST le texte. */
function traductionContient(translations: unknown, term: string): boolean {
  if (!translations || typeof translations !== 'object') return false;
  return Object.values(translations as Record<string, unknown>).some((valeur) => {
    if (typeof valeur === 'string') return valeur.toLowerCase().includes(term);
    if (!valeur || typeof valeur !== 'object') return false;
    const entree = valeur as { text?: unknown; content?: unknown };
    const texte = typeof entree.text === 'string' ? entree.text : typeof entree.content === 'string' ? entree.content : '';
    return texte.toLowerCase().includes(term);
  });
}

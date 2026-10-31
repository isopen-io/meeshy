/**
 * LE LIEN ENTRE DEUX PERSONNES — l'échelle des niveaux (#13926, cercles de proximité).
 *
 * Chaque personne ACCORDE un niveau à l'autre ; le niveau EFFECTIF est le
 * minimum des deux accords (RG-01 : aucun accès à sens unique). Ce module ne
 * porte que l'échelle, son ordre et la clé de paire : la LOI d'accès (qui voit
 * quoi à quel niveau) est `resolveRelationAccess`, un autre lot.
 *
 * `ATOM` (lien parent/tuteur vérifié) est RÉSERVÉ : il n'appartient pas à
 * l'échelle accordable au MVP, et toute valeur stockée qu'on ne reconnaît pas
 * se lit `PUBLIC` — jamais un niveau plus haut (fail-closed).
 *
 * Source de vérité TS ; les miroirs Swift (`MeeshySDK/.../Relations`) et Kotlin
 * (`core/model/.../relation`) arrivent avec la loi d'accès.
 */

export const RELATION_LEVELS = ['PUBLIC', 'COMMUNITY', 'ACQUAINTANCE', 'FRIEND', 'CLOSE', 'BLOOD'] as const;

export type RelationLevel = (typeof RELATION_LEVELS)[number];

export const RELATION_LEVEL_ATOM = 'ATOM' as const;

const RANK: Readonly<Record<RelationLevel, number>> = {
  PUBLIC: 0,
  COMMUNITY: 1,
  ACQUAINTANCE: 2,
  FRIEND: 3,
  CLOSE: 4,
  BLOOD: 5,
};

const isRelationLevel = (value: unknown): value is RelationLevel =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(RANK, value);

export const parseRelationLevel = (value: unknown): RelationLevel => (isRelationLevel(value) ? value : 'PUBLIC');

export const compareRelationLevel = (a: RelationLevel, b: RelationLevel): number => RANK[a] - RANK[b];

export const minRelationLevel = (a: RelationLevel, b: RelationLevel): RelationLevel =>
  compareRelationLevel(a, b) <= 0 ? a : b;

export const maxRelationLevel = (a: RelationLevel, b: RelationLevel): RelationLevel =>
  compareRelationLevel(a, b) >= 0 ? a : b;

/**
 * Parse une valeur servie et rend son niveau si elle atteint `min`, sinon `null`.
 * Le seul moyen, pour un consommateur hors de la loi d'accès, de tester un
 * seuil sans réimporter `parseRelationLevel`/`compareRelationLevel` (garde
 * `relation-access-single-site-guard.test.ts`, clause 2).
 */
export const relationLevelIfAtLeast = (value: unknown, min: RelationLevel): RelationLevel | null => {
  const level = parseRelationLevel(value);
  return compareRelationLevel(level, min) >= 0 ? level : null;
};

/**
 * Les crans qui se DEMANDENT (#13933) : Connaissance, Ami, Proche, Sang. Public et
 * Communauté ne se demandent pas (le premier est l'absence de lien, le second est
 * calculé), Atome est réservé. Toute autre valeur est illisible, jamais un cran.
 */
export const RELATION_REQUEST_LEVELS = ['ACQUAINTANCE', 'FRIEND', 'CLOSE', 'BLOOD'] as const;

export type RelationRequestLevel = (typeof RELATION_REQUEST_LEVELS)[number];

export const parseRequestLevel = (value: unknown): RelationRequestLevel | null =>
  (RELATION_REQUEST_LEVELS as readonly unknown[]).includes(value) ? (value as RelationRequestLevel) : null;

/**
 * Le seul cran qu'une demande peut viser depuis `level` : on monte cran par cran,
 * on ne saute jamais une phase (RG-03). `null` au sommet.
 */
export const relationRungAfter = (level: RelationLevel): RelationRequestLevel | null => {
  if (level === 'PUBLIC' || level === 'COMMUNITY') return 'ACQUAINTANCE';
  if (level === 'ACQUAINTANCE') return 'FRIEND';
  if (level === 'FRIEND') return 'CLOSE';
  if (level === 'CLOSE') return 'BLOOD';
  return null;
};

/**
 * Le niveau qu'une demande ACCEPTÉE puis défaite laisse derrière elle (#13933) :
 * Proche et Sang retombent d'un cran, Ami et Connaissance quittent le cercle (le
 * sens historique de « retirer l'ami »).
 */
export const relationLevelBelow = (level: RelationRequestLevel): RelationLevel => {
  if (level === 'BLOOD') return 'CLOSE';
  if (level === 'CLOSE') return 'FRIEND';
  return 'PUBLIC';
};

/** `candidate` retient-il un lien que `removed` fondait ? Vrai quand il vise le même cran ou un cran au-dessus. */
export const requestLevelSustains = (candidate: RelationRequestLevel, removed: RelationRequestLevel): boolean =>
  RANK[candidate] >= RANK[removed];

export type RelationPairKey = { readonly userLowId: string; readonly userHighId: string };

/**
 * Une ligne par paire NON orientée. Les ObjectId font 24 caractères hexadécimaux
 * minuscules : l'ordre lexicographique est donc l'ordre low/high.
 */
export function relationPairKey(a: string, b: string): RelationPairKey {
  if (!a || !b || a === b) throw new Error('relationPairKey: deux identifiants distincts sont requis');
  return a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a };
}

export type RelationSide = 'low' | 'high';

export const relationSideOf = (pair: RelationPairKey, userId: string): RelationSide | null => {
  if (userId === pair.userLowId) return 'low';
  if (userId === pair.userHighId) return 'high';
  return null;
};

export type RelationTransition = {
  readonly actorId: string;
  readonly from: RelationLevel;
  readonly to: RelationLevel;
  readonly at: Date;
};

export const isRelationDrop = (transition: Pick<RelationTransition, 'from' | 'to'>): boolean =>
  compareRelationLevel(transition.to, transition.from) < 0;

const isLegible = (t: RelationTransition): boolean => isRelationLevel(t.from) && isRelationLevel(t.to);

/**
 * Ce qu'un client a le droit de lire de l'historique : une suite de MONTÉES,
 * CONTINUE par acteur (le `to` d'un passage est le `from` du suivant).
 *
 * Une baisse, une sortie ou un refus sont silencieux (RG-07). Les écarter ne
 * suffit pas : une remontée garderait son `from` réel, et la discontinuité
 * (« CLOSE » puis « ACQUAINTANCE>FRIEND ») trahirait la baisse. La suite est
 * donc RECALCULÉE : chaque acteur part de son premier niveau lu, et un passage
 * n'est servi que s'il dépasse le plus haut niveau déjà servi, depuis ce
 * niveau. Une remontée sous ce plafond, comme la baisse qui la précède, ne se
 * voit pas. Un passage dont un niveau est illisible est écarté.
 *
 * `UserRelation.levelSince` bouge aussi à une baisse : il ne se sert jamais
 * brut, pour la même raison.
 */
export const visibleRelationTransitions = (transitions: ReadonlyArray<RelationTransition>): RelationTransition[] => {
  const ordered = transitions.filter(isLegible).slice().sort((a, b) => a.at.getTime() - b.at.getTime());
  const ceilings = new Map<string, RelationLevel>();
  return ordered.flatMap((t) => {
    const ceiling = ceilings.get(t.actorId) ?? t.from;
    if (compareRelationLevel(t.to, ceiling) <= 0) {
      ceilings.set(t.actorId, ceiling);
      return [];
    }
    ceilings.set(t.actorId, t.to);
    return [{ ...t, from: ceiling }];
  });
};

/**
 * Depuis quand la paire est-elle au niveau `level` au moins — lu dans les seules
 * MONTÉES visibles (#13933). `levelSince` bouge aussi à une baisse : il ne se sert
 * jamais brut (une baisse est silencieuse, RG-07). Chaque acteur compte à son
 * premier passage visible vers `level` ou au-dessus ; le niveau effectif n'est
 * atteint que quand les DEUX y sont, d'où le plus tardif. `null` quand rien de
 * lisible ne le dit.
 */
export const relationEntryDate = (transitions: ReadonlyArray<RelationTransition>, level: RelationLevel): Date | null => {
  const reaching = visibleRelationTransitions(transitions).filter((t) => RANK[t.to] >= RANK[level]);
  const firstByActor = new Map<string, Date>();
  reaching.forEach((t) => {
    if (!firstByActor.has(t.actorId)) firstByActor.set(t.actorId, t.at);
  });
  const dates = [...firstByActor.values()].map((d) => d.getTime());
  return dates.length === 0 ? null : new Date(Math.max(...dates));
};

/**
 * La Rivière — géométrie des couloirs et navigation à deux axes.
 *
 * Loi pure : aucune I/O, aucun pixel, aucun `Date.now()` (les horodatages
 * viennent des messages). Les peaux (Canvas/Path SwiftUI, overlay SVG web,
 * Compose) consomment cette loi, jamais l'inverse — la géométrie de la
 * rivière ne se recalcule pas à façon par plateforme (garde R15).
 *
 * ── Ce que la Rivière est ──
 * Une conversation à plusieurs lue sur DEUX axes :
 *   - **vertical** : le temps. Un `rank` par message, ordre chronologique
 *     global, strictement celui du DOM et de VoiceOver (les traits sont
 *     décoratifs, le contenu prime).
 *   - **horizontal** : les interlocuteurs. Un `laneIndex` par branche.
 * Les deux axes se PARCOURENT (`resolveRiverStep`) : descendre suit une
 * personne, traverser change d'interlocuteur sans quitter l'instant.
 *
 * ── Ce qu'une branche est ──
 * Pas une ligne infinie : une SUITE DE SEGMENTS. Une branche NAÎT à la
 * première interaction de son propriétaire, COURT tant que la conversation
 * l'entretient, MEURT `silenceWindowMs` après sa dernière interaction, et
 * RENAÎT plus tard dans LA MÊME COLONNE. C'est la forme voulue : « les
 * interlocuteurs ont leurs branches qui apparaissent et disparaissent selon
 * les interactions » (directive produit du 2026-08-17).
 *
 * @see tasks/lentille-workshop-execution.md §7 (amendement R), §7bis (amendement R2)
 * @see docs/design/2026-08-15-conversation-modes-verdict.html (le procès gagné)
 */

/** Un message tel que la Rivière a besoin de le connaître — rien de plus. */
export type RiverMessageInput = {
  readonly id: string;
  readonly senderId: string;
  readonly createdAt: Date | string | number;
  /** `null`/absent = message racine. Une cible hors fenêtre ne produit AUCUN connecteur. */
  readonly replyToMessageId?: string | null;
};

/**
 * Un participant. `displayName` sert de GRAINE DE COULEUR — c'est lui que la
 * peau passe à `DynamicColorGenerator.colorForName` (iOS/web/Android l'ont
 * déjà). La loi ne calcule aucune couleur : elle nomme la graine.
 */
export type RiverParticipantInput = {
  readonly id: string;
  readonly displayName: string;
};

export type ResolveRiverLanesInput = {
  readonly messages: readonly RiverMessageInput[];
  readonly participants: readonly RiverParticipantInput[];
  /** Le lecteur. Sa branche, quand elle existe, tient la colonne 0 (la rive). */
  readonly viewerId: string;
  /** Défaut `RIVER_LANE_SILENCE_WINDOW_MS`. Fourni par l'appelant, jamais réécrit en dur par une peau. */
  readonly silenceWindowMs?: number;
};

/**
 * `bubble` = son propriétaire a écrit ici, la ligne CONTOURNE la bulle et
 * poursuit sa course (le bord de la bulle EST un segment de la ligne).
 * `addressed` = on lui a répondu ici : sa branche reparaît pour recevoir le
 * connecteur, sans bulle à elle.
 */
export type RiverNodeKind = 'bubble' | 'addressed';

export type RiverNode = {
  readonly rank: number;
  readonly kind: RiverNodeKind;
  /** Le message QUI CAUSE ce nœud : la bulle elle-même, ou la réponse qui interpelle. */
  readonly messageId: string;
};

/**
 * Un segment de branche : de sa naissance à sa mort. `isOpen` distingue « la
 * branche est encore vivante au bas de la fenêtre » (aucun estompage à
 * dessiner — on ne sait pas encore) de « elle s'est éteinte ici » (estompage).
 */
export type RiverLaneSpan = {
  readonly startRank: number;
  readonly endRank: number;
  readonly isOpen: boolean;
  readonly nodes: readonly RiverNode[];
};

export type RiverLane = {
  readonly laneId: string;
  /** Colonne RÉSERVÉE à vie : une branche morte garde la sienne, une naissance ne déplace personne. */
  readonly laneIndex: number;
  readonly isViewer: boolean;
  readonly colorSeed: string;
  readonly spans: readonly RiverLaneSpan[];
};

export type RiverBubble = {
  readonly messageId: string;
  readonly laneId: string;
  readonly laneIndex: number;
  readonly rank: number;
  /** L'heure vit en base de bulle (amendement R) — la loi la sert, la peau la formate. */
  readonly createdAtMs: number;
  readonly isViewer: boolean;
  readonly replyToMessageId: string | null;
};

export type RiverConnector = {
  readonly fromMessageId: string;
  readonly toMessageId: string;
  readonly fromLaneIndex: number;
  readonly toLaneIndex: number;
  readonly fromRank: number;
  readonly toRank: number;
};

export type RiverGeometry = {
  readonly lanes: readonly RiverLane[];
  /** Ordre chronologique STRICT — c'est aussi l'ordre du DOM et de VoiceOver. */
  readonly bubbles: readonly RiverBubble[];
  readonly connectors: readonly RiverConnector[];
  readonly rankCount: number;
  readonly laneCount: number;
  readonly silenceWindowMs: number;
};

/**
 * Fenêtre de silence au bout de laquelle une branche s'éteint : 30 minutes.
 *
 * C'est la durée d'un « instant de conversation » — au-delà, la personne n'est
 * plus dans l'échange, et garder son trait à l'écran mentirait sur sa présence.
 * Seul nombre de cette loi qui relève d'un arbitrage produit : il se règle par
 * `silenceWindowMs`, jamais en dupliquant la constante.
 */
export const RIVER_LANE_SILENCE_WINDOW_MS = 30 * 60 * 1000;

type PlacedMessage = {
  readonly id: string;
  readonly senderId: string;
  readonly timeMs: number;
  readonly replyToMessageId: string | null;
  readonly rank: number;
};

/**
 * Interne : un nœud PLUS son horodatage. Le temps sert à découper les
 * segments ; il ne ressort pas en `RiverNode` (une bulle porte son heure, un
 * nœud de tracé n'en a pas besoin).
 */
type EngagementEvent = {
  readonly rank: number;
  readonly kind: RiverNodeKind;
  readonly messageId: string;
  readonly timeMs: number;
};

/** Un segment en construction, toujours NON VIDE — d'où `first`/`last` explicites. */
type Burst = {
  readonly first: EngagementEvent;
  readonly last: EngagementEvent;
  readonly events: readonly EngagementEvent[];
};

const toNode = (event: EngagementEvent): RiverNode => ({
  rank: event.rank,
  kind: event.kind,
  messageId: event.messageId,
});

const toEpochMs = (value: Date | string | number): number =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Ordre du fleuve : le temps, puis l'identifiant à égalité d'horodatage — pour
 * que deux plateformes qui reçoivent le même lot dessinent la MÊME rivière.
 */
const byTimeThenId = (a: { timeMs: number; id: string }, b: { timeMs: number; id: string }): number =>
  a.timeMs - b.timeMs || compareStrings(a.id, b.id);

/**
 * Un message dont l'horodatage est illisible est ÉCARTÉ : l'axe vertical EST
 * le temps, et une bulle sans place dans le temps n'a pas de rang. Même parti
 * pris défensif que `getUserPresenceStatus` / `resolveOrchestratorDecision`
 * face à une horloge NaN — écarter, jamais inventer.
 */
const placeMessages = (messages: readonly RiverMessageInput[]): readonly PlacedMessage[] =>
  messages
    .map((message) => ({
      id: message.id,
      senderId: message.senderId,
      timeMs: toEpochMs(message.createdAt),
      replyToMessageId: message.replyToMessageId ?? null,
    }))
    .filter((message) => !Number.isNaN(message.timeMs))
    .sort(byTimeThenId)
    .map((message, rank) => ({ ...message, rank }));

/**
 * Les interactions qui font vivre une branche : écrire (`bubble`) et se voir
 * répondre (`addressed`). « On vit tant qu'on parle — ou qu'on vous parle. »
 * Les réactions rejoindront cette liste par l'ENTRÉE de la loi le jour où
 * elles arriveront aux clients, pas par une seconde loi.
 */
const collectEngagements = (
  placed: readonly PlacedMessage[],
): ReadonlyMap<string, readonly EngagementEvent[]> => {
  const senderById = new Map(placed.map((message) => [message.id, message.senderId]));

  return placed.reduce<Map<string, readonly EngagementEvent[]>>((engagements, message) => {
    const push = (participantId: string, event: EngagementEvent): void => {
      engagements.set(participantId, [...(engagements.get(participantId) ?? []), event]);
    };

    push(message.senderId, {
      rank: message.rank,
      kind: 'bubble',
      messageId: message.id,
      timeMs: message.timeMs,
    });

    const addressee =
      message.replyToMessageId === null ? undefined : senderById.get(message.replyToMessageId);
    if (addressee !== undefined && addressee !== message.senderId) {
      push(addressee, {
        rank: message.rank,
        kind: 'addressed',
        messageId: message.id,
        timeMs: message.timeMs,
      });
    }

    return engagements;
  }, new Map());
};

/**
 * Découpe les interactions d'un participant en segments de branche.
 *
 * Deux règles, et elles sont le cœur de l'amendement R2 :
 *   1. **Un segment se coupe** quand le propriétaire a laissé passer plus de
 *      `silenceWindowMs` entre deux de ses interactions.
 *   2. **Un segment SURVIT à ses propres bulles** : il court jusqu'au dernier
 *      rang de la conversation encore contenu dans la fenêtre qui suit sa
 *      dernière interaction. Sans cette règle, une branche ne serait qu'un
 *      point à chaque message et la rivière n'aurait aucune largeur navigable
 *      — c'est ce qui fait que plusieurs lignes courent COTE À CÔTE pendant un
 *      même instant, puis s'éteignent l'une après l'autre.
 */
const toSpans = (
  events: readonly EngagementEvent[],
  rankTimes: readonly number[],
  silenceWindowMs: number,
): readonly RiverLaneSpan[] => {
  const bursts = [...events]
    .sort((a, b) => a.rank - b.rank)
    .reduce<readonly Burst[]>((groups, event) => {
      const current = groups[groups.length - 1];
      const isBreak = current === undefined || event.timeMs - current.last.timeMs > silenceWindowMs;

      return isBreak
        ? [...groups, { first: event, last: event, events: [event] }]
        : [
            ...groups.slice(0, -1),
            { first: current.first, last: event, events: [...current.events, event] },
          ];
    }, []);

  const lastRank = rankTimes.length - 1;

  return bursts.map((burst) => {
    const deathTime = burst.last.timeMs + silenceWindowMs;
    // Les rangs sont triés par le temps : ceux qui précèdent la mort forment un
    // PRÉFIXE, d'où un simple comptage plutôt qu'une recherche indexée.
    const reachedRank = rankTimes.filter((time) => time <= deathTime).length - 1;
    const endRank = Math.max(burst.last.rank, reachedRank);

    return {
      startRank: burst.first.rank,
      endRank,
      isOpen: endRank === lastRank,
      nodes: burst.events.map(toNode),
    };
  });
};

/**
 * Ordre des colonnes — et il est RÉSERVÉ, jamais recalculé sur les vivants du
 * moment : le lecteur d'abord (colonne 0, la rive depuis laquelle il regarde,
 * pour que le pas latéral part toujours de chez lui), puis les autres par
 * ordre de naissance, l'identifiant tranchant les naissances simultanées. Une
 * branche qui meurt garde sa colonne ; une branche qui naît en prend une
 * nouvelle sans déplacer personne — sinon la rivière tremblerait latéralement
 * à chaque arrivée.
 */
const orderLaneIds = (
  engagements: ReadonlyMap<string, readonly EngagementEvent[]>,
  viewerId: string,
): readonly string[] =>
  [...engagements.keys()]
    .map((laneId) => ({
      laneId,
      isViewer: laneId === viewerId,
      birthRank: Math.min(...(engagements.get(laneId) ?? []).map((event) => event.rank)),
    }))
    .sort(
      (a, b) =>
        Number(b.isViewer) - Number(a.isViewer) ||
        a.birthRank - b.birthRank ||
        compareStrings(a.laneId, b.laneId),
    )
    .map((lane) => lane.laneId);

/**
 * Géométrie complète de la Rivière pour une fenêtre de messages : les
 * branches et leurs segments, les bulles dans l'ordre du temps, les
 * connecteurs de réponse. Zéro pixel — la peau multiplie par ses tokens.
 */
export function resolveRiverLanes(input: ResolveRiverLanesInput): RiverGeometry {
  const silenceWindowMs = input.silenceWindowMs ?? RIVER_LANE_SILENCE_WINDOW_MS;
  const placed = placeMessages(input.messages);
  const rankTimes = placed.map((message) => message.timeMs);
  const engagements = collectEngagements(placed);
  const laneIds = orderLaneIds(engagements, input.viewerId);

  const seedByParticipantId = new Map(
    input.participants.map((participant) => [participant.id, participant.displayName]),
  );

  const lanes: readonly RiverLane[] = laneIds.map((laneId, laneIndex) => ({
    laneId,
    laneIndex,
    isViewer: laneId === input.viewerId,
    // Un participant sorti du groupe n'a plus de nom à servir de graine : son
    // identifiant en tient lieu, plutôt qu'une branche sans couleur.
    colorSeed: seedByParticipantId.get(laneId) ?? laneId,
    spans: toSpans(engagements.get(laneId) ?? [], rankTimes, silenceWindowMs),
  }));

  const laneIndexById = new Map(lanes.map((lane) => [lane.laneId, lane.laneIndex]));
  const placedById = new Map(placed.map((message) => [message.id, message]));

  const bubbles: readonly RiverBubble[] = placed.map((message) => ({
    messageId: message.id,
    laneId: message.senderId,
    laneIndex: laneIndexById.get(message.senderId) ?? 0,
    rank: message.rank,
    createdAtMs: message.timeMs,
    isViewer: message.senderId === input.viewerId,
    replyToMessageId: message.replyToMessageId,
  }));

  /**
   * Un connecteur ne pend JAMAIS dans le vide : une cible hors fenêtre (ou
   * effacée) n'a ni rang ni couloir, donc pas de trait. Une réponse à
   * soi-même en garde un — c'est une donnée vraie, la peau la boucle dans son
   * propre couloir.
   */
  const connectors: readonly RiverConnector[] = placed.flatMap((message) => {
    const target =
      message.replyToMessageId === null ? undefined : placedById.get(message.replyToMessageId);
    if (target === undefined) return [];

    return [
      {
        fromMessageId: message.id,
        toMessageId: target.id,
        fromLaneIndex: laneIndexById.get(message.senderId) ?? 0,
        toLaneIndex: laneIndexById.get(target.senderId) ?? 0,
        fromRank: message.rank,
        toRank: target.rank,
      },
    ];
  });

  return {
    lanes,
    bubbles,
    connectors,
    rankCount: placed.length,
    laneCount: lanes.length,
    silenceWindowMs,
  };
}

const spanCovering = (lane: RiverLane, rank: number): RiverLaneSpan | undefined =>
  lane.spans.find((span) => span.startRank <= rank && rank <= span.endRank);

/**
 * Les branches VIVANTES à ce rang, par colonne croissante. C'est la largeur
 * réelle de l'axe horizontal à cette hauteur : ce que la peau dessine, et ce
 * que la navigation latérale traverse. Une branche morte n'est pas navigable —
 * on l'enjambe.
 */
export function resolveRiverLivingLanes(geometry: RiverGeometry, rank: number): readonly number[] {
  return geometry.lanes
    .filter((lane) => spanCovering(lane, rank) !== undefined)
    .map((lane) => lane.laneIndex);
}

export type RiverCursor = {
  readonly laneIndex: number;
  readonly rank: number;
};

export type RiverStepDirection = 'left' | 'right' | 'up' | 'down';

/**
 * `moved` — le curseur a bougé. `edge` — bord de l'axe dans cette direction,
 * le curseur ne bouge pas (la peau y colle son rebond). `empty` — il n'y a
 * rien à parcourir (rivière vide, ou colonne inexistante) : la loi rend le
 * curseur reçu plutôt que d'en inventer un.
 */
export type RiverStepReason = 'moved' | 'edge' | 'empty';

export type RiverStep = {
  readonly cursor: RiverCursor;
  readonly reason: RiverStepReason;
};

export type ResolveRiverStepInput = {
  readonly geometry: RiverGeometry;
  readonly cursor: RiverCursor;
  readonly direction: RiverStepDirection;
};

const bubbleRanksOf = (lane: RiverLane): readonly number[] =>
  lane.spans
    .flatMap((span) => span.nodes)
    .filter((node) => node.kind === 'bubble')
    .map((node) => node.rank)
    .sort((a, b) => a - b);

/**
 * Où atterrir en changeant de couloir : sur la bulle la PLUS PROCHE parmi
 * celles du segment vivant à cette hauteur — donc jamais hors de l'instant en
 * cours (un segment ne dure qu'une fenêtre de silence). À égalité de distance,
 * la plus ANCIENNE : traverser ne doit jamais faire sauter le lecteur en avant
 * dans un temps qu'il n'a pas lu. Un segment sans bulle (branche reparue pour
 * recevoir une réponse) garde la hauteur d'où l'on vient.
 */
const landingRank = (lane: RiverLane, rank: number): number => {
  const span = spanCovering(lane, rank);
  const ranks = (span?.nodes ?? [])
    .filter((node) => node.kind === 'bubble')
    .map((node) => node.rank);

  return ranks.reduce(
    (best, candidate) =>
      Math.abs(candidate - rank) < Math.abs(best - rank) ? candidate : best,
    ranks[0] ?? rank,
  );
};

/**
 * Un pas sur l'un des deux axes.
 *
 * - **horizontal** (`left`/`right`) : la branche vivante suivante dans cette
 *   direction, les mortes enjambées, sans quitter l'instant.
 * - **vertical** (`up`/`down`) : la bulle suivante DE LA MÊME PERSONNE, par
 *   dessus la mort de sa branche — c'est le « Suivre Mia » du procès
 *   (`docs/design/2026-08-15-conversation-modes-verdict.html`) : la rivière
 *   raconte une trajectoire que le fil ne sait pas raconter.
 */
export function resolveRiverStep(input: ResolveRiverStepInput): RiverStep {
  const { geometry, cursor, direction } = input;
  const stay = (reason: RiverStepReason): RiverStep => ({ cursor, reason });

  const lane = geometry.lanes.find((candidate) => candidate.laneIndex === cursor.laneIndex);
  if (lane === undefined) return stay('empty');

  if (direction === 'left' || direction === 'right') {
    const living = resolveRiverLivingLanes(geometry, cursor.rank);
    const reachable =
      direction === 'right'
        ? living.filter((laneIndex) => laneIndex > cursor.laneIndex)
        : living.filter((laneIndex) => laneIndex < cursor.laneIndex).reverse();

    const nextIndex = reachable[0];
    const nextLane = geometry.lanes.find((candidate) => candidate.laneIndex === nextIndex);
    if (nextLane === undefined) return stay('edge');

    return {
      cursor: { laneIndex: nextLane.laneIndex, rank: landingRank(nextLane, cursor.rank) },
      reason: 'moved',
    };
  }

  const ranks = bubbleRanksOf(lane);
  const nextRank =
    direction === 'down'
      ? ranks.find((rank) => rank > cursor.rank)
      : [...ranks].reverse().find((rank) => rank < cursor.rank);

  return nextRank === undefined
    ? stay('edge')
    : { cursor: { laneIndex: cursor.laneIndex, rank: nextRank }, reason: 'moved' };
}

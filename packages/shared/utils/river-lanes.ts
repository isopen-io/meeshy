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
 * ── Ce qu'un avis système n'est pas ──
 * **Un avis système n'est la voix de personne.** « X a rejoint la
 * conversation » porte l'ARRIVANT pour auteur (`join-notice.ts`) : sans marque
 * (`RiverMessageInput.isSystem`), la loi lui donnait une branche à son nom,
 * le comptait comme une voix — au risque de déplier la rivière en couloirs sur
 * la seule foi d'une annonce — et laissait sa première vraie bulle continuer
 * le groupe de sa propre arrivée. Un avis descend l'axe du TEMPS avec les
 * autres et n'entre dans aucun des deux autres axes : ni voix, ni couloir, ni
 * connecteur, ni groupe. La peau le rend pleine largeur (`RiverBubble.isSystem`).
 *
 * ── Combien de branches, et sinon quoi ──
 * L'axe horizontal a une LARGEUR FINIE : `RIVER_MAX_LANES` couloirs, et il
 * lui faut `RIVER_MIN_VOICES` voix pour valoir la peine. Hors de ces bornes,
 * la loi rend un verdict `serialized` — la rivière redevient un fil vertical
 * (directive produit du 2026-08-17 : « on limite à 7 utilisateurs en
 * horizontal et 3 minimum, sinon on sérialise en vertical »). Ce n'est pas
 * l'éligibilité : `resolveCapabilities` décide si le mode s'OFFRE (≥ 5
 * participants actifs, jamais en `direct`, `reading-modes.ts`) ; ce verdict-ci
 * décide de la FORME que prend la fenêtre qu'on a sous les yeux.
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
  /**
   * Un avis SYSTÈME — « X a rejoint la conversation », résumé d'appel… Absent
   * vaut `false` : un appelant qui ne connaît pas encore cette marque décrit
   * une rivière de pure parole, exactement comme avant.
   *
   * Elle est INDISPENSABLE ici parce que `senderId` ne suffit pas à trancher :
   * l'avis d'arrivée est écrit avec l'ARRIVANT pour auteur
   * (`packages/shared/utils/join-notice.ts`). Sans elle, la loi donnait un
   * couloir et une voix à quelqu'un qui n'avait jamais parlé.
   */
  readonly isSystem?: boolean;
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
  /** Défaut `RIVER_MAX_LANES`. Largeur maximale de l'axe horizontal. */
  readonly maxLanes?: number;
  /** Défaut `RIVER_MIN_VOICES`. En dessous, la rivière se sérialise. */
  readonly minVoices?: number;
  /**
   * Décalage UTC du calendrier du LECTEUR, en minutes (défaut `0` = UTC) —
   * il ne sert qu'à trancher `isFirstInGroup` sur un changement de jour, à
   * l'identique d'iOS (`Calendar.current.isDate(_:inSameDayAs:)`,
   * `MessageListViewController`). Une bascule d'heure d'été peut décaler d'une
   * heure la frontière d'un jour ancien : c'est le prix d'une loi PURE, qui ne
   * peut pas embarquer une base de fuseaux — et l'enjeu est un en-tête
   * d'identité en plus ou en moins, jamais un contenu.
   */
  readonly dayBoundaryOffsetMinutes?: number;
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
  /**
   * Colonne RÉSERVÉE à vie — une branche morte garde la sienne, une naissance
   * ne déplace personne. TANT QUE la rivière tient dans sa largeur : au-delà
   * de `maxLanes` voix, les colonnes se PARTAGENT entre voix qui ne se
   * chevauchent jamais (`resolveRiverLaneAt` dit qui l'occupe à une hauteur
   * donnée). Deux couloirs peuvent donc porter le même `laneIndex`.
   */
  readonly laneIndex: number;
  readonly isViewer: boolean;
  readonly colorSeed: string;
  readonly spans: readonly RiverLaneSpan[];
};

export type RiverBubble = {
  readonly messageId: string;
  /**
   * Le couloir qui porte la bulle — et il n'a de sens que pour une PRISE DE
   * PAROLE. Un avis système (`isSystem`) n'occupe la colonne de personne : il
   * se rend pleine largeur, et ces deux champs ne se lisent pas pour lui.
   */
  readonly laneId: string;
  readonly laneIndex: number;
  readonly rank: number;
  /** L'heure vit en base de bulle (amendement R) — la loi la sert, la peau la formate. */
  readonly createdAtMs: number;
  readonly isViewer: boolean;
  readonly replyToMessageId: string | null;
  /**
   * Tête de groupe : la bulle porte l'en-tête d'identité (pastille + nom
   * AU-DESSUS du texte), les suivantes ne le répètent pas. MÊME règle qu'iOS
   * — l'expéditeur du rang précédent change, ou le jour calendaire change
   * (`MessageListViewController.isFirstInGroup`, heuristique iMessage) — pour
   * que la Rivière et le Fil groupent identiquement. Sans en-tête, une bulle
   * garde son heure : c'est la rangée de suite (`FocalMetaRow`).
   */
  readonly isFirstInGroup: boolean;
  /**
   * L'avis système, servi tel quel : il descend l'axe du TEMPS avec les autres
   * (il a son rang, il est dans `bubbles`), et la peau le rend PLEINE LARGEUR
   * plutôt qu'en couloir. C'est la seule marque dont elle a besoin — la loi a
   * déjà retiré l'avis de tout le reste.
   */
  readonly isSystem: boolean;
};

export type RiverConnector = {
  readonly fromMessageId: string;
  readonly toMessageId: string;
  readonly fromLaneIndex: number;
  readonly toLaneIndex: number;
  readonly fromRank: number;
  readonly toRank: number;
};

/**
 * `lanes` — la rivière tient sur ses deux axes. `serialized` — elle n'en a
 * plus qu'un : le temps. Une peau sérialisée rend le FIL (une colonne, l'ordre
 * de `bubbles`), pas une rivière étroite.
 */
export type RiverLayout = 'lanes' | 'serialized';

/**
 * POURQUOI la rivière s'est sérialisée — jamais un simple booléen : les deux
 * causes ne se réparent pas de la même façon, et une peau qui veut le dire à
 * l'écran doit pouvoir les distinguer.
 *
 * - `belowMinimum` — moins de `minVoices` voix dans la fenêtre. Deux personnes
 *   n'ont pas besoin de couloirs pour être suivies.
 * - `aboveMaximum` — il aurait fallu plus de `maxLanes` colonnes en même temps.
 *   Au-delà, les traits sont plus étroits que le texte qu'ils portent.
 */
export type RiverSerializationReason = 'belowMinimum' | 'aboveMaximum';

export type RiverGeometry = {
  readonly lanes: readonly RiverLane[];
  /** Ordre chronologique STRICT — c'est aussi l'ordre du DOM et de VoiceOver. */
  readonly bubbles: readonly RiverBubble[];
  readonly connectors: readonly RiverConnector[];
  readonly rankCount: number;
  /** Nombre de COLONNES occupées (jamais `lanes.length` : elles se partagent). */
  readonly laneCount: number;
  /** Voix ENTENDUES dans la fenêtre : celles qui ont au moins une bulle. */
  readonly voiceCount: number;
  readonly layout: RiverLayout;
  readonly serializationReason: RiverSerializationReason | null;
  readonly silenceWindowMs: number;
  readonly maxLanes: number;
  readonly minVoices: number;
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

/**
 * Largeur maximale de l'axe horizontal : 7 couloirs, la rive du lecteur
 * comprise quand il a parlé (directive produit du 2026-08-17).
 *
 * Ce n'est pas un plafond de participants — c'est un plafond de couloirs
 * SIMULTANÉS. Une conversation à quarante voix se lit très bien en Rivière
 * tant qu'il n'y en a jamais plus de sept à la fois dans le même instant :
 * les colonnes se partagent (`resolveRiverLaneAt`). C'est seulement quand
 * l'instant lui-même dépasse sept voix que la largeur cède et que la loi
 * sérialise — sinon un couloir serait plus étroit que le texte qu'il porte.
 */
export const RIVER_MAX_LANES = 7;

/**
 * Nombre de voix en dessous duquel la rivière ne vaut pas ses couloirs : 3
 * (directive produit du 2026-08-17).
 *
 * À deux, l'axe horizontal ne raconte rien que l'alternance ne dise déjà —
 * « suivre quelqu'un » n'a pas de sens quand il n'y a qu'un autre à suivre.
 * Distinct de `RIVER_ELIGIBILITY_THRESHOLD` (5 participants ACTIFS, qui décide
 * si le mode s'offre au catalogue) : ici on juge la FENÊTRE affichée, qui peut
 * n'avoir entendu que deux voix dans une conversation qui en compte dix.
 */
export const RIVER_MIN_VOICES = 3;

/**
 * Sur combien de rangs le nom d'un couloir s'allume et s'éteint : 2
 * (`resolveRiverLaneHeaders`). Réglable par appel, jamais réécrit en dur.
 */
export const RIVER_HEADER_FADE_RANKS = 2;

type PlacedMessage = {
  readonly id: string;
  readonly senderId: string;
  readonly timeMs: number;
  readonly replyToMessageId: string | null;
  readonly isSystem: boolean;
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
      isSystem: message.isSystem === true,
    }))
    .filter((message) => !Number.isNaN(message.timeMs))
    .sort(byTimeThenId)
    .map((message, rank) => ({ ...message, rank }));

/**
 * Les messages qui sont une PRISE DE PAROLE.
 *
 * **Un avis système n'est la voix de personne.** Il descend l'axe du TEMPS
 * avec les autres — il garde son rang, il est servi dans `bubbles`, la peau le
 * rend pleine largeur — et il n'entre dans AUCUN des deux autres axes : il ne
 * fait naître aucune branche, ne prolonge celle de personne, ne compte pour
 * aucune voix, et n'est le bout d'aucun connecteur.
 *
 * Sans ce filtre, l'avis d'arrivée — écrit avec l'ARRIVANT pour auteur
 * (`packages/shared/utils/join-notice.ts`) — donnait un couloir à quelqu'un qui
 * n'avait jamais parlé, et pouvait faire basculer la rivière de `serialized` à
 * `lanes` sur la seule foi d'une annonce.
 */
const spokenOnly = (placed: readonly PlacedMessage[]): readonly PlacedMessage[] =>
  placed.filter((message) => !message.isSystem);

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

const spansOverlap = (a: RiverLaneSpan, b: RiverLaneSpan): boolean =>
  a.startRank <= b.endRank && b.startRank <= a.endRank;

/** Une colonne accueille une voix de plus si aucun de ses segments ne croise les siens. */
const columnAccepts = (
  held: readonly RiverLaneSpan[],
  spans: readonly RiverLaneSpan[],
): boolean => !held.some((occupied) => spans.some((span) => spansOverlap(occupied, span)));

type ColumnPacking = {
  readonly columns: readonly (readonly RiverLaneSpan[])[];
  readonly indexByLaneId: readonly (readonly [string, number])[];
  /** Une voix n'a pas trouvé de colonne : la fenêtre dépasse la largeur permise. */
  readonly overflowed: boolean;
};

type LaneSeed = {
  readonly laneId: string;
  readonly isViewer: boolean;
  readonly spans: readonly RiverLaneSpan[];
};

/**
 * Range les voix en colonnes quand elles sont PLUS NOMBREUSES que la largeur
 * permise — coloration gloutonne d'intervalles : chaque voix prend la colonne
 * libre la plus à gauche, c'est-à-dire celle dont aucun occupant ne parle en
 * même temps qu'elle. Le résultat n'utilise jamais plus de colonnes que
 * l'instant le plus peuplé n'en exige.
 *
 * La rive (colonne 0) reste au lecteur SEUL quand il a une branche : le pas
 * latéral part toujours de chez lui, et une voix étrangère qui viendrait
 * s'asseoir sur sa colonne le ferait mentir. Le lecteur étant premier dans
 * l'ordre, il l'ouvre, et les autres cherchent à partir de la colonne 1.
 */
const packColumns = (lanes: readonly LaneSeed[], maxLanes: number): ColumnPacking => {
  const shoreIsTaken = lanes[0]?.isViewer === true;

  return lanes.reduce<ColumnPacking>(
    (packing, lane) => {
      if (packing.overflowed) return packing;

      const firstShareable = lane.isViewer || !shoreIsTaken ? 0 : 1;
      const reused = packing.columns.findIndex(
        (held, index) => index >= firstShareable && columnAccepts(held, lane.spans),
      );
      const target = reused === -1 ? packing.columns.length : reused;

      if (target >= maxLanes) {
        return { ...packing, overflowed: true };
      }

      return {
        columns: [
          ...packing.columns.slice(0, target),
          [...(packing.columns[target] ?? []), ...lane.spans],
          ...packing.columns.slice(target + 1),
        ],
        indexByLaneId: [...packing.indexByLaneId, [lane.laneId, target]],
        overflowed: false,
      };
    },
    { columns: [], indexByLaneId: [], overflowed: false },
  );
};

/**
 * Colonne de chaque voix.
 *
 * Tant que la rivière tient dans sa largeur, une voix garde SA colonne, pour
 * elle seule et à vie : c'est ce qui empêche la rivière de trembler
 * latéralement quand une branche meurt ou renaît. Le partage n'est pas une
 * optimisation qu'on applique dès qu'elle est possible — c'est le recours
 * quand il y a plus de voix que de couloirs.
 */
const assignColumns = (
  lanes: readonly LaneSeed[],
  maxLanes: number,
): { readonly indexByLaneId: ReadonlyMap<string, number>; readonly overflowed: boolean } => {
  if (lanes.length <= maxLanes) {
    return {
      indexByLaneId: new Map(lanes.map((lane, index) => [lane.laneId, index])),
      overflowed: false,
    };
  }

  const packing = packColumns(lanes, maxLanes);
  return { indexByLaneId: new Map(packing.indexByLaneId), overflowed: packing.overflowed };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Jour calendaire du LECTEUR pour un instant donné — miroir arithmétique de
 * `Calendar.current.isDate(_:inSameDayAs:)` (cf. `dayBoundaryOffsetMinutes`).
 */
const dayIndex = (timeMs: number, offsetMinutes: number): number =>
  Math.floor((timeMs + offsetMinutes * 60 * 1000) / DAY_MS);

/**
 * Deux rangs voisins appartiennent-ils à la même suite ?
 *
 * Un message SYSTÈME n'est pas une prise de parole : il n'entre dans aucune
 * suite, ni comme prédécesseur ni comme successeur. Décider sur le seul
 * `senderId` faisait suivre la première vraie bulle d'un nouveau venu dans le
 * groupe de sa propre annonce d'arrivée — qui porte l'arrivant pour auteur
 * (`packages/shared/utils/join-notice.ts`) — et la rangée perdait avatar, nom
 * et heure d'un coup.
 *
 * Miroirs de cette règle : `apps/web/utils/message-grouping.ts` et
 * `MessageDayGrouping.isGroupHead` (iOS) — toute évolution touche les trois.
 */
const continues = (
  earlier: PlacedMessage,
  later: PlacedMessage,
  offsetMinutes: number,
): boolean => {
  if (earlier.isSystem || later.isSystem) return false;
  if (earlier.senderId !== later.senderId) return false;
  return dayIndex(earlier.timeMs, offsetMinutes) === dayIndex(later.timeMs, offsetMinutes);
};

/**
 * Tête de groupe, règle d'iOS mot pour mot : le rang PRÉCÉDENT change
 * d'expéditeur, change de jour, ou l'un des deux est un avis système. Le
 * premier rang ouvre toujours un groupe.
 */
const isGroupHead = (
  placed: readonly PlacedMessage[],
  index: number,
  offsetMinutes: number,
): boolean => {
  const previous = placed[index - 1];
  const current = placed[index];
  if (previous === undefined || current === undefined) return true;
  return !continues(previous, current, offsetMinutes);
};

/**
 * Géométrie complète de la Rivière pour une fenêtre de messages : les
 * branches et leurs segments, les bulles dans l'ordre du temps, les
 * connecteurs de réponse, et le VERDICT de forme (`lanes`/`serialized`).
 * Zéro pixel — la peau multiplie par ses tokens.
 */
export function resolveRiverLanes(input: ResolveRiverLanesInput): RiverGeometry {
  const silenceWindowMs = input.silenceWindowMs ?? RIVER_LANE_SILENCE_WINDOW_MS;
  const maxLanes = input.maxLanes ?? RIVER_MAX_LANES;
  const minVoices = input.minVoices ?? RIVER_MIN_VOICES;
  const dayBoundaryOffsetMinutes = input.dayBoundaryOffsetMinutes ?? 0;
  const placed = placeMessages(input.messages);
  const spoken = spokenOnly(placed);
  // Les rangs restent ceux de TOUTE la fenêtre, avis compris : une branche
  // survit à un avis qui passe, elle ne s'y coupe pas.
  const rankTimes = placed.map((message) => message.timeMs);
  const engagements = collectEngagements(spoken);
  const laneIds = orderLaneIds(engagements, input.viewerId);

  const seedByParticipantId = new Map(
    input.participants.map((participant) => [participant.id, participant.displayName]),
  );

  const seeds: readonly LaneSeed[] = laneIds.map((laneId) => ({
    laneId,
    isViewer: laneId === input.viewerId,
    spans: toSpans(engagements.get(laneId) ?? [], rankTimes, silenceWindowMs),
  }));

  /**
   * Une VOIX est une personne qu'on a entendue : elle a au moins une bulle.
   * Une branche qui n'existe que pour recevoir une réponse (`addressed`) ne
   * compte pas — sinon deux personnes qui se répondent feraient trois voix. Et
   * une annonce ne compte pas non plus — sinon la rivière se déplierait en
   * couloirs sur la foi d'une arrivée que personne n'a encore entendue parler.
   */
  const voiceCount = new Set(spoken.map((message) => message.senderId)).size;
  const { indexByLaneId, overflowed } = assignColumns(seeds, maxLanes);

  const serializationReason: RiverSerializationReason | null = overflowed
    ? 'aboveMaximum'
    : voiceCount < minVoices
      ? 'belowMinimum'
      : null;
  const layout: RiverLayout = serializationReason === null ? 'lanes' : 'serialized';

  /**
   * Sérialisée, la rivière n'a qu'un couloir — le fil. Les segments, eux,
   * restent servis tels quels : ils disent qui participe à quel instant, et
   * une peau sérialisée peut s'en servir (en-tête de groupe, avatars) sans
   * dessiner un seul trait.
   */
  const columnOf = (laneId: string): number =>
    layout === 'serialized' ? 0 : (indexByLaneId.get(laneId) ?? 0);

  const lanes: readonly RiverLane[] = seeds.map((seed) => ({
    laneId: seed.laneId,
    laneIndex: columnOf(seed.laneId),
    isViewer: seed.isViewer,
    // Un participant sorti du groupe n'a plus de nom à servir de graine : son
    // identifiant en tient lieu, plutôt qu'une branche sans couleur.
    colorSeed: seedByParticipantId.get(seed.laneId) ?? seed.laneId,
    spans: seed.spans,
  }));

  const placedById = new Map(spoken.map((message) => [message.id, message]));

  const bubbles: readonly RiverBubble[] = placed.map((message, index) => ({
    messageId: message.id,
    laneId: message.senderId,
    laneIndex: columnOf(message.senderId),
    rank: message.rank,
    createdAtMs: message.timeMs,
    isViewer: message.senderId === input.viewerId,
    replyToMessageId: message.replyToMessageId,
    isFirstInGroup: isGroupHead(placed, index, dayBoundaryOffsetMinutes),
    isSystem: message.isSystem,
  }));

  /**
   * Un connecteur ne pend JAMAIS dans le vide : une cible hors fenêtre (ou
   * effacée) n'a ni rang ni couloir, donc pas de trait. Une réponse à
   * soi-même en garde un — c'est une donnée vraie, la peau la boucle dans son
   * propre couloir. Un avis système n'est le bout d'aucun trait, ni départ ni
   * arrivée : un connecteur relie deux couloirs, et il n'en a pas.
   */
  const connectors: readonly RiverConnector[] = spoken.flatMap((message) => {
    const target =
      message.replyToMessageId === null ? undefined : placedById.get(message.replyToMessageId);
    if (target === undefined) return [];

    return [
      {
        fromMessageId: message.id,
        toMessageId: target.id,
        fromLaneIndex: columnOf(message.senderId),
        toLaneIndex: columnOf(target.senderId),
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
    laneCount: new Set(lanes.map((lane) => lane.laneIndex)).size,
    voiceCount,
    layout,
    serializationReason,
    silenceWindowMs,
    maxLanes,
    minVoices,
  };
}

const spanCovering = (lane: RiverLane, rank: number): RiverLaneSpan | undefined =>
  lane.spans.find((span) => span.startRank <= rank && rank <= span.endRank);

/**
 * Les branches VIVANTES à ce rang, par colonne croissante. C'est la largeur
 * réelle de l'axe horizontal à cette hauteur : ce que la peau dessine, et ce
 * que la navigation latérale traverse. Une branche morte n'est pas navigable —
 * on l'enjambe.
 *
 * Sérialisée, la rivière n'a qu'un couloir : le fil. Elle rend `[0]` sur tout
 * rang de la fenêtre, et rien en dehors.
 */
export function resolveRiverLivingLanes(geometry: RiverGeometry, rank: number): readonly number[] {
  if (geometry.layout === 'serialized') {
    return rank >= 0 && rank < geometry.rankCount ? [0] : [];
  }

  return geometry.lanes
    .filter((lane) => spanCovering(lane, rank) !== undefined)
    .map((lane) => lane.laneIndex)
    .sort((a, b) => a - b);
}

/**
 * QUI occupe cette colonne à cette hauteur — la question que le partage de
 * colonnes rend nécessaire (`RiverLane.laneIndex`). `null` si la colonne est
 * éteinte là, ou n'existe pas.
 *
 * Une colonne n'a JAMAIS deux occupants au même rang : `packColumns` n'y
 * installe que des voix dont les segments ne se croisent pas. Ce n'est donc pas
 * un choix arbitraire parmi plusieurs, c'est le seul.
 *
 * Sérialisée, la seule colonne appartient, à chaque rang, à l'auteur du
 * message de ce rang — c'est ce qui fait défiler le nom en tête du fil. Sauf au
 * rang d'un avis système : il n'occupe la colonne de personne (`RiverBubble.laneId`
 * n'a de sens que pour une prise de parole), donc `null` — même règle que
 * `serializedOccupancies`, sans quoi nommer la colonne à ce rang ferait parler
 * quelqu'un qui vient seulement d'entrer.
 */
export function resolveRiverLaneAt(
  geometry: RiverGeometry,
  laneIndex: number,
  rank: number,
): RiverLane | null {
  if (geometry.layout === 'serialized') {
    const bubble = geometry.bubbles.find((candidate) => candidate.rank === rank);
    const lane =
      laneIndex === 0 && bubble !== undefined && !bubble.isSystem
        ? geometry.lanes.find((candidate) => candidate.laneId === bubble.laneId)
        : undefined;
    return lane ?? null;
  }

  const lane = geometry.lanes.find(
    (candidate) => candidate.laneIndex === laneIndex && spanCovering(candidate, rank) !== undefined,
  );
  return lane ?? null;
}

/**
 * Le nom en tête d'une colonne, et son opacité.
 *
 * Une colonne ne porte pas un nom fixe : elle porte celui de la voix qui
 * l'occupe À LA HAUTEUR OÙ L'ON LIT. Le nom s'ALLUME quand la branche naît et
 * s'ÉTEINT quand elle meurt, sur `fadeRanks` rangs — c'est ce fondu qui rend
 * le partage de colonne lisible plutôt que brutal (directive produit du
 * 2026-08-17 : « fading et apparition du nom correspondant à la ligne affichée
 * pendant le scroll vertical »).
 *
 * `focusRank` peut être FRACTIONNAIRE : la peau le calcule depuis son
 * défilement, avec la MÊME bande de focus que le reste de la Lentille
 * (`FOCUS_BAND_OFFSET`/`electFocusRow`, `focus-curve.ts`) — jamais une seconde
 * loi de défilement.
 *
 * Une seule formule, et c'est la DONNÉE qui décide de la forme du fondu :
 *   - Deux occupations qui se TOUCHENT (le message suivant est de la voix
 *     suivante) se croisent : les deux noms coexistent brièvement, à opacité
 *     réduite. C'est un vrai relais — il n'y a aucun instant de silence à
 *     rendre entre elles.
 *   - Deux occupations séparées par du VIDE (la branche est morte, d'autres ont
 *     parlé, elle renaît plus tard) s'éteignent l'une avant l'autre : sur les
 *     rangs du vide, la colonne ne porte AUCUN nom. Nommer une branche morte
 *     mentirait sur une présence, exactement comme une pastille grise sur un
 *     avatar hors ligne (`user-presence.ts`, qui ne la dessine pas).
 *
 * Une occupation encore ouverte au bas de la fenêtre ne s'éteint pas DANS la
 * fenêtre : on ne sait pas encore si elle meurt. Au-delà du dernier rang, la loi
 * n'a plus rien à nommer, et le nom s'éteint avec la fenêtre elle-même.
 *
 * Les entrées d'opacité nulle ne sont pas servies : un nom éteint ne se rend pas.
 */
export type RiverLaneHeader = {
  readonly laneIndex: number;
  readonly laneId: string;
  readonly colorSeed: string;
  readonly isViewer: boolean;
  /** Dans `]0, 1]` — la peau la multiplie par son opacité de repos. */
  readonly alpha: number;
};

export type ResolveRiverLaneHeadersInput = {
  readonly geometry: RiverGeometry;
  readonly focusRank: number;
  /** Défaut `RIVER_HEADER_FADE_RANKS`. */
  readonly fadeRanks?: number;
};

/** Intervalle d'occupation d'une voix dans une colonne : un segment, ou un groupe. */
type Occupancy = {
  readonly laneId: string;
  readonly laneIndex: number;
  readonly startRank: number;
  readonly endRank: number;
  readonly isOpen: boolean;
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Rampe symétrique, mesurée depuis le VIDE qui borde l'occupation : au rang de
 * naissance il reste `1` rang de marge, donc `1/fadeRanks` d'opacité — le nom
 * arrive déjà lisible, sans jamais être invisible sur son propre premier
 * message. Une occupation qui ne dure QU'UN rang naît et meurt dans le même
 * souffle : elle plafonne à `1/fadeRanks`, et c'est juste — un passage éclair
 * n'a pas à s'imposer autant qu'une présence installée.
 *
 * Une occupation encore ouverte emprunte sa borne de mort à la FENÊTRE, décalée
 * de la largeur du fondu : elle ne s'estompe donc jamais dans la fenêtre (on ne
 * sait pas encore si elle meurt), et s'éteint continûment au-delà du dernier
 * rang, là où la loi n'a plus rien à nommer.
 */
const headerAlpha = (
  occupancy: Occupancy,
  focusRank: number,
  fadeRanks: number,
  lastRank: number,
): number => {
  const deathRank = occupancy.isOpen ? lastRank + fadeRanks : occupancy.endRank;
  const margin = Math.min(focusRank - (occupancy.startRank - 1), deathRank + 1 - focusRank);

  if (margin <= 0) return 0;
  return fadeRanks === 0 ? 1 : clampUnit(margin / fadeRanks);
};

/**
 * Occupations en mode sérialisé : les GROUPES de bulles consécutives d'un même
 * auteur, tels que `isFirstInGroup` les découpe déjà — la seule notion
 * d'occupation qui ait un sens quand tout le monde partage l'unique colonne.
 *
 * Un avis système n'occupe rien : nommer une colonne au rang d'une annonce
 * ferait parler quelqu'un qui vient seulement d'entrer, exactement comme
 * nommer une branche morte mentirait sur une présence.
 */
const serializedOccupancies = (geometry: RiverGeometry): readonly Occupancy[] =>
  geometry.bubbles.reduce<readonly Occupancy[]>((groups, bubble) => {
    if (bubble.isSystem) return groups;

    const current = groups[groups.length - 1];

    return bubble.isFirstInGroup || current === undefined
      ? [
          ...groups,
          {
            laneId: bubble.laneId,
            laneIndex: 0,
            startRank: bubble.rank,
            endRank: bubble.rank,
            isOpen: false,
          },
        ]
      : [...groups.slice(0, -1), { ...current, endRank: bubble.rank }];
  }, []);

const laneOccupancies = (geometry: RiverGeometry): readonly Occupancy[] =>
  geometry.lanes.flatMap((lane) =>
    lane.spans.map((span) => ({
      laneId: lane.laneId,
      laneIndex: lane.laneIndex,
      startRank: span.startRank,
      endRank: span.endRank,
      isOpen: span.isOpen,
    })),
  );

export function resolveRiverLaneHeaders(
  input: ResolveRiverLaneHeadersInput,
): readonly RiverLaneHeader[] {
  const { geometry, focusRank } = input;
  const fadeRanks = Math.max(0, input.fadeRanks ?? RIVER_HEADER_FADE_RANKS);
  const laneById = new Map(geometry.lanes.map((lane) => [lane.laneId, lane]));

  const occupancies =
    geometry.layout === 'serialized' ? serializedOccupancies(geometry) : laneOccupancies(geometry);

  return occupancies
    .flatMap((occupancy) => {
      const lane = laneById.get(occupancy.laneId);
      const alpha = headerAlpha(occupancy, focusRank, fadeRanks, geometry.rankCount - 1);
      if (lane === undefined || alpha <= 0) return [];

      return [
        {
          laneIndex: occupancy.laneIndex,
          laneId: lane.laneId,
          colorSeed: lane.colorSeed,
          isViewer: lane.isViewer,
          alpha,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.laneIndex - b.laneIndex || b.alpha - a.alpha || compareStrings(a.laneId, b.laneId),
    );
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
 *
 * SÉRIALISÉE, la rivière EST le fil : il n'y a plus d'axe horizontal (`edge`
 * de part et d'autre), et l'axe vertical redevient le TEMPS — la bulle
 * suivante, quel qu'en soit l'auteur. Suivre une personne n'a plus de support
 * visuel dès lors qu'aucune branche ne la porte.
 */
export function resolveRiverStep(input: ResolveRiverStepInput): RiverStep {
  const { geometry, cursor, direction } = input;
  const stay = (reason: RiverStepReason): RiverStep => ({ cursor, reason });

  if (geometry.layout === 'serialized') {
    if (geometry.rankCount === 0 || cursor.laneIndex !== 0) return stay('empty');
    if (direction === 'left' || direction === 'right') return stay('edge');

    const nextRank = direction === 'down' ? cursor.rank + 1 : cursor.rank - 1;
    return nextRank < 0 || nextRank >= geometry.rankCount
      ? stay('edge')
      : { cursor: { laneIndex: 0, rank: nextRank }, reason: 'moved' };
  }

  const lane = resolveRiverLaneAt(geometry, cursor.laneIndex, cursor.rank);
  if (lane === null) return stay('empty');

  if (direction === 'left' || direction === 'right') {
    const living = resolveRiverLivingLanes(geometry, cursor.rank);
    const reachable =
      direction === 'right'
        ? living.filter((laneIndex) => laneIndex > cursor.laneIndex)
        : living.filter((laneIndex) => laneIndex < cursor.laneIndex).reverse();

    const nextIndex = reachable[0];
    const nextLane =
      nextIndex === undefined ? null : resolveRiverLaneAt(geometry, nextIndex, cursor.rank);
    if (nextLane === null) return stay('edge');

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

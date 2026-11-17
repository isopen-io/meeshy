/**
 * Les envois « appareil » (révocations de bannières, pushes de remplacement, pastilles) partent hors du geste qui les
 * demande, en FILES (#18910, audit de performance).
 *
 * - Une file par COMPTE pour ce que déclenche une lecture : une étape lente d'un compte — APNs à 10 s derrière son
 *   disjoncteur — ne retarde plus la lecture de tous les autres.
 * - La file `bulk` pour les retraits et réécritures de masse, qui gardent leurs deux invariants : le pic reste à un
 *   envoi, et l'ordre d'enfilement est l'ordre d'envoi (la révocation précède le remplacement de la même bannière).
 *
 * Chaque file est BORNÉE : au-delà de `maxPending` étapes en attente, la nouvelle est abandonnée et signalée — une
 * bannière laissée en place, jamais une mémoire qui enfle. Une file vidée est oubliée.
 */
type Lane = { tail: Promise<void>; pending: number };

export const BULK_DEVICE_LANE = 'bulk';

/** Assez pour l'audience d'un post drainée par lots (200 lots de 200), pas assez pour enfler sans fin. */
export const DEVICE_LANE_MAX_PENDING = 1_000;

export const accountDeviceLane = (userId: string): string => `user:${userId}`;

export class DeviceWorkLanes {
  private readonly lanes = new Map<string, Lane>();

  constructor(
    private readonly options: {
      readonly maxPending: number;
      readonly onDrop: (lane: string) => void;
      readonly onError: (lane: string, error: unknown) => void;
    },
  ) {}

  get size(): number {
    return this.lanes.size;
  }

  enqueue(name: string, work: () => Promise<void>): void {
    const lane = this.lanes.get(name) ?? { tail: Promise.resolve(), pending: 0 };
    if (lane.pending >= this.options.maxPending) {
      this.options.onDrop(name);
      return;
    }
    lane.pending += 1;
    lane.tail = lane.tail
      .then(work)
      .catch((error: unknown) => this.options.onError(name, error))
      .finally(() => this.settle(name, lane));
    this.lanes.set(name, lane);
  }

  async drain(): Promise<void> {
    while (this.lanes.size > 0) {
      await Promise.all([...this.lanes.values()].map((lane) => lane.tail));
    }
  }

  private settle(name: string, lane: Lane): void {
    lane.pending -= 1;
    if (lane.pending === 0 && this.lanes.get(name) === lane) this.lanes.delete(name);
  }
}

/**
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  carrierMessageStillServesBytes,
  carrierMessageStillServesWhere,
  CARRIER_DEADLINE_COLUMNS,
} from '../carrierMessageLifecycle';

const NOW = new Date('2026-08-12T12:00:00.000Z');
const EARLIER = new Date('2026-08-12T11:59:00.000Z');
const LATER = new Date('2026-08-12T12:01:00.000Z');

describe('carrierMessageStillServesBytes', () => {
  describe('when the carrier message is gone from the collection', () => {
    it('refuses — a hard-deleted message keeps nothing readable', () => {
      expect(carrierMessageStillServesBytes(null, NOW)).toBe(false);
    });

    it('refuses on undefined, which is what a missing select yields', () => {
      expect(carrierMessageStillServesBytes(undefined, NOW)).toBe(false);
    });
  });

  describe('when the carrier message is live', () => {
    it('serves a message that carries neither deletion nor deadline', () => {
      expect(carrierMessageStillServesBytes({}, NOW)).toBe(true);
    });

    it('serves a message whose deadline is still ahead', () => {
      expect(
        carrierMessageStillServesBytes({ deletedAt: null, expiresAt: LATER }, NOW)
      ).toBe(true);
    });
  });

  describe('when the carrier message was withdrawn', () => {
    it('refuses a soft-deleted message — recall, unsend and moderation share this column', () => {
      expect(carrierMessageStillServesBytes({ deletedAt: EARLIER }, NOW)).toBe(false);
    });

    it('refuses even when the deadline is still ahead — withdrawal is not negotiable', () => {
      expect(
        carrierMessageStillServesBytes({ deletedAt: EARLIER, expiresAt: LATER }, NOW)
      ).toBe(false);
    });
  });

  describe('when the deadline has passed', () => {
    it('refuses an expired ephemeral message', () => {
      expect(carrierMessageStillServesBytes({ expiresAt: EARLIER }, NOW)).toBe(false);
    });

    /**
     * #7578 — the view-once purge has its OWN column (`viewOnceBurnAt`), never
     * `expiresAt`: the bytes stop at that deadline too.
     */
    it('refuses a view-once message whose purge deadline has passed', () => {
      expect(carrierMessageStillServesBytes({ viewOnceBurnAt: EARLIER }, NOW)).toBe(false);
    });

    it('still serves a view-once message whose purge deadline is ahead', () => {
      expect(carrierMessageStillServesBytes({ viewOnceBurnAt: LATER }, NOW)).toBe(true);
    });

    /**
     * The sweep runs once a minute; between the deadline and the unlink the
     * bytes are still on disk. Serving them there is precisely the window this
     * predicate closes, so the boundary must refuse, not serve.
     */
    it('refuses at the exact deadline rather than serving one last time', () => {
      expect(carrierMessageStillServesBytes({ expiresAt: NOW }, NOW)).toBe(false);
    });
  });

  describe('when the deadline arrives as an ISO string rather than a Date', () => {
    it('refuses a past deadline serialized as a string', () => {
      expect(
        carrierMessageStillServesBytes({ expiresAt: EARLIER.toISOString() }, NOW)
      ).toBe(false);
    });

    it('serves a future deadline serialized as a string', () => {
      expect(
        carrierMessageStillServesBytes({ expiresAt: LATER.toISOString() }, NOW)
      ).toBe(true);
    });
  });

  /**
   * An unparseable deadline must not silently read as "already expired" — that
   * would make a serialization slip destroy live media. It reads as "no
   * deadline", which is the state the column had before anyone wrote to it.
   */
  it('serves when the deadline is unparseable rather than treating it as passed', () => {
    expect(carrierMessageStillServesBytes({ expiresAt: 'not-a-date' }, NOW)).toBe(true);
  });
});

// ─────────────── LA MÊME LOI, EN FORME DE REQUÊTE (#9244) ───────────────

/**
 * Le prédicat ci-dessus répond sur un message DÉJÀ chargé. La galerie, elle,
 * doit exclure en base : elle pagine (`limit`/`offset`), et un filtrage après
 * la requête ferait rétrécir la page sans corriger ce qui la borne — le total
 * dirait alors exactement ce que l'exclusion cache.
 *
 * D'où une seconde forme, `carrierMessageStillServesWhere`, et le risque
 * qu'elle introduit : **deux écritures d'une seule loi dérivent**. Elles sont
 * donc dérivées d'UNE liste, `CARRIER_DEADLINE_COLUMNS`, et ces témoins
 * interdisent d'en nourrir une sans l'autre.
 */
describe('carrierMessageStillServesWhere — la forme requête', () => {
  const NOW = new Date('2026-10-03T12:00:00.000Z');

  it('refuse le message retiré par la même colonne que le prédicat', () => {
    expect(carrierMessageStillServesWhere(NOW)).toMatchObject({ deletedAt: null });
  });

  it('borne CHAQUE échéance déclarée : absente, ou dans le futur', () => {
    const where = carrierMessageStillServesWhere(NOW);

    for (const column of CARRIER_DEADLINE_COLUMNS) {
      expect(where.AND).toContainEqual({
        OR: [{ [column]: null }, { [column]: { gt: NOW } }],
      });
    }
  });

  it('borne EXACTEMENT ces échéances — ni plus, ni moins', () => {
    // Si une quatrième échéance entre dans la loi, ce témoin rougit jusqu'à ce
    // que la forme requête l'apprenne aussi.
    expect(carrierMessageStillServesWhere(NOW).AND).toHaveLength(
      CARRIER_DEADLINE_COLUMNS.length
    );
  });

  it("lit l'instant qu'on lui passe, jamais une horloge capturée", () => {
    const later = new Date(NOW.getTime() + 3_600_000);

    expect(carrierMessageStillServesWhere(later)).not.toEqual(
      carrierMessageStillServesWhere(NOW)
    );
  });

  /**
   * LE témoin de cohérence. Toute colonne d'échéance que l'interface
   * `CarrierMessageLifecycle` déclare doit être dans `CARRIER_DEADLINE_COLUMNS`
   * — sinon le prédicat la lirait et la requête l'ignorerait, et la galerie
   * servirait ce que le détail refuse. C'est exactement le défaut de #9244.
   *
   * Lu dans la SOURCE : aucune réflexion n'atteint un type TypeScript à
   * l'exécution, et c'est précisément pourquoi cette garde existe.
   */
  it("ne laisse aucune échéance de l'interface hors de la forme requête", () => {
    const source = readFileSync(
      join(__dirname, '..', 'carrierMessageLifecycle.ts'),
      'utf8'
    );
    const body = source.slice(
      source.indexOf('interface CarrierMessageLifecycle'),
      source.indexOf('function deadlinePassed')
    );
    const declared = [...body.matchAll(/readonly\s+(\w+)\?:/g)].map((m) => m[1]);

    expect(declared).toContain('deletedAt');
    expect(declared.filter((c) => c !== 'deletedAt').sort()).toEqual(
      [...CARRIER_DEADLINE_COLUMNS].sort()
    );
  });
});

import { describe, expect, test } from 'bun:test';

import { CONNECTOR_MIN_BOW, connectorBow } from './metrics';

/** `RiverMetrics.Connector.bow(laneDistancePoints:)` — les deux moitiés du `max`. */
describe('connectorBow', () => {
  test('sous le plancher (|Δ|·0.5 < 34) ⇒ le plancher gagne', () => {
    expect(connectorBow(10)).toBe(CONNECTOR_MIN_BOW);
    expect(connectorBow(-10)).toBe(CONNECTOR_MIN_BOW);
  });

  test('au-dessus du plancher (|Δ|·0.5 > 34) ⇒ la formule gagne', () => {
    expect(connectorBow(200)).toBe(100);
    expect(connectorBow(-200)).toBe(100);
  });
});

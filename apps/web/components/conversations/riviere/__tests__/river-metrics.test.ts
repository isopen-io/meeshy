import {
  readRiverPixelToken,
  connectorBow,
  RIVER_CONNECTOR_MIN_BOW_FALLBACK_PX,
  RIVER_CONNECTOR_BOW_RATIO_FALLBACK,
} from '../river-metrics';

describe('readRiverPixelToken — lit le DOM, jamais un second nombre dupliqué', () => {
  it('rend le repli quand la variable CSS n\'est pas résolue (jsdom sans lentille-tokens.css chargé)', () => {
    expect(readRiverPixelToken('--lentille-river-connector-min-bow', 34)).toBe(34);
  });

  it('lit la valeur réellement posée sur :root quand elle existe', () => {
    document.documentElement.style.setProperty('--lentille-river-connector-min-bow', '99px');
    expect(readRiverPixelToken('--lentille-river-connector-min-bow', 34)).toBe(99);
    document.documentElement.style.removeProperty('--lentille-river-connector-min-bow');
  });

  it('lit sur un élément racine explicite quand fourni', () => {
    const el = document.createElement('div');
    el.style.setProperty('--lentille-river-connector-bow-ratio', '0.75');
    document.body.appendChild(el);
    expect(readRiverPixelToken('--lentille-river-connector-bow-ratio', 0.5, el)).toBe(0.75);
    document.body.removeChild(el);
  });
});

describe('connectorBow — bow = max(minBow, |Δcouloir| · bowRatio), mot pour mot la maquette', () => {
  it('plafonne à minBow (repli 34) quand la distance est petite', () => {
    expect(connectorBow(10)).toBe(RIVER_CONNECTOR_MIN_BOW_FALLBACK_PX);
  });

  it('suit |Δ| · bowRatio (repli 0.5) au-delà de minBow', () => {
    expect(connectorBow(200)).toBe(200 * RIVER_CONNECTOR_BOW_RATIO_FALLBACK);
  });

  it('est symétrique en signe (|Δcouloir|)', () => {
    expect(connectorBow(-200)).toBe(connectorBow(200));
  });

  it('les replis miroitent bien lentille-tokens.json → river.connector (R-131)', () => {
    expect(RIVER_CONNECTOR_MIN_BOW_FALLBACK_PX).toBe(34);
    expect(RIVER_CONNECTOR_BOW_RATIO_FALLBACK).toBe(0.5);
  });
});

/**
 * Le VOCABULAIRE du tri des textes de décor (#10256) : ce que le contrat d'un cadre
 * (`glory-frame-format.ts`) et la loi du tri (`glory-frame-decor.ts`) partagent, sans
 * que l'un importe l'autre — une feuille, pour que le graphe des types reste sans cycle.
 */
export const GLORY_DECOR_SLOT_PATTERN = /^decor\.[0-9]{1,3}$/;
export const GLORY_DECOR_KEY_PATTERN = /^game\.frame\.decor\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Les données du moment qu'un texte de décor VIVANT porte ; le peintre les compose (L14, #10167). */
export const GLORY_DECOR_LIVE_DATA = [
  'level',
  'level-ring',
  'meesh-number',
  'meesh-ring',
  'mythe-number',
  'mythe-total',
  'date',
  'day',
  'mission-1',
  'mission-2',
  'mission-3',
  'missions-done',
] as const;
export type GloryDecorLiveData = (typeof GLORY_DECOR_LIVE_DATA)[number];

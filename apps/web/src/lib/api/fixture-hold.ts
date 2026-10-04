/**
 * **LA RETENUE D'UNE RÉPONSE DE FIXTURES, POUR LES GATES** (#9302) — le
 * client de fixtures sert sur-le-champ, si bien qu'aucun navigateur ne pouvait
 * observer l'état « en vol » d'une requête (le bouton « revenir en bas » qui
 * pulse pendant la fenêtre `?around=`). Un gate pose, par `addInitScript`, une
 * fonction sous `globalThis[FIXTURE_HOLD_GLOBAL]` : appelée avec le CANAL et
 * le DÉTAIL de la requête, elle rend une promesse que le gate résout quand il
 * a lu ce qu'il juge — un fait, jamais une durée (`fixed-delay-ratchet`) —
 * ou rien pour laisser passer.
 *
 * LIMITÉE AUX GATES PAR CONSTRUCTION : seuls les chemins `__FIXTURES__ &&
 * source === 'fixtures'` l'appellent — un build `gateway` (la production) ne
 * la lie pas — et aucune retenue posée ne change rien.
 */
export const FIXTURE_HOLD_GLOBAL = '__meeshyFixtureHold';

export type FixtureHoldChannel = 'messages-window';

export function fixtureHold(channel: FixtureHoldChannel, detail: string): Promise<void> | null {
  const hold: unknown = Reflect.get(globalThis, FIXTURE_HOLD_GLOBAL);
  if (typeof hold !== 'function') return null;
  const held: unknown = Reflect.apply(hold, undefined, [channel, detail]);
  return held instanceof Promise ? held.then(() => undefined) : null;
}

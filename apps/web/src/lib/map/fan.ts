/**
 * **L'ÉVENTAIL DES ÉPINGLES QUI SE RECOUVRENT (#19883)** — miroir de `LocationMapFan.spread`
 * (iOS, `apps/ios/Meeshy/Features/SharedLocation/Map/LocationMapPinsLayer.swift`). À la
 * précision « ville », toutes les positions servies tombent au même centre : les épingles
 * plus proches que `minimumDistance` forment un groupe, posé en cercle autour de son
 * centre, la première en haut. Une épingle seule garde son point servi. L'ordre des
 * identifiants fixe l'éventail : la même charge, servie dans un autre ordre, ne bouge pas.
 */

export type ScreenPin = { readonly id: string; readonly x: number; readonly y: number };
export type ScreenPoint = { readonly x: number; readonly y: number };

const distance = (a: ScreenPoint, b: ScreenPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

const groupsOf = (pins: readonly ScreenPin[], minimumDistance: number): readonly (readonly ScreenPin[])[] =>
  [...pins]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .reduce<readonly (readonly ScreenPin[])[]>((groups, pin) => {
      const index = groups.findIndex((group) => group.some((member) => distance(member, pin) < minimumDistance));
      return index === -1 ? [...groups, [pin]] : groups.map((group, i) => (i === index ? [...group, pin] : group));
    }, []);

const fanned = (group: readonly ScreenPin[], minimumDistance: number): readonly (readonly [string, ScreenPoint])[] => {
  const n = group.length;
  if (n === 1) return group.map((pin) => [pin.id, { x: pin.x, y: pin.y }] as const);
  const centre = { x: group.reduce((sum, pin) => sum + pin.x, 0) / n, y: group.reduce((sum, pin) => sum + pin.y, 0) / n };
  const radius = Math.max(minimumDistance * 0.6, minimumDistance / (2 * Math.sin(Math.PI / n)));
  return group.map((pin, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / n;
    return [pin.id, { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) }] as const;
  });
};

export function spreadPins(pins: readonly ScreenPin[], minimumDistance: number): ReadonlyMap<string, ScreenPoint> {
  return new Map(groupsOf(pins, minimumDistance).flatMap((group) => fanned(group, minimumDistance)));
}

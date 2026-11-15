/**
 * **HAPPY-DOM NE FAIT PAS DE MISE EN PAGE, ET LE VIRTUALISEUR NE REND RIEN SANS
 * ELLE.** `calculateRange` (`@tanstack/virtual-core`) rend `null` dès que la
 * fenêtre de défilement mesure `0`, et happy-dom fixe à `0` toutes les
 * dimensions, faute de moteur de rendu.
 *
 * Le virtualiseur lit DEUX familles de dimensions, et le simulacre les pose
 * TOUTES LES DEUX : la fenêtre se mesure sur `clientHeight` / `clientWidth`
 * (`observeElementRect`, depuis `virtual-core` 3.19.9 — `offsetHeight` avant),
 * chaque rangée sur `offsetHeight` / `offsetWidth` (`measureElement`). Un
 * simulacre qui n'en pose qu'une rend un fil VIDE à la première montée de
 * version qui change de famille, et chaque témoin qui y cherche une rangée
 * rougit sans qu'aucun comportement du produit n'ait bougé.
 *
 * On ne simule aucun comportement du produit — on rend la seule chose que
 * happy-dom ne fait pas : une taille.
 */
export type SimulatedLayout = { readonly height: number; readonly width: number };

const DIMENSIONS = [
  ['offsetHeight', 'height'],
  ['offsetWidth', 'width'],
  ['clientHeight', 'height'],
  ['clientWidth', 'width'],
] as const;

export function simulateLayout(layout: SimulatedLayout): () => void {
  const proto = HTMLElement.prototype as unknown as object;
  const saved = DIMENSIONS.map(([property]) => [property, Object.getOwnPropertyDescriptor(proto, property)] as const);
  DIMENSIONS.forEach(([property, axis]) => {
    Object.defineProperty(proto, property, { configurable: true, get: () => layout[axis] });
  });
  return () => {
    saved.forEach(([property, descriptor]) => {
      if (descriptor === undefined) {
        Reflect.deleteProperty(proto, property);
        return;
      }
      Object.defineProperty(proto, property, descriptor);
    });
  };
}

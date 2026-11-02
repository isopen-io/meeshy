/**
 * **HAPPY-DOM NE FAIT PAS DE MISE EN PAGE, ET LE VIRTUALISEUR NE REND RIEN SANS
 * ELLE.** Toute boîte y mesure `0`, et `calculateRange` (`@tanstack/virtual-core`)
 * rend `null` dès que la boîte du cadre de défilement est vide : `getVirtualItems()`
 * reste VIDE, et un témoin mesure un écran sans une seule rangée.
 *
 * Le virtualiseur lit DEUX mesures : le cadre sur `clientWidth`/`clientHeight`
 * (depuis `virtual-core` 3.19.9 — sur `offset*` avant, et c'est ce changement
 * qui a vidé les témoins qui ne simulaient que `offset*`), chaque rangée sur
 * `offsetHeight` (`measureElement`). On simule les quatre, et rien d'autre :
 * aucun comportement du produit, seulement une boîte.
 */
export type SimulatedBox = { readonly height: number; readonly width: number };

const SIZE_PROPERTIES = [
  ['clientHeight', 'height'],
  ['clientWidth', 'width'],
  ['offsetHeight', 'height'],
  ['offsetWidth', 'width'],
] as const;

export function simulateLayout(box: SimulatedBox): () => void {
  const proto = HTMLElement.prototype as unknown as object;
  const saved = SIZE_PROPERTIES.map(
    ([property]) => [property, Object.getOwnPropertyDescriptor(proto, property)] as const,
  );
  SIZE_PROPERTIES.forEach(([property, dimension]) => {
    Object.defineProperty(proto, property, { configurable: true, get: () => box[dimension] });
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

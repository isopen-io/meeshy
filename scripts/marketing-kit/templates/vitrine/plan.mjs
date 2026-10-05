// La vitrine #8855 sur les VRAIS écrans, dans l'ordre du storyboard validé (spec § 3). Lot 2 :
// six scènes ; les appels (3, 4, 10) et le composeur (8) arrivent aux lots suivants.
import { APPAREILS } from '../appstore/plan.mjs'

const dimensions = ({ width, height, scale, prefixe }) => ({ width, height, scale, prefixe })

const CAPTURES = [
  { scene: 'amour', legende: 'L1', theme: 'light' },
  { scene: 'groupe', legende: 'L2', theme: 'light' },
  { scene: 'global', legende: 'L3', theme: 'light', decor: 'bonjours' },
  { scene: 'lien', legende: 'L10', theme: 'light' },
  { scene: 'progression', legende: 'L7', theme: 'light' },
  { scene: 'imagine', legende: 'L13', theme: 'light' },
]

export const VITRINE = {
  iphone: { ...dimensions(APPAREILS.iphone), captures: CAPTURES },
  ipad: { ...dimensions(APPAREILS.ipad), captures: CAPTURES },
}

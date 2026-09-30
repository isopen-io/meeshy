// La vitrine #8855 sur les VRAIS écrans. Lot 1 : trois scènes ; les lots suivants ajoutent les
// sept autres features, dans l'ordre validé par le porteur (spec § 2-3).
import { APPAREILS } from '../appstore/plan.mjs'

const dimensions = ({ width, height, scale, prefixe }) => ({ width, height, scale, prefixe })

const LOT_1 = [
  { scene: 'global', legende: 'L3', theme: 'light', decor: 'bonjours' },
  { scene: 'progression', legende: 'L7', theme: 'light' },
  { scene: 'lien', legende: 'L10', theme: 'light' },
]

export const VITRINE = {
  iphone: { ...dimensions(APPAREILS.iphone), captures: LOT_1 },
  ipad: { ...dimensions(APPAREILS.ipad), captures: LOT_1 },
}

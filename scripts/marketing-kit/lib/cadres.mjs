import { html } from './html.mjs'

// Cadres d'appareil dessinés en CSS — titane, sans Dynamic Island (garde-fou § 1 de
// captures-app-store.md : aucune Live Activity, aucun îlot à l'image).
export const DEVICES = {
  iphone: { ecran: { width: 440, height: 956 }, bezel: 13, radius: 68, ecranRadius: 56 },
  ipad: { ecran: { width: 1376, height: 1032 }, bezel: 24, radius: 52, ecranRadius: 30 },
}

export const cadre = (device, ecran, { finition = 'titane' } = {}) => {
  const d = DEVICES[device]
  const width = d.ecran.width + d.bezel * 2
  const height = d.ecran.height + d.bezel * 2
  return html`<div class="device ${device} ${finition}" style="width:${width}px;height:${height}px;--bezel:${d.bezel}px;--r:${d.radius}px;--sr:${d.ecranRadius}px">
    <span class="btn b1"></span><span class="btn b2"></span><span class="btn b3"></span><span class="btn b4"></span>
    <div class="device-screen">${ecran}</div>
    <span class="device-glare"></span>
  </div>`
}

export const tailleCadre = (device) => {
  const d = DEVICES[device]
  return { width: d.ecran.width + d.bezel * 2, height: d.ecran.height + d.bezel * 2 }
}

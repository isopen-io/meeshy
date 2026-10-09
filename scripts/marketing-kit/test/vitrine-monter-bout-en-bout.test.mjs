// Montage de bout en bout sur des prises SYNTHÉTIQUES (petits clips ffmpeg au rapport de l'écran filmé) :
// aperçu, visuels créatifs, contrôle ffprobe et dépôt dans une arborescence andp temporaire.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { controler, sonderVideo } from '../lib/conformite.mjs'
import { pngInfo } from '../lib/png.mjs'
import { apercuDe } from '../vitrine/apercus.mjs'
import { cheminsDePrise } from '../vitrine/filmer.mjs'
import { deposer, destinationDe, manquesAuDepot } from '../vitrine/monter-depot.mjs'
import { cartesTournees, clipsTournes, controlerSorties, imagesDuClip, monterApercu, monterCreatifs } from '../vitrine/monter.mjs'

const ffmpegPresent = spawnSync('which', ['ffmpeg']).status === 0
const LENT = 180_000

// Un PNG au format demandé, sans navigateur : transparent pour une légende, opaque sinon.
const rendreSansNavigateur = async ({ largeur, hauteur, transparent }) => execFileSync('ffmpeg', [
  '-v', 'error', '-f', 'lavfi', '-i', `color=c=${transparent ? 'white@0.3' : '0x4f46e5'}:s=${largeur}x${hauteur},format=${transparent ? 'rgba' : 'rgb24'}`,
  '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-',
], { maxBuffer: 64 * 1024 * 1024 })

const PRISES = {
  'jeu-frappe': 2.7, 'jeu-coffre': 2.9, 'jeu-rang': 3.1,
  'interaction-emoji': 4.6, 'interaction-sticker': 4.9, 'interaction-commentaire-audio': 7.5,
}
const IMAGES_CLES = { 'jeu-frappe': 'piece-retournee', 'jeu-coffre': 'recompenses', 'jeu-rang': 'rang-revele', 'interaction-emoji': 'reaction' }

const tourner = ({ racine, appareil, lang, scene, secondes }) => {
  const famille = scene.startsWith('jeu-') ? 'jeu' : 'interaction'
  const c = cheminsDePrise({ famille, appareil, langue: lang, scene, racine })
  mkdirSync(dirname(c.clip), { recursive: true })
  const taille = appareil === 'iphone' ? '264x574' : '258x344'
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${taille}:rate=30:duration=${secondes}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', c.clip])
  if (IMAGES_CLES[scene] && appareil === 'iphone') {
    mkdirSync(c.images, { recursive: true })
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=1320x2868', '-frames:v', '1', c.image(IMAGES_CLES[scene])])
  }
}

describe.skipIf(!ffmpegPresent)('montage de bout en bout sur des prises synthétiques (#9807, #9811)', () => {
  let dossier
  let source
  let racine
  const sorties = []

  beforeAll(() => {
    dossier = mkdtempSync(join(tmpdir(), 'monter-'))
    source = join(dossier, 'rushes')
    racine = join(dossier, 'appstore')
    for (const [scene, secondes] of Object.entries(PRISES)) {
      for (const appareil of ['iphone', 'ipad']) tourner({ racine: source, appareil, lang: 'fr', scene, secondes })
    }
    tourner({ racine: source, appareil: 'iphone', lang: 'ar', scene: 'jeu-frappe', secondes: 2 })
  })

  afterAll(() => rmSync(dossier, { recursive: true, force: true }))

  test('les clips tournés sont trouvés à leur place dans out/<famille>/<appareil>/<langue>/, comptés en images', () => {
    const clips = clipsTournes({ apercu: apercuDe('jeu'), appareil: 'iphone', lang: 'fr', source })
    expect(Object.keys(clips)).toEqual(['jeu-frappe', 'jeu-coffre', 'jeu-rang'])
    expect(clips['jeu-rang'].images).toBe(93)
    expect(imagesDuClip(clips['jeu-frappe'].chemin)).toBe(81)
  })

  test('aperçu « le jeu » iPhone : 886×1920, H.264 30 i/s, musique stéréo, durée dans [15, 30] s — conforme ; la bande de légende ne montre jamais l’app', async () => {
    const s = await monterApercu({ apercu: apercuDe('jeu'), appareil: 'iphone', lang: 'fr', source, racine, rendre: rendreSansNavigateur, preset: 'ultrafast' })
    sorties.push(s)
    expect(s.statut).toBe('pret')
    expect(s.chemin.endsWith('/fr-FR/previews/IPHONE_67/01-jeu.mp4')).toBe(true)
    expect(s.plans.map((p) => p.scene ?? 'fin')).toEqual(['jeu-frappe', 'jeu-coffre', 'jeu-rang', 'fin'])
    expect(s.ecartes).toEqual(['jeu-niveau', 'jeu-badge'])
    const sonde = sonderVideo(s.chemin)
    expect(sonde.video).toMatchObject({ codec: 'h264', largeur: 886, hauteur: 1920, cadence: 30, pixels: 'yuv420p' })
    expect(sonde.video.images).toBe(Math.round(s.dureeS * 30))
    expect(sonde.dureeS).toBeGreaterThanOrEqual(15)
    expect(sonde.dureeS).toBeLessThanOrEqual(30)
    expect(sonde.audios).toHaveLength(1)
    expect(sonde.audios[0]).toMatchObject({ codec: 'aac', canaux: 2, frequence: 48000 })
    expect(controler(s.chemin, 'apercu-iphone')).toMatchObject({ conforme: true, erreurs: [] })
    const { dispositionApercu } = await import('../vitrine/apercus.mjs')
    const d = dispositionApercu({ appareil: 'iphone', natif: [264, 574], rognageHaut: 34 })
    const pixel = (x, y) => [...execFileSync('ffmpeg', ['-v', 'error', '-ss', '1.5', '-i', s.chemin, '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])]
    const proche = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 12)
    const CADRE = [0x4f, 0x46, 0xe5]
    expect(proche(pixel(443, Math.round(d.bande / 2)), CADRE)).toBe(true)
    expect(proche(pixel(443, d.ecran.y + Math.round(d.ecran.hauteur / 2)), CADRE)).toBe(false)
  }, LENT)

  test('aperçu « les interactions » iPad en silence stéréo : 1200×1600, conforme, le réel absent est écarté', async () => {
    const s = await monterApercu({ apercu: apercuDe('interactions'), appareil: 'ipad', lang: 'fr', source, racine, rendre: rendreSansNavigateur, musique: 'silence', preset: 'ultrafast' })
    sorties.push(s)
    expect(s.statut).toBe('pret')
    expect(s.ecartes).toEqual(['interaction-emoji-post', 'interaction-reel'])
    expect(controler(s.chemin, 'apercu-ipad')).toMatchObject({ conforme: true })
  }, LENT)

  test('un aperçu dont un plan requis n’est pas tourné n’est pas monté', async () => {
    const s = await monterApercu({ apercu: apercuDe('jeu'), appareil: 'iphone', lang: 'ar', source, racine, rendre: rendreSansNavigateur })
    expect(s).toMatchObject({ statut: 'incomplet', manquants: ['jeu-coffre', 'jeu-rang'] })
    const conversation = await monterApercu({ apercu: apercuDe('conversation'), appareil: 'iphone', lang: 'fr', source, racine, rendre: rendreSansNavigateur })
    expect(conversation.statut).toBe('incomplet')
  })

  test('les cartes créatives prennent les images clés iPhone ; la conversation retombe sur la réaction filmée', () => {
    const { cartes, manquants } = cartesTournees({ lang: 'fr', source, racineCaptures: dossier })
    expect(manquants).toEqual([])
    expect(cartes.map((c) => c.id)).toEqual(['conversation', 'frappe', 'coffre', 'rang'])
    expect(cartes[0].image.endsWith('/interaction/iphone/fr/interaction-emoji/reaction.png')).toBe(true)
    expect(cartes[0].clip.endsWith('/interaction-emoji.mp4')).toBe(true)
    expect(cartesTournees({ lang: 'ar', source, racineCaptures: dossier }).manquants).toEqual(['jeu-coffre/recompenses.png', 'jeu-rang/rang-revele.png'])
  })

  test('en-tête image (tirée des IMAGES CLÉS, pas des clips) et vidéo, visuel de recherche : aux tailles Apple, RVB, vidéo en boucle — conformes', async () => {
    const creatifs = await monterCreatifs({ lang: 'fr', source, racine, rendre: rendreSansNavigateur, preset: 'ultrafast', racineCaptures: dossier })
    sorties.push(...creatifs)
    expect(creatifs.map((c) => [c.spec, c.statut])).toEqual([['entete-image', 'pret'], ['entete-video', 'pret'], ['recherche-image', 'pret']])
    const image = pngInfo(readFileSync(creatifs[0].chemin))
    expect(image).toMatchObject({ width: 3840, height: 1646, colorType: 2 })
    expect(pngInfo(readFileSync(creatifs[2].chemin))).toMatchObject({ width: 3840, height: 2560, colorType: 2 })
    const { dispositionCreatif } = await import('../vitrine/apercus.mjs')
    const carte = dispositionCreatif({ format: 'entete', nombre: 4 }).cartes[1]
    const pixel = execFileSync('ffmpeg', ['-v', 'error', '-i', creatifs[0].chemin, '-vf', `crop=1:1:${carte.x + carte.largeur / 2}:${carte.y + carte.hauteur / 2}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    const [r, g, b] = pixel
    expect(r > 240 && g < 16 && b < 16).toBe(true)
    const video = sonderVideo(creatifs[1].chemin)
    expect(video.video).toMatchObject({ largeur: 3840, hauteur: 1646, cadence: 30 })
    expect(video.dureeS).toBeGreaterThanOrEqual(5)
    for (const c of creatifs) expect(controler(c.chemin, c.spec)).toMatchObject({ conforme: true })
    const boucle = (instant) => execFileSync('ffmpeg', ['-v', 'error', '-ss', instant, '-i', creatifs[1].chemin, '-frames:v', '1', '-vf', 'scale=96:41', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
    const ecart = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length
    expect(ecart(boucle('0'), boucle(String(video.dureeS - 1 / 30)))).toBeLessThan(4)
  }, LENT)

  test('la conversation des créatifs vient de la vraie capture filmée quand elle existe (amour.mov), tirée plein cadre', async () => {
    const captures = join(dossier, 'captures')
    const capture = join(captures, 'Marketing/02-captures/iphone/fr/amour.mov')
    mkdirSync(dirname(capture), { recursive: true })
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=264x574:r=30:d=12', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', capture])
    const { cartes } = cartesTournees({ lang: 'fr', source, racineCaptures: captures })
    expect(cartes[0]).toMatchObject({ id: 'conversation', clip: capture, instantS: 10, debutClipS: 8.5 })
    const creatifs = await monterCreatifs({ lang: 'fr', source, racine: join(dossier, 'as-capture'), rendre: rendreSansNavigateur, preset: 'ultrafast', racineCaptures: captures })
    const { dispositionCreatif } = await import('../vitrine/apercus.mjs')
    const carte = dispositionCreatif({ format: 'entete', nombre: 4 }).cartes[0]
    const [r, g, b] = execFileSync('ffmpeg', ['-v', 'error', '-i', creatifs[0].chemin, '-vf', `crop=1:1:${carte.x + carte.largeur / 2}:${carte.y + 300}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    expect(g > 100 && r < 40 && b < 40).toBe(true)
    for (const c of creatifs) expect(controler(c.chemin, c.spec)).toMatchObject({ conforme: true })
  }, LENT)

  test('--deposer copie chaque fichier à sa place andp, nommé pour l’ordre, et rien d’autre', () => {
    const metadata = join(dossier, 'metadata')
    const copies = deposer({ sorties: controlerSorties(sorties), langs: ['fr'], appareils: [], apercus: [], creatifs: true, entete: 'video', metadata })
    expect(copies.map((c) => c.relatif).sort()).toEqual(['fr-FR/product_page_header/01-entete.mp4', 'fr-FR/search_results/01-recherche.png'])
    const avecApercus = deposer({ sorties, langs: ['fr'], appareils: ['iphone'], apercus: [apercuDe('jeu')], creatifs: false, metadata })
    expect(avecApercus.map((c) => c.relatif)).toEqual(['fr-FR/previews/IPHONE_67/01-jeu.mp4'])
    expect(existsSync(join(metadata, 'fr-FR/previews/IPHONE_67/01-jeu.mp4'))).toBe(true)
    expect(existsSync(join(metadata, 'fr-FR/previews/IPAD_PRO_3GEN_129/02-interactions.mp4'))).toBe(false)
  }, LENT)

  test('l’en-tête image remplace l’en-tête vidéo : un seul en-tête par version', () => {
    const metadata = join(dossier, 'metadata-image')
    deposer({ sorties, langs: ['fr'], appareils: [], apercus: [], entete: 'video', metadata })
    deposer({ sorties, langs: ['fr'], appareils: [], apercus: [], entete: 'image', metadata })
    expect(existsSync(join(metadata, 'fr-FR/product_page_header/01-entete.png'))).toBe(true)
    expect(existsSync(join(metadata, 'fr-FR/product_page_header/01-entete.mp4'))).toBe(false)
  }, LENT)

  test('une sortie non conforme bloque TOUT le dépôt — rien n’est copié', () => {
    const metadata = join(dossier, 'metadata-refus')
    const controle = (fichier, spec) => ({ fichier, spec, conforme: !fichier.endsWith('.png'), erreurs: ['taille fausse'] })
    expect(() => deposer({ sorties, langs: ['fr'], appareils: ['iphone'], apercus: [apercuDe('jeu')], metadata, controle })).toThrow('non conforme')
    expect(existsSync(metadata)).toBe(false)
  })

  test('un aperçu requis absent bloque le dépôt et se nomme', () => {
    const manques = manquesAuDepot({ sorties, langs: ['fr', 'ar'], appareils: ['iphone'], creatifs: false })
    expect(manques).toEqual(['fr-FR/iphone/02-interactions.mp4', 'ar-SA/iphone/01-jeu.mp4', 'ar-SA/iphone/02-interactions.mp4'])
    expect(() => deposer({ sorties, langs: ['ar'], appareils: ['iphone'], creatifs: false, metadata: join(dossier, 'x') })).toThrow('dépôt refusé : 2 fichier(s) requis absent(s)')
  })

  test('les destinations suivent les dossiers andp', () => {
    expect(destinationDe({ sortie: { type: 'apercu', lang: 'ar', appareil: 'ipad', chemin: '/a/02-interactions.mp4' }, metadata: '/m' }))
      .toBe('/m/ar-SA/previews/IPAD_PRO_3GEN_129/02-interactions.mp4')
  })
})

const chromiumPresent = await import('@playwright/test')
  .then(({ chromium }) => existsSync(chromium.executablePath()))
  .catch(() => false)

// La prise RÉELLE du rang (filmer.mjs, simulateur), si elle est sur disque : jamais committée, le test saute
// sans elle. Il prouve que la caméra a bien rejoint le cadrage déclaré : la fin du plan ressemble à la
// fenêtre cible de la dernière image filmée, pas à l'image entière.
const PRISES_REELLES = join(import.meta.dir, '../out/jeu/iphone/fr')
const priseReelle = ['jeu-frappe', 'jeu-coffre', 'jeu-rang'].every((s) => existsSync(join(PRISES_REELLES, `${s}.mp4`)))

describe.skipIf(!ffmpegPresent || !priseReelle)('montage sur les prises réelles françaises (iPhone)', () => {
  test('le jeu se monte conforme, l’écran sous sa bande, et la caméra finit sur le cadrage du rang', async () => {
    const { ROGNAGE_HAUT, cadrageDe, fenetreCible, largeurMinimale, rectAuClip } = await import('../vitrine/cadrages.mjs')
    const { dispositionApercu } = await import('../vitrine/apercus.mjs')
    const { cpSync } = await import('node:fs')
    const dossier = mkdtempSync(join(tmpdir(), 'monter-reel-'))
    try {
      const source = join(dossier, 'rushes')
      for (const scene of ['jeu-frappe', 'jeu-coffre', 'jeu-rang']) {
        cpSync(join(PRISES_REELLES, `${scene}.mp4`), join(source, 'jeu/iphone/fr', `${scene}.mp4`), { recursive: true })
      }
      const s = await monterApercu({ apercu: apercuDe('jeu'), appareil: 'iphone', lang: 'fr', source, racine: join(dossier, 'as'), rendre: rendreSansNavigateur, musique: 'silence', preset: 'ultrafast' })
      expect(controler(s.chemin, 'apercu-iphone')).toMatchObject({ conforme: true })
      const rang = s.plans.findIndex((p) => p.scene === 'jeu-rang')
      expect(s.plans[rang].cadre).toBe(true)
      const debutRang = s.plans.slice(0, rang).reduce((t, p) => t + p.secondes - 0.4, 0)
      const instant = (debutRang + s.plans[rang].secondes - 0.5).toFixed(3)
      const gris = (args) => execFileSync('ffmpeg', ['-v', 'error', ...args, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 24 })
      const { ecran } = dispositionApercu({ appareil: 'iphone', natif: [1320, 2868], rognageHaut: ROGNAGE_HAUT.iphone })
      const interieur = 'scale=40:82,crop=32:60:4:12'
      const basMonte = gris(['-ss', instant, '-i', s.chemin, '-vf', `crop=${ecran.largeur}:${ecran.hauteur}:${ecran.x}:${ecran.y},${interieur}`])
      const clip = join(source, 'jeu/iphone/fr/jeu-rang.mp4')
      const natif = [1320, 2868 - ROGNAGE_HAUT.iphone]
      const rect = rectAuClip({ rect: cadrageDe({ scene: 'jeu-rang', appareil: 'iphone' }), appareil: 'iphone', largeurClip: 1320, rognageHaut: ROGNAGE_HAUT.iphone })
      const f = fenetreCible({ rect, natif, rapport: natif[0] / natif[1], largeurMin: largeurMinimale({ largeurClip: 1320 }) })
      const rogne = `crop=1320:${natif[1]}:0:${ROGNAGE_HAUT.iphone},`
      const fenetre = `crop=${Math.round(f.largeur)}:${Math.round(f.hauteur)}:${Math.round(f.x)}:${Math.round(f.y)},`
      const dernier = ['-sseof', '-0.1', '-i', clip]
      const attenduZoom = gris([...dernier, '-vf', `${rogne}${fenetre}${interieur}`])
      const pleinCadre = gris([...dernier, '-vf', `${rogne}${interieur}`])
      const ecart = (a, b) => a.reduce((t, v, i) => t + Math.abs(v - b[i]), 0) / a.length
      expect(ecart(basMonte, attenduZoom)).toBeLessThan(ecart(basMonte, pleinCadre) / 2)
    } finally {
      rmSync(dossier, { recursive: true, force: true })
    }
  }, LENT)
})

// Rendu dans un processus node à part : plusieurs Chromium lancés dans le même processus bun finissent par
// ne plus démarrer (défaut préexistant de la suite complète, hors de ce lot), le rendu isolé ne l'est pas.
const KIT = join(import.meta.dir, '..')
const SCRIPT_RENDU = `
import { chromium } from '@playwright/test'
import { pngInfo } from '${KIT}/lib/png.mjs'
import { dispositionApercu, dispositionCreatif } from '${KIT}/vitrine/apercus.mjs'
import { pageCadreApercu, pageFin, pageFondCreatif, rendrePage } from '${KIT}/vitrine/surimpressions.mjs'
const pages = {
  'cadre-fr': pageCadreApercu({ texte: 'Monte en rang. Il ne baisse jamais.', lang: 'fr', disposition: dispositionApercu({ appareil: 'iphone', natif: [1320, 2868], rognageHaut: 165 }) }),
  'cadre-ar': pageCadreApercu({ texte: 'ارتقِ في الرتبة. لا تنخفض أبدًا.', lang: 'ar', disposition: dispositionApercu({ appareil: 'ipad', natif: [2064, 2752], rognageHaut: 60 }) }),
  fin: pageFin({ devise: 'Chacun sa langue. Tous se comprennent.', mention: 'Compte Meeshy requis.', lang: 'fr', largeur: 886, hauteur: 1920 }),
  fond: pageFondCreatif({ titre: 'Chacun sa langue. Tous se comprennent.', sousTitre: 'x', lang: 'ar', disposition: dispositionCreatif({ format: 'recherche', nombre: 4, dir: 'rtl' }) }),
}
const navigateur = await chromium.launch()
const sortie = {}
for (const [nom, page] of Object.entries(pages)) sortie[nom] = { ...pngInfo(await rendrePage(navigateur, page)), rtl: page.html.includes('dir="rtl"') }
await navigateur.close()
console.log(JSON.stringify(sortie))
`

describe.skipIf(!chromiumPresent)('surimpressions rendues par Chromium, hors réseau', () => {
  test('cadre de plan (bande de légende, arabe en RTL), carte de fin et fond créatif : OPAQUES, au format', () => {
    const script = join(KIT, `.rendu-test-${process.pid}.mjs`)
    writeFileSync(script, SCRIPT_RENDU)
    const rendus = (() => {
      try {
        return JSON.parse(execFileSync('node', [script], { encoding: 'utf8', timeout: LENT }))
      } finally {
        rmSync(script, { force: true })
      }
    })()
    expect(rendus['cadre-fr']).toMatchObject({ width: 886, height: 1920, colorType: 2, rtl: false })
    expect(rendus['cadre-ar']).toMatchObject({ width: 1200, height: 1600, colorType: 2, rtl: true })
    expect(rendus.fin).toMatchObject({ width: 886, height: 1920, colorType: 2 })
    expect(rendus.fond).toMatchObject({ width: 3840, height: 2560, colorType: 2, rtl: true })
  }, LENT)
})

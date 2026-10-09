import { describe, expect, test } from 'bun:test'
import { KIT_LANGS } from '../lib/locales.mjs'
import { COMPTE_REQUIS, LEGENDES_APERCUS, SOUS_TITRES_CREATIFS } from '../textes/apercus.mjs'
import {
  APERCUS, BORNES_APERCU, CARTE_DE_FIN_IMAGES, CARTES_CREATIVES, FONDU_IMAGES, apercuDe, cheminsAppStore, dispositionCreatif,
  dureeImages, familleDe, imagesDeLecture, legendeDe, planDeMontage,
} from '../vitrine/apercus.mjs'
import { FPS } from '../vitrine/filmer.mjs'
import { SCENES_FILMEES } from '../vitrine/scenes-filmees.mjs'

const clip = (scene, secondes) => ({ [scene]: { chemin: `/rushes/${scene}.mp4`, images: Math.round(secondes * FPS) } })
const clips = (durees) => Object.assign({}, ...Object.entries(durees).map(([scene, s]) => clip(scene, s)))

// Durées réelles attendues des prises : action + marges (scenes-filmees.mjs).
const RUSHES_JEU = { 'jeu-frappe': 2.7, 'jeu-coffre': 2.9, 'jeu-rang': 3.1, 'jeu-niveau': 2.1, 'jeu-badge': 2.2 }
const RUSHES_INTERACTIONS = {
  'interaction-emoji': 4.6, 'interaction-emoji-post': 4.3, 'interaction-sticker': 4.9, 'interaction-commentaire-audio': 7.5,
}

describe('aperçus déclarés (#9807)', () => {
  test('trois aperçus au plus, nommés pour l’ordre : le jeu, les interactions, la conversation (facultative)', () => {
    expect(APERCUS.map((a) => a.fichier)).toEqual(['01-jeu.mp4', '02-interactions.mp4', '03-conversation.mp4'])
    expect(apercuDe('conversation').facultatif).toBe(true)
    expect(APERCUS.length).toBeLessThanOrEqual(3)
  })

  test('le jeu : frappe → coffre → rang requis, niveau et badge si la durée le permet', () => {
    const jeu = apercuDe('jeu')
    expect(jeu.plans.filter((p) => !p.facultatif).map((p) => p.scene)).toEqual(['jeu-frappe', 'jeu-coffre', 'jeu-rang'])
    expect(jeu.plans.filter((p) => p.facultatif).map((p) => p.scene)).toEqual(['jeu-niveau', 'jeu-badge'])
  })

  test('les interactions : emoji, sticker, commentaire audio traduit, et le réel dès qu’il est tourné', () => {
    const scenes = apercuDe('interactions').plans.map((p) => p.scene)
    expect(scenes).toEqual(expect.arrayContaining(['interaction-emoji', 'interaction-sticker', 'interaction-commentaire-audio', 'interaction-reel']))
    expect(apercuDe('interactions').plans.find((p) => p.scene === 'interaction-reel').facultatif).toBe(true)
  })

  test('chaque plan a sa famille de prise et sa légende dans les sept langues', () => {
    for (const apercu of APERCUS) {
      for (const plan of apercu.plans) {
        expect(familleDe(plan)).toBe(SCENES_FILMEES[plan.scene]?.famille ?? plan.famille)
        for (const lang of KIT_LANGS) expect(legendeDe({ scene: plan.scene, lang }).length).toBeGreaterThan(0)
      }
    }
  })

  test('une légende inconnue est refusée, jamais remplacée par une autre langue', () => {
    expect(() => legendeDe({ scene: 'jeu-frappe', lang: 'ko' })).toThrow('légende absente : jeu-frappe/ko')
  })
})

describe('durée de lecture d’une légende', () => {
  test('jamais moins de 3 s ; 1 s + 70 ms par caractère au-delà', () => {
    expect(imagesDeLecture('Level up.')).toBe(3 * FPS)
    const longue = 'Deine Stimme, transkribiert und übersetzt.'
    expect(imagesDeLecture(longue)).toBe(Math.ceil(FPS * (1 + 0.07 * longue.length)))
  })

  test('les caractères arabes comptent en graphèmes, pas en unités de code', () => {
    expect(imagesDeLecture('ارتقِ في الرتبة. لا تنخفض أبدًا.')).toBeGreaterThanOrEqual(3 * FPS)
  })
})

describe('plan de montage', () => {
  test('la durée retranche un fondu par enchaînement', () => {
    expect(dureeImages([{ images: 90 }, { images: 90 }, { images: 75 }])).toBe(255 - 2 * FONDU_IMAGES)
    expect(dureeImages([{ images: 90 }])).toBe(90)
  })

  test('le jeu complet tient dans [15, 30] s, cinq plans — le niveau AVANT le rang — puis la carte de fin', () => {
    const plan = planDeMontage({ apercu: apercuDe('jeu'), lang: 'fr', clips: clips(RUSHES_JEU) })
    expect(plan.statut).toBe('pret')
    expect(plan.segments.map((s) => s.scene ?? s.type)).toEqual(['jeu-frappe', 'jeu-coffre', 'jeu-niveau', 'jeu-rang', 'jeu-badge', 'fin'])
    expect(plan.images).toBeGreaterThanOrEqual(BORNES_APERCU.cibleMinImages)
    expect(plan.images).toBeLessThanOrEqual(BORNES_APERCU.cibleMaxImages)
    expect(plan.dureeS).toBe(plan.images / FPS)
    expect(plan.segments.at(-1)).toEqual({ type: 'fin', images: CARTE_DE_FIN_IMAGES })
  })

  test('trop court, le montage prolonge l’image finale des plans — jamais de ralenti, aucun plan raccourci', () => {
    const plan = planDeMontage({ apercu: apercuDe('jeu'), lang: 'en', clips: clips({ 'jeu-frappe': 1, 'jeu-coffre': 1, 'jeu-rang': 1 }) })
    expect(plan.images).toBe(BORNES_APERCU.cibleMinImages)
    for (const s of plan.segments.filter((x) => x.type === 'clip')) {
      expect(s.images).toBeGreaterThanOrEqual(s.imagesClip)
      expect(s.images).toBeGreaterThanOrEqual(imagesDeLecture(s.legende))
    }
    expect(plan.ecartes).toEqual(['jeu-niveau', 'jeu-badge'])
  })

  test('trop long, les plans facultatifs sautent, la plus faible priorité d’abord', () => {
    const longs = clips({ ...RUSHES_INTERACTIONS, 'interaction-reel': 9, 'interaction-commentaire-audio': 9 })
    const plan = planDeMontage({ apercu: apercuDe('interactions'), lang: 'fr', clips: longs })
    expect(plan.ecartes).toEqual(['interaction-emoji-post'])
    expect(plan.segments.map((s) => s.scene ?? s.type)).toContain('interaction-reel')
    expect(plan.images).toBeLessThanOrEqual(BORNES_APERCU.cibleMaxImages)
  })

  test('trop long avec les seuls plans requis : le maintien de lecture est rendu, puis refus nommé', () => {
    const requisLongs = clips({ 'jeu-frappe': 10, 'jeu-coffre': 10, 'jeu-rang': 10 })
    expect(() => planDeMontage({ apercu: apercuDe('jeu'), lang: 'fr', clips: requisLongs })).toThrow('aperçu trop long')
    const plan = planDeMontage({ apercu: apercuDe('jeu'), lang: 'fr', clips: clips({ 'jeu-frappe': 13, 'jeu-coffre': 13, 'jeu-rang': 2 }) })
    expect(plan.images).toBeLessThanOrEqual(BORNES_APERCU.cibleMaxImages)
    expect(plan.segments.find((s) => s.scene === 'jeu-rang').images).toBeGreaterThanOrEqual(2 * FPS)
  })

  test('un plan requis non tourné : l’aperçu est incomplet et nomme ce qui manque', () => {
    const plan = planDeMontage({ apercu: apercuDe('jeu'), lang: 'fr', clips: clips({ 'jeu-frappe': 3 }) })
    expect(plan).toEqual({ statut: 'incomplet', apercu: 'jeu', manquants: ['jeu-coffre', 'jeu-rang'] })
  })

  test('la carte de fin porte la devise et, pour le jeu et les interactions, la mention du compte requis', () => {
    const jeu = planDeMontage({ apercu: apercuDe('jeu'), lang: 'de', clips: clips(RUSHES_JEU) })
    expect(jeu.fin.mention).toBe(COMPTE_REQUIS.de)
    const conv = planDeMontage({ apercu: apercuDe('conversation'), lang: 'de', clips: clips({ 'conversation-traduite': 12 }) })
    expect(conv.fin.mention).toBeNull()
  })

  test('chaque plan porte la légende de SA langue', () => {
    const plan = planDeMontage({ apercu: apercuDe('jeu'), lang: 'ar', clips: clips(RUSHES_JEU) })
    expect(plan.segments[0].legende).toBe(LEGENDES_APERCUS['jeu-frappe'].ar)
  })
})

describe('visuels créatifs (#9811)', () => {
  test('quatre cartes : la conversation (facultative), la pièce, le coffre, le rang', () => {
    expect(CARTES_CREATIVES.map((c) => c.id)).toEqual(['conversation', 'frappe', 'coffre', 'rang'])
    expect(CARTES_CREATIVES.filter((c) => c.facultative).map((c) => c.id)).toEqual(['conversation'])
  })

  test('cartes centrées, au rapport de l’écran filmé, à l’intérieur du cadre en largeur', () => {
    for (const format of ['entete', 'recherche']) {
      for (const nombre of [3, 4]) {
        const d = dispositionCreatif({ format, nombre })
        const gauche = d.cartes[0].x
        const droite = d.largeur - (d.cartes.at(-1).x + d.cartes.at(-1).largeur)
        expect(Math.abs(gauche - droite)).toBeLessThanOrEqual(1)
        for (const c of d.cartes) expect(Math.abs(c.largeur / c.hauteur - 1320 / 2868)).toBeLessThan(0.002)
      }
    }
  })

  test('les cartes de la recherche tiennent entières ; celles de l’en-tête peuvent filer sous le bord', () => {
    const r = dispositionCreatif({ format: 'recherche', nombre: 4 })
    for (const c of r.cartes) expect(c.y + c.hauteur).toBeLessThanOrEqual(r.hauteur)
  })

  test('en arabe, l’ordre de lecture part de la droite', () => {
    const ltr = dispositionCreatif({ format: 'entete', nombre: 4 })
    const rtl = dispositionCreatif({ format: 'entete', nombre: 4, dir: 'rtl' })
    expect(rtl.cartes.map((c) => c.x)).toEqual(ltr.cartes.map((c) => c.x).reverse())
  })

  test('sous-titres dans les sept langues', () => {
    for (const cle of ['entete', 'recherche']) expect(Object.keys(SOUS_TITRES_CREATIFS[cle]).sort()).toEqual([...KIT_LANGS].sort())
  })
})

describe('chemins : l’arborescence andp, sous out/appstore', () => {
  test('aperçus, en-tête et visuel de recherche par locale App Store', () => {
    const c = cheminsAppStore({ lang: 'pt', racine: '/x' })
    expect(c.apercu('iphone', '01-jeu.mp4')).toBe('/x/pt-BR/previews/IPHONE_67/01-jeu.mp4')
    expect(c.apercu('ipad', '02-interactions.mp4')).toBe('/x/pt-BR/previews/IPAD_PRO_3GEN_129/02-interactions.mp4')
    expect(c.enteteVideo).toBe('/x/pt-BR/product_page_header/01-entete.mp4')
    expect(c.recherche).toBe('/x/pt-BR/search_results/01-recherche.png')
  })
})

describe('textes : aucune promesse que l’app ne tient pas', () => {
  const INTERDITS = [
    /\b80\s*\+|\b200\s+langues/i,
    /avec ta voix|ta voix exacte|with your (own )?voice|your exact voice/i,
    /comprends tout|understand everything/i,
    /offr(e|ez|ir)\s+(tes|vos|des)?\s*meesh|gift(ed)?\s+meesh|earn money|€|\$\s?\d|gratuit|free\b|gratis/i,
    /nouveau|new for|\b20\d\d\b/i,
  ]
  const corpus = [LEGENDES_APERCUS, COMPTE_REQUIS, SOUS_TITRES_CREATIFS].flatMap((t) => JSON.stringify(t).match(/"[^"]{3,}"/g))
  for (const motif of INTERDITS) {
    test(String(motif), () => expect(corpus.filter((t) => motif.test(t))).toEqual([]))
  }

  test('toutes les légendes dans les sept langues', () => {
    for (const parLangue of [...Object.values(LEGENDES_APERCUS), COMPTE_REQUIS]) {
      expect(Object.keys(parLangue).sort()).toEqual([...KIT_LANGS].sort())
    }
  })
})

describe('cadrage : la caméra va où l’action se joue', async () => {
  const { CADRAGES, ROGNAGE_HAUT, ZOOM_MAX, cadrageDe, fenetreCible, filtreCamera, largeurMinimale, rectAuClip } = await import('../vitrine/cadrages.mjs')
  const IPHONE = [1320, 2868]
  const RAPPORT = 1320 / 2868
  const minIphone = largeurMinimale({ largeurClip: 1320 })

  test('les scènes cadrées sur iPhone ont leur rectangle ; ailleurs, plein cadre', () => {
    expect(cadrageDe({ scene: 'jeu-rang', appareil: 'iphone' })).toEqual(CADRAGES['jeu-rang'].iphone)
    expect(cadrageDe({ scene: 'jeu-niveau', appareil: 'iphone' })).toEqual(CADRAGES['jeu-niveau'].iphone)
    expect(cadrageDe({ scene: 'jeu-coffre', appareil: 'iphone' })).toEqual(CADRAGES['jeu-coffre'].iphone)
    expect(cadrageDe({ scene: 'jeu-rang', appareil: 'ipad' })).toBeNull()
    expect(cadrageDe({ scene: 'jeu-badge', appareil: 'iphone' })).toEqual(CADRAGES['jeu-badge'].iphone)
    expect(cadrageDe({ scene: 'interaction-sticker', appareil: 'iphone' })).toBeNull()
    for (const [scene, { iphone }] of Object.entries(CADRAGES)) {
      if (iphone) expect({ scene, dansLEcran: iphone.x >= 0 && iphone.y >= 0 && iphone.x + iphone.largeur <= 1320 && iphone.y + iphone.hauteur <= 2868 }).toEqual({ scene, dansLEcran: true })
    }
  })

  test('zoom borné à ×2,2 : 600 px natifs sur un iPhone de 1320 ; la borne suit la taille du clip', () => {
    expect(ZOOM_MAX).toBe(2.2)
    expect(minIphone).toBeCloseTo(600, 9)
    expect(largeurMinimale({ largeurClip: 660 })).toBeCloseTo(300, 9)
  })

  for (const scene of ['jeu-rang', 'jeu-coffre', 'jeu-niveau']) {
    test(`${scene} : la fenêtre CONTIENT le rectangle, au rapport de l’image, dans l’image, agrandie ×1,6 au moins`, () => {
      const rect = CADRAGES[scene].iphone
      const f = fenetreCible({ rect, natif: IPHONE, rapport: RAPPORT, largeurMin: minIphone })
      expect(f.largeur / f.hauteur).toBeCloseTo(RAPPORT, 9)
      expect(f.x).toBeLessThanOrEqual(rect.x)
      expect(f.y).toBeLessThanOrEqual(rect.y)
      expect(f.x + f.largeur).toBeGreaterThanOrEqual(rect.x + rect.largeur)
      expect(f.y + f.hauteur).toBeGreaterThanOrEqual(rect.y + rect.hauteur)
      expect(f.x).toBeGreaterThanOrEqual(0)
      expect(f.y + f.hauteur).toBeLessThanOrEqual(2868 + 1e-9)
      expect(1320 / f.largeur).toBeGreaterThan(1.6)
      expect(1320 / f.largeur).toBeLessThanOrEqual(ZOOM_MAX + 1e-9)
    })
  }

  test('le rang se resserre sur l’écusson et « Écho V » au zoom maximal', () => {
    const f = fenetreCible({ rect: CADRAGES['jeu-rang'].iphone, natif: IPHONE, rapport: RAPPORT, largeurMin: minIphone })
    expect(1320 / f.largeur).toBeCloseTo(ZOOM_MAX, 6)
  })

  test('la barre d’état est rognée : 165 px natifs sur iPhone, et le rectangle remonte d’autant', () => {
    expect(ROGNAGE_HAUT.iphone).toBe(165)
    expect(rectAuClip({ rect: { x: 0, y: 465, largeur: 10, hauteur: 10 }, appareil: 'iphone', largeurClip: 1320, rognageHaut: 165 }).y).toBe(300)
  })

  test('un écusson minuscule ne fait pas zoomer au-delà de la borne', () => {
    const f = fenetreCible({ rect: { x: 600, y: 900, largeur: 120, hauteur: 120 }, natif: IPHONE, rapport: RAPPORT, largeurMin: minIphone })
    expect(f.largeur).toBeCloseTo(600, 9)
  })

  test('un rectangle au bord ramène la fenêtre dans l’image ; un rectangle trop grand rend l’image entière', () => {
    const coin = fenetreCible({ rect: { x: 0, y: 0, largeur: 100, hauteur: 100 }, natif: IPHONE, rapport: RAPPORT, largeurMin: minIphone })
    expect([coin.x, coin.y]).toEqual([0, 0])
    const tout = fenetreCible({ rect: { x: 0, y: 0, largeur: 1320, hauteur: 2868 }, natif: IPHONE, rapport: RAPPORT, largeurMin: minIphone })
    expect(tout).toEqual({ x: 0, y: 0, largeur: 1320, hauteur: 2868 })
  })

  test('un rectangle déclaré en px natifs se porte à la taille réelle du clip', () => {
    expect(rectAuClip({ rect: { x: 60, y: 450, largeur: 700, hauteur: 550 }, appareil: 'iphone', largeurClip: 660 }))
      .toEqual({ x: 30, y: 225, largeur: 350, hauteur: 275 })
  })

  test('mouvement : image entière jusqu’au début de l’action, cosinus surélevé, évalué image par image', () => {
    const arrivee = fenetreCible({ rect: CADRAGES['jeu-rang'].iphone, natif: IPHONE, rapport: RAPPORT, largeurMin: minIphone })
    const filtre = filtreCamera({ arrivee, natif: IPHONE, debutS: 0.6, dureeS: 0.9 })
    expect(filtre).toMatch(/^perspective=x0=\(0\+/)
    expect(filtre).toContain('clip((in/30-0.6)/0.9\\,0\\,1)')
    expect(filtre).toContain('0.5-0.5*cos(PI*')
    expect(filtre).toMatch(/interpolation=cubic:eval=frame$/)
  })
})

describe('mise en page d’un plan : la légende a sa bande, l’écran se pose dessous', async () => {
  const { dispositionApercu, decalageCarte } = await import('../vitrine/apercus.mjs')

  for (const [appareil, natif, rognage] of [['iphone', [1320, 2868], 165], ['ipad', [2064, 2752], 60]]) {
    test(`${appareil} : bande de 16 %, écran entier sous elle, centré, au rapport de la prise rognée`, () => {
      const d = dispositionApercu({ appareil, natif, rognageHaut: rognage })
      expect(d.bande).toBe(Math.round(d.hauteur * 0.16))
      expect(d.ecran.y).toBeGreaterThan(d.bande)
      expect(d.ecran.y + d.ecran.hauteur).toBeLessThanOrEqual(d.hauteur)
      expect(Math.abs(d.ecran.x - (d.largeur - d.ecran.x - d.ecran.largeur))).toBeLessThanOrEqual(2)
      expect(d.ecran.largeur / d.ecran.hauteur).toBeCloseTo(natif[0] / (natif[1] - rognage), 2)
      for (const v of [d.ecran.x, d.ecran.largeur, d.ecran.hauteur]) expect(v % 2).toBe(0)
    })
  }

  test('carte créative : un écran ancré en bas défile de ce qui dépasse le visuel ; sinon il ne bouge pas', () => {
    const carte = { y: 680, hauteur: 1200 }
    expect(decalageCarte({ carte, hauteurVisuel: 1646, ancre: 'bas' })).toBe(234)
    expect(decalageCarte({ carte, hauteurVisuel: 1646, ancre: 'haut' })).toBe(0)
    expect(decalageCarte({ carte, hauteurVisuel: 2560, ancre: 'bas' })).toBe(0)
  })
})

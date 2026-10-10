import { describe, expect, test } from 'bun:test'
import { KIT_LANGS, appStoreLocale } from '../lib/locales.mjs'
import { MEE_STICKERS } from '../../../apps/web/src/lib/mee/catalog'
import { AMOURS, PUBLICATION, RIRES, TEXTES_STATUT } from '../textes/statut-amour.mjs'
import { AMOUR } from '../textes/amour.mjs'
import { partenaireDe } from '../textes/demo.mjs'
import { documentDeLEcran, repliqueDAmitie } from '../vitrine/statut-amour-ecrans.mjs'
import { svgDesApparitions } from '../vitrine/statut-amour-mee.mjs'
import { CARTE, documentDuStatut, modeleDeLaPage } from '../vitrine/statut-amour-page.mjs'
import {
  AMOUREUX, DUREE_S, ECRAN, FESTIN, FPS, GLOUTONS, HAUTEUR, IMAGES, LARGEUR, PLANS, SONS, SONS_DE_COUP, STICKERS, TEMPS_S,
  argumentsDeMixage, compteARebours, debitVideoKbps, enSecondes, entreeDuPlan, fenetre, fenetreDeLEffet, filtreDeMixage, planDuStatut,
} from '../vitrine/statut-amour-plan.mjs'
import { filtreDeLaPlanche, nomDeLaPlanche, nomDuFichier } from '../vitrine/statut-amour.mjs'

const rapport = (etapes = {}) => ({ bornes: { action: { debutS: 2.5, finS: 8 }, rognage: { debutS: 1.9, finS: 9 } }, etapes })
const prises = () => ({
  'interaction-defilement': { clip: '/c/defilement.mp4', rapport: rapport({ 'reel-1': 0, 'reel-2': 2233, 'reel-3': 4504 }) },
  'interaction-vocal': { clip: '/c/vocal.mp4', rapport: rapport({ original: 3, traduction: 2733 }), repereY: 1602 },
})
const plan = (lang) => planDuStatut({ lang, prises: prises() })
const SANS_ESPACE = /[^\s]/u

describe('la vidéo de statut : sa forme (#9988)', () => {
  test('9:16, 1080×1920, 30 i/s, exactement 25 s', () => {
    expect([LARGEUR, HAUTEUR]).toEqual([1080, 1920])
    expect(LARGEUR / HAUTEUR).toBeCloseTo(9 / 16, 6)
    expect(FPS).toBe(30)
    expect(DUREE_S).toBe(25)
    expect(IMAGES).toBe(750)
  })

  test('le débit vidéo garde le fichier sous 10 Mo, son et conteneur compris', () => {
    const kbps = debitVideoKbps()
    expect(((kbps + 160) * 1000 * DUREE_S) / 8).toBeLessThan(10_000_000 * 0.95)
    expect(kbps).toBeGreaterThan(2000)
  })

  test('chaque langue a son fichier et sa planche, nommés par sa locale', () => {
    expect(KIT_LANGS.map(nomDuFichier)).toContain('meeshy-amour-fr-FR.mp4')
    expect(new Set(KIT_LANGS.map(nomDuFichier)).size).toBe(7)
    expect(nomDeLaPlanche('ar')).toBe(`planche-${appStoreLocale('ar')}.jpg`)
  })

  test('la planche prend une image toutes les 0,5 s : cinquante vignettes', () => {
    const f = filtreDeLaPlanche()
    expect(f.startsWith('fps=2,')).toBe(true)
    expect(f).toContain('tile=10x5')
  })
})

describe('la vidéo de statut : peu de plans, longs, une transition différente à chaque passage (#9988)', () => {
  test('quatre plans et la signature, chacun d’au moins 4 s', () => {
    const p = plan('fr')
    expect(p.plans.map((x) => x.id)).toEqual(['rire', 'amis', 'complices', 'amour', 'signature'])
    p.plans.slice(0, 4).forEach((x) => expect(x.finS - x.debutS).toBeGreaterThanOrEqual(4))
  })

  test('les plans se suivent sans trou, sur les temps de la musique, et la signature finit à 25 s', () => {
    const p = plan('fr')
    p.plans.slice(0, 3).forEach((x, i) => expect(p.plans[i + 1].debutS).toBe(x.finS))
    expect(p.plans.at(-1).finS).toBe(DUREE_S)
    PLANS.forEach((x) => expect(Number.isInteger(x.de)).toBe(true))
    expect(enSecondes(12)).toBeCloseTo(12 * TEMPS_S, 3)
  })

  test('quatre transitions, toutes différentes : éclair, toiles, poussée, festin', () => {
    const sorties = PLANS.filter((x) => x.sortie).map((x) => x.sortie)
    expect(sorties).toEqual(['eclair', 'toiles', 'poussee', 'festin'])
    expect(new Set(sorties).size).toBe(sorties.length)
  })

  test('le festin tient entre la fin de l’amour et la signature, ses trois bouchées dedans', () => {
    const p = plan('fr')
    expect(p.festin.debutS).toBe(p.plans.find((x) => x.id === 'amour').finS)
    expect(p.festin.finS).toBe(p.plans.find((x) => x.id === 'signature').debutS)
    expect(enSecondes(FESTIN.a)).toBe(p.festin.finS)
    p.festin.bouchees.forEach((b) => { expect(b).toBeGreaterThan(p.festin.debutS); expect(b).toBeLessThan(p.festin.finS) })
  })

  test('un plan filmé entre dans sa prise à l’étape qu’il déclare', () => {
    const vocal = PLANS.find((x) => x.id === 'complices')
    expect(entreeDuPlan({ plan: vocal, rapport: rapport({ original: 3, traduction: 2733 }) })).toBeCloseTo(0.6 + 0.003 - 0.4, 3)
  })

  test('la caméra du vocal suit le bouton lu dans la prise, et se retourne en arabe', () => {
    const fr = plan('fr').plans.find((x) => x.id === 'complices')
    const brut = PLANS.find((x) => x.id === 'complices')
    expect(fr.camera.de.y - brut.camera.de.y).toBeCloseTo(40, 3)
    const ar = plan('ar').plans.find((x) => x.id === 'complices')
    expect(ar.camera.a.x).toBeCloseTo(ECRAN.largeur - fr.camera.a.x - fr.camera.a.largeur, 3)
  })

  test('une fenêtre de caméra reste dans l’écran, au rapport de la carte', () => {
    const f = fenetre(660, 2800, 1.3)
    expect(f.y + f.hauteur).toBeLessThanOrEqual(ECRAN.y + ECRAN.hauteur + 1e-9)
    expect(f.largeur / f.hauteur).toBeCloseTo(CARTE.face / CARTE.hauteurFace, 2)
  })
})

describe('la vidéo de statut : Mee et Meo, avec leur vrai dessin (#9988)', () => {
  test('ils tombent amoureux À PLUSIEURS REPRISES : regards, Cupidon, cœur lancé, bisou, fleurs, câlin, bague', () => {
    expect(AMOUREUX.map((m) => m.sticker)).toEqual(expect.arrayContaining([
      'mee-amoureuse', 'meo-love', 'duo-mee-cupidon', 'duo-mee-coeur-lance', 'duo-meo-bisou', 'duo-mee-fleurs', 'duo-meo-calin', 'duo-mee-bague',
    ]))
    expect(AMOUREUX.at(-1).sticker).toBe('duo-mee-bague')
  })

  test('chaque sticker vient du catalogue du web, aucun n’est inventé', () => {
    const connus = new Set(MEE_STICKERS.map((s) => s.id))
    STICKERS.forEach((id) => expect(connus.has(id)).toBe(true))
  })

  test('chaque apparition a son SVG, aux identifiants uniques', () => {
    const svgs = svgDesApparitions([{ id: 'a', sticker: GLOUTONS.mee }, { id: 'b', sticker: GLOUTONS.mee }])
    expect(svgs.a).toContain('<svg')
    expect(svgs.a).not.toBe(svgs.b)
    expect(() => svgDesApparitions([{ id: 'x', sticker: 'mee-dessin-invente' }])).toThrow()
  })

  test('les apparitions ne se chevauchent pas au même coin, et se retournent en arabe', () => {
    const fr = plan('fr').amoureux, ar = plan('ar').amoureux
    fr.forEach((m, i) => expect(ar[i].x).toBe(540 - m.x))
    fr.forEach((m) => { expect(m.de).toBeLessThan(m.a); expect(m.a).toBeLessThanOrEqual(DUREE_S) })
  })
})

describe('la vidéo de statut : les textes dans les sept langues (#9988)', () => {
  test('chaque titre, sous-titre, la devise et les légendes de publication existent dans chaque langue', () => {
    for (const lang of KIT_LANGS) {
      for (const bloc of ['rire', 'amis', 'complices', 'amour']) {
        expect(TEXTES_STATUT[bloc].titre[lang]).toMatch(SANS_ESPACE)
        expect(TEXTES_STATUT[bloc].sousTitre[lang]).toMatch(SANS_ESPACE)
      }
      expect(TEXTES_STATUT.devise[lang]).toMatch(SANS_ESPACE)
      const pub = PUBLICATION[lang]
      expect(pub.statut).toContain('meeshy.me')
      expect(pub.description).toContain('https://meeshy.me')
      expect([...pub.titre].length).toBeLessThanOrEqual(100)
    }
  })

  test('aucune légende de statut ne dépasse 200 caractères', () => {
    KIT_LANGS.forEach((lang) => expect([...PUBLICATION[lang].statut].length).toBeLessThanOrEqual(200))
  })

  test('« plus que 12 jours » est la réplique du partenaire, servie dans la langue du lecteur', () => {
    expect(compteARebours('fr')).toBe(AMOUR.jours.ko.translations.fr)
    expect(compteARebours('de')).toBe(AMOUR.jours.ja.translations.de)
  })

  test('le vocal et l’amitié annoncent la langue du partenaire vers celle du lecteur', () => {
    const p = plan('de')
    expect(p.plans.find((x) => x.id === 'complices').langues.origine.code).toBe(partenaireDe('de').lang)
    expect(p.plans.find((x) => x.id === 'amis').langues.lecteur.code).toBe('de')
  })

  test('le rire et l’amour du fond sont dits dans plusieurs langues', () => {
    expect(RIRES.length).toBeGreaterThanOrEqual(8)
    expect(AMOURS.length).toBeGreaterThanOrEqual(8)
  })
})

describe('la vidéo de statut : la conversation d’amitié (#9988)', () => {
  test('Aiko écrit en japonais, Min-jun en coréen, et la traduction servie est celle du kit', () => {
    const ja = repliqueDAmitie('dm.annonce', 'ja')
    const ko = repliqueDAmitie('dm.annonce', 'ko')
    expect(ja.lang).toBe('ja')
    expect(ko.lang).toBe('ko')
    expect(ja.translations).toBe(ko.translations)
    expect(() => repliqueDAmitie('dm.annonce', 'es')).toThrow()
  })

  test('l’écran est écrit avec le partenaire du lecteur, en miroir en arabe', () => {
    const fr = documentDeLEcran({ ecran: 'amitie', lang: 'fr' })
    expect(fr).toContain('Nova joue samedi')
    expect(fr).toContain('Min-jun')
    const ar = documentDeLEcran({ ecran: 'amitie', lang: 'ar' })
    expect(ar).toContain('dir="rtl"')
    expect(ar).toContain('Aiko')
  })
})

describe('la vidéo de statut : le son (#9988)', () => {
  test('chaque effet a sa licence Mixkit et son empreinte', () => {
    Object.values(SONS).forEach((s) => {
      expect(s.licence).toBe('https://mixkit.co/license/#sfxFree')
      expect(s.sha256).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  test('chaque coup tombe sur son instant, jamais avant la vidéo', () => {
    plan('fr').reperes.forEach((r) => {
      expect(r.departS).toBeGreaterThanOrEqual(0)
      expect(r.departS + (r.picS - r.debutFichierS)).toBeCloseTo(r.instantS, 3)
    })
  })

  test('le croquement ne garde que la bouchée, pas l’enregistrement qui la précède', () => {
    const r = plan('fr').reperes.find((x) => x.son === 'croque')
    expect(r.picS - r.debutFichierS).toBeLessThan(0.1)
    expect(fenetreDeLEffet(r)).toContain(`end=${(r.picS + SONS.croque.dureeS).toFixed(3)}`)
  })

  test('les coups creusent la musique (sidechain), les souffles non', () => {
    const reperes = plan('fr').reperes
    const filtre = filtreDeMixage({ reperes })
    expect(filtre).toContain('sidechaincompress')
    const cles = filtre.split(';').find((x) => x.endsWith('[cle]'))
    expect((cles.match(/\[k\d+\]/g) ?? []).length).toBe(reperes.filter((r) => SONS_DE_COUP.has(r.son)).length)
    expect(SONS_DE_COUP.has('souffle')).toBe(false)
  })

  test('le mixage prend la musique puis un fichier par repère, à -16 LUFS', () => {
    const reperes = plan('fr').reperes
    const args = argumentsDeMixage({ musique: 'm.mp3', sons: Object.fromEntries(Object.keys(SONS).map((k) => [k, `${k}.wav`])), reperes })
    expect(args.filter((a) => a === '-i').length).toBe(reperes.length + 1)
    expect(args.join(' ')).toContain('loudnorm=I=-16')
  })
})

describe('la vidéo de statut : la page (#9988)', () => {
  test('le document pose les deux moitiés de l’éclair, les stickers, la signature, et se retourne en arabe', () => {
    for (const lang of ['fr', 'ar']) {
      const p = plan(lang)
      const images = { rire: { dossier: 'images/rire', nombre: 200 }, complices: { dossier: 'images/complices', nombre: 200 } }
      const modele = modeleDeLaPage({ plan: p, images, ecrans: { amis: '<p>amis</p>', 'amour': '<p>amour</p>' } })
      const svgs = Object.fromEntries([...AMOUREUX.map((m) => m.id), 'glouton-mee', 'glouton-meo'].map((id) => [id, `<svg id="s-${id}"></svg>`]))
      const html = documentDuStatut({ lang, dir: p.dir, modele, svgs })
      expect(html).toContain('id="plan-rire-a"')
      expect(html).toContain('id="plan-rire-b"')
      expect(html).toContain('id="s-bague"')
      expect(html).toContain('id="glouton-meo"')
      expect(html).toContain(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`)
      expect(html).toContain('meeshy.me')
      expect(html).toContain('srcdoc="<p>amis</p>"')
    }
  })
})

describe('la vidéo de statut : les textes de publication (#9988)', () => {
  test('TEXTES.md donne, pour chaque langue, la légende, le titre et la description', async () => {
    const { textesDePublication } = await import('../vitrine/statut-amour.mjs')
    const md = textesDePublication()
    KIT_LANGS.forEach((lang) => {
      expect(md).toContain(nomDuFichier(lang))
      expect(md).toContain(PUBLICATION[lang].statut)
      expect(md).toContain(PUBLICATION[lang].titre)
    })
  })
})

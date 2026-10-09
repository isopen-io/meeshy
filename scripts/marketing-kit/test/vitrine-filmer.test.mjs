import { describe, expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KIT_LANGS } from '../lib/locales.mjs'
import {
  APPAREILS, FPS, TAILLES_APPSTORE, argumentsAppStore, argumentsClip, argumentsEmpreintes, argumentsImage, bornesDeLaPrise,
  MOUVEMENT, ancreSurLeMouvement, cheminsDePrise, commandeDeGeste, etapesDe, fenetresDeMouvement, instantDeLImage, premierMouvement, filtreCadenceFixe, imagesFigees, lireEmpreintes, marqueursDe,
  planDePrise, selectionner,
} from '../vitrine/filmer.mjs'
import { SCENES_FILMEES } from '../vitrine/scenes-filmees.mjs'

const JEU = ['jeu-rang', 'jeu-coffre', 'jeu-frappe', 'jeu-niveau', 'jeu-badge']

describe('plan de prise (#9806)', () => {
  test('les cinq célébrations du jeu sont filmables, bornées par les marqueurs de l’app', () => {
    expect(Object.keys(SCENES_FILMEES)).toEqual(expect.arrayContaining(JEU))
    for (const scene of JEU) {
      for (const appareil of APPAREILS) {
        const plan = planDePrise({ scene, appareil })
        expect(plan.famille).toBe('jeu')
        expect(marqueursDe(plan)).toEqual(['celebration-debut.txt', 'celebration-fin.txt'])
        expect(plan.montreUnFil).toBe(false)
        expect(plan.imagesCles.length).toBeGreaterThan(0)
        for (const [, fin] of plan.mouvement.filter(Array.isArray)) expect(fin).toBeLessThanOrEqual(plan.dureeMs)
      }
    }
  })

  test('chaque scène filmée donne le clap go.txt sur les deux appareils : l’app n’agit qu’une fois l’enregistreur lancé', () => {
    for (const scene of Object.keys(SCENES_FILMEES)) {
      for (const appareil of APPAREILS) {
        const { gestes } = planDePrise({ scene, appareil })
        expect(gestes.filter((g) => g.type === 'fichier' && g.nom === 'go.txt')).toHaveLength(1)
        expect(gestes.at(-1)).toEqual({ type: 'fichier', nom: 'go.txt' })
      }
    }
  })

  test('les interactions sont filmables, jouées par l’app au clap et bornées par ses marqueurs (#9810)', () => {
    for (const scene of ['interaction-frappe', 'interaction-emoji', 'interaction-emoji-post', 'interaction-commentaire-audio', 'interaction-sticker', 'interaction-reel']) {
      for (const appareil of APPAREILS) {
        const plan = planDePrise({ scene, appareil })
        expect(plan.famille).toBe('interaction')
        expect(marqueursDe(plan)).toEqual(['celebration-debut.txt', 'celebration-fin.txt'])
        expect(plan.gestes).toEqual([{ type: 'fichier', nom: 'go.txt' }])
        expect(plan.imagesCles.length).toBeGreaterThan(0)
        for (const [, fin] of plan.mouvement.filter(Array.isArray)) expect(fin).toBeLessThanOrEqual(plan.dureeMs)
      }
    }
    expect(SCENES_FILMEES['interaction-emoji'].montreUnFil).toBe(true)
    expect(SCENES_FILMEES['interaction-frappe'].montreUnFil).toBe(false)
  })

  test('les durées sont celles de GameTimeline', () => {
    const durees = Object.fromEntries(JEU.map((s) => [s, SCENES_FILMEES[s].dureeMs]))
    expect(durees).toEqual({ 'jeu-rang': 1600, 'jeu-coffre': 1400, 'jeu-frappe': 1200, 'jeu-niveau': 600, 'jeu-badge': 700 })
  })

  test('une scène d’interaction se décrit en données : gestes par appareil, début après le dernier geste, durée', () => {
    const scenes = {
      'interaction-emoji': {
        scene: 'interaction-emoji', famille: 'interaction', theme: 'light', montreUnFil: true,
        debut: { apresGestesMs: 0 }, fin: null, dureeMs: 2000, marges: { avantMs: 500, apresMs: 500 },
        mouvement: [[100, 1500]], imagesCles: [{ nom: 'reaction', instantMs: 1200 }],
        gestes: { iphone: [{ type: 'tap', x: 200, y: 600 }, { type: 'attendre', ms: 800 }, { type: 'swipe', de: [200, 600], a: [200, 300], dureeS: 0.2 }] },
      },
    }
    const plan = planDePrise({ scene: 'interaction-emoji', appareil: 'iphone', scenes })
    expect(plan.gestes).toHaveLength(3)
    expect(marqueursDe(plan)).toEqual([])
    expect(planDePrise({ scene: 'interaction-emoji', appareil: 'ipad', scenes }).gestes).toEqual([])
  })

  test('un geste à coordonnées non entières est refusé : idb ne les accepte pas', () => {
    const scenes = { s: { ...SCENES_FILMEES['jeu-rang'], scene: 's', gestes: { iphone: [{ type: 'tap', x: 10.5, y: 3 }] } } }
    expect(() => planDePrise({ scene: 's', appareil: 'iphone', scenes })).toThrow('ENTIÈRES')
  })

  test('une scène sans fin déclarée ni durée est refusée', () => {
    const scenes = { s: { ...SCENES_FILMEES['jeu-rang'], scene: 's', fin: null, dureeMs: 0 } }
    expect(() => planDePrise({ scene: 's', appareil: 'iphone', scenes })).toThrow('dureeMs')
  })

  test('une scène inconnue est nommée avec la liste des connues', () => {
    expect(() => planDePrise({ scene: 'jeu-dragon', appareil: 'iphone' })).toThrow('jeu-dragon')
  })
})

describe('fenêtres ancrées sur une étape de l’app (#9810)', () => {
  test('une fenêtre ancrée se décale de l’instant où l’app a daté son étape ; une fenêtre fixe reste en ms d’action', () => {
    const fenetres = fenetresDeMouvement({
      mouvement: [[40, 300], { etape: 'choix', de: 150, a: 420 }],
      etapesMs: { choix: 11_380 },
      debutActionMs: 10_000,
    })
    expect(fenetres).toEqual([[40, 300], [1530, 1800]])
  })

  test('une étape que l’app n’a pas datée fait échouer la prise en la nommant', () => {
    expect(() => fenetresDeMouvement({ mouvement: [{ etape: 'choix', de: 0, a: 100 }], etapesMs: {}, debutActionMs: 0 }))
      .toThrow('etape-choix.txt')
  })

  test('les étapes d’un plan sont celles que ses fenêtres et ses images clés nomment, une fois chacune', () => {
    const plan = {
      mouvement: [[0, 10], { etape: 'choix', de: 0, a: 5 }, { etape: 'choix', de: 6, a: 9 }, { etape: 'menu', de: 0, a: 1 }],
      imagesCles: [{ nom: 'a', instantMs: 0 }, { nom: 'b', etape: 'reel', instantMs: 900 }],
    }
    expect(etapesDe(plan)).toEqual(['choix', 'menu', 'reel'])
  })

  test('une image clé ancrée se tire à son étape + son décalage ; sans étape, depuis le début de l’action', () => {
    expect(instantDeLImage({ image: { nom: 'a', instantMs: 800 }, etapes: {} })).toBe(800)
    expect(instantDeLImage({ image: { nom: 'b', etape: 'choix', instantMs: 900 }, etapes: { choix: 1350 } })).toBe(2250)
    expect(() => instantDeLImage({ image: { nom: 'b', etape: 'choix', instantMs: 0 }, etapes: {} })).toThrow('choix')
  })

  test('une fenêtre ancrée sans étape, ou vide, est refusée', () => {
    const sansEtape = { s: { ...SCENES_FILMEES['jeu-rang'], scene: 's', mouvement: [{ de: 0, a: 10 }] } }
    expect(() => planDePrise({ scene: 's', appareil: 'iphone', scenes: sansEtape })).toThrow('étape')
    const vide = { s: { ...SCENES_FILMEES['jeu-rang'], scene: 's', mouvement: [{ etape: 'x', de: 10, a: 10 }] } }
    expect(() => planDePrise({ scene: 's', appareil: 'iphone', scenes: vide })).toThrow('vide')
  })
})

describe('le premier mouvement, lu dans le film', () => {
  test('la première image qui change après le début de l’action, en ms d’action', () => {
    const e = ['a', 'a', 'a', 'a', 'a', 'a', 'b', 'c', 'c']
    // 30 i/s : image 6 à 200 ms du clip ; l’action commence à 100 ms ⇒ 100 ms d’action.
    expect(premierMouvement({ empreintes: e, origineMs: 100 })).toBe(100)
  })

  test('un changement AVANT l’action ne compte pas ; aucun changement ⇒ null', () => {
    expect(premierMouvement({ empreintes: ['a', 'b', 'b', 'b', 'c'], origineMs: 100 })).toBe(33)
    expect(premierMouvement({ empreintes: ['a', 'a', 'a'], origineMs: 0 })).toBeNull()
  })

  test('« mouvement » est une étape virtuelle : aucun fichier n’est attendu de l’app', () => {
    const plan = { mouvement: [{ etape: MOUVEMENT, de: 20, a: 400 }], imagesCles: [{ nom: 'x', etape: 'servi', instantMs: 0 }] }
    expect(etapesDe(plan)).toEqual(['servi'])
    expect(ancreSurLeMouvement(plan)).toBe(true)
    expect(() => fenetresDeMouvement({ mouvement: plan.mouvement, etapesMs: {}, debutActionMs: 0 })).toThrow('aucune image ne bouge')
  })
})

describe('gestes simulés', () => {
  test('toucher, glisser, attendre, déposer un fichier', () => {
    expect(commandeDeGeste({ geste: { type: 'tap', x: 38, y: 488 }, udid: 'U' })).toEqual({ idb: ['ui', 'tap', '--udid', 'U', '38', '488'] })
    expect(commandeDeGeste({ geste: { type: 'swipe', de: [10, 20], a: [30, 40], dureeS: 0.5 }, udid: 'U' }))
      .toEqual({ idb: ['ui', 'swipe', '--udid', 'U', '10', '20', '30', '40', '--duration', '0.5'] })
    expect(commandeDeGeste({ geste: { type: 'attendre', ms: 900 }, udid: 'U' })).toEqual({ attendreMs: 900 })
    expect(commandeDeGeste({ geste: { type: 'fichier', nom: 'go.txt' }, udid: 'U' })).toEqual({ fichier: 'go.txt' })
  })
})

describe('nommage', () => {
  test('clip, images clés, rapport et aperçu App Store par famille, appareil, langue et scène', () => {
    const c = cheminsDePrise({ famille: 'jeu', appareil: 'ipad', langue: 'de', scene: 'jeu-coffre', racine: '/k/out' })
    expect(c.clip).toBe('/k/out/jeu/ipad/de/jeu-coffre.mp4')
    expect(c.image('coffre-ouvert')).toBe('/k/out/jeu/ipad/de/jeu-coffre/coffre-ouvert.png')
    expect(c.rapport).toBe('/k/out/jeu/ipad/de/jeu-coffre.rapport.json')
    expect(c.appstore).toBe('/k/out/jeu/ipad/de/jeu-coffre.appstore.mp4')
    expect(c.source).toBe('/k/out/jeu/brut/ipad/de/jeu-coffre.mov')
  })
})

describe('bornes et rognage', () => {
  const marges = { avantMs: 600, apresMs: 900 }

  test('l’action et le rognage en secondes de la vidéo, depuis le « Recording started »', () => {
    const b = bornesDeLaPrise({ debutEnregistrementMs: 10_000, debutActionMs: 13_200, finActionMs: 14_800, marges })
    expect(b.action).toEqual({ debutS: 3.2, finS: 4.8 })
    expect(b.rognage).toEqual({ debutS: 2.6, finS: 5.7 })
  })

  test('une action partie trop tôt, avant la marge, est refusée : son début manquerait au film', () => {
    expect(() => bornesDeLaPrise({ debutEnregistrementMs: 10_000, debutActionMs: 10_300, finActionMs: 11_000, marges })).toThrow('attendre davantage')
  })

  test('cadence fixe AVANT le rognage, dernière image prolongée jusqu’à la marge', () => {
    expect(filtreCadenceFixe({ debutS: 2.6, finS: 5.7 })).toBe('fps=30,tpad=stop_mode=clone:stop_duration=5.7,trim=start=2.6:end=5.7,setpts=PTS-STARTPTS')
  })

  test('le clip est en H.264 à 30 i/s, sans son, taille native (aucune mise à l’échelle)', () => {
    const args = argumentsClip({ source: 's.mov', rognage: { debutS: 1, finS: 2 }, sortie: 'c.mp4' })
    expect(args).toEqual(expect.arrayContaining(['libx264', 'yuv420p', '-an']))
    expect(args[args.indexOf('-r') + 1]).toBe(String(FPS))
    expect(args.join(' ')).not.toMatch(/scale=/)
  })

  test('une image clé est tirée de la source, à l’instant déclaré', () => {
    const args = argumentsImage({ source: 's.mov', instantS: 4, sortie: 'i.png' })
    expect(args).toEqual(expect.arrayContaining(['-frames:v', '1', 'i.png']))
    expect(args.join(' ')).toContain('trim=start=4:')
  })

  test('aperçu App Store : 886×1920 sur iPhone, 1200×1600 sur iPad, piste stéréo muette', () => {
    expect(TAILLES_APPSTORE).toEqual({ iphone: [886, 1920], ipad: [1200, 1600] })
    const args = argumentsAppStore({ clip: 'c.mp4', appareil: 'iphone', sortie: 'a.mp4' }).join(' ')
    expect(args).toContain('scale=886:1920:force_original_aspect_ratio=increase')
    expect(args).toContain('crop=886:1920')
    expect(args).toContain('anullsrc=channel_layout=stereo')
  })
})

describe('aucune image figée ni perdue', () => {
  const empreintes = (suite) => suite.split('')

  test('lit la sortie framemd5 de ffmpeg', () => {
    const texte = '#format: frame checksums\n#stream#, dts, pts, duration, size, hash\n0, 0, 0, 1, 100, aaa\n0, 1, 1, 1, 100, bbb\n'
    expect(lireEmpreintes(texte)).toEqual(['aaa', 'bbb'])
  })

  test('une image répétée DANS le mouvement est une image perdue, groupée par séquence', () => {
    const figees = imagesFigees({ empreintes: empreintes('abcddeffgh'), origineMs: 0, fenetres: [[0, 1000]], fps: 10 })
    expect(figees).toEqual([{ debutMs: 400, finMs: 400, images: 1 }, { debutMs: 700, finMs: 700, images: 1 }])
  })

  test('trois images identiques de suite font UNE séquence de deux images perdues', () => {
    expect(imagesFigees({ empreintes: empreintes('abccce'), origineMs: 0, fenetres: [[0, 1000]], fps: 10 }))
      .toEqual([{ debutMs: 300, finMs: 400, images: 2 }])
  })

  test('les repos prévus (marges, fins d’easing hors fenêtre) ne comptent pas', () => {
    expect(imagesFigees({ empreintes: empreintes('aaabcdeeee'), origineMs: 300, fenetres: [[0, 300]], fps: 10 })).toEqual([])
  })

  test('les instants sont comptés depuis le début de l’action, pas du clip', () => {
    expect(imagesFigees({ empreintes: empreintes('aaabbcd'), origineMs: 300, fenetres: [[0, 500]], fps: 10 }))
      .toEqual([{ debutMs: 100, finMs: 100, images: 1 }])
  })
})

describe('sélection', () => {
  test('--tout : toutes les scènes, les 7 langues, iPhone puis iPad', () => {
    const s = selectionner({ tout: true })
    expect(s.scenes).toEqual(Object.keys(SCENES_FILMEES))
    expect(s.langues).toEqual(KIT_LANGS)
    expect(s.appareils).toEqual(['iphone', 'ipad'])
  })

  test('une scène, une langue, l’iPhone par défaut', () => {
    expect(selectionner({ scene: 'jeu-rang', langue: 'fr' })).toEqual({ scenes: ['jeu-rang'], langues: ['fr'], appareils: ['iphone'] })
    expect(selectionner({ scene: 'jeu-rang,jeu-badge', langue: 'all', appareil: 'ipad' }).langues).toEqual(KIT_LANGS)
  })

  test('rien de choisi, une langue ou un appareil inconnus : refus nommé', () => {
    expect(() => selectionner({})).toThrow('--tout')
    expect(() => selectionner({ scene: 'jeu-rang', langue: 'ja' })).toThrow('« ja »')
    expect(() => selectionner({ scene: 'jeu-rang', appareil: 'mac' })).toThrow('« mac »')
  })
})

const ffmpegPresent = spawnSync('which', ['ffmpeg']).status === 0

describe.skipIf(!ffmpegPresent)('vérification image par image sur une vraie vidéo à cadence variable', () => {
  // 60 i/s pendant 2 s ; la variante « trouée » n'a aucune image entre 1,0 et 1,2 s, comme une capture
  // simulateur dont l'écran s'est figé — la cadence fixe doit y répéter des images.
  const fabriquer = (dossier, nom, filtre) => {
    const sortie = join(dossier, nom)
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=60:duration=2',
      ...(filtre ? ['-vf', filtre] : []), '-fps_mode', 'vfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', sortie])
    return sortie
  }
  const figeesDe = (source) => {
    const texte = execFileSync('ffmpeg', argumentsEmpreintes({ source, rognage: { debutS: 0.5, finS: 1.8 } }), { encoding: 'utf8' })
    return imagesFigees({ empreintes: lireEmpreintes(texte), origineMs: 500, fenetres: [[0, 1000]] })
  }

  test('une prise fluide passe, une prise trouée est refaite', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'filmer-'))
    try {
      expect(figeesDe(fabriquer(dossier, 'fluide.mp4'))).toEqual([])
      const trouee = figeesDe(fabriquer(dossier, 'trouee.mp4', "select='not(between(t,1.0,1.2))'"))
      expect(trouee).toHaveLength(1)
      expect(trouee[0].images).toBeGreaterThanOrEqual(5)
      expect(trouee[0].debutMs).toBeGreaterThanOrEqual(0)
      expect(trouee[0].finMs).toBeLessThanOrEqual(250)
    } finally {
      rmSync(dossier, { recursive: true, force: true })
    }
  })
})

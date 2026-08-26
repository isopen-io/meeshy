/**
 * Le contrat du composer — loi PRODUIT partagée par iOS et le web.
 *
 * @see docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md
 * @see tasks/todo-composer-lot-c-et-v2-2026-08-23.md — V0
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  COMPOSER_DOORS,
  COMPOSER_FORMATS,
  composerOpening,
  buildUpdatePayload,
  type ComposerDoor,
} from '../utils/composer-contract'

const withReel = { compositionQualifiesAsReel: true }
const withoutReel = { compositionQualifiesAsReel: false }

describe('les portes du composer', () => {
  it('il y en a NEUF — le forward n\'en est pas une, c\'est une seconde entrée de conversationMedia', () => {
    expect(COMPOSER_DOORS).toHaveLength(9)
  })

  it('chaque porte a un nom unique', () => {
    expect(new Set(COMPOSER_DOORS).size).toBe(COMPOSER_DOORS.length)
  })
})

/**
 * Les quatre formats, ÉNUMÉRABLES à l'exécution.
 *
 * `COMPOSER_DOORS` porte déjà cette forme pour les portes ; l'union des formats
 * ne l'avait pas, et chaque consommateur en réécrivait la liste à la main (le
 * catalogue i18n du web, sa table d'icônes, ses vecteurs de test). Une liste
 * réécrite ne rougit pas le jour où un cinquième format entre dans l'union :
 * elle reste verte en itérant sur quatre.
 *
 * Ce compagnon n'AJOUTE aucune loi — c'est la même union, écrite une fois de
 * manière lisible à l'exécution. La loi 1 tient : aucune affordance ne descend
 * ici.
 */
describe('les formats du composer — la liste vit à l\'exécution, pas seulement au typage', () => {
  it('les quatre formats sont énumérables sans que personne ne réécrive l\'union', () => {
    expect([...COMPOSER_FORMATS]).toEqual(['story', 'post', 'reel', 'status'])
  })

  it('chaque format est unique', () => {
    expect(new Set(COMPOSER_FORMATS).size).toBe(COMPOSER_FORMATS.length)
  })

  it('AUCUNE porte n\'ouvre ni n\'offre un format absent de cette liste', () => {
    const doors: ComposerDoor[] = [
      { kind: 'storyTray' },
      { kind: 'feedComposer' },
      { kind: 'reelTab' },
      { kind: 'moodChip' },
      { kind: 'repost', sourceFormat: 'story' },
      { kind: 'edit', documentFormat: 'reel' },
      { kind: 'draft' },
      { kind: 'share' },
      { kind: 'conversationMedia' },
    ]
    expect(doors).toHaveLength(COMPOSER_DOORS.length)

    for (const door of doors) {
      for (const context of [withReel, withoutReel]) {
        const opening = composerOpening(door, context)
        expect(COMPOSER_FORMATS).toContain(opening.initialFormat)
        opening.offeredFormats.forEach((format) => expect(COMPOSER_FORMATS).toContain(format))
      }
    }
  })
})

describe('le format initial — ce que la porte décide', () => {
  it('le tray ouvre sur une story, le feed sur un post, l\'onglet réels sur un réel, le mood sur un status', () => {
    expect(composerOpening({ kind: 'storyTray' }, withoutReel).initialFormat).toBe('story')
    expect(composerOpening({ kind: 'feedComposer' }, withoutReel).initialFormat).toBe('post')
    expect(composerOpening({ kind: 'reelTab' }, withoutReel).initialFormat).toBe('reel')
    expect(composerOpening({ kind: 'moodChip' }, withoutReel).initialFormat).toBe('status')
  })

  it('un repost MIROITE le format de sa source — les quatre cas', () => {
    for (const source of ['story', 'post', 'reel', 'status'] as const) {
      expect(composerOpening({ kind: 'repost', sourceFormat: source }, withoutReel).initialFormat).toBe(source)
    }
  })

  it('une édition ouvre sur le format du document', () => {
    for (const doc of ['story', 'post', 'reel', 'status'] as const) {
      expect(composerOpening({ kind: 'edit', documentFormat: doc }, withoutReel).initialFormat).toBe(doc)
    }
  })

  /**
   * ⚠️ Cette attente CONTREDIT volontairement trois sources antérieures, et il
   * faut le savoir avant de « corriger » ce test :
   *
   *   1. le tableau des optionnels des planches disait « O13 — Média reçu → post » ;
   *   2. l'inventaire des portes donnait la colonne format = P ;
   *   3. le miroir iOS livré en C1 ouvre `.conversationMedia` sur `.post`.
   *
   * La **directive produit du 2026-08-23** les renverse, mot pour mot :
   * « conversationMedia │ post → NON, par défaut proposer en story, ou mettre
   * un sous-menu qui permet de poster en story ou poste ; si vidéo, audio,
   * proposer en réel. »
   *
   * Raison produit : un média reçu qui ouvrirait un POST par défaut donnerait
   * du permanent là où le geste courant est le partage bref — et l'inverse est
   * réparable en un tap par l'éventail, alors qu'un post publié ne se
   * « dé-publie » pas.
   *
   * La matrice maîtresse des planches contemplait DÉJÀ les trois formats pour
   * e9 (« ◆ seed story ◆ 2 gestes ◆ si vidéo ») : la planche se contredisait
   * elle-même, la directive a tranché, et O13 + l'inventaire + le flowchart
   * ont été alignés (rév. 3).
   */
  it('un média reçu d\'une conversation ouvre sur une STORY, jamais sur un post (directive 2026-08-23, renverse O13)', () => {
    expect(composerOpening({ kind: 'conversationMedia' }, withoutReel).initialFormat).toBe('story')
    expect(composerOpening({ kind: 'conversationMedia' }, withoutReel).offeredFormats).toEqual(['story', 'post'])
    expect(composerOpening({ kind: 'conversationMedia' }, withReel).offeredFormats).toEqual(['story', 'post', 'reel'])
  })

  it('brouillon et partage entrant ouvrent sur un post TRANSITOIRE — le host rebascule au chargement', () => {
    expect(composerOpening({ kind: 'draft' }, withoutReel).initialFormat).toBe('post')
    expect(composerOpening({ kind: 'share' }, withoutReel).initialFormat).toBe('post')
  })
})

describe('l\'éventail — la porte déclare des formats atteignables, pas un seul', () => {
  const everyDoor: ReadonlyArray<ComposerDoor> = [
    { kind: 'storyTray' },
    { kind: 'feedComposer' },
    { kind: 'reelTab' },
    { kind: 'moodChip' },
    { kind: 'repost', sourceFormat: 'story' },
    { kind: 'edit', documentFormat: 'post' },
    { kind: 'draft' },
    { kind: 'share' },
    { kind: 'conversationMedia' },
  ]

  it('INVARIANT — l\'éventail contient toujours le format initial, pour toute porte et tout contexte', () => {
    for (const door of everyDoor) {
      for (const ctx of [withReel, withoutReel]) {
        const opening = composerOpening(door, ctx)
        expect(opening.offeredFormats).toContain(opening.initialFormat)
      }
    }
  })

  it('le réel n\'est offert EN PLUS que si la composition qualifie', () => {
    expect(composerOpening({ kind: 'storyTray' }, withReel).offeredFormats).toContain('reel')
    expect(composerOpening({ kind: 'storyTray' }, withoutReel).offeredFormats).not.toContain('reel')
    expect(composerOpening({ kind: 'feedComposer' }, withReel).offeredFormats).toContain('reel')
    expect(composerOpening({ kind: 'feedComposer' }, withoutReel).offeredFormats).not.toContain('reel')
  })

  it('mais la porte des réels garde TOUJOURS son propre format — le gate ajoute, il ne retire jamais', () => {
    expect(composerOpening({ kind: 'reelTab' }, withoutReel).offeredFormats).toContain('reel')
  })

  it('le mood n\'offre aucun choix — un status ne devient rien d\'autre', () => {
    expect(composerOpening({ kind: 'moodChip' }, withReel).offeredFormats).toEqual(['status'])
  })

  it('un repost offre sa source ET le post — changer de format est le geste d\'ANCRAGE', () => {
    expect(composerOpening({ kind: 'repost', sourceFormat: 'story' }, withoutReel).offeredFormats).toEqual(['story', 'post'])
    expect(composerOpening({ kind: 'repost', sourceFormat: 'status' }, withoutReel).offeredFormats).toEqual(['status', 'post'])
    expect(composerOpening({ kind: 'repost', sourceFormat: 'reel' }, withoutReel).offeredFormats).toEqual(['reel', 'post'])
  })

  it('reposter un post n\'offre PAS le post deux fois — il est déjà son propre ancrage', () => {
    expect(composerOpening({ kind: 'repost', sourceFormat: 'post' }, withoutReel).offeredFormats).toEqual(['post'])
  })

  it('éditer une story ou un status n\'offre AUCUN choix — le serveur n\'accepte que POST↔REEL', () => {
    expect(composerOpening({ kind: 'edit', documentFormat: 'story' }, withReel).offeredFormats).toEqual(['story'])
    expect(composerOpening({ kind: 'edit', documentFormat: 'status' }, withReel).offeredFormats).toEqual(['status'])
  })

  it('éditer un post offre le réel quand la composition restante qualifie, et rien sinon', () => {
    expect(composerOpening({ kind: 'edit', documentFormat: 'post' }, withReel).offeredFormats).toEqual(['post', 'reel'])
    expect(composerOpening({ kind: 'edit', documentFormat: 'post' }, withoutReel).offeredFormats).toEqual(['post'])
  })

  it('éditer un réel offre le repli vers post même quand la composition ne qualifie plus', () => {
    expect(composerOpening({ kind: 'edit', documentFormat: 'reel' }, withoutReel).offeredFormats).toEqual(['reel', 'post'])
  })
})

describe('buildUpdatePayload — on n\'écrit que ce qu\'on sait complet et qu\'on a su rendre', () => {
  const draft = {
    content: 'bonjour',
    visibility: 'PUBLIC',
    mentions: [] as ReadonlyArray<string>,
    storyEffects: { scenes: [] },
  }

  it('une clé ABSENTE de `known` est omise — le schéma lit l\'absence comme « inchangé »', () => {
    const payload = buildUpdatePayload(['content'], draft)
    expect(payload).toEqual({ content: 'bonjour' })
    expect('visibility' in payload).toBe(false)
    expect('storyEffects' in payload).toBe(false)
  })

  it('un composer qui ne déclare RIEN connu n\'écrit rien', () => {
    expect(buildUpdatePayload([], draft)).toEqual({})
  })

  it('une liste VIDE déclarée connue est ÉCRITE — le tri-état : [] = plus aucune référence', () => {
    const payload = buildUpdatePayload(['mentions'], draft)
    expect(payload).toEqual({ mentions: [] })
  })

  it('une valeur `null` déclarée connue est ÉCRITE — c\'est un effacement explicite', () => {
    const payload = buildUpdatePayload(['location'], { location: null })
    expect(payload).toEqual({ location: null })
  })

  it('une clé déclarée connue mais ABSENTE du brouillon reste omise — on n\'écrit pas ce qu\'on n\'a pas', () => {
    const payload = buildUpdatePayload(['content', 'moodEmoji'], { content: 'salut' })
    expect(payload).toEqual({ content: 'salut' })
    expect('moodEmoji' in payload).toBe(false)
  })

  it('une valeur `undefined` ne s\'écrit jamais, même déclarée connue', () => {
    const payload = buildUpdatePayload(['moodEmoji'], { moodEmoji: undefined })
    expect('moodEmoji' in payload).toBe(false)
  })

  it('déclarer une clé connue DEUX fois ne la duplique pas', () => {
    expect(buildUpdatePayload(['content', 'content'], draft)).toEqual({ content: 'bonjour' })
  })
})

/**
 * Le ré-export — une loi n'est appliquée que si elle est ATTEIGNABLE.
 *
 * `buildUpdatePayload` vivait derrière le seul chemin profond
 * `@meeshy/shared/utils/composer-contract`, et n'avait AUCUN consommateur de
 * production : une fonction morte, testée verte. `utils/index.ts` ré-exporte
 * une douzaine de modules ; celui-ci s'AJOUTE à la liste, il ne la remplace
 * pas — l'écraser emporterait `repost-target.js`, donc la loi 5 du web.
 */
describe('composer-contract est ré-exporté par l\'index des utilitaires', () => {
  it('buildUpdatePayload est atteignable depuis `utils/index`', async () => {
    const index = await import('../utils/index.js')
    expect(typeof index.buildUpdatePayload).toBe('function')
  })

  it('composerOpening et les deux tables le sont aussi — le contrat entier, pas une fonction isolée', async () => {
    const index = await import('../utils/index.js')
    expect(typeof index.composerOpening).toBe('function')
    expect(index.COMPOSER_DOORS).toHaveLength(9)
    expect(index.COMPOSER_FORMATS).toHaveLength(4)
  })

  it('le ré-export porte l\'extension `.js` — un import sans extension crashe en prod ESM', async () => {
    const source = await readFile(new URL('../utils/index.ts', import.meta.url), 'utf8')
    expect(source).toContain("from './composer-contract.js'")
  })
})

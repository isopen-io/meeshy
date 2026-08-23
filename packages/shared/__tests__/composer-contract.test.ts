/**
 * Le contrat du composer — loi PRODUIT partagée par iOS et le web.
 *
 * @see docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md
 * @see tasks/todo-composer-lot-c-et-v2-2026-08-23.md — V0
 */
import { describe, it, expect } from 'vitest'
import {
  COMPOSER_DOORS,
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

  it('un média reçu d\'une conversation ouvre sur une STORY, jamais sur un post', () => {
    expect(composerOpening({ kind: 'conversationMedia' }, withoutReel).initialFormat).toBe('story')
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

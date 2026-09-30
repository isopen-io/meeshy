import { describe, expect, test } from 'bun:test'
import { LEGENDES } from '../textes/legendes.mjs'
import { VITRINE } from '../templates/vitrine/plan.mjs'
import { HOTE_INJOIGNABLE, TAILLES_NATIVES, argumentsDeLancement, attendreLeSignal, cheminBrut } from '../vitrine/capturer.mjs'

describe('capture des vrais écrans (#8855)', () => {
  test('lot 1 : Global, Progression et le lien, sur iPhone et iPad', () => {
    for (const appareil of ['iphone', 'ipad']) {
      expect(VITRINE[appareil].captures.map((c) => c.scene)).toEqual(['global', 'progression', 'lien'])
      for (const c of VITRINE[appareil].captures) expect(LEGENDES[c.legende]).toBeDefined()
    }
    expect([VITRINE.iphone.width, VITRINE.iphone.height]).toEqual([1320, 2868])
    expect([VITRINE.ipad.width, VITRINE.ipad.height]).toEqual([2064, 2752])
  })

  test('les captures natives ont déjà la taille App Store', () => {
    expect(TAILLES_NATIVES).toEqual({ iphone: [1320, 2868], ipad: [2064, 2752] })
  })

  test('le lancement vise un hôte injoignable, jamais un vrai serveur, et reporte l’alerte des notifications', () => {
    const args = argumentsDeLancement({ scene: 'global', lang: 'fr' })
    expect(args.slice(0, 2)).toEqual(['-MeeshyVitrine', 'global'])
    expect(args).toContain(HOTE_INJOIGNABLE)
    expect(HOTE_INJOIGNABLE).toBe('http://127.0.0.1:9')
    expect(args.join(' ')).not.toMatch(/meeshy\.me/)
    expect(args).toEqual(expect.arrayContaining(['-auth.signup.deferPushPermissionUntilFirstMessage', 'YES']))
  })

  test('le portugais du Brésil et l’arabe d’Arabie saoudite', () => {
    expect(argumentsDeLancement({ scene: 'lien', lang: 'pt' })).toEqual(expect.arrayContaining(['(pt-BR)', 'pt_BR']))
    expect(argumentsDeLancement({ scene: 'lien', lang: 'ar' })).toEqual(expect.arrayContaining(['(ar)', 'ar_SA']))
  })

  test('une capture brute par appareil, langue et scène', () => {
    expect(cheminBrut({ appareil: 'ipad', lang: 'de', scene: 'progression' })).toMatch(/out\/vitrine\/brut\/ipad\/de\/progression\.png$/)
  })

  test('une scène qui ne signale jamais « prêt » fait échouer la capture en la nommant', async () => {
    let horloge = 0
    const attente = attendreLeSignal({
      existe: () => false,
      delaiMs: 1000,
      pasMs: 500,
      maintenant: () => horloge,
      dormir: async (ms) => { horloge += ms },
      etiquette: 'iphone/fr/global',
    })
    await expect(attente).rejects.toThrow('iphone/fr/global : aucun signal « prêt »')
  })

  test('le signal « prêt » libère la capture dès qu’il paraît', async () => {
    let regards = 0
    await attendreLeSignal({ existe: () => ++regards > 2, maintenant: () => 0, dormir: async () => {}, etiquette: 'x' })
    expect(regards).toBe(3)
  })
})

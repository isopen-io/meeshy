import { describe, expect, test } from 'bun:test'
import { SIMULATEURS, trouverSimulateur } from '../vitrine/simulateurs.mjs'

const liste = {
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-26-1': [
      { name: 'Meeshy Vitrine iPhone', udid: 'A', isAvailable: true },
      { name: 'Meeshy-iOS26', udid: 'B', isAvailable: true },
      { name: 'Meeshy Vitrine iPad', udid: 'C', isAvailable: false },
    ],
  },
}

describe('simulateurs de la vitrine (#8855)', () => {
  test('deux simulateurs dédiés, jamais celui d’une autre session', () => {
    expect(SIMULATEURS.iphone.nom).toBe('Meeshy Vitrine iPhone')
    expect(SIMULATEURS.ipad.nom).toBe('Meeshy Vitrine iPad')
    expect(SIMULATEURS.iphone.type).toBe('com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max')
    expect(SIMULATEURS.ipad.type).toBe('com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB')
  })

  test('retrouve un simulateur par son nom exact, et ignore un simulateur indisponible', () => {
    expect(trouverSimulateur(liste, 'Meeshy Vitrine iPhone')).toBe('A')
    expect(trouverSimulateur(liste, 'Meeshy Vitrine iPad')).toBeNull()
    expect(trouverSimulateur(liste, 'Meeshy')).toBeNull()
  })
})

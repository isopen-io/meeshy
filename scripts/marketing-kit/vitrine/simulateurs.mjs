// Les deux simulateurs de la vitrine (#8855) — créés au besoin, jamais ceux d'une autre session.
//   node scripts/marketing-kit/vitrine/simulateurs.mjs            # démarre les deux, imprime { iphone, ipad }
//   node scripts/marketing-kit/vitrine/simulateurs.mjs --iphone   # démarre l'iPhone, imprime son UDID
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-26-1'

export const SIMULATEURS = {
  iphone: { nom: 'Meeshy Vitrine iPhone', type: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max' },
  ipad: { nom: 'Meeshy Vitrine iPad', type: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB' },
}

const simctl = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' })

export const trouverSimulateur = (liste, nom) =>
  Object.values(liste.devices).flat().find((d) => d.name === nom && d.isAvailable !== false)?.udid ?? null

export const assurerSimulateur = ({ nom, type }) =>
  trouverSimulateur(JSON.parse(simctl('list', 'devices', '-j')), nom) ?? simctl('create', nom, type, RUNTIME).trim()

export const demarrer = (udid) => {
  try {
    simctl('boot', udid)
  } catch (erreur) {
    if (!String(erreur.stderr ?? erreur).includes('current state: Booted')) throw erreur
  }
  simctl('bootstatus', udid, '-b')
}

export const barreDEtat = (udid) =>
  simctl('status_bar', udid, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3',
    '--cellularMode', 'active', '--cellularBars', '4', '--batteryState', 'charged', '--batteryLevel', '100')

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--iphone')) {
    const udid = assurerSimulateur(SIMULATEURS.iphone)
    demarrer(udid)
    process.stdout.write(`${udid}\n`)
  } else {
    const udids = { iphone: assurerSimulateur(SIMULATEURS.iphone), ipad: assurerSimulateur(SIMULATEURS.ipad) }
    for (const udid of Object.values(udids)) {
      demarrer(udid)
      barreDEtat(udid)
    }
    process.stdout.write(`${JSON.stringify(udids)}\n`)
  }
}

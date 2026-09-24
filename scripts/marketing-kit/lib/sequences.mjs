// Séquences App Store — captures-app-store.md § 2 (iPhone) et § 3 (iPad).
// `theme` = clair/sombre de l'ÉCRAN (alternance S-C-S-C-S-S-C-S-S-C).
const IPHONE = [
  { id: '01-vocal', gabarit: 'appstore', ecran: 'dm', legende: 'L1', theme: 'dark', surimpression: 'fleche-langues' },
  { id: '02-groupe', gabarit: 'appstore', ecran: 'groupe', legende: 'L2', theme: 'light' },
  { id: '03-global', gabarit: 'appstore', ecran: 'global', legende: 'L3', theme: 'dark' },
  { id: '04-fil', gabarit: 'appstore', ecran: 'fil', legende: 'L4', theme: 'light' },
  { id: '05-decouverte', gabarit: 'appstore', ecran: 'decouverte', legende: 'L5', theme: 'dark' },
  { id: '06-story', gabarit: 'appstore', ecran: 'story', legende: 'L6', theme: 'dark' },
  { id: '07-progression', gabarit: 'appstore', ecran: 'progression', legende: 'L7', theme: 'light' },
  { id: '08-succes', gabarit: 'appstore', ecran: 'succes', legende: 'L8', theme: 'dark' },
  { id: '09-appel', gabarit: 'appstore', ecran: 'appel', legende: 'L9', theme: 'dark' },
  { id: '10-invitation', gabarit: 'appstore', ecran: 'invitation', legende: 'L10', theme: 'light' },
]

const IPAD = [
  { id: 'P1-vocal', gabarit: 'appstore', ecran: 'ipad-dm', legende: 'L1', theme: 'dark', surimpression: 'fleche-langues' },
  { id: 'P2-global', gabarit: 'appstore', ecran: 'ipad-global', legende: 'L3', theme: 'light' },
  { id: 'P3-fil', gabarit: 'appstore', ecran: 'ipad-fil', legende: 'L4', theme: 'dark' },
  { id: 'P4-groupe', gabarit: 'appstore', ecran: 'ipad-groupe', legende: 'L2', theme: 'light' },
  { id: 'P5-progression', gabarit: 'appstore', ecran: 'ipad-progression', legende: 'L7', theme: 'light' },
  { id: 'P6-appel', gabarit: 'appstore', ecran: 'ipad-appel', legende: 'L9', theme: 'dark' },
  { id: 'P7-story', gabarit: 'appstore', ecran: 'ipad-story', legende: 'L6', theme: 'dark' },
]

const brut = (sequence) =>
  sequence.map((p) => ({ ...p, id: `ecran-${p.id}`, gabarit: 'ecran', surimpression: undefined }))

export const SEQUENCES = {
  'iphone-6.9': [...IPHONE, ...brut(IPHONE)],
  'ipad-13': [...IPAD, ...brut(IPAD)],
}

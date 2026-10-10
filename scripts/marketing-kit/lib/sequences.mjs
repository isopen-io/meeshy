// Séquences App Store — captures-app-store.md § 2 (iPhone) et § 3 (iPad), refondues par #8825.
// `theme` = clair/sombre de l'ÉCRAN (alternance S-C-S-C-S-C-S-S-C-C).
const IPHONE = [
  { id: '01-amour', gabarit: 'appstore', ecran: 'amour', legende: 'L1', theme: 'dark', surimpression: 'fleche-langues' },
  { id: '02-photos', gabarit: 'appstore', ecran: 'amour-photos', legende: 'L11', theme: 'light' },
  { id: '03-drole', gabarit: 'appstore', ecran: 'drole', legende: 'L2', theme: 'dark' },
  { id: '04-debat', gabarit: 'appstore', ecran: 'debat', legende: 'L12', theme: 'light' },
  { id: '05-appel', gabarit: 'appstore', ecran: 'appel-amour', legende: 'L9', theme: 'dark' },
  { id: '06-global', gabarit: 'appstore', ecran: 'global', legende: 'L3', theme: 'light' },
  { id: '07-fil', gabarit: 'appstore', ecran: 'fil', legende: 'L4', theme: 'dark' },
  { id: '08-story', gabarit: 'appstore', ecran: 'story', legende: 'L6', theme: 'dark' },
  { id: '09-progression', gabarit: 'appstore', ecran: 'progression', legende: 'L7', theme: 'light' },
  { id: '10-invitation', gabarit: 'appstore', ecran: 'invitation', legende: 'L10', theme: 'light' },
]

const IPAD = [
  { id: 'P1-amour', gabarit: 'appstore', ecran: 'ipad-amour', legende: 'L1', theme: 'dark', surimpression: 'fleche-langues' },
  { id: 'P2-photos', gabarit: 'appstore', ecran: 'ipad-amour-photos', legende: 'L11', theme: 'light' },
  { id: 'P3-drole', gabarit: 'appstore', ecran: 'ipad-drole', legende: 'L2', theme: 'dark' },
  { id: 'P4-debat', gabarit: 'appstore', ecran: 'ipad-debat', legende: 'L12', theme: 'light' },
  { id: 'P5-appel', gabarit: 'appstore', ecran: 'ipad-appel-amour', legende: 'L9', theme: 'dark' },
  { id: 'P6-global', gabarit: 'appstore', ecran: 'ipad-global', legende: 'L3', theme: 'light' },
  { id: 'P7-fil', gabarit: 'appstore', ecran: 'ipad-fil', legende: 'L4', theme: 'dark' },
  { id: 'P8-story', gabarit: 'appstore', ecran: 'ipad-story', legende: 'L6', theme: 'dark' },
  { id: 'P9-progression', gabarit: 'appstore', ecran: 'ipad-progression', legende: 'L7', theme: 'light' },
]

const brut = (sequence) =>
  sequence.map((p) => ({ ...p, id: `ecran-${p.id}`, gabarit: 'ecran', surimpression: undefined }))

export const SEQUENCES = {
  'iphone-6.9': [...IPHONE, ...brut(IPHONE)],
  'ipad-13': [...IPAD, ...brut(IPAD)],
}

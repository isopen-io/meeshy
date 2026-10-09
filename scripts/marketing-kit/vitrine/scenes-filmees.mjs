// Les scènes FILMÉES de la vitrine (#9806) : une scène = un nom de vitrine (`-MeeshyVitrine <scene>`),
// des bornes (marqueurs posés par l'app, ou une durée), des marges, les fenêtres où l'image DOIT
// bouger, les images clés à tirer, et éventuellement des gestes simulés par appareil.
//
//   debut  { marqueur: 'x.txt' }   l'app pose ce fichier dans Documents/vitrine quand l'action démarre
//          { apresGestesMs: n }    sinon : n ms après le dernier geste
//   fin    { marqueur: 'y.txt' }   l'app pose ce fichier quand l'action est finie
//          null                    sinon : début + dureeMs
//   mouvement   fenêtres [début, fin] en ms depuis le début de l'action, où une image répétée est une
//               image perdue — hors des repos que la chorégraphie prévoit (fins d'easing, tenues)
//   imagesCles  { nom, instantMs } depuis le début de l'action
//   gestes      { iphone: [...], ipad: [...] } — en POINTS entiers, joués dans l'ordre :
//               { type: 'tap', x, y } · { type: 'swipe', de: [x, y], a: [x, y], dureeS }
//               { type: 'attendre', ms } · { type: 'fichier', nom } (dépose un fichier dans Documents/vitrine)
//
// Les durées du jeu sont celles de `GameTimeline` (apps/ios/Meeshy/Features/Main/Game/Choreography).
//
// Le CLAP (#9810) : après « prêt », l'app attend `go.txt` avant d'agir (repli 3 s sans tournage). Le
// script le dépose comme dernier geste, AVANCE_MS après le démarrage de l'enregistreur — qui part
// 0,4 à 2 s après « prêt » : l'action ne commence jamais hors du film.

const CELEBRATION = { debut: { marqueur: 'celebration-debut.txt' }, fin: { marqueur: 'celebration-fin.txt' } }
const MARGES_JEU = { avantMs: 600, apresMs: 900 }
const CLAP = { type: 'fichier', nom: 'go.txt' }
const GESTES_CLAP = { iphone: [CLAP], ipad: [CLAP] }

const jeu = (scene, { dureeMs, mouvement, imagesCles }) => ({
  scene,
  famille: 'jeu',
  theme: 'light',
  montreUnFil: false,
  ...CELEBRATION,
  dureeMs,
  marges: MARGES_JEU,
  mouvement,
  imagesCles,
  gestes: GESTES_CLAP,
})

export const SCENES_FILMEES = {
  // Montée 0–0,5 s, trois traits à 0,55 / 0,8 / 1,05 s (0,3 s chacun), tenants 1,15–1,6 s.
  'jeu-rang': jeu('jeu-rang', {
    dureeMs: 1600,
    mouvement: [[60, 440], [600, 1500]],
    imagesCles: [{ nom: 'trait', instantMs: 800 }, { nom: 'rang-revele', instantMs: 1700 }],
  }),
  // Couvercle 0–0,4 s, récompenses à 0,5 / 0,8 / 1,1 s (0,3 s chacune).
  'jeu-coffre': jeu('jeu-coffre', {
    dureeMs: 1400,
    mouvement: [[40, 340], [530, 1360]],
    imagesCles: [{ nom: 'coffre-ouvert', instantMs: 450 }, { nom: 'recompenses', instantMs: 1500 }],
  }),
  // Plaque 0–0,3 s, marteau jusqu'à l'impact 0,45 s, retournement 0,55–1,2 s.
  'jeu-frappe': jeu('jeu-frappe', {
    dureeMs: 1200,
    mouvement: [[40, 1140]],
    imagesCles: [{ nom: 'impact', instantMs: 450 }, { nom: 'piece-retournee', instantMs: 1300 }],
  }),
  'jeu-niveau': jeu('jeu-niveau', {
    dureeMs: 600,
    mouvement: [[40, 520]],
    imagesCles: [{ nom: 'niveau-monte', instantMs: 700 }],
  }),
  'jeu-badge': jeu('jeu-badge', {
    dureeMs: 700,
    mouvement: [[40, 620]],
    imagesCles: [{ nom: 'badge-gagne', instantMs: 800 }],
  }),
}

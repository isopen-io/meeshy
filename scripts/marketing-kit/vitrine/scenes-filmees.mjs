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
// Le CLAP (#9810) : après « prêt », l'app attend `go.txt` avant d'agir (repli 8 s sans tournage). Le
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

// Les interactions (#9810) : l'app les joue elle-même au clap, par le chemin du geste (aucun toucher simulé —
// leurs coordonnées changeraient avec l'appareil, la langue et la longueur des textes), et les borne par les
// mêmes marqueurs. `dureeMs` est la durée ATTENDUE (délai de garde de la fin) ; les fenêtres de mouvement ne
// couvrent que les animations dont l'instant ne dépend pas du rendu d'un écran.
const MARGES_INTERACTION = { avantMs: 600, apresMs: 1200 }

const interaction = (scene, { montreUnFil, dureeMs, mouvement, imagesCles }) => ({
  scene,
  famille: 'interaction',
  theme: 'light',
  montreUnFil,
  ...CELEBRATION,
  dureeMs,
  marges: MARGES_INTERACTION,
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
    mouvement: [[40, 340], [600, 1150]],
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
  // Le toucher du compteur pousse la fiche des Meeshes (0–0,35 s) ; la fiche lue et posée (0,8 s), Mee et Meo
  // frappent (1,2 s, vers 1,2–2,5 s).
  'interaction-frappe': interaction('interaction-frappe', {
    montreUnFil: false,
    dureeMs: 2600,
    mouvement: [[40, 330], [1400, 2300]],
    imagesCles: [{ nom: 'fiche', instantMs: 1000 }, { nom: 'piece-retournee', instantMs: 2700 }],
  }),
  // Appui long : la bulle remonte au centre (0,3 s), le menu unifié s'ouvre (ressort 0,42 s), tenu 1,1 s, puis
  // 🥰 se pose — le menu se replie (0,32 s) et la réaction paraît sous la bulle.
  'interaction-emoji': interaction('interaction-emoji', {
    montreUnFil: true,
    dureeMs: 2800,
    mouvement: [[320, 700], [1420, 1700]],
    imagesCles: [{ nom: 'menu', instantMs: 1200 }, { nom: 'reaction', instantMs: 2800 }],
  }),
  // Appui long sur le cœur : la palette s'ouvre (ressort 0,3 s), tenue 1,1 s, puis ❤️ — la palette se referme
  // (0,3 s) et le cœur se remplit, compteur compris.
  'interaction-emoji-post': interaction('interaction-emoji-post', {
    montreUnFil: false,
    dureeMs: 2500,
    mouvement: [[40, 280], [1120, 1350]],
    imagesCles: [{ nom: 'palette', instantMs: 900 }, { nom: 'coeur', instantMs: 2500 }],
  }),
  // Le vocal part (montée 0,9 s), la transcription arrive 1,3 s après sa création, la traduction 1,6 s plus tard,
  // tenue 1,8 s. Aucune fenêtre de mouvement tant que les apparitions n'ont pas été mesurées au simulateur.
  'interaction-commentaire-audio': interaction('interaction-commentaire-audio', {
    montreUnFil: false,
    dureeMs: 5700,
    mouvement: [],
    imagesCles: [{ nom: 'envoi', instantMs: 500 }, { nom: 'transcription', instantMs: 2700 }, { nom: 'traduction', instantMs: 4600 }],
  }),
  // La porte du sticker s'ouvre par le rail : la feuille monte (0,35 s), tenue 1,3 s, puis Mee et Meo se posent sur la
  // scène — la feuille redescend (0,3 s) et le sticker s'ouvre en édition.
  'interaction-sticker': interaction('interaction-sticker', {
    montreUnFil: false,
    dureeMs: 3100,
    mouvement: [[40, 330]],
    imagesCles: [{ nom: 'feuille', instantMs: 1100 }, { nom: 'sticker-pose', instantMs: 3100 }],
  }),
  // Le réel (#9820) : le composeur s'ouvre sur la vidéo du kit, qui joue sur la scène (tenue 1,5 s) ; « Publier le réel »
  // referme le composeur, la vidéo monte (0,8 s), le réel arrive en tête du fil et y joue (tenue 3,5 s). Aucune fenêtre
  // de mouvement tant que les apparitions n'ont pas été mesurées au simulateur.
  'interaction-reel': interaction('interaction-reel', {
    montreUnFil: true,
    dureeMs: 6500,
    mouvement: [],
    imagesCles: [{ nom: 'composeur', instantMs: 800 }, { nom: 'publication', instantMs: 2200 }, { nom: 'reel-au-fil', instantMs: 5800 }],
  }),
}

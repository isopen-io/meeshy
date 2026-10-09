// Les scènes FILMÉES de la vitrine (#9806) : une scène = un nom de vitrine (`-MeeshyVitrine <scene>`),
// des bornes (marqueurs posés par l'app, ou une durée), des marges, les fenêtres où l'image DOIT
// bouger, les images clés à tirer, et éventuellement des gestes simulés par appareil.
//
//   debut  { marqueur: 'x.txt' }   l'app pose ce fichier dans Documents/vitrine quand l'action démarre
//          { apresGestesMs: n }    sinon : n ms après le dernier geste
//   fin    { marqueur: 'y.txt' }   l'app pose ce fichier quand l'action est finie
//          null                    sinon : début + dureeMs
//   mouvement   fenêtres [début, fin] en ms depuis le début de l'action, où une image répétée est une
//               image perdue — hors des repos que la chorégraphie prévoit (fins d'easing, tenues) ; ou
//               { etape, de, a } en ms depuis une ÉTAPE que l'app date (`etape-<nom>.txt`), quand l'instant de
//               l'animation dépend du rendu d'un écran
//   imagesCles  { nom, instantMs } depuis le début de l'action, ou { nom, etape, instantMs } depuis une étape
//   gestes      { iphone: [...], ipad: [...] } — en POINTS entiers, joués dans l'ordre :
//               { type: 'tap', x, y } · { type: 'swipe', de: [x, y], a: [x, y], dureeS }
//               { type: 'attendre', ms } · { type: 'fichier', nom } (dépose un fichier dans Documents/vitrine)
//
// Les durées du jeu sont celles de `GameTimeline` (apps/ios/Meeshy/Features/Main/Game/Choreography). Les scènes du jeu
// s'ancrent sur leur PREMIER MOUVEMENT (étape virtuelle « mouvement », lue dans le film) : la célébration part quand
// l'état servi est rendu, et ce rendu tarde avec la charge de la machine.
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
    mouvement: [{ etape: 'mouvement', de: 20, a: 400 }, { etape: 'mouvement', de: 560, a: 1460 }],
    imagesCles: [{ nom: 'trait', etape: 'mouvement', instantMs: 760 }, { nom: 'rang-revele', etape: 'mouvement', instantMs: 1660 }],
  }),
  // Couvercle 0–0,4 s, récompenses à 0,5 / 0,8 / 1,1 s (0,3 s chacune).
  'jeu-coffre': jeu('jeu-coffre', {
    dureeMs: 1400,
    mouvement: [{ etape: 'mouvement', de: 40, a: 300 }, { etape: 'mouvement', de: 560, a: 1000 }],
    imagesCles: [{ nom: 'coffre-ouvert', etape: 'mouvement', instantMs: 410 }, { nom: 'recompenses', etape: 'mouvement', instantMs: 1460 }],
  }),
  // Plaque 0–0,3 s, marteau jusqu'à l'impact 0,45 s, retournement 0,55–1,2 s.
  'jeu-frappe': jeu('jeu-frappe', {
    dureeMs: 1200,
    mouvement: [{ etape: 'mouvement', de: 20, a: 1100 }],
    imagesCles: [{ nom: 'impact', etape: 'mouvement', instantMs: 410 }, { nom: 'piece-retournee', etape: 'mouvement', instantMs: 1260 }],
  }),
  'jeu-niveau': jeu('jeu-niveau', {
    dureeMs: 600,
    mouvement: [{ etape: 'mouvement', de: 20, a: 480 }],
    imagesCles: [{ nom: 'niveau-monte', etape: 'mouvement', instantMs: 660 }],
  }),
  // La médaille se rallume quand la lecture servie est rendue : l'étagère change d'abord ses compteurs (premier
  // mouvement), se recalcule 0,1 à 0,15 s, puis la matière remonte en 0,7 s.
  'jeu-badge': jeu('jeu-badge', {
    dureeMs: 700,
    mouvement: [{ etape: 'mouvement', de: 220, a: 600 }],
    imagesCles: [{ nom: 'badge-gagne', etape: 'mouvement', instantMs: 800 }],
  }),
  // Le toucher du compteur pousse la fiche des Meeshes : la poussée paraît 0,2 à 0,35 s après, le temps que la fiche se
  // bâtisse — aucune fenêtre n'y est posée. La fiche lue et posée (étape « frappe »), Mee et Meo frappent : la
  // chorégraphie de jeu-frappe, ancrée sur l'étape.
  'interaction-frappe': interaction('interaction-frappe', {
    montreUnFil: false,
    dureeMs: 2600,
    mouvement: [{ etape: 'frappe', de: 100, a: 1140 }],
    imagesCles: [{ nom: 'fiche', etape: 'fiche', instantMs: 300 }, { nom: 'piece-retournee', etape: 'frappe', instantMs: 1300 }],
  }),
  // Appui long : le menu unifié s'ouvre (étape « menu », ressort 0,42 s), tenu 1,1 s, puis 🥰 se pose (étape « choix »)
  // — le toucher coûte quelques images à l'app, puis le menu se replie (0,32 s) et la réaction paraît sous la bulle.
  'interaction-emoji': interaction('interaction-emoji', {
    montreUnFil: true,
    dureeMs: 2800,
    mouvement: [{ etape: 'menu', de: 100, a: 420 }, { etape: 'choix', de: 150, a: 270 }],
    imagesCles: [{ nom: 'menu', etape: 'choix', instantMs: -150 }, { nom: 'reaction', etape: 'choix', instantMs: 1300 }],
  }),
  // Appui long sur le cœur : la palette s'ouvre (ressort 0,3 s), tenue 1,1 s, puis ❤️ — la palette se referme
  // (0,3 s) et le cœur se remplit, compteur compris.
  'interaction-emoji-post': interaction('interaction-emoji-post', {
    montreUnFil: false,
    dureeMs: 2500,
    mouvement: [[40, 280], { etape: 'choix', de: 120, a: 450 }],
    imagesCles: [{ nom: 'palette', etape: 'choix', instantMs: -200 }, { nom: 'coeur', etape: 'choix', instantMs: 1300 }],
  }),
  // Le vocal part (montée 0,9 s), la transcription arrive 1,3 s après sa création, la traduction 1,6 s plus tard,
  // tenue 1,8 s. Aucune fenêtre de mouvement tant que les apparitions n'ont pas été mesurées au simulateur.
  'interaction-commentaire-audio': interaction('interaction-commentaire-audio', {
    montreUnFil: false,
    dureeMs: 5700,
    mouvement: [],
    imagesCles: [
      { nom: 'envoi', etape: 'creation', instantMs: 0 },
      { nom: 'transcription', etape: 'transcription', instantMs: 700 },
      { nom: 'traduction', etape: 'traduction', instantMs: 1200 },
    ],
  }),
  // La porte du sticker s'ouvre par le rail : la feuille monte (0,35 s), tenue 1,3 s, puis Mee et Meo se posent sur la
  // scène — la feuille redescend (0,3 s) et le sticker s'ouvre en édition.
  'interaction-sticker': interaction('interaction-sticker', {
    montreUnFil: false,
    dureeMs: 3100,
    mouvement: [{ etape: 'feuille', de: 40, a: 330 }, { etape: 'choix', de: 250, a: 650 }],
    imagesCles: [{ nom: 'feuille', etape: 'choix', instantMs: -200 }, { nom: 'sticker-pose', etape: 'choix', instantMs: 1700 }],
  }),
  // Le réel (#9820) : le composeur s'ouvre sur la vidéo du kit, qui joue sur la scène (tenue 1,5 s) ; « Publier le réel »
  // referme le composeur, la vidéo monte (0,8 s), le réel arrive en tête du fil et y joue (tenue 3,5 s). Aucune fenêtre
  // de mouvement tant que les apparitions n'ont pas été mesurées au simulateur.
  'interaction-reel': interaction('interaction-reel', {
    montreUnFil: true,
    dureeMs: 7500,
    mouvement: [],
    imagesCles: [
      { nom: 'composeur', etape: 'armement', instantMs: 600 },
      { nom: 'publication', etape: 'publication', instantMs: 500 },
      { nom: 'reel-au-fil', etape: 'reel', instantMs: 1500 },
    ],
  }),
}

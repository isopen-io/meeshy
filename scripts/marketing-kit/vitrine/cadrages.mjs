// Le CADRAGE d'une scène filmée (#9807) : où regarder dans l'écran natif. Une célébration qui se joue sur
// un écusson de 120 px dans un coin est illisible plein cadre dans un aperçu ; on déclare donc, par scène
// et par appareil, le rectangle d'intérêt (px natifs), et le montage y avance en douceur : plein écran
// pendant la marge d'avant l'action, puis zoom en cosinus (ease-in-out) jusqu'à une fenêtre qui CONTIENT le
// rectangle, au rapport du format de sortie, et tenue jusqu'à la fin du plan. Sans rectangle : plein cadre.
//
// L'agrandissement est borné : sur l'aperçu iPhone (886 px de large), une fenêtre de moins de 600 px natifs
// pixelise (886 / 600 ≈ 1,48 px de sortie par px natif). La même borne vaut pour l'iPad.
import { TAILLES_NATIVES } from './capturer.mjs'

export const AGRANDISSEMENT_MAX = 886 / 600
export const ZOOM_MS = 900

// Rectangles en px natifs (iPhone 1320×2868, iPad 2064×2752), relevés sur les prises françaises du
// 2026-10-09. Une carte pleine largeur (1100 à 1200 px) donnerait une fenêtre presque plein cadre (×1,1) : le
// rectangle retenu en garde la partie qui VIT.
// - jeu-rang : carte du niveau en x 60…1260, y 450…1000 ; on garde l'anneau du niveau, l'écusson du rang et
//   ses traits, « Niveau 34 » et « Écho V » : x 40…820 (×1,7).
// - jeu-coffre : carte du coffre en x 90…1230, y 1930…2670 ; on garde le coffre qui s'ouvre, les récompenses
//   qui montent au-dessus et « Coffre du jour » : x 330…990, y 1950…2480 (×2).
export const CADRAGES = {
  'jeu-rang': { iphone: { x: 40, y: 450, largeur: 780, hauteur: 550 } },
  'jeu-coffre': { iphone: { x: 330, y: 1950, largeur: 660, hauteur: 530 } },
}

export const cadrageDe = ({ scene, appareil, cadrages = CADRAGES }) => cadrages[scene]?.[appareil] ?? null

const borner = (v, min, max) => Math.min(max, Math.max(min, v))

// La plus petite fenêtre de rapport `rapport` (largeur / hauteur) qui contient le rectangle, jamais plus
// étroite que `largeurMin`, centrée sur lui et ramenée dans l'image `natif`.
export const fenetreCible = ({ rect, natif: [ln, hn], rapport, largeurMin }) => {
  const largeurMax = Math.min(ln, hn * rapport)
  const largeur = borner(Math.max(rect.largeur, rect.hauteur * rapport, largeurMin), 1, largeurMax)
  const hauteur = largeur / rapport
  return {
    x: borner(rect.x + rect.largeur / 2 - largeur / 2, 0, ln - largeur),
    y: borner(rect.y + rect.hauteur / 2 - hauteur / 2, 0, hn - hauteur),
    largeur,
    hauteur,
  }
}

// La largeur de fenêtre la plus étroite qui ne pixelise pas, en px du clip : 600 px natifs pour 886 px de
// sortie, portés à la largeur de sortie et à l'échelle du clip (une prise synthétique est plus petite).
export const largeurMinimale = ({ appareil, largeurClip, largeurSortie }) =>
  (largeurSortie / AGRANDISSEMENT_MAX) * (largeurClip / TAILLES_NATIVES[appareil][0])

// Le rectangle déclaré en px natifs de l'appareil, porté à la taille réelle du clip.
export const rectAuClip = ({ rect, appareil, largeurClip }) => {
  const k = largeurClip / TAILLES_NATIVES[appareil][0]
  return { x: rect.x * k, y: rect.y * k, largeur: rect.largeur * k, hauteur: rect.hauteur * k }
}

const nombre = (v) => Number(v.toFixed(4))

// Le mouvement de caméra en un filtre ffmpeg : `perspective` (évalué IMAGE PAR IMAGE, interpolation
// bicubique, positions au sous-pixel) envoie la fenêtre courante sur toute l'image ; la fenêtre, au rapport
// de l'image, part de l'image entière et rejoint `arrivee` entre `debutS` et `debutS + dureeS` en cosinus
// surélevé (ease-in-out), puis y reste. Le format de sortie s'applique ensuite, comme pour un plan sans
// cadrage. (Un `crop` à position variable après un `scale` à taille variable ne suit pas : `crop` garde la
// taille d'entrée de sa configuration.)
export const filtreCamera = ({ arrivee, natif: [ln, hn], debutS, dureeS, fps = 30 }) => {
  const u = `clip((in/${fps}-${nombre(debutS)})/${nombre(dureeS)}\\,0\\,1)`
  const p = `(0.5-0.5*cos(PI*${u}))`
  const lerp = (a, b) => `(${nombre(a)}+(${nombre(b - a)})*${p})`
  const x = lerp(0, arrivee.x)
  const y = lerp(0, arrivee.y)
  const l = lerp(ln, arrivee.largeur)
  const h = lerp(hn, arrivee.hauteur)
  return `perspective=x0=${x}:y0=${y}:x1=${x}+${l}:y1=${y}:x2=${x}:y2=${y}+${h}:x3=${x}+${l}:y3=${y}+${h}:interpolation=cubic:eval=frame`
}

// Recadrage FIXE sur une fenêtre (cartes des visuels créatifs).
export const filtreFenetre = ({ fenetre, largeur, hauteur }) =>
  `crop=${Math.round(fenetre.largeur)}:${Math.round(fenetre.hauteur)}:${Math.round(fenetre.x)}:${Math.round(fenetre.y)},scale=${largeur}:${hauteur}:flags=lanczos,setsar=1`

// Le CADRAGE d'une scène filmée (#9807) : où regarder dans l'écran natif. Une célébration qui se joue sur
// un écusson de 120 px dans un coin est illisible plein cadre dans un aperçu ; on déclare donc, par scène
// et par appareil, le rectangle d'intérêt (px natifs), et le montage y avance en douceur : plein écran
// pendant la marge d'avant l'action, puis zoom en cosinus (ease-in-out) jusqu'à une fenêtre qui CONTIENT le
// rectangle, au rapport de l'écran, et tenue jusqu'à la fin du plan. Sans rectangle : plein cadre.
//
// Le zoom est borné à ×2,2 de la largeur de l'écran (600 px natifs sur un iPhone de 1320) : au-delà, l'écran
// réduit de l'aperçu (≈ 760 px de large) agrandirait chaque px natif de plus de 1,3 et pixeliserait.
// La barre d'état de l'app (heure, batterie) est rognée en haut de chaque prise : ROGNAGE_HAUT.
import { TAILLES_NATIVES } from './capturer.mjs'

export const ZOOM_MAX = 2.2
export const ZOOM_MS = 900
// Hauteur de la barre d'état en px natifs : 54 pt × 3 sur iPhone (île dynamique comprise), 24 pt × 2 sur iPad,
// plus une marge pour ne garder aucune trace de l'heure ni de la batterie.
export const ROGNAGE_HAUT = { iphone: 165, ipad: 60 }

// Rectangles en px natifs (iPhone 1320×2868, iPad 2064×2752), relevés sur les prises françaises du
// 2026-10-09. Une carte pleine largeur (1100 à 1200 px) donnerait une fenêtre presque plein cadre (×1,1) : le
// rectangle retenu en garde la partie qui VIT ; ce qu'il tranche au bord s'adoucit dans un fondu (montage).
// - jeu-rang : l'écusson du rang, ses traits, « Écho V » et sa Gloire : x 120…540, y 780…1020 (×2,2).
// - jeu-coffre : le coffre qui s'ouvre, les récompenses qui montent au-dessus et « Coffre du jour » :
//   x 330…990, y 1950…2480 (×2).
// - jeu-niveau : l'anneau du niveau et « Niveau 35 » : x 40…820, y 400…800 (×1,7).
// Un autre agent ajoute les entrées iPad et des interactions : AJOUTER une entrée, ne pas réécrire les autres.
export const CADRAGES = {
  'jeu-rang': { iphone: { x: 120, y: 780, largeur: 420, hauteur: 240 } },
  'jeu-coffre': { iphone: { x: 330, y: 1950, largeur: 660, hauteur: 530 } },
  'jeu-niveau': { iphone: { x: 40, y: 400, largeur: 780, hauteur: 400 } },
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

// La fenêtre la plus étroite permise, en px du clip.
export const largeurMinimale = ({ largeurClip, zoomMax = ZOOM_MAX }) => largeurClip / zoomMax

// Le rectangle déclaré en px natifs de l'appareil, porté à la taille réelle du clip, puis dans l'image rognée
// de sa barre d'état (le haut du clip a perdu `rognageHaut` px natifs).
export const rectAuClip = ({ rect, appareil, largeurClip, rognageHaut = 0 }) => {
  const k = largeurClip / TAILLES_NATIVES[appareil][0]
  return { x: rect.x * k, y: (rect.y - rognageHaut) * k, largeur: rect.largeur * k, hauteur: rect.hauteur * k }
}

const nombre = (v) => Number(v.toFixed(4))

// Le mouvement de caméra en un filtre ffmpeg : `perspective` (évalué IMAGE PAR IMAGE, interpolation
// bicubique, positions au sous-pixel) envoie la fenêtre courante sur toute l'image ; la fenêtre, au rapport
// de l'image, part de l'image entière et rejoint `arrivee` entre `debutS` et `debutS + dureeS` en cosinus
// surélevé (ease-in-out), puis y reste. (Un `crop` à position variable après un `scale` à taille variable ne
// suit pas : `crop` garde la taille d'entrée de sa configuration.)
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

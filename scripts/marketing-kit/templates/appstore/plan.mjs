// Plan des captures App Store — docs/marketing/campagne-2026-09/captures-app-store.md § 2 (iPhone),
// § 3 (iPad), § 5 (poster d'App Preview), refondu par #8825. `theme` est le mode de l'ÉCRAN ; le
// fond du gabarit le suit (sombre ⇒ fond vif, clair ⇒ fond lumineux), ce qui rythme la rangée.
import { resolve } from 'node:path'
import { REPO_ROOT } from '../../lib/catalog.mjs'
import { appStoreLocale } from '../../lib/locales.mjs'

// #8825 : les conversations d'abord — l'amour (le vocal entendu dans la langue de l'autre, puis
// les photos échangées), le fou rire, le débat, l'appel sous-titré — puis le reste de l'app.
// L'iPad passe en PORTRAIT, le format par défaut d'App Store Connect pour le 13".
export const APPAREILS = {
  iphone: {
    width: 1320,
    height: 2868,
    scale: 3,
    prefixe: 'iphone69',
    captures: [
      { ecran: 'amour', legende: 'L1', theme: 'dark', decor: 'fleche' },
      { ecran: 'amour-photos', legende: 'L11', theme: 'light', decor: 'coeur-langues' },
      { ecran: 'drole', legende: 'L2', theme: 'dark', decor: 'drapeaux-drole' },
      { ecran: 'debat', legende: 'L12', theme: 'light' },
      { ecran: 'appel-amour', legende: 'L9', theme: 'dark' },
      { ecran: 'global', legende: 'L3', theme: 'light', decor: 'bonjours' },
      { ecran: 'fil', legende: 'L4', theme: 'dark' },
      { ecran: 'story', legende: 'L6', theme: 'dark' },
      { ecran: 'progression', legende: 'L7', theme: 'light' },
      // 1.1.3 : en français, la vraie page d'invitation (lien.mov, « Aiko t'invite », /chat/lisboa-2026).
      { ecran: 'invitation', legende: 'L10', theme: 'light', ecranReel: { fr: { video: 'Marketing/02-captures/iphone/fr/lien.mov', instant: 3.5 } } },
    ],
  },
  ipad: {
    width: 2064,
    height: 2752,
    scale: 2,
    prefixe: 'ipad13',
    captures: [
      { ecran: 'ipad-amour', legende: 'L1', theme: 'dark', decor: 'fleche' },
      { ecran: 'ipad-amour-photos', legende: 'L11', theme: 'light', decor: 'coeur-langues' },
      { ecran: 'ipad-drole', legende: 'L2', theme: 'dark', decor: 'drapeaux-drole' },
      { ecran: 'ipad-debat', legende: 'L12', theme: 'light' },
      { ecran: 'ipad-appel-amour', legende: 'L9', theme: 'dark' },
      { ecran: 'ipad-global', legende: 'L3', theme: 'light', decor: 'bonjours' },
      { ecran: 'ipad-fil', legende: 'L4', theme: 'dark' },
      { ecran: 'ipad-story', legende: 'L6', theme: 'dark' },
      { ecran: 'ipad-progression', legende: 'L7', theme: 'light' },
    ],
  },
}

// Image d'affiche de l'App Preview (§ 5, seconde 5) : l'écran seul, surimpressions texte.
// App Store Connect choisit l'affiche DANS la vidéo : ce rendu est la cible du tournage, pas
// un fichier à téléverser — d'où un dossier hors de fastlane/screenshots/.
export const POSTER = {
  width: 886,
  height: 1920,
  scale: 2,
  textes: {
    fr: { avant: 'Je parle français…', apres: '…il m’entend en coréen.' },
    en: { avant: 'I speak English…', apres: '…he hears me in Korean.' },
    es: { avant: 'Hablo español…', apres: '…él me oye en coreano.' },
    de: { avant: 'Ich spreche Deutsch…', apres: '…er hört mich auf Koreanisch.' },
    it: { avant: 'Parlo italiano…', apres: '…lui mi sente in coreano.' },
    pt: { avant: 'Eu falo português…', apres: '…ele me ouve em coreano.' },
    ar: { avant: 'أتكلّم العربية…', apres: '…ويسمعني بالكورية.' },
  },
}

// Bonjours semés en surimpression de Meeshy Global — des salutations, aucune promesse.
export const BONJOURS = [
  { lang: 'ko', texte: '안녕하세요!' },
  { lang: 'es', texte: '¡Hola!' },
  { lang: 'hi', texte: 'नमस्ते' },
  { lang: 'ja', texte: 'こんにちは' },
  { lang: 'ar', texte: 'مرحبًا' },
  { lang: 'pt', texte: 'Oi!' },
]

export const FASTLANE_SCREENSHOTS = resolve(REPO_ROOT, 'apps/ios/fastlane/screenshots')
export const OUT_APPSTORE = resolve(REPO_ROOT, 'scripts/marketing-kit/out')

const deuxChiffres = (n) => String(n).padStart(2, '0')

export const cheminFastlane = ({ appareil, lang, rang }) =>
  resolve(FASTLANE_SCREENSHOTS, appStoreLocale(lang), `${APPAREILS[appareil].prefixe}_${deuxChiffres(rang)}.png`)

export const cheminPoster = (lang) =>
  resolve(OUT_APPSTORE, 'app-preview', appStoreLocale(lang), 'poster-886x1920.png')

export const cheminPlanche = (lang) => resolve(OUT_APPSTORE, 'planches', `appstore-${appStoreLocale(lang)}.png`)

const segmenteur = new Intl.Segmenter('und', { granularity: 'grapheme' })

export const graphemes = (texte) => [...segmenteur.segment(texte)].length

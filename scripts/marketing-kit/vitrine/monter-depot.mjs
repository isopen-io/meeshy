// Le dépôt des sorties App Store dans l'arborescence andp (#9807, #9811). Rien ne part sans un contrôle
// ffprobe rejoué JUSTE avant la copie : une sortie non conforme, ou un aperçu requis absent, bloque TOUT le
// dépôt — andp n'enverrait sinon qu'une fiche à moitié remplie.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { controler } from '../lib/conformite.mjs'
import { appStoreLocale } from '../lib/locales.mjs'
import { APERCUS, APPAREILS_APERCU, FASTLANE_METADATA } from './apercus.mjs'

// Les seuls fichiers que ce dépôt possède : il les remplace, et ne touche à rien d'autre du dossier.
const GERES = {
  previews: new Set(APERCUS.map((a) => a.fichier)),
  product_page_header: new Set(['01-entete.mp4', '01-entete.png']),
  search_results: new Set(['01-recherche.png']),
}

export const destinationDe = ({ sortie, metadata = FASTLANE_METADATA }) => {
  if (sortie.type === 'apercu') return resolve(metadata, appStoreLocale(sortie.lang), 'previews', APPAREILS_APERCU[sortie.appareil].dossier, basename(sortie.chemin))
  if (sortie.type === 'entete') return resolve(metadata, appStoreLocale(sortie.lang), 'product_page_header', basename(sortie.chemin))
  if (sortie.type === 'recherche') return resolve(metadata, appStoreLocale(sortie.lang), 'search_results', basename(sortie.chemin))
  throw new Error(`sortie inconnue « ${sortie.type} »`)
}

// Ce que le dépôt exige : pour chaque langue et appareil choisis, chaque aperçu non facultatif ; pour
// chaque langue, l'en-tête (dans la forme choisie) et le visuel de recherche, si les créatifs sont choisis.
export const manquesAuDepot = ({ sorties, langs, appareils, apercus = APERCUS, creatifs = true, entete = 'video' }) => {
  const present = (pred) => sorties.some((s) => pred(s) && s.statut === 'pret')
  const apercusManquants = langs.flatMap((lang) => appareils.flatMap((appareil) =>
    apercus.filter((a) => !a.facultatif && !present((s) => s.type === 'apercu' && s.lang === lang && s.appareil === appareil && s.apercu === a.id))
      .map((a) => `${appStoreLocale(lang)}/${appareil}/${a.fichier}`)))
  const creatifsManquants = creatifs
    ? langs.flatMap((lang) => [
      !present((s) => s.type === 'entete' && s.lang === lang && s.forme === entete) && `${appStoreLocale(lang)}/en-tête (${entete})`,
      !present((s) => s.type === 'recherche' && s.lang === lang) && `${appStoreLocale(lang)}/recherche`,
    ].filter(Boolean))
    : []
  return [...apercusManquants, ...creatifsManquants]
}

const retirerLesFichiersGeres = (dossier) => {
  if (!existsSync(dossier)) return
  const geres = GERES[basename(dirname(dossier))] ?? GERES[basename(dossier)]
  for (const nom of readdirSync(dossier)) if (geres?.has(nom)) rmSync(resolve(dossier, nom))
}

// `sorties` : les fichiers produits ({ type, lang, appareil?, apercu?, forme?, chemin, spec, statut }).
export const deposer = ({ sorties, langs, appareils, apercus = APERCUS, creatifs = true, entete = 'video', metadata = FASTLANE_METADATA, controle = controler }) => {
  const manques = manquesAuDepot({ sorties, langs, appareils, apercus, creatifs, entete })
  if (manques.length) throw new Error(`dépôt refusé : ${manques.length} fichier(s) requis absent(s) — ${manques.join(', ')}`)
  const ids = new Set(apercus.map((a) => a.id))
  const retenue = (s) => (s.type === 'apercu' ? appareils.includes(s.appareil) && ids.has(s.apercu) : creatifs && (s.type !== 'entete' || s.forme === entete))
  const choisis = sorties.filter((s) => s.statut === 'pret' && langs.includes(s.lang) && retenue(s))
  const controles = choisis.map((s) => ({ sortie: s, ...controle(s.chemin, s.spec) }))
  const fautifs = controles.filter((c) => !c.conforme)
  if (fautifs.length) {
    throw new Error(`dépôt refusé : ${fautifs.length} fichier(s) non conforme(s)\n${fautifs.map((c) => `  ${c.fichier} : ${c.erreurs.join(' ; ')}`).join('\n')}`)
  }
  const copies = choisis.map((s) => ({ de: s.chemin, vers: destinationDe({ sortie: s, metadata }) }))
  for (const dossier of new Set(copies.map((c) => dirname(c.vers)))) {
    retirerLesFichiersGeres(dossier)
    mkdirSync(dossier, { recursive: true })
  }
  for (const { de, vers } of copies) copyFileSync(de, vers)
  return copies.map(({ de, vers }) => ({ de, vers, relatif: relative(metadata, vers), extension: extname(vers) }))
}

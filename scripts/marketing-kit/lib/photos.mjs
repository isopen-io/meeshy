import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { raw } from './html.mjs'
import { REPO_ROOT } from './catalog.mjs'

// Photos RÉELLES des scènes (#8825) : Pexels, libres pour un usage commercial, sans personne à
// l'image. Leur provenance (auteur, page, licence) vit dans photos/credits.json. L'image est
// incrustée en data: — le rendu est hors réseau, et une page ouverte par setContent n'a pas le
// droit de lire un fichier local.
const DOSSIER = resolve(REPO_ROOT, 'scripts/marketing-kit/photos')

export const CREDITS = JSON.parse(readFileSync(resolve(DOSSIER, 'credits.json'), 'utf8'))

const urls = new Map()

export const photoUrl = (nom) => {
  const credit = CREDITS[nom]
  if (!credit) throw new Error(`photo inconnue : ${nom} (connues : ${Object.keys(CREDITS).join(', ')})`)
  if (!urls.has(nom)) urls.set(nom, `data:image/jpeg;base64,${readFileSync(resolve(DOSSIER, credit.fichier)).toString('base64')}`)
  return urls.get(nom)
}

export const photo = (nom, { className = '' } = {}) =>
  raw(`<img class="photo${className ? ` ${className}` : ''}" src="${photoUrl(nom)}" alt="">`)

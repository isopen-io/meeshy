import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../../lib/catalog.mjs'

// « 76 langues traduisibles » : lues dans le catalogue produit (SUPPORTED_LANGUAGES,
// `supportsTranslation: true`), jamais recopiées — le mur de langues et la carte ne peuvent
// pas afficher un autre chiffre que celui du code.
const SOURCE = 'packages/shared/utils/languages.ts'

const champ = (bloc, nom) => bloc.match(new RegExp(`\\b${nom}: '([^']*)'`))?.[1]

export const LANGUES_TRADUISIBLES = readFileSync(resolve(REPO_ROOT, SOURCE), 'utf8')
  .split(/\n\s*\{\s*\n\s*code: /)
  .slice(1)
  .map((bloc) => `code: ${bloc.split(/\n\s*\},?\s*\n/)[0]}`)
  .filter((bloc) => /supportsTranslation: true/.test(bloc))
  .map((bloc) => ({ code: champ(bloc, 'code'), nom: champ(bloc, 'nativeName') ?? champ(bloc, 'name'), drapeau: champ(bloc, 'flag') }))

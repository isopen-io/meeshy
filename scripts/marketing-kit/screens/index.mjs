import { ecranDm, ecranGlobal, ecranGroupe } from './conversations.mjs'
import { ecranProgression, ecranSucces } from './progression.mjs'
import { ecranDecouverte, ecranFil, ecranStory } from './social.mjs'
import { ecranAppel, ecranInvitation } from './appel.mjs'
import { ecranAmour, ecranAmourPhotos, ecranAppelAmour } from './amour.mjs'
import { ecranDebat, ecranDrole } from './groupes.mjs'
import {
  ipadAmour,
  ipadAmourPhotos,
  ipadAppelAmour,
  ipadDebat,
  ipadDrole,
  ipadFil,
  ipadGlobal,
  ipadProgression,
  ipadStory,
} from './ipad.mjs'

export const ECRANS = {
  dm: ecranDm,
  groupe: ecranGroupe,
  global: ecranGlobal,
  fil: ecranFil,
  decouverte: ecranDecouverte,
  story: ecranStory,
  progression: ecranProgression,
  succes: ecranSucces,
  appel: ecranAppel,
  invitation: ecranInvitation,
  amour: ecranAmour,
  'amour-photos': ecranAmourPhotos,
  drole: ecranDrole,
  debat: ecranDebat,
  'appel-amour': ecranAppelAmour,
  'ipad-amour': ipadAmour,
  'ipad-amour-photos': ipadAmourPhotos,
  'ipad-drole': ipadDrole,
  'ipad-debat': ipadDebat,
  'ipad-appel-amour': ipadAppelAmour,
  'ipad-global': ipadGlobal,
  'ipad-fil': ipadFil,
  'ipad-story': ipadStory,
  'ipad-progression': ipadProgression,
}

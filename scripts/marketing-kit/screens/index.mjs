import { ecranDm, ecranGlobal, ecranGroupe } from './conversations.mjs'
import { ecranProgression, ecranSucces } from './progression.mjs'
import { ecranDecouverte, ecranFil, ecranStory } from './social.mjs'
import { ecranAppel, ecranInvitation } from './appel.mjs'
import { ipadAppel, ipadDm, ipadFil, ipadGlobal, ipadGroupe, ipadProgression, ipadStory } from './ipad.mjs'

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
  'ipad-dm': ipadDm,
  'ipad-global': ipadGlobal,
  'ipad-fil': ipadFil,
  'ipad-groupe': ipadGroupe,
  'ipad-progression': ipadProgression,
  'ipad-appel': ipadAppel,
  'ipad-story': ipadStory,
}

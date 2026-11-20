/**
 * LA CHUTE DÉTECTÉE (#18748, SAN-01), langue « en » — chargée à la demande (`i18n-fall-catalog.ts`), jamais au
 * démarrage.
 */
import type { FallCatalog } from '../i18n-fall-catalog';

const en = {
  'fall.announce.detected': 'A fall was detected on {name}’s watch',
  'fall.announce.detectedSomeone': 'A fall was detected on a Blood link’s watch',
  'fall.announce.responded': '{name} is OK',
  'fall.announce.respondedSomeone': 'A Blood link is OK',
  'fall.detail.title': 'Fall detected',
  'fall.detail.at': 'Fall detected at {time}',
  'fall.detail.battery': 'Last battery: {value}',
  'fall.detail.map': 'Last location',
  'fall.share.title': 'Alert if my watch detects a fall',
  'fall.share.explain': 'If your Apple Watch detects a fall, {name} is alerted right away.',
  'fall.me.title': 'Fall detection',
  'fall.me.source': 'Apple Watch',
  'fall.me.question': 'Where does detection come from?',
  'fall.me.explain': 'It comes from an Apple Watch: consent is given in the iPhone app, never here. Your Blood links are then alerted to a fall.',
  'fall.settings.failed': 'The setting couldn’t be saved.',
  'fall.settings.offline': 'Offline: the setting wasn’t saved.',
} as const satisfies FallCatalog;

export default en;

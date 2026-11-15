/**
 * Il telefono irraggiungibile delle persone vicine e del Sangue (#18737, TEL-01), italiano — caricato su richiesta
 * (`i18n-phone-reachability-catalog.ts`), mai all'avvio.
 */
import type { PhoneReachabilityCatalog } from '../i18n-phone-reachability-catalog';

const it = {
  'phone.announce.unreachable': 'Il telefono di {name} è irraggiungibile dalle {time}',
  'phone.announce.unreachableSomeone': 'Il telefono di una persona vicina è irraggiungibile dalle {time}',
  'phone.announce.reachable': 'Il telefono di {name} risponde di nuovo',
  'phone.announce.reachableSomeone': 'Il telefono di una persona vicina risponde di nuovo',
  'phone.a11y.unreachable': 'telefono irraggiungibile dalle {time}',
  'phone.detail.title': 'Telefono',
  'phone.detail.since': 'Telefono irraggiungibile dalle {time}',
  'phone.cause.battery': 'Batteria scarica, probabilmente',
  'phone.cause.network': 'Senza rete o in modalità aereo, probabilmente',
  'phone.share.title': 'Avvisare {name} se il mio telefono è irraggiungibile',
  'phone.share.explainClose': '{name} saprà da quando il tuo telefono non risponde e il motivo probabile. Nulla viene condiviso finché non lo attivi.',
  'phone.share.explainBlood': 'Attivo per impostazione predefinita con il tuo Sangue. Puoi toglierlo in qualsiasi momento.',
  'phone.share.globalOff': 'Non avvisi più nessuno: è disattivato per tutti, dal tuo profilo.',
  'phone.global.title': 'Avvisare le mie persone vicine se il mio telefono è irraggiungibile',
  'phone.global.explain': 'Il tuo Sangue, e le persone vicine a cui l’hai concesso, sanno da quando il tuo telefono non risponde e il motivo probabile. Mai in una conversazione.',
  'phone.global.question': 'Chi viene avvisato?',
  'phone.consent.title': 'Avvisare {name} se il tuo telefono smette di rispondere?',
  'phone.consent.body': '{name} saprà che il tuo telefono è irraggiungibile, da quando, e se probabilmente è la batteria o la rete. Puoi cambiarlo qui quando vuoi.',
  'phone.consent.confirm': 'Continua',
  'phone.settings.failed': 'Impossibile salvare l’impostazione.',
  'phone.settings.offline': 'Offline: l’impostazione non è stata salvata.',
  'phone.webNote': 'Questo browser non conta: solo l’app Meeshy del tuo telefono dice se è raggiungibile.',
} as const satisfies PhoneReachabilityCatalog;

export default it;

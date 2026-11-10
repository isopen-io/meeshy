import type { ExternalConversationCatalog } from '@/lib/i18n-external-conversation-catalog';

const it = {
  'externalConversation.entry.title': 'Scrivere a un amico su WhatsApp',
  'externalConversation.entry.detail': 'Tramite il suo numero, crittografato end-to-end',
  'externalConversation.handle.label': 'Numero WhatsApp del tuo amico',
  'externalConversation.handle.hint': 'In formato internazionale, con il prefisso del paese: +39 312 345 6789.',
  'externalConversation.handle.invalid': 'Questo numero non è in formato internazionale. Inizia con + e il prefisso del paese.',
  'externalConversation.submit': 'Scrivi',
  'externalConversation.pending': 'Apertura…',
  'externalConversation.cancel': 'Annulla',
  'externalConversation.encrypted': 'Crittografato end-to-end: Meeshy non può leggere i tuoi messaggi. La traduzione avviene sul tuo dispositivo e le funzioni che richiedono di leggere il messaggio sui nostri server non esistono in questa conversazione.',
  'externalConversation.phoneUnverified': 'Verifica il tuo numero per scrivere a un amico su WhatsApp.',
  'externalConversation.phoneVerified': 'Numero verificato. Tocca «Scrivi» per aprire la conversazione.',
  'externalConversation.refused.disabled': 'Scrivere a un amico su WhatsApp non è ancora disponibile qui.',
  'externalConversation.refused.reserved': 'Durante la fase di test, le conversazioni crittografate end-to-end sono riservate ad alcuni account.',
  'externalConversation.refused.limit': 'Hai già il numero massimo di conversazioni WhatsApp aperte. Chiudine una per aprirne un’altra.',
  'externalConversation.refused.rateLimited': 'Troppe conversazioni aperte in poco tempo. Riprova tra un’ora.',
  'externalConversation.refused.offline': 'Offline: riconnettiti, poi tocca di nuovo «Scrivi».',
  'externalConversation.refused.failed': 'Impossibile aprire questa conversazione. Riprova tra un attimo.',
} satisfies ExternalConversationCatalog;

export default it;

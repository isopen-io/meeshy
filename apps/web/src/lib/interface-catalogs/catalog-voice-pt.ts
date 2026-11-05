/**
 * LA VOIX (#16419), PORTUGAIS : la section Réglages › Voix et la note
 * sous mon propre vocal. Hors du catalogue d'interface, arrivé à son plafond :
 * chargé à la demande (`i18n-voice-catalog.ts`), jamais au démarrage.
 */
import type { VoiceCatalog } from '../i18n-voice-catalog';

const pt = {
  'voice.title': 'Voz',
  'voice.intro': 'O que o Meeshy faz com suas mensagens de voz. Cada permissão pode ser retirada a qualquer momento.',
  'voice.transcription': 'Transcrever minhas mensagens de voz',
  'voice.transcription.info': 'Suas mensagens de voz são convertidas em texto que todos podem ler e traduzir.',
  'voice.translation': 'Traduzir minhas mensagens de voz',
  'voice.translation.info': 'Suas mensagens de voz são ouvidas no idioma de cada destinatário.',
  'voice.cloning': 'Clonar minha voz',
  'voice.cloning.info': 'As traduções em áudio das suas mensagens usam a sua própria voz.',
  'voice.loading': 'Lendo suas permissões de voz…',
  'voice.unavailable': 'Não foi possível ler suas permissões de voz.',
  'voice.retry': 'Tentar novamente',
  'voice.notice.message': 'Ative o consentimento de voz para que suas mensagens de áudio sejam transcritas e traduzidas.',
  'voice.notice.action': 'Ativar nas Configurações',
} as const satisfies VoiceCatalog;

export default pt;

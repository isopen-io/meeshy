import type { CallRecordingCatalog } from '@/lib/i18n-call-recording-catalog';

const pt = {
  'callRecording.stop': 'Parar a gravação',
  'callRecording.active': 'Gravação em curso',
  'callRecording.waiting': 'À espera do consentimento de todos…',
  'callRecording.ask': '{name} quer gravar a chamada',
  'callRecording.askVideo': '{name} quer gravar a chamada em vídeo',
  'callRecording.askDetail': 'A gravação só começa se todos aceitarem e depois é adicionada à conversa.',
  'callRecording.accept': 'Aceitar',
  'callRecording.refuse': 'Recusar',
  'callRecording.cancel': 'Cancelar',
  'callRecording.someone': 'Um participante',
  'callRecording.stopped.refused': 'Gravação recusada',
  'callRecording.stopped.timeout': 'Nem todos responderam: sem gravação',
  'callRecording.stopped.joined': 'Alguém entrou na chamada: gravação parada',
  'callRecording.stopped.other': 'Gravação parada',
  'callRecording.unavailable': 'Gravação indisponível de momento',
  'callRecording.saved': 'A gravação foi adicionada à conversa',
  'callRecording.saveFailed': 'Não foi possível adicionar a gravação',
  'callRecording.close': 'Fechar',
} satisfies CallRecordingCatalog;

export default pt;

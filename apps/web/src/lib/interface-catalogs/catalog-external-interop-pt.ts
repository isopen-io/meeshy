import type { ExternalInteropCatalog } from '@/lib/i18n-external-interop-catalog';

/** L'information sur ce qui part chez Meta et le signalement d'un contenu WhatsApp (#17120) — voir `catalog-external-interop-fr.ts`. */
const pt = {
  'externalInterop.notice.title': 'Escrever a um amigo no WhatsApp',
  'externalInterop.notice.lead': 'Para falar com seu amigo no WhatsApp, a Meeshy compartilha com a Meta, que opera o WhatsApp:',
  'externalInterop.disclosure.phone-number': 'seu número de telefone verificado, que identifica você no WhatsApp;',
  'externalInterop.disclosure.profile-name': 'seu nome de exibição;',
  'externalInterop.disclosure.public-keys': 'as chaves públicas de criptografia dos seus dispositivos;',
  'externalInterop.disclosure.encrypted-content': 'suas mensagens e mídias, criptografadas de ponta a ponta: a Meta não consegue lê-las;',
  'externalInterop.disclosure.delivery-metadata': 'quem escreve a quem, quando, o tamanho dos envios e as confirmações de entrega.',
  'externalInterop.notice.retention': 'A Meeshy guarda o número do seu amigo por {days} dias depois da última vez que você abre a conversa e, em seguida, o apaga.',
  'externalInterop.notice.retention.unknown': 'A Meeshy guarda o número do seu amigo por um tempo limitado e, em seguida, o apaga.',
  'externalInterop.notice.translation': 'A tradução é feita no seu dispositivo: a Meeshy nunca vê o conteúdo desta conversa.',
  'externalInterop.notice.withdraw': 'Você pode retirar este consentimento a qualquer momento: a Meeshy então apaga os números dos seus amigos do WhatsApp.',
  'externalInterop.notice.accept': 'Aceito e continuo',
  'externalInterop.notice.accept.busy': 'Salvando…',
  'externalInterop.notice.cancel': 'Cancelar',
  'externalInterop.notice.outdated': 'Esta informação mudou: atualize a Meeshy para lê-la novamente antes de aceitar.',
  'externalInterop.notice.unavailable': 'Escrever a um amigo no WhatsApp ainda não está disponível aqui.',
  'externalInterop.notice.error': 'Não foi possível salvar seu consentimento. Tente novamente.',
  'externalInterop.report.title': 'Denunciar este conteúdo do WhatsApp',
  'externalInterop.report.lead': 'A Meeshy não consegue ler esta conversa: só o que você decidir anexar é enviado à nossa equipe de moderação.',
  'externalInterop.report.reason': 'Motivo',
  'externalInterop.report.attach': 'Anexar o texto da mensagem',
  'externalInterop.report.attach.hint': 'O texto anexado é enviado sem criptografia à moderação da Meeshy.',
  'externalInterop.report.block': 'Bloquear este contato na Meeshy',
  'externalInterop.report.submit': 'Enviar a denúncia',
  'externalInterop.report.submit.busy': 'Enviando…',
  'externalInterop.report.cancel': 'Cancelar',
  'externalInterop.report.done.title': 'Denúncia enviada',
  'externalInterop.report.done.blocked': 'Este contato está bloqueado: você não receberá mais as mensagens dele na Meeshy.',
  'externalInterop.report.done.orientation': 'A Meeshy não pode agir sobre a conta de WhatsApp dessa pessoa. Para remover este conteúdo do WhatsApp, use a denúncia oferecida pela Meta.',
  'externalInterop.report.done.close': 'Fechar',
  'externalInterop.report.error': 'Não foi possível enviar a denúncia. Tente novamente.',
} satisfies ExternalInteropCatalog;

export default pt;

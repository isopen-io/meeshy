import type { ExternalConversationCatalog } from '@/lib/i18n-external-conversation-catalog';

const pt = {
  'externalConversation.entry.title': 'Escrever a um amigo no WhatsApp',
  'externalConversation.entry.detail': 'Pelo número dele, criptografado de ponta a ponta',
  'externalConversation.handle.label': 'Número de WhatsApp do seu amigo',
  'externalConversation.handle.hint': 'No formato internacional, com o código do país: +351 912 345 678.',
  'externalConversation.handle.invalid': 'Este número não está no formato internacional. Comece por + e o código do país.',
  'externalConversation.submit': 'Escrever',
  'externalConversation.pending': 'Abrindo…',
  'externalConversation.cancel': 'Cancelar',
  'externalConversation.encrypted': 'Criptografado de ponta a ponta: o Meeshy não consegue ler suas mensagens. A tradução é feita no seu dispositivo, e os recursos que exigem ler a mensagem nos nossos servidores não existem nesta conversa.',
  'externalConversation.phoneUnverified': 'Verifique seu número para escrever a um amigo no WhatsApp.',
  'externalConversation.phoneVerified': 'Número verificado. Toque em “Escrever” para abrir a conversa.',
  'externalConversation.refused.disabled': 'Escrever a um amigo no WhatsApp ainda não está disponível aqui.',
  'externalConversation.refused.reserved': 'Durante a fase de testes, as conversas criptografadas de ponta a ponta estão reservadas a algumas contas.',
  'externalConversation.refused.limit': 'Você já tem o número máximo de conversas do WhatsApp abertas. Feche uma para abrir outra.',
  'externalConversation.refused.rateLimited': 'Muitas conversas abertas em pouco tempo. Tente de novo daqui a uma hora.',
  'externalConversation.refused.offline': 'Sem conexão: reconecte-se e toque em “Escrever” de novo.',
  'externalConversation.refused.failed': 'Não foi possível abrir esta conversa. Tente de novo em instantes.',
} satisfies ExternalConversationCatalog;

export default pt;

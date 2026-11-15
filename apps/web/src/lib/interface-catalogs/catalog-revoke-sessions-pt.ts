import type { RevokeSessionsCatalog } from '@/lib/i18n-revoke-sessions-catalog';

/** Le lien « ce n'était pas moi » — voir `catalog-revoke-sessions-fr.ts`. */
const pt = {
  'revokeSessions.title': 'Não foi você?',
  'revokeSessions.body': 'Encerre a sessão da sua conta em todos os dispositivos, incluindo o que acabou de entrar. Depois, será preciso entrar novamente.',
  'revokeSessions.action': 'Sair de todos os dispositivos',
  'revokeSessions.working': 'Saindo…',
  'revokeSessions.done.title': 'Todos os dispositivos foram desconectados',
  'revokeSessions.done.body': 'Altere sua senha na próxima vez que entrar.',
  'revokeSessions.invalid': 'Este link de segurança expirou ou já foi usado. Entre para gerenciar suas sessões.',
  'revokeSessions.dismiss': 'Fui eu',
} as const satisfies RevokeSessionsCatalog;

export default pt;

import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const pt = {
  'signInLink.confirm.title': 'Entrar como @{username}?',
  'signInLink.confirm.lead': 'Este link não foi pedido a partir deste dispositivo. Continue apenas se esta conta for sua.',
  'signInLink.confirm.leadSignedIn': 'Você está conectado como @{current}. Este link abriria a conta abaixo no lugar dela; @{current} continuará nas suas contas neste dispositivo.',
  'signInLink.confirm.accept': 'Entrar',
  'signInLink.confirm.cancel': 'Cancelar',
  'signInLink.confirm.claim': 'Este endereço será associado a @{username} e removido de qualquer outra conta Meeshy.',
  'signInLink.confirm.acceptClaim': 'Associar o endereço e entrar',
  'verifyEmail.bar.title': 'Verificação do e-mail',
  'verifyEmail.noAddress': 'Este link não contém nenhum endereço de e-mail para verificar. Abra-o a partir do e-mail que a Meeshy lhe enviou.',
  'verifyEmail.continue': 'Continuar',
  'verifyEmail.title': 'Verifique o seu e-mail',
  'verifyEmail.subtitle': 'Introduza o código de 6 dígitos enviado para {email}',
  'verifyEmail.subtitle.created': 'Criámos a sua conta e enviámos um código e um link para {email}. Introduza o código ou abra o link.',
  'verifyEmail.subtitle.pending': 'A sua palavra-passe está correta, mas a sua conta tem primeiro de ser ativada, provando que este endereço é seu. Acabámos de enviar um código e um link para {email}.',
  'verifyEmail.subtitle.pending.inbox': 'Abra a sua caixa de correio e verifique também a pasta de spam.',
  'verifyEmail.resend.prompt': 'Não recebeu o código?',
  'verifyEmail.resend': 'Reenviar o código',
  'verifyEmail.resend.busy': 'A enviar…',
  'verifyEmail.resend.locked': 'Reenviar o código ({seconds}s)',
  'verifyEmail.resend.done': 'Código reenviado!',
  'verifyEmail.link.invalid': 'Este link já não é válido. Introduza o código recebido no mesmo e-mail.',
  'verifyEmail.handoff.opened': 'O link foi aberto no app Meeshy.',
  'verifyEmail.handoff.stay': 'Continuar no navegador',
  'verifyEmail.arrival.title': 'Endereço confirmado!',
  'verifyEmail.arrival.lead': 'A preparar as suas conversas…',
  'verifyEmail.arrival.status': 'Endereço confirmado — a iniciar sessão…',
} satisfies SignInLinkCatalog;

export default pt;

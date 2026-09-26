/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-pt.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const ptVerifyEmail = {
  'verifyEmail.bar.title': 'Verificação do e-mail',
  'verifyEmail.noAddress': 'Este link não contém nenhum endereço de e-mail para verificar. Abra-o a partir do e-mail que a Meeshy lhe enviou.',
  'verifyEmail.backToLogin': 'Voltar ao início de sessão',
  'verifyEmail.verified': 'E-mail verificado!',
  'verifyEmail.continue': 'Continuar',
  'verifyEmail.title': 'Verifique o seu e-mail',
  'verifyEmail.subtitle': 'Introduza o código de 6 dígitos enviado para {email}',
  'verifyEmail.subtitle.created': 'Criámos a sua conta e enviámos um código e um link para {email}. Introduza o código ou abra o link.',
  'verifyEmail.subtitle.pending': 'A sua conta aguarda verificação: reenviámos um código e um link para {email}.',
  'verifyEmail.code.label': 'Código de verificação',
  'verifyEmail.submit': 'Verificar',
  'verifyEmail.submit.busy': 'A verificar…',
  'verifyEmail.error.invalid': 'Código inválido ou expirado',
  'verifyEmail.error.offline': 'Sem ligação. Verifique a sua rede e tente novamente.',
  'verifyEmail.error.rateLimited': 'Demasiadas tentativas — tente novamente dentro de alguns minutos.',
  'verifyEmail.resend.prompt': 'Não recebeu o código?',
  'verifyEmail.resend': 'Reenviar o código',
  'verifyEmail.resend.busy': 'A enviar…',
  'verifyEmail.resend.locked': 'Reenviar o código ({seconds}s)',
  'verifyEmail.resend.done': 'Código reenviado!',
  'verifyEmail.link.checking': 'A verificar o link…',
  'verifyEmail.link.invalid': 'Este link já não é válido. Introduza o código recebido no mesmo e-mail.',
  'verifyEmail.signingIn': 'A iniciar sessão…',
  'emailSent.codeOrLink': 'Introduza o código de 6 dígitos recebido em {email} ou abra o link do mesmo e-mail.',
};

export default ptVerifyEmail;

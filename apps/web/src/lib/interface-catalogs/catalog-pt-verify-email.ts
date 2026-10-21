/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-pt.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const ptVerifyEmail = {
  'verifyEmail.backToLogin': 'Voltar ao início de sessão',
  'verifyEmail.verified': 'E-mail verificado!',
  'verifyEmail.code.label': 'Código de verificação',
  'verifyEmail.submit': 'Verificar',
  'verifyEmail.submit.busy': 'A verificar…',
  'verifyEmail.error.invalid': 'Código inválido ou expirado',
  'verifyEmail.error.offline': 'Sem ligação. Verifique a sua rede e tente novamente.',
  'verifyEmail.error.rateLimited': 'Demasiadas tentativas — tente novamente dentro de alguns minutos.',
  'verifyEmail.link.checking': 'A verificar o link…',
  'verifyEmail.proven': 'Endereço confirmado ✓ — digite o código recebido para entrar aqui.',
  'emailSent.codeOrLink': 'Introduza o código de 6 dígitos recebido em {email} ou abra o link do mesmo e-mail.',
  'signInLink.switchAccount.title': 'Abrir OUTRA conta?',
  'signInLink.switchAccount.lead': 'Você está conectado como @{current}, mas o que você acabou de abrir leva a outra conta:',
  'signInLink.switchAccount.warning': 'Se você não pediu este link ou código, cancele: sua sessão continua aberta e nada muda.',
  'signInLink.switchAccount.cancel': 'Cancelar e continuar em @{current}',
  'signInLink.switchAccount.confirm': 'Abrir esta outra conta',
  'signInLink.switchAccount.kept': '@{current} continuará nas suas contas neste dispositivo.',
  'signInLink.switchAccount.busy': 'Um momento…',
  'signInLink.switchAccount.failed': 'Não é possível abrir esta outra conta agora. Sua sessão continua aberta e o link foi fechado.',
  'signInLink.switchAccount.expired': 'Este link expirou: peça um novo. Sua sessão continua aberta.',
  'signInLink.switchAccount.leave': 'Voltar ao início',
  'emailSent.title': 'E-mail enviado',
  'emailSent.openLink': 'Abra o link enviado para {email}',
  'emailSent.nothingReceived': 'Não recebeu nada?',
  'emailSent.nothingReceived.text': 'Verifique sua pasta de spam: a mensagem pode ter ido parar lá.',
};

export default ptVerifyEmail;

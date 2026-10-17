import type { AccountRecoveryCatalog } from '@/lib/i18n-account-recovery-catalog';

/** Le mot de passe oublié et sa réinitialisation (#10823) — voir `catalog-account-recovery-fr.ts`. */
const pt = {
  'recovery.forgot.lead': 'Receba por e-mail um link para escolher uma nova senha.',
  'recovery.forgot.neverHad': 'Nunca teve uma senha?',
  'recovery.forgot.neverHad.text': 'O mesmo link permite criar uma.',
  'recovery.reset.newPassword': 'Nova senha',
  'recovery.reset.lead': 'Escolha uma nova senha.',
  'recovery.reset.confirm': 'Confirmar senha',
  'recovery.reset.tooShort': 'Senha curta demais (mín. {min} caracteres)',
  'recovery.reset.mismatch': 'As senhas não coincidem',
  'recovery.reset.submit': 'Salvar senha',
  'recovery.reset.submit.busy': 'Salvando…',
  'recovery.reset.invalid.title': 'Link inválido ou expirado',
  'recovery.reset.invalid.text': 'Peça um novo link para escolher sua senha.',
  'recovery.reset.invalid.action': 'Pedir um novo link',
  'recovery.reset.done.title': 'Senha salva',
  'recovery.reset.done.text': 'Agora você pode entrar com sua nova senha.',
  'recovery.reset.code': 'Código de verificação',
  'recovery.reset.code.lead': 'Introduza o código de 6 dígitos da sua aplicação de autenticação.',
  'recovery.reset.error.codeRequired': 'Esta conta está protegida: introduza o código de verificação da sua aplicação de autenticação.',
  'recovery.reset.error.codeInvalid': 'Código de verificação incorreto.',
  'recovery.reset.error.weak': 'Esta palavra-passe é demasiado fácil de adivinhar. Escolha uma mais longa ou menos previsível.',
  'recovery.reset.error.reused': 'Usou esta palavra-passe recentemente. Escolha outra.',
  'recovery.reset.error.rateLimited': 'Demasiadas tentativas. Aguarde alguns minutos antes de tentar novamente.',
  'recovery.reset.error.locked': 'Esta conta está temporariamente bloqueada. Contacte o suporte.',
  'recovery.reset.exhausted.title': 'Demasiados códigos incorretos',
  'recovery.reset.exhausted.text': 'Por segurança, esta ligação foi desativada. Peça uma nova.',
} satisfies AccountRecoveryCatalog;

export default pt;

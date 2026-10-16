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
} satisfies AccountRecoveryCatalog;

export default pt;

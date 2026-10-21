import type { AccountDeletionGuideCatalog } from '@/lib/i18n-account-deletion-guide';

/**
 * LA PAGE DE SUPPRESSION VUE DÉCONNECTÉ — ses libellés, importés par la seule page
 * qui les rend : les catalogues d'interface (budget `interface_catalogs`) n'en portent rien.
 * `routes/account-deletion-guide.tsx` (#9921).
 */
const ptAccountDeletionGuide = {
  'accountDeletion.guide.title': 'Excluir sua conta Meeshy',
  'accountDeletion.guide.intro': 'Esta página trata do aplicativo Meeshy no Android, iOS e na web. Ela explica como excluir sua conta e o que acontece com seus dados.',
  'accountDeletion.guide.steps.title': 'Como fazer',
  'accountDeletion.guide.step.signIn': 'Entre com o botão abaixo. No aplicativo, o mesmo pedido fica em Ajustes, Excluir conta.',
  'accountDeletion.guide.step.confirm': 'Digite a frase de confirmação e sua senha e peça a exclusão.',
  'accountDeletion.guide.step.email': 'Abra o e-mail que enviamos e confirme a exclusão.',
  'accountDeletion.guide.step.wait': 'Sua conta é excluída 30 dias depois. Você não precisa fazer mais nada.',
  'accountDeletion.guide.signIn': 'Entrar para excluir minha conta',
  'accountDeletion.guide.deleted.title': 'O que é excluído',
  'accountDeletion.guide.deleted.profile': 'Seu perfil: nome, nome de usuário, e-mail, número de telefone, foto, capa, biografia e data de nascimento.',
  'accountDeletion.guide.deleted.access': 'Sua senha, suas sessões e suas chaves de criptografia.',
  'accountDeletion.guide.deleted.messages': 'O texto das suas mensagens e suas traduções, suas fotos, vídeos e mensagens de voz.',
  'accountDeletion.guide.deleted.other': 'Seu perfil de voz, sua agenda de contatos, suas notificações, seus links de compartilhamento, seu progresso no jogo e seus stickers.',
  'accountDeletion.guide.kept.title': 'O que é mantido',
  'accountDeletion.guide.kept.messages': 'Nas conversas dos outros, suas mensagens continuam no lugar, vazias e marcadas como excluídas.',
  'accountDeletion.guide.kept.posts': 'O texto das suas publicações e comentários continua visível com o nome “Conta excluída”. Para removê-los, exclua-os no aplicativo antes do pedido.',
  'accountDeletion.guide.kept.packs': 'Os pacotes de stickers que você publicou continuam disponíveis, sem o seu nome.',
  'accountDeletion.guide.kept.stats': 'Um identificador de conta anônimo e estatísticas de uso que não permitem identificá-lo.',
  'accountDeletion.guide.delay.title': 'Prazo',
  'accountDeletion.guide.delay.body': 'Sua conta é excluída 30 dias após sua confirmação. Até lá, você pode cancelar com o link recebido por e-mail.',
  'accountDeletion.guide.noAccess.title': 'Não consegue mais entrar?',
  'accountDeletion.guide.noAccess.body': 'Escreva para nós a partir do e-mail da sua conta pedindo a exclusão. Respondemos em até 30 dias.',
} as const satisfies AccountDeletionGuideCatalog;

export default ptAccountDeletionGuide;

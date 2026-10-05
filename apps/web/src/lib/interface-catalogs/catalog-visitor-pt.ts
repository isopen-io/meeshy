import type { VisitorCatalog } from '@/lib/i18n-visitor-catalog';

/** L'invitation du visiteur (#9149) — voir `catalog-visitor-fr.ts`. */
const pt = {
  'visitor.title': 'Entre no Meeshy',
  'visitor.sharedBy.reel': '{name} compartilhou este reel com você',
  'visitor.sharedBy.post': '{name} compartilhou esta publicação com você',
  'visitor.sharedBy.story': '{name} compartilhou este story com você',
  'visitor.sharedBy.mood': '{name} compartilhou este humor com você',
  'visitor.body': 'Crie sua conta ou entre para reagir, comentar e ler tudo no seu idioma.',
  'visitor.signup': 'Criar uma conta',
  'visitor.login': 'Entrar',
  'visitor.later': 'Continuar assistindo',
  'visitor.refused.title': 'Este conteúdo não está disponível',
  'visitor.refused.body': 'Ele não existe mais ou é reservado ao seu público. Entre para vê-lo se ele foi destinado a você.',
} satisfies VisitorCatalog;

export default pt;

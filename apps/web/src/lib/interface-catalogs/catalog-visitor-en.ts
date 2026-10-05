import type { VisitorCatalog } from '@/lib/i18n-visitor-catalog';

/** L'invitation du visiteur (#9149) — voir `catalog-visitor-fr.ts`. */
const en = {
  'visitor.title': 'Join Meeshy',
  'visitor.sharedBy.reel': '{name} shared this reel with you',
  'visitor.sharedBy.post': '{name} shared this post with you',
  'visitor.sharedBy.story': '{name} shared this story with you',
  'visitor.sharedBy.mood': '{name} shared this mood with you',
  'visitor.body': 'Create your account or sign in to react, comment and read everything in your language.',
  'visitor.signup': 'Create an account',
  'visitor.login': 'Sign in',
  'visitor.later': 'Keep watching',
  'visitor.refused.title': 'This content isn’t available',
  'visitor.refused.body': 'It no longer exists, or it’s only for its audience. Sign in to see it if it was meant for you.',
} satisfies VisitorCatalog;

export default en;

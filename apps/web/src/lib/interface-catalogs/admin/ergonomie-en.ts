import type { AdminCatalogFragment } from './fragment';
import type fr from './ergonomie-fr';

const f = {
  'admin.quickEdit.title': 'Quick edit',
  'admin.quickEdit.subtitle': 'Tap a detail to change it: it is saved as soon as you leave it.',
  'admin.quickEdit.fold': 'Collapse quick edit',
  'admin.quickEdit.unfold': 'Expand quick edit',
  'admin.quickEdit.birthDate': 'Date of birth',
  'admin.quickEdit.birthValue': '{date} · {age}',
  'admin.quickEdit.account': 'Account',
  'admin.quickEdit.active': 'Active',
  'admin.quickEdit.inactive': 'Deactivated',
  'admin.quickEdit.presence': 'Presence',
  'admin.quickEdit.lastSeen': 'Seen on {date}',
  'admin.quickEdit.attempts': 'Sign-in attempts',
  'admin.quickEdit.attemptsCount': 'Failures since the last sign-in: {count}',
  'admin.quickEdit.attemptsNone': 'No recent failure',
  'admin.quickEdit.attemptsReset': 'Reset to zero',
  'admin.quickEdit.attemptsDone': 'Attempts reset, account unlocked',
  'admin.quickEdit.regeneratePassword': 'Regenerate the password',
  'admin.quickEdit.roleTitle': 'Make this member “{role}”?',
  'admin.quickEdit.roleConfirm': 'Change the role',
  'admin.quickEdit.roleDone': 'Role changed',
  'admin.quickEdit.deactivateTitle': 'Deactivate this account?',
  'admin.quickEdit.deactivateConfirm': 'Deactivate the account',
  'admin.quickEdit.deactivateDone': 'Account deactivated',
  'admin.quickEdit.gestures': 'Actions on this account',
  'admin.navFilter.label': 'Go to a section',
  'admin.navFilter.placeholder': 'Go to…',
  'admin.navFilter.empty': 'No section matches.',
  'admin.navFilter.clear': 'Clear the search',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;

/**
 * LA NOTE D'APRÈS-APPEL (#8072) — tranche du catalogue, RÉPANDUE par
 * `catalog-en.ts` comme `catalog-en-call.ts`.
 */
const enCallFeedback = {
  'callFeedback.title': 'How was your call with {name}?',
  'callFeedback.stars': '{count} out of 5',
  'callFeedback.issuesTitle': 'What went wrong?',
  'callFeedback.issue.audio_quality': 'Poor audio',
  'callFeedback.issue.video_quality': 'Poor video',
  'callFeedback.issue.echo': 'Echo',
  'callFeedback.issue.dropped': 'Dropouts',
  'callFeedback.issue.sync': 'Audio and video out of sync',
  'callFeedback.issue.other': 'Something else',
  'callFeedback.send': 'Send',
  'callFeedback.skip': 'Not now',
} as const;

export default enCallFeedback;

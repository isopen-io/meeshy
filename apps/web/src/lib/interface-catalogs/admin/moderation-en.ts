import type { AdminCatalogFragment } from './fragment';
import type fr from './moderation-fr';

/**
 * THE “moderation” FRAGMENT OF THE ADMINISTRATION CATALOG (#8876, #6726) —
 * the reports list and sheet. Same keys as the French source; the other
 * languages start from this text until their translation pass.
 */
const f = {
  'admin.moderation.subtitle': 'The content and members the community has reported: take charge, decide, record.',
  'admin.moderation.list.caption': 'List of reports',
  'admin.moderation.list.count': '{count} report(s)',
  'admin.moderation.list.empty': 'No reports',
  'admin.moderation.list.emptyHint': 'When a member reports content or an account, it lands here.',
  'admin.moderation.list.filteredEmpty': 'No reports match these filters',
  'admin.moderation.list.onEntity': 'Reports about a single item: remove the filter to see the whole queue again.',
  'admin.moderation.list.onEntityReset': 'See the whole queue',

  'admin.moderation.stats.heading': 'Queue status',
  'admin.moderation.stats.ofTotal': 'out of {total} reports',
  'admin.moderation.stats.average': 'Average time to resolve',
  'admin.moderation.stats.averageNote': 'Excludes reports closed without action, which have no resolution date.',
  'admin.moderation.stats.averageNone': 'No resolved or rejected report yet.',
  'admin.moderation.stats.byType': 'Report reasons',
  'admin.moderation.stats.byKind': 'Reported content',
  'admin.moderation.stats.top': 'Most frequent: {label} ({count}).',

  'admin.moderation.filter.status': 'Status',
  'admin.moderation.filter.reportType': 'Reason',
  'admin.moderation.filter.reportedType': 'Reported content',
  'admin.moderation.filter.assigned': 'Handling',
  'admin.moderation.filter.assigned.me': 'By me',
  'admin.moderation.filter.assigned.none': 'Unassigned',
  'admin.moderation.filter.period': 'Received in',
  'admin.moderation.filter.period.all': 'Any time',

  'admin.moderation.col.reported': 'Reported',
  'admin.moderation.col.reason': 'Reason',
  'admin.moderation.col.status': 'Status',
  'admin.moderation.col.reporter': 'Reported by',
  'admin.moderation.col.moderator': 'Moderator',
  'admin.moderation.col.received': 'Received',
  'admin.moderation.col.resolved': 'Resolved',
  'admin.moderation.col.updated': 'Updated',

  'admin.moderation.reporter.anonymous': 'Anonymous',
  'admin.moderation.person.gone': 'Deleted account',
  'admin.moderation.moderator.none': 'Unassigned',

  'admin.moderation.entity.messageBy': 'Message from {author}',
  'admin.moderation.entity.commentBy': 'Comment from {author}',
  'admin.moderation.entity.inConversation': 'in {conversation}',
  'admin.moderation.entity.protected': 'Protected content',

  'admin.moderation.fiche.loading': 'Loading the report',
  'admin.moderation.fiche.received': 'Reported by {reporter} · {when}',
  'admin.moderation.fiche.notFound': 'This report no longer exists',
  'admin.moderation.fiche.notFoundHint': 'Another moderator may have deleted it.',
  'admin.moderation.fiche.back': 'Back to reports',

  'admin.moderation.stat.received': 'Received',
  'admin.moderation.stat.openFor': 'Open for',
  'admin.moderation.stat.handledIn': 'Handled in',
  'admin.moderation.stat.onEntity': 'Reports on this item',

  'admin.moderation.section.reported': 'Reported content',
  'admin.moderation.section.reason': 'Reason for the report',
  'admin.moderation.section.handling': 'Handling',
  'admin.moderation.section.timeline': 'Timeline',
  'admin.moderation.section.siblings': 'Other reports on this item',
  'admin.moderation.section.actions': 'Act on the reported item',

  'admin.moderation.reported.kind': 'Kind',
  'admin.moderation.reported.author': 'Author',
  'admin.moderation.reported.creator': 'Creator',
  'admin.moderation.reported.conversation': 'Conversation',
  'admin.moderation.reported.excerpt': 'Excerpt',
  'admin.moderation.reported.noText': 'This content has no text.',
  'admin.moderation.reported.protected': 'Protected content',
  'admin.moderation.reported.protectedHint': 'The author made it private or ephemeral: its text is not shown here.',
  'admin.moderation.reported.deleted': 'This content was deleted: there is no text left to read.',
  'admin.moderation.reported.unavailable': 'This item is no longer available.',

  'admin.moderation.reason.type': 'Reason',
  'admin.moderation.reason.reporter': 'Reported by',
  'admin.moderation.reason.free': 'Details from the reporter',
  'admin.moderation.reason.none': 'No details given',

  'admin.moderation.handling.status': 'Status',
  'admin.moderation.handling.moderator': 'Moderator',
  'admin.moderation.handling.notes': 'Moderator notes',
  'admin.moderation.handling.notesNone': 'No notes',
  'admin.moderation.handling.action': 'Recorded action',
  'admin.moderation.handling.actionNone': 'No action recorded',
  'admin.moderation.handling.actionChoice': 'Action to record with the decision',
  'admin.moderation.handling.actionHint':
    'Recorded in the file: this choice triggers nothing by itself. Banning, removing or suspending is done from the linked sheets below.',

  'admin.moderation.timeline.received': 'Received',
  'admin.moderation.timeline.taken': 'Taken in charge by {moderator}',
  'admin.moderation.timeline.takenUndated': 'Date not kept: the report has been handled since.',
  'admin.moderation.timeline.closed': 'Closed: {status}',

  'admin.moderation.siblings.none': 'No other report targets this item.',
  'admin.moderation.siblings.seeAll': 'See all {count} reports',
  'admin.moderation.siblings.error': 'The other reports could not be loaded.',

  'admin.moderation.actions.hint': 'These links open the relevant sheet: the report itself neither bans nor removes anything.',
  'admin.moderation.actions.memberSecurity': 'Ban or suspend this member',
  'admin.moderation.actions.authorSecurity': 'Review the author: {name}',
  'admin.moderation.actions.post': 'Open the post to remove it',
  'admin.moderation.actions.conversationReading': 'Read the conversation (sovereign reading, written motive required)',
  'admin.moderation.actions.conversation': 'Open the conversation',
  'admin.moderation.actions.community': 'Open the community',
  'admin.moderation.actions.none': 'No linked sheet to open for this item.',

  'admin.moderation.gesture.assign': 'Take charge',
  'admin.moderation.gesture.resolve': 'Resolve',
  'admin.moderation.gesture.reject': 'Reject',
  'admin.moderation.gesture.dismiss': 'Close without action',
  'admin.moderation.gesture.reopen': 'Reopen',
  'admin.moderation.gesture.delete': 'Delete the report',

  'admin.moderation.confirm.notes': 'Notes for the file (optional)',
  'admin.moderation.confirm.informs': 'The reporter will receive a reply.',
  'admin.moderation.confirm.resolve.title': 'Resolve this report',
  'admin.moderation.confirm.resolve.body': 'The report will be marked “Resolved”, with the recorded action “{action}”.',
  'admin.moderation.confirm.reject.title': 'Reject this report',
  'admin.moderation.confirm.reject.body': 'The report will be marked “Rejected”: it calls for no action.',
  'admin.moderation.confirm.dismiss.title': 'Close this report without action',
  'admin.moderation.confirm.dismiss.body': 'The report will be closed without action. It will not count toward the average time to resolve.',
  'admin.moderation.confirm.reopen.title': 'Reopen this report',
  'admin.moderation.confirm.reopen.body': 'The report goes back to “Pending” and you become its moderator.',
  'admin.moderation.confirm.delete.title': 'Delete this report',
  'admin.moderation.confirm.delete.body':
    'The report is deleted for good: only the trace of its deletion stays in the audit log. This cannot be undone.',

  'admin.moderation.done.assigned': 'Report taken in charge',
  'admin.moderation.done.resolved': 'Report resolved',
  'admin.moderation.done.rejected': 'Report rejected',
  'admin.moderation.done.dismissed': 'Report closed without action',
  'admin.moderation.done.reopened': 'Report reopened',
  'admin.moderation.done.deleted': 'Report deleted',

  'admin.moderation.meta.title': 'Metadata',
  'admin.moderation.meta.status': 'Status',
  'admin.moderation.meta.reason': 'Reason',
  'admin.moderation.meta.kind': 'Reported content',
  'admin.moderation.meta.received': 'Received',
  'admin.moderation.meta.updated': 'Last updated',
  'admin.moderation.meta.resolved': 'Resolved on',
  'admin.moderation.meta.resolvedDismissed': 'Reports closed without action have no resolution date.',
  'admin.moderation.meta.resolvedOpen': 'The report is open: it has no resolution date yet.',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;

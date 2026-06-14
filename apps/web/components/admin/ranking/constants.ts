import {
  MessageSquare,
  Smile,
  TrendingUp,
  Reply,
  AtSign,
  Send,
  UserPlus,
  Building2,
  Link as LinkIcon,
  Paperclip,
  Shield,
  UserCheck,
  Phone,
  Target,
  Share2,
  Users2,
  MousePointerClick,
  Eye,
  Users,
  Activity
} from 'lucide-react';

export const USER_CRITERIA = [
  { value: 'messages_sent', icon: MessageSquare },
  { value: 'reactions_given', icon: Smile },
  { value: 'reactions_received', icon: TrendingUp },
  { value: 'replies_received', icon: Reply },
  { value: 'mentions_received', icon: AtSign },
  { value: 'mentions_sent', icon: Send },
  { value: 'conversations_joined', icon: UserPlus },
  { value: 'communities_created', icon: Building2 },
  { value: 'share_links_created', icon: LinkIcon },
  { value: 'files_shared', icon: Paperclip },
  { value: 'reports_sent', icon: Shield },
  { value: 'reports_received', icon: Shield },
  { value: 'friend_requests_sent', icon: UserCheck },
  { value: 'friend_requests_received', icon: UserCheck },
  { value: 'calls_initiated', icon: Phone },
  { value: 'call_participations', icon: Phone },
  { value: 'most_referrals_via_affiliate', icon: Target },
  { value: 'most_referrals_via_sharelinks', icon: Share2 },
  { value: 'most_contacts', icon: Users2 },
  { value: 'most_tracking_links_created', icon: LinkIcon },
  { value: 'most_tracking_link_clicks', icon: MousePointerClick }
];

export const CONVERSATION_CRITERIA = [
  { value: 'message_count', icon: MessageSquare },
  { value: 'member_count', icon: Users },
  { value: 'reaction_count', icon: Smile },
  { value: 'files_shared', icon: Paperclip },
  { value: 'call_count', icon: Phone },
  { value: 'recent_activity', icon: Activity }
];

export const MESSAGE_CRITERIA = [
  { value: 'most_reactions', icon: Smile },
  { value: 'most_replies', icon: Reply },
  { value: 'most_mentions', icon: AtSign }
];

export const LINK_CRITERIA = [
  { value: 'tracking_links_most_visited', icon: MousePointerClick },
  { value: 'tracking_links_most_unique', icon: Eye },
  { value: 'share_links_most_used', icon: Share2 },
  { value: 'share_links_most_unique_sessions', icon: Users }
];

export const RANKING_CRITERIA = {
  users: USER_CRITERIA,
  conversations: CONVERSATION_CRITERIA,
  messages: MESSAGE_CRITERIA,
  links: LINK_CRITERIA
};

export const criterionLabelKey = (value: string) => `ranking.criteria.${value}`;

export const MEDAL_COLORS = [
  'text-yellow-500',
  'text-gray-400',
  'text-amber-700'
];

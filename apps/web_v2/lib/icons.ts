/**
 * Centralisation des icônes Lucide-React pour optimiser le bundle
 * Import standard depuis lucide-react - Next.js 15 compatible
 */

import {
  // Navigation & Actions
  MessageSquare,
  Bell,
  BellOff,
  Search,
  LogOut,
  Settings,
  User,
  Home,
  Users,
  UserPlus,
  Link,
  Send,
  Share,
  Mail,

  // UI Controls
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  X,
  Plus,
  ArrowRight,
  ArrowUp,
  ArrowLeft,

  // Status & Feedback
  Loader2,
  CheckCircle2,
  Check,
  CheckCheck,
  AlertTriangle,
  Timer,
  Printer,
  Clock,

  // Content & Media
  Languages,
  Globe,
  Globe2,
  Shield,
  ShieldCheck,
  Brain,
  TrendingUp,
  Sparkles,

  // Editing & Actions
  Edit,
  Trash2,
  Copy,
  RefreshCw,
  Star,
  Lock,
  Ghost,
  Zap,

  // Business & Categories
  Building2,
  GraduationCap,

  // Communication
  PhoneMissed,

  // Social Media
  Youtube,
  Twitter,
  Linkedin,
  Instagram,

} from 'lucide-react';

// Re-export pour utilisation dans l'application
export {
  MessageSquare,
  Bell,
  BellOff,
  Search,
  LogOut,
  Settings,
  User,
  Home,
  Users,
  UserPlus,
  Link,
  Send,
  Share,
  Mail,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  X,
  Plus,
  ArrowRight,
  ArrowUp,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Check,
  CheckCheck,
  AlertTriangle,
  Timer,
  Printer,
  Clock,
  Languages,
  Globe,
  Globe2,
  Shield,
  ShieldCheck,
  Brain,
  TrendingUp,
  Sparkles,
  Edit,
  Trash2,
  Copy,
  RefreshCw,
  Star,
  Lock,
  Ghost,
  Zap,
  Building2,
  GraduationCap,
  PhoneMissed,
  Youtube,
  Twitter,
  Linkedin,
  Instagram,
};

// Types pour l'auto-complétion
export type IconName =
  | 'MessageSquare'
  | 'Bell'
  | 'Search'
  | 'LogOut'
  | 'Settings'
  | 'User'
  | 'Home'
  | 'Users'
  | 'UserPlus'
  | 'Link'
  | 'Send'
  | 'Share'
  | 'ChevronDown'
  | 'ChevronUp'
  | 'MoreHorizontal'
  | 'X'
  | 'Plus'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'Loader2'
  | 'CheckCircle2'
  | 'Check'
  | 'CheckCheck'
  | 'AlertTriangle'
  | 'Timer'
  | 'Clock'
  | 'Languages'
  | 'Globe'
  | 'Globe2'
  | 'Shield'
  | 'ShieldCheck'
  | 'Brain'
  | 'TrendingUp'
  | 'Sparkles'
  | 'Edit'
  | 'Trash2'
  | 'Copy'
  | 'RefreshCw'
  | 'Star'
  | 'Lock'
  | 'Ghost'
  | 'Zap'
  | 'Building2'
  | 'GraduationCap'
  | 'PhoneMissed'
  | 'Youtube'
  | 'Twitter'
  | 'Linkedin'
  | 'Instagram';

// Helper pour obtenir une icône par nom (utile pour les configurations dynamiques)
export const getIcon = (name: IconName) => {
  const icons = {
    MessageSquare,
    Bell,
    Search,
    LogOut,
    Settings,
    User,
    Home,
    Users,
    UserPlus,
    Link,
    Send,
    Share,
    ChevronDown,
    ChevronUp,
    MoreHorizontal,
    X,
    Plus,
    ArrowRight,
    ArrowUp,
    Loader2,
    CheckCircle2,
    Check,
    CheckCheck,
    AlertTriangle,
    Timer,
    Clock,
    Languages,
    Globe,
    Globe2,
    Shield,
    ShieldCheck,
    Brain,
    TrendingUp,
    Sparkles,
    Edit,
    Trash2,
    Copy,
    RefreshCw,
    Star,
    Lock,
    Ghost,
    Zap,
    Building2,
    GraduationCap,
    PhoneMissed,
    Youtube,
    Twitter,
    Linkedin,
    Instagram,
  };

  return icons[name];
};
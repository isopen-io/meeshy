// Composants communs réutilisables
export { ErrorBoundary } from './ErrorBoundary';
export { LoadingSpinner, LoadingState, LoadingSkeleton, LoadingCard } from './LoadingStates';
export { UserSelector } from './user-selector';
export { BubbleStreamPage } from './bubble-stream-page';
export { BubbleMessage } from './BubbleMessage';
export { MessagesDisplay } from './messages-display';
export { LanguageSwitcher } from './language-switcher';
export { TranslationProvider } from './translation-provider';

// Re-export des composants UI shadcn/ui pour centraliser les imports
export { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
export { Button } from '@/components/ui/button';
export { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
export { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
export { Input } from '@/components/ui/input';
export { Label } from '@/components/ui/label';
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export { Textarea } from '@/components/ui/textarea';
export { Badge } from '@/components/ui/badge';
export { Separator } from '@/components/ui/separator';
export { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
export { Switch } from '@/components/ui/switch';
export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
export { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
export { ScrollArea } from '@/components/ui/scroll-area';
export { Progress } from '@/components/ui/progress';
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

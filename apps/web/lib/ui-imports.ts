/**
 * Imports UI optimisés pour améliorer les performances
 * Centralise les imports des composants UI pour un meilleur tree-shaking
 */

// Imports centralisés des composants Radix UI
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';

export {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';

export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';

export {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';

export {
  Badge,
  badgeVariants,
} from '@/components/ui/badge';

export {
  Button,
  buttonVariants,
} from '@/components/ui/button';

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export {
  Checkbox,
} from '@/components/ui/checkbox';

export {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

export {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

export {
  Input,
} from '@/components/ui/input';

export {
  Label,
} from '@/components/ui/label';

export {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar';

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';

export {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export {
  Progress,
} from '@/components/ui/progress';

export {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';

export {
  ScrollArea,
  ScrollBar,
} from '@/components/ui/scroll-area';

export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';

export {
  Separator,
} from '@/components/ui/separator';

export {
  Skeleton,
} from '@/components/ui/skeleton';

export {
  Slider,
} from '@/components/ui/slider';

export {
  Switch,
} from '@/components/ui/switch';

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export {
  Textarea,
} from '@/components/ui/textarea';

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';

export {
  Toggle,
  toggleVariants,
} from '@/components/ui/toggle';

export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Cache des composants pour éviter les re-imports
const componentCache = new Map();

/**
 * Fonction utilitaire pour obtenir un composant avec cache
 */
export function getUIComponent(componentName: string) {
  if (componentCache.has(componentName)) {
    return componentCache.get(componentName);
  }
  
  // Import dynamique pour les composants non critiques
  const component = require('@/components/ui/' + componentName.toLowerCase())[componentName];
  if (component) {
    componentCache.set(componentName, component);
    return component;
  }
  
  return null;
}

/**
 * Préchargement des composants critiques
 */
export function preloadCriticalComponents() {
  const criticalComponents = [
    'Button', 'Input', 'Label', 'Card', 'Dialog', 'DropdownMenu',
    'Sheet', 'Tabs', 'Avatar', 'Badge', 'Alert', 'Skeleton'
  ];
  
  criticalComponents.forEach(componentName => {
    getUIComponent(componentName);
  });
}

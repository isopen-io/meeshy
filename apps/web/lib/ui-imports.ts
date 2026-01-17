/**
 * ⚠️ DEPRECATED: Ce fichier NE DOIT PLUS être utilisé
 *
 * PROBLÈME: Ce fichier était censé optimiser les imports mais fait l'inverse !
 * - Il centralise tous les composants UI en un seul endroit
 * - Cela EMPÊCHE le tree-shaking au lieu de l'améliorer
 * - Ajoute ~100-150 KB de code non utilisé au bundle
 *
 * ✅ SOLUTION: Utilisez des imports directs
 * import { Button } from '@/components/ui/button';
 * import { Dialog, DialogContent } from '@/components/ui/dialog';
 *
 * ❌ N'UTILISEZ JAMAIS:
 * import { Button, Dialog } from '@/lib/ui-imports';
 *
 * Ce fichier est conservé pour éviter les erreurs de build mais sera supprimé.
 * Tous les nouveaux imports doivent être directs depuis @/components/ui/*
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

// Context Menu - Not yet implemented
// export {
//   ContextMenu,
//   ContextMenuContent,
//   ContextMenuItem,
//   ContextMenuLabel,
//   ContextMenuSeparator,
//   ContextMenuShortcut,
//   ContextMenuSub,
//   ContextMenuSubContent,
//   ContextMenuSubTrigger,
//   ContextMenuTrigger,
// } from '@/components/ui/context-menu';

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

// Menubar - Not yet implemented
// export {
//   Menubar,
//   MenubarContent,
//   MenubarItem,
//   MenubarLabel,
//   MenubarMenu,
//   MenubarRadioGroup,
//   MenubarRadioItem,
//   MenubarSeparator,
//   MenubarShortcut,
//   MenubarSub,
//   MenubarSubContent,
//   MenubarSubTrigger,
//   MenubarTrigger,
// } from '@/components/ui/menubar';

// NavigationMenu - Not yet implemented
// export {
//   NavigationMenu,
//   NavigationMenuContent,
//   NavigationMenuIndicator,
//   NavigationMenuItem,
//   NavigationMenuLink,
//   NavigationMenuList,
//   NavigationMenuTrigger,
//   NavigationMenuViewport,
//   navigationMenuTriggerStyle,
// } from '@/components/ui/navigation-menu';

export {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export {
  Progress,
} from '@/components/ui/progress';

// RadioGroup - Not yet implemented
// export {
//   RadioGroup,
//   RadioGroupItem,
// } from '@/components/ui/radio-group';

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

// Skeleton - Not yet implemented
// export {
//   Skeleton,
// } from '@/components/ui/skeleton';

export {
  Slider,
} from '@/components/ui/slider';

export {
  Switch,
} from '@/components/ui/switch';

// Table - Not yet implemented
// export {
//   Table,
//   TableBody,
//   TableCaption,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from '@/components/ui/table';

export {
  Textarea,
} from '@/components/ui/textarea';

// Toast - Using sonner instead
// export {
//   Toast,
//   ToastAction,
//   ToastClose,
//   ToastDescription,
//   ToastProvider,
//   ToastTitle,
//   ToastViewport,
// } from '@/components/ui/toast';

// Toggle - Not yet implemented
// export {
//   Toggle,
//   toggleVariants,
// } from '@/components/ui/toggle';

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

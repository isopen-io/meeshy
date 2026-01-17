import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,opacity,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Primary - Main CTA buttons
        default:
          "bg-primary/90 backdrop-blur-sm text-primary-foreground shadow-xs hover:bg-primary/80 border border-primary/20",
        // Destructive - Danger actions
        destructive:
          "bg-destructive/90 backdrop-blur-sm text-white shadow-xs hover:bg-destructive/80 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 border border-destructive/20",
        // Outline - Secondary actions with border
        outline:
          "bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-white/30 dark:border-gray-600/50 shadow-xs hover:bg-white/70 dark:hover:bg-gray-700/70 hover:text-accent-foreground",
        // Secondary - Less prominent actions
        secondary:
          "bg-secondary/80 backdrop-blur-sm text-secondary-foreground shadow-xs hover:bg-secondary/70 border border-secondary/20",
        // Tertiary - Subtle actions, minimal styling
        tertiary:
          "bg-white/30 dark:bg-gray-800/30 backdrop-blur-sm text-foreground/80 hover:bg-white/50 dark:hover:bg-gray-700/50 hover:text-foreground border border-transparent hover:border-white/20 dark:hover:border-gray-600/30",
        // Ghost - No background until hover
        ghost:
          "hover:bg-white/50 dark:hover:bg-gray-800/50 hover:backdrop-blur-sm hover:text-accent-foreground",
        // Link - Text only with underline
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"
import { buildAttachmentUrl } from "@/utils/attachment-url"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  src,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  // Point de passage unique : `User.avatar`/`.banner` et les avatars de
  // conversation arrivent souvent en chemin relatif renvoyé par l'API
  // (`/api/v1/attachments/file/...`), qui doit être résolu contre l'origine
  // API (gate.meeshy.me), jamais contre l'origine du frontend (meeshy.me) —
  // sinon 404 systématique. Résoudre ici, au niveau du composant partagé,
  // couvre tous les appelants sans qu'ils aient à préfixer individuellement.
  const resolvedSrc =
    typeof src === "string" && !src.startsWith("data:")
      ? buildAttachmentUrl(src) ?? undefined
      : src;

  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      loading="lazy"
      decoding="async"
      {...props}
      src={resolvedSrc}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }

import { forwardRef, ElementRef, ComponentPropsWithoutRef, HTMLAttributes } from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import * as TabsPrimitives from "@radix-ui/react-tabs"
import * as DialogPrimitives from "@radix-ui/react-dialog"
import * as AvatarPrimitives from "@radix-ui/react-avatar"
import { cn } from "./core"
import { X } from "lucide-react"

// Switch
export const Switch = forwardRef<ElementRef<typeof SwitchPrimitives.Root>, ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitives.Root>
  )
)
Switch.displayName = SwitchPrimitives.Root.displayName

// Tabs
export const Tabs = TabsPrimitives.Root
export const TabsList = forwardRef<ElementRef<typeof TabsPrimitives.List>, ComponentPropsWithoutRef<typeof TabsPrimitives.List>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitives.List
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
)
TabsList.displayName = TabsPrimitives.List.displayName

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitives.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitives.Trigger>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitives.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  )
)
TabsTrigger.displayName = TabsPrimitives.Trigger.displayName

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitives.Content>, ComponentPropsWithoutRef<typeof TabsPrimitives.Content>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitives.Content
      ref={ref}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  )
)
TabsContent.displayName = TabsPrimitives.Content.displayName

// Dialog
export const Dialog = DialogPrimitives.Root
export const DialogTrigger = DialogPrimitives.Trigger
export const DialogPortal = DialogPrimitives.Portal
export const DialogClose = DialogPrimitives.Close

export const DialogOverlay = forwardRef<ElementRef<typeof DialogPrimitives.Overlay>, ComponentPropsWithoutRef<typeof DialogPrimitives.Overlay>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitives.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
)
DialogOverlay.displayName = DialogPrimitives.Overlay.displayName

export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitives.Content>, ComponentPropsWithoutRef<typeof DialogPrimitives.Content>>(
  ({ className, children, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitives.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[50%] gap-4 border border-border bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitives.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitives.Close>
      </DialogPrimitives.Content>
    </DialogPortal>
  )
)
DialogContent.displayName = DialogPrimitives.Content.displayName

export const DialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
)
export const DialogTitle = forwardRef<ElementRef<typeof DialogPrimitives.Title>, ComponentPropsWithoutRef<typeof DialogPrimitives.Title>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitives.Title ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
  )
)
DialogTitle.displayName = DialogPrimitives.Title.displayName
export const DialogDescription = forwardRef<ElementRef<typeof DialogPrimitives.Description>, ComponentPropsWithoutRef<typeof DialogPrimitives.Description>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitives.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
)
DialogDescription.displayName = DialogPrimitives.Description.displayName

// Avatar
export const Avatar = forwardRef<ElementRef<typeof AvatarPrimitives.Root>, ComponentPropsWithoutRef<typeof AvatarPrimitives.Root>>(
  ({ className, ...props }, ref) => (
    <AvatarPrimitives.Root ref={ref} className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)} {...props} />
  )
)
Avatar.displayName = AvatarPrimitives.Root.displayName
export const AvatarImage = forwardRef<ElementRef<typeof AvatarPrimitives.Image>, ComponentPropsWithoutRef<typeof AvatarPrimitives.Image>>(
  ({ className, ...props }, ref) => (
    <AvatarPrimitives.Image ref={ref} className={cn("aspect-square h-full w-full object-cover", className)} {...props} />
  )
)
AvatarImage.displayName = AvatarPrimitives.Image.displayName
export const AvatarFallback = forwardRef<ElementRef<typeof AvatarPrimitives.Fallback>, ComponentPropsWithoutRef<typeof AvatarPrimitives.Fallback>>(
  ({ className, ...props }, ref) => (
    <AvatarPrimitives.Fallback ref={ref} className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)} {...props} />
  )
)
AvatarFallback.displayName = AvatarPrimitives.Fallback.displayName

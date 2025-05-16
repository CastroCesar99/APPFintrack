
"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }
>(({ className, value, indicatorClassName, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "relative h-4 w-full overflow-hidden rounded-full bg-secondary",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      // Ensure the default 'bg-primary' is applied if indicatorClassName doesn't override background color
      className={cn("h-full w-full flex-1 transition-all", indicatorClassName ? indicatorClassName : "bg-primary")}
      style={{ transform: `translateX(-${100 - (Math.max(0, Math.min(value || 0, 100)))}%)` }} // Ensure value is between 0 and 100 for transform
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }

    
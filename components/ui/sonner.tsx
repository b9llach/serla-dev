"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  Zap,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-right"
      gap={12}
      icons={{
        success: (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
            <CircleCheckIcon className="h-3.5 w-3.5 text-emerald-400" />
          </div>
        ),
        info: (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20">
            <InfoIcon className="h-3.5 w-3.5 text-blue-400" />
          </div>
        ),
        warning: (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20">
            <TriangleAlertIcon className="h-3.5 w-3.5 text-amber-400" />
          </div>
        ),
        error: (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20">
            <OctagonXIcon className="h-3.5 w-3.5 text-red-400" />
          </div>
        ),
        loading: (
          <div className="flex h-5 w-5 items-center justify-center">
            <Loader2Icon className="h-4 w-4 animate-spin text-zinc-400" />
          </div>
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "group w-full flex items-start gap-3 p-4 rounded-xl bg-[#18181b] border border-zinc-800/80 shadow-2xl shadow-black/40 backdrop-blur-sm",
          title: "text-sm font-medium text-zinc-100",
          description: "text-xs text-zinc-400 mt-0.5",
          actionButton: "bg-white text-black text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition-colors",
          cancelButton: "bg-zinc-800 text-zinc-300 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors",
          closeButton: "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors",
        },
      }}
      {...props}
    />
  )
}

// Custom toast for realtime events with special styling
const RealtimeToaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-right"
      gap={8}
      icons={{
        success: (
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/30 to-emerald-600/20 ring-1 ring-emerald-500/30">
            <Zap className="h-3.5 w-3.5 text-emerald-400" />
          </div>
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "group w-full flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-[#18181b] to-[#1f1f23] border border-zinc-800/60 shadow-2xl shadow-black/50 backdrop-blur-md",
          title: "text-sm font-semibold text-white",
          description: "text-xs text-zinc-400 mt-0.5",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, RealtimeToaster }

import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variantStyles = {
    default: "border-transparent bg-blue-600 text-white shadow hover:bg-blue-700",
    secondary: "border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
    destructive: "border-transparent bg-red-600 text-white shadow hover:bg-red-700",
    outline: "text-slate-950 dark:text-slate-50 border-slate-200 dark:border-slate-800",
    success: "border-transparent bg-emerald-600 text-white shadow hover:bg-emerald-700",
    warning: "border-transparent bg-amber-500 text-white shadow hover:bg-amber-600"
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };

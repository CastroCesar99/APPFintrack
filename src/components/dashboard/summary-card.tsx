"use client";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SummaryCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  className?: string;
  iconClassName?: string;
}

export function SummaryCard({ title, value, icon: Icon, className, iconClassName }: SummaryCardProps) {
  return (
    <Card className={cn("shadow-lg", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("h-5 w-5 text-muted-foreground", iconClassName)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

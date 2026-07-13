"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GripVertical, Globe, ChevronDown, Plus, Server } from "lucide-react";
import { DeployTargetCard } from "@/components/deploy-target-card";
import type { DeployTarget } from "@/types";

export interface SiteGroup {
  siteId: string;
  siteName: string;
  sitePath: string;
  siteStatus: "running" | "stopped" | "creating" | "error";
  targets: DeployTarget[];
}

/** サイトグループ内のターゲット一覧（折りたたみ中身） */
function TargetList({ group }: { group: SiteGroup }) {
  if (group.targets.length === 0) {
    return (
      <div className="pl-8 pr-3 pb-3 pt-1 text-sm text-muted-foreground flex items-center gap-2">
        <span>ターゲットがありません</span>
        <Button asChild size="sm" variant="ghost">
          <Link href="/deploy/new">
            <Plus className="w-3 h-3 mr-1" />
            追加
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3 pl-8 pr-3 pb-3 pt-1">
      {group.targets.map((target) => (
        <DeployTargetCard
          key={target.id}
          target={target}
          sitePath={group.sitePath}
          siteStatus={group.siteStatus}
        />
      ))}
    </div>
  );
}

/** 1サイトグループ（ドラッグ可能・折りたたみ可能） */
function SortableSiteGroup({ group }: { group: SiteGroup }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.siteId,
  });
  const [open, setOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? ("relative" as const) : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1 p-3">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
            tabIndex={-1}
            aria-label="ドラッグして並べ替え"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 flex-1 min-w-0 text-left">
              <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-semibold truncate">{group.siteName}</span>
              <Badge variant="outline" className="shrink-0">
                {group.targets.length} ターゲット
              </Badge>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground ml-auto shrink-0 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <TargetList group={group} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** 保守専用（サイト未紐付け）グループ。並び替え対象外 */
function StandaloneGroup({ targets }: { targets: DeployTarget[] }) {
  const [open, setOpen] = useState(false);
  const group: SiteGroup = {
    siteId: "__standalone__",
    siteName: "保守専用サーバー（サイト未紐付け）",
    sitePath: "",
    siteStatus: "stopped",
    targets,
  };
  return (
    <div className="rounded-lg border bg-card border-dashed">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1 p-3">
          <span className="p-1 text-muted-foreground/40 shrink-0">
            <Server className="w-4 h-4" />
          </span>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 flex-1 min-w-0 text-left">
              <span className="font-semibold truncate">{group.siteName}</span>
              <Badge variant="outline" className="shrink-0">
                {targets.length} ターゲット
              </Badge>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground ml-auto shrink-0 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <TargetList group={group} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface DeployListProps {
  initialGroups: SiteGroup[];
  standaloneTargets: DeployTarget[];
}

export function DeployList({ initialGroups, standaloneTargets }: DeployListProps) {
  const [groups, setGroups] = useState(initialGroups);

  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = groups.findIndex((g) => g.siteId === active.id);
      const newIndex = groups.findIndex((g) => g.siteId === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(groups, oldIndex, newIndex);
      setGroups(reordered);

      // サイトの並び順を共有更新（サイト一覧と同じ順序）
      await fetch("/api/sites/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((g) => g.siteId) }),
      });
    },
    [groups]
  );

  return (
    <div className="space-y-3">
      <DndContext
        id="deploy-list"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={groups.map((g) => g.siteId)}
          strategy={verticalListSortingStrategy}
        >
          {groups.map((group) => (
            <SortableSiteGroup key={group.siteId} group={group} />
          ))}
        </SortableContext>
      </DndContext>

      {standaloneTargets.length > 0 && <StandaloneGroup targets={standaloneTargets} />}
    </div>
  );
}

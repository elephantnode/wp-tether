"use client";

import { useState, useCallback, useEffect } from "react";
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
import { GripVertical } from "lucide-react";

import { SiteCard, type SiteInfo } from "@/components/site-card";

function SortableSiteCard({ site }: { site: SiteInfo }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: site.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? ("relative" as const) : undefined,
  };

  const dragHandle = (
    <button
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
      onClick={(e) => e.stopPropagation()}
      tabIndex={-1}
      aria-label="ドラッグして並べ替え"
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      <SiteCard site={site} dragHandle={dragHandle} />
    </div>
  );
}

interface SiteListProps {
  initialSites: SiteInfo[];
}

export function SiteList({ initialSites }: SiteListProps) {
  const [sites, setSites] = useState(initialSites);

  useEffect(() => {
    setSites(initialSites);
  }, [initialSites]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sites.findIndex((s) => s.id === active.id);
      const newIndex = sites.findIndex((s) => s.id === over.id);
      const reordered = arrayMove(sites, oldIndex, newIndex);
      setSites(reordered);

      await fetch("/api/sites/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((s) => s.id) }),
      });
    },
    [sites]
  );

  return (
    <DndContext
      id="site-list"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sites.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="rounded-lg border divide-y overflow-hidden">
          {sites.map((site) => (
            <SortableSiteCard key={site.id} site={site} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

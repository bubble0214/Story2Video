'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { canvasesApi } from '@/services/canvases';
import { useCanvasStore } from '@/stores/canvas-store';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, FolderOpen, Loader2, Trash2 } from 'lucide-react';

export function CanvasListSheet() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['canvases'],
    queryFn: () => canvasesApi.list(),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => canvasesApi.create({ title }),
    onSuccess: ({ data: canvas }) => {
      queryClient.invalidateQueries({ queryKey: ['canvases'] });
      useCanvasStore.getState().reset();
      useCanvasStore.getState().setCanvasId(canvas.id);
      useCanvasStore.getState().setCanvasTitle(canvas.title);
      setOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => canvasesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canvases'] });
    },
  });

  const canvases = data?.data ?? [];

  const handleOpen = async (id: string) => {
    try {
      const { data: canvas } = await canvasesApi.get(id);
      useCanvasStore.getState().reset();
      useCanvasStore.getState().setCanvasId(canvas.id);
      useCanvasStore.getState().setCanvasTitle(canvas.title);
      if (canvas.data) {
        useCanvasStore.getState().loadCanvas(canvas.data);
      }
      setOpen(false);
    } catch {
      // ignore
    }
  };

  const handleCreate = () => {
    const title = newTitle.trim() || 'Untitled Canvas';
    createMutation.mutate(title);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <FolderOpen className="h-3.5 w-3.5" />
          My Canvases
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80">
        <SheetHeader>
          <SheetTitle>My Canvases</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Create new */}
          <div className="flex gap-2">
            <Input
              className="h-8 text-xs flex-1"
              placeholder="New canvas name..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
            <Button
              size="sm"
              className="h-8"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </Button>
          </div>

          {/* List */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-xs text-destructive">Failed to load canvases</p>
          )}

          {!isLoading && !isError && canvases.length === 0 && (
            <p className="text-xs text-muted-foreground text-center pt-4">
              No canvases yet. Create one above.
            </p>
          )}

          {canvases.length > 0 && (
            <div className="space-y-1">
              {canvases.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 group"
                >
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => handleOpen(c.id)}
                  >
                    <p className="text-xs font-medium truncate">{c.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(c.updated_at).toLocaleDateString()}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => deleteMutation.mutate(c.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

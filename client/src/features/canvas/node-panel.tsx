'use client';

import { useState } from 'react';
import { useCanvasStore } from '@/stores/canvas-store';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Trash2, Link2, Unlink } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TextBlockData, NoteCardData, ImageBlockData } from '@/types/canvas';

export function NodePanel() {
  const { selectedNodeId, nodes, updateNodeData, removeSelectedNode } = useCanvasStore();
  const [linkTaskId, setLinkTaskId] = useState('');

  const node = nodes.find((n) => n.id === selectedNodeId);

  const { data: tasksResponse } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => tasksApi.list({ limit: 20 }),
    enabled: !!selectedNodeId,
  });

  if (!selectedNodeId || !node) {
    return (
      <div className="w-64 border-l bg-background p-4">
        <p className="text-xs text-muted-foreground text-center pt-8">
          Select a node to edit its properties
        </p>
      </div>
    );
  }

  const data = node.data;
  const tasks = tasksResponse?.data?.items ?? [];

  const handleLink = () => {
    if (!linkTaskId) return;
    const task = tasks.find((t) => t.id === linkTaskId);
    updateNodeData(node.id, {
      linkedTaskId: linkTaskId,
      linkedNovelTitle: task?.workflow_type ?? 'Linked task',
    } as Partial<TextBlockData & ImageBlockData>);
    setLinkTaskId('');
  };

  const handleUnlink = () => {
    updateNodeData(node.id, {
      linkedTaskId: undefined,
      linkedNovelTitle: undefined,
    } as Partial<TextBlockData & ImageBlockData>);
  };

  return (
    <div className="w-64 border-l bg-background flex flex-col">
      <div className="px-4 py-3 border-b">
        <p className="text-sm font-semibold truncate">{data.label}</p>
        <p className="text-[10px] text-muted-foreground capitalize">{data.type}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Label */}
        <div className="space-y-1">
          <Label className="text-xs">Label</Label>
          <Input
            className="h-8 text-xs"
            value={data.label}
            onChange={(e) => updateNodeData(node.id, { label: e.target.value } as Partial<TextBlockData & NoteCardData & ImageBlockData>)}
          />
        </div>

        {/* Content (textBlock / noteCard) */}
        {(data.type === 'textBlock' || data.type === 'noteCard') && (
          <div className="space-y-1">
            <Label className="text-xs">Content</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
              value={(data as TextBlockData | NoteCardData).content}
              onChange={(e) => updateNodeData(node.id, { content: e.target.value } as Partial<TextBlockData & NoteCardData>)}
              rows={3}
            />
          </div>
        )}

        {/* Image URL (imageBlock) */}
        {data.type === 'imageBlock' && (
          <div className="space-y-1">
            <Label className="text-xs">Image URL</Label>
            <Input
              className="h-8 text-xs"
              value={(data as ImageBlockData).imageUrl}
              onChange={(e) => updateNodeData(node.id, { imageUrl: e.target.value } as Partial<ImageBlockData>)}
              placeholder="https://..."
            />
          </div>
        )}

        {/* Note color (noteCard) */}
        {data.type === 'noteCard' && (
          <div className="space-y-1">
            <Label className="text-xs">Color</Label>
            <input
              type="color"
              className="h-8 w-full rounded border border-input cursor-pointer"
              value={(data as NoteCardData).color}
              onChange={(e) => updateNodeData(node.id, { color: e.target.value } as Partial<NoteCardData>)}
            />
          </div>
        )}

        <Separator />

        {/* Link to novel/task */}
        <div className="space-y-2">
          <Label className="text-xs">Link to Project</Label>
          {data.linkedTaskId ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-primary truncate">
                {(data.linkedNovelTitle as string) ?? 'Linked'}
              </span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleUnlink}>
                <Unlink className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <Select value={linkTaskId} onValueChange={setLinkTaskId}>
                <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.workflow_type} — {t.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={!linkTaskId}
                onClick={handleLink}
              >
                <Link2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Delete */}
      <div className="px-4 py-3 border-t">
        <Button
          variant="destructive"
          size="sm"
          className="w-full h-8 text-xs"
          onClick={removeSelectedNode}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Delete Node
        </Button>
      </div>
    </div>
  );
}

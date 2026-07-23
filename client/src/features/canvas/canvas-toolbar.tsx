'use client';

import { useCanvasStore } from '@/stores/canvas-store';
import { Button } from '@/components/ui/button';
import { Type, StickyNote, Image, ArrowRightLeft, Save, Loader2 } from 'lucide-react';

export function CanvasToolbar() {
  const {
    addNode,
    connectMode,
    toggleConnectMode,
    isSaving,
    isDirty,
    canvasTitle,
    setCanvasTitle,
  } = useCanvasStore();

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/30">
      {/* Title */}
      <input
        className="flex h-7 text-sm font-medium bg-transparent border-none outline-none focus:ring-0 px-1 rounded max-w-[180px]"
        value={canvasTitle}
        onChange={(e) => setCanvasTitle(e.target.value)}
        placeholder="Untitled Canvas"
      />

      <div className="flex-1" />

      {/* Add nodes */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => addNode('textBlock')}
        >
          <Type className="h-3.5 w-3.5" />
          Text
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => addNode('noteCard')}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Note
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => addNode('imageBlock')}
        >
          <Image className="h-3.5 w-3.5" />
          Image
        </Button>
      </div>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Connect mode */}
      <Button
        variant={connectMode ? 'default' : 'ghost'}
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={toggleConnectMode}
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
        Connect
      </Button>

      {/* Save */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 text-xs"
        disabled={!isDirty || isSaving}
        onClick={() => {
          useCanvasStore.getState().requestManualSave();
        }}
      >
        {isSaving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        {isSaving ? 'Saving...' : isDirty ? 'Save' : 'Saved'}
      </Button>
    </div>
  );
}

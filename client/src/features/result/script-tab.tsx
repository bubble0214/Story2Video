'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface SceneData {
  num: string;
  content: string;
  location?: string;
  summary?: string;
}

interface ScriptTabProps {
  content: string;
  scenes?: SceneData[];
}

export function ScriptTab({ content, scenes }: ScriptTabProps) {
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const hasContent = content && content !== 'No script content generated.';
  const hasScenes = scenes && scenes.length > 0;

  function handleDownload() {
    let text: string;
    if (hasScenes) {
      text = scenes!.map((s, i) => {
        const num = s.num !== '0' ? s.num : i + 1;
        const header = `第 ${num} 场${s.location ? `（${s.location}）` : ''}${s.summary ? ` - ${s.summary}` : ''}`;
        return `${header}\n${'='.repeat(header.length)}\n${s.content}`;
      }).join('\n\n');
    } else {
      text = content;
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '剧本.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!hasContent && !hasScenes) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {content}
      </div>
    );
  }

  // If scenes are available, render with scene navigation (matching NovelTab chapter pattern)
  if (hasScenes) {
    const currentScene = scenes![currentSceneIdx];
    return (
      <div className="space-y-4">
        {/* Scene tabs navigation */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b" role="tablist" aria-label="场景导航">
          {scenes!.map((scene, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === currentSceneIdx}
              className={`shrink-0 px-3 py-1.5 text-xs rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                i === currentSceneIdx
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
              onClick={() => setCurrentSceneIdx(i)}
            >
              #{scene.num !== '0' ? scene.num : i + 1}
            </button>
          ))}
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" />
              下载剧本
            </Button>
          </div>
        </div>

        {/* Current scene content */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-bold m-0">
              第 {currentScene.num !== '0' ? currentScene.num : currentSceneIdx + 1} 场
            </h3>
            {currentScene.location && (
              <Badge variant="secondary">{currentScene.location}</Badge>
            )}
            {currentScene.summary && (
              <span className="text-xs text-muted-foreground ml-1 truncate">
                {currentScene.summary}
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap leading-relaxed mt-2">
            {currentScene.content}
          </p>
        </div>

        {/* Previous/Next footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            disabled={currentSceneIdx === 0}
            onClick={() => setCurrentSceneIdx(currentSceneIdx - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            上一场
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {currentSceneIdx + 1} 场 / 共 {scenes!.length} 场
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentSceneIdx === scenes!.length - 1}
            onClick={() => setCurrentSceneIdx(currentSceneIdx + 1)}
          >
            下一场
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // Fallback: plain text view (when no scenes data, e.g. non-interactive mode)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">
          完整剧本
        </h3>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            下载剧本
          </Button>
        </div>
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
      </div>
    </div>
  );
}

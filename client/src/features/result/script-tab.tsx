'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ScriptContent {
  novel_tweet_content?: string;
  video_tweet_content?: string;
  storyboard_content?: string;
  script_content?: string;
}

interface ScriptTabProps {
  content: string;
  workflowType?: string;
  scriptContent?: ScriptContent;
}

export function ScriptTab({ content, scriptContent }: ScriptTabProps) {

  // Check for new 3-step pipeline results
  const hasNovelTweet = scriptContent?.novel_tweet_content != null;
  const hasVideoTweet = scriptContent?.video_tweet_content != null;
  const hasStoryboard = scriptContent?.storyboard_content != null;
  const hasMultiStep = hasNovelTweet || hasVideoTweet || hasStoryboard;

  if (hasMultiStep) {
    const subTabs = [
      { value: 'novel_tweet', label: '小说推文', content: scriptContent!.novel_tweet_content ?? '' },
      { value: 'video_tweet', label: '视频推文', content: scriptContent!.video_tweet_content ?? '' },
      { value: 'storyboard', label: '分镜脚本', content: scriptContent!.storyboard_content ?? '' },
    ].filter((t) => t.content);

    return (
      <div className="space-y-4">
        <Tabs defaultValue={subTabs[0]?.value}>
          <TabsList className="w-full justify-start rounded-lg bg-muted p-1 h-9">
            {subTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-md px-4 py-1 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground transition-all flex-1"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {subTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed">{tab.content}</p>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  }

  // Fallback to old single-content display
  const hasContent = content && content !== 'No script content generated.';

  return (
    <div className="space-y-4">
      {hasContent ? (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          {content}
        </div>
      )}
    </div>
  );
}

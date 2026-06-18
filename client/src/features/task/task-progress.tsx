'use client';

import { useRouter } from 'next/navigation';
import { useTaskPoll } from '@/hooks/use-task-poll';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TaskProgressProps {
  taskId: string;
  onSuccess?: (taskId: string) => void;
}

export function TaskProgress({ taskId, onSuccess }: TaskProgressProps) {
  const router = useRouter();
  const { data: task, isLoading, isError, error, refetch } = useTaskPoll(taskId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">Loading task...</p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-destructive mb-2">
            Error loading task: {(error as Error)?.message}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!task) return null;

  const isTerminal = task.status === 'SUCCESS' || task.status === 'FAILED';

  if (task.status === 'SUCCESS' && onSuccess) {
    onSuccess(taskId);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              task.status === 'SUCCESS'
                ? 'bg-green-500'
                : task.status === 'FAILED'
                  ? 'bg-destructive'
                  : task.status === 'RUNNING'
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-yellow-500'
            }`}
          />
          {task.status === 'SUCCESS'
            ? 'Completed'
            : task.status === 'FAILED'
              ? 'Failed'
              : task.status === 'RUNNING'
                ? 'Processing...'
                : 'Pending'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{task.current_step}</span>
            <span className="font-medium">
              {Math.round(task.progress * 100)}%
            </span>
          </div>
          <Progress value={task.progress * 100} />
        </div>

        {task.error_message && (
          <p className="text-sm text-destructive">{task.error_message}</p>
        )}

        {isTerminal && (
          <div className="flex gap-2 pt-2">
            {task.status === 'SUCCESS' ? (
              <Button
                className="flex-1"
                onClick={() => router.push(`/result/${taskId}`)}
              >
                View Result
              </Button>
            ) : (
              <Button className="flex-1" variant="outline" onClick={() => router.push('/')}>
                Back to Home
              </Button>
            )}
          </div>
        )}

        {!isTerminal && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push('/')}
          >
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

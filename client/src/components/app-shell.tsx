'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAuthPage = pathname.startsWith('/auth/');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="font-bold text-lg tracking-tight">
            Story2Video
          </Link>

          <nav className="flex items-center gap-2">
            {!isAuthPage && !isAuthenticated && (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/auth/login">登录</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/auth/register">注册</Link>
                </Button>
              </>
            )}
            {isAuthenticated && (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/">首页</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/settings">设置</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={logout}>
                  退出登录
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <Separator />
      {children}
    </div>
  );
}

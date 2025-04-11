import { cookies } from 'next/headers';

import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import Script from 'next/script';

export const experimental_ppr = true;

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isCollapsed = cookieStore.get('sidebar:state')?.value !== 'true';

  return (
    <>
      <Script
        src="./pyodide.js"
        strategy="beforeInteractive"
      />
      <script defer src="https://umami.dvlin.com/script.js" data-website-id="c75440be-cbe9-41d5-9fb3-c349171ddc26"></script>
      <SidebarProvider defaultOpen={!isCollapsed}>
        {/* <AppSidebar /> */}
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </>
  );
}

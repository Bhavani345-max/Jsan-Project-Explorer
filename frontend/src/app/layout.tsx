import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  // One name everywhere — browser tab, sidebar, deployment URL — so nothing has
  // to be reconciled against a longer internal title.
  title: {
    default: "JSAN NexusAI",
    template: "%s · JSAN NexusAI",
  },
  applicationName: "JSAN NexusAI",
  description:
    "JSAN NexusAI — discover geospatial, telecom and adjacent engineering opportunities from public procurement sources.",
  openGraph: {
    title: "JSAN NexusAI",
    description:
      "Discover geospatial, telecom and adjacent engineering opportunities from public procurement sources.",
    siteName: "JSAN NexusAI",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('pdp-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <Shell>{children}</Shell>
        </ThemeProvider>
      </body>
    </html>
  );
}

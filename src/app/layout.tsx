import type { Metadata } from "next";
import Script from "next/script";
import { Providers } from "./providers";
import "./globals.css";

const serviceWorkerScript = process.env.NODE_ENV === "production"
  ? `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js')})}`
  : `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(registrations){registrations.forEach(function(registration){registration.unregister()})})}`;

export const metadata: Metadata = {
  title: "FastNews",
  description:
    "A personal reader for AI, software engineering, data science, and maker news.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning className="font-sans">
      <head>
        {/* Apple touch icon for iOS home screen (replace with PNG once generated) */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.svg" />
        {/* Prevent FOUC: apply theme before paint */}
        <Script id="apply-theme-before-paint" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('feed2040-theme');if(t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`}
        </Script>
        <Script id="service-worker-lifecycle" strategy="beforeInteractive">
          {serviceWorkerScript}
        </Script>
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Replace with your actual Google OAuth Client ID from https://console.cloud.google.com/
const GOOGLE_CLIENT_ID = "490932099209-sdd4j2gtaqc8td8ldq8rp1rd94gtksv8.apps.googleusercontent.com";

export const metadata: Metadata = {
  title: {
    default: "SAVStudio",
    template: "%s | SAVStudio",
  },
  description:
    "SAVStudio — lightweight survey data analysis and visualization tools for SPSS datasets.",
  keywords: [
    "savstudio",
    "sav-studio",
    "sav studio",
    "sav viewer",
    "sav editor online",
    "spss editor online",
    "sav anlyzer online",
    "spss analysis online",
    "spss viewer",
    "IBM SPSS analyser",
    "ibm spss analyser",
    "ibm spss viewer",
    "sav analysis",
    "survey analysis",
    "SPSS",
    "data visualization",
    "cross tabulation",
    "factor analysis",
  ],
  openGraph: {
    title: "SAVStudio",
    description:
      "Analyze, visualize and export survey data from SPSS files with an intuitive interface.",
    url: "https://savstudio.app/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

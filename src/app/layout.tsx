import type { Metadata } from "next";
import { Inter, Playfair_Display, Space_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });
const spaceMono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-space-mono" });

export const metadata: Metadata = {
  title: "Nusantara Cinema Studio — HyperFrames + Blender 3D Engine",
  description: "Studio produksi film dokumenter sejarah Indonesia berbasis HyperFrames, Blender 3D, dan Neon Postgres.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${playfair.variable} ${spaceMono.variable}`}>
      <body className="min-h-screen antialiased selection:bg-[#C8102E] selection:text-white">
        {children}
      </body>
    </html>
  );
}

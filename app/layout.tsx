import type { Metadata } from "next";
import { Bodoni_Moda, Inter } from "next/font/google";
import "./globals.css";

// Bodoni Moda for headings and big KPI figures, Inter for everything else — the editorial
// pairing from the Stitch design. Both are variable fonts, so no weight list is needed.
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dabble Instagram Analytics",
  description: "Instagram organic performance dashboard for Dabble Playart.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodoni.variable} ${inter.variable}`}>
      <body className="bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}

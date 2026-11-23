import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter throughout, as in the second Stitch design. Variable font, so no weight list is needed.
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
    <html lang="en" className={inter.variable}>
      <body className="bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}

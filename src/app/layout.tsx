import type { Metadata } from "next";
import { Montserrat, Bodoni_Moda } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const bodoniModa = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "NKSW CRM",
  description: "CRM interno Naked Swimwear",
  robots: "noindex, nofollow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${montserrat.variable} ${bodoniModa.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

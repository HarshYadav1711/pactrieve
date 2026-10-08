import type {Metadata} from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pactrieve | Every answer, traceable",
  description: "An evidence-first legal contract workspace."
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edital Certo | Monitor de Licitações",
  description: "Licitações públicas compatíveis com o perfil da sua empresa."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}


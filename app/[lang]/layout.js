import "../globals.css";
import { translations } from "@/lib/translations";
import HeaderIsland from "../components/HeaderIsland";

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const t = translations[lang] || translations.tr;
  const baseUrl = "https://obscloner.vercel.app";

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: t.seoTitle || "OBS CLONER — Premium Discord Server Copy Engine",
      template: "%s | OBS CLONER"
    },
    description: t.seoDescription || "Premium Discord Server Copy Engine",
    keywords: "Discord Cloner, OBS CLONER, Discord Server Copy, Discord Backup, Discord Tool, Server Cloner, Discord Sunucu Kopyalama, Discord Yedekleme, Obsessive",
    robots: "index, follow",
    authors: [{ name: "Obsessive Inc." }],
    creator: "Obsessive Inc.",
    publisher: "Obsessive Inc.",
    manifest: "/manifest.json",
    icons: {
      icon: "/favicon.ico",
      shortcut: "/favicon.ico",
      apple: "/favicon.ico"
    },
    openGraph: {
      title: t.seoTitle || "OBS CLONER — Premium Discord Server Copy Engine",
      description: t.seoDescription || "Discord sunucularınızı saniyeler içinde profesyonelce klonlayın.",
      url: `${baseUrl}/${lang}`,
      siteName: "OBS CLONER",
      locale: lang,
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title: t.seoTitle || "OBS CLONER",
      description: t.seoDescription || "Premium Discord Server Copy Engine"
    },
    alternates: {
      canonical: `/${lang}`,
      languages: {
        'tr': '/tr',
        'en': '/en',
        'es': '/es',
        'fr': '/fr',
        'de': '/de',
        'pt': '/pt',
        'it': '/it',
        'ru': '/ru',
        'ja': '/ja',
        'ar': '/ar',
        'id': '/id',
      },
    },
  };
}

export async function generateStaticParams() {
  return ['tr', 'en', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ja', 'ar', 'id'].map((lang) => ({ lang }));
}

export default async function RootLayout({ children, params }) {
  const { lang } = await params;
  return (
    <html lang={lang || "en"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <HeaderIsland />
        {children}
      </body>
    </html>
  );
}

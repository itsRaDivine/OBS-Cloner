export default function sitemap() {
  const baseUrl = 'https://obscloner.vercel.app';
  const languages = ['tr', 'en', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ja', 'ar', 'id'];
  const pages = ['', '/about', '/guides', '/contact', '/privacy', '/terms'];

  const entries = [];

  for (const lang of languages) {
    for (const page of pages) {
      entries.push({
        url: `${baseUrl}/${lang}${page}`,
        lastModified: new Date(),
        changeFrequency: page === '' ? 'daily' : 'monthly',
        priority: page === '' ? 1.0 : 0.6
      });
    }
  }

  return entries;
}

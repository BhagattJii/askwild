import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://askwild.vercel.app',
      changeFrequency: 'daily',
      priority: 1
    },
    {
      url: 'https://askwild.vercel.app/auth/login',
      changeFrequency: 'monthly',
      priority: 0.3
    },
    {
      url: 'https://askwild.vercel.app/auth/sign-up',
      changeFrequency: 'monthly',
      priority: 0.3
    }
  ]
}

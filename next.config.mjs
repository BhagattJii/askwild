/** @type {import('next').NextConfig} */
const nextConfig = {
  skipTrailingSlashRedirect: true,
  experimental: {
    staleTimes: { dynamic: 300 }
  },
  async headers() {
    const hardenedHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY'
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff'
      },
      {
        // Same coverage as X-Frame-Options for modern browsers, declared
        // explicitly so CSP-aware embeds stay blocked too.
        key: 'Content-Security-Policy',
        value: "frame-ancestors 'none'"
      },
      {
        key: 'Permissions-Policy',
        value:
          'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
      }
    ]

    return [
      {
        source: '/:path*',
        headers: hardenedHeaders
      },
      {
        // Only the auth pages carry one-time credentials in ?token=
        // (invitations, password resets, bootstrap). no-referrer on those
        // pages keeps the token-bearing URL out of Referer headers on
        // outbound and same-origin requests — including requests the
        // /relay PostHog proxy route makes upstream — while the rest of
        // the site keeps normal referrer data for analytics.
        source: '/auth/:path*',
        headers: [
          {
            key: 'Referrer-Policy',
            value: 'no-referrer'
          }
        ]
      }
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/vi/**'
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**' // Google user content often follows this pattern
      },
      {
        protocol: 'https',
        hostname: 'imgs.search.brave.com',
        port: '',
        pathname: '/**' // Brave search cached images
      }
    ]
  }
}

export default nextConfig

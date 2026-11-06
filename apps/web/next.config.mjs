/** The browser only talks to this Next.js app; /api/* is proxied to the FastAPI backend so cookies stay first-party. The address is fixed at build time (API_URL, default 127.0.0.1:4000). */
const API = process.env.API_URL || 'http://127.0.0.1:4000';
export default {
  async rewrites() { return [{ source: '/api/:path*', destination: `${API}/api/:path*` }]; },
  images: { unoptimized: true },
  async headers() { return [{ source: '/img/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }] }]; },
  poweredByHeader: false,
};

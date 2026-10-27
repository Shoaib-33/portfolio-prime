/** The browser only talks to this Next.js app; /api/* is proxied to the FastAPI backend so cookies stay first-party. The address is fixed at build time (API_URL, default 127.0.0.1:4000). */
const API = process.env.API_URL || 'http://127.0.0.1:4000';
export default {
  async rewrites() { return [{ source: '/api/:path*', destination: `${API}/api/:path*` }]; },
  images: { unoptimized: true },
  poweredByHeader: false,
};

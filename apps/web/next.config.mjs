/** The browser only talks to this Next.js app; /api/* is proxied to the NestJS API so cookies stay first-party. */
const API = process.env.API_URL || 'http://127.0.0.1:4000';
export default {
  async rewrites() { return [{ source: '/api/:path*', destination: `${API}/api/:path*` }]; },
  images: { unoptimized: true },
  poweredByHeader: false,
};

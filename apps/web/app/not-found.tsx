import Link from 'next/link';
export default function NotFound() { return <section className="section empty"><h1>Page not found</h1><p>This listing may have been withdrawn, or the link is wrong.</p><Link className="btn navy" href="/listings">Back to the offering ↗</Link></section>; }

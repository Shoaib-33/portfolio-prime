export const money = (n?: number | null) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n));
export const pct = (n?: number | null, d = 1) => (n === null || n === undefined ? '—' : n.toFixed(d) + '%');
export const date = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const STATUS: Record<string, string> = { draft: 'Draft', coming_soon: 'Coming soon', available: 'Available', under_offer: 'Under offer', sold_stc: 'Sold subject to conditions', sold: 'Sold', withdrawn: 'Withdrawn' };
export const DEAL: Record<string, string> = { direct: 'Direct sale', portfolio: 'Portfolio', bid_round: 'Bid round', off_market: 'Off-market' };
export const CATEGORY: Record<string, string> = { all: 'All properties', portfolios: 'Residential portfolios', buildings: 'Apartment buildings', homes: 'Prime homes' };
export const CITIES = ['Amsterdam', 'Den Haag', 'Eindhoven', 'Rotterdam', 'Utrecht', 'Wassenaar'];
export const scoreColor = (t: number) => (t >= 75 ? '#3f7a5c' : t >= 60 ? '#b68550' : '#a24632');
export const PROVINCES = ['Drenthe', 'Flevoland', 'Friesland', 'Gelderland', 'Groningen', 'Limburg', 'Noord-Brabant', 'Noord-Holland', 'Overijssel', 'Utrecht', 'Zeeland', 'Zuid-Holland'];
/** Listing -> map point. The API decides how exact the point is (city centre for visitors). */
export const toPoint = (l: any) => l.point ? { slug: l.slug, name: l.name, city: l.city, district: l.district, price: l.askingPrice ? money(l.askingPrice) : l.priceDisplay || 'Price on request', bar: l.bar, image: l.image, lat: l.point.lat, lng: l.point.lng, approx: !!l.point.approx } : null;

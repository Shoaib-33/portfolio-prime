export const money = (n?: number | null) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n));
export const pct = (n?: number | null, d = 1) => (n === null || n === undefined ? '—' : n.toFixed(d) + '%');
export const date = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const STATUS: Record<string, string> = { draft: 'Draft', coming_soon: 'Coming soon', available: 'Available', under_offer: 'Under offer', sold_stc: 'Sold subject to conditions', sold: 'Sold', withdrawn: 'Withdrawn' };
export const DEAL: Record<string, string> = { direct: 'Direct sale', portfolio: 'Portfolio', bid_round: 'Bid round', off_market: 'Off-market' };
export const CATEGORY: Record<string, string> = { all: 'All properties', portfolios: 'Residential portfolios', buildings: 'Apartment buildings', homes: 'Prime homes' };
export const CITIES = ['Amsterdam', 'Den Haag', 'Eindhoven', 'Rotterdam', 'Utrecht', 'Wassenaar'];
export const scoreColor = (t: number) => (t >= 75 ? '#3f7a5c' : t >= 60 ? '#b68550' : '#a24632');

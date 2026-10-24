import { Landing, landingMeta } from '@/components/seo-landing';

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }) { const { city } = await params; return landingMeta(city); }
export default async function CityPage({ params }: { params: Promise<{ city: string }> }) { const { city } = await params; return <Landing city={city} />; }

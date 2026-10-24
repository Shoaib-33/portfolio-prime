import { Landing, landingMeta } from '@/components/seo-landing';

export async function generateMetadata({ params }: { params: Promise<{ city: string; type: string }> }) { const { city, type } = await params; return landingMeta(city, type); }
export default async function CityTypePage({ params }: { params: Promise<{ city: string; type: string }> }) { const { city, type } = await params; return <Landing city={city} type={type} />; }

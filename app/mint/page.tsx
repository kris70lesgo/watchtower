import type { Metadata } from 'next';
import { Header } from '@/components/header';
import { Mint } from '@/components/mint';
import { Footer } from '@/components/footer';
import '../mint.css';
export const metadata: Metadata = { title: 'Mint compute' };
export default function Page() { return <div className="application-shell"><Header/><main className="application-main"><Mint/></main><Footer/></div>; }

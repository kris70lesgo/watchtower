import type { Viewport } from 'next';
import { Landing } from '@/components/landing';
export const viewport: Viewport = { themeColor: '#ebebeb' };
export default function Page() { return <Landing/>; }

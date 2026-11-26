import { footerHtml } from '@/lib/generated/templates';
export function Footer() { return <div dangerouslySetInnerHTML={{ __html: footerHtml }}/>; }

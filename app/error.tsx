'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="wrap sec"><h1>Could not load this page.</h1><p className="lead">Check your connection and try again.</p><button className="btn" onClick={reset}>Try again</button></main>;
}

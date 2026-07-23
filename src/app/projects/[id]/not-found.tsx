import Link from "next/link";

export default function NotFound() {
  return (
    <div className="text-center py-24">
      <div className="text-5xl mb-4">🛰️</div>
      <h1 className="text-xl font-bold">Opportunity not found</h1>
      <p className="text-text-muted mt-2">This project may have been closed or removed from the source feed.</p>
      <Link href="/explorer" className="btn btn-primary mt-6 inline-flex">
        Back to Explorer
      </Link>
    </div>
  );
}

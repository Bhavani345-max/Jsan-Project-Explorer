import { Suspense } from "react";
import { ExplorerClient } from "./ExplorerClient";

export default function ExplorerPage() {
  return (
    <Suspense fallback={<div className="text-text-faint">Loading explorer…</div>}>
      <ExplorerClient />
    </Suspense>
  );
}

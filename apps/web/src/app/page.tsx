import { HealthResponseSchema } from "@pos/contracts";
import { loadPublicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

async function fetchApiHealth(): Promise<{ ok: boolean; raw: string }> {
  const { NEXT_PUBLIC_API_URL } = loadPublicEnv();
  try {
    const res = await fetch(`${NEXT_PUBLIC_API_URL}/health`, { cache: "no-store" });
    const json = await res.json();
    HealthResponseSchema.parse(json);
    return { ok: true, raw: JSON.stringify(json) };
  } catch (err) {
    return { ok: false, raw: String(err) };
  }
}

export default async function Home() {
  const apiHealth = await fetchApiHealth();
  return (
    <main className="p-8 space-y-4">
      <h1 className="text-3xl font-semibold">POS Superpowers</h1>
      <p>Web app is up.</p>
      <p>
        API health:{" "}
        <span className={apiHealth.ok ? "text-green-600" : "text-red-600"}>
          {apiHealth.ok ? "ok" : "unreachable"}
        </span>
      </p>
      <pre className="rounded bg-gray-100 p-4 text-sm">{apiHealth.raw}</pre>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = () => {
    if (!query.trim()) return;
    router.push(`/results?q=${encodeURIComponent(query.trim())}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="pt-8 pb-8">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight">
            THIS IS THE UPDATED VERSION
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl">
            Find products with smarter recommendations, real shopping links,
            and a cleaner way to explore what to buy.
          </p>
        </div>

        <div className="mt-8 bg-zinc-950 border border-zinc-800 rounded-2xl p-4 md:p-5 shadow-2xl">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="Search for headphones, keyboards, desk setups, cameras..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 rounded-xl bg-zinc-900 border border-zinc-700 px-5 py-4 text-white outline-none focus:border-white"
            />
            <button
              onClick={handleSearch}
              className="rounded-xl bg-white text-black px-6 py-4 font-semibold hover:bg-zinc-200 transition"
            >
              Find Products
            </button>
          </div>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-2xl mb-3">⚡</div>
            <h2 className="text-xl font-semibold mb-2">Fast Results</h2>
            <p className="text-zinc-400">
              Search and jump straight into a dedicated results page.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-2xl mb-3">🎯</div>
            <h2 className="text-xl font-semibold mb-2">Smarter Picks</h2>
            <p className="text-zinc-400">
              Broader searches can return more options, while specific searches
              stay focused.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-2xl mb-3">🛒</div>
            <h2 className="text-xl font-semibold mb-2">Cleaner Shopping</h2>
            <p className="text-zinc-400">
              Browse photos, prices, and links in a more app-like layout.
            </p>
          </div>
        </div>

        <div className="mt-14">
          <h3 className="text-2xl font-semibold mb-5">Popular searches</h3>
          <div className="flex flex-wrap gap-3">
            {[
              "best headphones under 100",
              "gaming mouse",
              "desk setup accessories",
              "best webcam for streaming",
              "budget mechanical keyboard",
              "portable speaker",
            ].map((item) => (
              <button
                key={item}
                onClick={() => router.push(`/results?q=${encodeURIComponent(item)}`)}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800 transition"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
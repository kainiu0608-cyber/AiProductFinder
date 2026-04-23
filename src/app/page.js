"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POPULAR_SEARCHES = [
  "best headphones under 100",
  "gaming mouse",
  "best desk chair for back pain",
  "best webcam for streaming",
  "budget mechanical keyboard",
  "portable bluetooth speaker",
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState([]);
  const router = useRouter();

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("recent_searches") || "[]");
    setRecentSearches(saved);
  }, []);

  const saveRecentSearch = (value) => {
    const next = [
      value,
      ...recentSearches.filter(
        (item) => item.toLowerCase() !== value.toLowerCase()
      ),
    ].slice(0, 6);

    setRecentSearches(next);
    localStorage.setItem("recent_searches", JSON.stringify(next));
  };

  const handleSearch = (value = query) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    saveRecentSearch(trimmed);
    router.push(`/results?q=${encodeURIComponent(trimmed)}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="pt-10 pb-10">
          <div className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-300 mb-6">
            Smarter product discovery
          </div>

          <h1 className="text-5xl md:text-6xl font-bold mb-4 tracking-tight">
            Fyndo
          </h1>

          <p className="text-zinc-400 text-lg max-w-2xl leading-8">
            Search what you need, compare real products, and get smarter picks
            based on budget, use case, and priorities.
          </p>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-4 md:p-5 shadow-2xl">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="Search for headphones, laptops, chairs, cameras..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 rounded-2xl bg-zinc-900 border border-zinc-700 px-5 py-4 text-white outline-none focus:border-white"
            />
            <button
              onClick={() => handleSearch()}
              className="rounded-2xl bg-white text-black px-6 py-4 font-semibold hover:bg-zinc-200 transition"
            >
              Search
            </button>
          </div>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-6">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-2xl mb-3">⚡</div>
            <h2 className="text-xl font-semibold mb-2">Fast product picks</h2>
            <p className="text-zinc-400">
              Get real options, not random AI guesses.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-2xl mb-3">🎯</div>
            <h2 className="text-xl font-semibold mb-2">Smarter matching</h2>
            <p className="text-zinc-400">
              Your search is broken into budget, category, and use case.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-2xl mb-3">🛒</div>
            <h2 className="text-xl font-semibold mb-2">Real shopping data</h2>
            <p className="text-zinc-400">
              Prices, shopping links, and product cards come from real search
              results.
            </p>
          </div>
        </div>

        <div className="mt-14">
          <h3 className="text-2xl font-semibold mb-5">Popular searches</h3>
          <div className="flex flex-wrap gap-3">
            {POPULAR_SEARCHES.map((item) => (
              <button
                key={item}
                onClick={() => handleSearch(item)}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800 transition"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {recentSearches.length > 0 && (
          <div className="mt-12">
            <h3 className="text-2xl font-semibold mb-5">Recent searches</h3>
            <div className="flex flex-wrap gap-3">
              {recentSearches.map((item) => (
                <button
                  key={item}
                  onClick={() => handleSearch(item)}
                  className="rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900 transition"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
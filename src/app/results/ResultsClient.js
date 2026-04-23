"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResultsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState("best");
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("favorites") || "[]");
    setFavorites(saved);
  }, []);

  useEffect(() => {
    const runSearch = async () => {
      if (!query.trim()) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        });

        const data = await res.json();
        setResults(data.result || []);
      } catch (error) {
        console.error("Results page error:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    runSearch();
  }, [query]);

  const toggleFavorite = (item) => {
    const exists = favorites.some((fav) => fav.link === item.link);
    let next;

    if (exists) {
      next = favorites.filter((fav) => fav.link !== item.link);
    } else {
      next = [item, ...favorites].slice(0, 20);
    }

    setFavorites(next);
    localStorage.setItem("favorites", JSON.stringify(next));
  };

  const sortedResults = useMemo(() => {
    const items = [...results];

    const getPriceNumber = (price) => {
      if (!price) return Number.MAX_SAFE_INTEGER;
      const match = String(price).replace(/,/g, "").match(/(\d+(\.\d+)?)/);
      return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
    };

    if (sortMode === "priceLow") {
      items.sort((a, b) => getPriceNumber(a.price) - getPriceNumber(b.price));
    } else if (sortMode === "priceHigh") {
      items.sort((a, b) => getPriceNumber(b.price) - getPriceNumber(a.price));
    } else if (sortMode === "rating") {
      items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return items;
  }, [results, sortMode]);

  return (
    <main className="min-h-screen bg-black text-white px-6 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="h-11 w-11 rounded-full border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xl"
              aria-label="Go back"
            >
              ←
            </button>

            <div>
              <p className="text-zinc-400 text-sm">Search results for</p>
              <h1 className="text-3xl md:text-4xl font-bold break-words">
                {query || "Your search"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-400">Sort</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-2 text-white"
            >
              <option value="best">Best Match</option>
              <option value="rating">Highest Rated</option>
              <option value="priceLow">Lowest Price</option>
              <option value="priceHigh">Highest Price</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="rounded-3xl border border-zinc-800 bg-zinc-950 p-4 animate-pulse"
              >
                <div className="h-52 rounded-2xl bg-zinc-800 mb-4" />
                <div className="h-6 bg-zinc-800 rounded mb-3" />
                <div className="h-4 bg-zinc-800 rounded mb-2" />
                <div className="h-4 bg-zinc-800 rounded mb-2" />
                <div className="h-10 bg-zinc-800 rounded mt-4" />
              </div>
            ))}
          </div>
        ) : sortedResults.length === 0 ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center">
            <h2 className="text-2xl font-semibold mb-2">
              No strong matches found
            </h2>
            <p className="text-zinc-400 mb-5">
              Try a simpler search, remove one condition, or search a category
              like “best wireless headphones under 100”.
            </p>
            <button
              onClick={() => router.push("/")}
              className="rounded-2xl bg-white text-black px-5 py-3 font-semibold hover:bg-zinc-200 transition"
            >
              Back to search
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 text-zinc-400">
              Showing {sortedResults.length} product
              {sortedResults.length !== 1 ? "s" : ""}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {sortedResults.map((item, i) => {
                const isFavorite = favorites.some((fav) => fav.link === item.link);

                return (
                  <div
                    key={`${item.name}-${i}`}
                    className="rounded-3xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
                  >
                    <div className="overflow-hidden rounded-2xl bg-white mb-4 relative">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-56 object-cover"
                      />
                      <button
                        onClick={() => toggleFavorite(item)}
                        className="absolute top-3 right-3 rounded-full bg-black/70 px-3 py-2 text-sm"
                      >
                        {isFavorite ? "★" : "☆"}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {item.label && (
                        <div className="inline-block rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200">
                          {item.label}
                        </div>
                      )}
                      {item.source && (
                        <div className="inline-block rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
                          {item.source}
                        </div>
                      )}
                    </div>

                    <h2 className="text-xl font-bold mb-2">{item.name}</h2>

                    <div className="flex items-center justify-between mb-3">
                      <p className="text-green-400 font-semibold">{item.price}</p>
                      {item.rating && (
                        <p className="text-sm text-yellow-400">
                          {item.rating}
                          {item.reviews ? ` (${item.reviews})` : ""}
                        </p>
                      )}
                    </div>

                    {item.reason && (
                      <p className="text-sm text-zinc-300 mb-4">{item.reason}</p>
                    )}

                    <div className="mb-3">
                      <p className="font-semibold mb-1">Pros</p>
                      <ul className="list-disc ml-5 text-sm text-zinc-300 space-y-1">
                        {(item.pros || []).map((pro, index) => (
                          <li key={index}>{pro}</li>
                        ))}
                      </ul>
                    </div>

                    <p className="text-sm text-red-400 mb-5">
                      <span className="font-semibold">Con:</span> {item.con}
                    </p>

                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-white text-black px-4 py-3 font-semibold hover:bg-zinc-200 transition"
                    >
                      View Product
                    </a>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
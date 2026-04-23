"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResultsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <main className="min-h-screen bg-black text-white px-6 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
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

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 animate-pulse"
              >
                <div className="h-52 rounded-xl bg-zinc-800 mb-4" />
                <div className="h-6 bg-zinc-800 rounded mb-3" />
                <div className="h-4 bg-zinc-800 rounded mb-2" />
                <div className="h-4 bg-zinc-800 rounded mb-2" />
                <div className="h-10 bg-zinc-800 rounded mt-4" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
            <h2 className="text-2xl font-semibold mb-2">No results found</h2>
            <p className="text-zinc-400">
              Try a broader search or go back and try different words.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 text-zinc-400">
              Showing {results.length} product{results.length !== 1 ? "s" : ""}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {results.map((item, i) => (
                <div
                  key={`${item.name}-${i}`}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
                >
                  <div className="overflow-hidden rounded-xl bg-white mb-4">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-56 object-cover"
                    />
                  </div>

                  <h2 className="text-xl font-bold mb-2">{item.name}</h2>

                  <div className="flex items-center justify-between mb-3">
                    <p className="text-green-400 font-semibold">{item.price}</p>
                    {item.source && (
                      <p className="text-xs text-zinc-500">{item.source}</p>
                    )}
                  </div>

                  {item.rating && (
                    <p className="text-sm text-yellow-400 mb-3">
                      Rating: {item.rating}
                      {item.reviews ? ` (${item.reviews} reviews)` : ""}
                    </p>
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
                    className="inline-flex w-full items-center justify-center rounded-xl bg-white text-black px-4 py-3 font-semibold hover:bg-zinc-200 transition"
                  >
                    View Product
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
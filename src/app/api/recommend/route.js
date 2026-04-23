import OpenAI from "openai";
import axios from "axios";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const cleaned = String(text)
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(cleaned);
    } catch {
      return fallback;
    }
  }
}

function normalizePrice(priceText) {
  if (!priceText) return null;
  const match = String(priceText).replace(/,/g, "").match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function getSearchMode(query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);

  const specificitySignals = [
    "under",
    "over",
    "below",
    "above",
    "between",
    "with",
    "for",
    "best",
    "budget",
    "cheap",
    "premium",
    "family",
    "gaming",
    "travel",
    "school",
    "work",
    "gym",
    "professional",
    "fast",
    "lightweight",
    "durable",
    "luxury",
    "$",
  ];

  const hasSpecificSignal =
    specificitySignals.some((word) => q.includes(word)) || /\d/.test(q);

  if (!hasSpecificSignal && words.length <= 2) {
    return {
      mode: "broad",
      targetCount: 36,
      keywordCount: 6,
    };
  }

  if (!hasSpecificSignal && words.length <= 4) {
    return {
      mode: "medium",
      targetCount: 24,
      keywordCount: 5,
    };
  }

  return {
    mode: "specific",
    targetCount: 14,
    keywordCount: 4,
  };
}

async function parseUserIntent(query, searchMode) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You analyze shopping searches like a smart human buyer.

Return ONLY valid JSON with this exact shape:
{
  "category": "string",
  "broad_query": true,
  "budget_min": null,
  "budget_max": null,
  "must_have": [],
  "nice_to_have": [],
  "avoid": [],
  "keywords": [],
  "sort_intent": "relevance"
}

Rules:
- Return JSON only
- No markdown
- Do not make up strict categories if unclear; use natural product types
- keywords should be broad enough to find many real products
- For broad searches, make keywords broad and expansive
- For specific searches, keep constraints but still search wide enough to return many options
- budget_min and budget_max must be numbers or null
- must_have / nice_to_have / avoid must be arrays of strings
- sort_intent can be relevance, price_low, price_high, rating`,
        },
        {
          role: "user",
          content: `Search mode: ${searchMode.mode}
User query: ${query}

Return ${searchMode.keywordCount} useful shopping search keywords.`,
        },
      ],
    });

    const parsed = safeJsonParse(response.choices[0].message.content, null);

    if (!parsed) throw new Error("intent parse failed");

    return {
      category: parsed.category || "general",
      broad_query: Boolean(parsed.broad_query),
      budget_min: parsed.budget_min ?? null,
      budget_max: parsed.budget_max ?? null,
      must_have: Array.isArray(parsed.must_have) ? parsed.must_have : [],
      nice_to_have: Array.isArray(parsed.nice_to_have) ? parsed.nice_to_have : [],
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
      keywords:
        Array.isArray(parsed.keywords) && parsed.keywords.length
          ? parsed.keywords
          : [query],
      sort_intent: parsed.sort_intent || "relevance",
    };
  } catch {
    return {
      category: "general",
      broad_query: searchMode.mode === "broad",
      budget_min: null,
      budget_max: null,
      must_have: [],
      nice_to_have: [],
      avoid: [],
      keywords: [query],
      sort_intent: "relevance",
    };
  }
}

async function fetchShoppingResults(searchQuery) {
  const response = await axios.get("https://serpapi.com/search.json", {
    params: {
      engine: "google_shopping",
      q: searchQuery,
      api_key: process.env.SERPAPI_KEY,
      gl: "us",
      hl: "en",
      num: 20,
    },
  });

  return response.data.shopping_results || [];
}

function mapShoppingResult(item) {
  return {
    title: item.title || "",
    price: item.price || "Price unavailable",
    priceNumber: normalizePrice(item.price),
    link: item.product_link || item.link || "#",
    image:
      item.thumbnail ||
      item.serpapi_thumbnail ||
      "https://via.placeholder.com/600x600?text=No+Image",
    source: item.source || "Unknown",
    rating: item.rating || null,
    reviews: item.reviews || null,
  };
}

function dedupeCandidates(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = item.title.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

function containsAny(title, words) {
  const lower = title.toLowerCase();
  return words.some((word) => lower.includes(String(word).toLowerCase()));
}

function filterCandidates(candidates, intent, searchMode) {
  const avoidWords = (intent.avoid || []).map((x) => x.toLowerCase());

  const weakAccessoryWords = [
    "case",
    "cover",
    "replacement",
    "adapter",
    "cable",
    "screen protector",
    "tripod",
    "mousepad",
    "keycaps",
    "wrist rest",
  ];

  return candidates.filter((item) => {
    const title = item.title.toLowerCase();
    if (!title) return false;

    if (containsAny(title, avoidWords)) return false;

    // Only remove obvious accessories if the query is specific enough.
    if (searchMode.mode !== "broad" && containsAny(title, weakAccessoryWords)) {
      return false;
    }

    if (intent.budget_max && item.priceNumber) {
      // Broad searches get looser price filtering, specific searches get tighter.
      const multiplier = searchMode.mode === "specific" ? 1.2 : 1.5;
      if (item.priceNumber > intent.budget_max * multiplier) return false;
    }

    if (intent.budget_min && item.priceNumber) {
      if (item.priceNumber < intent.budget_min * 0.7) return false;
    }

    return true;
  });
}

function fallbackRank(candidates, intent, searchMode) {
  const scored = candidates.map((item) => {
    let score = 0;
    const title = item.title.toLowerCase();

    if (item.rating) score += Number(item.rating) * 3;
    if (item.reviews) score += Math.min(Number(item.reviews) / 100, 10);

    for (const word of intent.must_have || []) {
      if (title.includes(String(word).toLowerCase())) score += 8;
    }

    for (const word of intent.nice_to_have || []) {
      if (title.includes(String(word).toLowerCase())) score += 3;
    }

    if (intent.budget_max && item.priceNumber) {
      if (item.priceNumber <= intent.budget_max) score += 10;
    }

    if (searchMode.mode === "broad") score += 2;

    return { ...item, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored;
}

async function aiRankCandidates(query, intent, candidates, targetCount) {
  try {
    const compactCandidates = candidates.slice(0, 40).map((item, index) => ({
      id: index + 1,
      title: item.title,
      price: item.price,
      rating: item.rating,
      reviews: item.reviews,
      source: item.source,
    }));

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are a highly capable product ranking engine.

You will receive:
- the user's search
- extracted buying intent
- a large candidate list

Choose ONLY from the candidate list.
Do NOT invent products.

Return ONLY valid JSON array with up to ${targetCount} items.

Each item must include:
- id
- display_name
- reason
- pros (array of 2 strings)
- con
- label

Allowed labels:
"Best Overall", "Best Budget", "Best Value", "Best for Use Case", "Top Pick"

Rules:
- Respect constraints strongly
- Keep broad searches broad
- Keep specific searches tight but not overly narrow
- Prefer items with stronger fit, better value, and stronger trust signals
- Output JSON only`,
        },
        {
          role: "user",
          content: JSON.stringify({
            query,
            intent,
            candidates: compactCandidates,
          }),
        },
      ],
    });

    return safeJsonParse(response.choices[0].message.content, []);
  } catch {
    return [];
  }
}

function buildFallbackResults(candidates, targetCount, query) {
  return candidates.slice(0, targetCount).map((candidate, index) => ({
    name: candidate.title,
    price: candidate.price,
    link: candidate.link,
    image: candidate.image,
    source: candidate.source,
    rating: candidate.rating,
    reviews: candidate.reviews,
    pros: [
      "Real product result from a live shopping source",
      "Strong overall match for the search",
    ],
    con: "May not match every single preference perfectly",
    reason: `Selected as one of the best available matches for "${query}".`,
    label:
      index === 0
        ? "Best Overall"
        : index === 1
        ? "Best Value"
        : index === 2
        ? "Best Budget"
        : "Top Pick",
  }));
}

export async function POST(req) {
  try {
    const { query } = await req.json();

    if (!query || !query.trim()) {
      return Response.json({ result: [] });
    }

    const searchMode = getSearchMode(query);
    const intent = await parseUserIntent(query, searchMode);

    const searchQueries =
      Array.isArray(intent.keywords) && intent.keywords.length
        ? intent.keywords.slice(0, searchMode.keywordCount)
        : [query];

    let allCandidates = [];

    for (const searchQuery of searchQueries) {
      try {
        const results = await fetchShoppingResults(searchQuery);
        allCandidates.push(...results.map(mapShoppingResult));
      } catch (err) {
        console.error("Search query failed:", searchQuery, err?.message || err);
      }
    }

    if (!allCandidates.length) {
      try {
        const fallbackResults = await fetchShoppingResults(query);
        allCandidates.push(...fallbackResults.map(mapShoppingResult));
      } catch (err) {
        console.error("Fallback search failed:", err?.message || err);
      }
    }

    allCandidates = dedupeCandidates(allCandidates);

    const filteredCandidates = filterCandidates(allCandidates, intent, searchMode);

    // If filtering gets too strict, fall back to the full pool.
    const usableCandidates =
      filteredCandidates.length >= 8 ? filteredCandidates : allCandidates;

    if (!usableCandidates.length) {
      return Response.json({ result: [] });
    }

    const fallbackSorted = fallbackRank(usableCandidates, intent, searchMode);
    const ranked = await aiRankCandidates(
      query,
      intent,
      fallbackSorted,
      searchMode.targetCount
    );

    let finalResults = ranked
      .map((picked) => {
        const candidate = fallbackSorted[(picked.id || 0) - 1];
        if (!candidate) return null;

        return {
          name: picked.display_name || candidate.title,
          price: candidate.price,
          link: candidate.link,
          image: candidate.image,
          source: candidate.source,
          rating: candidate.rating,
          reviews: candidate.reviews,
          pros: Array.isArray(picked.pros) ? picked.pros : [],
          con: picked.con || "No major downside listed",
          reason: picked.reason || "",
          label: picked.label || "Top Pick",
        };
      })
      .filter(Boolean);

    if (!finalResults.length) {
      finalResults = buildFallbackResults(
        fallbackSorted,
        searchMode.targetCount,
        query
      );
    }

    return Response.json({
      result: finalResults,
      meta: {
        mode: searchMode.mode,
        count: finalResults.length,
      },
    });
  } catch (error) {
    console.error("ERROR:", error?.response?.data || error.message || error);
    return Response.json({ result: [] }, { status: 500 });
  }
}
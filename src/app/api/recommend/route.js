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

function getDynamicResultCount(query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);

  const specificSignals = [
    "under",
    "for",
    "with",
    "best",
    "budget",
    "cheap",
    "top",
    "gaming",
    "family",
    "travel",
    "school",
    "work",
    "gym",
    "kids",
    "professional",
    "$",
  ];

  const hasSpecificSignal =
    specificSignals.some((word) => q.includes(word)) || /\d/.test(q);

  if (!hasSpecificSignal && words.length <= 2) return 8;
  if (!hasSpecificSignal && words.length <= 4) return 7;
  if (hasSpecificSignal && words.length >= 6) return 4;
  if (hasSpecificSignal && words.length >= 4) return 5;
  return 6;
}

async function parseUserIntent(query) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `Turn shopping requests into JSON.

Return ONLY valid JSON with:
{
  "category": "string",
  "budget_max": number or null,
  "use_case": "string or null",
  "must_have": ["string"],
  "avoid": ["string"],
  "keywords": ["string"],
  "broad_query": true or false
}

Rules:
- JSON only
- no markdown
- keep keywords short and useful
- give 3 to 5 keywords
- category should be simple like headphones, laptop, keyboard, chair, desk, camera, speaker, mouse, phone, tv, car, furniture, appliance, general`,
        },
        {
          role: "user",
          content: query,
        },
      ],
    });

    const parsed = safeJsonParse(response.choices[0].message.content, null);

    if (!parsed) throw new Error("intent parse failed");

    return {
      category: parsed.category || "general",
      budget_max: parsed.budget_max || null,
      use_case: parsed.use_case || null,
      must_have: Array.isArray(parsed.must_have) ? parsed.must_have : [],
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
      keywords:
        Array.isArray(parsed.keywords) && parsed.keywords.length
          ? parsed.keywords
          : [query],
      broad_query: Boolean(parsed.broad_query),
    };
  } catch {
    return {
      category: "general",
      budget_max: null,
      use_case: null,
      must_have: [],
      avoid: [],
      keywords: [query],
      broad_query: true,
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

function filterCandidates(candidates, intent) {
  const category = (intent.category || "").toLowerCase();
  const avoidWords = (intent.avoid || []).map((x) => x.toLowerCase());

  const badAccessoryWordsByCategory = {
    headphones: ["case", "ear pads", "replacement", "adapter", "cable"],
    laptop: ["charger", "case", "sleeve", "dock", "adapter"],
    keyboard: ["keycaps", "switches", "wrist rest", "replacement"],
    mouse: ["mousepad", "skates", "grips"],
    camera: ["lens cap", "tripod", "bag", "strap", "battery"],
    phone: ["case", "screen protector", "charger", "cable"],
    tablet: ["case", "screen protector", "charger"],
    tv: ["remote", "wall mount", "stand", "cable"],
  };

  const accessoryWords = badAccessoryWordsByCategory[category] || [];

  return candidates.filter((item) => {
    const title = item.title.toLowerCase();

    if (!title) return false;

    for (const word of accessoryWords) {
      if (title.includes(word)) return false;
    }

    for (const word of avoidWords) {
      if (word && title.includes(word)) return false;
    }

    if (intent.budget_max && item.priceNumber) {
      if (item.priceNumber > intent.budget_max * 1.35) return false;
    }

    return true;
  });
}

async function rankCandidates(query, intent, candidates, resultCount) {
  try {
    const compactCandidates = candidates.slice(0, 15).map((item, index) => ({
      id: index + 1,
      title: item.title,
      price: item.price,
      rating: item.rating,
      reviews: item.reviews,
      source: item.source,
    }));

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `You are a recommendation engine.

You receive:
- user query
- parsed intent
- candidate products

Choose only from the candidate list.
Do not invent products.

Return ONLY valid JSON array with up to ${resultCount} items.

Each item must include:
- id
- display_name
- reason
- pros (array of 2 strings)
- con
- label

Label must be one of:
"Best Overall", "Best Budget", "Best Value", "Best for Use Case", "Top Pick"

If some candidates are weak, return fewer items.
Output JSON only.`,
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

function buildFallbackResults(candidates, resultCount, query) {
  return candidates.slice(0, resultCount).map((candidate, index) => ({
    name: candidate.title,
    price: candidate.price,
    link: candidate.link,
    image: candidate.image,
    source: candidate.source,
    rating: candidate.rating,
    reviews: candidate.reviews,
    pros: [
      "Strong match for the search",
      "Available from a real shopping result",
    ],
    con: "May not perfectly match every preference",
    reason: `This was selected as one of the strongest available matches for "${query}".`,
    label:
      index === 0
        ? "Best Overall"
        : index === 1
        ? "Best Value"
        : "Top Pick",
  }));
}

export async function POST(req) {
  try {
    const { query } = await req.json();

    if (!query || !query.trim()) {
      return Response.json({ result: [] });
    }

    const resultCount = getDynamicResultCount(query);
    const intent = await parseUserIntent(query);

    const searchQueries =
      Array.isArray(intent.keywords) && intent.keywords.length
        ? intent.keywords.slice(0, 4)
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

    const filteredCandidates = filterCandidates(allCandidates, intent);

    const usableCandidates =
      filteredCandidates.length >= 3 ? filteredCandidates : allCandidates;

    if (!usableCandidates.length) {
      return Response.json({ result: [] });
    }

    const ranked = await rankCandidates(
      query,
      intent,
      usableCandidates,
      resultCount
    );

    let finalResults = ranked
      .map((picked) => {
        const candidate = usableCandidates[(picked.id || 0) - 1];
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
      finalResults = buildFallbackResults(usableCandidates, resultCount, query);
    }

    return Response.json({ result: finalResults });
  } catch (error) {
    console.error("ERROR:", error?.response?.data || error.message || error);
    return Response.json({ result: [] }, { status: 500 });
  }
}
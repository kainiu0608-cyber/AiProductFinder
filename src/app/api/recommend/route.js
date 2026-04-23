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
      const cleaned = text
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

  const specificitySignals = [
    "under",
    "for",
    "with",
    "best",
    "budget",
    "cheap",
    "top",
    "vs",
    "between",
    "family",
    "gaming",
    "travel",
    "school",
    "work",
    "gym",
    "kids",
    "beginner",
    "professional",
    "$",
  ];

  const hasSpecificSignal =
    specificitySignals.some((word) => q.includes(word)) || /\d/.test(q);

  if (!hasSpecificSignal && words.length <= 2) return 9;
  if (!hasSpecificSignal && words.length <= 4) return 7;
  if (hasSpecificSignal && words.length >= 6) return 4;
  if (hasSpecificSignal && words.length >= 4) return 5;
  return 6;
}

async function parseUserIntent(query) {
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `You convert shopping requests into structured JSON.

Return ONLY valid JSON with this exact shape:
{
  "category": "string",
  "budget_max": number or null,
  "budget_min": number or null,
  "use_case": "string or null",
  "must_have": ["string"],
  "avoid": ["string"],
  "keywords": ["string"],
  "price_sensitive": true or false,
  "broad_query": true or false
}

Rules:
- Return JSON only
- No markdown
- No explanation
- category should be a simple product category like:
  headphones, laptop, keyboard, mouse, monitor, chair, desk, speaker, camera, car, appliance, furniture, skincare, phone, tablet, tv, fitness, shoes, bag, watch, kitchen, general
- keywords should be 3 to 6 short useful search phrases
- If the query is broad, broad_query = true
- If user mentions under/budget/cheap, price_sensitive = true`,
      },
      {
        role: "user",
        content: query,
      },
    ],
  });

  const parsed = safeJsonParse(response.choices[0].message.content, null);

  if (!parsed) {
    return {
      category: "general",
      budget_max: null,
      budget_min: null,
      use_case: null,
      must_have: [],
      avoid: [],
      keywords: [query],
      price_sensitive: false,
      broad_query: true,
    };
  }

  return parsed;
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
    headphones: ["case", "ear pads", "earpad", "replacement", "adapter", "cable"],
    laptop: ["charger", "case", "sleeve", "dock", "adapter", "keyboard cover"],
    keyboard: ["keycaps", "switches", "wrist rest", "cable", "replacement"],
    mouse: ["mousepad", "skates", "grips", "replacement feet"],
    camera: ["lens cap", "tripod", "bag", "strap", "battery"],
    phone: ["case", "screen protector", "charger", "cable"],
    tablet: ["case", "stylus tip", "screen protector", "charger"],
    tv: ["remote", "wall mount", "stand", "cable"],
    chair: ["cover", "wheels", "replacement armrest"],
    desk: ["drawer", "mat", "organizer"],
    car: ["tuner", "floor mats", "accessories", "seat cover", "parts", "oil filter"],
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
      if (item.priceNumber > intent.budget_max * 1.2) return false;
    }

    return true;
  });
}

async function rankCandidates(query, intent, candidates, resultCount) {
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
        content: `You are a product recommendation engine.

You will receive:
1. The user's request
2. Parsed intent
3. Candidate products

Choose the best matching products ONLY from the candidate list.
Do NOT invent products.

Return ONLY valid JSON array with exactly ${resultCount} items if enough strong matches exist.
If fewer strong matches exist, return fewer.

Each item must have:
- "id" (number from candidate list)
- "display_name" (short clean name)
- "reason" (why it matches the user's request)
- "pros" (array of 2 strings)
- "con" (1 string)
- "label" (one of: "Best Overall", "Best Budget", "Best Premium", "Best Value", "Best for Use Case", "Top Pick")

Rules:
- Respect budget and use case strongly
- Avoid weak matches
- Prefer real common products
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
}

export async function POST(req) {
  try {
    const { query } = await req.json();

    if (!query || !query.trim()) {
      return Response.json({ result: [] });
    }

    const resultCount = getDynamicResultCount(query);
    const intent = await parseUserIntent(query);

    const searchQueries = Array.isArray(intent.keywords) && intent.keywords.length
      ? intent.keywords.slice(0, 3)
      : [query];

    let allCandidates = [];

    for (const searchQuery of searchQueries) {
      const results = await fetchShoppingResults(searchQuery);
      allCandidates.push(...results.map(mapShoppingResult));
    }

    allCandidates = dedupeCandidates(allCandidates);
    allCandidates = filterCandidates(allCandidates, intent);

    if (!allCandidates.length) {
      return Response.json({ result: [] });
    }

    const ranked = await rankCandidates(query, intent, allCandidates, resultCount);

    const finalResults = ranked
      .map((picked) => {
        const candidate = allCandidates[(picked.id || 0) - 1];
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

    return Response.json({ result: finalResults });
  } catch (error) {
    console.error("ERROR:", error?.response?.data || error.message || error);
    return Response.json({ result: [] }, { status: 500 });
  }
}
import OpenAI from "openai";
import axios from "axios";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getRecommendationCount(query) {
  const words = query.trim().split(/\s+/);
  const q = query.toLowerCase();

  const specificWords = [
    "under",
    "for",
    "best",
    "budget",
    "cheap",
    "wireless",
    "gaming",
    "streaming",
    "office",
    "school",
    "travel",
    "gym",
    "$",
  ];

  const hasSpecificSignal =
    specificWords.some((word) => q.includes(word)) || /\d/.test(q);

  if (words.length <= 2 && !hasSpecificSignal) return 9;
  if (words.length <= 4 && !hasSpecificSignal) return 7;
  if (hasSpecificSignal && words.length >= 4) return 4;
  return 6;
}

async function getShoppingResult(productName) {
  const response = await axios.get("https://serpapi.com/search.json", {
    params: {
      engine: "google_shopping",
      q: productName,
      api_key: process.env.SERPAPI_KEY,
      gl: "us",
      hl: "en",
    },
  });

  const results = response.data.shopping_results || [];
  return results[0] || null;
}

export async function POST(req) {
  try {
    const { query } = await req.json();
    const count = getRecommendationCount(query);

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: `A user searched for: ${query}

Return ONLY a valid JSON array with exactly ${count} product recommendations.

Each item must include:
- name
- pros (array of 2 strings)
- con

Rules:
- No markdown
- No extra text
- Only JSON
- Product names should be real, common, and likely to appear in shopping search results

Example:
[
  {
    "name": "Sony WH-1000XM5",
    "pros": ["Great noise cancellation", "Very comfortable"],
    "con": "Expensive"
  }
]`,
        },
      ],
    });

    const raw = aiResponse.choices[0].message.content;
    const recommendations = JSON.parse(raw);

    const enriched = await Promise.all(
      recommendations.map(async (item) => {
        const shopping = await getShoppingResult(item.name);

        return {
          name: item.name,
          pros: item.pros || [],
          con: item.con || "No downside listed",
          price: shopping?.price || "Price unavailable",
          link: shopping?.product_link || shopping?.link || "#",
          image:
            shopping?.thumbnail ||
            shopping?.serpapi_thumbnail ||
            "https://via.placeholder.com/600x600?text=No+Image",
          source: shopping?.source || "Unknown",
          rating: shopping?.rating || null,
          reviews: shopping?.reviews || null,
        };
      })
    );

    return Response.json({ result: enriched });
  } catch (error) {
    console.error("ERROR:", error?.response?.data || error.message || error);
    return Response.json({ result: [] }, { status: 500 });
  }
}
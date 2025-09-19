import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());
app.use(express.static("public"));

// --- CONFIG ---
const PORT = process.env.PORT || 8000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ISO 3166-1 alpha-2 codes (193 UN member states)
const ALL_COUNTRIES = [
  "AF","AL","DZ","AD","AO","AG","AR","AM","AU","AT",
  "AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BT",
  "BO","BA","BW","BR","BN","BG","BF","BI","CV","KH",
  "CM","CA","CF","TD","CL","CN","CO","KM","CG","CD",
  "CR","CI","HR","CU","CY","CZ","DK","DJ","DM","DO",
  "EC","EG","SV","GQ","ER","EE","SZ","ET","FJ","FI",
  "FR","GA","GM","GE","DE","GH","GR","GD","GT","GN",
  "GW","GY","HT","HN","HU","IS","IN","ID","IR","IQ",
  "IE","IL","IT","JM","JP","JO","KZ","KE","KI","KP",
  "KR","KW","KG","LA","LV","LB","LS","LR","LY","LI",
  "LT","LU","MG","MW","MY","MV","ML","MT","MH","MR",
  "MU","MX","FM","MD","MC","MN","ME","MA","MZ","MM",
  "NA","NR","NP","NL","NZ","NI","NE","NG","MK","NO",
  "OM","PK","PW","PA","PG","PY","PE","PH","PL","PT",
  "QA","RO","RU","RW","KN","LC","VC","WS","SM","ST",
  "SA","SN","RS","SC","SL","SG","SK","SI","SB","SO",
  "ZA","SS","ES","LK","SD","SR","SE","CH","SY","TJ",
  "TZ","TH","TL","TG","TO","TT","TN","TR","TM","TV",
  "UG","UA","AE","GB","US","UY","UZ","VU","VA","VE",
  "VN","YE","ZM","ZW"
];


// --- ROUTE: search-substance ---
app.post("/api/search-substance", async (req, res) => {
  const { substance } = req.body;
  if (!substance) return res.status(400).json({ error: "Missing substance" });

  const normalizedSubstance = substance.trim();

  try {
    // 1. Check Supabase
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/psychedelic_access?substance=eq.${encodeURIComponent(
        normalizedSubstance
      )}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!existingRes.ok) {
      const text = await existingRes.text();
      console.error("Supabase lookup failed:", text);
      return res.status(500).json({ error: "Failed to query Supabase" });
    }

    const existing = await existingRes.json();
    if (existing.length > 0) {
      console.log(`✅ ${normalizedSubstance} already in Supabase`);
      return res.json({ success: true, source: "cache", rows: existing.length });
    }

    // 2. Query OpenAI once for all countries
    const prompt = `For the substance "${normalizedSubstance}", determine its current legal or medical access status in the following countries:
${ALL_COUNTRIES.join(", ")}

Respond ONLY in strict JSON as an object where keys are ISO 3166-1 alpha-2 codes and values are one of:
- "Approved Medical Use"
- "Banned"
- "Limited Access Trials"
- "Unknown"`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a precise legal/medical data provider. Always output valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error("Empty response from OpenAI");

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse OpenAI output:", raw);
      return res.status(500).json({ error: "Failed to parse OpenAI output" });
    }

    // 3. Normalize into rows
    const rows = Object.entries(parsed)
      .filter(([code]) => /^[A-Z]{2}$/.test(code))
      .map(([country_code, access_status]) => ({
        substance: normalizedSubstance,
        country_code,
        access_status,
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0)
      return res.status(500).json({ error: "No valid rows returned" });

    // 4. Insert into Supabase
    const supabaseRes = await fetch(
      `${SUPABASE_URL}/rest/v1/psychedelic_access`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(rows),
      }
    );

    if (!supabaseRes.ok) {
      const text = await supabaseRes.text();
      console.error("Supabase insert error:", text);
      return res.status(500).json({ error: "Supabase insert failed" });
    }

    console.log(`✅ Inserted ${rows.length} rows for ${normalizedSubstance}`);
    res.json({ success: true, source: "openai", rows: rows.length });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

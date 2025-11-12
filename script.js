// --- Mapbox Setup ---
const isLocalhost = window.location.hostname === "localhost";

mapboxgl.accessToken = isLocalhost
  ? "pk.eyJ1IjoiYm5jNHZrIiwiYSI6ImNtZmtuNzExZTBma2YyaXB5N2V3cnNqZHYifQ.81pi_QteF8dXpaLdAgAcbA"
  : "pk.eyJ1IjoiYm5jNHZrIiwiYSI6ImNtZmttd2l0NDBlcmgybXB6engyZ3NsOXMifQ.ispasH40DZiTItGPC7EuQQ";

const isMobile = window.innerWidth <= 500;
const mapCenter = isMobile ? [-40, 20] : [10, 20];
const zoomLevel = isMobile ? 0.8 : 1.3;

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/light-v11",
  center: mapCenter,
  zoom: zoomLevel,
  projection: "mercator",
});

map.addControl(new mapboxgl.NavigationControl());

// --- Configurations ---
const statusColors = {
  Unknown: "#666666",
  Banned: "#e74c3c",
  "Limited Access Trials": "#f1c40f",
  "Approved Medical Use": "#27ae60",
};

let tileData = {};

const SUPABASE_URL = "https://upmsuqgcepaoeanexaao.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwbXN1cWdjZXBhb2VhbmV4YWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMzM2MzYsImV4cCI6MjA3MzYwOTYzNn0.-zWDeKMsisZWkHHy8-DeZ5utUeO4iRO6gZI7kxgPRh4";

// --- Load data from Supabase ---
async function loadDataFromAPI() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/psychedelic_access?select=*`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!response.ok)
      throw new Error(`HTTP error! status: ${response.status}`);
    const rawData = await response.json();
    tileData = transformDataStructure(rawData);
    return tileData;
  } catch (error) {
    console.error("Failed to load data from Supabase:", error);
    return {};
  }
}

function transformDataStructure(rawData) {
  const transformed = {};
  rawData.forEach(({ substance, country_code, access_status }) => {
    if (!transformed[substance]) transformed[substance] = {};
    transformed[substance][country_code] = access_status;
  });
  return transformed;
}

// --- Dark Mode ---
const hour = new Date().getHours();
if (hour >= 19 || hour < 7) document.body.classList.add("dark-mode");

// --- Map layer + coloring ---
map.on("style.load", () => {
  map.getStyle().layers.forEach((layer) => {
    if (layer.type === "symbol" && layer.layout?.["text-field"]) {
      try {
        map.setLayoutProperty(layer.id, "visibility", "none");
      } catch {}
    }
  });
});

map.on("load", () => {
  map.addSource("countries", {
    type: "vector",
    url: "mapbox://mapbox.country-boundaries-v1",
  });

  // Base greyscale layer (always visible underlay)
  map.addLayer({
    id: "countries-first-view",
    type: "fill",
    source: "countries",
    "source-layer": "country_boundaries",
    paint: {
      "fill-color": statusColors.Unknown,
      "fill-opacity": 0.8
    },
  });

  // Overlay colored layer (starts transparent, sits above base)
  map.addLayer({
    id: "countries-second-view",
    type: "fill",
    source: "countries",
    "source-layer": "country_boundaries",
    paint: {
      "fill-color": statusColors.Unknown,
      "fill-opacity": 0 // invisible until updated
    },
  }, "countries-first-view"); // ensure overlay is above base
});

let displayedCountriesViewIsFirst = true;
async function updateMapColors(drugKey) {
  const drugData = tileData[drugKey];
  if (!map.getLayer("countries-second-view") || !drugData) return;

  const entries = Object.entries(drugData).flatMap(([code, status]) => [
    code,
    statusColors[status] || statusColors.Unknown,
  ]);

  const newExpression = [
    "match",
    ["slice", ["get", "iso_3166_1"], 0, 2],
    ...entries,
    statusColors.Unknown,
  ];

  const countryViewToHide = displayedCountriesViewIsFirst ? "countries-first-view" : "countries-second-view";
  const countryViewToDisplay = displayedCountriesViewIsFirst ? "countries-second-view" : "countries-first-view";
  displayedCountriesViewIsFirst = !displayedCountriesViewIsFirst;

  map.setPaintProperty(countryViewToDisplay, "fill-color", newExpression);

  map.setPaintProperty(countryViewToHide, "fill-opacity-transition", {
    duration: 2000,
    delay: 0,
  });
  map.setPaintProperty(countryViewToHide, "fill-opacity", 0);

  map.setPaintProperty(countryViewToDisplay, "fill-opacity-transition", {
    duration: 2000,
    delay: 0,
  });
  map.setPaintProperty(countryViewToDisplay, "fill-opacity", 0.8);
}


// --- Legend ---
function buildLegend() {
  const legendContainer = document.getElementById("legend");
  legendContainer.innerHTML = "";
  Object.entries(statusColors).forEach(([status, color]) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    const colorBox = document.createElement("span");
    colorBox.className = "legend-color";
    colorBox.style.backgroundColor = color;
    const label = document.createElement("span");
    label.className = "legend-label";
    label.textContent = status;
    item.appendChild(colorBox);
    item.appendChild(label);
    legendContainer.appendChild(item);
  });
}

// --- Search tile handlers ---
document.addEventListener("DOMContentLoaded", async () => {
  buildLegend();
  await loadDataFromAPI();

  const searchTile = document.querySelector(".search-tile");
  const iconWrap = searchTile.querySelector(".search-icon-wrap");
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");

  function showSearch() {
    searchTile.classList.add("expanded");
    iconWrap.classList.add("hidden");
    searchForm.classList.remove("hidden");
    setTimeout(() => searchInput.focus(), 50);
  }
  function hideSearch() {
    searchTile.classList.remove("expanded");
    searchForm.classList.add("hidden");
    iconWrap.classList.remove("hidden");
    searchInput.value = "";
  }

  iconWrap.addEventListener("click", (ev) => {
    ev.stopPropagation();
    showSearch();
  });

  searchForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    const button = document.getElementById("searchButton");
    const spinner = button.querySelector(".spinner");

    // Show spinner after 1s delay
    const spinnerTimeout = setTimeout(() => {
      spinner.classList.remove("hidden");
    }, 1000);

    try {
      // 🔹 Call Render backend instead of local Node
      const RENDER_BACKEND_URL = isLocalhost ? "http://localhost:3000" : "https://render-backend-g0u7.onrender.com"; // replace with your Render URL
      const response = await fetch(`${RENDER_BACKEND_URL}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: query }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Handle "no record" / resolution failure
      if (data && data.success === false) {
        searchInput.value = data.message || `No known record of '${query}'`;
        searchInput.focus();
        return;
      }

      // Determine the standardized key to use for map coloring
      const standardizedKey = data.normalizedSubstance;
      const labelText = data.resolved_name || data.canonical_name || standardizedKey;

      // Refresh cached data from Supabase
      await loadDataFromAPI();

      if (tileData[standardizedKey]) {
        updateMapColors(standardizedKey);

        // Replace magnifying glass with standardized substance name
        const label = document.createElement("span");
        label.className = "substance-label";
        label.textContent = labelText;

        iconWrap.innerHTML = "";
        iconWrap.appendChild(label);

        searchTile.classList.add("active");
        setTimeout(() => searchTile.classList.remove("active"), 1200);
      } else {
        alert(`"${standardizedKey}" was processed, but no map data is available yet.`);
      }
    } catch (err) {
      console.error("Search failed:", err);
      alert(`Failed to fetch data for "${query}". Please try again later.`);
    } finally {
      clearTimeout(spinnerTimeout);
      spinner.classList.add("hidden");
      hideSearch();
    }
  });


  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !searchForm.classList.contains("hidden")) {
      hideSearch();
    }
  });
});
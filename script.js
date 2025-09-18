// --- Mapbox Setup ---
const isLocalhost = window.location.hostname === "localhost";

mapboxgl.accessToken = isLocalhost
  ? "pk.eyJ1IjoiYm5jNHZrIiwiYSI6ImNtZmtuNzExZTBma2YyaXB5N2V3cnNqZHYifQ.81pi_QteF8dXpaLdAgAcbA"
  : "pk.eyJ1IjoiYm5jNHZrIiwiYSI6ImNtZmttd2l0NDBlcmgybXB6engyZ3NsOXMifQ.ispasH40DZiTItGPC7EuQQ";

const isMobile = window.innerWidth <= 500;
const mapCenter = isMobile ? [-50, 30] : [0, 20];
const zoomLevel = isMobile ? 0.8 : 1.3;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: mapCenter,
  zoom: zoomLevel,
  projection: 'mercator'
});

map.addControl(new mapboxgl.NavigationControl());

// --- Configurations ---
const statusColors = {
  "Unknown": "#666666",
  "Banned": "#e74c3c",
  "Limited Access Trials": "#f1c40f",
  "Approved Medical Use": "#27ae60"
};

let tileData = {};

const SUPABASE_URL = 'https://upmsuqgcepaoeanexaao.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwbXN1cWdjZXBhb2VhbmV4YWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMzM2MzYsImV4cCI6MjA3MzYwOTYzNn0.-zWDeKMsisZWkHHy8-DeZ5utUeO4iRO6gZI7kxgPRh4';

// --- Load data from Supabase (used to color map) ---
async function loadDataFromAPI() {
  try {
    console.log("Loading data from Supabase...");
    const response = await fetch(`${SUPABASE_URL}/rest/v1/psychedelic_access?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const rawData = await response.json();
    tileData = transformDataStructure(rawData);
    console.log("Data loaded:", Object.keys(tileData).slice(0,6));
    return tileData;
  } catch (error) {
    console.error("Failed to load data from API:", error);
    return {};
  }
}

function transformDataStructure(rawData) {
  const transformed = {};
  rawData.forEach(row => {
    const { substance, country_code, access_status } = row;
    if (!transformed[substance]) transformed[substance] = {};
    transformed[substance][country_code] = access_status;
  });
  Object.keys(transformed).forEach(substance => {
    if (!transformed[substance].DEFAULT) transformed[substance].DEFAULT = "Unknown";
  });
  return transformed;
}

// --- Dark Mode (keeps your previous behavior) ---
const hour = new Date().getHours();
if (hour >= 19 || hour < 7) document.body.classList.add('dark-mode');

// --- Map layer + coloring logic ---
map.on('style.load', () => {
  // hide Mapbox default labels
  map.getStyle().layers.forEach((layer) => {
    if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
      try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch (e) {}
    }
  });
});

map.on('load', () => {
  map.addSource('countries', { type: 'vector', url: 'mapbox://mapbox.country-boundaries-v1' });
  map.addLayer({
    id: 'countries',
    type: 'fill',
    source: 'countries',
    'source-layer': 'country_boundaries',
    paint: { 'fill-color': statusColors["Unknown"], 'fill-opacity': 0.8 }
  });
});

function updateMapColors(drugKey) {
  if (!map.getLayer('countries')) {
    console.warn("Countries layer not ready");
    return;
  }
  const drugData = tileData[drugKey];
  if (!drugData) {
    console.warn(`No data for: ${drugKey}`);
    return;
  }
  const entries = Object.entries(drugData).flatMap(([code, status]) => [
    code,
    statusColors[status] || statusColors["Unknown"]
  ]);
  map.setPaintProperty('countries', 'fill-color', [
    'match',
    ['slice', ['get', 'iso_3166_1'], 0, 2],
    ...entries,
    statusColors["Unknown"]
  ]);
}

// --- Legend builder (unchanged) ---
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

document.addEventListener("DOMContentLoaded", async () => {
  buildLegend();
  await loadDataFromAPI();

  // Pre-populated tiles
  document.querySelectorAll('.tile[data-key]').forEach(tile => {
    tile.addEventListener('click', () => {
      const drugKey = tile.dataset.key;
      if (!drugKey) return;
      updateMapColors(drugKey);
      document.querySelectorAll('.tile').forEach(t => t.classList.remove('active'));
      tile.classList.add('active');
    });
  });

  // Search tile
  const searchTile = document.querySelector('.search-tile');
  const iconWrap = searchTile.querySelector('.search-icon-wrap');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');

  function showSearch() {
    searchTile.classList.add('expanded');
    iconWrap.classList.add('hidden');
    searchForm.classList.remove('hidden');
    setTimeout(() => searchInput.focus(), 50);
  }
  function hideSearch() {
    searchTile.classList.remove('expanded');
    searchForm.classList.add('hidden');
    iconWrap.classList.remove('hidden');
    searchInput.value = "";
  }

  // Show form on click
  iconWrap.addEventListener('click', (ev) => {
    ev.stopPropagation();
    showSearch();
  });

  // Submit
  searchForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;
    console.log("Search requested for:", query);

    if (tileData[query]) {
      updateMapColors(query);
      document.querySelectorAll('.tile').forEach(t => t.classList.remove('active'));
      searchTile.classList.add('active');
      setTimeout(() => searchTile.classList.remove('active'), 1200);
    } else {
      alert(`No local data for "${query}". Backend integration goes here.`);
    }

    hideSearch();
  });

  // Escape key hides the form
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !searchForm.classList.contains('hidden')) {
      hideSearch();
    }
  });
});

// Optional: refresh data periodically
setInterval(async () => {
  console.log("Refreshing data...");
  await loadDataFromAPI();
}, 5 * 60 * 1000);

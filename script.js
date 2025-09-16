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
    "Prohibited": "#e74c3c",
    "Limited Access Trials": "#f1c40f",
    "Expanded Access": "#3498db",
    "Approved Medical Use": "#27ae60",
    "Decriminalized (Not Approved for Medical Use)": "#9B59B6"
};

// Global dataset (now loaded from API)
let tileData = {};

// --- Supabase Configuration ---
const SUPABASE_URL = 'https://upmsuqgcepaoeanexaao.supabase.co'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwbXN1cWdjZXBhb2VhbmV4YWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMzM2MzYsImV4cCI6MjA3MzYwOTYzNn0.-zWDeKMsisZWkHHy8-DeZ5utUeO4iRO6gZI7kxgPRh4'; // Replace with your anon key

// --- API Data Loading ---
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

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const rawData = await response.json();
        
        // Transform flat array into nested object structure
        tileData = transformDataStructure(rawData);
        
        console.log("Data loaded successfully:", tileData);
        return tileData;
        
    } catch (error) {
        console.error("Failed to load data from API:", error);
        
        // Fallback to static data if API fails
        return loadFallbackData();
    }
}

// Transform database rows into the expected nested structure
function transformDataStructure(rawData) {
    const transformed = {};
    
    rawData.forEach(row => {
        const { substance, country_code, access_status } = row;
        
        if (!transformed[substance]) {
            transformed[substance] = {};
        }
        
        transformed[substance][country_code] = access_status;
    });
    
    // Add DEFAULT values if needed
    Object.keys(transformed).forEach(substance => {
        if (!transformed[substance].DEFAULT) {
            transformed[substance].DEFAULT = "Unknown";
        }
    });
    
    return transformed;
}

// Fallback to static data (your original data.json approach)
async function loadFallbackData() {
    try {
        console.log("Using fallback data...");
        const response = await fetch('data.json');
        return await response.json();
    } catch (error) {
        console.error("Fallback data also failed:", error);
        return {}; // Return empty object if both fail
    }
}

// --- Dark Mode ---
const hour = new Date().getHours();
if (hour >= 19 || hour < 7) {
    document.body.classList.add('dark-mode');
}

// --- Functions ---
function updateMapColors(drugKey) {
    if (!map.getLayer('countries')) {
        console.warn("Countries layer not ready yet");
        return;
    }

    if (drugKey === "Search") {
        map.setPaintProperty('countries', 'fill-color', '#e74c3c');
        console.log('Search tile clicked → all countries red');
        return;
    }

    const drugData = tileData[drugKey];
    if (!drugData) {
        console.warn(`No data found for key: ${drugKey}`);
        return;
    }

    // Build Mapbox match expression
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

// --- Map Load ---
map.on('style.load', () => {
    map.getStyle().layers.forEach((layer) => {
        if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
            try {
                map.setLayoutProperty(layer.id, 'visibility', 'none');
            } catch (e) {}
        }
    });
});

map.on('load', () => {
    map.addSource('countries', {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1'
    });

    map.addLayer({
        id: 'countries',
        type: 'fill',
        source: 'countries',
        'source-layer': 'country_boundaries',
        paint: {
            'fill-color': statusColors["Unknown"],
            'fill-opacity': 0.8
        }
    });
});

// --- Tile Event Handlers ---
document.querySelectorAll('.tile').forEach(tile => {
    tile.addEventListener('click', () => {
        const drugKey = tile.dataset.key || "Search";
        updateMapColors(drugKey);

        document.querySelectorAll('.tile').forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
    });
});

// Build legend dynamically
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

// --- Initialize Application ---
document.addEventListener("DOMContentLoaded", async () => {
    buildLegend();
    
    // Load data from API on page load
    await loadDataFromAPI();
});

// Optional: Refresh data periodically (every 5 minutes)
setInterval(async () => {
    console.log("Refreshing data...");
    await loadDataFromAPI();
}, 5 * 60 * 1000); // 5 minutes
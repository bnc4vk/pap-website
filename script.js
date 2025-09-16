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
    center: mapCenter, // Centered near Africa for global view
    zoom: zoomLevel,
    projection: 'mercator'
});

map.addControl(new mapboxgl.NavigationControl());

// --- Configurations ---
const statusColors = {
    "Unknown": "#666666",              // neutral grey
    "Prohibited": "#e74c3c",           // strong red
    "Limited Access Trials": "#f1c40f",// bright amber/yellow
    "Expanded Access": "#3498db",      // calm blue
    "Approved Medical Use": "#27ae60",  // strong green
    "Decriminalized (Not Approved for Medical Use)": "#9B59B6"
};

// Global dataset (loaded from data.json)
let tileData = {};

// --- Load Data ---
fetch('data.json')
    .then(response => response.json())
    .then(data => {
        tileData = data;
        console.log("Data loaded:", tileData);
    })
    .catch(err => console.error("Failed to load data.json:", err));


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
        // Test case: recolor everything red
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
        ['slice', ['get', 'iso_3166_1'], 0, 2], // Match first 2 letters of code
        ...entries,
        statusColors["Unknown"] // Fallback
    ]);
}

// --- Map Load ---
map.on('style.load', () => {
    // Hide text labels
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

        // Update active state
        document.querySelectorAll('.tile').forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
    });
});

// Build legend dynamically
function buildLegend() {
    const legendContainer = document.getElementById("legend");
    legendContainer.innerHTML = ""; // clear any existing content

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

// Run after page + map load
document.addEventListener("DOMContentLoaded", buildLegend);


// script.js

const start = [88.3428, 22.5829]; // Howrah Railway Station [lon, lat]
const end   = [88.3989, 22.5909]; // Lalbagh [lon, lat]

let map, marker, basePolyline, activePolyline, route = [];
let destinationMarker = null;
let animation = { running: false, idx: 0, segmentStart: null, speedMultiplier: 1, _lastNow: null };
let lastTimestamp = null, elapsedMs = 0;

// Convert to [lat, lon]
function fromLatLng(point) {
  return [point.latitude, point.longitude];
}

// Bearing for rotation
function computeBearing(a, b) {
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
  const brng = Math.atan2(y, x);
  return (brng * 180 / Math.PI + 360) % 360;
}

// Init map
function initMap(center) {
  map = L.map('map').setView(center, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  basePolyline = L.polyline([], { color: '#aaa', weight: 3, dashArray: '5,8' }).addTo(map);
  activePolyline = L.polyline([], { color: '#1976d2', weight: 6, opacity: 0.8 }).addTo(map);
}

// Draw route
function drawFullRoute(route) {
  basePolyline.setLatLngs(route.map(fromLatLng));
}

// Car marker
function createMarker(center) {
  const carIcon = L.divIcon({
    html: `<img src="car2.png" id="carIcon" style="width:40px; transform: rotate(0deg);">`,
    iconSize: [40, 40],
    className: ""
  });
  marker = L.marker(center, { icon: carIcon }).addTo(map);
}

// Destination marker
function addDestinationMarker(position) {
  const destIcon = L.icon({
    iconUrl: "marker2.png",   
    iconSize: [40, 40],       
    iconAnchor: [20, 40],     
    popupAnchor: [0, -40]     
  });

  // Remove old destination marker if it exists
  if (destinationMarker) {
    map.removeLayer(destinationMarker);
  }

  destinationMarker = L.marker(fromLatLng(position), { icon: destIcon }).addTo(map);
}


// Update info
function updateInfoDisplay(position, speed) {
  document.getElementById('coords').textContent = `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
  document.getElementById('timestamp').textContent = position.timestamp || '—';

  const elapsedSec = Math.floor(elapsedMs / 1000);
  const min = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const sec = String(elapsedSec % 60).padStart(2, '0');
  document.getElementById('elapsed').textContent = `${min}:${sec}`;

  document.getElementById('speed').textContent = speed ? speed.toFixed(2) : '—';
}

// Compute speed
function computeSpeedBetween(a, b) {
  if (!a.timestamp || !b.timestamp) return null;
  const t1 = new Date(a.timestamp).getTime();
  const t2 = new Date(b.timestamp).getTime();
  const dtHours = (t2 - t1) / 3600000;
  if (dtHours <= 0) return null;

  const R = 6371;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const hav = Math.sin(dLat/2)**2 + Math.sin(dLon/2)**2 * Math.cos(lat1) * Math.cos(lat2);
  const d = 2 * R * Math.asin(Math.sqrt(hav));
  return d / dtHours;
}

// Easing function for smooth motion
const easeInOut = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;

// Animation loop
function step(now) {
  if (!animation.running) return;
  if (animation.idx >= route.length - 1) {
    animation.running = false;
    return;
  }

  const a = route[animation.idx];
  const b = route[animation.idx + 1];

  if (!animation.segmentStart) animation.segmentStart = now;
  const duration = (new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) / animation.speedMultiplier;
  let u = Math.min(1, (now - animation.segmentStart) / duration);
  u = easeInOut(u);

  const lat = a.latitude + u * (b.latitude - a.latitude);
  const lng = a.longitude + u * (b.longitude - a.longitude);
  const position = { latitude: lat, longitude: lng, timestamp: b.timestamp };

  marker.setLatLng(fromLatLng(position));

  const angle = computeBearing(a, b);
  document.getElementById("carIcon").style.transform = `rotate(${angle}deg)`;

  if (activePolyline.getLatLngs().length === 0) {
    activePolyline.addLatLng(fromLatLng(a));
  }
  activePolyline.addLatLng(fromLatLng(position));

  if (lastTimestamp == null && a.timestamp) lastTimestamp = new Date(a.timestamp).getTime();
  if (a.timestamp && b.timestamp) {
    elapsedMs = Math.max(0, new Date(b.timestamp).getTime() - lastTimestamp);
  } else {
    elapsedMs += now - (animation._lastNow || now);
  }
  animation._lastNow = now;

  const instSpeed = computeSpeedBetween(a, b);
  updateInfoDisplay(position, instSpeed);

  if (u >= 1) {
    animation.idx += 1;
    animation.segmentStart = now;
  }
  requestAnimationFrame(step);
}

// Controls
function startAnimation() {
  if (!animation.running) {
    animation.running = true;
    animation.segmentStart = null;
    requestAnimationFrame(step);
  }
}
function pauseAnimation() { animation.running = false; }

function setupControls() {
  const btn = document.getElementById('playPauseBtn');
  btn.addEventListener('click', () => {
    if (animation.running) { pauseAnimation(); btn.innerText = 'Play'; }
    else { startAnimation(); btn.innerText = 'Pause'; }
  });
  const speedRange = document.getElementById('speedRange');
  speedRange.addEventListener('input', (e) => {
    animation.speedMultiplier = parseFloat(e.target.value);
  });
}

// Fetch route
async function getRoute() {
  const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.routes || data.routes.length === 0) {
    alert("No route found");
    return [];
  }

  const coords = data.routes[0].geometry.coordinates;
  return coords.map((c, i) => ({
    latitude: c[1],
    longitude: c[0],
    timestamp: new Date(Date.now() + i * 5000).toISOString()
  }));
}

// Main
async function main() {
  route = await getRoute();
  if (!route.length) return;

  const center = fromLatLng(route[0]);
  initMap(center);
  drawFullRoute(route);
  createMarker(center);
  addDestinationMarker(route[route.length - 1]);

  map.fitBounds(basePolyline.getBounds(), { padding: [50, 50] });
  setupControls();
  updateInfoDisplay(route[0], null);
}

main();

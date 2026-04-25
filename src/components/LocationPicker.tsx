import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default icon issue with webpack/vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface LocationPickerProps {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
}

function LocationMarker({ position, onChange }: { position: L.LatLng | null; onChange: (pos: L.LatLng) => void }) {
  const map = useMapEvents({
    click(e) {
      onChange(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return position === null ? null : (
    <Marker position={position} />
  );
}

export default function LocationPicker({ lat, lng, onChange }: LocationPickerProps) {
  // Koordinatlar verilmemişse Edirne merkez koordinatları
  const defaultPosition: [number, number] = [41.6771, 26.5557];
  const positionStr = lat && lng ? [lat, lng] : null;

  const [position, setPosition] = useState<L.LatLng | null>(positionStr ? new L.LatLng(positionStr[0], positionStr[1]) : null);

  const handlePositionChange = (newPos: L.LatLng) => {
    setPosition(newPos);
    onChange(newPos.lat, newPos.lng);
  };

  return (
    <div className="h-64 w-full rounded-2xl overflow-hidden border border-gray-200">
      <MapContainer
        center={positionStr ? (positionStr as [number, number]) : defaultPosition}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker position={position} onChange={handlePositionChange} />
      </MapContainer>
    </div>
  );
}

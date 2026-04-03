/**
 * Geocoding service using Nominatim (OpenStreetMap)
 */

import { EDIRNE_VILLAGES, EDIRNE_NEIGHBORHOOD_COORDS } from '../constants/edirne_data';

export interface GeocodeResult {
  lat: number;
  lng: number;
  display_name?: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let isProxyAvailable = true; // Track if the server-side proxy exists

export async function geocodeAddress(address: string, neighborhood?: string): Promise<GeocodeResult | null> {
  const upperAddress = address?.toLocaleUpperCase('tr-TR') || '';
  const upperNeighborhood = neighborhood?.toLocaleUpperCase('tr-TR') || '';

  // 1. Check if it's a village
  for (const [village, coords] of Object.entries(EDIRNE_VILLAGES)) {
    const vUpper = village.toLocaleUpperCase('tr-TR');
    if (upperNeighborhood === vUpper || upperAddress.includes(vUpper)) {
      return { 
        lat: coords[0] + (Math.random() - 0.5) * 0.0005, 
        lng: coords[1] + (Math.random() - 0.5) * 0.0005, 
        display_name: `${village} Köyü, Edirne` 
      };
    }
  }

  // 2. Check if it's a neighborhood
  if (neighborhood && EDIRNE_NEIGHBORHOOD_COORDS[neighborhood]) {
    const coords = EDIRNE_NEIGHBORHOOD_COORDS[neighborhood];
    return { 
      lat: coords[0] + (Math.random() - 0.5) * 0.001, 
      lng: coords[1] + (Math.random() - 0.5) * 0.001,
      display_name: `${neighborhood} Mah., Edirne`
    };
  }

  // 3. Try to find neighborhood in address string if not explicitly provided
  for (const [n, coords] of Object.entries(EDIRNE_NEIGHBORHOOD_COORDS)) {
    if (upperAddress.includes(n.toLocaleUpperCase('tr-TR'))) {
      return { 
        lat: coords[0] + (Math.random() - 0.5) * 0.001, 
        lng: coords[1] + (Math.random() - 0.5) * 0.001,
        display_name: `${n} Mah., Edirne`
      };
    }
  }

  // 4. Default fallback to Edirne Center
  return { lat: 41.675, lng: 26.570, display_name: 'Edirne Merkez' };
}

let lastStatus = 0;

async function fetchProxyGeocode(query: string): Promise<GeocodeResult | null> {
  if (!isProxyAvailable) return null;

  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    lastStatus = response.status;

    if (response.status === 404) {
      console.warn('Geocoding proxy not found (404). Running in offline-only mode.');
      isProxyAvailable = false;
      return null;
    }

    if (response.status === 429) {
      console.warn('Geocoding proxy rate limit hit.');
      return null;
    }

    if (!response.ok) return null;

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        display_name: data[0].display_name
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

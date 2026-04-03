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
  if (!address) return null;

  const upperAddress = address.toLocaleUpperCase('tr-TR');
  const upperNeighborhood = neighborhood?.toLocaleUpperCase('tr-TR');

  // 1. OFFLINE-FIRST: Check villages (High priority)
  // Check if neighborhood is a village OR if address contains village name
  for (const [village, coords] of Object.entries(EDIRNE_VILLAGES)) {
    const vUpper = village.toLocaleUpperCase('tr-TR');
    if (upperNeighborhood === vUpper || upperAddress.includes(vUpper)) {
      return { 
        lat: coords[0] + (Math.random() - 0.5) * 0.001, 
        lng: coords[1] + (Math.random() - 0.5) * 0.001, 
        display_name: `${village} Köyü, Edirne (Yerel Veri)` 
      };
    }
  }

  // 2. PREPARE FALLBACK: Neighborhood center
  let neighborhoodFallback: GeocodeResult | null = null;
  if (neighborhood && EDIRNE_NEIGHBORHOOD_COORDS[neighborhood]) {
    const coords = EDIRNE_NEIGHBORHOOD_COORDS[neighborhood];
    neighborhoodFallback = { 
      lat: coords[0] + (Math.random() - 0.5) * 0.004, 
      lng: coords[1] + (Math.random() - 0.5) * 0.004,
      display_name: `${neighborhood} Mah., Edirne (Mahalle Merkezi)`
    };
  } else {
    // Try to find neighborhood in address string if not provided
    for (const [n, coords] of Object.entries(EDIRNE_NEIGHBORHOOD_COORDS)) {
      if (upperAddress.includes(n.toLocaleUpperCase('tr-TR'))) {
        neighborhoodFallback = { 
          lat: coords[0] + (Math.random() - 0.5) * 0.004, 
          lng: coords[1] + (Math.random() - 0.5) * 0.004,
          display_name: `${n} Mah., Edirne (Mahalle Merkezi)`
        };
        break;
      }
    }
  }

  // 3. ONLINE CHECK (Only if proxy is likely available and we want street precision)
  if (isProxyAvailable) {
    try {
      // Build a better query using neighborhood context
      let query = address;
      if (neighborhood && !upperAddress.includes(upperNeighborhood!)) {
        query = `${neighborhood} Mah. ${address}`;
      }
      query = `${query}, Edirne, Turkey`;

      let result = await fetchProxyGeocode(query);
      if (result) return result;

      // If we got a 404 or 429, fetchProxyGeocode handles it and we use fallback
      if (!isProxyAvailable) return neighborhoodFallback;

      await delay(1000);
      
      // Try API with cleaned address
      const cleanedAddress = address
        .replace(/No:\s*\d+[a-z]?(\/\d+)?/gi, '')
        .replace(/Daire:\s*\d+/gi, '')
        .replace(/\(.*\)/g, '')
        .trim();
      
      if (cleanedAddress !== address && cleanedAddress.length > 5) {
        let cleanQuery = cleanedAddress;
        if (neighborhood) cleanQuery = `${neighborhood} Mah. ${cleanedAddress}`;
        cleanQuery = `${cleanQuery}, Edirne, Turkey`;
        
        result = await fetchProxyGeocode(cleanQuery);
        if (result) return result;
      }
    } catch (error) {
      console.error('Geocoding API error, switching to offline mode');
    }
  }

  // 4. FINAL FALLBACK
  return neighborhoodFallback || { lat: 41.675, lng: 26.570, display_name: 'Edirne Merkez' };
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

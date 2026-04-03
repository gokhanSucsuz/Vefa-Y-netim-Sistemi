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

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address) return null;

  // 1. OFFLINE CHECK: Try to find village or neighborhood in the address string
  const upperAddress = address.toLocaleUpperCase('tr-TR');
  
  // Check villages
  for (const [village, coords] of Object.entries(EDIRNE_VILLAGES)) {
    if (upperAddress.includes(village.toLocaleUpperCase('tr-TR'))) {
      return { lat: coords[0], lng: coords[1], display_name: `${village} Köyü, Edirne` };
    }
  }

  // Check neighborhoods
  for (const [neighborhood, coords] of Object.entries(EDIRNE_NEIGHBORHOOD_COORDS)) {
    if (upperAddress.includes(neighborhood.toLocaleUpperCase('tr-TR'))) {
      // If it's a neighborhood, we still want to try API for exact street, 
      // but we have a very good fallback.
      // For now, let's proceed to API but keep this in mind.
    }
  }

  try {
    // 2. API CHECK via Server Proxy (to avoid CORS and manage rate limits)
    let query = `${address}, Edirne, Turkey`;
    let result = await fetchProxyGeocode(query);
    
    // If we hit rate limit, don't keep trying API, just use fallback
    if (result === null && lastStatus === 429) {
      return getNeighborhoodFallback(upperAddress);
    }

    if (result) return result;

    await delay(1200); // Respect rate limit
    
    // 3. CLEANED QUERY
    const cleanedAddress = address
      .replace(/No:\s*\d+/gi, '')
      .replace(/Daire:\s*\d+/gi, '')
      .replace(/\(.*\)/g, '')
      .trim();
    
    if (cleanedAddress !== address) {
      query = `${cleanedAddress}, Edirne, Turkey`;
      result = await fetchProxyGeocode(query);
      if (result) return result;
    }

    // 4. FINAL FALLBACK: Neighborhood center
    return getNeighborhoodFallback(upperAddress);
  } catch (error) {
    console.error('Geocoding error:', error);
    return getNeighborhoodFallback(upperAddress);
  }
}

function getNeighborhoodFallback(upperAddress: string): GeocodeResult | null {
  for (const [neighborhood, coords] of Object.entries(EDIRNE_NEIGHBORHOOD_COORDS)) {
    if (upperAddress.includes(neighborhood.toLocaleUpperCase('tr-TR'))) {
      return { 
        lat: coords[0] + (Math.random() - 0.5) * 0.005, 
        lng: coords[1] + (Math.random() - 0.5) * 0.005,
        display_name: `${neighborhood} Mah., Edirne (Yaklaşık)`
      };
    }
  }
  return null;
}

let lastStatus = 0;

async function fetchProxyGeocode(query: string): Promise<GeocodeResult | null> {
  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    lastStatus = response.status;

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

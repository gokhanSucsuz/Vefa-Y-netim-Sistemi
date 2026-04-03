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

  const upperAddress = address.toLocaleUpperCase('tr-TR');

  try {
    // 1. Try API with full address first for maximum precision
    let query = `${address}, Edirne, Turkey`;
    let result = await fetchProxyGeocode(query);
    if (result) return result;

    await delay(1200); // Respect rate limit
    
    // 2. Try API with cleaned address (remove No, Daire, etc.)
    const cleanedAddress = address
      .replace(/No:\s*\d+[a-z]?(\/\d+)?/gi, '')
      .replace(/Daire:\s*\d+/gi, '')
      .replace(/Kat:\s*\d+/gi, '')
      .replace(/\(.*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleanedAddress !== address && cleanedAddress.length > 5) {
      query = `${cleanedAddress}, Edirne, Turkey`;
      result = await fetchProxyGeocode(query);
      if (result) return result;
      await delay(1200);
    }

    // 3. Try simplifying to just Neighborhood and Street
    // Pattern: "X Mah. Y Sok."
    const mahMatch = address.match(/([a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s]+Mah\.)/i);
    const streetMatch = address.match(/([a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s]+(Cad\.|Sok\.|Bulvarı|Sokağı|Caddesi))/i);
    
    if (mahMatch && streetMatch) {
      query = `${mahMatch[0]} ${streetMatch[0]}, Edirne, Turkey`;
      result = await fetchProxyGeocode(query);
      if (result) return result;
      await delay(1200);
    }

    // 4. OFFLINE FALLBACK: If API fails, use our local database
    
    // Check villages (High priority for villages as they often fail in API)
    for (const [village, coords] of Object.entries(EDIRNE_VILLAGES)) {
      if (upperAddress.includes(village.toLocaleUpperCase('tr-TR'))) {
        return { 
          lat: coords[0] + (Math.random() - 0.5) * 0.002, 
          lng: coords[1] + (Math.random() - 0.5) * 0.002, 
          display_name: `${village} Köyü, Edirne (Yerel Veri)` 
        };
      }
    }

    // Check neighborhoods center
    for (const [neighborhood, coords] of Object.entries(EDIRNE_NEIGHBORHOOD_COORDS)) {
      if (upperAddress.includes(neighborhood.toLocaleUpperCase('tr-TR'))) {
        return { 
          lat: coords[0] + (Math.random() - 0.5) * 0.005, 
          lng: coords[1] + (Math.random() - 0.5) * 0.005,
          display_name: `${neighborhood} Mah., Edirne (Mahalle Merkezi)`
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    // Final attempt at fallback on error
    for (const [neighborhood, coords] of Object.entries(EDIRNE_NEIGHBORHOOD_COORDS)) {
      if (upperAddress.includes(neighborhood.toLocaleUpperCase('tr-TR'))) {
        return { lat: coords[0], lng: coords[1] };
      }
    }
    return null;
  }
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

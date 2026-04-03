/**
 * Geocoding service using Nominatim (OpenStreetMap)
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  display_name?: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address) return null;

  try {
    // We append "Edirne, Turkey" to improve accuracy for this specific app
    const query = encodeURIComponent(`${address}, Edirne, Turkey`);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
      headers: {
        'Accept-Language': 'tr'
      }
    });

    if (!response.ok) {
      throw new Error('Geocoding request failed');
    }

    const data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        display_name: data[0].display_name
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

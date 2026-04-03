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
    // 1. Try with full address
    let query = `${address}, Edirne, Turkey`;
    let result = await fetchNominatim(query);
    if (result) return result;

    // 2. Try cleaning up the address (remove "No: X", "Daire: Y")
    const cleanedAddress = address
      .replace(/No:\s*\d+/gi, '')
      .replace(/Daire:\s*\d+/gi, '')
      .replace(/\(.*\)/g, '')
      .trim();
    
    if (cleanedAddress !== address) {
      query = `${cleanedAddress}, Edirne, Turkey`;
      result = await fetchNominatim(query);
      if (result) return result;
    }

    // 3. Try just the neighborhood and street if we can extract them
    // Pattern: "X Mah. Y Sok." or "X Mah. Y Cad."
    const mahMatch = address.match(/([a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s]+Mah\.)/i);
    const cadMatch = address.match(/([a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s]+(Cad\.|Sok\.|Bulvarı))/i);
    
    if (mahMatch || cadMatch) {
      const simplified = `${mahMatch ? mahMatch[0] : ''} ${cadMatch ? cadMatch[0] : ''}`.trim();
      if (simplified) {
        query = `${simplified}, Edirne, Turkey`;
        result = await fetchNominatim(query);
        if (result) return result;
      }
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

async function fetchNominatim(query: string): Promise<GeocodeResult | null> {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
      headers: {
        'Accept-Language': 'tr',
        'User-Agent': 'EdirneSYDV-Vefa-App'
      }
    });

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

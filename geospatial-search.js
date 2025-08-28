/**
 * Geospatial Search Module
 * Provides location-based proximity search functionality
 */

/**
 * Calculate the distance between two points using the Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return Infinity;
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Parse location string to extract coordinates
 * Supports formats like "lat,lon" or "latitude,longitude"
 * @param {string} locationStr - Location string
 * @returns {object|null} Object with lat and lon properties, or null if invalid
 */
function parseLocation(locationStr) {
  if (!locationStr || typeof locationStr !== 'string') {
    return null;
  }

  // Remove any extra whitespace and split by comma
  const parts = locationStr.trim().split(',');
  
  if (parts.length !== 2) {
    return null;
  }

  const lat = parseFloat(parts[0].trim());
  const lon = parseFloat(parts[1].trim());

  // Validate latitude and longitude ranges
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }

  return { lat, lon };
}

/**
 * Extract coordinates from various location fields
 * @param {object} record - Database record
 * @returns {object|null} Coordinates object or null
 */
function extractCoordinates(record) {
  // Try different possible coordinate fields
  const coordinateFields = ['coordinates', 'location_coordinates', 'lat_lon', 'position'];
  
  for (const field of coordinateFields) {
    if (record[field]) {
      const coords = parseLocation(record[field]);
      if (coords) {
        return coords;
      }
    }
  }

  // Try separate lat/lon fields
  if (record.latitude && record.longitude) {
    const lat = parseFloat(record.latitude);
    const lon = parseFloat(record.longitude);
    
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
  }

  return null;
}

/**
 * Filter records by proximity to a given location
 * @param {Array} records - Array of database records
 * @param {number} centerLat - Center latitude
 * @param {number} centerLon - Center longitude
 * @param {number} radiusKm - Search radius in kilometers
 * @returns {Array} Filtered records with distance information
 */
function filterByProximity(records, centerLat, centerLon, radiusKm = 10) {
  if (!records || !Array.isArray(records)) {
    return [];
  }

  const results = [];

  for (const record of records) {
    const coords = extractCoordinates(record);
    
    if (coords) {
      const distance = calculateDistance(centerLat, centerLon, coords.lat, coords.lon);
      
      if (distance <= radiusKm) {
        results.push({
          ...record,
          distance_km: Math.round(distance * 100) / 100, // Round to 2 decimal places
          coordinates: coords
        });
      }
    }
  }

  // Sort by distance (closest first)
  results.sort((a, b) => a.distance_km - b.distance_km);
  
  return results;
}

/**
 * Create a bounding box for efficient database queries
 * @param {number} centerLat - Center latitude
 * @param {number} centerLon - Center longitude
 * @param {number} radiusKm - Search radius in kilometers
 * @returns {object} Bounding box with min/max lat/lon
 */
function createBoundingBox(centerLat, centerLon, radiusKm) {
  // Approximate degrees per kilometer
  const latDegreePerKm = 1 / 111.32;
  const lonDegreePerKm = 1 / (111.32 * Math.cos(toRadians(centerLat)));
  
  const latOffset = radiusKm * latDegreePerKm;
  const lonOffset = radiusKm * lonDegreePerKm;
  
  return {
    minLat: centerLat - latOffset,
    maxLat: centerLat + latOffset,
    minLon: centerLon - lonOffset,
    maxLon: centerLon + lonOffset
  };
}

/**
 * Generate SQL WHERE conditions for bounding box search
 * @param {object} boundingBox - Bounding box object
 * @param {string} latField - Name of latitude field in database
 * @param {string} lonField - Name of longitude field in database
 * @returns {object} SQL condition and parameters
 */
function getBoundingBoxSQL(boundingBox, latField = 'latitude', lonField = 'longitude') {
  const condition = `(${latField} BETWEEN ? AND ? AND ${lonField} BETWEEN ? AND ?)`;
  const params = [boundingBox.minLat, boundingBox.maxLat, boundingBox.minLon, boundingBox.maxLon];
  
  return { condition, params };
}

/**
 * Geocode a location string to coordinates (placeholder for future implementation)
 * @param {string} locationStr - Location string (e.g., "New York, NY")
 * @returns {Promise<object|null>} Coordinates object or null
 */
async function geocodeLocation(locationStr) {
  // This is a placeholder for geocoding functionality
  // In a real implementation, you would use a geocoding service like:
  // - Google Maps Geocoding API
  // - OpenStreetMap Nominatim
  // - MapBox Geocoding API
  
  console.log(`Geocoding not implemented for: ${locationStr}`);
  return null;
}

/**
 * Find nearby locations using city/region matching as fallback
 * @param {Array} records - Database records
 * @param {string} city - City name
 * @param {string} region - Region/state name
 * @param {string} country - Country name
 * @returns {Array} Matching records
 */
function findNearbyByLocation(records, city, region, country) {
  if (!records || !Array.isArray(records)) {
    return [];
  }

  return records.filter(record => {
    let matches = true;
    
    if (city && record.city) {
      matches = matches && record.city.toLowerCase().includes(city.toLowerCase());
    }
    
    if (region && record.region_state) {
      matches = matches && record.region_state.toLowerCase().includes(region.toLowerCase());
    }
    
    if (country && record.country) {
      matches = matches && record.country.toLowerCase().includes(country.toLowerCase());
    }
    
    return matches;
  });
}

module.exports = {
  calculateDistance,
  parseLocation,
  extractCoordinates,
  filterByProximity,
  createBoundingBox,
  getBoundingBoxSQL,
  geocodeLocation,
  findNearbyByLocation,
  toRadians
};
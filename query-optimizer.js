/**
 * Query Optimization Module
 * Provides caching, pagination, and performance optimization for search queries
 */

const NodeCache = require('node-cache');

// Create cache instance with 10 minute TTL
const searchCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

/**
 * Generate a cache key from search parameters
 * @param {object} params - Search parameters
 * @returns {string} Cache key
 */
function generateCacheKey(params) {
  const { query, type, country, region, city, fuzzy, threshold, phonetic, lat, lon, radius, page, limit } = params;
  
  const keyParts = [
    query || 'no-query',
    type || 'all',
    country || 'no-country',
    region || 'no-region', 
    city || 'no-city',
    fuzzy || 'false',
    threshold || '70',
    phonetic || 'false',
    lat || 'no-lat',
    lon || 'no-lon',
    radius || '10',
    page || '1',
    limit || '50'
  ];
  
  return `search:${keyParts.join(':')}`;
}

/**
 * Get cached search results
 * @param {object} params - Search parameters
 * @returns {object|null} Cached results or null
 */
function getCachedResults(params) {
  const cacheKey = generateCacheKey(params);
  return searchCache.get(cacheKey);
}

/**
 * Cache search results
 * @param {object} params - Search parameters
 * @param {object} results - Search results to cache
 * @param {number} ttl - Time to live in seconds (optional)
 */
function cacheResults(params, results, ttl = 600) {
  const cacheKey = generateCacheKey(params);
  searchCache.set(cacheKey, results, ttl);
}

/**
 * Clear cache for specific patterns
 * @param {string} pattern - Pattern to match cache keys
 */
function clearCache(pattern = null) {
  if (pattern) {
    const keys = searchCache.keys();
    const matchingKeys = keys.filter(key => key.includes(pattern));
    searchCache.del(matchingKeys);
  } else {
    searchCache.flushAll();
  }
}

/**
 * Paginate results
 * @param {Array} results - Array of results
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page
 * @returns {object} Paginated results with metadata
 */
function paginateResults(results, page = 1, limit = 50) {
  const totalItems = results.length;
  const totalPages = Math.ceil(totalItems / limit);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const offset = (currentPage - 1) * limit;
  
  const paginatedResults = results.slice(offset, offset + limit);
  
  return {
    data: paginatedResults,
    pagination: {
      current_page: currentPage,
      total_pages: totalPages,
      total_items: totalItems,
      items_per_page: limit,
      has_next: currentPage < totalPages,
      has_previous: currentPage > 1,
      next_page: currentPage < totalPages ? currentPage + 1 : null,
      previous_page: currentPage > 1 ? currentPage - 1 : null
    }
  };
}

/**
 * Optimize SQL query by adding proper ordering and limits
 * @param {string} baseQuery - Base SQL query
 * @param {object} options - Optimization options
 * @returns {string} Optimized query
 */
function optimizeQuery(baseQuery, options = {}) {
  const { orderBy = 'created_at DESC', limit = null, useIndex = true } = options;
  
  let optimizedQuery = baseQuery;
  
  // Add index hints for better performance (SQLite specific)
  if (useIndex && baseQuery.includes('WHERE')) {
    // SQLite will automatically use indexes, but we can add hints in comments
    optimizedQuery = `/* Use available indexes */ ${optimizedQuery}`;
  }
  
  // Add ordering if not already present
  if (!optimizedQuery.toLowerCase().includes('order by')) {
    optimizedQuery += ` ORDER BY ${orderBy}`;
  }
  
  // Add limit if specified
  if (limit && !optimizedQuery.toLowerCase().includes('limit')) {
    optimizedQuery += ` LIMIT ${limit}`;
  }
  
  return optimizedQuery;
}

/**
 * Get cache statistics
 * @returns {object} Cache statistics
 */
function getCacheStats() {
  return {
    keys: searchCache.keys().length,
    hits: searchCache.getStats().hits,
    misses: searchCache.getStats().misses,
    hit_rate: searchCache.getStats().hits / (searchCache.getStats().hits + searchCache.getStats().misses) || 0
  };
}

/**
 * Validate and sanitize pagination parameters
 * @param {string|number} page - Page number
 * @param {string|number} limit - Items per page
 * @returns {object} Validated parameters
 */
function validatePaginationParams(page, limit) {
  const validatedPage = Math.max(1, parseInt(page) || 1);
  const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 50)); // Max 100 items per page
  
  return {
    page: validatedPage,
    limit: validatedLimit
  };
}

/**
 * Create search performance metrics
 * @param {number} startTime - Query start time
 * @param {number} resultCount - Number of results
 * @param {boolean} fromCache - Whether results came from cache
 * @returns {object} Performance metrics
 */
function createPerformanceMetrics(startTime, resultCount, fromCache = false) {
  const endTime = Date.now();
  const executionTime = endTime - startTime;
  
  return {
    execution_time_ms: executionTime,
    result_count: resultCount,
    from_cache: fromCache,
    timestamp: new Date().toISOString()
  };
}

/**
 * Optimize search parameters for better performance
 * @param {object} params - Search parameters
 * @returns {object} Optimized parameters
 */
function optimizeSearchParams(params) {
  const optimized = { ...params };
  
  // Normalize query string
  if (optimized.query) {
    optimized.query = optimized.query.trim().toLowerCase();
  }
  
  // Validate threshold
  if (optimized.threshold) {
    optimized.threshold = Math.min(100, Math.max(0, parseInt(optimized.threshold) || 70));
  }
  
  // Validate radius
  if (optimized.radius) {
    optimized.radius = Math.min(1000, Math.max(0.1, parseFloat(optimized.radius) || 10));
  }
  
  // Validate coordinates
  if (optimized.lat && optimized.lon) {
    const lat = parseFloat(optimized.lat);
    const lon = parseFloat(optimized.lon);
    
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      delete optimized.lat;
      delete optimized.lon;
    }
  }
  
  return optimized;
}

/**
 * Create a database query plan analyzer (for debugging)
 * @param {object} db - Database connection
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<object>} Query plan
 */
async function analyzeQueryPlan(db, query, params) {
  return new Promise((resolve, reject) => {
    const explainQuery = `EXPLAIN QUERY PLAN ${query}`;
    
    db.all(explainQuery, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          query,
          plan: rows,
          analysis: {
            uses_index: rows.some(row => row.detail && row.detail.includes('INDEX')),
            full_scan: rows.some(row => row.detail && row.detail.includes('SCAN TABLE')),
            complexity: rows.length
          }
        });
      }
    });
  });
}

module.exports = {
  generateCacheKey,
  getCachedResults,
  cacheResults,
  clearCache,
  paginateResults,
  optimizeQuery,
  getCacheStats,
  validatePaginationParams,
  createPerformanceMetrics,
  optimizeSearchParams,
  analyzeQueryPlan
};
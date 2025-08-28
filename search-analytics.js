/**
 * Search Analytics Module for Lost Device Tracking System
 * Tracks search patterns, popular queries, and performance metrics
 * 
 * Features:
 * - Query tracking and frequency analysis
 * - Search performance monitoring
 * - Popular search terms identification
 * - User behavior analytics
 * - Search success rate tracking
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class SearchAnalytics {
    constructor(dbPath = './phones.db') {
        this.db = new sqlite3.Database(dbPath);
        this.isInitialized = false;
        this.initializeAnalyticsTables();
    }

    /**
     * Initialize analytics tables
     */
    initializeAnalyticsTables() {
        // Search queries tracking table
        this.db.serialize(() => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS search_analytics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    query_text TEXT,
                    search_type TEXT,
                    filters_used TEXT, -- JSON string of filters
                    results_count INTEGER,
                    response_time_ms INTEGER,
                    user_ip TEXT,
                    user_agent TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    success_rate REAL DEFAULT 0.0
                )
            `);

            // Popular search terms table
            this.db.run(`
                CREATE TABLE IF NOT EXISTS popular_searches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    search_term TEXT UNIQUE,
                    frequency INTEGER DEFAULT 1,
                    last_searched DATETIME DEFAULT CURRENT_TIMESTAMP,
                    avg_results INTEGER DEFAULT 0,
                    success_rate REAL DEFAULT 0.0
                )
            `);

            // Search performance metrics table
            this.db.run(`
                CREATE TABLE IF NOT EXISTS search_performance (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date DATE,
                    total_searches INTEGER DEFAULT 0,
                    avg_response_time REAL DEFAULT 0.0,
                    cache_hit_rate REAL DEFAULT 0.0,
                    successful_searches INTEGER DEFAULT 0,
                    failed_searches INTEGER DEFAULT 0,
                    unique_users INTEGER DEFAULT 0
                )
            `);

            // Create indexes for better performance
            this.db.run('CREATE INDEX IF NOT EXISTS idx_search_timestamp ON search_analytics(timestamp)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_search_query ON search_analytics(query_text)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_popular_frequency ON popular_searches(frequency DESC)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_performance_date ON search_performance(date)', () => {
                this.isInitialized = true;
            });
        });
    }

    /**
     * Track a search query
     */
    trackSearch(searchData) {
        // Skip tracking if database is not initialized yet
        if (!this.isInitialized) {
            setTimeout(() => this.trackSearch(searchData), 100);
            return;
        }

        const {
            query,
            searchType = 'general',
            filters = {},
            resultsCount = 0,
            responseTime = 0,
            userIP = 'unknown',
            userAgent = 'unknown',
            cacheHit = false
        } = searchData;

        const filtersJson = JSON.stringify(filters);
        const successRate = resultsCount > 0 ? 1.0 : 0.0;

        // Insert search record
        this.db.run(
            `INSERT INTO search_analytics 
             (query_text, search_type, filters_used, results_count, response_time_ms, user_ip, user_agent, success_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [query, searchType, filtersJson, resultsCount, responseTime, userIP, userAgent, successRate],
            function(err) {
                if (err) {
                    console.error('Error tracking search:', err.message);
                }
            }
        );

        // Update popular searches
        if (query && query.trim().length > 0) {
            this.updatePopularSearches(query.trim().toLowerCase(), resultsCount, successRate);
        }

        // Update daily performance metrics
        this.updateDailyMetrics(responseTime, cacheHit, successRate > 0, userIP);
    }

    /**
     * Update popular searches table
     */
    updatePopularSearches(searchTerm, resultsCount, successRate) {
        this.db.get(
            'SELECT * FROM popular_searches WHERE search_term = ?',
            [searchTerm],
            (err, row) => {
                if (err) {
                    console.error('Error checking popular searches:', err.message);
                    return;
                }

                if (row) {
                    // Update existing record
                    const newFrequency = row.frequency + 1;
                    const newAvgResults = Math.round((row.avg_results * row.frequency + resultsCount) / newFrequency);
                    const newSuccessRate = (row.success_rate * row.frequency + successRate) / newFrequency;

                    this.db.run(
                        `UPDATE popular_searches 
                         SET frequency = ?, avg_results = ?, success_rate = ?, last_searched = CURRENT_TIMESTAMP
                         WHERE search_term = ?`,
                        [newFrequency, newAvgResults, newSuccessRate, searchTerm]
                    );
                } else {
                    // Insert new record
                    this.db.run(
                        `INSERT INTO popular_searches (search_term, frequency, avg_results, success_rate)
                         VALUES (?, 1, ?, ?)`,
                        [searchTerm, resultsCount, successRate]
                    );
                }
            }
        );
    }

    /**
     * Update daily performance metrics
     */
    updateDailyMetrics(responseTime, cacheHit, isSuccessful, userIP) {
        const today = new Date().toISOString().split('T')[0];

        this.db.get(
            'SELECT * FROM search_performance WHERE date = ?',
            [today],
            (err, row) => {
                if (err) {
                    console.error('Error checking daily metrics:', err.message);
                    return;
                }

                if (row) {
                    // Update existing record
                    const newTotalSearches = row.total_searches + 1;
                    const newAvgResponseTime = (row.avg_response_time * row.total_searches + responseTime) / newTotalSearches;
                    const newCacheHits = cacheHit ? 1 : 0;
                    const newCacheHitRate = (row.cache_hit_rate * row.total_searches + newCacheHits) / newTotalSearches;
                    const newSuccessful = isSuccessful ? row.successful_searches + 1 : row.successful_searches;
                    const newFailed = !isSuccessful ? row.failed_searches + 1 : row.failed_searches;

                    this.db.run(
                        `UPDATE search_performance 
                         SET total_searches = ?, avg_response_time = ?, cache_hit_rate = ?, 
                             successful_searches = ?, failed_searches = ?
                         WHERE date = ?`,
                        [newTotalSearches, newAvgResponseTime, newCacheHitRate, newSuccessful, newFailed, today]
                    );
                } else {
                    // Insert new record
                    this.db.run(
                        `INSERT INTO search_performance 
                         (date, total_searches, avg_response_time, cache_hit_rate, successful_searches, failed_searches, unique_users)
                         VALUES (?, 1, ?, ?, ?, ?, 1)`,
                        [today, responseTime, cacheHit ? 1.0 : 0.0, isSuccessful ? 1 : 0, isSuccessful ? 0 : 1]
                    );
                }
            }
        );
    }

    /**
     * Get popular search terms
     */
    getPopularSearches(limit = 10, callback) {
        this.db.all(
            `SELECT search_term, frequency, avg_results, success_rate, last_searched
             FROM popular_searches 
             ORDER BY frequency DESC, last_searched DESC 
             LIMIT ?`,
            [limit],
            callback
        );
    }

    /**
     * Get search analytics for a date range
     */
    getSearchAnalytics(startDate, endDate, callback) {
        const query = `
            SELECT 
                DATE(timestamp) as date,
                COUNT(*) as total_searches,
                AVG(response_time_ms) as avg_response_time,
                AVG(results_count) as avg_results,
                AVG(success_rate) as success_rate,
                COUNT(DISTINCT user_ip) as unique_users
            FROM search_analytics 
            WHERE DATE(timestamp) BETWEEN ? AND ?
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
        `;

        this.db.all(query, [startDate, endDate], callback);
    }

    /**
     * Get search performance metrics
     */
    getPerformanceMetrics(days = 30, callback) {
        this.db.all(
            `SELECT * FROM search_performance 
             WHERE date >= date('now', '-' || ? || ' days')
             ORDER BY date DESC`,
            [days],
            callback
        );
    }

    /**
     * Get search trends
     */
    getSearchTrends(callback) {
        const queries = {
            // Most searched terms this week
            weeklyTrends: `
                SELECT query_text, COUNT(*) as frequency
                FROM search_analytics 
                WHERE timestamp >= date('now', '-7 days')
                GROUP BY query_text
                ORDER BY frequency DESC
                LIMIT 10
            `,
            // Search success rate by type
            successByType: `
                SELECT search_type, AVG(success_rate) as avg_success_rate, COUNT(*) as total_searches
                FROM search_analytics
                WHERE timestamp >= date('now', '-30 days')
                GROUP BY search_type
                ORDER BY avg_success_rate DESC
            `,
            // Peak search hours
            peakHours: `
                SELECT 
                    strftime('%H', timestamp) as hour,
                    COUNT(*) as search_count
                FROM search_analytics
                WHERE timestamp >= date('now', '-7 days')
                GROUP BY strftime('%H', timestamp)
                ORDER BY search_count DESC
            `,
            // Filter usage statistics
            filterUsage: `
                SELECT 
                    CASE 
                        WHEN filters_used = '{}' THEN 'No Filters'
                        ELSE 'With Filters'
                    END as filter_type,
                    COUNT(*) as usage_count,
                    AVG(success_rate) as avg_success_rate
                FROM search_analytics
                WHERE timestamp >= date('now', '-30 days')
                GROUP BY filter_type
            `
        };

        const results = {};
        let completed = 0;
        const total = Object.keys(queries).length;

        Object.entries(queries).forEach(([key, query]) => {
            this.db.all(query, (err, rows) => {
                if (err) {
                    console.error(`Error fetching ${key}:`, err.message);
                    results[key] = [];
                } else {
                    results[key] = rows;
                }

                completed++;
                if (completed === total) {
                    callback(null, results);
                }
            });
        });
    }

    /**
     * Get search suggestions based on popular terms
     */
    getSearchSuggestions(partialQuery, limit = 5, callback) {
        const query = `
            SELECT search_term, frequency
            FROM popular_searches
            WHERE search_term LIKE ? AND frequency > 1
            ORDER BY frequency DESC, last_searched DESC
            LIMIT ?
        `;

        this.db.all(query, [`%${partialQuery.toLowerCase()}%`, limit], callback);
    }

    /**
     * Clean old analytics data
     */
    cleanOldData(daysToKeep = 365) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        // Clean search analytics
        this.db.run(
            'DELETE FROM search_analytics WHERE DATE(timestamp) < ?',
            [cutoffDateStr],
            function(err) {
                if (err) {
                    console.error('Error cleaning search analytics:', err.message);
                } else {
                    console.log(`Cleaned ${this.changes} old search analytics records`);
                }
            }
        );

        // Clean performance metrics
        this.db.run(
            'DELETE FROM search_performance WHERE date < ?',
            [cutoffDateStr],
            function(err) {
                if (err) {
                    console.error('Error cleaning performance metrics:', err.message);
                } else {
                    console.log(`Cleaned ${this.changes} old performance metric records`);
                }
            }
        );

        // Clean unpopular search terms (frequency < 2 and not searched in last 90 days)
        const recentCutoff = new Date();
        recentCutoff.setDate(recentCutoff.getDate() - 90);
        const recentCutoffStr = recentCutoff.toISOString();

        this.db.run(
            'DELETE FROM popular_searches WHERE frequency < 2 AND last_searched < ?',
            [recentCutoffStr],
            function(err) {
                if (err) {
                    console.error('Error cleaning popular searches:', err.message);
                } else {
                    console.log(`Cleaned ${this.changes} unpopular search records`);
                }
            }
        );
    }

    /**
     * Generate analytics report
     */
    generateReport(callback) {
        this.getSearchTrends((err, trends) => {
            if (err) {
                return callback(err);
            }

            this.getPerformanceMetrics(30, (err, performance) => {
                if (err) {
                    return callback(err);
                }

                this.getPopularSearches(20, (err, popular) => {
                    if (err) {
                        return callback(err);
                    }

                    const report = {
                        generated_at: new Date().toISOString(),
                        trends,
                        performance_metrics: performance,
                        popular_searches: popular,
                        summary: {
                            total_searches_30_days: performance.reduce((sum, day) => sum + day.total_searches, 0),
                            avg_response_time: performance.length > 0 ? 
                                performance.reduce((sum, day) => sum + day.avg_response_time, 0) / performance.length : 0,
                            avg_success_rate: performance.length > 0 ?
                                performance.reduce((sum, day) => sum + (day.successful_searches / (day.successful_searches + day.failed_searches)), 0) / performance.length : 0,
                            most_popular_term: popular.length > 0 ? popular[0].search_term : 'N/A'
                        }
                    };

                    callback(null, report);
                });
            });
        });
    }

    /**
     * Close database connection
     */
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('Error closing analytics database:', err.message);
            } else {
                console.log('Analytics database connection closed.');
            }
        });
    }
}

module.exports = SearchAnalytics;
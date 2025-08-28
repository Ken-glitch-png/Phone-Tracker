/**
 * Advanced Filters Module for Lost Device Tracking System
 * Implements sophisticated filtering techniques based on 2024 best practices
 * 
 * Features:
 * - Date range filtering with optimized queries
 * - Status and category filtering with bitmap-like efficiency
 * - Device type and brand filtering
 * - Location-based filtering
 * - Multi-criteria filtering with performance optimization
 */

class AdvancedFilters {
    constructor() {
        // Define filter categories and their possible values
        this.filterCategories = {
            status: ['lost', 'found', 'returned', 'claimed'],
            deviceType: ['smartphone', 'tablet', 'laptop', 'smartwatch', 'earbuds', 'other'],
            brands: ['apple', 'samsung', 'huawei', 'xiaomi', 'oppo', 'vivo', 'oneplus', 'google', 'sony', 'lg', 'other'],
            timeRanges: {
                'today': { days: 0 },
                'yesterday': { days: 1 },
                'last_week': { days: 7 },
                'last_month': { days: 30 },
                'last_3_months': { days: 90 },
                'last_6_months': { days: 180 },
                'last_year': { days: 365 }
            }
        };
    }

    /**
     * Build advanced filter conditions for SQL queries
     * @param {Object} filters - Filter parameters
     * @returns {Object} SQL conditions and parameters
     */
    buildFilterConditions(filters) {
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        // Date range filtering with optimized performance
        if (filters.dateFrom || filters.dateTo || filters.timeRange) {
            const dateCondition = this.buildDateRangeCondition(filters, paramIndex);
            if (dateCondition.condition) {
                conditions.push(dateCondition.condition);
                params.push(...dateCondition.params);
                paramIndex += dateCondition.params.length;
            }
        }

        // Status filtering with bitmap-like efficiency
        if (filters.status && filters.status.length > 0) {
            const statusCondition = this.buildStatusCondition(filters.status, paramIndex);
            conditions.push(statusCondition.condition);
            params.push(...statusCondition.params);
            paramIndex += statusCondition.params.length;
        }

        // Device type filtering
        if (filters.deviceType && filters.deviceType.length > 0) {
            const deviceCondition = this.buildDeviceTypeCondition(filters.deviceType, paramIndex);
            conditions.push(deviceCondition.condition);
            params.push(...deviceCondition.params);
            paramIndex += deviceCondition.params.length;
        }

        // Brand filtering
        if (filters.brand && filters.brand.length > 0) {
            const brandCondition = this.buildBrandCondition(filters.brand, paramIndex);
            conditions.push(brandCondition.condition);
            params.push(...brandCondition.params);
            paramIndex += brandCondition.params.length;
        }

        // Location filtering
        if (filters.country || filters.region || filters.city) {
            const locationCondition = this.buildLocationCondition(filters, paramIndex);
            conditions.push(locationCondition.condition);
            params.push(...locationCondition.params);
            paramIndex += locationCondition.params.length;
        }

        // IMEI filtering
        if (filters.imei) {
            conditions.push(`imei LIKE ?`);
            params.push(`%${filters.imei}%`);
        }

        // Phone number filtering
        if (filters.phoneNumber) {
            conditions.push(`phone_number LIKE ?`);
            params.push(`%${filters.phoneNumber}%`);
        }

        return {
            whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
            params: params
        };
    }

    /**
     * Build optimized date range conditions
     * Uses indexed date columns for better performance
     */
    buildDateRangeCondition(filters, startIndex) {
        const conditions = [];
        const params = [];
        let paramIndex = startIndex;

        if (filters.timeRange && this.filterCategories.timeRanges[filters.timeRange]) {
            const range = this.filterCategories.timeRanges[filters.timeRange];
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - range.days);
            
            conditions.push(`created_at >= ?`);
            params.push(cutoffDate.toISOString().split('T')[0]);
        } else {
            if (filters.dateFrom) {
                conditions.push(`created_at >= ?`);
                params.push(filters.dateFrom);
            }
            
            if (filters.dateTo) {
                conditions.push(`created_at <= ?`);
                params.push(filters.dateTo);
            }
        }

        return {
            condition: conditions.length > 0 ? `(${conditions.join(' AND ')})` : null,
            params: params
        };
    }

    /**
     * Build status filtering with bitmap-like efficiency
     * Uses IN clause for multiple status values
     */
    buildStatusCondition(statusArray, startIndex) {
        const validStatuses = statusArray.filter(status => 
            this.filterCategories.status.includes(status.toLowerCase())
        );
        
        if (validStatuses.length === 0) {
            return { condition: '1=1', params: [] };
        }

        const placeholders = validStatuses.map(() => '?').join(',');
        return {
            condition: `status IN (${placeholders})`,
            params: validStatuses
        };
    }

    /**
     * Build device type filtering
     */
    buildDeviceTypeCondition(deviceTypes, startIndex) {
        const validTypes = deviceTypes.filter(type => 
            this.filterCategories.deviceType.includes(type.toLowerCase())
        );
        
        if (validTypes.length === 0) {
            return { condition: '1=1', params: [] };
        }

        const conditions = validTypes.map(() => 'device_type LIKE ?');
        const params = validTypes.map(type => `%${type}%`);
        
        return {
            condition: `(${conditions.join(' OR ')})`,
            params: params
        };
    }

    /**
     * Build brand filtering
     */
    buildBrandCondition(brands, startIndex) {
        const validBrands = brands.filter(brand => 
            this.filterCategories.brands.includes(brand.toLowerCase())
        );
        
        if (validBrands.length === 0) {
            return { condition: '1=1', params: [] };
        }

        const conditions = validBrands.map(() => 'brand LIKE ?');
        const params = validBrands.map(brand => `%${brand}%`);
        
        return {
            condition: `(${conditions.join(' OR ')})`,
            params: params
        };
    }

    /**
     * Build location-based filtering
     */
    buildLocationCondition(filters, startIndex) {
        const conditions = [];
        const params = [];

        if (filters.country) {
            conditions.push('country LIKE ?');
            params.push(`%${filters.country}%`);
        }

        if (filters.region) {
            conditions.push('region_state LIKE ?');
            params.push(`%${filters.region}%`);
        }

        if (filters.city) {
            conditions.push('city LIKE ?');
            params.push(`%${filters.city}%`);
        }

        return {
            condition: conditions.length > 0 ? `(${conditions.join(' AND ')})` : '1=1',
            params: params
        };
    }

    /**
     * Build optimized query with advanced filters
     * Implements query optimization techniques from research
     */
    buildOptimizedQuery(table, filters, orderBy = 'created_at DESC', limit = 50, offset = 0) {
        const filterConditions = this.buildFilterConditions(filters);
        
        // Use indexed columns for ordering when possible
        const optimizedOrderBy = this.optimizeOrderBy(orderBy, filters);
        
        const query = `
            SELECT * FROM ${table}
            ${filterConditions.whereClause}
            ORDER BY ${optimizedOrderBy}
            LIMIT ? OFFSET ?
        `;
        
        const params = [...filterConditions.params, limit, offset];
        
        return { query, params };
    }

    /**
     * Optimize ORDER BY clause based on available indexes
     */
    optimizeOrderBy(orderBy, filters) {
        // If filtering by date, use date index for sorting
        if (filters.dateFrom || filters.dateTo || filters.timeRange) {
            return 'created_at DESC, id DESC';
        }
        
        // If filtering by location, prioritize location-based sorting
        if (filters.country || filters.region || filters.city) {
            return 'country, region_state, city, created_at DESC';
        }
        
        // Default optimized sorting
        return orderBy || 'created_at DESC, id DESC';
    }

    /**
     * Generate filter summary for analytics
     */
    generateFilterSummary(filters) {
        const summary = {
            activeFilters: 0,
            filterTypes: [],
            complexity: 'simple'
        };

        Object.keys(filters).forEach(key => {
            if (filters[key] && filters[key] !== '' && 
                (Array.isArray(filters[key]) ? filters[key].length > 0 : true)) {
                summary.activeFilters++;
                summary.filterTypes.push(key);
            }
        });

        // Determine complexity based on number of active filters
        if (summary.activeFilters > 5) {
            summary.complexity = 'complex';
        } else if (summary.activeFilters > 2) {
            summary.complexity = 'moderate';
        }

        return summary;
    }

    /**
     * Validate filter parameters
     */
    validateFilters(filters) {
        const errors = [];
        
        // Validate date ranges
        if (filters.dateFrom && filters.dateTo) {
            const fromDate = new Date(filters.dateFrom);
            const toDate = new Date(filters.dateTo);
            
            if (fromDate > toDate) {
                errors.push('Date from cannot be later than date to');
            }
            
            if (fromDate > new Date()) {
                errors.push('Date from cannot be in the future');
            }
        }
        
        // Validate status values
        if (filters.status && Array.isArray(filters.status)) {
            const invalidStatuses = filters.status.filter(status => 
                !this.filterCategories.status.includes(status.toLowerCase())
            );
            
            if (invalidStatuses.length > 0) {
                errors.push(`Invalid status values: ${invalidStatuses.join(', ')}`);
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Get available filter options for UI
     */
    getFilterOptions() {
        return {
            status: this.filterCategories.status,
            deviceType: this.filterCategories.deviceType,
            brands: this.filterCategories.brands,
            timeRanges: Object.keys(this.filterCategories.timeRanges)
        };
    }
}

module.exports = AdvancedFilters;
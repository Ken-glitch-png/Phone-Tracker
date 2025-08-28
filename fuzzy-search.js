// Fuzzy Search Utilities
// Implements Levenshtein distance algorithm and other fuzzy matching techniques

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Edit distance between the strings
 */
function levenshteinDistance(str1, str2) {
    if (!str1 || !str2) return Math.max(str1?.length || 0, str2?.length || 0);
    
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;
    
    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            if (str1.charAt(i - 1) === str2.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    
    return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity percentage (0-100)
 */
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 100;
    
    const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return ((maxLength - distance) / maxLength) * 100;
}

/**
 * Check if two strings are fuzzy matches based on threshold
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {number} threshold - Minimum similarity percentage (default: 70)
 * @returns {boolean} - True if strings are similar enough
 */
function isFuzzyMatch(str1, str2, threshold = 70) {
    return calculateSimilarity(str1, str2) >= threshold;
}

/**
 * Normalize phone number for comparison
 * @param {string} phoneNumber - Phone number to normalize
 * @returns {string} - Normalized phone number
 */
function normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';
    // Remove all non-digit characters
    return phoneNumber.replace(/\D/g, '');
}

/**
 * Check if phone numbers are similar (handles different formats)
 * @param {string} phone1 - First phone number
 * @param {string} phone2 - Second phone number
 * @param {number} threshold - Similarity threshold (default: 85)
 * @returns {boolean} - True if phone numbers are similar
 */
function isPhoneSimilar(phone1, phone2, threshold = 85) {
    const norm1 = normalizePhoneNumber(phone1);
    const norm2 = normalizePhoneNumber(phone2);
    
    // Exact match after normalization
    if (norm1 === norm2) return true;
    
    // Check if one is a substring of the other (for international vs local formats)
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
        const minLength = Math.min(norm1.length, norm2.length);
        if (minLength >= 7) { // Minimum valid phone number length
            return true;
        }
    }
    
    // Fuzzy match for typos
    return calculateSimilarity(norm1, norm2) >= threshold;
}

/**
 * Normalize IMEI for comparison
 * @param {string} imei - IMEI to normalize
 * @returns {string} - Normalized IMEI
 */
function normalizeIMEI(imei) {
    if (!imei) return '';
    // Remove spaces, dashes, and convert to uppercase
    return imei.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Check if IMEIs are similar
 * @param {string} imei1 - First IMEI
 * @param {string} imei2 - Second IMEI
 * @param {number} threshold - Similarity threshold (default: 90)
 * @returns {boolean} - True if IMEIs are similar
 */
function isIMEISimilar(imei1, imei2, threshold = 90) {
    const norm1 = normalizeIMEI(imei1);
    const norm2 = normalizeIMEI(imei2);
    
    if (norm1 === norm2) return true;
    
    // IMEI should be exactly 15 digits, so be strict about similarity
    return calculateSimilarity(norm1, norm2) >= threshold;
}

/**
 * Create fuzzy search SQL conditions
 * @param {string} searchTerm - Term to search for
 * @param {string} column - Database column name
 * @param {number} threshold - Similarity threshold (default: 70)
 * @returns {object} - Object with SQL condition and parameters
 */
function createFuzzySearchCondition(searchTerm, column, threshold = 70) {
    if (!searchTerm || !column) {
        return { condition: '1=1', params: [] };
    }
    
    // For exact matches and partial matches, use LIKE
    const likePattern = `%${searchTerm.toLowerCase()}%`;
    
    return {
        condition: `(LOWER(${column}) LIKE ? OR ${column} IS NOT NULL)`,
        params: [likePattern],
        fuzzyCheck: true // Indicates this needs post-processing fuzzy check
    };
}

/**
 * Filter results using fuzzy matching
 * @param {Array} results - Database results to filter
 * @param {string} searchTerm - Original search term
 * @param {string} fieldName - Field name to check
 * @param {number} threshold - Similarity threshold
 * @returns {Array} - Filtered and scored results
 */
function filterFuzzyResults(results, searchTerm, fieldName, threshold = 70) {
    if (!searchTerm || !results || results.length === 0) {
        return results;
    }
    
    return results
        .map(result => {
            const fieldValue = result[fieldName];
            if (!fieldValue) return null;
            
            const similarity = calculateSimilarity(searchTerm, fieldValue);
            
            if (similarity >= threshold) {
                return {
                    ...result,
                    _similarity: similarity,
                    _matchField: fieldName
                };
            }
            
            return null;
        })
        .filter(result => result !== null)
        .sort((a, b) => b._similarity - a._similarity); // Sort by similarity descending
}

/**
 * Advanced fuzzy search for multiple fields
 * @param {Array} results - Database results
 * @param {string} searchTerm - Search term
 * @param {Array} fields - Array of field names to search
 * @param {number} threshold - Similarity threshold
 * @returns {Array} - Filtered and scored results
 */
function multiFieldFuzzySearch(results, searchTerm, fields, threshold = 70) {
    if (!searchTerm || !results || results.length === 0) {
        return results;
    }
    
    const scoredResults = [];
    
    results.forEach(result => {
        let bestSimilarity = 0;
        let bestField = null;
        
        fields.forEach(field => {
            const fieldValue = result[field];
            if (fieldValue) {
                const similarity = calculateSimilarity(searchTerm, fieldValue.toString());
                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestField = field;
                }
            }
        });
        
        if (bestSimilarity >= threshold) {
            scoredResults.push({
                ...result,
                _similarity: bestSimilarity,
                _matchField: bestField
            });
        }
    });
    
    return scoredResults.sort((a, b) => b._similarity - a._similarity);
}

/**
 * Soundex algorithm implementation for phonetic matching
 * @param {string} str - String to convert to Soundex
 * @returns {string} - Soundex code
 */
function soundex(str) {
    if (!str) return '';
    
    str = str.toUpperCase().replace(/[^A-Z]/g, '');
    if (str.length === 0) return '';
    
    const firstLetter = str[0];
    
    // Soundex mapping
    const mapping = {
        'B': '1', 'F': '1', 'P': '1', 'V': '1',
        'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
        'D': '3', 'T': '3',
        'L': '4',
        'M': '5', 'N': '5',
        'R': '6'
    };
    
    let soundexCode = firstLetter;
    let prevCode = mapping[firstLetter] || '0';
    
    for (let i = 1; i < str.length && soundexCode.length < 4; i++) {
        const currentCode = mapping[str[i]] || '0';
        
        if (currentCode !== '0' && currentCode !== prevCode) {
            soundexCode += currentCode;
        }
        
        if (currentCode !== '0') {
            prevCode = currentCode;
        }
    }
    
    // Pad with zeros if necessary
    return soundexCode.padEnd(4, '0');
}

/**
 * Check if two strings have similar pronunciation using Soundex
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {boolean} - True if strings sound similar
 */
function isSoundexMatch(str1, str2) {
    return soundex(str1) === soundex(str2);
}

module.exports = {
    levenshteinDistance,
    calculateSimilarity,
    isFuzzyMatch,
    normalizePhoneNumber,
    isPhoneSimilar,
    normalizeIMEI,
    isIMEISimilar,
    createFuzzySearchCondition,
    filterFuzzyResults,
    multiFieldFuzzySearch,
    soundex,
    isSoundexMatch
};
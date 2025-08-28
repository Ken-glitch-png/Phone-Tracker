const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fuzzySearch = require('./fuzzy-search');
const geospatialSearch = require('./geospatial-search');
const queryOptimizer = require('./query-optimizer');
const AdvancedFilters = require('./advanced-filters');
const SearchAnalytics = require('./search-analytics');
const path = require('path');

// Initialize advanced filters and search analytics
const advancedFilters = new AdvancedFilters();
const searchAnalytics = new SearchAnalytics();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Security middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const db = new sqlite3.Database('./phones.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS lost_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT,
      imei TEXT,
      email TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      color TEXT,
      description TEXT,
      location_lost TEXT,
      country TEXT DEFAULT 'Philippines',
      region_state TEXT,
      city TEXT,
      latitude REAL,
      longitude REAL,
      date_lost DATE,
      contact_name TEXT NOT NULL,
      contact_phone TEXT,
      status TEXT DEFAULT 'lost',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, () => {
    // Check if we need to populate sample data
    db.get('SELECT COUNT(*) as count FROM lost_phones', (err, row) => {
      if (!err && row.count === 0) {
        console.log('Database is empty, populating with sample data...');
        populateSampleData();
      }
    });
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS found_phones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT,
      imei TEXT,
      email TEXT,
      brand TEXT,
      model TEXT,
      color TEXT,
      description TEXT,
      location_found TEXT,
      country TEXT DEFAULT 'Philippines',
      region_state TEXT,
      city TEXT,
      date_found DATE,
      finder_name TEXT NOT NULL,
      finder_contact TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Users table for authentication
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Payment sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS payment_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      payment_type TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      status TEXT DEFAULT 'pending',
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);
}

// Function to populate sample data
function populateSampleData() {
  const samplePhones = [
    {
      phone_number: '+1 555 123 4567',
      imei: '123456789012345',
      brand: 'Apple',
      model: 'iPhone 14 Pro',
      color: 'Space Black',
      email: 'john.doe@example.com',
      contact_name: 'John Doe',
      location_lost: 'Central Park, New York',
      city: 'New York',
      region_state: 'NY',
      country: 'United States',
      date_lost: '2024-01-15',
      latitude: 40.7829,
      longitude: -73.9654,
      description: 'Lost during morning jog in Central Park'
    },
    {
      phone_number: '+63 917 888 9999',
      imei: '456789123456789',
      brand: 'Google',
      model: 'Pixel 8 Pro',
      color: 'Bay Blue',
      email: 'maria.garcia@example.com',
      contact_name: 'Maria Garcia',
      location_lost: 'Rizal Park, Manila',
      city: 'Manila',
      region_state: 'Metro Manila',
      country: 'Philippines',
      date_lost: '2024-01-25',
      latitude: 14.5832,
      longitude: 120.9794,
      description: 'Lost during family picnic at Rizal Park'
    }
  ];

  const insertStmt = db.prepare(`
    INSERT INTO lost_phones (
      phone_number, imei, brand, model, color, email, contact_name,
      location_lost, city, region_state, country, date_lost,
      latitude, longitude, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  samplePhones.forEach((phone, index) => {
    insertStmt.run([
      phone.phone_number, phone.imei, phone.brand, phone.model, phone.color,
      phone.email, phone.contact_name, phone.location_lost, phone.city,
      phone.region_state, phone.country, phone.date_lost,
      phone.latitude, phone.longitude, phone.description
    ], function(err) {
      if (err) {
        console.error(`Error inserting sample phone ${index + 1}:`, err);
      } else {
        console.log(`✓ Inserted sample phone: ${phone.brand} ${phone.model}`);
      }
    });
  });

  insertStmt.finalize(() => {
    console.log('✅ Sample data population completed!');
  });
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Check payment access middleware
function checkPaymentAccess(req, res, next) {
  const userId = req.user.id;
  
  db.get(
    'SELECT * FROM payment_sessions WHERE user_id = ? AND status = "completed" AND expires_at > datetime("now") ORDER BY created_at DESC LIMIT 1',
    [userId],
    (err, session) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!session) {
        return res.status(402).json({ error: 'Payment required to access this feature' });
      }
      
      req.paymentSession = session;
      next();
    }
  );
}

// Validation middleware
function validatePhoneData(req, res, next) {
  const { email, contact_name } = req.body;
  
  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  
  if (!contact_name || contact_name.trim().length < 2) {
    return res.status(400).json({ error: 'Contact name is required (minimum 2 characters)' });
  }
  
  next();
}

// Routes

// User registration
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }
  
  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'Username or email already exists' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        
        const token = jwt.sign(
          { id: this.lastID, username, email },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        res.status(201).json({
           success: true,
           message: 'User registered successfully',
           token,
           user: { id: this.lastID, username, email }
         });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// User login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  db.get(
    'SELECT * FROM users WHERE username = ? OR email = ?',
    [username, username],
    async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      try {
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
          { id: user.id, username: user.username, email: user.email },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        res.json({
           success: true,
           message: 'Login successful',
           token,
           user: { id: user.id, username: user.username, email: user.email }
         });
      } catch (error) {
        res.status(500).json({ error: 'Server error' });
      }
    }
  );
});

// Create payment session
app.post('/api/payment/create-session', authenticateToken, (req, res) => {
  const { payment_type, amount } = req.body;
  const userId = req.user.id;
  
  if (!payment_type || !amount) {
    return res.status(400).json({ error: 'Payment type and amount are required' });
  }
  
  // Set expiration to 24 hours from now
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  
  db.run(
    'INSERT INTO payment_sessions (user_id, payment_type, amount, expires_at) VALUES (?, ?, ?, ?)',
    [userId, payment_type, amount, expiresAt],
    function(err) {
      if (err) {
         return res.status(500).json({ error: 'Database error' });
       }
       
       res.json({
        session_id: this.lastID,
        payment_type,
        amount,
        expires_at: expiresAt,
        message: 'Payment session created successfully'
      });
    }
  );
});

// Complete payment (mock endpoint)
app.post('/api/payment/complete/:sessionId', authenticateToken, (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.id;
  
  db.run(
    'UPDATE payment_sessions SET status = "completed" WHERE id = ? AND user_id = ? AND status = "pending"',
    [sessionId, userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Payment session not found or already completed' });
      }
      
      res.json({ message: 'Payment completed successfully' });
    }
  );
});

// Process payment (simplified mock endpoint)
 app.post('/api/payment', authenticateToken, (req, res) => {
   const { paymentType, cardNumber, expiryDate, cvv, cardholderName } = req.body;
   const userId = req.user.id;
   
   // Basic validation
   if (!paymentType || !cardNumber || !expiryDate || !cvv || !cardholderName) {
     return res.status(400).json({ error: 'All payment fields are required' });
   }
   
   // Mock payment processing - in real app, integrate with payment gateway
   const amount = paymentType === 'single' ? 2.99 : 9.99;
   const expiresAt = paymentType === 'single' 
     ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
     : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
   
   db.run(
     'INSERT INTO payment_sessions (user_id, payment_type, amount, status, expires_at) VALUES (?, ?, ?, "completed", ?)',
     [userId, paymentType, amount, expiresAt],
     function(err) {
       if (err) {
         return res.status(500).json({ error: 'Database error' });
       }
       
       res.json({
         success: true,
         message: 'Payment processed successfully',
         session: {
           id: this.lastID,
           hasAccess: true,
           paymentType,
           amount,
           expiresAt
         }
       });
     }
   );
 });
 
 // Get user's payment sessions
 app.get('/api/payment/sessions', authenticateToken, (req, res) => {
   const userId = req.user.id;
   
   db.all(
     'SELECT * FROM payment_sessions WHERE user_id = ? ORDER BY created_at DESC',
     [userId],
     (err, sessions) => {
       if (err) {
         return res.status(500).json({ error: 'Database error' });
       }
       
       res.json(sessions);
     }
   );
 });

// Get all lost phones
app.get('/api/lost-phones', (req, res) => {
  db.all('SELECT * FROM lost_phones ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Track phone endpoint - for real-time GPS tracking
app.post('/api/track', (req, res) => {
  const { identifier, type, ownerEmail } = req.body;
  
  if (!identifier || !type || !ownerEmail) {
    return res.status(400).json({ error: 'Identifier, type, and owner email are required' });
  }
  
  if (!validator.isEmail(ownerEmail)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  
  let whereConditions = ['email = ?'];
  let params = [ownerEmail.toLowerCase()];
  
  // Add identifier-specific conditions
  switch (type) {
    case 'phone':
      whereConditions.push('phone_number LIKE ?');
      params.push(`%${identifier}%`);
      break;
    case 'imei':
      whereConditions.push('imei = ?');
      params.push(identifier);
      break;
    case 'email':
      whereConditions.push('email = ?');
      params.push(identifier.toLowerCase());
      break;
    default:
      whereConditions.push('(phone_number LIKE ? OR imei = ? OR email = ?)');
      params.push(`%${identifier}%`, identifier, identifier.toLowerCase());
  }
  
  const sql = `SELECT * FROM lost_phones WHERE ${whereConditions.join(' AND ')} AND status = 'lost' ORDER BY created_at DESC LIMIT 1`;
  
  db.get(sql, params, (err, phone) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ error: 'Database error occurred' });
    }
    
    if (!phone) {
      return res.status(404).json({ error: 'Phone not found or not registered with this email address' });
    }
    
    // Return phone data with GPS coordinates
    res.json({
      success: true,
      phone: {
        id: phone.id,
        phone_number: phone.phone_number,
        imei: phone.imei,
        email: phone.email,
        brand: phone.brand,
        model: phone.model,
        color: phone.color,
        description: phone.description,
        location_lost: phone.location_lost,
        country: phone.country,
        region_state: phone.region_state,
        city: phone.city,
        date_lost: phone.date_lost,
        contact_name: phone.contact_name,
        contact_phone: phone.contact_phone,
        latitude: phone.latitude,
        longitude: phone.longitude,
        status: phone.status,
        created_at: phone.created_at
      }
    });
  });
});

// Report a lost phone
app.post('/api/lost-phones', validatePhoneData, (req, res) => {
  const {
    phone_number, imei, email, brand, model, color,
    description, location_lost, country, region_state, city,
    date_lost, contact_name, contact_phone, latitude, longitude
  } = req.body;

  const sql = `
    INSERT INTO lost_phones 
    (phone_number, imei, email, brand, model, color, description, 
     location_lost, country, region_state, city, date_lost, contact_name, contact_phone, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    phone_number, imei, email, brand, model, color,
    description, location_lost, country || 'Philippines', region_state, city,
    date_lost, contact_name, contact_phone, latitude, longitude
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: 'Lost phone reported successfully' });
  });
});

// Enhanced search for phones with fuzzy matching, phonetic search, geospatial search, and advanced filters (public route)
app.get('/api/search', (req, res) => {
  const startTime = Date.now();
  const { 
    query, type, country, region, city, 
    fuzzy = 'true', threshold = '70', phonetic = 'false', 
    lat, lon, radius = '10', page = '1', limit = '50', cache = 'true',
    // Advanced filter parameters
    dateFrom, dateTo, timeRange, status, deviceType, brand, imei, phoneNumber
  } = req.query;
  
  // Parse array parameters for advanced filters
  const statusArray = status ? (Array.isArray(status) ? status : status.split(',')) : [];
  const deviceTypeArray = deviceType ? (Array.isArray(deviceType) ? deviceType : deviceType.split(',')) : [];
  const brandArray = brand ? (Array.isArray(brand) ? brand : brand.split(',')) : [];
  
  // Validate advanced filters
  const advancedFilterParams = {
    dateFrom, dateTo, timeRange,
    status: statusArray,
    deviceType: deviceTypeArray,
    brand: brandArray,
    country, region, city,
    imei, phoneNumber
  };
  
  const filterValidation = advancedFilters.validateFilters(advancedFilterParams);
  if (!filterValidation.isValid) {
    return res.status(400).json({ 
      error: 'Invalid filter parameters', 
      details: filterValidation.errors 
    });
  }
  
  // Optimize and validate search parameters
   const optimizedParams = queryOptimizer.optimizeSearchParams(req.query);
   const { page: validPage, limit: validLimit } = queryOptimizer.validatePaginationParams(page, limit);
   const useCache = cache === 'true';
   const useGeospatial = lat && lon;
   const hasAdvancedFilters = Object.values(advancedFilterParams).some(val => 
     val && (Array.isArray(val) ? val.length > 0 : val !== ''));
   
   if (!query && !country && !region && !city && !useGeospatial && !hasAdvancedFilters) {
      return res.status(400).json({ error: 'Search query, location filter, coordinates, or advanced filters are required' });
    }

   // Check cache first if enabled
   if (useCache) {
     const cachedResults = queryOptimizer.getCachedResults(optimizedParams);
     if (cachedResults) {
       const paginatedCache = queryOptimizer.paginateResults(cachedResults.combined_results || [], validPage, validLimit);
       const metrics = queryOptimizer.createPerformanceMetrics(startTime, paginatedCache.data.length, true);
       
       // Track cached search analytics
       searchAnalytics.trackSearch({
         query: query || '',
         searchType: type || 'general',
         filters: advancedFilterParams,
         resultsCount: paginatedCache.data.length,
         responseTime: metrics.response_time_ms,
         userIP: req.ip || req.connection.remoteAddress,
         userAgent: req.get('User-Agent'),
         cacheHit: true
       });

       return res.json({
         ...paginatedCache,
         search_info: {
           ...cachedResults.search_info,
           performance: metrics,
           cache_hit: true,
           filter_summary: advancedFilters.generateFilterSummary(advancedFilterParams)
         }
       });
     }
   }

  const useFuzzy = fuzzy === 'true';
  const usePhonetic = phonetic === 'true';
  const similarityThreshold = parseInt(threshold) || 70;
  const searchRadius = parseFloat(radius) || 10;
  let sql = '';
  let params = [];
  let whereConditions = [];
  let needsFuzzyProcessing = false;
  let needsPhoneticProcessing = false;
  let needsGeospatialProcessing = false;

  // Add geographic filters
  if (useGeospatial) {
    // Use bounding box for efficient geospatial search
    const centerLat = parseFloat(lat);
    const centerLon = parseFloat(lon);
    const boundingBox = geospatialSearch.createBoundingBox(centerLat, centerLon, searchRadius);
    
    // Add bounding box conditions if latitude/longitude fields exist
    whereConditions.push('(latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?)');
    params.push(boundingBox.minLat, boundingBox.maxLat, boundingBox.minLon, boundingBox.maxLon);
    needsGeospatialProcessing = true;
  } else {
    // Traditional location-based filtering
    if (country) {
      whereConditions.push('country LIKE ?');
      params.push(`%${country}%`);
    }
    if (region) {
      whereConditions.push('region_state LIKE ?');
      params.push(`%${region}%`);
    }
    if (city) {
      whereConditions.push('city LIKE ?');
      params.push(`%${city}%`);
    }
  }

  // Add search query filters with fuzzy support
  if (query) {
    switch (type) {
      case 'phone':
        if (useFuzzy) {
          // For phone numbers, use broader search and post-process with fuzzy matching
          whereConditions.push('(phone_number IS NOT NULL OR contact_phone IS NOT NULL)');
          needsFuzzyProcessing = true;
        } else {
          whereConditions.push('(phone_number LIKE ? OR contact_phone LIKE ?)');
          params.push(`%${query}%`, `%${query}%`);
        }
        break;
      case 'imei':
        if (useFuzzy) {
          whereConditions.push('imei IS NOT NULL');
          needsFuzzyProcessing = true;
        } else {
          whereConditions.push('imei LIKE ?');
          params.push(`%${query}%`);
        }
        break;
      case 'email':
        whereConditions.push('email LIKE ?');
        params.push(`%${query}%`);
        break;
      default:
        if (useFuzzy || usePhonetic) {
          // Broader search for fuzzy/phonetic matching
          whereConditions.push('(phone_number IS NOT NULL OR imei IS NOT NULL OR email IS NOT NULL OR brand IS NOT NULL OR model IS NOT NULL OR description IS NOT NULL OR location_lost IS NOT NULL OR contact_name IS NOT NULL)');
          needsFuzzyProcessing = useFuzzy;
          needsPhoneticProcessing = usePhonetic;
        } else {
          whereConditions.push('(phone_number LIKE ? OR imei LIKE ? OR email LIKE ? OR brand LIKE ? OR model LIKE ? OR description LIKE ? OR location_lost LIKE ? OR contact_name LIKE ?)');
          params.push(...Array(8).fill(`%${query}%`));
        }
    }
  }

  // If no conditions, get all records for fuzzy processing
  if (whereConditions.length === 0) {
    whereConditions.push('1=1');
  }

  // Apply advanced filters if any are specified
  let advancedFilterConditions = { whereClause: '', params: [] };
  if (hasAdvancedFilters) {
    advancedFilterConditions = advancedFilters.buildFilterConditions(advancedFilterParams);
    if (advancedFilterConditions.whereClause) {
      // Remove 'WHERE' from advanced filter clause and add conditions
      const advancedConditions = advancedFilterConditions.whereClause.replace('WHERE ', '');
      whereConditions.push(`(${advancedConditions})`);
      params.push(...advancedFilterConditions.params);
    }
  }

  // Optimize the SQL query
   const baseQuery = `SELECT * FROM lost_phones WHERE ${whereConditions.join(' AND ')}`;
   sql = queryOptimizer.optimizeQuery(baseQuery, { 
     orderBy: advancedFilters.optimizeOrderBy('created_at DESC', advancedFilterParams),
     limit: validLimit * 3, // Get more results for better filtering
     useIndex: true 
   });

  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    let results = rows;

    // Apply fuzzy matching if enabled and needed
    if (useFuzzy && needsFuzzyProcessing && query) {
      switch (type) {
        case 'phone':
          results = results.filter(row => {
            return fuzzySearch.isPhoneSimilar(query, row.phone_number, similarityThreshold) ||
                   fuzzySearch.isPhoneSimilar(query, row.contact_phone, similarityThreshold);
          });
          break;
        case 'imei':
          results = results.filter(row => {
            return fuzzySearch.isIMEISimilar(query, row.imei, similarityThreshold);
          });
          break;
        default:
          // Multi-field fuzzy search
          const searchFields = ['phone_number', 'imei', 'email', 'brand', 'model', 'description', 'location_lost', 'contact_name'];
          results = fuzzySearch.multiFieldFuzzySearch(results, query, searchFields, similarityThreshold);
      }
    }

    // Apply phonetic matching if enabled
    if (usePhonetic && needsPhoneticProcessing && query) {
      const queryPhonetic = fuzzySearch.soundex(query);
      results = results.filter(row => {
        // Check phonetic similarity for text fields
        const fieldsToCheck = ['contact_name', 'brand', 'model', 'description', 'location_lost'];
        return fieldsToCheck.some(field => {
          if (row[field]) {
            const words = row[field].split(/\s+/);
            return words.some(word => {
              const wordPhonetic = fuzzySearch.soundex(word);
              return wordPhonetic === queryPhonetic;
            });
          }
          return false;
        });
      });
     }

     // Apply geospatial filtering if enabled
     if (useGeospatial && needsGeospatialProcessing) {
       const centerLat = parseFloat(lat);
       const centerLon = parseFloat(lon);
       results = geospatialSearch.filterByProximity(results, centerLat, centerLon, searchRadius);
     }

     // Also search found_phones table with advanced filters
     let foundWhereConditions = [...whereConditions];
     let foundParams = [...params];
     
     // Adjust field names for found_phones table
     foundWhereConditions = foundWhereConditions.map(condition => 
       condition.replace('location_lost', 'location_found')
                .replace('contact_name', 'finder_name')
                .replace('contact_phone', 'finder_contact')
     );
     
     const foundBaseQuery = `SELECT * FROM found_phones WHERE ${foundWhereConditions.join(' AND ')}`;
     const foundSql = queryOptimizer.optimizeQuery(foundBaseQuery, { 
       orderBy: advancedFilters.optimizeOrderBy('created_at DESC', advancedFilterParams),
       limit: validLimit * 3,
       useIndex: true 
     });
    
    db.all(foundSql, params, (err, foundRows) => {
      if (err) {
        console.error('Error searching found phones:', err.message);
        // Continue with just lost phones results
        return res.json({
          lost_phones: results,
          found_phones: [],
          search_info: {
           query,
           type,
           fuzzy_enabled: useFuzzy,
           phonetic_enabled: usePhonetic,
           geospatial_enabled: useGeospatial,
           threshold: similarityThreshold,
           radius_km: useGeospatial ? searchRadius : null,
           center_coordinates: useGeospatial ? { lat: parseFloat(lat), lon: parseFloat(lon) } : null,
           total_results: results.length
         }
        });
      }

      let foundResults = foundRows;

      // Apply fuzzy matching to found phones if enabled
       if (useFuzzy && needsFuzzyProcessing && query) {
         switch (type) {
           case 'phone':
             foundResults = foundResults.filter(row => {
               return fuzzySearch.isPhoneSimilar(query, row.phone_number, similarityThreshold) ||
                      fuzzySearch.isPhoneSimilar(query, row.finder_contact, similarityThreshold);
             });
             break;
           case 'imei':
             foundResults = foundResults.filter(row => {
               return fuzzySearch.isIMEISimilar(query, row.imei, similarityThreshold);
             });
             break;
           default:
             const foundSearchFields = ['phone_number', 'imei', 'email', 'brand', 'model', 'description', 'location_found', 'finder_name'];
             foundResults = fuzzySearch.multiFieldFuzzySearch(foundResults, query, foundSearchFields, similarityThreshold);
         }
       }

       // Apply phonetic matching to found phones if enabled
       if (usePhonetic && needsPhoneticProcessing && query) {
         const queryPhonetic = fuzzySearch.soundex(query);
         foundResults = foundResults.filter(row => {
           // Check phonetic similarity for text fields
           const fieldsToCheck = ['finder_name', 'brand', 'model', 'description', 'location_found'];
           return fieldsToCheck.some(field => {
             if (row[field]) {
               const words = row[field].split(/\s+/);
               return words.some(word => {
                 const wordPhonetic = fuzzySearch.soundex(word);
                 return wordPhonetic === queryPhonetic;
               });
             }
             return false;
           });
         });
       }

      // Combine results for pagination
       const combinedResults = [
         ...results.map(item => ({ ...item, source: 'lost_phones' })),
         ...foundResults.map(item => ({ ...item, source: 'found_phones' }))
       ];

       // Sort combined results by relevance/date
       combinedResults.sort((a, b) => {
         // Prioritize by distance if geospatial search is used
         if (useGeospatial && a.distance_km !== undefined && b.distance_km !== undefined) {
           return a.distance_km - b.distance_km;
         }
         // Otherwise sort by creation date (newest first)
         return new Date(b.created_at) - new Date(a.created_at);
       });

       // Cache results if enabled
       if (useCache) {
         const cacheData = {
           combined_results: combinedResults,
           search_info: {
             query,
             type,
             fuzzy_enabled: useFuzzy,
             phonetic_enabled: usePhonetic,
             geospatial_enabled: useGeospatial,
             threshold: similarityThreshold,
             radius_km: useGeospatial ? searchRadius : null,
             center_coordinates: useGeospatial ? { lat: parseFloat(lat), lon: parseFloat(lon) } : null,
             total_results: combinedResults.length,
             filter_summary: advancedFilters.generateFilterSummary(advancedFilterParams)
           }
         };
         queryOptimizer.cacheResults(optimizedParams, cacheData);
       }

       // Apply pagination
       const paginatedResults = queryOptimizer.paginateResults(combinedResults, validPage, validLimit);
       const metrics = queryOptimizer.createPerformanceMetrics(startTime, paginatedResults.data.length, false);

       // Track search analytics
       searchAnalytics.trackSearch({
         query: query || '',
         searchType: type || 'general',
         filters: advancedFilterParams,
         resultsCount: combinedResults.length,
         responseTime: metrics.response_time_ms,
         userIP: req.ip || req.connection.remoteAddress,
         userAgent: req.get('User-Agent'),
         cacheHit: false
       });

       res.json({
         ...paginatedResults,
         search_info: {
           query,
           type,
           fuzzy_enabled: useFuzzy,
           phonetic_enabled: usePhonetic,
           geospatial_enabled: useGeospatial,
           threshold: similarityThreshold,
           radius_km: useGeospatial ? searchRadius : null,
           center_coordinates: useGeospatial ? { lat: parseFloat(lat), lon: parseFloat(lon) } : null,
           total_results: combinedResults.length,
           performance: metrics,
           cache_hit: false,
           filter_summary: advancedFilters.generateFilterSummary(advancedFilterParams)
         }
       });
    });
  });
});

// Report a found phone
app.post('/api/found-phones', (req, res) => {
  const {
    phone_number, imei, email, brand, model, color,
    description, location_found, country, region_state, city,
    date_found, finder_name, finder_contact, latitude, longitude
  } = req.body;

  if (!finder_name || !finder_contact) {
    return res.status(400).json({ error: 'Finder name and contact are required' });
  }

  const sql = `
    INSERT INTO found_phones 
    (phone_number, imei, email, brand, model, color, description, 
     location_found, country, region_state, city, date_found, finder_name, finder_contact, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    phone_number, imei, email, brand, model, color,
    description, location_found, country || 'Philippines', region_state, city,
    date_found, finder_name, finder_contact, latitude, longitude
  ], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: 'Found phone reported successfully' });
  });
});

// Get found phones
app.get('/api/found-phones', (req, res) => {
  db.all('SELECT * FROM found_phones ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Update phone status
app.put('/api/lost-phones/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!['lost', 'found', 'returned'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  db.run(
    'UPDATE lost_phones SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Phone not found' });
        return;
      }
      res.json({ message: 'Status updated successfully' });
    }
  );
});

// Get available filter options for frontend
app.get('/api/filters/options', (req, res) => {
  // Get unique values for filter dropdowns
  const queries = {
    brands: 'SELECT DISTINCT brand FROM (SELECT brand FROM lost_phones UNION SELECT brand FROM found_phones) WHERE brand IS NOT NULL AND brand != "" ORDER BY brand',
    countries: 'SELECT DISTINCT country FROM (SELECT country FROM lost_phones UNION SELECT country FROM found_phones) WHERE country IS NOT NULL AND country != "" ORDER BY country',
    regions: 'SELECT DISTINCT region_state FROM (SELECT region_state FROM lost_phones UNION SELECT region_state FROM found_phones) WHERE region_state IS NOT NULL AND region_state != "" ORDER BY region_state',
    cities: 'SELECT DISTINCT city FROM (SELECT city FROM lost_phones UNION SELECT city FROM found_phones) WHERE city IS NOT NULL AND city != "" ORDER BY city',
    statuses: 'SELECT DISTINCT status FROM lost_phones WHERE status IS NOT NULL AND status != "" ORDER BY status'
  };

  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    db.all(query, (err, rows) => {
      if (err) {
        console.error(`Error fetching ${key}:`, err.message);
        results[key] = [];
      } else {
        results[key] = rows.map(row => Object.values(row)[0]);
      }
      
      completed++;
      if (completed === total) {
        // Add predefined options
        results.deviceTypes = ['Smartphone', 'Feature Phone', 'Tablet', 'Smartwatch', 'Other'];
        results.timeRanges = [
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'This Week' },
          { value: 'month', label: 'This Month' },
          { value: 'quarter', label: 'Last 3 Months' },
          { value: 'year', label: 'This Year' }
        ];
        
        res.json({
          success: true,
          options: results,
          generated_at: new Date().toISOString()
        });
      }
    });
  });
});

// Get search analytics
app.get('/api/analytics/search', (req, res) => {
  const { timeframe = '7d', limit = 100 } = req.query;
  
  try {
    const analytics = searchAnalytics.getAnalytics(timeframe, parseInt(limit));
    res.json({
      success: true,
      analytics,
      timeframe,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching search analytics:', error);
    res.status(500).json({ error: 'Failed to fetch search analytics' });
  }
});

// Get popular search terms
app.get('/api/analytics/popular-terms', (req, res) => {
  const { limit = 20 } = req.query;
  
  try {
    const popularTerms = searchAnalytics.getPopularSearchTerms(parseInt(limit));
    res.json({
      success: true,
      popular_terms: popularTerms,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching popular terms:', error);
    res.status(500).json({ error: 'Failed to fetch popular search terms' });
  }
});

// Get search performance metrics
app.get('/api/analytics/performance', (req, res) => {
  const { timeframe = '24h' } = req.query;
  
  try {
    const performance = searchAnalytics.getPerformanceMetrics(timeframe);
    res.json({
      success: true,
      performance,
      timeframe,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ error: 'Failed to fetch performance metrics' });
  }
});

// Get filter analytics
app.get('/api/filters/analytics', (req, res) => {
  const analyticsQueries = {
    totalLost: 'SELECT COUNT(*) as count FROM lost_phones',
    totalFound: 'SELECT COUNT(*) as count FROM found_phones',
    statusBreakdown: 'SELECT status, COUNT(*) as count FROM lost_phones GROUP BY status',
    brandBreakdown: 'SELECT brand, COUNT(*) as count FROM (SELECT brand FROM lost_phones UNION ALL SELECT brand FROM found_phones) WHERE brand IS NOT NULL AND brand != "" GROUP BY brand ORDER BY count DESC LIMIT 10',
    locationBreakdown: 'SELECT country, COUNT(*) as count FROM (SELECT country FROM lost_phones UNION ALL SELECT country FROM found_phones) WHERE country IS NOT NULL AND country != "" GROUP BY country ORDER BY count DESC LIMIT 10',
    recentActivity: 'SELECT DATE(created_at) as date, COUNT(*) as count FROM (SELECT created_at FROM lost_phones UNION ALL SELECT created_at FROM found_phones) WHERE created_at >= date("now", "-30 days") GROUP BY DATE(created_at) ORDER BY date DESC'
  };

  const analytics = {};
  let completed = 0;
  const total = Object.keys(analyticsQueries).length;

  Object.entries(analyticsQueries).forEach(([key, query]) => {
    db.all(query, (err, rows) => {
      if (err) {
        console.error(`Error fetching analytics ${key}:`, err.message);
        analytics[key] = [];
      } else {
        analytics[key] = rows;
      }
      
      completed++;
      if (completed === total) {
        res.json({
          success: true,
          analytics,
          generated_at: new Date().toISOString()
        });
      }
    });
  });
});

// Debug endpoint to check database contents
app.get('/api/debug/database', (req, res) => {
  const queries = {
    lost_phones_count: 'SELECT COUNT(*) as count FROM lost_phones',
    found_phones_count: 'SELECT COUNT(*) as count FROM found_phones',
    users_count: 'SELECT COUNT(*) as count FROM users',
    recent_lost_phones: 'SELECT * FROM lost_phones ORDER BY created_at DESC LIMIT 10',
    recent_found_phones: 'SELECT * FROM found_phones ORDER BY created_at DESC LIMIT 10'
  };

  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    db.all(query, (err, rows) => {
      if (err) {
        console.error(`Error in debug query ${key}:`, err.message);
        results[key] = { error: err.message };
      } else {
        results[key] = rows;
      }
      
      completed++;
      if (completed === total) {
        res.json({
          success: true,
          debug_info: results,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});

module.exports = app;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to the database
const dbPath = path.join(__dirname, 'phones.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  } else {
    console.log('Connected to SQLite database for sample data insertion.');
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
  `, (err) => {
    if (err) {
      console.error('Error creating lost_phones table:', err);
    } else {
      console.log('Lost phones table ready.');
      insertSampleData();
    }
  });
}

// Sample data for testing real-world tracking
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
        phone_number: '+44 20 7946 0958',
        imei: '987654321098765',
        brand: 'Samsung',
        model: 'Galaxy S23 Ultra',
        color: 'Phantom Black',
        email: 'sarah.smith@example.com',
        contact_name: 'Sarah Smith',
        location_lost: 'Tower Bridge, London',
        city: 'London',
        region_state: 'England',
        country: 'United Kingdom',
        date_lost: '2024-01-20',
        latitude: 51.5055,
        longitude: -0.0754,
        description: 'Dropped while taking photos at Tower Bridge'
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
    },
    {
        phone_number: '+1 415 555 0123',
        imei: '789123456789123',
        brand: 'OnePlus',
        model: '11 Pro',
        color: 'Titan Black',
        email: 'alex.chen@example.com',
        contact_name: 'Alex Chen',
        location_lost: 'Golden Gate Bridge, San Francisco',
        city: 'San Francisco',
        region_state: 'CA',
        country: 'United States',
        date_lost: '2024-01-30',
        latitude: 37.8199,
        longitude: -122.4783,
        description: 'Fell out of pocket while cycling across the bridge'
    },
    {
        phone_number: '+49 30 12345678',
        imei: '321654987321654',
        brand: 'Xiaomi',
        model: '13 Pro',
        color: 'Ceramic White',
        email: 'hans.mueller@example.com',
        contact_name: 'Hans Mueller',
        location_lost: 'Brandenburg Gate, Berlin',
        city: 'Berlin',
        region_state: 'Berlin',
        country: 'Germany',
        date_lost: '2024-02-01',
        latitude: 52.5163,
        longitude: 13.3777,
        description: 'Lost during tourist visit to Brandenburg Gate'
    }
];

// Function to insert sample data
function insertSampleData() {
    console.log('Inserting sample phone data...');
    
    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO lost_phones (
            phone_number, imei, brand, model, color, email, contact_name,
            location_lost, city, region_state, country, date_lost,
            latitude, longitude, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    samplePhones.forEach((phone, index) => {
        insertStmt.run([
            phone.phone_number,
            phone.imei,
            phone.brand,
            phone.model,
            phone.color,
            phone.email,
            phone.contact_name,
            phone.location_lost,
            phone.city,
            phone.region_state,
            phone.country,
            phone.date_lost,
            phone.latitude,
            phone.longitude,
            phone.description
        ], function(err) {
            if (err) {
                console.error(`Error inserting phone ${index + 1}:`, err);
            } else {
                console.log(`✓ Inserted phone ${index + 1}: ${phone.brand} ${phone.model} (${phone.email})`);
            }
        });
    });
    
    insertStmt.finalize(() => {
        // Close the database connection after all insertions
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
                process.exit(1);
            } else {
                console.log('\n✅ Sample data insertion completed!');
                console.log('\n📱 Test Tracking with these credentials:');
                console.log('\n1. Email: john.doe@example.com');
                console.log('   Phone: +1 555 123 4567 or 5551234567');
                console.log('   IMEI: 123456789012345');
                console.log('\n2. Email: sarah.smith@example.com');
                console.log('   Phone: +44 20 7946 0958');
                console.log('   IMEI: 987654321098765');
                console.log('\n3. Email: maria.garcia@example.com');
                console.log('   Phone: +63 917 888 9999');
                console.log('   IMEI: 456789123456789');
                console.log('\n4. Email: alex.chen@example.com');
                console.log('   Phone: +1 415 555 0123');
                console.log('   IMEI: 789123456789123');
                console.log('\n5. Email: hans.mueller@example.com');
                console.log('   Phone: +49 30 12345678');
                console.log('   IMEI: 321654987321654');
                console.log('\nNow you can test real-world tracking functionality!');
                process.exit(0);
            }
        });
    });
}